/* AUGUR configuration model. Pure functions; no storage, DOM or network access. */
(function (root) {
  'use strict';
  const FORMAT = 1;
  const SCENARIOS = {
    upgrade: { label: 'Database upgrade', detail: 'Upgrade a CDB or a non-CDB in an existing Oracle home.', operation: 'upgrade' },
    noncdb: { label: 'Non-CDB → PDB', detail: 'Upgrade and convert a non-CDB into a target CDB.', operation: 'upgrade' },
    unplug: { label: 'Unplug / plug PDBs', detail: 'Move selected PDBs to a different CDB.', operation: 'upgrade' },
    refreshable: { label: 'Refreshable PDBs', detail: 'Prepare PDB migration over database links.', operation: 'upgrade' },
    patch: { label: 'Database patching', detail: 'Prepare patches, create a home or patch a database.', operation: 'patch' }
  };
  const MODES = { upgrade: ['analyze', 'deploy', 'fixups', 'upgrade', 'postfixups'], patch: ['analyze', 'deploy', 'fixups', 'download', 'create_home'] };
  const DETAILS = {
    global_log_dir: ['Global log directory', 'Use a separate log directory for each independent AutoUpgrade run.'],
    autoupg_log_dir: ['Legacy global log directory', 'Older spelling. Prefer global.global_log_dir in new configurations.'],
    keystore: ['AutoUpgrade keystore', 'Directory used by AutoUpgrade for its keystore. Load passwords with AutoUpgrade on the database server.'],
    sid: ['Source SID', 'The source CDB or non-CDB instance SID. This is not a service name.'],
    source_home: ['Source Oracle home', 'Absolute path on the database server. It is not checked on this computer.'],
    target_home: ['Target Oracle home', 'Absolute path to the target Oracle home. Analyze/fixups may use target_version without this home.'],
    target_version: ['Target database release', 'An explicit release is useful when the target home is not installed. Database compatibility still needs analyze.'],
    target_base: ['Target Oracle base', 'May be derived by AutoUpgrade from the target home.'],
    source_base: ['Source Oracle base', 'May be derived by AutoUpgrade from the source home.'],
    log_dir: ['Database log directory', 'Optional log location for this database.'],
    target_cdb: ['Target CDB SID', 'Existing CDB that receives the converted database or selected PDBs.'],
    pdbs: ['Source PDBs', 'Comma-separated source PDB names. Add per-PDB settings for migrations involving multiple PDBs.'],
    target_pdb_name: ['Target PDB name', 'Rename this source PDB during migration.'],
    target_pdb_copy_option: ['Data file copy clause', "Use a valid file_name_convert clause, for example file_name_convert=('/old/','/new/'). ASM/OMF: file_name_convert=none."],
    keep_source_pdb: ['Keep source PDB', 'For unplug/plug, keeping the source requires COPY. This setting alone does not preserve the source.'],
    source_dblink: ['Source database link', 'For refreshable migration, enter the link and refresh interval in seconds, for example CLONE_SALES 600.'],
    restoration: ['Create a restore point', 'Requests a guaranteed restore point. Edition and migration type can change the effective behavior; this is not a backup guarantee.'],
    drop_grp_after_upgrade: ['Drop GRP after upgrade', 'YES removes the AutoUpgrade restore point after successful upgrade. Required when raising COMPATIBLE.'],
    raise_compatible: ['Raise COMPATIBLE', 'NO keeps the current value. YES uses the target default. A specific supported release level is also accepted. Raising it restricts the ability to return to the previous release.'],
    timezone_upg: ['Upgrade time zone files', 'When omitted, AutoUpgrade derives the value from the operation. In the inspected upgrade path: YES for upgrade, NO for RU patching.'],
    dictionary_stats_before: ['Dictionary statistics before', 'Gather dictionary statistics before the operation.'],
    dictionary_stats_after: ['Dictionary statistics after', 'Gather dictionary statistics after the operation.'],
    fixed_stats_before: ['Fixed object statistics before', 'Gather fixed object statistics before the operation.'],
    run_utlrp: ['Recompile invalid objects', 'Enable the post-operation recompilation check.'],
    run_dictionary_health: ['Dictionary health check', 'Choose FULL or CRITICAL when explicitly configuring this check.'],
    start_time: ['Start time', 'NOW, dd/MM/yyyy HH:mm:ss, or a relative delay such as +1h30m. Interpreted on the AutoUpgrade host.'],
    upgrade_node: ['Upgrade node', 'Node that performs this database upgrade.'],
    patch_node: ['Patch node', 'Node that performs the patch operation.'],
    download_folder: ['Patch download directory', 'Directory containing or receiving patch media. Required in patch mode unless folder is used.'],
    folder: ['Legacy patch directory', 'Older patch media directory spelling. Prefer download_folder.'],
    patch: ['Patch selection', 'Oracle patch expression, for example RECOMMENDED. Availability of patches is verified by AutoUpgrade.'],
    download: ['Download patches', 'YES allows AutoUpgrade to obtain patch media. NO uses locally available media.'],
    method: ['Patching method', 'This build accepts OUTOFPLACE for this parameter.'],
    db_availability: ['Database availability', 'This build accepts OFFLINE for this parameter. This does not describe every aspect of RAC rolling patching.'],
    before_action: ['Before action', 'Script path, optionally followed by Y to make failure critical. Global and local actions are separate.'],
    after_action: ['After action', 'Script path, optionally followed by Y to make failure critical. Global and local actions are separate.'],
    del_after_upgrade_pfile: ['Remove parameters after upgrade', 'Path to a PFILE containing parameters to remove. Global and local changes are separate.'],
    add_after_upgrade_pfile: ['Add parameters after upgrade', 'Path to a PFILE containing parameters to add. Global and local changes are separate.'],
    rac_rolling: ['RAC rolling option', 'Advanced topology-dependent setting. Requires verification against the actual cluster and operation.'],
    defer_standby_log_shipping: ['Defer standby log shipping', 'Controls redo transport; plan its restoration and consider other redo consumers.'],
    stop_redo_apply: ['Stop redo apply', 'Advanced Data Guard setting; verify against the actual standby topology.'],
    manage_network_files: ['Network file handling', 'FULL, SKIP or IGNORE_READ_ONLY. Controls handling of network files in the target home.'],
    replay: ['Replay upgrade', 'The inspected validator requires a target release of 21 or later when enabled.'],
    parallel_stats_degree: ['Statistics parallel degree', 'Non-negative integer; requires dictionary_stats_before=YES.'],
    catctl_options: ['Upgrade parallelism / catctl', 'Arguments passed to catctl, for example -n 8 -N 2. Select values appropriate to the database host.'],
    export_rman_backup_for_noncdb_to_pdb: ['Carry RMAN backup metadata', 'Relevant to non-CDB to PDB conversion. The inspected JAR declaration defaults to YES.']
  };
  const ENUMS = { method: ['OUTOFPLACE'], db_availability: ['OFFLINE'], run_dictionary_health: ['FULL', 'CRITICAL'], manage_network_files: ['FULL', 'SKIP', 'IGNORE_READ_ONLY'] };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const unsafeKey = key => ['__proto__', 'prototype', 'constructor'].includes(key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const pairs = map => Object.entries(map || {});
  function newProject(profileId) {
    return { format: FORMAT, profileId, operation: 'upgrade', mode: 'analyze', title: 'My upgrade', jarPath: 'autoupgrade.jar', fileName: 'autoupgrade.cfg', globals: {}, jobs: [{ prefix: 'upg1', scenario: 'upgrade', values: {}, pdb: {} }], original: '', records: [] };
  }
  function definition(profile, operation, name) {
    const canonical = name === 'run_hcheck' ? 'run_dictionary_health' : name;
    return profile.operations[operation].find(p => p.name === canonical) || null;
  }
  function describe(param) {
    const detail = DETAILS[param.name] || [param.name.replaceAll('_', ' '), 'Advanced parameter from the inspected JAR registry. Check Oracle documentation and run analyze for environment-dependent behavior.'];
    return { ...param, label: detail[0], help: detail[1], options: ENUMS[param.name] || (param.type === 'boolean' ? ['YES', 'NO'] : null) };
  }
  function effective(project, job, name, profile) {
    if (own(job.values, name)) return { value: job.values[name], source: 'Local setting' };
    const def = definition(profile, project.operation, name);
    if (def?.inherit && def.scope === 'both' && own(project.globals, name)) return { value: project.globals[name], source: 'Global setting' };
    return { value: def?.default ?? null, source: def?.default == null ? 'Not explicitly set' : 'JAR declaration' };
  }
  function entries(project) {
    const result = pairs(project.globals).map(([key, value]) => ['global.' + key, value]);
    for (const job of project.jobs) {
      for (const [key, value] of pairs(job.values)) result.push([job.prefix + '.' + key, value]);
      for (const [pdb, values] of pairs(job.pdb)) for (const [key, value] of pairs(values)) result.push([`${job.prefix}.${key}.${pdb}`, value]);
    }
    return result;
  }
  function parseConfig(text, profile, operation = 'upgrade') {
    if (typeof text !== 'string' || text.length > 1000000) throw new Error('Choose a UTF-8 configuration smaller than 1 MB.');
    const project = newProject(profile.id); project.operation = operation; project.mode = 'analyze'; project.jobs = []; project.globals = {}; project.original = text; project.records = [];
    const jobs = new Map(); const seen = new Set(); const diagnostics = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    // A trailing newline belongs to the previous line, not a new blank record.
    if (lines.at(-1) === '') lines.pop();
    lines.forEach((raw, index) => {
      if (!raw.trim() || raw.trim().startsWith('#')) { project.records.push({ raw }); return; }
      const match = raw.match(/^\s*([\w]+)\s*\.\s*([\w.\-]+)\s*=\s*(.*?)\s*$/);
      if (!match) { project.records.push({ raw, invalid: true }); diagnostics.push({ level: 'error', text: `Line ${index + 1}: unsupported assignment. Edit or remove this line in the source file.` }); return; }
      const prefix = match[1].toLowerCase(); const name = match[2].toLowerCase(); const key = prefix + '.' + name;
      if ([prefix,...name.split('.')].some(unsafeKey)) { project.records.push({raw,invalid:true}); diagnostics.push({level:'error',text:`Line ${index + 1}: unsupported key.`}); return; }
      const hash = match[3].indexOf('#'); const value = (hash < 0 ? match[3] : match[3].slice(0, hash)).trim();
      if (seen.has(key)) { diagnostics.push({ level: 'error', text: `Line ${index + 1}: duplicate key ${key}. Resolve duplicates in the source before exporting.` }); project.records.push({ raw, duplicate: true, key }); return; }
      seen.add(key); project.records.push({ raw, key, value, comment: hash < 0 ? '' : match[3].slice(hash) });
      if (prefix === 'global') project.globals[name] = value;
      else {
        if (!jobs.has(prefix)) { const job = { prefix, scenario: operation === 'patch' ? 'patch' : 'upgrade', values: {}, pdb: {} }; jobs.set(prefix, job); project.jobs.push(job); }
        const job = jobs.get(prefix); const dot = name.lastIndexOf('.'); const base = dot < 0 ? '' : name.slice(0, dot);
        if (dot > 0 && definition(profile, operation, base)?.nested) {
          const pdb = name.slice(dot + 1); if (!own(job.pdb, pdb)) job.pdb[pdb] = {}; job.pdb[pdb][base] = value;
        } else job.values[name] = value;
      }
    });
    for (const job of project.jobs) {
      if (operation === 'upgrade' && job.values.target_cdb) job.scenario = job.values.pdbs ? (pairs(job.pdb).some(([, v]) => v.source_dblink) || job.values.source_dblink ? 'refreshable' : 'unplug') : 'noncdb';
    }
    if (!project.jobs.length) diagnostics.push({ level: 'error', text: 'No database entries were found.' });
    return { project, diagnostics };
  }
  function renderConfig(project) {
    const values = new Map(entries(project)); const emitted = new Set(); const out = [];
    for (const record of project.records || []) {
      if (!record.key || record.invalid || record.duplicate) { out.push(record.raw); continue; }
      if (!values.has(record.key)) continue;
      const value = values.get(record.key); emitted.add(record.key);
      out.push(value === record.value ? record.raw : record.key + '=' + value + (record.comment ? ' ' + record.comment : ''));
    }
    if (!project.records?.length) out.push('# Generated with AUGUR', '# AutoUpgrade profile: ' + project.profileId, '# Run AutoUpgrade analyze on the database server before deployment.', '');
    for (const [key, value] of values) {
      if (emitted.has(key)) continue;
      if (out.length && key.startsWith('global.') !== out.at(-1).startsWith('global.') && !key.startsWith('global.')) out.push('');
      out.push(key + '=' + value);
    }
    return out.join('\n').replace(/\n*$/, '\n');
  }
  const list = text => (text || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const yes = value => String(value || '').toUpperCase() === 'YES';
  function validate(project, profile) {
    const issues = []; const add = (level, code, text, key = '') => issues.push({ level, code, text, key });
    if (!profile || project.profileId !== profile.id) { add('error', 'profile', 'The selected profile is unavailable.'); return issues; }
    if (!MODES[project.operation]?.includes(project.mode)) add('error', 'mode', 'Select a supported AutoUpgrade mode.');
    if (!project.jobs.length) add('error', 'jobs', 'Add at least one database.');
    const duplicates = new Set();
    for (const r of project.records || []) {
      if (r.invalid) add('error', 'import-line', 'An imported line cannot be interpreted. Repair it in the source file and import again.');
      if (r.duplicate) add('error', 'duplicate', 'Duplicate imported key: ' + r.key, r.key);
    }
    for (const [key, raw] of entries(project)) {
      const value = String(raw); const split = key.indexOf('.'); const prefix = key.slice(0, split); const rest = key.slice(split + 1);
      if (!/^\w+\.[\w.-]+$/.test(key) || key.toLowerCase().split('.').some(unsafeKey)) add('error','key','Unsupported configuration key: '+key,key);
      let param = definition(profile, project.operation, rest);
      if (!param) { const dot = rest.lastIndexOf('.'); const candidate = definition(profile, project.operation, rest.slice(0, dot)); if (dot > 0 && candidate?.nested) param = candidate; }
      if (duplicates.has(key.toLowerCase())) add('error', 'duplicate', 'Duplicate key: ' + key, key); duplicates.add(key.toLowerCase());
      if (!value || !/^[\x20-\x7E]+$/.test(value) || /[\r\n#";<>`{}\[\]!&|?]/.test(value)) add('error', 'syntax', key + ': empty, non-ASCII or unsupported characters. AutoUpgrade may reject or skip the line.', key);
      if (value.trim() !== value) add('error', 'whitespace', key + ': remove leading or trailing whitespace.', key);
      if (value.includes('$') && !/^[\w$]+$/.test(value)) add('warning', 'environment', key + ': variables are not expanded by the file parser. Prefer an explicit path.', key);
      if (!param) {
        const other = definition(profile, project.operation === 'upgrade' ? 'patch' : 'upgrade', rest);
        add(other ? 'error' : 'warning', other ? 'operation' : 'unknown', key + (other ? ': belongs to the other AutoUpgrade operation. Remove it or change the operation.' : ': unrecognized parameter preserved; its meaning is not validated.'), key); continue;
      }
      if (param.status !== 'available') add('error', 'unsupported', key + ': ' + (param.status === 'unsupported' ? 'rejected by this build’s patch validator.' : 'declared but absent from this operation’s registry; support is unverified.'), key);
      if (prefix === 'global' && param.scope === 'local') add('error', 'scope', key + ': this parameter is local only.', key);
      if (prefix !== 'global' && param.scope === 'global') add('error', 'scope', key + ': this parameter is global only.', key);
      const options = describe(param).options;
      if (options && !options.includes(value.toUpperCase())) add('error', 'value', key + ': expected ' + options.join(' or ') + '.', key);
      if (param.name === 'raise_compatible' && !/^(YES|NO|\d+(\.\d+)*)$/i.test(value)) add('error', 'compatible-value', key + ': use YES, NO or a version number.', key);
      if (param.name === 'target_version' && !/^\d+(\.\d+)*$/.test(value)) add('error','target-version',key+': use a numeric release such as 19 or 23.4.',key);
      if (param.name === 'target_pdb_copy_option' && !/^file_name_convert\s*=\s*(none|\(\s*'[^']+'\s*,\s*'[^']+'\s*(,\s*'[^']+'\s*,\s*'[^']+'\s*)*\))$/i.test(value)) add('error','copy-clause',key+': use file_name_convert=none or a list of quoted source/destination pairs. Other clauses require manual review.',key);
      if (param.name === 'start_time' && !validStartTime(value)) add('error', 'start', key + ': use NOW, a valid +1h30m delay or dd/MM/yyyy HH:mm:ss.', key);
      if ((param.name.endsWith('_home') || param.name.endsWith('_dir') || ['keystore', 'download_folder', 'folder', 'source_base', 'target_base'].includes(param.name)) && !/^(\/|[A-Za-z]:[\\/]|global\.)/.test(value)) add('error', 'path', key + ': enter an absolute server path.', key);
    }
    if (project.globals.global_log_dir && project.globals.autoupg_log_dir) add('error', 'logs', 'Use one global log directory spelling; both are currently set.');
    if (!project.globals.global_log_dir && !project.globals.autoupg_log_dir) add('warning', 'logs', 'Set a dedicated global log directory to make the run location explicit.');
    const prefixes = new Set(); const targets = new Set();
    for (const job of project.jobs) {
      const prefix = job.prefix; const get = name => effective(project, job, name, profile).value;
      if (!/^\w+$/.test(prefix) || unsafeKey(prefix.toLowerCase()) || prefix.toLowerCase() === 'global' || prefixes.has(prefix.toLowerCase())) add('error', 'prefix', 'Database prefixes must be unique letters, digits or underscores, and cannot be global.'); prefixes.add(prefix.toLowerCase());
      if (SCENARIOS[job.scenario]?.operation !== project.operation) add('error', 'scenario', prefix + ': choose a scenario for the current operation.');
      const required = name => { if (!get(name)) add('error', 'required', prefix + ': ' + name + ' is required for ' + project.mode + '.', prefix + '.' + name); };
      required('sid');
      if (!['upgrade', 'postfixups', 'download', 'create_home'].includes(project.mode)) required('source_home');
      if (!['analyze', 'fixups', 'download'].includes(project.mode) || (project.operation === 'upgrade' && !get('target_version'))) required('target_home');
      if (get('sid') && !/^[A-Za-z][A-Za-z0-9_$#]*$/.test(get('sid'))) add('error', 'sid', prefix + ': enter an unquoted Oracle SID.', prefix + '.sid');
      if (get('source_home') && get('source_home') === get('target_home')) add('warning', 'same-home', prefix + ': source and target homes are identical. Verify the intended operation.');
      if (project.operation === 'patch') {
        if (!get('download_folder') && !get('folder')) required('download_folder');
        if (get('download_folder') && get('folder')) add('warning', 'folders', prefix + ': both folder spellings are set. Prefer a single download_folder.');
      }
      if (project.operation === 'upgrade') {
        if(job.scenario==='upgrade' && (get('target_cdb') || Object.keys(job.pdb).length)) add('error','scenario-settings',prefix+': migration settings remain in a database-upgrade plan. Select a migration scenario or remove those settings.');
        if(job.scenario==='noncdb' && get('pdbs')) add('error','scenario-settings',prefix+': the non-CDB conversion plan contains a source PDB list. Select a PDB scenario or remove the list.');
        if (get('target_version') && !profile.targetVersions.includes(String(get('target_version')).split('.').slice(0,String(get('target_version')).startsWith('12.')?2:1).join('.'))) add('error', 'target-version', prefix + ': target release is outside this profile’s declared releases.');
        if (get('raise_compatible') && String(get('raise_compatible')).toUpperCase() !== 'NO') {
          if (!yes(get('drop_grp_after_upgrade'))) add('error', 'grp', prefix + ': raising COMPATIBLE requires drop_grp_after_upgrade=YES.', prefix + '.drop_grp_after_upgrade');
          add('warning', 'raise', prefix + ': raising COMPATIBLE restricts return to the previous release. Review the recovery plan.');
          const raised=String(get('raise_compatible')), target=String(get('target_version')||'');
          if (/^\d/.test(raised) && target) {
            const a=raised.split('.').map(Number),b=target.split('.').map(Number);
            if(a[0]!==b[0] || (b.length>1 && a.some((v,i)=>v>(b[i]||0) && a.slice(0,i).every((n,j)=>n===(b[j]||0))))) add('error','compatible-release',prefix + ': COMPATIBLE must match the target major release and cannot exceed a specified target RU.');
          }
        }
        if (yes(get('replay')) && get('target_version') && Number(get('target_version')) < 21) add('error', 'replay', prefix + ': Replay requires target release 21 or later.');
        if (['noncdb', 'unplug', 'refreshable'].includes(job.scenario)) {
          required('target_cdb');
          add('warning', 'migration', prefix + ': PDB migration and recovery behavior require validation in the actual source and target databases.');
          if (get('target_cdb') && String(get('target_cdb')).toLowerCase() === String(get('sid')).toLowerCase()) add('error', 'same-cdb', prefix + ': source SID and target CDB are identical. Remote relocate cases require expert review.');
        }
        if(job.scenario==='noncdb' && get('target_cdb')) {
          const target=String(get('target_cdb')).toLowerCase()+'/'+String(get('target_pdb_name')||get('sid')||'').toLowerCase();
          if(targets.has(target))add('error','target-collision','Multiple databases use target '+target+'.');targets.add(target);
        }
        if (['unplug', 'refreshable'].includes(job.scenario)) {
          required('pdbs'); const pdbs = list(get('pdbs'));
          if (new Set(pdbs).size !== pdbs.length) add('error', 'duplicate-pdb', prefix + ': duplicate PDB in the selection.');
          if (pdbs.includes('pdb$seed') || pdbs.includes('cdb$root')) add('error', 'system-pdb', prefix + ': select user PDBs for migration.');
          for (const name of pdbs) {
            if (!/^[a-z][a-z0-9_$]*$/i.test(name) || unsafeKey(name)) { add('error','pdb-name',prefix + ': invalid PDB name ' + name + '.');continue; }
            const p = job.pdb[name] || {};
            if (job.scenario === 'refreshable' && !p.source_dblink && !(pdbs.length === 1 && get('source_dblink'))) add('error', 'dblink', prefix + ': add a source DB link for ' + name + '.', prefix + '.source_dblink.' + name);
            const link=p.source_dblink || (pdbs.length===1?get('source_dblink'):null);
            if(job.scenario==='refreshable' && link && !/^[A-Za-z][\w.$]*\s+[1-9]\d*$/.test(link))add('error','refresh-interval',prefix+': use a database link and positive refresh interval in seconds for '+name+'.');
            if (yes(p.keep_source_pdb) && job.scenario === 'unplug' && !/^file_name_convert\s*=/i.test(p.target_pdb_copy_option||'')) add('error', 'copy', prefix + ': preserving ' + name + ' requires a copy clause.');
            const target = String(get('target_cdb') || '').toLowerCase() + '/' + (p.target_pdb_name || name).toLowerCase();
            if (targets.has(target)) add('error', 'target-collision', 'Multiple PDBs use target ' + target + '.'); targets.add(target);
          }
          for (const name of Object.keys(job.pdb)) if (!pdbs.includes(name)) add('error', 'orphan-pdb', prefix + ': settings for ' + name + ' are outside the selected PDB list.');
          if (pdbs.length > 1) for (const name of Object.keys(job.values)) if (definition(profile, 'upgrade', name)?.nested) add('error', 'nested', prefix + '.' + name + ': use a per-PDB value when migrating multiple PDBs.');
        }
      }
      if (get('parallel_stats_degree') != null) {
        if (!/^\d+$/.test(get('parallel_stats_degree'))) add('error', 'degree', prefix + ': statistics degree must be a non-negative integer.');
        if (!yes(get('dictionary_stats_before'))) add('error', 'stats', prefix + ': parallel_stats_degree requires dictionary_stats_before=YES.');
      }
    }
    if (project.operation === 'upgrade') for (const job of project.jobs) if (job.values.target_cdb && project.jobs.some(other => other.scenario === 'upgrade' && String(other.values.sid || '').toLowerCase() === job.values.target_cdb.toLowerCase())) add('error', 'target-upgrade', job.prefix + ': the target CDB is also scheduled for upgrade in this file.');
    if (!/^[A-Za-z0-9_.-]+$/.test(project.fileName || '') || !project.fileName.endsWith('.cfg')) add('error', 'filename', 'Choose a simple filename ending in .cfg.');
    if (!project.jarPath || /[\r\n\0]/.test(project.jarPath)) add('error', 'jar-path', 'Enter the AutoUpgrade JAR path.');
    return issues;
  }
  function validStartTime(value) {
    if(/^NOW$/i.test(value))return true;
    const delay=value.match(/^\+(\d+)([hm])(?:(\d+)([hm]))?$/i);
    if(delay)return !delay[4]||delay[2].toLowerCase()!==delay[4].toLowerCase();
    const date=value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if(!date)return false;
    const [,d,m,y,h,n,s]=date.map(Number);const dt=new Date(Date.UTC(y,m-1,d,h,n,s));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d&&h<24&&n<60&&s<60;
  }
  function quote(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
  function command(project, mode = 'analyze') {
    return 'java -jar ' + quote(project.jarPath) + (project.operation === 'patch' ? ' -patch' : '') + ' -config ' + quote(project.fileName) + ' -mode ' + mode;
  }
  function diff(original, current) {
    const before = original.replace(/\r\n/g, '\n').trimEnd().split('\n'); const after = current.trimEnd().split('\n');
    // Bounded ordered line diff. Configurations are small; avoid quadratic storage.
    let a = 0, b = 0; const result = [];
    while (a < before.length || b < after.length) {
      if (before[a] === after[b]) { result.push('  ' + before[a]); a++; b++; continue; }
      const nextB = b < after.length ? before.indexOf(after[b], a) : -1;
      const nextA = a < before.length ? after.indexOf(before[a], b) : -1;
      if (a < before.length && (nextA < 0 || (nextB >= 0 && nextB - a <= nextA - b))) result.push('- ' + before[a++]);
      else if (b < after.length) result.push('+ ' + after[b++]);
      else result.push('- ' + before[a++]);
    }
    return result.join('\n');
  }
  function loadProject(text, profiles) {
    if (text.length > 1000000) throw new Error('Project exceeds 1 MB.');
    const p = JSON.parse(text);
    if (!p || p.format !== FORMAT || !profiles[p.profileId] || !MODES[p.operation]?.includes(p.mode) || !Array.isArray(p.jobs) || p.jobs.length > 100) throw new Error('Unsupported or malformed AUGUR project.');
    const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
    const checkMap = map => { if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Invalid settings map.'); for (const [k,v] of pairs(map)) if (dangerous.has(k) || typeof v !== 'string') throw new Error('Invalid setting in project.'); };
    checkMap(p.globals);
    for (const j of p.jobs) { if (typeof j.prefix !== 'string' || !SCENARIOS[j.scenario]) throw new Error('Invalid database entry.'); checkMap(j.values); if (!j.pdb || typeof j.pdb !== 'object' || Array.isArray(j.pdb)) throw new Error('Invalid PDB settings.'); for (const [k,v] of pairs(j.pdb)) { if (dangerous.has(k)) throw new Error('Invalid PDB name.'); checkMap(v); } }
    if (!Array.isArray(p.records) || p.records.some(r => !r || typeof r.raw !== 'string' || (r.key != null && typeof r.key !== 'string') || (r.value != null && typeof r.value !== 'string') || (r.comment != null && typeof r.comment !== 'string'))) throw new Error('Invalid imported document records.');
    for (const field of ['title','jarPath','fileName','original']) if (typeof p[field] !== 'string') throw new Error('Missing project field: ' + field);
    // Reconstruct preservation records from original text. Do not trust serialized raw lines.
    p.records=p.original?parseConfig(p.original,profiles[p.profileId],p.operation).project.records:[];
    return p;
  }
  const api = { FORMAT, SCENARIOS, MODES, newProject, definition, describe, effective, entries, parseConfig, renderConfig, validate, command, diff, loadProject, clone, list };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Augur = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
