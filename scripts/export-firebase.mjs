// One-time migration tooling. Firebase credentials stay inside the official CLI client.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const location=process.env.FIREBASE_TOOLS_PATH || path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
const require=createRequire(import.meta.url);
const auth=require(path.join(location,'auth.js'));
const {requireAuth}=require(path.join(location,'requireAuth.js'));
const {Client}=require(path.join(location,'apiv2.js'));
const account=auth.findAccountByEmail('sarayspace1@gmail.com');
if(!account)throw new Error('Sign into the Firebase CLI account that owns space-42d87.');
await requireAuth({...account,project:'space-42d87'});
const firestore=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
const hosting=new Client({urlPrefix:'https://firebasehosting.googleapis.com',apiVersion:'v1beta1'});
const storage=new Client({urlPrefix:'https://storage.googleapis.com',apiVersion:'storage/v1'});
const functions=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'});
const base='projects/space-42d87/databases/(default)/documents';
const root=path.resolve('.migration');await mkdir(root,{recursive:true});
async function listCollections(parent){
  const all=[];let pageToken;
  do{const result=await firestore.post(parent+':listCollectionIds',{pageSize:1000,...(pageToken?{pageToken}:{})});all.push(...(result.body.collectionIds||[]));pageToken=result.body.nextPageToken;}while(pageToken);
  return all;
}
const collections=await listCollections(base);
const release=await hosting.get('sites/space-42d87/releases',{queryParams:{pageSize:1}});
const version=release.body.releases?.[0]?.version?.name;
const fileEntries=[];let pageToken;
if(version)do{const response=await hosting.get(version+'/files',{queryParams:{pageSize:1000,...(pageToken?{pageToken}:{})}});fileEntries.push(...(response.body.files||[]));pageToken=response.body.nextPageToken;}while(pageToken);
const deployed=await functions.get('projects/space-42d87/locations/us-central1/functions');
await writeFile(path.join(root,'firebase-source-inventory.json'),JSON.stringify({collections,hostingVersion:version,files:fileEntries,functions:(deployed.body.functions||[]).map(f=>({name:f.name,source:f.buildConfig?.source}))},null,2));
console.log(`Firebase access confirmed: ${collections.length} top-level collections, ${fileEntries.length} hosted files, ${(deployed.body.functions||[]).length} deployed functions.`);
const functionsOnly=process.argv.includes('--functions-only');
const sourceOnly=process.argv.includes('--source-only') || functionsOnly;
if(!process.argv.includes('--export') && !sourceOnly)process.exit(0);
const documents=[];
async function exportParent(parent){
  for(const collection of await listCollections(parent)){
    let next;
    do{
      const result=await firestore.get(parent+'/'+encodeURIComponent(collection),{queryParams:{pageSize:100,showMissing:true,...(next?{pageToken:next}:{})}});
      for(const document of result.body.documents||[]){
        documents.push(document);
        await exportParent(document.name);
      }
      next=result.body.nextPageToken;
    }while(next);
  }
}
if(!sourceOnly){
  await exportParent(base);
  await writeFile(path.join(root,'firebase-documents.json'),JSON.stringify({project:'space-42d87',exportedAt:new Date().toISOString(),documents}));
  console.log(`Exported ${documents.length} records to the ignored migration folder. No live records were changed.`);
}
const live=path.join(root,sourceOnly?'source-current':'live-community');await mkdir(live,{recursive:true});
let copied=0;
for(const entry of functionsOnly?[]:fileEntries){
  const name=entry.path?.replace(/^\//,'');
  if(!name || name.startsWith('__/') || !/\.(html|js|css|json|webmanifest)$/.test(name))continue;
  const target=path.resolve(live,name);
  if(!target.startsWith(live+path.sep))throw new Error('Invalid hosted file path');
  const response=await fetch('https://space-42d87.web.app/'+name);
  if(!response.ok)throw new Error('Could not retrieve deployed source: '+name);
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,new Uint8Array(await response.arrayBuffer()));copied++;
}
console.log(`Recovered ${copied} currently deployed website source files.`);
const source=(deployed.body.functions||[]).find(f=>f.buildConfig?.source?.storageSource)?.buildConfig.source.storageSource;
if(source){
  // The source archive is retrieved with the existing Google account authorization.
  const result=await storage.get(`b/${encodeURIComponent(source.bucket)}/o/${encodeURIComponent(source.object)}`,{queryParams:{alt:'media',...(source.generation?{generation:source.generation}:{})},responseType:'stream',resolveOnHTTPError:true});
  if(result.status>=400)throw new Error('Function source download was denied by Google Cloud: '+result.status);
  const chunks=[];for await(const chunk of result.body)chunks.push(chunk);
  await writeFile(path.join(root,sourceOnly?'source-functions.zip':'live-functions.zip'),Buffer.concat(chunks));
  console.log('Recovered the currently deployed function source archive.');
}
