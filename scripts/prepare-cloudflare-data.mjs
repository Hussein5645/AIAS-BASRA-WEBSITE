import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const raw=JSON.parse(await readFile('.migration/firebase-documents.json','utf8'));
const identities=JSON.parse(await readFile('.migration/firebase-identities.json','utf8'));
const output=path.resolve('.migration/extracted-media');await mkdir(output,{recursive:true});
const media=[],links=[],documents=new Map();
function decode(value){
  if('stringValue'in value)return value.stringValue;
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return Number(value.doubleValue);
  if('booleanValue'in value)return value.booleanValue;
  if('nullValue'in value)return null;
  if('timestampValue'in value){const date=new Date(value.timestampValue);return {seconds:Math.floor(date.getTime()/1000),nanoseconds:(date.getTime()%1000)*1000000};}
  if('arrayValue'in value)return (value.arrayValue.values||[]).map(decode);
  if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,v])=>[key,decode(v)]));
  if('referenceValue'in value)return value.referenceValue.split('/documents/')[1];
  if('geoPointValue'in value)return value.geoPointValue;
  if('bytesValue'in value)return {__binary:value.bytesValue};
  return null;
}
for(const entry of raw.documents){const key=entry.name.split('/documents/')[1];if(entry.fields)documents.set(key,Object.fromEntries(Object.entries(entry.fields).map(([field,value])=>[field,decode(value)])));}
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','application/pdf':'pdf','model/gltf-binary':'glb','model/gltf+json':'gltf'};
async function saveMedia(bytes,type,documentPath,fieldName){
  const hash=createHash('sha256').update(bytes).digest('hex');
  const owner=documentPath.split('/');
  let key=`migrated/${hash}.${extensions[type]||'bin'}`;
  if(['users','publicProfiles'].includes(owner[0])&&/photo|avatar|banner|image/i.test(fieldName))key=`community/profiles/${owner[1]}/migrated-${hash.slice(0,20)}.${extensions[type]||'bin'}`;
  if(owner[0]==='communityPosts')key=`community/posts/${owner[1]}/migrated-${hash.slice(0,20)}.${extensions[type]||'bin'}`;
  const target=path.join(output,hash);
  await writeFile(target,bytes);
  media.push({key,file:target,bytes:bytes.length,contentType:type,sha256:hash});
  links.push({key,documentPath,public:key.startsWith('community/profiles/')?true:false});
  return '/media/'+encodeURIComponent(key);
}
function rewriteURL(text){
  text=text.replace(/https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?\s"'<>]+)(?:\?[^\s"'<>]*)?/g,(all,key)=>'/media/'+encodeURIComponent(decodeURIComponent(key)));
  text=text.replaceAll('https://space-42d87.web.app/','https://aiasbsr.com/').replaceAll('https://space-42d87.firebaseapp.com/','https://aiasbsr.com/');
  text=text.replace(/https:\/\/raw\.githubusercontent\.com\/Hussein5645\/AIAS-BASRA-WEBSITE\/[^/]+\//gi,'/');
  return text;
}
async function transform(value,doc,field=''){
  if(typeof value==='string'){
    const match=value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if(match)return saveMedia(Buffer.from(match[2],'base64'),match[1],doc,field);
    const inline=[...value.matchAll(/data:([\w.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)/g)];
    if(inline.length){let result='',offset=0;for(const image of inline){result+=value.slice(offset,image.index)+await saveMedia(Buffer.from(image[2],'base64'),image[1],doc,field);offset=image.index+image[0].length;}return rewriteURL(result+value.slice(offset));}
    return rewriteURL(value);
  }
  if(Array.isArray(value))return Promise.all(value.map((item,index)=>transform(item,doc,field+'.'+index)));
  if(value&&typeof value==='object'){
    if(value.__binary)return saveMedia(Buffer.from(value.__binary,'base64'),'application/octet-stream',doc,field);
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,val])=>[key,await transform(val,doc,key)])));
  }
  return value;
}
const chunks=new Map();
for(const [key,data]of documents)if(typeof data.data==='string'&&/\/(imageChunks|fileChunks|chunks|images)\//.test(key)){
  const collection=key.split('/').slice(0,-1).join('/');if(!chunks.has(collection))chunks.set(collection,[]);chunks.get(collection).push({key,...data});
}
for(const [collection,parts]of chunks){
  parts.sort((a,b)=>Number(a.index)-Number(b.index));const combined=parts.map(item=>item.data).join('');
  const parent=collection.split('/').slice(0,-1).join('/');const match=combined.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  const type=match?.[1]||documents.get(parent)?.fileMimeType||documents.get(parent)?.mimeType||'application/octet-stream';
  const url=await saveMedia(Buffer.from(match?match[2]:combined,'base64'),type,parent,collection.split('/').at(-1));
  for(const part of parts)documents.delete(part.key);
  documents.set(collection+'/file',{data:url,index:0,fileKey:decodeURIComponent(url.slice(7)),storage:'r2'});
}
for(const [key,data]of documents){
  if(key==='systemConfig/ai_assistant'){
    // Credentials move directly into Worker secrets, never into imported records.
    const settings={};for(const name of ['provider','openrouterModel','openaiModel','geminiModel'])if(data[name])settings[name]=data[name];documents.set(key,settings);
  }else if(!key.endsWith('/file')||data.storage!=='r2')documents.set(key,await transform(data,key));
}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=[];
for(const [key,data]of documents){const parts=key.split('/');sql.push(`INSERT INTO documents(path,collection,id,data,version,updated_at) VALUES(${quote(key)},${quote(parts.slice(0,-1).join('/'))},${quote(parts.at(-1))},${quote(JSON.stringify(data))},1,${Date.now()}) ON CONFLICT(path) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at;`);}
for(const identity of identities)sql.push(`INSERT INTO identities(google_subject,user_id,email,disabled) VALUES(${quote(identity.googleSubject)},${quote(identity.userId)},${quote(identity.email)},${identity.disabled?1:0}) ON CONFLICT(google_subject) DO UPDATE SET user_id=excluded.user_id,email=excluded.email,disabled=excluded.disabled;`);
const uniqueLinks=new Map(links.map(link=>[link.key,link]));
for(const link of uniqueLinks.values())sql.push(`INSERT INTO asset_links(key,document_path,is_public) VALUES(${quote(link.key)},${quote(link.documentPath)},${link.public?1:0}) ON CONFLICT(key) DO UPDATE SET document_path=excluded.document_path,is_public=excluded.is_public;`);
await writeFile('.migration/cloudflare-import.sql',sql.join('\n'));
await writeFile('.migration/extracted-media-inventory.json',JSON.stringify([...new Map(media.map(item=>[item.key,item])).values()],null,2));
await writeFile('.migration/cloudflare-records.json',JSON.stringify([...documents].map(([path,data])=>({path,data}))));
console.log(`Prepared ${documents.size} records, ${identities.length} trusted identity mappings, and ${new Set(media.map(m=>m.key)).size} extracted R2 files. AI credentials were excluded from the import.`);
