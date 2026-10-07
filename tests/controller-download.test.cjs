const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../site/assets/core.js'),W=require('../site/assets/workflows.js'),A=require('../site/assets/ansible.js');
for(const id of ['26.5.260807','26.6.260925'])for(const operation of ['patch','upgrade']){
  const profile=require('../profiles/'+id+'.json');
  const example=()=>{const p=W.exampleProject(id,operation);p.mode='deploy';p.execution={downloadHost:'controller'};p.automation={host:'db.example.com'};p.jobs[0].context={os:'linux',topology:'single',mediaPlatform:'LINUX.X64'};Object.assign(p.jobs[0].values,{download:'YES',folder:'/stage',target_version:operation==='upgrade'?'26':'19',...(operation==='patch'?{platform:'LINUX.X64'}:{}),...(operation==='upgrade'?{create_oracle_home:'YES'}:{})});return p;};
  test(id+' '+operation+' workstation flow selects target only and never downloads remotely',async()=>{
    const p=example(),before=C.clone(p),files=await A.bundle(p,profile),get=n=>files.find(f=>f.name===n)?.content,plan=JSON.parse(get('files/plan.json'));
    assert.deepEqual(p,before);assert.equal(plan.download,false);assert.equal(plan.controller_download,true);assert.equal(plan.target_version,operation==='upgrade'?'23':'19');
    assert.equal(plan.download_parameters.target_version,operation==='upgrade'?'26':'19');
    assert.equal(plan.download_parameters.platform,'LINUX.X64');
    assert(!('source_home' in plan.download_parameters));assert(!('sid' in plan.download_parameters));
    assert.match(get('files/autoupgrade.cfg'),/download=NO/);assert.equal(get('original-autoupgrade.cfg'),C.renderConfig(p));
    for(const filename of ['autoupgrade.cfg','autoupgrade.home.cfg','autoupgrade.deploy.cfg'])assert(!get('files/'+filename).includes('.download=YES'));
    assert.deepEqual([...get(operation+'.yml').matchAll(/import_playbook: (\w+)\.yml/g)].map(m=>m[1]),['local','transfer','remote']);
    assert.match(get('test-local.yml'),/import_playbook: remote.yml/);
    assert.match(get('transfer.yml'),/Type YES to transfer/);assert.match(get('tasks/run.yml'),/Type YES to proceed/);
    const runbook=W.runbook(p,profile),commands=runbook.steps.map(s=>s.code).join('\n');
    assert(commands.indexOf('-mode download')<commands.indexOf('-mode analyze'));assert(commands.indexOf('-mode create_home')<commands.indexOf('-mode deploy'));
    const download=runbook.artifacts.find(f=>f.type==='download configuration');
    assert(download.content.includes('.platform=LINUX.X64'));assert(!download.content.includes('.source_home='));
    assert.match(get('files/autoupgrade.download.cfg'),/target_version=(19|26)/);
    assert.equal(plan.download_config_sha256,crypto.createHash('sha256').update(get('files/autoupgrade.download.cfg')).digest('hex'));
  });
  test(id+' '+operation+' explicit platform and target required before controller export',()=>{
    const p=example();delete p.jobs[0].context.mediaPlatform;delete p.jobs[0].values.platform;
    assert(C.validate(p,profile).some(i=>i.code==='download-platform'));assert(!A.assess(p,profile).ready);
    p.jobs[0].context.mediaPlatform='LINUX.X64';delete p.jobs[0].values.target_version;
    assert(C.validate(p,profile).some(i=>i.code==='download-target'));
  });
}
test('server upgrade download also drops source identity without modifying the source analysis',()=>{
  const profile=require('../profiles/26.6.260925.json'),p=W.exampleProject(profile.id,'upgrade');p.mode='deploy';Object.assign(p.jobs[0].values,{download:'YES',folder:'/media',target_version:'26',create_oracle_home:'YES',gold_image:'YES'});
  const r=W.runbook(p,profile),download=r.artifacts.find(a=>a.type==='download configuration');
  assert(download.content.includes('target_version=26'));assert(!download.content.includes('source_home'));assert(!download.content.includes('.sid='));assert(r.artifacts[0].content.includes('source_home='));
  assert(r.steps.find(s=>s.title==='Download and inspect the media').code.includes('.download.cfg'));
});
