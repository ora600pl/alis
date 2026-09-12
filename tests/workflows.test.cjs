const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../site/assets/core.js');
const W=require('../site/assets/workflows.js');
const profile=require('../profiles/26.5.260807.json');
const example=(scenario='install')=>W.exampleProject(profile.id,scenario);
const errors=p=>C.validate(p,profile).filter(i=>i.level==='error');
const has=(p,code)=>C.validate(p,profile).some(i=>i.code===code);
const shell=p=>W.runbook(p,profile).steps.filter(s=>s.kind==='shell').map(s=>s.code).join('\n');
const fixture={
  'global.global_log_dir':'/home/oracle/oinstall/autoupgrade/logs',
  'global.keystore':'/home/oracle/oinstall/autoupgrade/keystore',
  'install1.folder':'/home/oracle/oinstall/autoupgrade/patches',
  'install1.target_home':'/u01/app/oracle/product/dbhome_1',
  'install1.home_settings.oracle_base':'/u01/app/oracle',
  'install1.home_settings.edition':'EE',
  'install1.home_settings.inventory_location':'/u01/app/oraInventory',
  'install1.download':'yes',
  'install1.target_version':'19',
  'install1.patch':'RU,OPATCH,OCW'
};
test('requested empty-server configuration imports, validates and round-trips exactly',()=>{
  const text=Object.entries(fixture).map(([k,v])=>k+'='+v).join('\n')+'\n';
  const p=C.parseConfig(text,profile,'patch').project;
  assert.equal(p.mode,'create_home');assert.equal(p.jobs[0].scenario,'install');assert.deepEqual(errors(p),[]);
  assert.equal(C.renderConfig(p),text);assert.deepEqual(Object.fromEntries(C.entries(p)),fixture);
  const commands=shell(p);assert(commands.includes('-patch -config'));assert(commands.includes('-load_password'));
  assert(commands.indexOf('-mode download')<commands.indexOf('-mode create_home'));
  assert(!/-mode (analyze|deploy|fixups|upgrade)/.test(commands));
  assert(!C.renderConfig(p).includes('.sid='));assert(!C.renderConfig(p).includes('.source_home='));
});
for(const scenario of Object.keys(C.SCENARIOS))test('complete example and project round-trip: '+scenario,()=>{
  const p=example(scenario);assert.deepEqual(errors(p),[]);
  assert.deepEqual(C.loadProject(JSON.stringify(p),{[profile.id]:profile}),p);
  const r=W.runbook(p,profile);assert(r.steps.length>=4);assert.equal(r.artifacts[0].content,C.renderConfig(p));
  for(const a of r.artifacts){const parsed=C.parseConfig(a.content,profile,a.type==='source configuration'?'upgrade':p.operation).project;assert.deepEqual(Object.fromEntries(C.entries(parsed)),Object.fromEntries(C.entries(a.type==='source configuration'?W.sourceProject(p,profile):p)));}
});
for(const scenario of Object.keys(C.SCENARIOS).filter(s=>C.SCENARIOS[s].group!=='Prepare software'))for(const mode of C.modesFor(scenario))test('stage-specific runbook: '+scenario+' / '+mode,()=>{
  const p=example(scenario);p.mode=mode;assert.deepEqual(errors(p),[]);
  const commands=shell(p);
  if(mode==='analyze')assert(!/-mode (fixups|deploy|upgrade|postfixups|create_home)/.test(commands));
  if(mode==='fixups')assert(!/-mode (deploy|upgrade|postfixups|create_home)/.test(commands));
  if(['upgrade','postfixups'].includes(mode)){assert(commands.includes('-mode '+mode));assert(!commands.includes('-mode deploy'));assert(!commands.includes('-mode analyze'));}
});
test('offline installation omits MOS and download, retains create_home and installation gates',()=>{const p=example();p.jobs[0].values.download='NO';const text=shell(p);assert(!text.includes('-load_password'));assert(!text.includes('-mode download'));assert(text.includes('-mode create_home'));assert(W.runbook(p,profile).steps.some(s=>s.title.includes('privileged')));});
test('download workflow stages tools and numeric GI patches without creating a home or database',()=>{const p=example('download');p.jobs[0].values.patch='TOOLS,39000001';assert.deepEqual(errors(p),[]);const text=shell(p);assert(text.includes('-mode download'));assert(!/-mode (create_home|deploy|analyze)/.test(text));assert(!W.runbook(p,profile).toolbox.some(t=>/restore -jobs|rollback/.test(t.code)));});
test('fresh-home mode cannot silently become deploy',()=>{const p=example();p.mode='deploy';assert(has(p,'workflow-mode'));assert(has(p,'required'));});
test('fresh installation needs explicit edition and base; inherited installation needs source',()=>{const p=example();delete p.jobs[0].values['home_settings.edition'];assert(has(p,'new-home'));const q=example('prepare_home');delete q.jobs[0].values.source_home;assert(has(q,'source-settings'));});
test('folder aliases conflict only when their values differ',()=>{const p=example();p.jobs[0].values.download_folder=p.jobs[0].values.folder;assert(!has(p,'folder-conflict'));p.jobs[0].values.download_folder='/different';assert(has(p,'folder-conflict'));});
test('home and image placeholders support multiple occurrences and reject unknown/unbalanced forms',()=>{const p=example('gold_create');p.jobs[0].values.target_home='/u01/db_%RELEASE%_%UPDATE%';assert.deepEqual(errors(p),[]);for(const value of ['image_%BOGUS%.zip','image_%DATE.zip']){p.jobs[0].values.create_gold_image=value;assert(has(p,'gold-name'));}p.jobs[0].values.target_home='/u01/%BOGUS%';assert(has(p,'home-placeholder'));});
test('custom Gold Image is named, exclusive and cannot be downloaded or recaptured',()=>{const p=example('gold_use');for(const value of ['GOLDIMAGE','GOLDIMAGE:/tmp/home.zip','GOLDIMAGE:home.zip,RU']){p.jobs[0].values.patch=value;assert(errors(p).length>0);}p.jobs[0].values.patch='GOLDIMAGE:home.zip';p.jobs[0].values.create_gold_image='YES';assert(has(p,'gold-conflict'));delete p.jobs[0].values.create_gold_image;p.mode='download';assert(has(p,'gold-download'));});
test('custom Gold Image preparation has no MOS step and retains local archive selection',()=>{const p=example('gold_use');assert(!shell(p).includes('-load_password'));assert(!shell(p).includes('-mode download'));assert(C.renderConfig(p).includes('GOLDIMAGE:db_home_19_32.zip'));});
test('registered patch aliases and pinned syntax match the reviewed expression grammar',()=>{for(const alias of ['RECOMMENDED','TOOLS','DPBP','CSPU','JDK','MRP','OCW','OJVM','OPATCH','RU','AU','SQLCL','AHF','CVU','SDOBP','TEXT','12345678','RU:19.32','RU:23.26.3','OJVM:19.32','OCW:19.32','GOLDIMAGE:db_home.zip'])assert(!C.patchParts(alias).some(p=>p.error),alias);for(const invalid of ['BASE_IMAGE','GIRU','TZ','RU:26.3.123','OPATCH:19.32','MRP:19.32','GOLDIMAGE:bad.name.zip'])assert(C.patchParts(invalid).some(p=>p.error),invalid);});
test('patch releases, OJVM and RU version relationships are checked even with only a pinned RU',()=>{const p=example();p.jobs[0].values.target_version='26';p.jobs[0].values.patch='RU:23.26.3,OJVM';assert(has(p,'ojvm'));delete p.jobs[0].values.target_version;assert(has(p,'ojvm'));p.jobs[0].values.patch='RU:19.32,OJVM:19.31';assert(has(p,'ojvm-ru'));p.jobs[0].values.target_version='21';p.jobs[0].values.patch='RU,DPBP';assert(has(p,'patch-release'));});
test('MRP and Oracle Linux 9 boundaries are enforced',()=>{const p=example();p.jobs[0].values.patch='RU:19.16,MRP';assert(has(p,'mrp-version'));p.jobs[0].values.patch='RU:19.17,MRP';assert(!has(p,'mrp-version'));p.jobs[0].values.platform='ARM.X64';assert(has(p,'mrp-platform'));p.jobs[0].context={os:'ol9'};assert(has(p,'ol9'));p.jobs[0].values.platform='LINUX.X64';p.jobs[0].values.patch='RU:19.22,MRP';assert.deepEqual(errors(p),[]);p.jobs[0].values.target_version='26';p.jobs[0].values.patch='RU:23.25.1,MRP';assert(has(p,'mrp-version'));p.jobs[0].values.patch='RU:23.26.3,MRP';assert.deepEqual(errors(p),[]);});
test('explicit Oracle Update Advisor images have release/platform restrictions; AUTO can fall back',()=>{const p=example('download');Object.assign(p.jobs[0].values,{gold_image:'YES',platform:'ARM.X64'});assert(has(p,'gold-service-platform'));p.jobs[0].values.platform='LINUX.X64';p.jobs[0].values.target_version='21';assert(has(p,'gold-service-version'));p.jobs[0].values.gold_image='AUTO';assert(!has(p,'gold-service-version'));});
test('database patching rejects major upgrades but software preparation permits them',()=>{const p=example('patch');p.jobs[0].context={sourceVersion:'19'};p.jobs[0].values.target_version='26';assert(has(p,'patch-upgrade'));p.mode='create_home';assert(!has(p,'patch-upgrade'));});
test('rolling topology and physical-standby mode restrictions',()=>{const p=example('patch');p.jobs[0].values.rac_rolling='REQUIRED';p.jobs[0].context={os:'windows',topology:'single'};assert(has(p,'rolling-windows'));assert(has(p,'rolling-single'));p.jobs[0].context={role:'standby'};p.mode='fixups';assert(has(p,'standby-mode'));p.mode='deploy';assert(!has(p,'standby-mode'));});
test('integrated upgrade home creation requires its media, target and version',()=>{const p=example('upgrade');p.jobs[0].values.create_oracle_home='YES';assert(has(p,'upgrade-home'));p.jobs[0].values.folder='/media';assert(!has(p,'upgrade-home'));delete p.jobs[0].values.target_version;assert(has(p,'upgrade-home'));});
test('remote source preparation uses the actual source path in a distinct artifact',()=>{const p=example('refreshable');p.jobs[0].values.source_home='/tmp';p.jobs[0].context={location:'remote'};assert(has(p,'source-runbook'));p.jobs[0].context.sourceOracleHome='/u01/source19';assert.deepEqual(errors(p),[]);const source=W.sourceProject(p,profile);assert.deepEqual(errors(source),[]);assert.equal(source.jobs[0].values.source_home,'/u01/source19');assert.equal(source.fileName,'refreshable.source.cfg');assert(!C.renderConfig(source).includes('source_home=/tmp'));assert(!shell(p).includes("'refreshable.cfg' -mode analyze"));});
test('periodic clone fixes source after starting refresh and before proceed',()=>{const p=example('refreshable');p.mode='deploy';const r=W.runbook(p,profile);const start=r.steps.findIndex(s=>s.code.includes('-mode deploy')),fix=r.steps.findIndex(s=>s.code.includes('-mode fixups')),proceed=r.steps.findIndex(s=>s.code.includes('proceed -job'));assert(start>=0&&fix>start&&proceed>fix);});
test('one-time PDB and non-CDB clones fix the source before cloning and have no proceed stage',()=>{for(const scenario of ['refreshable','refreshable_noncdb']){const p=example(scenario);p.mode='deploy';if(scenario==='refreshable')p.jobs[0].pdb.sales.source_dblink='CLONE_SALES';else p.jobs[0].values.source_dblink='CLONE_LEGACY';assert.deepEqual(errors(p),[]);const r=W.runbook(p,profile),start=r.steps.findIndex(s=>s.code.includes('-mode deploy')),fix=r.steps.findIndex(s=>s.code.includes('-mode fixups'));assert(fix>=0&&start>fix);assert(!r.steps.some(s=>s.code.includes('proceed -job')));}});
test('staged remote deploy separates source and target; postfixups does not redo the move',()=>{const p=example('upgrade');p.mode='deploy';p.jobs[0].values.target_is_remote='YES';assert(shell(p).includes('-mode fixups'));assert(shell(p).includes('-mode upgrade'));assert(!shell(p).includes('-mode deploy'));p.mode='postfixups';assert(shell(p).includes('-mode postfixups'));assert(!shell(p).includes('-mode upgrade'));assert(!shell(p).includes('-mode fixups'));});
test('MOS loader receives only username/optional CSI and configured auto-login instructions',()=>{const p=example();p.execution={mosUser:'dba@example.com',csi:'12345',autologin:'SHARED'};const r=W.runbook(p,profile),dialogue=r.steps.find(s=>s.kind==='console');assert.equal(dialogue.code,'add -user dba@example.com\nadd -csi 12345\nlist\nsave\nexit');assert(dialogue.text.includes('SHARED'));assert(!C.renderConfig(p).includes('dba@example.com'));});
test('execution choices, unsafe source paths and job IDs cannot inject unquoted commands or config lines',()=>{for(const e of [{jobIds:'1;id'},{mosUser:'user\nexit'},{shell:'cmd'},{restoreOnFail:'MAYBE'}]){const p=example();p.execution=e;assert(errors(p).length>0);}const p=example('refreshable');p.jobs[0].context={location:'remote',sourceOracleHome:'/tmp/home#comment'};assert(has(p,'context-path'));p.jobs[0].context={topology:'imaginary'};assert(has(p,'context'));});
test('PowerShell and POSIX quote apostrophes without command substitution',()=>{const p=example();p.execution={shell:'powershell',javaPath:"C:\\Java's\\java.exe",settingsPath:"C:\\AU's\\settings.properties"};p.jarPath="C:\\AU's\\autoupgrade.jar";assert(C.command(p,'create_home').startsWith("& 'C:\\Java''s\\java.exe'"));assert(C.command(p).includes("-settings 'C:\\AU''s\\settings.properties'"));p.execution.shell='posix';assert(C.command(p).includes("Java'\\''s"));});
test('Markdown contains both clone configuration files, console instructions and profile provenance',()=>{const p=example('refreshable');p.mode='deploy';const text=W.markdown(p,profile);assert(text.includes('## File: refreshable.source.cfg'));assert(text.includes('## File: refreshable.cfg'));assert(text.includes('proceed -job JOB_ID'));assert(text.includes(profile.id));assert(text.includes('https://dohdatabase.com/'));});
test('every declaration has help, an evidence note and a human-readable label',()=>{for(const list of Object.values(profile.operations))for(const param of list){assert(param.help?.length>10,param.name);assert(param.label?.length>1,param.name);assert(param.evidence,param.name);}});

test('preview points to source preparation for clones and preserves explicit target stages',()=>{const p=example('refreshable');assert(W.previewCommand(p,profile).includes("'refreshable.source.cfg' -mode analyze"));p.mode='postfixups';assert(W.previewCommand(p,profile).includes("'refreshable.cfg' -mode postfixups"));});
test('Windows credentials follow OS context, not a shell preference',()=>{const p=example('upgrade');p.execution={shell:'powershell'};assert(!shell(p).includes('-load_win_credential'));p.jobs[0].context={os:'windows'};assert(shell(p).includes("-load_win_credential 'CDB19'"));});
