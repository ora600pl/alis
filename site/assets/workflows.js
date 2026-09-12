/* Reviewed workflow composition. Generates instructions and artifacts; executes nothing. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.AugurWorkflows=factory(root.Augur);})(typeof globalThis==='undefined'?this:globalThis,function(C){
  'use strict';
  const SOURCES=[
    ['empty-home','Fresh-server installation','https://dohdatabase.com/2025/06/17/autoupgrade-new-features-install-oracle-home-on-brand-new-empty-server/'],
    ['mos','MOS credentials and auto-login','https://mikedietrichde.com/2026/07/07/autoupgrade-patching-from-zero-to-hero-part-2-mos-credentials/'],
    ['gold','Oracle-supplied Gold Images (26.2 behavior)','https://www.dbarj.com.br/en/2026/02/downloading-and-using-gold-image-with-autoupgrade/'],
    ['own-gold','Create and use your own Gold Images','https://dohdatabase.com/2026/09/08/autoupgrade-new-features-create-and-use-your-own-gold-images/'],
    ['downloads','Patch and tool download examples','https://mikedietrichde.com/2026/07/09/autoupgrade-patching-from-zero-to-hero-part-4-download-examples/'],
    ['release','Changes in AutoUpgrade 26.4 / 26.5','https://mikedietrichde.com/2026/08/13/new-autoupgrade-version-26-5-is-available-plus-26-4/'],
    ['refresh','PDB refresh, source fixups and cutover','https://dohdatabase.com/2026/02/24/upgrade-oracle-database-19c-pdb-to-26ai-using-refreshable-clone-pdb/'],
    ['rolling','RAC rolling workflow','https://www.dbarj.com.br/en/2026/02/rac-rolling-mode-in-autoupgrade/'],
    ['parameters','Oracle upgrade parameter reference','https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/upgrade-parameters-autoupgrade-config-file.html'],
    ['patch-parameters','Oracle patch parameter reference','https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/patch-parameters-autoupgrade-config-file.html'],
    ['cli','Oracle command reference','https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html']
  ].map(([id,title,url])=>({id,title,url}));
  const GUIDES=[
    {id:'install',title:'A new home is software, not a database',text:'Use -patch -mode create_home. SID and source_home are unnecessary on an empty server; provide installation settings instead. The OS user, OS packages and groups must already be prepared. Listener and database creation are subsequent tasks.',sources:['empty-home']},
    {id:'media',title:'Choose where the software comes from',text:'Online: load the MOS keystore and download media. Offline: set download=NO and transfer the complete patch directory with companion metadata, including aru-bug-map.json where generated. Individual-patch installation can require a separately supplied base release. Download-only work does not test patch conflicts.',sources:['downloads','release']},
    {id:'gold',title:'Three different image decisions',text:'gold_image controls Oracle-supplied images. create_gold_image packages the newly installed home. PATCH=GOLDIMAGE:filename.zip consumes your own local archive and cannot include other patches. These settings serve different purposes.',sources:['gold','own-gold']},
    {id:'wallet',title:'MOS wallet, CSI and auto-login',text:'The keystore password and MOS password are entered only in AutoUpgrade on the server. Use add -user, list, then save/exit. Auto-login YES binds local use; SHARED allows the intended shared use and needs appropriate filesystem protection. Explicit CSI was required by older Gold Image examples; 26.4/26.5 can authenticate without it.',sources:['mos','release']},
    {id:'versions',title:'Database branding and patch versions',text:'target_version=26 is mapped to internal major version 23 by this JAR. A pinned RU expression must use the version accepted by the patch service (for example RU:23.26.3). Bare RU and RECOMMENDED resolve later; they are not reproducible patch locks. Preserve patches_info.json and the actual download results.',sources:['release','downloads']},
    {id:'refresh',title:'Prepare, refresh, then cut over',text:'A source_dblink without an interval requests a one-time clone. A link plus interval enables periodic refresh. start_time controls the cutover; NOW can proceed immediately. For remote sources, keep a separate source configuration for analyze/fixups, then use proceed -job in the target console after the maintenance gate.',sources:['refresh']},
    {id:'topology',title:'RAC and Data Guard are independent decisions',text:'RAC rolling is a patching eligibility decision, not a promise of uninterrupted sessions. Coordinate service draining and all instances. Standby work must follow its primary sequence; PDB cloning can need deferred recovery and a separate standby restore. The form cannot inspect either topology.',sources:['rolling','parameters']},
    {id:'recovery',title:'Keep a recovery path',text:'A restore point, a retained source home and a retained source PDB serve different recovery paths. Raising COMPATIBLE and dropping restore points changes those paths. Restore, datapatch rollback and manual recovery are separate operations; the recovery toolbox is never part of the normal execution sequence.',sources:['cli','parameters']},
    {id:'defaults',title:'An omitted parameter is an active decision',text:'The UI shows explicit values, inheritance and declaration defaults separately. Runtime code may derive or override a declaration. The reference includes every declared parameter in this profile, including entries absent from the upgrade registry and patch entries explicitly rejected by validators.',sources:['parameters','patch-parameters']}
  ];
  const CLI=[
    ['-version','Inspect the actual JAR build; compare it with the selected profile.','read'],
    ['-help','Read operation-specific help; add -patch for patching.','read'],
    ['-config','Read a configuration file. The wizard produces this artifact.','input'],
    ['-config_values','Supply inline configuration. File output is easier to review and preserve.','input'],
    ['-auto_config','Discover a configuration from the actual server environment.','server'],
    ['-create_sample_file','Generate config or internal-settings templates from the actual JAR.','file'],
    ['-mode','Choose analyze, fixups, deploy, upgrade/postfixups or download/create_home by operation.','workflow'],
    ['-settings','Use a separate internal-settings file. Values are expert controls, not public config parameters.','expert'],
    ['-load_password','Open the interactive AutoUpgrade keystore loader.','interactive'],
    ['-load_win_credential','Create Windows credentials on the host; select the SID where needed.','interactive'],
    ['-noconsole','Run without the interactive job console.','execution'],
    ['-silent','Reduce patch-mode unattended output.','execution'],
    ['-debug','Enable diagnostic logging.','execution'],
    ['-listchecks','Inspect check names, descriptions and individual checks.','read'],
    ['-error_code','Explain a specific AutoUpgrade error code.','read'],
    ['-zip / -sid / -d / -zip_exclusion_list','Collect selected logs for troubleshooting. Review them before sharing.','diagnostic'],
    ['-restore / -jobs','Restore selected existing jobs using the applicable recovery state.','recovery'],
    ['-rollback / -jobs','Request the datapatch rollback path; it is not a generic downgrade.','recovery'],
    ['-restore_on_fail','Request automatic restoration after eligible deployment failures.','recovery'],
    ['-clear_recovery_data','Discard saved job recovery state only after a deliberate manual recovery/reset.','recovery'],
    ['-regen_hash','Bypass the resumed-job JAR identity check. Keep the original JAR instead where possible.','expert'],
    ['-preupgrade','Legacy preupgrade compatibility path; modern workflows use -config.','legacy'],
    ['-follower','Internal coordination option, not a standalone workflow exposed by the wizard.','internal']
  ].map(([name,text,kind])=>({name,text,kind}));
  const yes=v=>/^YES$/i.test(v||'');
  const isClone=j=>['refreshable','refreshable_noncdb'].includes(j.scenario);
  const periodic=j=>[j.values.source_dblink,...Object.values(j.pdb||{}).map(p=>p.source_dblink)].some(link=>/\s+[1-9]\d*$/.test(link||''));
  function q(project,value){return project.execution?.shell==='powershell'?"'"+String(value).replaceAll("'","''")+"'":"'"+String(value).replaceAll("'","'\\''")+"'";}
  function base(project){const e=project.execution||{};return (e.shell==='powershell'?'& ':'')+(e.javaPath?q(project,e.javaPath):'java')+' -jar '+q(project,project.jarPath)+(project.operation==='patch'?' -patch':'');}
  function configCommand(project,flags){return base(project)+' -config '+q(project,project.fileName)+' '+flags;}
  function sourceProject(project,profile){
    const jobs=project.jobs.filter(isClone);
    if(!jobs.length)return null;
    const p=C.newProject(profile.id);p.fileName=project.fileName.replace(/\.cfg$/,'.source.cfg');p.title=project.title+' — source preparation';p.execution=C.clone(project.execution||{});p.jarPath=project.jarPath;p.globals={};
    if(project.globals.global_log_dir)p.globals.global_log_dir=project.globals.global_log_dir.replace(/[\\/]$/,'')+'/source-fixups';
    if(project.globals.keystore)p.globals.keystore=project.globals.keystore;
    p.jobs=jobs.map(j=>{const values={sid:j.values.sid||'',source_home:j.context?.location==='remote'?j.context.sourceOracleHome||'':j.values.source_home||'',target_version:String(C.effective(project,j,'target_version',profile).value||'')};if(!values.target_version){delete values.target_version;values.target_home=C.effective(project,j,'target_home',profile).value||'';}if(j.values.pdbs)values.pdbs=j.values.pdbs;return {prefix:j.prefix,scenario:'upgrade',values,pdb:{}};});
    return p;
  }
  function runbook(project,profile){
    const steps=[],artifacts=[{name:project.fileName,type:'configuration',content:C.renderConfig(project)}],issues=C.validate(project,profile),e=project.execution||{};
    const powershell=e.shell==='powershell',soft=project.operation==='patch'&&['download','create_home'].includes(project.mode),sp=sourceProject(project,profile);
    const add=(title,where,text,code='',kind='shell',sources=[])=>steps.push({title,where,text,code,kind,sources});
    add('Verify the executable and profile','Execution host','Use a Java runtime supported by the actual AutoUpgrade build. On a new server, Java must be available before any Oracle home exists. Compare the returned build with '+profile.id+'. Do not replace the JAR of a running/resumed job.',(powershell?'& ':'')+(e.javaPath?q(project,e.javaPath):'java')+' -version\n'+base(project)+' -version');
    const dirs=new Set([project.globals.global_log_dir||project.globals.autoupg_log_dir,project.globals.keystore]);
    for(const j of project.jobs){const v=n=>C.effective(project,j,n,profile).value;if(project.operation==='patch'||yes(v('create_oracle_home')))dirs.add(v('download_folder')||v('folder'));}
    const paths=[...dirs].filter(Boolean);
    if(paths.length)add('Prepare working directories','Execution host / Oracle software owner','Create only the staging, log and keystore paths. Oracle homes, OS groups and installation prerequisites need their own server preparation.',powershell?paths.map(path=>'New-Item -ItemType Directory -Force -Path '+q(project,path)).join('\n'):'umask 077\nmkdir -p '+paths.map(path=>q(project,path)).join(' '));
    add('Place and review the generated files','Execution host','Save the configuration below as '+project.fileName+'. Check paths, file ownership, intended media and the selected operation. AUGUR does not upload files or run these commands.',powershell?'Get-Content -LiteralPath '+q(project,project.fileName):'cat '+q(project,project.fileName));
    const download=project.jobs.some(j=>{const v=n=>C.effective(project,j,n,profile).value;return (project.operation==='patch'||yes(v('create_oracle_home')))&&!/^GOLDIMAGE:/i.test(v('patch')||'')&&(project.mode==='download'||yes(v('download')));});
    if(download){
      add('Load MOS credentials','Download host / Oracle software owner','Create or open the wallet at global.keystore. Enter wallet and MOS passwords only at the terminal prompts. This is an interactive session.',configCommand(project,'-load_password'),'shell',['mos']);
      add('Complete the password-loader dialogue','MOS> console','Replace YOUR_MOS_USER if not supplied. Enter the MOS secret at the hidden prompt. list checks connectivity. On save/exit choose auto-login '+(e.autologin||'YES')+'. CSI is optional for this profile; add it only when your support setup requires it. Auto-login SHARED must be an intentional cross-host choice.', 'add -user '+(e.mosUser||'YOUR_MOS_USER')+(e.csi?'\nadd -csi '+e.csi:'')+'\nlist\nsave\nexit','console',['mos','release']);
    }
    if(project.jobs.some(j=>j.context?.tde&&j.context.tde!=='none')){
      add('Load database encryption secrets','Oracle software owner','Use the password loader help to select the discovered source and target databases and their keystore types. Supply TDE/OKV/catalog secrets only in the loader. A MOS credential does not replace a TDE wallet password.',configCommand(project,'-load_password')+'\n# In the loader: help, list, add (for the required database), save, exit','shell',['parameters']);
    }
    for(const j of project.jobs.filter(j=>j.values.sid&&(j.context?.os==='windows'||String(C.effective(project,j,'platform',profile).value).toUpperCase()==='WINDOWS.X64')))add('Prepare Windows execution credentials for '+j.prefix,'Windows host','Use the SID-specific credential loader and retain its reported file path in wincredential. The named service account must exist already.',configCommand(project,'-load_win_credential '+q(project,j.values.sid)));
    if(download&&project.operation==='patch')add('Download and inspect the media','Download host','This downloads software; it does not apply database changes. Review patch inventory/patches_info.json and keep companion metadata with the files. Oracle service availability and entitlements are checked here.',C.command(project,'download'),'shell',['downloads']);
    if(project.operation==='patch'&&project.mode!=='download'){
      add('Check the installation source','Target software host','Use a matching-platform base release plus patches, an Oracle-supplied image, or the selected local Gold Image. AUTO can fall back. When offline, preserve the complete staged media directory. Custom GOLDIMAGE input is exclusive; its patch level is already baked in.','','manual',['gold','own-gold']);
      if(project.mode==='create_home'||project.mode==='deploy'){
        add('Create the Oracle home','Target host / Oracle software owner','Run on the installation platform. AutoUpgrade installs software and applies the chosen media. A software-only job does not create a database.',C.command(project,'create_home'),'shell',['empty-home']);
        const rootCommands=[];
        if(!powershell)for(const j of project.jobs){const home=C.effective(project,j,'target_home',profile).value,inv=C.effective(project,j,'home_settings.inventory_location',profile).value;if(inv&&!inv.includes('%'))rootCommands.push('# Only if requested for this inventory\n'+q(project,inv.replace(/\/$/,'')+'/orainstRoot.sh'));if(home&&!home.includes('%'))rootCommands.push('# Only if requested by AutoUpgrade\n'+q(project,home.replace(/\/$/,'')+'/root.sh'));}
        add('Complete privileged installation steps','root / installation administrator','Execute only the scripts and node order requested by AutoUpgrade. Inspect rootsh.log/rootsh.json at the path printed for this job. If target_home contains placeholders, use the resolved script paths from those outputs. Existing sudo configuration may let AutoUpgrade handle this step.',[...new Set(rootCommands)].join('\n'),'manual',['empty-home']);
        if(project.jobs.some(j=>j.values.create_gold_image&&!/^NO$/i.test(j.values.create_gold_image)))add('Retain the generated Gold Image','Media directory','Record the generated ZIP name and target inventory. It can be consumed in a separate project using PATCH=GOLDIMAGE:filename.zip. Test installation before distributing the image.','','manual',['own-gold']);
      }
    }
    for(const j of project.jobs.filter(isClone)){
      add('Prepare the source link for '+j.prefix,'Source database and target CDB root','Provision a dedicated link user through your approved secret process. On the source it needs the privileges appropriate to cloning (including CREATE SESSION, CREATE PLUGGABLE DATABASE, SELECT_CATALOG_ROLE and READ on SYS.ENC$ for the documented path). Create the link in the target root to the intended source service. Common users require matching container grants. Verify connectivity from all RAC instances. Password SQL is deliberately not stored in a browser artifact.','','manual',['refresh']);
    }
    if(sp){
      artifacts.push({name:sp.fileName,type:'source configuration',content:C.renderConfig(sp)});
      if(!['upgrade','postfixups'].includes(project.mode))add('Analyze the source','Source host / Oracle software owner','Copy the separate source configuration to the source host. Its source_home is the real source installation; the target-side placeholder path is not reused.',C.command(sp,'analyze'),'shell',['refresh']);
    }
    if(!soft){
      if(project.jobs.some(j=>j.context?.role==='standby'))add('Coordinate Data Guard','Primary and standby administrators','Check role and broker state. Prepare matching homes on the standby and follow the chosen primary/standby sequence. For PDB migration, verify whether recovery is enabled or deferred; do not claim standby protection before restore/apply verification.','','manual',['parameters']);
      if(project.jobs.some(j=>j.context?.topology==='rac'||/^(AUTO|REQUIRED|FORCE)$/i.test(j.values.rac_rolling||'')))add('Verify RAC readiness and service draining','Cluster administrators','Check all instances, SSH, matching home paths, installer groups and patch eligibility. REQUIRED enforces rolling eligibility; AUTO may fall back. Review client reconnect behavior and the chosen drain_timeout.','','manual',['rolling']);
      const stagedRemote=project.jobs.some(j=>yes(j.values.target_is_remote)&&!isClone(j));
      if(stagedRemote && project.mode==='deploy'){
        add('Source checks and fixups','Source host','For staged relocation, run these before copying/restoring the database. target_is_remote describes the split execution; it does not transfer database files.',C.command(project,'analyze')+'\n'+C.command(project,'fixups'));
        add('Move/restore and mount/open in the target home','Target host','Use your validated backup/restore or transport procedure. Start the database as required by upgrade mode. Recheck SID, source/target paths and network/cluster configuration for this host.','','manual');
        add('Upgrade on the target','Target host','Run only after the source preparation and transfer are complete. Upgrade mode assumes the database is already running from the target home.',C.command(project,'upgrade'));
      }else{
        const clone=project.jobs.some(isClone);
        const waiting=project.jobs.filter(isClone).some(periodic),once=project.jobs.filter(isClone).some(j=>!periodic(j));
        if(!clone && ['analyze','fixups','deploy'].includes(project.mode))add('Analyze database readiness','Database host','Review findings and resolve blockers before any database-changing stage.',C.command(project,'analyze'));
        if(project.mode==='fixups')add('Apply pre-operation fixups','Source database host','This changes the source database. Review the analyze findings and the maintenance plan first.',C.command(sp||project,'fixups'));
        else if(project.mode!=='analyze'){
          if(clone&&once&&project.mode==='deploy'&&sp)add('Prepare the source before a one-time clone','Source host','Apply source fixups before starting the one-time clone. Quiesce writes for the agreed snapshot/cutover and coordinate application service changes.',C.command(sp,'fixups'),'shell',['refresh']);
          if(['upgrade','postfixups'].includes(project.mode))add('Confirm the current database state','Target database host','This is a stage-specific operation. Complete source checks, any transport/plugging and required startup first. Upgrade mode expects the target home; postfixups expects the upgrade stage to have completed. It does not start a new clone.','','manual');
          add(clone&&project.mode==='deploy'?'Start cloning / refresh':'Run the selected database operation',clone||stagedRemote?'Target database host':'Database host','Proceed after the operational gates above and the applicable backup/recovery checks.',C.command(project,project.mode));
        }
        if(clone&&project.mode==='deploy'){
          if(sp&&waiting&&!once)add('Source fixups at the maintenance window','Source host','Stop application writes according to your migration plan, then apply the source fixups using the separate file before final refresh.',C.command(sp,'fixups'),'shell',['refresh']);
          if(waiting)add('Finalize a periodically refreshed clone','Target AutoUpgrade console','For jobs with a refresh interval, keep the session running until cutover. Use the actual job ID from lsj. NOW can reach cutover without a later gate. For multiple jobs, repeat proceed only for the jobs ready to switch.', 'lsj\nproceed -job '+(e.jobIds?.split(',')[0]||'JOB_ID')+'\nlsj -a 30','console',['refresh']);
          add('Close the old application endpoint','Source and target owners','For remote clones, explicitly close the old source when appropriate and move/recreate application services. Verify the new PDB and any standby before retiring the preserved source.','','manual',['refresh']);
        }
      }
    }
    if(project.mode==='download')add('Use the staged files','Download host','Retain patches_info.json and all generated metadata. Download completion does not prove installability. Start a separate fresh-home or patch project using this media directory; use download=NO on an offline host.','','manual',['downloads']);
    else add('Verify the result','Operation owner','Inspect the final summary and reported log paths, Oracle inventory and SQL patch registry where a database was changed. Complete application, service and backup checks. A software-only home install creates no database. A listener is created only when configured.','','manual');
    const ids=e.jobIds||'JOB_ID',toolbox=[
      {title:'Inspect checks',text:'Read available checks for this operation.',code:base(project)+' -listchecks'},
      {title:'Collect logs',text:'Review archives before sharing them with support.',code:configCommand(project,'-zip')},
      {title:'Resume the same job',text:'Use the same JAR, configuration, mode and recovery/log location. Do not clear recovery state.',code:C.command(project,project.mode)},
      {title:'Restore selected jobs',text:'Recovery only: needs applicable AutoUpgrade recovery state and restore capability.',code:configCommand(project,'-restore -jobs '+ids)},
      {title:'Datapatch rollback',text:'Recovery only: verify this is a supported datapatch rollback, not a major-release downgrade.',code:configCommand(project,'-rollback -jobs '+ids)},
      {title:'Clear recovery data',text:'State reset only after verified manual recovery. This discards job recovery data; do not use it to fix a routine resume.',code:configCommand(project,'-clear_recovery_data -jobs '+ids)}
    ];
    return {steps,artifacts,issues,toolbox:soft?toolbox.slice(0,3):toolbox,sources:SOURCES,profile:profile.id,title:project.title};
  }
  function markdown(project,profile){const r=runbook(project,profile),out=['# '+r.title,'','AutoUpgrade '+r.profile+' · '+project.operation+' / '+project.mode,'','These are instructions, not an executed or database-validated run.'];if(r.issues.length)out.push('','## Review before execution','',...r.issues.map(i=>'- '+i.level.toUpperCase()+': '+i.text));r.steps.forEach((s,i)=>{out.push('','## '+(i+1)+'. '+s.title,'','Run on: '+s.where,'',s.text);if(s.code)out.push('','```'+(s.kind==='console'?'text':project.execution?.shell==='powershell'?'powershell':'sh'),s.code,'```');});for(const a of r.artifacts)out.push('','## File: '+a.name,'','```properties',a.content.trimEnd(),'```');out.push('','## Recovery and diagnostics — separate from normal execution');for(const t of r.toolbox)out.push('','### '+t.title,'',t.text,'','```text',t.code,'```');out.push('','## Sources','',...SOURCES.map(s=>'- ['+s.title+']('+s.url+')'));return out.join('\n')+'\n';}
  function exampleProject(profileId,scenario) {
    const p=C.newProject(profileId);C.chooseScenario(p,0,scenario);p.title=C.SCENARIOS[scenario].label;p.fileName=scenario+'.cfg';
    p.globals={global_log_dir:'/home/oracle/autoupgrade/logs',keystore:'/home/oracle/autoupgrade/keystore'};
    const j=p.jobs[0];
    if(p.operation==='patch'){
      j.values={folder:'/home/oracle/autoupgrade/patches',target_version:'19',patch:'RU,OPATCH,OCW',download:'YES'};
      if(scenario!=='download')j.values.target_home='/u01/app/oracle/product/dbhome_1';
      if(['prepare_home','patch'].includes(scenario))j.values.source_home='/u01/app/oracle/product/19/dbhome_1';
      else if(scenario!=='download')Object.assign(j.values,{'home_settings.oracle_base':'/u01/app/oracle','home_settings.edition':'EE','home_settings.inventory_location':'/u01/app/oraInventory'});
      if(scenario==='gold_create')j.values.create_gold_image='db_home_%RELEASE%_%UPDATE%_%TIMESTAMP%.zip';
      if(scenario==='gold_use'){j.values.patch='GOLDIMAGE:db_home_19_32.zip';j.values.download='NO';}
      if(scenario==='patch')j.values.sid='ORCL';
    }else{
      j.values={sid:'CDB19',source_home:'/u01/app/oracle/product/19/dbhome_1',target_home:'/u01/app/oracle/product/26/dbhome_1',target_version:'26'};
      if(['noncdb','refreshable_noncdb'].includes(scenario)){j.values.sid='LEGACY';j.values.target_cdb='CDB26';j.values.target_pdb_name='APP26';j.values.target_pdb_copy_option='file_name_convert=none';}
      if(['unplug','refreshable'].includes(scenario)){j.values.target_cdb='CDB26';j.values.pdbs='SALES';j.pdb.sales={target_pdb_name:'SALES26',target_pdb_copy_option:'file_name_convert=none'};}
      if(scenario==='refreshable')j.pdb.sales.source_dblink='CLONE_SALES 600';
      if(scenario==='refreshable_noncdb')j.values.source_dblink='CLONE_LEGACY 600';
      if(isClone(j))j.values.start_time='01/01/2038 01:00:00';
      if(scenario==='pdb_upgrade'){j.values.sid='CDB26';j.values.pdbs='SALES';}
    }
    return p;
  }
  function previewCommand(project,profile){const mode=C.initialMode(project),source=mode==='analyze'?sourceProject(project,profile):null;return C.command(source||project,mode);}
  return {SOURCES,GUIDES,CLI,runbook,markdown,sourceProject,base,configCommand,exampleProject,previewCommand};
});
