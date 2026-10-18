import {readdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
for(const file of [...(await readdir('.')).filter(file=>file.endsWith('.html')&&!file.includes('backup')),...(await readdir('js')).filter(file=>file.endsWith('.js')).map(file=>'js/'+file)]){
 let source=await readFile(file,'utf8');source=source.replace(/[ \t]+$/gm,'');
 source=source.replaceAll('Changes are saved in Firebase and appear on the public portfolio page.','Changes appear on the public portfolio page.');
 await writeFile(file,source);
}
for(const file of execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z']).toString().split('\0').filter(Boolean)){
 const original=await readFile(file,'utf8');if(original.includes('\0'))continue;
 await writeFile(file,original.replaceAll('\r\n','\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n');
}
