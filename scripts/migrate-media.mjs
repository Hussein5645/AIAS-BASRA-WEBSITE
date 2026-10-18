import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const repo=JSON.parse(await readFile('.migration/media-inventory.json','utf8'));
const inventory=JSON.parse(await readFile('.migration/firebase-source-inventory.json','utf8'));
const hosted=[];await mkdir('.migration/hosting-media',{recursive:true});
for(const entry of inventory.files||[]){
 const key=String(entry.path||'').replace(/^\//,'');if(!key||/\.(html|js|css|json|webmanifest|txt|md)$/.test(key)||key.startsWith('__/'))continue;
 const response=await fetch('https://space-42d87.web.app/'+key);if(!response.ok)throw new Error('Hosted file download failed: '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer()),file=path.resolve('.migration/hosting-media/'+createHash('sha256').update(key).digest('hex'));
 await writeFile(file,bytes);hosted.push({key,file,bytes:bytes.length,contentType:response.headers.get('Content-Type'),sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile('.migration/hosting-media-inventory.json',JSON.stringify(hosted,null,2));
await writeFile('worker/public-assets.js','export const publicAssets=new Set('+JSON.stringify([...new Set([...repo.files,...hosted].map(item=>item.key))])+');\n');
const sources=[...JSON.parse(await readFile('.migration/firebase-storage-inventory.json','utf8')),...JSON.parse(await readFile('.migration/extracted-media-inventory.json','utf8')),...hosted];
const files=[...new Map(sources.map(item=>[item.key,item])).values()];
const cli=path.resolve('node_modules/wrangler/bin/wrangler.js');let finished=0,index=0;const failures=[];
async function upload(item){
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,[cli,'r2','object','put','aias-basra-media/'+item.key,'--file',item.file,'--content-type',item.contentType||'application/octet-stream','--remote'],{shell:false,windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('close',code=>resolve({code,output}));});
 if(result.code)failures.push({key:item.key,...result});finished++;if(finished%20===0)console.log('Uploaded '+finished+'/'+files.length+' media objects.');
}
await Promise.all(Array.from({length:4},async()=>{while(index<files.length){const item=files[index++];await upload(item);}}));
await writeFile('.migration/r2-upload-failures.json',JSON.stringify(failures));
await writeFile('.migration/all-media-inventory.json',JSON.stringify([...repo.files,...files],null,2));
console.log('Media upload finished: '+(files.length-failures.length)+' succeeded; '+failures.length+' failed.');if(failures.length)process.exitCode=1;
