import {context,record,Query,commit,HttpsError} from './platform.js';
import {canRead,canReadPost,authorizeWrite,canAccessMedia,permissions} from './access.js';
import {validPath} from './policy.js';
import {communityHandlers} from './community/handlers.js';
export const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const deny=(message='You do not have permission for this operation.')=>{throw new HttpsError(context().user?'permission-denied':'unauthenticated',message);};
const invalid=message=>{throw new HttpsError('invalid-argument',message);};
const fileURL=key=>context().origin+'/media/'+encodeURIComponent(key);
async function body(request){if(Number(request.headers.get('Content-Length'))>2000000)invalid('Request is too large. Upload files to R2.');return request.json();}
async function write(operations,versions){
 if(!Array.isArray(operations)||operations.length>200)invalid('Invalid batch size');
 for(const op of operations){
  if(!validPath(op.path)||op.path.split('/').length%2||!['set','update','delete'].includes(op.action))invalid('Invalid document operation');
  if(op.action!=='delete'&&(!op.data||typeof op.data!=='object'||Array.isArray(op.data)||JSON.stringify(op.data).length>500000))invalid('Invalid or oversized record');
  if(/data:[^;]+;base64,/.test(JSON.stringify(op.data||{})))invalid('Files must be uploaded to R2.');
  await authorizeWrite(op,(await record(op.path))?.data);
 }
 const reads=new Map();
 for(const [path,version]of Object.entries(versions||{})){if(!validPath(path)||!Number.isSafeInteger(version)||version<0)invalid('Invalid transaction version');if(!await canRead(path,(await record(path))?.data))deny();reads.set(path,version);}
 await commit(operations,reads.size?reads:undefined);return json({success:true});
}
export async function databaseRoute(request){
 const data=await body(request),{action,path}=data;
 if(!validPath(path))invalid('Invalid path');
 if(action==='get'){
  if(path.split('/').length%2)invalid('Expected a document path');
  const current=await record(path);if(!await canRead(path,current?.data))deny();return json({document:current});
 }
 if(action==='list'){
  if(!(path.split('/').length%2))invalid('Expected a collection path');
  let query=new Query(path);const filters=data.filters||[];
  if(!Array.isArray(filters)||filters.length>30)invalid('Too many query filters');
  for(const filter of filters){if(filter.type==='where')query=query.where(filter.field,filter.op,filter.value);if(filter.type==='orderBy')query=query.orderBy(filter.field,filter.direction);}
  const result=await query.get(),documents=[];
  for(const doc of result.docs)if(await canRead(doc.ref.path,doc.data()))documents.push({path:doc.ref.path,id:doc.id,data:doc.data(),version:doc.version});
  const cursor=filters.find(filter=>filter.type==='startAfter');
  if(cursor?.id){const index=documents.findIndex(doc=>doc.id===cursor.id);if(index>=0)documents.splice(0,index+1);}
  const maximum=filters.find(filter=>filter.type==='limit')?.value;if(maximum!==undefined){if(!Number.isSafeInteger(maximum)||maximum<1||maximum>1000)invalid('Invalid query limit');documents.splice(maximum);}
  return json({documents});
 }
 return write([{...data,merge:data.merge||action==='update'}]);
}
export async function batchRoute(request){const data=await body(request);return write(data.operations,data.readVersions);}
export async function functionRoute(request,name){
 if(!Object.hasOwn(communityHandlers,name)||['communityShare','syncCommunityPublicProfile'].includes(name))throw new HttpsError('not-found','Unknown function');
 const data=await body(request),user=context().user;
 if(name==='getCommunityThread'){
  const id=data.postId||data.parentPostId;if(!id||!validPath('communityPosts/'+id)||!await canReadPost((await record('communityPosts/'+id))?.data))deny('This post is unavailable.');
 }
 const result=await communityHandlers[name]({data,auth:user?{uid:user.uid,token:{email:user.email,name:user.displayName,picture:user.photoURL,email_verified:true}}:null,rawRequest:{headers:Object.fromEntries(request.headers),ip:request.headers.get('CF-Connecting-IP')||''}});
 if(name==='getCommunityThread'&&result.subPosts){const visible=[];for(const post of result.subPosts)if(await canReadPost(post))visible.push(post);result.subPosts=visible;}
 return json(result);
}
export async function storageRoute(request,url){
 const {env,user}=context(),key=url.searchParams.get('key');
 if(!validPath(key)||key.length>512)invalid('Invalid storage path');
 if(!user)deny();if(!await canAccessMedia(key,true,request.method==='DELETE'))deny();
 if(request.method==='DELETE'){await env.MEDIA.delete(key);await env.DB.prepare('DELETE FROM media WHERE key=?').bind(key).run();return json({success:true});}
 if(request.method!=='PUT')throw Object.assign(new Error('Method not allowed'),{status:405});
 const size=Number(request.headers.get('Content-Length'));if(!Number.isFinite(size)||size<1||size>100*1024*1024)invalid('Choose a file between 1 byte and 100 MB.');
 const type=request.headers.get('Content-Type')||'application/octet-stream';
 if(/html|javascript|xml|svg/i.test(type))invalid('This file type is not supported.');
 const existing=await env.MEDIA.head(key);if(existing&&!await canAccessMedia(key,true,true))deny('An existing file cannot be overwritten.');
 await env.MEDIA.put(key,request.body,{httpMetadata:{contentType:type},customMetadata:{owner:user.uid}});
 await env.DB.prepare('INSERT INTO media(key,owner_id,name,content_type,size,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET size=excluded.size,content_type=excluded.content_type').bind(key,user.uid,key.split('/').at(-1),type,size,Date.now()).run();
 return json({success:true,key,url:fileURL(key),size});
}
export async function mediaRoute(request,url){
 const {env}=context(),perms=await permissions();if(!perms.includes('*')&&!perms.some(p=>p.startsWith('manage_')))deny('Administrator access is required.');
 if(request.method==='GET'){
  const result=await env.MEDIA.list({limit:50,cursor:url.searchParams.get('cursor')||undefined,include:['httpMetadata']});
  const objects=[];for(const object of result.objects)if(!object.key.endsWith('/')&&await canAccessMedia(object.key))objects.push({key:object.key,size:object.size,uploaded:object.uploaded,contentType:object.httpMetadata?.contentType,url:fileURL(object.key)});
  return json({objects,cursor:result.truncated?result.cursor:null});
 }
 if(request.method!=='POST')throw Object.assign(new Error('Method not allowed'),{status:405});
 const form=await request.formData(),file=form.get('file');
 if(!file||typeof file==='string'||file.size<1||file.size>100*1024*1024)invalid('Choose a file between 1 byte and 100 MB.');
 const prefix=String(form.get('prefix')||'uploads').replace(/[^a-zA-Z0-9/_-]/g,'').replace(/^\/+|\/+$/g,'');
 const key=prefix+'/'+crypto.randomUUID()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 return storageRoute(new Request(new URL('/api/storage?key='+encodeURIComponent(key),url),{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream','Content-Length':String(file.size)},body:file.stream(),duplex:'half'}),new URL('/api/storage?key='+encodeURIComponent(key),url));
}
export async function shareRoute(request,url){
 let status=200,payload='',headers=new Headers();const response={set:(key,value)=>{headers.set(key,value);return response;},status:code=>{status=code;return response;},send:value=>{payload=value;return response;},redirect:(code,value)=>{if(value===undefined){value=code;code=302;}status=code;headers.set('Location',value);return response;}};
 await communityHandlers.communityShare({method:request.method,path:url.pathname,query:Object.fromEntries(url.searchParams),get:name=>request.headers.get(name)},response);
 return new Response(request.method==='HEAD'?null:payload,{status,headers});
}
