const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const C=require('../site/assets/core.js'),W=require('../site/assets/workflows.js'),A=require('../site/assets/ansible.js');
const profiles=['26.5.260807','26.6.260925'].map(id=>require('../profiles/'+id+'.json'));
function example(profile=profiles[1]){const p=W.exampleProject(profile.id,'patch');p.jobs[0].context={os:'linux',topology:'single',tde:'none'};p.automation={host:'lab.example.com'};return p;}
for(const f of profiles)test('Ansible package preserves the exact selected build and original configuration: '+f.id,async()=>{
  const p=example(f),files=await A.bundle(p,f),get=n=>files.find(a=>a.name===n)?.content,plan=JSON.parse(get('files/plan.json'));
  assert.equal(plan.profile,f.id);assert.equal(plan.jar_sha256,f.jarSha256);assert.equal(plan.resume_cli,!!f.behavior.resumeCli);
  assert.equal(get('files/autoupgrade.cfg'),C.renderConfig(p));assert.equal(plan.config_sha256,crypto.createHash('sha256').update(C.renderConfig(p)).digest('hex'));
  for(const name of ['patch.yml','prepare.yml','analyze.yml','download.yml','create_home.yml','deploy.yml','verify.yml','test-local.yml','README.md','files/runner.py','files/autoupgrade.home.cfg','tests/simulator.py'])assert(get(name),name);
  assert.equal(plan.format,2);
  assert.equal(get('files/autoupgrade.home.cfg'),C.renderConfig(p));
  assert.deepEqual([...get('patch.yml').matchAll(/import_playbook: (\w+)\.yml/g)].map(m=>m[1]),['prepare','analyze','download','create_home','deploy','verify']);
  assert.deepEqual([...get('alis-runbook.md').matchAll(/-mode (analyze|download|create_home|deploy)(?:\s|$)/g)].map(m=>m[1]).slice(0,4),['analyze','download','create_home','deploy']);
  assert(get('test-local.yml').includes('import_playbook: patch.yml'));
  assert(!files.some(a=>a.name.endsWith('.jar')));assert(!get('deploy.yml').includes('restore -'));
});
test('Gold Image output is packaged only by deploy, with both configs pinned',async()=>{
  const p=example();p.jobs[0].values.create_gold_image='out_home.zip';
  const files=await A.bundle(p,profiles[1]),get=n=>files.find(f=>f.name===n)?.content,plan=JSON.parse(get('files/plan.json'));
  assert.equal(get('files/autoupgrade.cfg'),C.renderConfig(p));
  assert(get('files/autoupgrade.home.cfg').includes('create_gold_image=NO'));
  assert.equal(plan.home_config_separate,true);
  assert.equal(plan.home_config_sha256,crypto.createHash('sha256').update(get('files/autoupgrade.home.cfg')).digest('hex'));
  assert(get('alis-runbook.md').includes('autoupgrade.home.cfg'));
});
for(const f of profiles){
  test('database config import preserves input and exports patch equivalents: '+f.id,async()=>{
    const text='# Command previously used: -mode postfixups\nglobal.global_log_dir=/home/oracle/autoupgrade/logs\nglobal.keystore=/home/oracle/autoupgrade/keys\nupg1.sid=ORCLSE\nupg1.source_home=/opt/oracle/product/19c/dbhome_se\nupg1.target_home=/opt/oracle/product/19.32/dbhome_se\nupg1.target_version=19\nupg1.create_oracle_home=YES\nupg1.folder=/home/oracle/autoupgrade/bin\nupg1.download=YES\nupg1.patch=RECOMMENDED\nupg1.gold_image=YES\nupg1.drop_grp_after_upgrade=YES\nupg1.timezone_upg=YES\n';
    const upgrade=C.parseConfig(text,f,'upgrade').project,patch=C.parseConfig(text,f,'patch').project;
    for(const p of [upgrade,patch]){assert.equal(p.mode,'analyze');assert.equal(C.renderConfig(p),text);assert(W.previewCommand(p,f).endsWith('-mode analyze'));}
    assert.equal(upgrade.operation,'upgrade');assert.equal(patch.jobs[0].scenario,'patch');
    patch.jobs[0].context={os:'linux',topology:'single'};patch.automation={host:'lab.example.com'};
    assert(C.validate(patch,f).some(i=>i.key==='upg1.create_oracle_home'&&i.code==='operation'));
    assert(C.validate(patch,f).some(i=>i.key==='upg1.drop_grp_after_upgrade'&&i.code==='operation'));
    const before=C.clone(patch),state=A.assess(patch,f);
    assert.equal(state.ready,true,state.reasons.join('\n'));assert.equal(state.adjustments.length,2);
    const files=await A.bundle(patch,f),get=name=>files.find(file=>file.name===name)?.content,config=get('files/autoupgrade.cfg');
    assert(config.includes('upg1.drop_grp_after_patching=YES'));
    assert(config.includes('upg1.timezone_upg=YES'));
    assert(!config.includes('upg1.create_oracle_home='));
    assert(!config.includes('upg1.drop_grp_after_upgrade='));
    assert.equal(get('original-autoupgrade.cfg'),text);assert(get('config-adjustments.md').includes('-patch -mode create_home'));
    assert.equal(JSON.parse(get('files/plan.json')).config_sha256,crypto.createHash('sha256').update(config).digest('hex'));
    assert.deepEqual(patch,before);assert.equal(C.renderConfig(patch),text);
    const parsed=C.parseConfig(config,f,'patch').project;
    assert(!C.validate(parsed,f).some(i=>i.level==='error'));
    assert(get('alis-runbook.md').includes('upg1.drop_grp_after_patching=YES'));
    assert.equal(W.runbook(patch,f).steps.filter(s=>s.code.includes('-mode '))[0].code,W.previewCommand(patch,f));
  });
  test('patch conversion preserves renamed comments and explicit NO values: '+f.id,async()=>{
    const p=example(f);
    // Use the actual imported prefix and preserve raw spelling/inline comments.
    const cfg=C.renderConfig(p)+'PATCH1.create_oracle_home=no # upgrade-only\nPATCH1.drop_grp_after_upgrade=no # keep the GRP\n';
    const imported=C.parseConfig(cfg,f,'patch').project;imported.jobs[0].context=p.jobs[0].context;imported.automation=p.automation;
    const files=await A.bundle(imported,f),get=name=>files.find(file=>file.name===name)?.content;
    assert(get('files/autoupgrade.cfg').includes('patch1.drop_grp_after_patching=no # keep the GRP'));
    assert(!get('files/autoupgrade.cfg').includes('create_oracle_home='));
    assert(get('create_home.yml'));assert(get('patch.yml').includes('create_home.yml'));
    assert.equal(get('original-autoupgrade.cfg'),cfg);
  });
  test('global legacy GRP policy becomes a local patch policy with local overrides: '+f.id,async()=>{
    const p=example(f);p.globals.drop_grp_after_upgrade='YES';p.jobs[0].values.drop_grp_after_upgrade='NO';
    let files=await A.bundle(p,f),config=files.find(file=>file.name==='files/autoupgrade.cfg').content;
    assert(config.includes('patch1.drop_grp_after_patching=NO'));assert(!config.includes('drop_grp_after_upgrade='));
    delete p.jobs[0].values.drop_grp_after_upgrade;
    files=await A.bundle(p,f);config=files.find(file=>file.name==='files/autoupgrade.cfg').content;
    assert(config.includes('patch1.drop_grp_after_patching=YES'));assert(!config.includes('global.drop_grp_after_patching='));
  });
  test('matching GRP spellings are deduplicated without changing the native policy: '+f.id,async()=>{
    const p=example(f);p.jobs[0].values.drop_grp_after_upgrade='yes';p.jobs[0].values.drop_grp_after_patching='YES';
    const files=await A.bundle(p,f),config=files.find(file=>file.name==='files/autoupgrade.cfg').content;
    assert.equal((config.match(/patch1\.drop_grp_after_patching=/g)||[]).length,1);
    assert(!config.includes('drop_grp_after_upgrade='));
  });
  test('conversion cannot hide conflicting policies, malformed or duplicate input: '+f.id,async()=>{
    const p=example(f);p.jobs[0].values.drop_grp_after_upgrade='YES';p.jobs[0].values.drop_grp_after_patching='NO';
    assert(A.assess(p,f).reasons.some(reason=>reason.includes('conflicts with')));await assert.rejects(A.bundle(p,f));
    for(const field of ['create_oracle_home','drop_grp_after_upgrade'])for(const value of ['MAYBE','YES\nNO',' YES']){
      const invalid=example(f);invalid.jobs[0].values[field]=value;await assert.rejects(A.bundle(invalid,f));
    }
    const duplicate=C.parseConfig(C.renderConfig(example(f))+'patch1.create_oracle_home=YES\npatch1.create_oracle_home=NO\n',f,'patch').project;
    duplicate.jobs[0].context=p.jobs[0].context;duplicate.automation=p.automation;
    assert(A.assess(duplicate,f).reasons.some(reason=>reason.includes('Duplicate')));await assert.rejects(A.bundle(duplicate,f));
    const unrelated=example(f);unrelated.jobs[0].values.target_edition='SE2';await assert.rejects(A.bundle(unrelated,f));
  });
  test('saved postfixups project retains continuation mode rather than cfg import defaults: '+f.id,()=>{
    const p=W.exampleProject(f.id,'upgrade');p.mode='postfixups';
    const restored=C.loadProject(JSON.stringify(p),{[f.id]:f});
    assert.equal(restored.mode,'postfixups');
    assert(!W.runbook(restored,f).steps.some(s=>s.code.includes('-mode analyze')));
    assert.equal(C.parseConfig(C.renderConfig(restored),f,'upgrade').project.mode,'analyze');
  });
}
test('pinned RU is retained for inventory verification',async()=>{const p=example();p.jobs[0].values.patch='RU:19.28,OPATCH';const files=await A.bundle(p,profiles[1]);assert.equal(JSON.parse(files.find(f=>f.name==='files/plan.json').content).pinned_ru,'19.28');});
for(const f of profiles)test('versioned RECOMMENDED pins the verified RU without changing the requested patch set: '+f.id,async()=>{
  const p=example(f);p.jobs[0].values.patch='RECOMMENDED:19.32';p.jobs[0].values.method='OUTOFPLACE';
  const files=await A.bundle(p,f),plan=JSON.parse(files.find(file=>file.name==='files/plan.json').content);
  assert.equal(plan.pinned_ru,'19.32');
  assert.equal(files.find(file=>file.name==='files/autoupgrade.cfg').content,C.renderConfig(p));
  assert.equal(plan.target_home,p.jobs[0].values.target_home);
  p.jobs[0].values.patch='RECOMMENDED';
  assert.equal(JSON.parse((await A.bundle(p,f)).find(file=>file.name==='files/plan.json').content).pinned_ru,'');
});
for(const [name,mutate] of [
  ['missing host',p=>delete p.automation.host],['missing explicit topology',p=>delete p.jobs[0].context.topology],['RAC',p=>p.jobs[0].context.topology='rac'],['RAC One Node',p=>p.jobs[0].context.topology='racone'],['SEHA',p=>p.jobs[0].context.topology='seha'],['Data Guard primary',p=>p.jobs[0].context.role='primary_dg'],['standby',p=>p.jobs[0].context.role='standby'],['Windows',p=>p.jobs[0].context.os='windows'],['remote source',p=>p.jobs[0].context.location='remote'],['multiple databases',p=>p.jobs.push(C.clone(p.jobs[0]))],['password wallet',p=>p.execution={autologin:'NO'}],['password TDE',p=>p.jobs[0].context.tde='password'],['internal settings',p=>p.execution={settingsPath:'/tmp/settings'}],['WAIT drain',p=>p.jobs[0].values.drain_timeout='WAIT'],['scheduled database stage',p=>p.jobs[0].values.start_time='+1h'],['same homes',p=>p.jobs[0].values.target_home=p.jobs[0].values.source_home],['missing logs',p=>delete p.globals.global_log_dir],['parent traversal',p=>p.automation.workDir='/tmp/../oracle'],['Jinja path',p=>p.automation.workDir='/tmp/{{ lookup("pipe", "id") }}'],['host line injection',p=>p.automation.host='lab\nother: evil'],['invalid timeout',p=>p.automation.timeout='0'],['invalid poll',p=>p.automation.poll='0']
])test('Ansible blocks '+name,async()=>{const p=example();mutate(p);assert.equal(A.assess(p,profiles[1]).ready,false);await assert.rejects(A.bundle(p,profiles[1]));});
test('upgrade and software preparation are outside the existing-database export',()=>{for(const scenario of ['upgrade','install','download','gold_use']){const p=W.exampleProject(profiles[1].id,scenario);assert(!A.assess(p,profiles[1]).ready);}});
test('non-Linux media cannot be deployed to the Linux execution host',()=>{const p=example();p.jobs[0].values.platform='WINDOWS.X64';assert(!A.assess(p,profiles[1]).ready);});
test('saved projects round-trip Ansible settings and reject malformed maps',()=>{const p=example();assert.deepEqual(C.loadProject(JSON.stringify(p),{[profiles[1].id]:profiles[1]}),p);p.automation=[];assert.throws(()=>C.loadProject(JSON.stringify(p),{[profiles[1].id]:profiles[1]}));});
test('literal paths retain spaces, quotes and shell metacharacters without shell execution',async()=>{const p=example();p.automation.workDir="/tmp/Oracle's home $(id)";p.execution={javaPath:"/tmp/Java's bin/java"};const files=await A.bundle(p,profiles[1]);const plan=JSON.parse(files.find(f=>f.name==='files/plan.json').content);assert.equal(plan.java,p.execution.javaPath);assert.equal(plan.jar,p.automation.workDir+'/autoupgrade.jar');assert(files.find(f=>f.name==='host_vars/oracle_db.yml').content.includes('!unsafe'));assert(files.find(f=>f.name==='tasks/run.yml').content.includes('expand_argument_vars: false'));});
test('SSH and software owner settings select sudo only when needed',async()=>{const p=example();let files=await A.bundle(p,profiles[1]);assert(files.find(f=>f.name==='host_vars/oracle_db.yml').content.includes('alis_become: false'));p.automation.sshUser='ansible';files=await A.bundle(p,profiles[1]);assert(files.find(f=>f.name==='host_vars/oracle_db.yml').content.includes('alis_become: true'));});
test('ZIP interoperates with Python zipfile, preserves UTF-8 and CRCs, and is deterministic',()=>{
  const files=[{name:'README.md',content:'Zażółć gęślą jaźń\n'},{name:'files/a.cfg',content:'x=1\n'}],bytes=A.zip(files);
  assert.deepEqual(A.zip(files),bytes);const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alis-zip-'));
  try{const archive=path.join(directory,'output.zip');fs.writeFileSync(archive,bytes);const result=cp.spawnSync('python3',['-S','-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("alis-ansible/README.md").decode()=="Zażółć gęślą jaźń\\n"; assert len(z.namelist())==2',archive],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('ZIP rejects duplicate and escaping paths',()=>{for(const name of ['../evil','/absolute','files/../../evil'])assert.throws(()=>A.zip([{name,content:''}]));assert.throws(()=>A.zip([{name:'a',content:''},{name:'a',content:''}]));assert.equal(A.crc32(new TextEncoder().encode('123456789')),0xcbf43926);});
