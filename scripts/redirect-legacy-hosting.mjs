// One-time cutover: keep old bookmarks working without serving a second app.
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const folder=path.resolve('.migration/legacy-redirect');await mkdir(path.join(folder,'public'),{recursive:true});
await writeFile(path.join(folder,'public/404.html'),'<!doctype html><title>AIAS Basra has moved</title><a href="https://aiasbsr.com/community.html">Continue to AIAS Basra</a>');
const config={hosting:{site:'space-42d87',public:'public',redirects:[{source:'/',destination:'https://aiasbsr.com/community.html',type:301},{source:'/index.html',destination:'https://aiasbsr.com/community.html',type:301},{source:'/:path*',destination:'https://aiasbsr.com/:path',type:301}]}};
await writeFile(path.join(folder,'firebase.json'),JSON.stringify(config,null,2));
const cli=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/bin/firebase.js');
const result=await new Promise(resolve=>{const child=spawn(process.execPath,[cli,'deploy','--only','hosting','--project','space-42d87','--account','sarayspace1@gmail.com','--non-interactive'],{cwd:folder,stdio:'inherit',windowsHide:true});child.on('close',resolve);});
if(result)throw new Error('Legacy hosting redirect deployment failed.');
