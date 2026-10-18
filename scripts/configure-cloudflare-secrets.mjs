import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import webpush from 'web-push';
const raw=JSON.parse(await readFile('.migration/firebase-documents.json','utf8'));
const entry=raw.documents.find(item=>item.name.endsWith('/systemConfig/ai_assistant'));
const settings=Object.fromEntries(Object.entries(entry?.fields||{}).map(([name,value])=>[name,value.stringValue]));
const oauth=JSON.parse(await readFile('.migration/google-oauth.json','utf8'));
let vapid;try{vapid=JSON.parse(await readFile('.migration/vapid.json','utf8'));}catch{vapid=webpush.generateVAPIDKeys();await writeFile('.migration/vapid.json',JSON.stringify(vapid));}
const secrets={GOOGLE_CLIENT_SECRET:oauth.clientSecret,VAPID_PRIVATE_KEY:vapid.privateKey};
secrets.OPENAI_API_KEY=settings.openaiKey||settings.openaiApiKey;
secrets.OPENROUTER_API_KEY=settings.openrouterKey||settings.openrouterApiKey;
secrets.GEMINI_API_KEY=settings.geminiKey||settings.geminiApiKey;
if(settings.apiKey){if(settings.apiKey.startsWith('sk-or-'))secrets.OPENROUTER_API_KEY||=settings.apiKey;else if(settings.apiKey.startsWith('sk-'))secrets.OPENAI_API_KEY||=settings.apiKey;else secrets.GEMINI_API_KEY||=settings.apiKey;}
for(const key of Object.keys(secrets))if(!secrets[key])delete secrets[key];
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));config.vars.GOOGLE_CLIENT_ID=oauth.clientId;config.vars.VAPID_PUBLIC_KEY=vapid.publicKey;
await writeFile('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
const result=await new Promise(resolve=>{const child=spawn(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),'secret','bulk'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('close',code=>resolve({code,output}));child.stdin.end(JSON.stringify(secrets));});
if(result.code){await writeFile('.migration/secret-configuration-error.log',result.output);throw new Error('Secret configuration failed; diagnostic log is stored privately.');}
console.log('Configured '+Object.keys(secrets).length+' Worker secrets. Credential values were not printed or added to website files.');
