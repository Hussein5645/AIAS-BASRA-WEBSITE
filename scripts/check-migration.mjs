import {readdir,readFile} from 'node:fs/promises';
const files=[];
for(const entry of await readdir('.',{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.html')&&!entry.name.includes('backup'))files.push(entry.name);
for(const entry of await readdir('js'))if(entry.endsWith('.js'))files.push('js/'+entry);
const remaining=[];
for(const file of files){
  const source=await readFile(file,'utf8');
  if(/gstatic\.com\/firebasejs|space-42d87\.(web\.app|firebaseapp\.com)|firebasestorage\.googleapis\.com/.test(source))remaining.push(file);
}
if(remaining.length){
  console.error('Cutover blocked: Firebase-dependent pages must be migrated and verified first.\n'+remaining.join('\n'));
  process.exitCode=1;
}else console.log('No legacy Firebase runtime dependencies detected. Check migrated data and OAuth before publishing.');
