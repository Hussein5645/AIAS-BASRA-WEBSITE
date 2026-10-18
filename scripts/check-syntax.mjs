import {readdir,readFile} from 'node:fs/promises';
import {parse} from 'acorn';
const sdk=parse(await readFile('js/cloudflare-client.js','utf8'),{ecmaVersion:'latest',sourceType:'module'});
const names=new Set(sdk.body.flatMap(node=>node.type==='ExportNamedDeclaration'?node.declaration?.declarations?.map(d=>d.id.name)||[node.declaration?.id?.name]:[]));
let count=0;const errors=[];
function check(source,file){try{const tree=parse(source,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});count++;for(const node of tree.body)if(node.type==='ImportDeclaration'&&node.source.value==='/js/cloudflare-client.js')for(const specifier of node.specifiers)if(!names.has(specifier.imported?.name))errors.push(file+': missing compatibility export '+specifier.imported?.name);}catch(error){errors.push(file+': '+error.message);}}
for(const file of await readdir('js'))if(file.endsWith('.js'))check(await readFile('js/'+file,'utf8'),'js/'+file);
for(const file of await readdir('.'))if(file.endsWith('.html')&&!file.includes('backup')){const text=await readFile(file,'utf8');for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/application\/ld\+json/.test(match[1]))check(match[2],file);}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Verified syntax and Cloudflare SDK imports for '+count+' scripts.');
