import {client} from './firebase-migration-client.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const api=client('https://storage.googleapis.com','storage/v1');
const bucket='space-42d87.firebasestorage.app';
const root=path.resolve('.migration/firebase-media');await mkdir(root,{recursive:true});
const objects=[];let pageToken;
do{const result=await api.get(`b/${bucket}/o`,{queryParams:{maxResults:1000,...(pageToken?{pageToken}:{})}});objects.push(...(result.body.items||[]));pageToken=result.body.nextPageToken;}while(pageToken);
const inventory=[];let count=0;
for(const object of objects){
  if(object.name.endsWith('/'))continue;
  const target=path.resolve(root,object.name);
  if(!target.startsWith(root+path.sep))throw new Error('Invalid source object path');
  await mkdir(path.dirname(target),{recursive:true});
  const response=await api.get(`b/${bucket}/o/${encodeURIComponent(object.name)}`,{queryParams:{alt:'media'},responseType:'stream',resolveOnHTTPError:true});
  if(response.status>=400)throw new Error('Could not export a storage object.');
  const chunks=[];for await(const chunk of response.body)chunks.push(chunk);await writeFile(target,Buffer.concat(chunks));
  inventory.push({key:object.name,file:target,bytes:Number(object.size),contentType:object.contentType||'application/octet-stream',md5:object.md5Hash});
  count++;if(count%25===0)console.log(`Exported ${count}/${objects.length} storage objects.`);
}
await writeFile('.migration/firebase-storage-inventory.json',JSON.stringify(inventory,null,2));
console.log(`Exported ${inventory.length} storage files. Firebase originals were not changed.`);
