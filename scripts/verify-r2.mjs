import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const inventory=JSON.parse(await readFile('.migration/all-media-inventory.json','utf8'));
const files=[...new Map(inventory.map(item=>[item.key,item])).values()];
await mkdir('.migration/verified-r2',{recursive:true});let index=0,count=0;const failures=[];
await Promise.all(Array.from({length:4},async()=>{while(index<files.length){
 const item=files[index++],target=path.resolve('.migration/verified-r2/'+createHash('sha256').update(item.key).digest('hex'));
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),'r2','object','get','aias-basra-media/'+item.key,'--file',target,'--remote'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);child.on('close',code=>resolve({code,log}));});
 if(result.code)failures.push({key:item.key,error:'Download failed',log:result.log});
 else{const expected=createHash('sha256').update(await readFile(item.file)).digest('hex'),actual=createHash('sha256').update(await readFile(target)).digest('hex');if(expected!==actual)failures.push({key:item.key,error:'Checksum mismatch'});}
 if(++count%25===0)console.log('Verified '+count+'/'+files.length+' R2 objects.');
}}));
await writeFile('.migration/r2-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),objects:files.length,failures},null,2));
console.log('R2 verification complete: '+files.length+' objects checked; '+failures.length+' failures.');if(failures.length)process.exitCode=1;
