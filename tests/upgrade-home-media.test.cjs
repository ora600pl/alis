const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../site/assets/core.js'),W=require('../site/assets/workflows.js');
const profiles=[require('../profiles/26.5.260807.json'),require('../profiles/26.6.260925.json')];
const config=`global.global_log_dir=/home/oracle/autoupgrade/logs
global.keystore=/home/oracle/autoupgrade/keys
upg1.sid=ORCLSE
upg1.source_home=/opt/oracle/product/19c/dbhome_se
upg1.target_version=19
upg1.target_home=/opt/oracle/product/19.32/dbhome_se
upg1.create_oracle_home=YES
upg1.folder=/home/oracle/autoupgrade/bin
upg1.patch=RECOMMENDED
upg1.gold_image=YES
`;
const errors=(p,profile)=>C.validate(p,profile).filter(i=>i.level==='error');
for(const profile of profiles){
  const imported=()=>C.parseConfig(config,profile,'upgrade').project;
  test(`${profile.id}: upgrade forwards explicit Oracle image settings and preserves import/export`,()=>{
    const p=imported();p.jobs[0].values['gold_image.security_patch_level']='HIGH';
    assert.equal(p.operation,'upgrade');assert.deepEqual(errors(p,profile),[]);
    assert.equal(C.settingState(p,0,'gold_image','YES',profile).disabled,false);
    assert.equal(C.effective(p,p.jobs[0],'download',profile).value,'YES');
    const exported=C.renderConfig(p);assert(exported.includes('upg1.gold_image=YES'));
    assert(exported.includes('upg1.gold_image.security_patch_level=HIGH'));
    assert.deepEqual(errors(C.parseConfig(exported,profile,'upgrade').project,profile),[]);
    assert(!C.command(p,'deploy').includes(' -patch'));
    assert(W.markdown(p,profile).includes('Review integrated target-home media'));
  });
  test(`${profile.id}: disabling home creation preserves images and requires an explicit repair`,()=>{
    const p=imported();assert(C.settingState(p,0,'create_oracle_home','NO',profile).disabled);
    p.jobs[0].values.create_oracle_home='NO';
    assert(C.fieldState(p,0,'gold_image',profile).disabled);
    assert(errors(p,profile).some(i=>i.code==='upgrade-home-media'));
    assert(C.renderConfig(p).includes('upg1.gold_image=YES'));
    assert.equal(C.settingState(p,0,'gold_image','',profile).disabled,false);
    delete p.jobs[0].values.gold_image;assert.deepEqual(errors(p,profile),[]);
  });
  test(`${profile.id}: upgrade home image choices validate release, patch pins and security levels`,()=>{
    const p=imported();p.jobs[0].values.target_version='21';delete p.jobs[0].values.gold_image;
    assert(C.settingState(p,0,'gold_image','YES',profile).disabled);
    assert.equal(C.settingState(p,0,'gold_image','AUTO',profile).disabled,false);
    p.jobs[0].values.target_version='19';p.jobs[0].values.patch='RECOMMENDED:21.20';
    assert(errors(p,profile).some(i=>i.code==='ru-version'));
    p.jobs[0].values.patch='RECOMMENDED';p.jobs[0].values.gold_image='NO';
    assert(C.fieldState(p,0,'gold_image.security_patch_level',profile).disabled);
    p.jobs[0].values.gold_image='BOGUS';assert(errors(p,profile).some(i=>i.code==='value'));
  });
  test(`${profile.id}: integrated media validation covers each job without changing its operation`,()=>{
    const p=imported(),second=C.clone(p.jobs[0]);second.prefix='upg2';second.values.sid='OTHER';
    second.values.source_home='/opt/other/source';second.values.target_home='/opt/other/target';
    second.values.target_version='21';p.jobs.push(second);
    assert(errors(p,profile).some(i=>i.code==='gold-service-version'&&i.text.startsWith('upg2:')));
    const before=JSON.stringify(p);C.validate(p,profile);assert.equal(JSON.stringify(p),before);
  });
  test(`${profile.id}: integrated home media defaults do not enable unrelated patch parameters`,()=>{
    const p=imported();delete p.jobs[0].values.gold_image;
    assert.equal(C.effective(p,p.jobs[0],'gold_image',profile).value,'AUTO');
    p.jobs[0].values.create_gold_image='YES';assert(errors(p,profile).some(i=>i.code==='operation'));
    delete p.jobs[0].values.create_gold_image;p.globals.gold_image='YES';
    assert(errors(p,profile).some(i=>i.code==='scope'));
    assert.equal(C.definition(profile,'upgrade','platform'),null);
  });
}
