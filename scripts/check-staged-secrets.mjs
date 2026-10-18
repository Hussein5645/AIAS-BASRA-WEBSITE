import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const raw=JSON.parse(await readFile('.migration/firebase-documents.json','utf8'));
const fields=raw.documents.find(doc=>doc.name.endsWith('/systemConfig/ai_assistant'))?.fields||{};
const oauth=JSON.parse(await readFile('.migration/google-oauth.json','utf8'));
const vapid=JSON.parse(await readFile('.migration/vapid.json','utf8'));
const secrets=[oauth.clientSecret,vapid.privateKey,...Object.entries(fields).filter(([name])=>/key/i.test(name)).map(([,value])=>value.stringValue)].filter(value=>typeof value==='string'&&value.length>12);
const files=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z']).toString().split('\0').filter(Boolean),failures=[];
for(const file of files){if(file.startsWith('.migration/')||file.startsWith('.wrangler/')||file.startsWith('dist/'))failures.push(file);const content=execFileSync('git',['show',':'+file],{maxBuffer:16*1024*1024}).toString();if(secrets.some(secret=>content.includes(secret)))failures.push(file);}
if(failures.length){console.error('Private data detected in staged files: '+[...new Set(failures)].join(', '));process.exitCode=1;}else console.log('Checked '+files.length+' staged source files: no migrated credentials or private exports detected.');
