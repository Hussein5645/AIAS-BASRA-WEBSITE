import { mkdir, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output=path.resolve(root,'dist');
if(path.dirname(output)!==root || path.basename(output)!=='dist') throw new Error('Invalid build directory');
await mkdir('dist', {recursive:true});
for(const entry of await readdir(output)) await rm(path.join(output,entry),{recursive:true,force:true});
// Explicit allowlist: credentials, Git history, backups and server code never enter the public bundle.
for (const entry of await readdir(root, {withFileTypes:true})) {
  if (entry.isFile() && entry.name.endsWith('.html') && !entry.name.includes('backup')) await copyFile(entry.name, path.join('dist', entry.name));
}
async function copyTree(dir) {
  await mkdir(path.join('dist', dir), {recursive:true});
  for (const e of await readdir(dir, {withFileTypes:true})) {
    const source = path.join(dir,e.name);
    if (e.isDirectory()) await copyTree(source);
    else if (/\.(js|css|json|md|webmanifest)$/.test(e.name)) await copyFile(source,path.join('dist',source));
  }
}
for (const dir of ['js','css','data','articles','static']) await copyTree(dir);
for(const file of ['community-notifications-sw.js','manifest.webmanifest'])await copyFile(file,path.join('dist',file));
await writeFile('dist/_headers', '/api/*\n  Cache-Control: no-store\n');
console.log('Built website code. Binary media is served exclusively from R2 at its existing URL path.');
