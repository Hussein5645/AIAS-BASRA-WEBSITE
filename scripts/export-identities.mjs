import {client} from './firebase-migration-client.mjs';
import {writeFile} from 'node:fs/promises';
const api=client('https://identitytoolkit.googleapis.com','v1');
const identities=[];let nextPageToken;
do{
  const result=await api.get('projects/space-42d87/accounts:batchGet',{queryParams:{maxResults:1000,...(nextPageToken?{nextPageToken}:{})}});
  for(const user of result.body.users||[]){const provider=user.providerUserInfo?.find(item=>item.providerId==='google.com');if(provider?.rawId)identities.push({googleSubject:provider.rawId,userId:user.localId,email:user.email||'',disabled:!!user.disabled});}
  nextPageToken=result.body.nextPageToken;
}while(nextPageToken);
await writeFile('.migration/firebase-identities.json',JSON.stringify(identities));
console.log(`Exported ${identities.length} Google identity mappings. Password hashes and tokens were not exported.`);
