import {client} from './firebase-migration-client.mjs';
import {writeFile} from 'node:fs/promises';
const api=client('https://identitytoolkit.googleapis.com','v2');
try{
 const result=await api.get('/projects/space-42d87/defaultSupportedIdpConfigs/google.com');
 await writeFile('.migration/google-oauth.json',JSON.stringify(result.body));
 console.log('Google configuration recovered:',Object.keys(result.body).join(', '),'client secret present:',!!result.body.clientSecret);
}catch(error){console.log('Google configuration unavailable:',error.status||error.message?.split('\n')[0]);process.exitCode=1;}
