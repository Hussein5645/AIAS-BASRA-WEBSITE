import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const verification=JSON.parse(await readFile('.migration/r2-verification.json','utf8'));
if(verification.failures.length||verification.objects<266)throw new Error('Complete R2 integrity verification is required.');
const inventory=JSON.parse(await readFile('.migration/media-inventory.json','utf8'));
execFileSync('git',['rm','--cached','--ignore-unmatch','--',...inventory.files.map(file=>file.key)],{stdio:'pipe'});
console.log('Removed verified media from Git tracking; local files and Git history remain available.');
