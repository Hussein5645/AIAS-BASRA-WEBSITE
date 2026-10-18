import {readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
const skip=new Set(['.git','.firebase','__','node_modules','dist','.wrangler','.migration']);
const extensions=/\.(png|jpe?g|gif|webp|svg|ico|pdf|glb|gltf|zip|apk|woff2?|ttf|mp4|mp3)$/i;
const files=[];
async function walk(dir='.') {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(skip.has(entry.name))continue;
    const location=path.join(dir,entry.name);
    if(entry.isDirectory())await walk(location);
    else if(extensions.test(location)) {
      const sha=createHash('sha256');
      for await(const chunk of createReadStream(location))sha.update(chunk);
      files.push({key:location.replaceAll('\\','/'),file:path.resolve(location),bytes:(await stat(location)).size,sha256:sha.digest('hex')});
    }
  }
}
await walk();
await mkdir('.migration',{recursive:true});
await writeFile('.migration/media-inventory.json',JSON.stringify({bucket:'aias-basra-media',generatedAt:new Date().toISOString(),files},null,2));
console.log(`Inventoried ${files.length} files (${(files.reduce((n,f)=>n+f.bytes,0)/1048576).toFixed(1)} MB). No files uploaded or removed. Manifest: .migration/media-inventory.json`);
