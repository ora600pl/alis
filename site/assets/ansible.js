/* ALIS Ansible export: static files and a dependency-free, stored ZIP writer. */
(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./core.js') : root.Alis;
  const W = typeof module !== 'undefined' ? require('./workflows.js') : root.AlisWorkflows;
  const T = typeof module !== 'undefined' ? require('./ansible-templates.js') : root.AlisAnsibleTemplates;
  const DEFAULTS = {host:'',sshUser:'oracle',oracleUser:'oracle',workDir:'/home/oracle/alis-patch',python:'python3',timeout:'32400',poll:'15'};
  const settings = project => ({...DEFAULTS,...project.automation});
  const absolute = value => typeof value === 'string' && /^\/(?!$)[^\0\r\n{}]+$/.test(value) && !value.split('/').includes('..');
  const executable = value => typeof value === 'string' && (absolute(value) || /^[A-Za-z0-9_.-]+$/.test(value));
  function assess(project, profile) {
    const reasons = C.validate(project,profile).filter(i=>i.level==='error').map(i=>i.text);
    const job=project.jobs[0],ctx=job?.context||{},e=project.execution||{},a=settings(project);
    const get=n=>job?C.effective(project,job,n,profile).value:null;
    if(project.operation!=='patch'||project.jobs.length!==1||job?.scenario!=='patch')reasons.push('Ansible export supports one existing database patch job. Choose Patch existing databases.');
    if(!['analyze','deploy','fixups'].includes(project.mode))reasons.push('Select a database patch mode. The bundle exports separate analyze and deploy playbooks.');
    if(!['linux','ol9'].includes(ctx.os)||ctx.topology!=='single')reasons.push('In Environment, select Linux (or Oracle Linux 9) and Single instance.');
    if(get('platform')&&!/^LINUX\./i.test(get('platform')))reasons.push('Use Linux media or leave platform omitted for the execution host.');
    if(ctx.role&&ctx.role!=='')reasons.push('Data Guard and standby roles need a separately coordinated Ansible workflow.');
    if(ctx.location==='remote'||e.shell==='powershell')reasons.push('This export requires a local source on a Linux execution host.');
    if(get('rac_rolling')!=='DISABLED'||(get('patch_node')&&!/^localhost$/i.test(get('patch_node')))||get('home_settings.cluster_nodes'))reasons.push('Cluster patch settings are outside this single-instance export.');
    if(get('method')!=='OUTOFPLACE')reasons.push('This export requires OUTOFPLACE patching.');
    if(ctx.tde&&!['none','auto'].includes(ctx.tde))reasons.push('Prepare a usable auto-login TDE wallet before exporting; password prompts and external-keystore workflows need separate automation.');
    if(e.autologin==='NO')reasons.push('Unattended execution requires a prepared AutoUpgrade auto-login keystore.');
    if(e.settingsPath)reasons.push('Custom internal settings files are outside this export.');
    if(String(get('drain_timeout')).toUpperCase()==='WAIT')reasons.push('Use a numeric drain timeout for this unattended workflow.');
    if(get('start_time')&&!/^NOW$/i.test(get('start_time')))reasons.push('Use start_time=NOW (or omit it); schedule the playbook from your automation system.');
    for(const name of ['source_home','target_home'])if(!absolute(get(name)))reasons.push(name+' must be an absolute Linux path for Ansible.');
    if(get('source_home')===get('target_home'))reasons.push('Source and target Oracle homes must differ for out-of-place patching.');
    if(!absolute(project.globals.global_log_dir||project.globals.autoupg_log_dir))reasons.push('Set an explicit absolute global log directory dedicated to this patch cycle.');
    if(!absolute(get('folder')||get('download_folder')))reasons.push('Set an absolute patch media directory.');
    if(/^YES$/i.test(get('download'))&&!absolute(project.globals.keystore))reasons.push('Online patching requires an absolute keystore path.');
    if(!/^[A-Za-z0-9_.:-]+$/.test(a.host))reasons.push('Enter the execution host DNS name or IP address.');
    for(const name of ['sshUser','oracleUser'])if(!/^[a-z_][a-z0-9_-]*\$?$/i.test(a[name]))reasons.push('Enter a valid '+(name==='sshUser'?'SSH user':'Oracle software owner')+'.');
    if(!absolute(a.workDir))reasons.push('Use an absolute, dedicated Ansible working directory.');
    if(!executable(a.python)||!executable(e.javaPath||'java'))reasons.push('Use a command name or absolute path for Python and Java.');
    if(!(absolute(project.jarPath)||/^[A-Za-z0-9_.-]+\.jar$/.test(project.jarPath)))reasons.push('Use an absolute JAR path or a JAR basename resolved inside the working directory.');
    for(const [name,min,max] of [['timeout',60,604800],['poll',1,300]])if(!/^\d+$/.test(a[name])||Number(a[name])<min||Number(a[name])>max)reasons.push(name+' must be an integer between '+min+' and '+max+'.');
    return {ready:reasons.length===0,reasons:[...new Set(reasons)]};
  }
  async function sha256(text) {
    const bytes=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const yaml = value => '!unsafe '+JSON.stringify(String(value));
  function playbook(action) {
    return '---\n- name: ALIS '+action+'\n  hosts: oracle_patch\n  gather_facts: false\n  serial: 1\n  any_errors_fatal: true\n  become: "{{ alis_become | bool }}"\n  become_user: "{{ alis_oracle_user }}"\n  vars:\n    alis_action: '+action+'\n  tasks:\n    - name: Run the '+action+' workflow\n      ansible.builtin.include_tasks: tasks/run.yml\n';
  }
  async function bundle(project,profile) {
    const state=assess(project,profile);
    if(!state.ready)throw new Error(state.reasons.join('\n'));
    const a=settings(project),e=project.execution||{},job=project.jobs[0],get=n=>C.effective(project,job,n,profile).value;
    const config=C.renderConfig(project),parts=C.patchParts(get('patch')||'',profile);
    const plan={format:1,simulation:false,profile:profile.id,jar_sha256:profile.jarSha256,jar:absolute(project.jarPath)?project.jarPath:a.workDir.replace(/\/$/,'')+'/'+project.jarPath,java:e.javaPath||'java',config_sha256:await sha256(config),sid:get('sid'),source_home:get('source_home'),target_home:get('target_home'),log_dir:project.globals.global_log_dir||project.globals.autoupg_log_dir,folder:get('folder')||get('download_folder'),download:/^YES$/i.test(get('download')),keystore:project.globals.keystore||'',resume_cli:Boolean(profile.behavior?.resumeCli),debug:e.debug==='YES',restore_on_fail:e.restoreOnFail==='YES',pinned_ru:parts.find(p=>p.type==='RU')?.version||''};
    const files=Object.entries(T).map(([name,content])=>({name,content}));
    files.push({name:'inventory.yml',content:'---\nall:\n  children:\n    oracle_patch:\n      hosts:\n        oracle_db:\n          ansible_host: '+yaml(a.host)+'\n          ansible_user: '+yaml(a.sshUser)+'\n'});
    files.push({name:'host_vars/oracle_db.yml',content:'---\nalis_oracle_user: '+yaml(a.oracleUser)+'\nalis_become: '+String(a.sshUser!==a.oracleUser)+'\nalis_work_dir: '+yaml(a.workDir)+'\nalis_python: '+yaml(a.python)+'\nansible_python_interpreter: '+yaml(a.python)+'\nalis_timeout: '+a.timeout+'\nalis_poll_interval: '+a.poll+'\nalis_resume: false\n'});
    files.push({name:'files/plan.json',content:JSON.stringify(plan,null,2)+'\n'},{name:'files/autoupgrade.cfg',content:config},{name:'alis-runbook.md',content:W.markdown(project,profile)});
    for(const action of ['prepare','analyze','deploy','verify'])files.push({name:action+'.yml',content:playbook(action)});
    return files.sort((x,y)=>x.name.localeCompare(y.name));
  }
  function crc32(bytes) {
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
  }
  function zip(files) {
    const enc=new TextEncoder(),chunks=[],central=[],seen=new Set();let offset=0;
    for(const file of files){
      if(!/^[A-Za-z0-9_./-]+$/.test(file.name)||file.name.startsWith('/')||file.name.split('/').includes('..')||seen.has(file.name))throw new Error('Invalid or duplicate ZIP entry.');
      seen.add(file.name);
      const name=enc.encode('alis-ansible/'+file.name),body=enc.encode(file.content),crc=crc32(body);
      const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);
      v.setUint32(14,crc,true);v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);v.setUint16(26,name.length,true);header.set(name,30);
      const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);
      d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);
      d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);
      chunks.push(header,body);central.push(directory);offset+=header.length+body.length;
    }
    const centralSize=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
    v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
    const output=new Uint8Array(offset+centralSize+end.length);let at=0;
    for(const part of [...chunks,...central,end]){output.set(part,at);at+=part.length;}
    return output;
  }
  const api={DEFAULTS,settings,assess,bundle,zip,crc32};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AlisAnsible=api;
})(typeof globalThis!=='undefined'?globalThis:this);
