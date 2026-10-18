import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const cli=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
const auth=require(path.join(cli,'auth.js'));
await require(path.join(cli,'requireAuth.js')).requireAuth({...auth.findAccountByEmail('sarayspace1@gmail.com'),project:'space-42d87'});
const {Client}=require(path.join(cli,'apiv2.js'));
const storage=new Client({urlPrefix:'https://storage.googleapis.com',apiVersion:'storage/v1'});
const inventory=JSON.parse(await readFile('.migration/firebase-source-inventory.json','utf8'));
await mkdir('.migration/function-archives',{recursive:true});
let copied=0;
for(const fn of inventory.functions){
  const source=fn.source?.storageSource;if(!source)continue;
  const response=await storage.get(`b/${encodeURIComponent(source.bucket)}/o/${encodeURIComponent(source.object)}`,{queryParams:{alt:'media',...(source.generation?{generation:source.generation}:{})},responseType:'stream',resolveOnHTTPError:true});
  if(response.status>=400)throw new Error('Source download failed for '+fn.name.split('/').at(-1));
  const chunks=[];for await(const chunk of response.body)chunks.push(chunk);
  await writeFile('.migration/function-archives/'+fn.name.split('/').at(-1)+'.zip',Buffer.concat(chunks));
  copied++;
  if(copied%10===0)console.log(`Recovered ${copied}/${inventory.functions.length} deployed function archives.`);
}
console.log('All deployed function archives recovered.');
