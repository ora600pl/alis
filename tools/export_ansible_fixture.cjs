// Generate the same ZIP as the UI for interoperability and integration tests.
const fs=require('node:fs'),path=require('node:path');
const W=require('../site/assets/workflows.js'),A=require('../site/assets/ansible.js');
const profile=require('../profiles/26.6.260925.json');
async function main(){
  if(process.argv.length!==3)throw new Error('Usage: node tools/export_ansible_fixture.cjs OUTPUT_DIRECTORY');
  const project=W.exampleProject(profile.id,'patch');
  project.jobs[0].context={os:'linux',topology:'single',tde:'none'};
  project.automation={host:'db-lab.example.com'};
  const files=await A.bundle(project,profile),out=path.resolve(process.argv[2]);
  fs.mkdirSync(out,{recursive:true});
  for(const file of files){const target=path.join(out,file.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);}
  fs.writeFileSync(path.join(out,'alis-ansible.zip'),A.zip(files));
  console.log('Generated '+files.length+' files and alis-ansible.zip in '+out);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
