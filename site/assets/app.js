(function () {
  'use strict';
  const C = Alis, W = AlisWorkflows, profiles = ALIS_PROFILES;
  const profileIds=Object.keys(profiles).sort((a,b)=>profiles[b].buildDate.localeCompare(profiles[a].buildDate)||b.localeCompare(a));
  let project = C.newProject(profileIds[0]), active = 0, step = 0, view = 'config', dirty = false, referenceOperation='upgrade';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const profile = () => profiles[project.profileId];
  const job = () => project.jobs[active];
  const steps = [
    ['Plan','What would you like to build?','Start with the outcome. ALIS prepares the configuration, the commands and the documentation together.'],
    ['Home / database','Define the software and database.','Paths refer to the execution host. A fresh home does not need an existing SID.'],
    ['Media','Choose the patches and images.','Download online, reuse an offline repository or deploy your own Gold Image.'],
    ['Migration','Map the move, PDB by PDB.','Keep source names, target names, links and file choices together.'],
    ['Environment','Make the execution context explicit.','These planning choices shape the runbook. They are not extra AutoUpgrade parameters.'],
    ['Recovery','Decide how you will recover.','Review restore points, encryption and what must remain available after the change.'],
    ['Options','Fine-tune the operation.','Browse every parameter, use shared settings and add stage-specific hooks.'],
    ['Runbook','Your configuration and execution plan.','Resolve blockers, review the ordered steps and export the files with their instructions.']
  ];
  const placeholders = { sid: 'ORCL', source_home: '/u01/app/oracle/product/19/dbhome_1', target_home: '/u01/app/oracle/product/26/dbhome_1', global_log_dir: '/u01/app/oracle/cfgtoollogs/autoupgrade', keystore: '/u01/app/oracle/au-keystore', target_cdb: 'CDBNEW', pdbs: 'SALES, HR', download_folder: '/u01/stage/patches', before_action: '/u01/scripts/before_upgrade.sh', after_action: '/u01/scripts/after_upgrade.sh' };
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
  function modal(title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; if (!$('modal').open) $('modal').showModal(); }
  function field(name, scope = 'v', wide = false, custom = {}) {
    const p = C.definition(profile(), project.operation, name); if (!p) return '';
    const d = C.describe(p); const values = scope === 'g' ? project.globals : job().values;
    const value = values[name] ?? ''; const model = scope + ':' + name; const id = 'f-' + scope + '-' + name.replaceAll('.', '-');
    const inheritedProject=C.clone(project),inheritedJob=inheritedProject.jobs[active];delete inheritedJob.values[name];
    const eff = scope === 'g' ? { value: p.default, source: p.default == null ? 'Not explicitly set' : 'JAR declaration' } : C.effective(inheritedProject, inheritedJob, name, profile());
    const options = custom.options || d.options;
    const inherited = !Object.hasOwn(values, name);
    let control;
    if (options) {
      const choices = options.includes(value) || !value ? options : [value, ...options];
      control = `<select id="${id}" data-model="${esc(model)}"><option value="">${esc(eff.value == null ? 'AutoUpgrade default (omit)' : 'Inherit / default (' + eff.value + ')')}</option>${choices.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else control = `<input id="${id}" data-model="${esc(model)}" value="${esc(value)}" placeholder="${esc(custom.placeholder || placeholders[name] || 'Not explicitly set')}" autocomplete="off" spellcheck="false">`;
    return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}">${esc(custom.label || d.label)}<code>${scope === 'g' ? 'global' : esc(job().prefix)}.${esc(name)}</code></label>${control}<span class="help">${esc(custom.help || d.help)}</span><span class="origin" data-origin="${esc(model)}">${inherited ? esc(eff.source + (eff.value == null ? '' : ': ' + eff.value)) : 'Explicit ' + (scope === 'g' ? 'global' : 'local') + ' setting'}</span></div>`;
  }

  function note(id) {const g=W.GUIDES.find(g=>g.id===id);return `<details class="guide-note"><summary>${esc(g.title)}</summary><p>${esc(g.text)}</p>${sourceLinks(g.sources)}</details>`;}
  function sourceLinks(ids) {return `<div class="source-links">${ids.map(id=>W.SOURCES.find(s=>s.id===id)).filter(Boolean).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div>`;}
  function planningField(key,label,help,choices=null,scope='execution',placeholder='') {
    const values=scope==='context'?job().context||{}:project.execution||{},value=values[key]||'',id='plan-'+scope+'-'+key;
    return `<div class="field"><label for="${id}">${esc(label)}</label>${choices?`<select id="${id}" data-${scope}="${key}">${choices.map(([v,l])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`:`<input id="${id}" data-${scope}="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`}<span class="help">${esc(help)}</span></div>`;
  }
  function softwareOnly(){return project.operation==='patch'&&['create_home','download'].includes(project.mode);}
  function plan() {
    let html='';
    for(const group of ['Prepare software','Upgrade and migrate','Patch databases'])html+=`<h2 class="section-title">${group}</h2><div class="scenario-grid">${Object.entries(C.SCENARIOS).filter(([,s])=>s.group===group).map(([key,s])=>`<button class="scenario-card ${job().scenario===key?'selected':''}" data-scenario="${key}" aria-pressed="${job().scenario===key}"><i class="radio-mark" aria-hidden="true"></i><strong>${esc(s.label)}</strong><span>${esc(s.detail)}</span></button>`).join('')}</div>`;
    html+=`<h2 class="section-title">How far should this run go?</h2><div class="mode-choices">${C.modesFor(job().scenario).map(mode=>`<button class="mode-choice ${project.mode===mode?'active':''}" data-mode="${mode}" aria-pressed="${project.mode===mode}">${mode}</button>`).join('')}</div><div class="setting-note">${softwareOnly()?'Software-only workflow: no source database is required.':'Analyze checks readiness; fixups changes the source; deploy runs the complete operation. Upgrade/postfixups require the appropriate target-side state.'} One file has one operation and mode; use separate projects for incompatible stages.</div><div class="field-grid"><div class="field wide"><label for="project-title">Project name</label><input id="project-title" data-project="title" value="${esc(project.title)}" maxlength="100"></div></div>`;
    return html+'<button id="load-example" class="button">Load example for this workflow</button>'+note('defaults');
  }
  function database() {
    const home=project.operation==='patch',download=home&&project.mode==='download',soft=softwareOnly();
    let html=`<div class="field-grid"><div class="field"><label for="prefix">Configuration prefix</label><input id="prefix" data-prefix value="${esc(job().prefix)}" placeholder="install1" spellcheck="false"><span class="help">Unique entry label; it is not a database SID.</span></div>`;
    if(!soft)html+=field('sid');
    if(!soft||job().scenario==='prepare_home'||job().values.source_home)html+=field('source_home','v',true);
    else if(!download)html+=`<div class="field wide"><details><summary>Inherit settings from an existing home (optional)</summary>${field('source_home','v',true)}</details></div>`;
    if(!download)html+=field('target_home','v',true);
    html+=field('target_version','v',false,{options:home?['19','21','23','26']:profile().targetVersions});
    if(home&&!download)html+=field('home_settings.oracle_base','v',true)+field('home_settings.edition')+field('home_settings.inventory_location','v',true);
    if(!soft)html+=field('start_time');if(job().scenario==='pdb_upgrade')html+=field('pdbs','v',true)+field('exclusion_list','v',true);
    html+=field('global_log_dir','g',true)+field('keystore','g',true)+'</div>';
    if(home&&!download)html+=`<details class="option-group"><summary>Installer identity, groups and binary options</summary><div class="field-grid">${profile().operations.patch.filter(p=>p.name.startsWith('home_settings.')&&!['home_settings.oracle_base','home_settings.edition','home_settings.inventory_location'].includes(p.name)).map(p=>field(p.name,'v',p.name.includes('cluster_nodes'))).join('')}</div></details>`+note('install');
    if(!home)html+=`<details class="option-group"><summary>Let this upgrade create its target Oracle Home</summary><div class="field-grid">${field('create_oracle_home')}${field('target_edition')}</div><p class="help">Choose media in the next step. AutoUpgrade requires a target home, target version and media directory for this path.</p></details>`;
    return html;
  }
  function media() {
    if(project.operation!=='patch'&&!/^YES$/i.test(job().values.create_oracle_home||''))return '<p class="setting-note">This plan uses an existing target Oracle home. Enable target-home creation under Home / database to configure its media, or start a separate software preparation project.</p>'+note('media');
    const patch=project.operation==='patch';
    return `<div class="field-grid">${field('folder','v',true)}<div class="field wide"><details ${job().values.download_folder?'open':''}><summary>Alternative spelling: download_folder</summary>${field('download_folder','v',true)}</details></div>${field('download')}${patch?field('platform'):''}${field('patch','v',true)}</div><div class="patch-builder"><h2 class="section-title">Build a patch selection</h2><p class="help">Preset buttons replace this entry’s patch expression. Keep version pins in the expression when repeatability matters.</p><div class="mode-choices"><button class="button" data-patch-preset="RU,OPATCH,OCW">RU + OPatch + OCW</button><button class="button" data-patch-preset="RECOMMENDED">Recommended</button><button class="button" data-patch-preset="TOOLS">Tools only</button></div><div class="patch-tokens">${['RU','OPATCH','OCW','OJVM','DPBP','MRP','CSPU','JDK','SDOBP','TEXT','AU','AHF','CVU','SQLCL'].map(t=>`<button class="small-button" data-patch-token="${t}">+ ${t}</button>`).join('')}</div><div class="field-grid"><div class="field"><label for="patch-version">Pin RU / recommended version</label><input id="patch-version" placeholder="19.32 or 23.26.3"></div><div class="field"><label for="patch-number">One-off / GI / combo patch ID</label><input id="patch-number" inputmode="numeric" placeholder="Patch number from MOS"></div></div><button id="apply-patch-version" class="button">Apply version pin</button> <button id="append-patch-number" class="button">Add patch ID</button><p class="help">Numeric GI patches can be downloaded here; installing or patching Grid Infrastructure is a separate procedure. Tools-only selections belong in download mode.</p></div>${patch?`<h2 class="section-title">Images</h2><div class="field-grid">${field('gold_image')}${field('gold_image.security_patch_level')}${field('create_gold_image','v',true)}</div><div class="field"><label for="own-image">Use a local Gold Image ZIP</label><input id="own-image" placeholder="db_home_19_32.zip"><span class="help">A basename in the media directory, not a full path. Setting this replaces the patch expression.</span></div><button id="use-own-image" class="button">Use this Gold Image</button>`:''}${note('media')}${note('gold')}${note('versions')}`;
  }
  function pdbField(pdb, name, label, placeholder, options = null) {
    const value = job().pdb[pdb]?.[name] || ''; const id = 'p-' + pdb + '-' + name;
    const data = `data-pdb="${esc(pdb)}" data-pdb-key="${esc(name)}"`;
    return `<div class="field ${name !== 'target_pdb_name' && name !== 'keep_source_pdb' ? 'wide' : ''}"><label for="${esc(id)}">${label}<code>${esc(job().prefix + '.' + name + '.' + pdb)}</code></label>${options ? `<select id="${esc(id)}" ${data}><option value="">AutoUpgrade default</option>${options.map(o=>`<option ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input id="${esc(id)}" ${data} value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false">`}</div>`;
  }
  function migration() {
    if (['upgrade','pdb_upgrade','patch','install','prepare_home','download','gold_create','gold_use'].includes(job().scenario)) return `<div class="setting-note"><strong>No PDB move in this scenario.</strong> The current plan ${job().scenario === 'patch' ? 'patches the database' : 'upgrades the database in its target home'}. Choose a migration scenario in Plan to configure a target CDB and PDB mapping.</div>`;
    let html = `<div class="field-grid">${field('target_cdb','v',true)}`;
    if (['noncdb','refreshable_noncdb'].includes(job().scenario)) html += field('target_pdb_name') + field('target_pdb_copy_option','v',true) + (job().scenario==='refreshable_noncdb'?field('source_dblink','v',true)+field('parallel_pdb_creation_clause')+field('close_source'):'');
    else html += field('pdbs','v',true) + '<div class="field wide"><button id="update-pdb-mapping" class="button">Update PDB mapping</button></div>';
    html += `</div>`;
    if (['noncdb','refreshable_noncdb'].includes(job().scenario)) return html+note('refresh') + '<div class="setting-note">Recovery after conversion has different requirements from a normal database upgrade. Verify the backup and restoration procedure for the target PDB.</div>';
    const pdbs = C.list(job().values.pdbs);
    if (!pdbs.length) return html + '<p class="empty-message">Enter source PDB names above, then update the mapping to configure their destinations.</p>';
    for (const pdb of pdbs) {
      html += `<section class="pdb-block"><h3>${esc(pdb.toUpperCase())}</h3><div class="field-grid">${pdbField(pdb,'target_pdb_name','Target name',pdb.toUpperCase())}${job().scenario === 'unplug' ? pdbField(pdb,'keep_source_pdb','Keep source PDB','',['YES','NO']) : ''}${pdbField(pdb,'parallel_pdb_creation_clause','Copy parallel degree','0')}${pdbField(pdb,'close_source','Close local source','',['YES','NO'])}${pdbField(pdb,'target_pdb_copy_option','Copy data files',"file_name_convert=('/old/','/new/')")}${job().scenario === 'refreshable' ? pdbField(pdb,'source_dblink','Database link and refresh interval','CLONE_' + pdb.toUpperCase() + ' 600') : ''}</div></section>`;
    }
    return html + `<div class="field-grid">${field('drop_dblink')}${field('keep_pdb_save_state')}${field('target_cdbroot_dblink','v',true)}${field('manage_standbys_clause','v',true)}</div>` + note('refresh') + '<div class="setting-note">A copy clause requests copying data files. For ASM/OMF use <code>file_name_convert=none</code>. Verify the destination and available space on the server.</div>';
  }

  function environment() {
    return `<h2 class="section-title">This entry’s environment</h2><div class="field-grid">${planningField('os','Execution OS','Commands use the shell selected below.',[['','POSIX / unspecified'],['linux','Linux'],['ol9','Oracle Linux 9'],['windows','Windows']], 'context')}${planningField('topology','Database topology','Used for cluster guidance.',[['','Not specified'],['single','Single instance'],['rac','RAC']], 'context')}${planningField('role','Database role','Standby workflows need coordination with the primary.',[['','Primary / standalone'],['primary_dg','Primary with Data Guard'],['standby','Physical standby']], 'context')}${planningField('location','Source location','Remote clone workflows get an additional source configuration.',[['','Same host'],['remote','Different host']], 'context')}${planningField('sourceVersion','Source database release','Helps detect a major-version change in a patch plan.',[['','Not specified'],['19','19c'],['21','21c'],['23','23ai / 26ai']], 'context')}${planningField('sourceOracleHome','Actual Oracle Home on the source host','For a remote clone, source fixups use this path. The target-side source_home can be a documented placeholder.','', 'context','/u01/app/oracle/product/19/dbhome_1')}${planningField('tde','Encryption / keystore','No passwords are entered in ALIS.',[['','Not specified'],['none','No TDE'],['password','Password TDE wallet'],['auto','Auto-login TDE wallet'],['okv','Oracle Key Vault / external']], 'context')}</div><div class="field-grid">${!softwareOnly()?field('rac_rolling')+field('drain_timeout')+(project.operation==='upgrade'?field('defer_standby_log_shipping')+field('stop_redo_apply','v',true)+field('target_is_remote')+field('remove_rac_config')+field('config_source_rac'):field('patch_node')):''}</div><h2 class="section-title">Commands and credentials</h2><div class="field-grid">${planningField('shell','Command shell','PowerShell quotes Windows paths explicitly.',[['','POSIX shell'],['powershell','PowerShell']])}${planningField('javaPath','Java executable','Leave empty to use java from PATH.',null,'execution','java or an absolute Java path')}${planningField('mosUser','MOS username (optional)','Used only in the runbook; enter the password in AutoUpgrade on the server.',null,'execution','your.name@example.com')}${planningField('csi','CSI (optional)','Explicit CSI is not mandatory in this 26.5 profile.','','execution')}${planningField('autologin','Keystore auto-login','YES for local use; SHARED is an explicit shared-keystore choice.',[['','YES — local auto-login'],['NO','NO — password protected'],['SHARED','SHARED — shared use']])}${planningField('unattended','Execution console','Refreshable controlled cutover uses the interactive console.',[['','Interactive console'],['YES','Unattended (-noconsole)']])}${planningField('debug','Debug output','Adds -debug to the generated operation commands.',[['','Normal logging'],['YES','Debug']])}${planningField('restoreOnFail','Restore on eligible failure','Requires an applicable AutoUpgrade recovery path.',[['','No extra flag'],['YES','-restore_on_fail']])}${planningField('settingsPath','Internal settings file (optional)','Expert file maintained separately, passed with -settings.',null,'execution')}${planningField('jobIds','Actual job IDs (optional)','Used in recovery and proceed examples, never guessed.',null,'execution','100,101')}</div>${note('wallet')}${note('topology')}`;
  }
  function recovery() {
    if(softwareOnly())return '<div class="setting-note">This operation prepares software and does not create a database restore point. Keep the media inventory and verify the new installation before assigning a database to it.</div>'+note('install');
    return `<div class="field-grid">${field('restoration')}${project.operation === 'upgrade' ? field('drop_grp_after_upgrade') + field('raise_compatible','v',true,{placeholder:'NO, YES or a release such as 23.4'}) : field('drop_grp_after_patching')}${field('timezone_upg')}${field('run_utlrp')}${field('dictionary_stats_before')}${field('dictionary_stats_after')}${field('fixed_stats_before')}${field('keystore','g',true)}</div><div class="setting-note"><strong>A requested restore point is not a backup guarantee.</strong> AutoUpgrade can change recovery behavior for particular editions and migration types. Load passwords using its keystore on the database server; never add passwords to a configuration file.</div>`;
  }
  function options() {
    const ps = profile().operations[project.operation].filter(p => p.status === 'available');
    return `<div class="field-grid">${field('before_action','v',true)}${field('after_action','v',true)}${project.operation === 'upgrade' ? field('upgrade_node') + field('manage_network_files') + field('catctl_options','v',true) : field('patch_node') + field('method')}</div><section class="advanced-add"><h2>Advanced settings</h2><p class="intro">Add a local parameter, or a global value shared by all databases. Imported settings remain visible here.</p><div class="field-grid"><div class="field wide"><label for="advanced-param">Parameter</label><select id="advanced-param">${ps.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label for="advanced-scope">Scope</label><select id="advanced-scope"><option value="local">This database</option><option value="global">All databases</option></select></div><div class="field"><label for="advanced-value">Value</label><input id="advanced-value" spellcheck="false" placeholder="Explicit value"></div></div><p id="advanced-help" class="setting-note"></p><button id="add-setting" class="button">Add setting</button></section><h2 class="section-title">Explicit settings</h2><div id="explicit-settings">${C.entries(project).map(([key,value]) => `<div class="extra-row"><div><code>${esc(key)}</code><div class="extra-value">${esc(value)}</div></div><button class="small-button" data-remove-setting="${esc(key)}" aria-label="Remove ${esc(key)}">Remove</button></div>`).join('') || '<p class="empty-message">No explicit settings.</p>'}</div><details class="catalog"><summary>Inspect the complete ${project.operation} parameter catalog</summary><div class="catalog-wrap"><table><thead><tr><th>Parameter</th><th>Scope</th><th>Profile status</th></tr></thead><tbody>${profile().operations[project.operation].map(p=>`<tr><td><code>${esc(p.name)}</code></td><td>${p.scope}${p.nested ? ' / PDB' : ''}</td><td class="status">${p.status === 'available' ? 'Registered' : p.status === 'unsupported' ? 'Unsupported' : 'Unverified'}</td></tr>`).join('')}</tbody></table></div></details>`;
  }

  function review() {
    const r=W.runbook(project,profile()),errors=r.issues.filter(i=>i.level==='error');
    return `${errors.length?`<h2 class="section-title">Resolve ${errors.length} configuration errors</h2>`:'<div class="success-note">The implemented static checks pass. Review the operational gates before running commands.</div>'}<ul class="review-list">${r.issues.map(i=>`<li class="${i.level}"><span class="issue-label">${i.level==='error'?'Needs attention':'Review'}</span>${esc(i.text)}</li>`).join('')}</ul><div class="field-grid"><div class="field"><label for="filename">Configuration filename</label><input id="filename" data-project="fileName" value="${esc(project.fileName)}"></div><div class="field"><label for="jar-path">AutoUpgrade JAR path</label><input id="jar-path" data-project="jarPath" value="${esc(project.jarPath)}"></div></div><div class="review-actions"><button id="download-runbook" class="button primary">Download runbook .md</button><button id="copy-runbook" class="button">Copy runbook</button><button id="print-runbook" class="button">Print / PDF</button></div><p class="help">The runbook includes configuration files, terminal commands, interactive console steps and source links. It remains a draft while errors exist.</p><h2 class="section-title">Files in this plan</h2><div class="artifact-list">${r.artifacts.map((a,i)=>`<div><strong>${esc(a.name)}</strong><span>${esc(a.type)}</span><button class="small-button" data-artifact="${i}" ${errors.length?'disabled':''}>Download file</button><details class="artifact-content"><summary>Inspect file</summary><pre>${esc(a.content)}</pre></details></div>`).join('')}</div><h2 class="section-title">Execution sequence</h2><div class="runbook-steps">${r.steps.map((s,i)=>`<section class="runbook-step"><div class="runbook-number">${i+1}</div><div><span class="eyebrow">${esc(s.where)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.code?`<div class="runbook-code"><span class="code-kind">${s.kind==='console'?'Interactive AutoUpgrade console':s.kind==='manual'?'Manual / privileged step':project.execution?.shell==='powershell'?'PowerShell':'POSIX shell'}</span><pre>${esc(s.code)}</pre><button class="small-button" data-copy-step="${i}" ${errors.length?'disabled':''}>Copy step</button></div>`:''}${sourceLinks(s.sources)}</div></section>`).join('')}</div><details class="option-group recovery-tools"><summary>Recovery and diagnostic toolbox — separate operations</summary>${r.toolbox.map((t,i)=>`<h3>${esc(t.title)}</h3><p>${esc(t.text)}</p><pre>${esc(t.code)}</pre><button class="small-button" data-copy-tool="${i}" ${errors.length?'disabled':''}>Copy command</button>`).join('')}</details><p class="setting-note">Profile ${esc(project.profileId)}: selected validators, registries and execution paths inspected. No database, MOS or OS validation is performed by this website.</p>`;
  }
  function reference(query='') {
    const needle=query.toLowerCase();
    return profile().operations[referenceOperation].filter(p=>(p.name+' '+p.help+' '+p.group).toLowerCase().includes(needle)).map(p=>`<article class="reference-entry"><h3><code>${esc(p.name)}</code></h3><p>${esc(p.help)}</p><div class="reference-meta">${esc(p.group)} · ${esc(p.scope)} · ${p.scope==='both'?(p.inherit?'local inherits global value':'global/local values are independent'):p.scope+' only'} · ${esc(p.status)}<br>Declaration default: <code>${esc(p.default??'runtime-derived / not set')}</code>${p.options?'<br>Values: '+esc(p.options.join(', ')):p.type==='boolean'?'<br>Values: YES, NO':''}${p.nested?'<br>Per-PDB suffix supported':''}</div>${p.status==='available'&&referenceOperation===project.operation?`<button class="small-button" data-configure-param="${esc(p.name)}">Configure parameter</button>`:''}</article>`).join('')||'<p>No matching parameters.</p>';
  }
  function guide(section='guides') {
    const tabs=`<div class="mode-choices guide-tabs">${[['guides','Workflow guides'],['parameters','All parameters'],['commands','Commands']].map(([id,label])=>`<button class="button ${section===id?'primary':''}" data-guide-tab="${id}">${label}</button>`).join('')}</div>`;
    const map=`<div class="workflow-map">${Object.entries(C.SCENARIOS).map(([id,s])=>`<div><strong>${esc(s.label)}</strong><span>${esc(s.detail)}</span><code>${s.operation}${s.mode?' / '+s.mode:''}</code></div>`).join('')}</div>`;
    const body=section==='parameters'?`<div class="field"><label for="reference-operation">Parameter catalog</label><select id="reference-operation">${['upgrade','patch'].map(op=>`<option value="${op}" ${op===referenceOperation?'selected':''}>${op} (${profile().operations[op].length} declarations)</option>`).join('')}</select></div><p>Search names, descriptions or groups. Configure entries from the current project operation.</p><label for="reference-search">Parameter name or topic</label><input id="reference-search" type="search" placeholder="oracle_base, gold, standby, stats…"><div id="reference-results">${reference()}</div>`:section==='commands'?W.CLI.map(c=>`<p><code>${esc(c.name)}</code> · ${esc(c.kind)}<br>${esc(c.text)}</p>`).join(''):map+W.GUIDES.map(g=>note(g.id)).join('');
    modal('ALIS field guide',`<p>Inspected AutoUpgrade ${esc(project.profileId)}. Configuration, instructions and sources stay available offline.</p>${tabs}${body}<h3>Further reading</h3>${sourceLinks(W.SOURCES.map(s=>s.id))}`);
  }
  function render() {
    if (active >= project.jobs.length) active = Math.max(0,project.jobs.length-1);
    if (!job()) project.jobs.push({prefix:'upg1',scenario:project.operation==='patch'?'patch':'upgrade',values:{},pdb:{}});
    $('profile-name').innerHTML=profileIds.length===1?esc(project.profileId):`<select id="profile-select" aria-label="AutoUpgrade profile">${profileIds.map(id=>`<option value="${esc(id)}" ${id===project.profileId?'selected':''}>${esc(id)}</option>`).join('')}</select>`;
    $('profile-reviewed').textContent='Inspected '+profile().reviewedDate;
    $('step-nav').innerHTML = steps.map(([label],i) => `<button class="step-link ${step === i ? 'active' : ''}" data-step="${i}" aria-label="${String(i+1).padStart(2,'0')} ${esc(label)}" ${step===i?'aria-current="step"':''}><span class="step-number">${String(i+1).padStart(2,'0')}</span><span class="step-label">${label}</span></button>`).join('');
    $('step-kicker').textContent = String(step+1).padStart(2,'0') + ' / ' + steps[step][0].toUpperCase();
    $('step-title').textContent = steps[step][1]; $('step-intro').textContent = steps[step][2];
    $('active-job').innerHTML = project.jobs.map((j,i)=>`<option value="${i}" ${i===active?'selected':''}>${esc(j.values.sid || j.prefix)}</option>`).join('');
    $('remove-job').disabled = project.jobs.length < 2;
    $('step-content').innerHTML = [plan,database,media,migration,environment,recovery,options,review][step]();
    $('previous').disabled = step === 0; $('next').hidden = step === steps.length-1;
    $('next').textContent = (steps[step+1]?.[0] || 'Review') + ' →'; $('step-count').textContent = `Step ${step+1} of ${steps.length}`;
    if (step === 6) updateAdvanced();
    updatePreview();
  }
  function updatePreview() {
    const config = C.renderConfig(project); const text = view === 'diff' && project.original ? C.diff(project.original,config) : config;
    $('config-preview').innerHTML = text.trimEnd().split('\n').map(line => {
      let cls = '', content = esc(line);
      if (view === 'diff' && project.original) cls = line.startsWith('+ ') ? 'code-added' : line.startsWith('- ') ? 'code-removed' : '';
      else if (line.trim().startsWith('#')) cls='code-comment';
      else { const eq = line.indexOf('='); if (eq>=0) content=`<span class="code-key">${esc(line.slice(0,eq))}</span>=<span class="code-value">${esc(line.slice(eq+1))}</span>`; }
      return `<span class="code-line ${cls}">${content || ' '}</span>`;
    }).join('');
    $('preview-filename').textContent=project.fileName;
    const issues=C.validate(project,profile()), count=issues.filter(i=>i.level==='error').length, warnings=issues.filter(i=>i.level==='warning').length;
    $('validation-status').textContent=count ? `${count} ${count===1?'item':'items'} to resolve before export` : `Static checks pass${warnings ? ' · ' + warnings + ' to review' : ''}`;
    $('validation-status').className=count?'':'ready'; $('download-config').disabled=Boolean(count);
    $('copy-config').disabled=Boolean(count);
    $('download-config').title=count?'Open Review to resolve configuration errors.':'';
    $('analyze-command').textContent=W.previewCommand(project,profile());$('command-label').textContent=softwareOnly()?'SOFTWARE OPERATION':C.initialMode(project)==='analyze'?'FIRST DATABASE CHECK':'SELECTED DATABASE STAGE';
    $('view-diff').disabled=!project.original;
    $('view-config').classList.toggle('active',view==='config'); $('view-diff').classList.toggle('active',view==='diff');
    for (const el of document.querySelectorAll('[data-origin]')) {
      const [scope,name]=el.dataset.origin.split(':'); const map=scope==='g'?project.globals:job().values;
      const def=C.definition(profile(),project.operation,name);
      const eff=scope==='g'?{value:def?.default,source:def?.default==null?'Not explicitly set':'JAR declaration'}:C.effective(project,job(),name,profile());
      el.textContent=Object.hasOwn(map,name)?'Explicit '+(scope==='g'?'global':'local')+' setting':eff.source+(eff.value==null?'':': '+eff.value);
    }
    for (const el of document.querySelectorAll('[data-model]')) { const [s,n]=el.dataset.model.split(':'); const key=(s==='g'?'global':job().prefix)+'.'+n; el.setAttribute('aria-invalid',String(issues.some(i=>i.level==='error'&&i.key===key))); }
  }
  function updateAdvanced() {
    const d=C.describe(C.definition(profile(),project.operation,$('advanced-param').value));
    $('advanced-help').textContent=d.help + (d.options?' Values: '+d.options.join(', ')+'.':'') + (!d.inherit?' Global and local settings are independent.':'');
    const choices=d.scope==='both'?['local','global']:[d.scope]; $('advanced-scope').innerHTML=choices.map(s=>`<option value="${s}">${s==='global'?'All databases':'This database'}</option>`).join('');
  }
  function setValue(map,key,value) { if(value==='')delete map[key];else map[key]=value;dirty=true; }
  function go(next) { step=next;render();$('workspace').focus({preventScroll:true});if(innerWidth<980)$('workspace').scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({top:0,behavior:'instant'}); }
  function saveBlob(text,name,type) { const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
  function saveProject() { saveBlob(JSON.stringify(project,null,2)+'\n','alis-project.json','application/json');dirty=false;toast('Project saved. Keep this file to continue later.'); }
  async function copy(text) { try { if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(text);toast('Copied to clipboard.'); } catch { modal('Copy text',`<div class="field"><label for="copy-fallback">Select and copy the text below</label><textarea id="copy-fallback" readonly>${esc(text)}</textarea></div>`);$('copy-fallback').select(); } }
  function about() { modal('A profile with a paper trail',`<p><strong>AutoUpgrade ${esc(profile().id)}</strong><br>Build ${esc(profile().buildDate)} · reviewed ${esc(profile().reviewedDate)}</p><p>${esc(profile().evidence)}</p><p>Only this exact JAR build has been inspected. A newer JAR needs a new reviewed profile; matching database releases alone is not sufficient.</p><p>JAR SHA-256<br><code>${esc(profile().jarSha256)}</code></p><p><a href="https://github.com/ora600pl/alis/blob/main/docs/PROFILE.md" target="_blank" rel="noopener noreferrer">Profile methodology ↗</a></p><p>Your configuration remains in browser memory. Save a project before closing. The website host still receives normal page requests.</p>`); }
  function removeSetting(key) {
    const first=key.indexOf('.'),prefix=key.slice(0,first),name=key.slice(first+1);
    if(prefix==='global')delete project.globals[name];
    else { const j=project.jobs.find(j=>j.prefix===prefix);if(!j)return; if(Object.hasOwn(j.values,name))delete j.values[name]; else {const dot=name.lastIndexOf('.');delete j.pdb[name.slice(dot+1)]?.[name.slice(0,dot)];} }
    dirty=true;render();
  }
  function acceptImport(text,name,operation) {
    try {
      let next;
      if(name.toLowerCase().endsWith('.json'))next=C.loadProject(text,profiles);
      else { const result=C.parseConfig(text,profile(),operation); if(!result.project.jobs.length)throw new Error('No database entries were found.');next=result.project;next.fileName=/^[A-Za-z0-9_.-]+\.cfg$/.test(name)?name:'autoupgrade.cfg';next.title=name; }
      project=next;active=0;step=7;view='config';dirty=true;$('modal').close();render();toast('Imported locally. Review the preserved settings and diagnostics.');
    }catch(error){toast(error.message);}
  }
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='reference-operation'){referenceOperation=el.value;guide('parameters');return;}
    if(el.id==='reference-search'){$('reference-results').innerHTML=reference(el.value);return;}
    if(el.dataset.execution){project.execution??={};project.execution[el.dataset.execution]=el.value;dirty=true;updatePreview();}
    if(el.dataset.context){job().context??={};job().context[el.dataset.context]=el.value;dirty=true;updatePreview();}
    if(el.id==='profile-select'){project.profileId=el.value;dirty=true;render();toast('Profile changed. Review the configuration against this build.');}
    if(el.dataset.model){const [scope,name]=el.dataset.model.split(':');setValue(scope==='g'?project.globals:job().values,name,el.value);updatePreview();}
    else if(el.dataset.project){project[el.dataset.project]=el.value;dirty=true;updatePreview();}
    else if(el.dataset.pdb){const name=el.dataset.pdb;if(!/^[a-z][a-z0-9_$]*$/i.test(name)||['__proto__','prototype','constructor'].includes(name)){toast('Correct the PDB name first.');return;}if(!Object.hasOwn(job().pdb,name))job().pdb[name]={};setValue(job().pdb[name],el.dataset.pdbKey,el.value);updatePreview();}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='active-job'){active=Number(el.value);render();}
    if(el.dataset.model==='v:pdbs')render();
    if(el.hasAttribute('data-prefix')){
      const old=job().prefix,next=el.value.trim().toLowerCase();
      if(!/^\w+$/.test(next)||['global','__proto__','constructor','prototype'].includes(next)||project.jobs.some(j=>j!==job()&&j.prefix.toLowerCase()===next)){toast('Choose a unique prefix using letters, digits or underscores.');el.value=old;return;}
      job().prefix=next;for(const r of project.records)if(r.key?.startsWith(old+'.')){r.key=next+r.key.slice(old.length);r.raw=r.raw.replace(/^\s*\w+/,next);}dirty=true;render();
    }
    if(el.id==='advanced-param')updateAdvanced();
    if(step===7&&el.dataset.project)render();
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest('button');if(!el)return;
    if(el.dataset.step!=null)go(Number(el.dataset.step));
    if(el.id==='update-pdb-mapping')render();
    if(el.dataset.mode){project.mode=el.dataset.mode;dirty=true;render();}
    if(el.dataset.scenario){C.chooseScenario(project,active,el.dataset.scenario);dirty=true;render();toast('Workflow selected. Existing values are preserved; review any conflicts.');}
    if(el.dataset.patchPreset){setValue(job().values,'patch',el.dataset.patchPreset);render();}
    if(el.dataset.patchToken){const parts=(job().values.patch||'').split(/,\s*/).filter(Boolean);if(!parts.some(p=>p.split(':')[0].toUpperCase()===el.dataset.patchToken))parts.push(el.dataset.patchToken);setValue(job().values,'patch',parts.join(','));render();}
    if(el.id==='apply-patch-version'){const ver=$('patch-version').value.trim();if(!/^\d{2}\.\d{1,2}(\.\d)?$/.test(ver)){toast('Enter a release such as 19.32 or 23.26.3.');return;}let parts=(job().values.patch||'RU').split(/,\s*/);parts=parts.map(p=>/^(RU|RECOMMENDED)(:|$)/i.test(p)?p.split(':')[0]+':'+ver:p);setValue(job().values,'patch',parts.join(','));render();}
    if(el.id==='append-patch-number'){const n=$('patch-number').value.trim();if(!/^\d+$/.test(n)){toast('Enter a numeric patch ID.');return;}setValue(job().values,'patch',(job().values.patch?job().values.patch+',':'')+n);render();}
    if(el.id==='use-own-image'){const name=$('own-image').value.trim();if(!/^[A-Za-z0-9_-]+\.zip$/.test(name)){toast('Use a ZIP basename with letters, numbers, underscores or hyphens.');return;}setValue(job().values,'patch','GOLDIMAGE:'+name);setValue(job().values,'download','NO');render();}
    if(el.id==='guide-button'){referenceOperation=project.operation;guide();}
    if(el.dataset.guideTab)guide(el.dataset.guideTab);
    if(el.id==='load-example'){const scenario=job().scenario;modal('Load an example project?', '<p>This replaces the current draft with synthetic example values. Save your project first if needed.</p><button id="save-example-current" class="button">Save current project</button><button id="confirm-example" class="button primary">Load example</button>');$('save-example-current').onclick=saveProject;$('confirm-example').onclick=()=>{project=W.exampleProject(profile().id,scenario);active=0;step=1;dirty=true;view='config';$('modal').close();go(1);};}
    if(el.dataset.configureParam){const name=el.dataset.configureParam;$('modal').close();go(6);$('advanced-param').value=name;updateAdvanced();$('advanced-value').focus();}
    if(el.id==='download-runbook')saveBlob(W.markdown(project,profile()),'alis-runbook.md','text/markdown;charset=utf-8');
    if(el.id==='copy-runbook')copy(W.markdown(project,profile()));
    if(el.id==='print-runbook')window.print();
    if(el.dataset.artifact!=null&&!C.validate(project,profile()).some(i=>i.level==='error')){const a=W.runbook(project,profile()).artifacts[Number(el.dataset.artifact)];saveBlob(a.content,a.name,'text/plain;charset=utf-8');}
    if(el.dataset.copyStep!=null)copy(W.runbook(project,profile()).steps[Number(el.dataset.copyStep)].code);
    if(el.dataset.copyTool!=null)copy(W.runbook(project,profile()).toolbox[Number(el.dataset.copyTool)].code);
    if(el.dataset.removeSetting)removeSetting(el.dataset.removeSetting);
    if(el.id==='add-setting'){const name=$('advanced-param').value,value=$('advanced-value').value.trim();if(!value){toast('Enter a value to add.');return;}const map=$('advanced-scope').value==='global'?project.globals:job().values;setValue(map,name,value);render();toast('Setting added.');}
  });
  $('previous').onclick=()=>go(Math.max(0,step-1));$('next').onclick=()=>go(Math.min(7,step+1));$('review-issues').onclick=()=>go(7);
  $('save-project').onclick=saveProject;
  document.addEventListener('click',e=>{if(e.target.id==='save-project-review')saveProject();if(e.target.id==='copy-selected-command')copy(C.command(project,project.mode));});
  $('copy-config').onclick=()=>{if(!C.validate(project,profile()).some(i=>i.level==='error'))copy(C.renderConfig(project));};
  $('copy-command').onclick=()=>copy(W.previewCommand(project,profile()));
  $('download-config').onclick=()=>{if(C.validate(project,profile()).some(i=>i.level==='error')){go(7);return;}saveBlob(C.renderConfig(project),project.fileName,'text/plain;charset=utf-8');toast('Download requested. Follow the matching runbook for this workflow.');};
  $('view-config').onclick=()=>{view='config';updatePreview();};$('view-diff').onclick=()=>{view='diff';updatePreview();};
  $('profile-details').onclick=about;$('close-modal').onclick=()=>$('modal').close();
  $('add-job').onclick=()=>{let n=1;const selected=job().scenario;const stem=softwareOnly()?(project.mode==='download'?'download':'install'):project.operation==='patch'?'patch':'upg';while(project.jobs.some(j=>j.prefix===stem+n))n++;project.jobs.push({prefix:stem+n,scenario:selected,values:{},pdb:{}});active=project.jobs.length-1;dirty=true;go(1);};
  $('remove-job').onclick=()=>{if(project.jobs.length<2)return;modal('Remove this database?',`<p>Remove ${esc(job().prefix)} and its settings from this project?</p><button id="confirm-remove" class="button primary">Remove database</button>`);$('confirm-remove').onclick=()=>{const prefix=job().prefix;project.jobs.splice(active,1);project.records=project.records.filter(r=>!r.key?.startsWith(prefix+'.'));active=0;dirty=true;$('modal').close();go(1);};};
  $('new-project').onclick=()=>{modal('Start a new project?',`<p>Save the current project if you want to continue it later.</p><button id="save-before-new" class="button">Save current project</button><button id="confirm-new" class="button primary">Start new project</button>`);$('save-before-new').onclick=saveProject;$('confirm-new').onclick=()=>{project=C.newProject(profile().id);active=step=0;view='config';dirty=false;$('modal').close();go(0);};};
  $('import-button').onclick=()=>{modal('Import a configuration or project',`<p>The file is read locally. Import replaces the current project.</p><div class="field"><label for="import-operation">Configuration operation</label><select id="import-operation"><option value="upgrade">Upgrade / PDB migration</option><option value="patch">Software installation / download / patching (-patch)</option></select><span class="help">A .cfg file does not reliably encode its operation. ALIS projects remember it.</span></div><button id="save-before-import" class="button">Save current project</button><button id="choose-file" class="button primary">Choose file</button>`);$('save-before-import').onclick=saveProject;$('choose-file').onclick=()=>$('import-file').click();};
  $('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;if(file.size>1000000){toast('Choose a file smaller than 1 MB.');return;}const op=$('import-operation')?.value||project.operation;const text=await file.text();$('import-file').value='';acceptImport(text,file.name,op);};
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  render();
  // Optional browser-native agent integration. Uses the same model and validation as the UI.
  if(document.modelContext?.registerTool){
    const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});
    const tools=[{name:'inspect_configuration',title:'Inspect ALIS configuration',description:'Read the current draft configuration and static validation results. Does not export or execute anything.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Expected an empty object.');return{profile:project.profileId,operation:project.operation,mode:project.mode,configuration:C.renderConfig(project),issues:C.validate(project,profile()),runbook:W.runbook(project,profile())};}}];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{/* Optional browser API. */}}
  }
})();
