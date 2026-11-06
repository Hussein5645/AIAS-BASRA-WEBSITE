import {context,record,hydrate,HttpsError} from './platform.js';
import {permissions,canRead,canAccessMedia} from './access.js';
import {validPath} from './policy.js';
const error=(code,message)=>{throw new HttpsError(code,message);};
export function redact(value){
 if(typeof value==='string'&&/^(sk-|AIza|Bearer\s)/.test(value))return '[redacted]';
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/password|secret|token|credential|api.?key|private.?key|^(key|authorization|bearer)$/i.test(key)?'[redacted]':redact(item)]));
 return value;
}
export async function libraryRoute(request,url){
 const perms=await permissions();if(!perms.length)error(context().user?'permission-denied':'unauthenticated','Administrator access is required.');
 if(request.method!=='GET')return Response.json({error:'This library is read-only.'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
 const source=url.searchParams.get('source')||'database',path=url.searchParams.get('path')||'',file=url.searchParams.get('file');
 if(path&&!validPath(path)||file&&!validPath(file))error('invalid-argument','Invalid folder path.');
 const prefix=path?path+'/':'',{env}=context();
 if(source==='database'){
  if(file){const item=await record(file);if(!item||!await canRead(file,item.data))error('permission-denied','This record is unavailable.');return result({source,path:file,kind:'document',data:redact(item.data)});}
  const full=perms.includes('*');
  const rows=await env.DB.prepare(`SELECT ${full?'path,length(data) AS size':'*,length(data) AS size'} FROM documents WHERE path>=? AND path<? ORDER BY path`).bind(prefix,prefix+'\uffff').all();
  if(!full){context().records??=new Map();for(const item of rows.results)context().records.set(item.path,{...item,data:hydrate(JSON.parse(item.data))});}
  const folders=new Map(),files=[];
  for(const item of rows.results){
   if(!perms.includes('*')&&!await canRead(item.path,(await record(item.path))?.data))continue;
   const relative=item.path.slice(prefix.length),parts=relative.split('/');
   if(parts.length>1){const child=prefix+parts[0];folders.set(child,{name:parts[0],path:child});}
   else files.push({name:parts[0],path:item.path,kind:'document',size:item.size});
  }
  return result({source,path,folders:[...folders.values()],files});
 }
 if(source!=='media')error('invalid-argument','Unknown library.');
 if(file){if(!await canAccessMedia(file))error('permission-denied','This file is unavailable.');const item=await env.MEDIA.head(file);if(!item)error('not-found','File not found.');return result({source,path:file,kind:'file',size:item.size,contentType:item.httpMetadata?.contentType||'application/octet-stream',url:'/media/'+encodeURIComponent(file)});}
 const listing=await env.MEDIA.list({prefix,delimiter:'/',limit:1000,cursor:url.searchParams.get('cursor')||undefined,include:['httpMetadata']});
 const files=[];for(const item of listing.objects)if(!item.key.endsWith('/')&&await canAccessMedia(item.key))files.push({name:item.key.slice(prefix.length),path:item.key,kind:'file',size:item.size,contentType:item.httpMetadata?.contentType||''});
 return result({source,path,folders:listing.delimitedPrefixes.map(key=>({name:key.slice(prefix.length).replace(/\/$/,''),path:key.replace(/\/$/,'')})),files,cursor:listing.truncated?listing.cursor:null});
}
const result=value=>Response.json(value,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
