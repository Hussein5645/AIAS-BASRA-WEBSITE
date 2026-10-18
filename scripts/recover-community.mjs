import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
// Recover reference code only. Do not silently publish an older community app.
const revision='ccad500^';
const prefix='saray comunity/';
const names=execFileSync('git',['ls-tree','-r','--name-only',revision,'--',prefix+'public',prefix+'functions',prefix+'firestore.rules',prefix+'storage.rules'],{encoding:'utf8'}).trim().split('\n');
let count=0;
for(const name of names){
  if(!/\.(js|html|css|json|rules|webmanifest)$/.test(name) || /package-lock\.json$/.test(name))continue;
  const relative=name.slice(prefix.length);
  const target=path.resolve('.migration/community-reference',relative);
  const base=path.resolve('.migration/community-reference')+path.sep;
  if(!target.startsWith(base))throw new Error('Invalid recovery path');
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,execFileSync('git',['show',revision+':'+name],{maxBuffer:20*1024*1024}));
  count++;
}
console.log(`Recovered ${count} historical reference files from ${revision}. This is the August 15 source, not a verified copy of today's live app.`);
