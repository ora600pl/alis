(function () {
  'use strict';
  const C = Augur, profiles = AUGUR_PROFILES;
  const profileIds=Object.keys(profiles).sort((a,b)=>profiles[b].buildDate.localeCompare(profiles[a].buildDate)||b.localeCompare(a));
  let project = C.newProject(profileIds[0]), active = 0, step = 0, view = 'config', dirty = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const profile = () => profiles[project.profileId];
  const job = () => project.jobs[active];
  const steps = [
    ['Plan', 'Every good upgrade starts with a plan.', 'Choose your path. AUGUR will bring the right settings into focus.'],
    ['Database', 'Give your database a destination.', 'Enter paths on the Oracle server. Your local filesystem is never inspected.'],
    ['Migration', 'Map the move, PDB by PDB.', 'Keep source names, target names and data file choices together.'],
    ['Recovery', 'Make the recovery decisions explicit.', 'Understand what each setting requests before it becomes part of your configuration.'],
    ['Options', 'The details that make it yours.', 'Add shared settings, scripts and advanced parameters from the inspected profile.'],
    ['Review', 'One last look before the first check.', 'Resolve configuration errors, review warnings and take the file to your Oracle server.']
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
  function plan() {
    return `<h2 class="section-title">What are you preparing?</h2><div class="scenario-grid">${Object.entries(C.SCENARIOS).map(([key,s]) => `<button class="scenario-card ${job().scenario === key ? 'selected' : ''}" data-scenario="${key}" aria-pressed="${job().scenario === key}"><i class="radio-mark" aria-hidden="true"></i><strong>${esc(s.label)}</strong><span>${esc(s.detail)}</span></button>`).join('')}</div><h2 class="section-title">AutoUpgrade mode</h2><div class="mode-choices">${C.MODES[project.operation].map(mode => `<button class="mode-choice ${project.mode === mode ? 'active' : ''}" data-mode="${mode}" aria-pressed="${project.mode === mode}">${mode}</button>`).join('')}</div><div class="setting-note"><strong>${project.mode === 'analyze' ? 'Start with a readiness check.' : 'This selection prepares a command; it does not run it.'}</strong> ${project.mode === 'analyze' ? 'Analyze uses the source database to check readiness. AUGUR only builds the configuration.' : 'Review the generated file and run analyze on your server before any operation that changes the database.'}</div><div class="field-grid"><div class="field wide"><label for="project-title">Project name</label><input id="project-title" data-project="title" value="${esc(project.title)}" maxlength="100"></div></div>`;
  }
  function database() {
    return `<div class="field-grid"><div class="field"><label for="prefix">Configuration prefix</label><input id="prefix" data-prefix value="${esc(job().prefix)}" placeholder="upg1" spellcheck="false"><span class="help">A unique label for this database’s settings.</span></div>${field('sid')}${field('source_home','v',true)}${field('target_home','v',true)}${field('target_version','v',false,project.operation === 'upgrade' ? {options:profile().targetVersions} : {})}${field('start_time')}${field('global_log_dir','g',true)}${project.operation === 'patch' ? field('download_folder','v',true) + field('patch') + field('download') : ''}</div>`;
  }
  function pdbField(pdb, name, label, placeholder, options = null) {
    const value = job().pdb[pdb]?.[name] || ''; const id = 'p-' + pdb + '-' + name;
    const data = `data-pdb="${esc(pdb)}" data-pdb-key="${esc(name)}"`;
    return `<div class="field ${name !== 'target_pdb_name' && name !== 'keep_source_pdb' ? 'wide' : ''}"><label for="${esc(id)}">${label}<code>${esc(job().prefix + '.' + name + '.' + pdb)}</code></label>${options ? `<select id="${esc(id)}" ${data}><option value="">AutoUpgrade default</option>${options.map(o=>`<option ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input id="${esc(id)}" ${data} value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false">`}</div>`;
  }
  function migration() {
    if (['upgrade','patch'].includes(job().scenario)) return `<div class="setting-note"><strong>No PDB move in this scenario.</strong> The current plan ${job().scenario === 'patch' ? 'patches the database' : 'upgrades the database in its target home'}. Choose a migration scenario in Plan to configure a target CDB and PDB mapping.</div>`;
    let html = `<div class="field-grid">${field('target_cdb','v',true)}`;
    if (job().scenario === 'noncdb') html += field('target_pdb_name') + field('target_pdb_copy_option','v',true);
    else html += field('pdbs','v',true) + '<div class="field wide"><button id="update-pdb-mapping" class="button">Update PDB mapping</button></div>';
    html += `</div>`;
    if (job().scenario === 'noncdb') return html + '<div class="setting-note">Recovery after conversion has different requirements from a normal database upgrade. Verify the backup and restoration procedure for the target PDB.</div>';
    const pdbs = C.list(job().values.pdbs);
    if (!pdbs.length) return html + '<p class="empty-message">Enter source PDB names above, then update the mapping to configure their destinations.</p>';
    for (const pdb of pdbs) {
      html += `<section class="pdb-block"><h3>${esc(pdb.toUpperCase())}</h3><div class="field-grid">${pdbField(pdb,'target_pdb_name','Target name',pdb.toUpperCase())}${job().scenario === 'unplug' ? pdbField(pdb,'keep_source_pdb','Keep source PDB','',['YES','NO']) : ''}${pdbField(pdb,'target_pdb_copy_option','Copy data files',"file_name_convert=('/old/','/new/')")}${job().scenario === 'refreshable' ? pdbField(pdb,'source_dblink','Database link and refresh interval','CLONE_' + pdb.toUpperCase() + ' 600') : ''}</div></section>`;
    }
    return html + '<div class="setting-note">A copy clause requests copying data files. For ASM/OMF use <code>file_name_convert=none</code>. Verify the destination and available space on the server.</div>';
  }
  function recovery() {
    return `<div class="field-grid">${field('restoration')}${project.operation === 'upgrade' ? field('drop_grp_after_upgrade') + field('raise_compatible','v',true,{placeholder:'NO, YES or a release such as 23.4'}) : field('drop_grp_after_patching')}${field('timezone_upg')}${field('run_utlrp')}${field('dictionary_stats_before')}${field('dictionary_stats_after')}${field('fixed_stats_before')}${field('keystore','g',true)}</div><div class="setting-note"><strong>A requested restore point is not a backup guarantee.</strong> AutoUpgrade can change recovery behavior for particular editions and migration types. Load passwords using its keystore on the database server; never add passwords to a configuration file.</div>`;
  }
  function options() {
    const ps = profile().operations[project.operation].filter(p => p.status === 'available');
    return `<div class="field-grid">${field('before_action','v',true)}${field('after_action','v',true)}${project.operation === 'upgrade' ? field('upgrade_node') + field('manage_network_files') + field('catctl_options','v',true) : field('patch_node') + field('method')}</div><section class="advanced-add"><h2>Advanced settings</h2><p class="intro">Add a local parameter, or a global value shared by all databases. Imported settings remain visible here.</p><div class="field-grid"><div class="field wide"><label for="advanced-param">Parameter</label><select id="advanced-param">${ps.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label for="advanced-scope">Scope</label><select id="advanced-scope"><option value="local">This database</option><option value="global">All databases</option></select></div><div class="field"><label for="advanced-value">Value</label><input id="advanced-value" spellcheck="false" placeholder="Explicit value"></div></div><p id="advanced-help" class="setting-note"></p><button id="add-setting" class="button">Add setting</button></section><h2 class="section-title">Explicit settings</h2><div id="explicit-settings">${C.entries(project).map(([key,value]) => `<div class="extra-row"><div><code>${esc(key)}</code><div class="extra-value">${esc(value)}</div></div><button class="small-button" data-remove-setting="${esc(key)}" aria-label="Remove ${esc(key)}">Remove</button></div>`).join('') || '<p class="empty-message">No explicit settings.</p>'}</div><details class="catalog"><summary>Inspect the complete ${project.operation} parameter catalog</summary><div class="catalog-wrap"><table><thead><tr><th>Parameter</th><th>Scope</th><th>Profile status</th></tr></thead><tbody>${profile().operations[project.operation].map(p=>`<tr><td><code>${esc(p.name)}</code></td><td>${p.scope}${p.nested ? ' / PDB' : ''}</td><td class="status">${p.status === 'available' ? 'Registered' : p.status === 'unsupported' ? 'Unsupported' : 'Unverified'}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function review() {
    const issues = C.validate(project,profile()); const errors = issues.filter(i=>i.level==='error');
    return `${!errors.length ? '<div class="success-note">The implemented static checks pass. The next step is AutoUpgrade analyze on your database server.</div>' : '<h2 class="section-title">Resolve ' + errors.length + ' configuration ' + (errors.length===1?'error':'errors') + '</h2>'}<ul class="review-list">${issues.map(i=>`<li class="${i.level}"><span class="issue-label">${i.level === 'error' ? 'Needs attention' : 'Review'}</span>${esc(i.text)}</li>`).join('')}</ul><h2 class="section-title">Export settings</h2><div class="field-grid"><div class="field"><label for="filename">Configuration filename</label><input id="filename" data-project="fileName" value="${esc(project.fileName)}" spellcheck="false"></div><div class="field"><label for="jar-path">AutoUpgrade JAR path</label><input id="jar-path" data-project="jarPath" value="${esc(project.jarPath)}" spellcheck="false"></div></div><div class="setting-note"><strong>Selected command · ${esc(project.mode)}</strong><br><code>${esc(C.command(project,project.mode))}</code><br>Commands are prepared for a POSIX shell. AUGUR does not execute them.</div><div class="review-actions"><button id="copy-selected-command" class="button">Copy ${esc(project.mode)} command</button><button id="save-project-review" class="button">Save project</button><a class="button" href="offline.html" download="augur-offline.html">Offline edition ↓</a></div><p class="setting-note">Profile ${esc(project.profileId)} is based on the inspected JAR, selected validators and isolated parser probes. Static success does not verify Oracle homes, database state, topology, patch availability or recovery readiness.</p>`;
  }
  function render() {
    if (active >= project.jobs.length) active = Math.max(0,project.jobs.length-1);
    if (!job()) project.jobs.push({prefix:'upg1',scenario:project.operation==='patch'?'patch':'upgrade',values:{},pdb:{}});
    $('profile-name').innerHTML=profileIds.length===1?esc(project.profileId):`<select id="profile-select" aria-label="AutoUpgrade profile">${profileIds.map(id=>`<option value="${esc(id)}" ${id===project.profileId?'selected':''}>${esc(id)}</option>`).join('')}</select>`;
    $('profile-reviewed').textContent='Inspected '+profile().reviewedDate;
    $('step-nav').innerHTML = steps.map(([label],i) => `<button class="step-link ${step === i ? 'active' : ''}" data-step="${i}" ${step===i?'aria-current="step"':''}><span class="step-number">${String(i+1).padStart(2,'0')}</span><span class="step-label">${label}</span></button>`).join('');
    $('step-kicker').textContent = String(step+1).padStart(2,'0') + ' / ' + steps[step][0].toUpperCase();
    $('step-title').textContent = steps[step][1]; $('step-intro').textContent = steps[step][2];
    $('active-job').innerHTML = project.jobs.map((j,i)=>`<option value="${i}" ${i===active?'selected':''}>${esc(j.values.sid || j.prefix)}</option>`).join('');
    $('remove-job').disabled = project.jobs.length < 2;
    $('step-content').innerHTML = [plan,database,migration,recovery,options,review][step]();
    $('previous').disabled = step === 0; $('next').hidden = step === steps.length-1;
    $('next').textContent = (steps[step+1]?.[0] || 'Review') + ' →'; $('step-count').textContent = `Step ${step+1} of ${steps.length}`;
    if (step === 4) updateAdvanced();
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
    $('analyze-command').textContent=C.command(project);
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
  function go(next) { step=next;render();$('workspace').focus({preventScroll:true});if(innerWidth<980)$('workspace').scrollIntoView({behavior:'instant',block:'start'}); }
  function saveBlob(text,name,type) { const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
  function saveProject() { saveBlob(JSON.stringify(project,null,2)+'\n','augur-project.json','application/json');dirty=false;toast('Project saved. Keep this file to continue later.'); }
  async function copy(text) { try { if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(text);toast('Copied to clipboard.'); } catch { modal('Copy text',`<div class="field"><label for="copy-fallback">Select and copy the text below</label><textarea id="copy-fallback" readonly>${esc(text)}</textarea></div>`);$('copy-fallback').select(); } }
  function about() { modal('A profile with a paper trail',`<p><strong>AutoUpgrade ${esc(profile().id)}</strong><br>Build ${esc(profile().buildDate)} · reviewed ${esc(profile().reviewedDate)}</p><p>${esc(profile().evidence)}</p><p>Only this exact JAR build has been inspected. A newer JAR needs a new reviewed profile; matching database releases alone is not sufficient.</p><p>JAR SHA-256<br><code>${esc(profile().jarSha256)}</code></p><p><a href="https://github.com/ora600pl/augur/blob/main/docs/PROFILE.md" target="_blank" rel="noopener noreferrer">Profile methodology ↗</a></p><p>Your configuration remains in browser memory. Save a project before closing. The website host still receives normal page requests.</p>`); }
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
      project=next;active=0;step=5;view='config';dirty=true;$('modal').close();render();toast('Imported locally. Review the preserved settings and diagnostics.');
    }catch(error){toast(error.message);}
  }
  document.addEventListener('input',event=>{
    const el=event.target;
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
    if(step===5&&el.dataset.project)render();
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest('button');if(!el)return;
    if(el.dataset.step!=null)go(Number(el.dataset.step));
    if(el.id==='update-pdb-mapping')render();
    if(el.dataset.mode){project.mode=el.dataset.mode;dirty=true;render();}
    if(el.dataset.scenario){
      const scenario=el.dataset.scenario,op=C.SCENARIOS[scenario].operation;
      if(op!==project.operation){project.operation=op;if(!C.MODES[op].includes(project.mode))project.mode='analyze';for(const j of project.jobs)j.scenario=op==='patch'?'patch':'upgrade';toast('Operation changed. Existing settings are preserved; review incompatible parameters.');}
      job().scenario=scenario;dirty=true;render();
    }
    if(el.dataset.removeSetting)removeSetting(el.dataset.removeSetting);
    if(el.id==='add-setting'){const name=$('advanced-param').value,value=$('advanced-value').value.trim();if(!value){toast('Enter a value to add.');return;}const map=$('advanced-scope').value==='global'?project.globals:job().values;setValue(map,name,value);render();toast('Setting added.');}
  });
  $('previous').onclick=()=>go(Math.max(0,step-1));$('next').onclick=()=>go(Math.min(5,step+1));$('review-issues').onclick=()=>go(5);
  $('save-project').onclick=saveProject;
  document.addEventListener('click',e=>{if(e.target.id==='save-project-review')saveProject();if(e.target.id==='copy-selected-command')copy(C.command(project,project.mode));});
  $('copy-config').onclick=()=>{if(!C.validate(project,profile()).some(i=>i.level==='error'))copy(C.renderConfig(project));};
  $('copy-command').onclick=()=>copy(C.command(project));
  $('download-config').onclick=()=>{if(C.validate(project,profile()).some(i=>i.level==='error')){go(5);return;}saveBlob(C.renderConfig(project),project.fileName,'text/plain;charset=utf-8');toast('Configuration downloaded. Run analyze on the database server.');};
  $('view-config').onclick=()=>{view='config';updatePreview();};$('view-diff').onclick=()=>{view='diff';updatePreview();};
  $('profile-details').onclick=about;$('close-modal').onclick=()=>$('modal').close();
  $('add-job').onclick=()=>{let n=1;const stem=project.operation==='patch'?'patch':'upg';while(project.jobs.some(j=>j.prefix===stem+n))n++;project.jobs.push({prefix:stem+n,scenario:project.operation==='patch'?'patch':'upgrade',values:{},pdb:{}});active=project.jobs.length-1;dirty=true;go(1);};
  $('remove-job').onclick=()=>{if(project.jobs.length<2)return;modal('Remove this database?',`<p>Remove ${esc(job().prefix)} and its settings from this project?</p><button id="confirm-remove" class="button primary">Remove database</button>`);$('confirm-remove').onclick=()=>{const prefix=job().prefix;project.jobs.splice(active,1);project.records=project.records.filter(r=>!r.key?.startsWith(prefix+'.'));active=0;dirty=true;$('modal').close();render();};};
  $('new-project').onclick=()=>{modal('Start a new project?',`<p>Save the current project if you want to continue it later.</p><button id="save-before-new" class="button">Save current project</button><button id="confirm-new" class="button primary">Start new project</button>`);$('save-before-new').onclick=saveProject;$('confirm-new').onclick=()=>{project=C.newProject(profile().id);active=step=0;view='config';dirty=false;$('modal').close();render();};};
  $('import-button').onclick=()=>{modal('Import a configuration or project',`<p>The file is read locally. Import replaces the current project.</p><div class="field"><label for="import-operation">Configuration operation</label><select id="import-operation"><option value="upgrade">Upgrade / PDB migration</option><option value="patch">Patching (-patch)</option></select><span class="help">A .cfg file does not reliably encode its operation. AUGUR projects remember it.</span></div><button id="save-before-import" class="button">Save current project</button><button id="choose-file" class="button primary">Choose file</button>`);$('save-before-import').onclick=saveProject;$('choose-file').onclick=()=>$('import-file').click();};
  $('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;if(file.size>1000000){toast('Choose a file smaller than 1 MB.');return;}const op=$('import-operation')?.value||project.operation;const text=await file.text();$('import-file').value='';acceptImport(text,file.name,op);};
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  render();
  // Optional browser-native agent integration. Uses the same model and validation as the UI.
  if(document.modelContext?.registerTool){
    const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});
    const tools=[{name:'inspect_configuration',title:'Inspect AUGUR configuration',description:'Read the current draft configuration and static validation results. Does not export or execute anything.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Expected an empty object.');return{profile:project.profileId,operation:project.operation,mode:project.mode,configuration:C.renderConfig(project),issues:C.validate(project,profile())};}}];
    for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{/* Optional browser API. */}}
  }
})();
