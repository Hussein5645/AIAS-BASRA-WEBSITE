import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),cli=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
const auth=require(path.join(cli,'auth.js'));
await require(path.join(cli,'requireAuth.js')).requireAuth({...auth.findAccountByEmail('sarayspace1@gmail.com'),project:'space-42d87'});
const {Client}=require(path.join(cli,'apiv2.js'));
const rules=new Client({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1'});
for(const [release,target] of [['cloud.firestore','current-firestore.rules'],['firebase.storage/space-42d87.firebasestorage.app','current-storage.rules']]){
  const result=await rules.get('projects/space-42d87/releases/'+release);
  const source=await rules.get(result.body.rulesetName);
  await writeFile('.migration/'+target,source.body.source.files.map(file=>file.content).join('\n'));
  console.log('Recovered deployed '+target);
}
