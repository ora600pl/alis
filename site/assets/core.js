/* AUGUR configuration model. Pure functions; no storage, DOM or network access. */
(function (root) {
  'use strict';
  const FORMAT = 1;
  const SCENARIOS = {
    install: {label:'Install a fresh Oracle Home',detail:'Start on an empty server. No source home or database required.',operation:'patch',mode:'create_home',group:'Prepare software'},
    prepare_home: {label:'Prepare a home from existing settings',detail:'Use a source home to inherit edition, groups and binary options.',operation:'patch',mode:'create_home',group:'Prepare software'},
    download: {label:'Download patches and tools',detail:'Stage database patches, GI patch numbers or utilities, also for other platforms.',operation:'patch',mode:'download',group:'Prepare software'},
    gold_create: {label:'Build your own Gold Image',detail:'Install a patched home and package it for reuse on other servers.',operation:'patch',mode:'create_home',group:'Prepare software'},
    gold_use: {label:'Install from your Gold Image',detail:'Deploy a named local ZIP with PATCH=GOLDIMAGE, without applying additional patches.',operation:'patch',mode:'create_home',group:'Prepare software'},
    upgrade: {label:'Upgrade a database',detail:'Upgrade an entire CDB or non-CDB; optionally create the target home.',operation:'upgrade',group:'Upgrade and migrate'},
    pdb_upgrade: {label:'Upgrade selected PDBs in place',detail:'Upgrade PDBs already plugged into a target-version CDB.',operation:'upgrade',mode:'upgrade',group:'Upgrade and migrate'},
    noncdb: {label:'Non-CDB to PDB',detail:'Direct conversion into a target CDB, with or without a release change.',operation:'upgrade',group:'Upgrade and migrate'},
    unplug: {label:'Unplug / plug PDBs',detail:'Move selected PDBs using local files or copy clauses.',operation:'upgrade',group:'Upgrade and migrate'},
    refreshable: {label:'Clone or refresh PDBs over a link',detail:'Copy once or keep refreshing until the planned cutover.',operation:'upgrade',group:'Upgrade and migrate'},
    refreshable_noncdb: {label:'Clone or refresh a non-CDB',detail:'Copy a non-CDB over a database link and convert it on the target.',operation:'upgrade',group:'Upgrade and migrate'},
    patch: {label:'Patch existing databases',detail:'Out-of-place patching, with RAC and Data Guard planning options.',operation:'patch',group:'Patch databases'}
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
    const detail = (param.help ? [param.label, param.help] : DETAILS[param.name]) || [param.name.replaceAll('_', ' '), 'Advanced parameter from the inspected JAR registry. Check Oracle documentation and run analyze for environment-dependent behavior.'];
    return { ...param, label: detail[0], help: detail[1], options: param.options || ENUMS[param.name] || (param.type === 'boolean' ? ['YES', 'NO'] : null) };
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
      if (operation === 'upgrade' && job.values.target_cdb) job.scenario = job.values.pdbs ? (pairs(job.pdb).some(([, v]) => v.source_dblink) || job.values.source_dblink ? 'refreshable' : 'unplug') : (job.values.source_dblink ? 'refreshable_noncdb' : 'noncdb');
    }
    if (operation === 'patch' && project.jobs.length && project.jobs.every(j => !j.values.sid)) { project.mode=project.jobs.some(j=>j.values.target_home)?'create_home':'download'; for(const j of project.jobs)j.scenario=project.mode==='download'?'download':/^GOLDIMAGE:/i.test(j.values.patch||'')?'gold_use':j.values.create_gold_image && !/^NO$/i.test(j.values.create_gold_image)?'gold_create':j.values.source_home?'prepare_home':'install'; }
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
    if (!project.records?.length) out.push('# Generated with AUGUR', '# AutoUpgrade profile: ' + project.profileId, '# Follow the generated runbook for this operation and execution host.', '');
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
      if(!['download','create_home'].includes(project.mode)) required('sid');
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
        if(['noncdb','refreshable_noncdb'].includes(job.scenario) && get('pdbs')) add('error','scenario-settings',prefix+': the non-CDB conversion plan contains a source PDB list. Select a PDB scenario or remove the list.');
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
        if (['noncdb', 'unplug', 'refreshable', 'refreshable_noncdb'].includes(job.scenario)) {
          required('target_cdb');
          add('warning', 'migration', prefix + ': PDB migration and recovery behavior require validation in the actual source and target databases.');
          if (job.context?.location !== 'remote' && get('target_cdb') && String(get('target_cdb')).toLowerCase() === String(get('sid')).toLowerCase()) add('error', 'same-cdb', prefix + ': source SID and target CDB are identical. Remote relocate cases require expert review.');
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
            if(job.scenario==='refreshable' && link && !/^[A-Za-z][\w.$]*(?:\s+[1-9]\d*)?$/.test(link))add('error','refresh-interval',prefix+': use a database link, optionally followed by a positive refresh interval in seconds for '+name+'.');
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
    issues.push(...validateWorkflows(project,profile));
    if (!project.jarPath || /[\r\n\0]/.test(project.jarPath)) add('error', 'jar-path', 'Enter the AutoUpgrade JAR path.');
    return issues;
  }

  function modesFor(scenario) {
    const s=SCENARIOS[scenario];
    return s?.group==='Prepare software'?[s.mode]:scenario==='pdb_upgrade'?['upgrade','analyze','postfixups']:MODES[s?.operation||'upgrade'];
  }
  function initialMode(project) { return ['download','create_home','upgrade','postfixups'].includes(project.mode)?project.mode:'analyze'; }
  function chooseScenario(project,index,scenario) {
    if(!SCENARIOS[scenario])throw new Error('Unknown scenario');
    const s=SCENARIOS[scenario],j=project.jobs[index];
    const oldOp=project.operation;
    project.operation=s.operation;
    if(oldOp!==s.operation)for(const other of project.jobs)other.scenario=s.operation==='patch'?'patch':'upgrade';
    j.scenario=scenario;project.mode=s.mode||'analyze';
    if(!Object.keys(j.values).length && !Object.keys(j.pdb).length && !project.records.length) {
      const base=s.group==='Prepare software'?(scenario==='download'?'download':'install'):(s.operation==='patch'?'patch':'upg');
      let n=1;while(project.jobs.some(other=>other!==j&&other.prefix===base+n))n++;
      j.prefix=base+n;
    }
    if(scenario==='gold_create'&&!j.values.create_gold_image)j.values.create_gold_image='YES';
    if(scenario==='gold_use'&&!j.values.download)j.values.download='NO';
  }
  function patchParts(text) {
    const tokens=String(text||'').split(/,\s*/);
    const fixed='CSPU|DPBP|JDK|MRP|OPATCH|AU|SQLCL|AHF|CVU|SDOBP|TEXT|TOOLS';
    const re=new RegExp('^(?:(RECOMMENDED|RU|OJVM|OCW)(?::(\\d{2}\\.\\d{1,2}(?:\\.\\d)?))?|('+fixed+')|(\\d+)|GOLDIMAGE:([A-Za-z0-9_-]+\\.zip))$','i');
    return tokens.map(token=>{const m=token.match(re);return m?{token,type:(m[1]||m[3]||(m[4]?'NUMBER':'GOLDIMAGE')).toUpperCase(),version:m[2]||'',file:m[5]||''}:{token,error:true};});
  }
  function validateWorkflows(project,profile) {
    const out=[],add=(level,code,text,key='')=>out.push({level,code,text,key});
    const e=project.execution||{};
    for(const [key,value] of pairs(e))if(typeof value!=='string'||/[\r\n\0]/.test(value))add('error','execution','Execution setting '+key+' must be a single line.');
    if(e.shell&&!['posix','powershell'].includes(e.shell))add('error','shell','Choose POSIX shell or PowerShell.');
    if(e.autologin&&!['YES','NO','SHARED'].includes(e.autologin))add('error','autologin','Choose an available wallet auto-login mode.');
    if(e.mosUser&&!/^[A-Za-z0-9_.+@-]+$/.test(e.mosUser))add('error','mos-user','Enter a MOS username, without a password.');
    if(e.csi&&!/^\d+$/.test(e.csi))add('error','csi','CSI must contain digits only; it is optional in this build.');
    if(e.jobIds&&!/^\d+(,\d+)*$/.test(e.jobIds))add('error','job-ids','Job identifiers must be numbers separated by commas.');
    for(const name of ['unattended','debug','restoreOnFail'])if(e[name]&&!['YES','NO'].includes(e[name]))add('error','execution','Execution setting '+name+' must be YES or NO.');
    const contextOptions={os:['linux','ol9','windows'],topology:['single','rac'],role:['primary_dg','standby'],location:['remote'],sourceVersion:['19','21','23'],tde:['none','password','auto','okv']};
    for(const j of project.jobs) {
      const get=n=>effective(project,j,n,profile).value,ctx=j.context||{},p=j.prefix;
      const error=(code,msg,key='')=>add('error',code,p+': '+msg,key?p+'.'+key:'');
      const warn=(code,msg)=>add('warning',code,p+': '+msg);
      for(const [k,v] of pairs(ctx))if(typeof v!=='string'||/[\r\n\0]/.test(v))error('context','planning values must be single-line strings.');
      for(const [k,options] of pairs(contextOptions))if(ctx[k]&&!options.includes(ctx[k]))error('context','unsupported planning choice for '+k+'.');
      if(ctx.sourceOracleHome&&!/^(\/|[A-Za-z]:[\\/])/.test(ctx.sourceOracleHome))error('context-path','enter an absolute source Oracle home for the source-side runbook.');
      if(ctx.sourceOracleHome&&(!/^[\x20-\x7E]+$/.test(ctx.sourceOracleHome)||/[#";<>`{}\[\]!&|?]/.test(ctx.sourceOracleHome)||ctx.sourceOracleHome.trim()!==ctx.sourceOracleHome))error('context-path','the source-side Oracle home must also use supported configuration syntax.');
      const noDB=project.operation==='patch'&&['download','create_home'].includes(project.mode);
      const software=SCENARIOS[j.scenario]?.group==='Prepare software';
      if(software&&!modesFor(j.scenario).includes(project.mode))error('workflow-mode','this software-only workflow needs '+SCENARIOS[j.scenario].mode+' mode. Split database operations into another project.');
      if(j.scenario==='pdb_upgrade'&&!modesFor(j.scenario).includes(project.mode))error('workflow-mode','PDBs already in the target CDB use upgrade, analyze or postfixups mode.');
      if(project.operation==='patch') {
        const parts=patchParts(get('patch')),version=Number(get('target_version')||parts.find(t=>['RU','RECOMMENDED'].includes(t.type)&&t.version)?.version.split('.')[0]||ctx.sourceVersion||0),major=version===26?23:version;
        const ru=parts.find(t=>t.type==='RU'||t.type==='RECOMMENDED'),gold=parts.find(t=>t.type==='GOLDIMAGE');
        if(parts.some(t=>t.error))error('patch-expression','unsupported patch expression. Use registered aliases, numeric IDs or GOLDIMAGE:filename.zip.','patch');
        if(!['download'].includes(project.mode)&&!ru&&!gold)error('patch-ru','home creation and out-of-place patching require RU, RECOMMENDED or GOLDIMAGE.','patch');
        if(noDB&&!get('source_home')&&!get('target_version')&&!ru?.version&&!gold)error('patch-version','set target_version or a versioned RU / RECOMMENDED expression.','target_version');
        if(get('target_version')&&!['19','21','23','26'].includes(String(get('target_version'))))error('patch-version','this patch profile accepts 19, 21, 23 or 26.','target_version');
        const norm=v=>Number(String(v).split('.')[0])===26?23:Number(String(v).split('.')[0]);
        if(ru?.version&&major&&norm(ru.version)!==major)error('ru-version','RU release and target_version disagree.','patch');
        if(!noDB && ctx.sourceVersion&&get('target_version')&&norm(ctx.sourceVersion)!==norm(get('target_version')))error('patch-upgrade','patch deploy does not perform a major-version upgrade. Use an upgrade workflow.');
        if(project.mode==='create_home'&&!get('source_home')) {
          for(const n of ['home_settings.oracle_base','home_settings.edition'])if(!get(n))error('new-home','set '+n+' when no source home can supply installation settings.',n);
          if(ctx.os!=='windows' && String(get('platform')).toUpperCase()!=='WINDOWS.X64'&&!get('home_settings.inventory_location'))warn('inventory','set home_settings.inventory_location for a server without oraInst.loc. An existing inventory takes precedence.');
        }
        if(j.scenario==='prepare_home'&&!get('source_home'))error('source-settings','select a source home to inherit its installation settings, or choose fresh installation.','source_home');
        if(j.scenario==='install'&&get('source_home'))warn('fresh-source','a source home is set; its groups and binary settings will be consulted.');
        if(j.scenario==='gold_use'&&!gold)error('gold-use','select a named GOLDIMAGE:filename.zip.','patch');
        if(j.scenario==='gold_create'&&(!get('create_gold_image')||/^NO$/i.test(get('create_gold_image'))))error('gold-create','set create_gold_image to YES or a filename.','create_gold_image');
        if(gold) {
          if(parts.length!==1)error('gold-exclusive','GOLDIMAGE cannot be combined with patch aliases or numbers.','patch');
          if(project.mode==='download'||(project.mode!=='create_home'&&yes(get('download'))))error('gold-download','a user Gold Image is local media; download mode is not supported. Use download=NO outside create_home.');
          if(get('create_gold_image')&&!/^NO$/i.test(get('create_gold_image')))error('gold-conflict','using and creating a user Gold Image cannot be combined.');
        }
        const create=get('create_gold_image');
        if(create&&!/^(YES|NO)$/i.test(create)) {
          if(!/^[A-Za-z0-9_%.-]+\.zip$/.test(create)||create.replace(/%(RELEASE|UPDATE|DATE|TIMESTAMP)%/g,'').includes('%'))error('gold-name','use a ZIP basename with RELEASE, UPDATE, DATE or TIMESTAMP placeholders.','create_gold_image');
        }
        if(get('target_home')&&get('target_home').replace(/%(RELEASE|UPDATE|V[1-5]D)%/g,'').includes('%'))error('home-placeholder','unsupported target home placeholder.','target_home');
        if(parts.some(t=>t.type==='OJVM')&&major>=21)error('ojvm','this release has no separate OJVM bundle. Use RECOMMENDED or remove OJVM.','patch');
        if(major===21&&parts.some(t=>['DPBP','MRP','CSPU'].includes(t.type)))error('patch-release','this build rejects DPBP, MRP and CSPU for release 21.','patch');
        if(parts.some(t=>t.type==='MRP')&&get('platform')&&String(get('platform')).toUpperCase()!=='LINUX.X64')error('mrp-platform','MRP requires LINUX.X64 in this build.','patch');
        if(parts.some(t=>t.type==='MRP')&&ru?.version&&((major===19&&Number(ru.version.split('.')[1])<=16)||(major===23&&Number(ru.version.split('.')[1])<26)))error('mrp-version','MRP needs a pinned RU newer than 19.16, or 23.26 and later.','patch');
        const ojvm=parts.find(t=>t.type==='OJVM'&&t.version);
        if(ojvm&&ru?.version&&(norm(ojvm.version)!==norm(ru.version)||Number(ojvm.version.split('.')[1])<Number(ru.version.split('.')[1])))error('ojvm-ru','the explicit OJVM release cannot precede or use another major release than RU.');
        if(ctx.os==='ol9'&&ru?.version&&norm(ru.version)===19&&Number(ru.version.split('.')[1])<22)error('ol9','Oracle Linux 9 requires a 19c RU of at least 19.22 in this validator.');
        const needsDownload=project.mode==='download'||yes(get('download')),oua=['YES','ALL'].includes(String(get('gold_image')).toUpperCase())&&!(parts.length===1&&parts[0].type==='OCW');
        if(needsDownload&&oua&&!gold){
          if(!ru)error('gold-service-ru','Oracle Update Advisor images require RU or RECOMMENDED.','patch');
          if(major&&![19,23].includes(major))error('gold-service-version','Oracle Update Advisor Gold Images support releases 19 and 23/26 in this build.');
          if(get('platform')&&String(get('platform')).toUpperCase()!=='LINUX.X64')error('gold-service-platform','Oracle Update Advisor images require LINUX.X64. Choose AUTO/NO for fallback or separate media.');
        }
        if(get('download_folder')&&get('folder')&&get('download_folder')!==get('folder'))error('folder-conflict','folder and download_folder differ. Choose one media location.');
        if((project.mode==='download'||yes(get('download')))&&!gold&&!project.globals.keystore)warn('mos-wallet','configure global.keystore and load MOS credentials on the download host.');
        if(String(get('gold_image')).toUpperCase()==='AUTO')warn('gold-auto','AUTO may fall back to individual patches. For 19c/21c, stage base-release media when a Gold Image is unavailable.');
      }
      for(const [key,value] of pairs({...project.globals,...j.values})) {
        if(key.startsWith('home_settings.')&&['oracle_base','inventory_location'].includes(key.split('.')[1])&&!/^(\/|[A-Za-z]:[\\/])/.test(value))error('home-path','use an absolute server path.',key);
        if((key.endsWith('_group')||key==='home_settings.home_name')&&!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value))error('home-name','use a simple group or home name.',key);
      }
      if(ctx.os==='windows'||String(get('platform')).toUpperCase()==='WINDOWS.X64') {
        if(['REQUIRED','FORCE'].includes(String(get('rac_rolling')).toUpperCase()))error('rolling-windows','RAC rolling patching is rejected on Windows in this build.');
        if(get('home_settings.inventory_location'))warn('windows-inventory','Windows determines its inventory location; omit the Unix inventory path.');
      }
      if(['REQUIRED','FORCE'].includes(String(get('rac_rolling')).toUpperCase())&&ctx.topology==='single')error('rolling-single','RAC rolling requires a RAC environment.');
      if(yes(get('home_settings.ignore_prereq_failure')))warn('prereq','installer prerequisite failures will be ignored; resolve the underlying cause where possible.');
      if(get('home_settings.ignore_opatch_conflict')&&!/^ERROR$/i.test(get('home_settings.ignore_opatch_conflict')))warn('conflicts','the selected conflict policy can leave requested patches unapplied.');
      if(/^FORCE$/i.test(get('rac_rolling')||''))warn('rolling-force','FORCE bypasses rolling-eligibility checking; use only with a separately verified patch plan.');
      if(get('drain_timeout')&&!/^(WAIT|\d+)$/i.test(get('drain_timeout')))error('drain-timeout','use seconds or WAIT.','drain_timeout');
      if(ctx.role==='standby') {
        if(project.operation==='patch'&&!noDB&&!['analyze','deploy'].includes(project.mode))error('standby-mode','physical standby database work supports analyze/deploy in this patch validator.');
        warn('standby','coordinate primary and standby binaries, redo apply and broker state. Never schedule primary and standby database work as one unreviewed run.');
      }
      if(ctx.tde&&ctx.tde!=='none'&&!project.globals.keystore)warn('tde','set global.keystore and load required source/target TDE secrets on the server.');
      if(project.operation==='upgrade') {
        if(yes(get('create_oracle_home')))for(const name of ['target_home','target_version','download_folder'])if(!get(name)&&!(name==='download_folder'&&get('folder')))error('upgrade-home','create_oracle_home requires '+name+'.',name);
        if(j.scenario==='pdb_upgrade'&&!get('pdbs'))error('pdb-upgrade','select the PDBs already present in the target CDB.','pdbs');
        if(j.scenario==='refreshable_noncdb'&&!get('source_dblink'))error('clone-link','supply the non-CDB source database link.','source_dblink');
        if(j.scenario==='refreshable_noncdb'&&get('source_dblink')&&!/^[A-Za-z][\w.$]*(?:\s+[1-9]\d*)?$/.test(get('source_dblink')))error('clone-link','use LINK or LINK refresh_seconds.','source_dblink');
        if(['refreshable','refreshable_noncdb'].includes(j.scenario)) {
          if(!get('start_time')||/^NOW$/i.test(get('start_time')))warn('cutover-now','NOW does not reserve a later cutover window. Set start_time deliberately when using periodic refresh.');
          if(e.unattended==='YES')warn('clone-console','a controlled refreshable cutover uses the interactive proceed command; keep the console available.');
          if(ctx.location==='remote'&&!get('target_version'))error('source-target-version','set target_version for the source preparation configuration.','target_version');
          if(ctx.location==='remote'&&!ctx.sourceOracleHome)error('source-runbook','enter the actual source Oracle home in Environment for the separate source fixups configuration.');
        }
      }
    }
    return out;
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
    const e=project.execution||{},q=e.shell==='powershell'?v=>"'"+String(v).replaceAll("'","''")+"'":quote;
    let cmd=(e.shell==='powershell'?'& ':'')+(e.javaPath?q(e.javaPath):'java')+' -jar '+q(project.jarPath)+(project.operation==='patch'?' -patch':'')+' -config '+q(project.fileName)+' -mode '+mode;
    if(e.settingsPath)cmd+=' -settings '+q(e.settingsPath);
    if(e.unattended==='YES')cmd+=' -noconsole';
    if(e.debug==='YES')cmd+=' -debug';
    if(e.restoreOnFail==='YES'&&mode==='deploy')cmd+=' -restore_on_fail';
    return cmd;
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
    checkMap(p.globals); if(p.execution!=null)checkMap(p.execution);
    for (const j of p.jobs) { if (typeof j.prefix !== 'string' || !SCENARIOS[j.scenario]) throw new Error('Invalid database entry.'); checkMap(j.values); if(j.context!=null)checkMap(j.context); if (!j.pdb || typeof j.pdb !== 'object' || Array.isArray(j.pdb)) throw new Error('Invalid PDB settings.'); for (const [k,v] of pairs(j.pdb)) { if (dangerous.has(k)) throw new Error('Invalid PDB name.'); checkMap(v); } }
    if (!Array.isArray(p.records) || p.records.some(r => !r || typeof r.raw !== 'string' || (r.key != null && typeof r.key !== 'string') || (r.value != null && typeof r.value !== 'string') || (r.comment != null && typeof r.comment !== 'string'))) throw new Error('Invalid imported document records.');
    for (const field of ['title','jarPath','fileName','original']) if (typeof p[field] !== 'string') throw new Error('Missing project field: ' + field);
    // Reconstruct preservation records from original text. Do not trust serialized raw lines.
    p.records=p.original?parseConfig(p.original,profiles[p.profileId],p.operation).project.records:[];
    return p;
  }
  const api = { FORMAT, SCENARIOS, MODES, chooseScenario, modesFor, patchParts, initialMode, newProject, definition, describe, effective, entries, parseConfig, renderConfig, validate, command, diff, loadProject, clone, list };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Augur = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
