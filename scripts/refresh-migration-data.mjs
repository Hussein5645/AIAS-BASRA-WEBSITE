import {client} from './firebase-migration-client.mjs';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const file='.migration/firebase-documents.json',previous=JSON.parse(await readFile(file,'utf8'));
const api=client('https://firestore.googleapis.com','v1'),base='projects/space-42d87/databases/(default)/documents';
const groups=new Set(previous.documents.flatMap(document=>document.name.split('/documents/')[1].split('/').filter((value,index)=>index%2===0)));
const roots=await api.post(base+':listCollectionIds',{pageSize:1000});for(const name of roots.body.collectionIds||[])groups.add(name);
const transaction=(await api.post(base+':beginTransaction',{options:{readOnly:{}}})).body.transaction;
const documents=[];
try{
 for(const collectionId of groups){const response=await api.post(base+':runQuery',{transaction,structuredQuery:{from:[{collectionId,allDescendants:true}]}});for(const row of response.body)if(row.document)documents.push(row.document);}
}finally{await api.post(base+':rollback',{transaction});}
const before=new Map(previous.documents.filter(item=>item.fields).map(item=>[item.name,JSON.stringify(item.fields)]));let added=0,changed=0;
for(const document of documents){if(!before.has(document.name))added++;else if(before.get(document.name)!==JSON.stringify(document.fields))changed++;before.delete(document.name);}
await copyFile(file,'.migration/firebase-documents-before-refresh.json');
await copyFile('.migration/cloudflare-records.json','.migration/cloudflare-records-before-refresh.json');
await writeFile(file,JSON.stringify({project:'space-42d87',exportedAt:new Date().toISOString(),documents}));
console.log('Fresh source snapshot: '+documents.length+' records; '+added+' added, '+changed+' changed, '+before.size+' removed since the first export.');
