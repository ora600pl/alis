const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../site/assets/core.js'),W=require('../site/assets/workflows.js');
const profiles=[require('../profiles/26.5.260807.json'),require('../profiles/26.6.260925.json')];
const example=(scenario,profile)=>W.exampleProject(profile.id,scenario);
const state=(p,n,v,profile,scope='local')=>C.settingState(p,0,n,v,profile,scope);
for(const profile of profiles){
  test(`${profile.id}: input Oracle image and output Gold Image coexist after installation`,()=>{
    const text=`global.global_log_dir=/home/oracle/oinstall/autoupgrade/logs\nglobal.keystore=/home/oracle/oinstall/autoupgrade/keys\ninstall1.target_home=/u01/app/oracle/product/26ai/dbhome_1\ninstall1.home_settings.oracle_base=/u01/app/oracle\ninstall1.home_settings.inventory_location=/u01/app/oraInventory\ninstall1.folder=/home/oracle/oinstall/autoupgrade/bin\ninstall1.download=YES\ninstall1.patch=RECOMMENDED\ninstall1.gold_image=YES\ninstall1.create_gold_image=YES\ninstall1.home_settings.edition=EE\ninstall1.target_version=26\n`;
    const p=C.parseConfig(text,profile,'patch').project;
    assert.equal(p.mode,'create_home');assert.equal(p.jobs[0].scenario,'gold_create');
    assert.deepEqual(C.validate(p,profile).filter(i=>i.level==='error'),[]);
    assert.equal(state(p,'create_gold_image','YES',profile).disabled,false);
    assert.equal(C.renderConfig(p),text);
  });
  test(`${profile.id}: incompatible local image controls stay repairable`,()=>{
    const p=example('gold_use',profile),before=C.renderConfig(p);
    for(const n of ['gold_image','gold_image.security_patch_level','create_gold_image'])assert(C.fieldState(p,0,n,profile).disabled,n);
    assert(state(p,'patch','RU,OPATCH',profile).disabled);
    assert.equal(state(p,'create_gold_image','',profile).disabled,false);
    assert.equal(C.renderConfig(p),before);
  });
  test(`${profile.id}: packing does not run in download and security level needs images`,()=>{
    const p=example('download',profile);assert(C.fieldState(p,0,'create_gold_image',profile).disabled);
    p.jobs[0].values.gold_image='NO';assert(C.fieldState(p,0,'gold_image.security_patch_level',profile).disabled);
    p.jobs[0].values.gold_image='AUTO';assert.equal(C.fieldState(p,0,'gold_image.security_patch_level',profile).disabled,false);
  });
  test(`${profile.id}: incompatible platform and OJVM selections are blocked`,()=>{
    const p=example('download',profile);p.jobs[0].values.target_version='26';
    assert(state(p,'patch','RU,OJVM',profile).disabled);
    p.jobs[0].values.target_version='19';p.jobs[0].values.platform='ARM.X64';
    assert(state(p,'patch','RU,MRP',profile).disabled);assert(state(p,'gold_image','YES',profile).disabled);
    assert.equal(state(p,'gold_image','AUTO',profile).disabled,false);
  });
  test(`${profile.id}: incomplete drafts do not block compatible choices`,()=>{
    const p=C.newProject(profile.id);C.chooseScenario(p,0,'install');
    assert.equal(state(p,'patch','RECOMMENDED',profile).disabled,false);
    assert(state(p,'patch','TOOLS',profile).disabled);
    assert(state(p,'home_settings.edition','BOGUS',profile).disabled);
  });
  test(`${profile.id}: recovery and statistics dependency choices`,()=>{
    const p=example('upgrade',profile);p.jobs[0].values.raise_compatible='YES';
    assert(state(p,'drop_grp_after_upgrade','NO',profile).disabled);
    p.jobs[0].values.dictionary_stats_before='NO';assert(C.fieldState(p,0,'parallel_stats_degree',profile).disabled);
    p.jobs[0].values.dictionary_stats_before='YES';assert.equal(C.fieldState(p,0,'parallel_stats_degree',profile).disabled,false);
    p.jobs[0].values.parallel_stats_degree='4';assert(state(p,'dictionary_stats_before','NO',profile).disabled);
  });
  test(`${profile.id}: inherited conflicts and global changes are checked across entries`,()=>{
    const p=example('upgrade',profile);p.jobs.push(C.clone(p.jobs[0]));p.jobs[1].prefix='upg2';
    delete p.jobs[0].values.parallel_stats_degree;p.jobs[0].values.dictionary_stats_before='NO';
    p.jobs[1].values.parallel_stats_degree='4';p.jobs[1].values.dictionary_stats_before='YES';
    assert(state(p,'parallel_stats_degree','4',profile,'global').disabled);
    assert.equal(state(p,'parallel_stats_degree','',profile,'global').disabled,false);
    assert(C.fieldState(p,0,'sid',profile,'global').disabled);
  });
  test(`${profile.id}: rolling and standby mode restrictions are prospective`,()=>{
    const p=example('patch',profile);p.jobs[0].context={topology:'single'};
    assert(state(p,'rac_rolling','REQUIRED',profile).disabled);
    p.jobs[0].context={topology:'rac',os:'windows'};assert(state(p,'rac_rolling','FORCE',profile).disabled);
    p.jobs[0].context={role:'standby'};assert(C.modeState(p,'fixups',profile).disabled);
  });
  test(`${profile.id}: imported conflicts preserve values and permit repair`,()=>{
    const p=example('download',profile);p.jobs[0].values.patch='RU,OJVM';p.jobs[0].values.target_version='26';
    const before=JSON.stringify(p);assert(C.validate(p,profile).some(i=>i.code==='ojvm'&&i.level==='error'));
    assert(state(p,'patch','RU,OJVM',profile).disabled);assert.equal(state(p,'patch','RU',profile).disabled,false);
    assert.equal(JSON.stringify(p),before);
    p.jobs[0].values.download_folder='/different';assert(C.fieldState(p,0,'folder',profile).disabled);
    assert.equal(state(p,'download_folder','',profile).disabled,false);
  });
}
const modern=profiles[1];
test('26.6: OEM and GI exclusive combination buttons use export rules',()=>{
  const p=example('download',modern);p.jobs[0].values.patch='OEM:24.1';
  assert(state(p,'patch','OEM:24.1,OPATCH',modern).disabled);
  p.jobs[0].values.patch='GI:19.32';
  assert(state(p,'patch','GI:19.32,RU',modern).disabled);
  assert.equal(state(p,'patch','GI:19.32,OPATCH,39000001',modern).disabled,false);
});
test('26.6: tool downloads are unavailable in create_home and CSPU respects release',()=>{
  const p=example('install',modern);assert(state(p,'patch','CPAT',modern).disabled);
  p.mode='download';p.jobs[0].scenario='download';p.jobs[0].values.target_version='19';
  assert(state(p,'patch','RU,CSPU',modern).disabled);
  p.jobs[0].values.target_version='21';assert.equal(state(p,'patch','RU,CSPU',modern).disabled,false);
});
test('invalid Gold Image output basenames block export',()=>{
  const p=example('gold_create',modern);p.jobs[0].values.create_gold_image='image.extra.zip';
  assert(C.validate(p,modern).some(i=>i.code==='gold-name'&&i.level==='error'));
});
test('deploy with fixed image output uses a separate preparation file without duplicate capture',()=>{
  const p=example('patch',modern);p.mode='deploy';p.jobs[0].values.create_gold_image='home_out.zip';
  const book=W.runbook(p,modern),prep=book.artifacts.find(a=>a.type==='home preparation');assert(prep);
  assert(prep.content.includes('create_gold_image=NO'));assert(book.artifacts[0].content.includes('create_gold_image=home_out.zip'));
  const parsed=C.parseConfig(prep.content,modern,'patch').project;parsed.mode='create_home';parsed.jobs[0].scenario='prepare_home';
  assert.deepEqual(C.validate(parsed,modern).filter(i=>i.level==='error'),[]);
  assert(book.steps.find(s=>s.title==='Create the Oracle home').code.includes(prep.name));
  assert(W.markdown(p,modern).includes('create_user_gold_image.log'));
});
test('targets cannot collide with another job source or target outside download mode',()=>{
  const p=example('patch',modern);p.jobs.push(C.clone(p.jobs[0]));p.jobs[1].prefix='patch2';
  assert(C.validate(p,modern).some(i=>i.code==='home-collision'));
  p.jobs[1].values.target_home='/u01/another_home';assert(!C.validate(p,modern).some(i=>i.code==='home-collision'));
  p.jobs[1].values.source_home=p.jobs[0].values.target_home;assert(C.validate(p,modern).some(i=>i.code==='home-collision'));
  p.mode='download';assert(!C.validate(p,modern).some(i=>i.code==='home-collision'));
});
test('existing-home upgrades and software-only plans disable irrelevant advanced fields',()=>{
  const p=example('upgrade',modern);assert(C.fieldState(p,0,'patch',modern).disabled);assert(C.fieldState(p,0,'source_dblink',modern).disabled);
  p.jobs[0].values.create_oracle_home='YES';assert.equal(C.fieldState(p,0,'patch',modern).disabled,false);
  const install=example('install',modern);assert(C.fieldState(install,0,'restoration',modern).disabled);
});
