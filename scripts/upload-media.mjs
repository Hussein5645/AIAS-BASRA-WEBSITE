import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const inventory=JSON.parse(await readFile('.migration/media-inventory.json','utf8'));
const remote=process.argv.includes('--remote');
if(!remote && !process.argv.includes('--local'))throw new Error('Specify --local or --remote explicitly.');
const cli=path.resolve('node_modules/wrangler/bin/wrangler.js');
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',pdf:'application/pdf',glb:'model/gltf-binary',gltf:'model/gltf+json',zip:'application/zip',apk:'application/vnd.android.package-archive',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',mp4:'video/mp4',mp3:'audio/mpeg'};
for(const file of inventory.files){
  const type=types[file.key.split('.').at(-1).toLowerCase()] || 'application/octet-stream';
  const result=spawnSync(process.execPath,[cli,'r2','object','put',inventory.bucket+'/'+file.key,'--file',file.file,'--content-type',type,remote?'--remote':'--local'],{stdio:'inherit',shell:false});
  if(result.status!==0)throw new Error('Stopped after upload failure: '+file.key);
}
console.log(`Uploaded ${inventory.files.length} files. Original files remain available until verification and cutover.`);
