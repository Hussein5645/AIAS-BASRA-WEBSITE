// Same-origin Cloudflare API. Session credentials stay in an HttpOnly cookie.
export async function request(path, body, method='POST') {
  const response=await fetch(path,{method,credentials:'same-origin',headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
  const result=await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed'),{status:response.status});
  return result;
}

// Compatibility surface for existing UI code; every operation uses our Worker API.
const app={options:{projectId:'aias-basra'}};
const database={},storage={},auth={currentUser:null};
export const initializeApp=()=>app;
export const getApp=()=>app;
export const getFirestore=()=>database;
export const initializeFirestore=()=>database;
export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});
export const getStorage=()=>storage;
export const getAuth=()=>auth;
export const getFunctions=()=>({});
export const httpsCallable=(instance,name)=>async data=>({data:await request('/api/functions/'+encodeURIComponent(name),data||{})});
export const callFunction=async(name,data={})=>(await httpsCallable(null,name)(data)).data;
const cache=new Map(),listeners=new Set();
let sessionReady;
export function onAuthStateChanged(instance,callback,errorCallback){
  listeners.add(callback);
  if(!sessionReady)sessionReady=request('/api/auth/session',undefined,'GET').then(result=>{auth.currentUser=result.user;return result.user;});
  sessionReady.then(user=>{if(listeners.has(callback))callback(user);}).catch(error=>{if(errorCallback)errorCallback(error);else console.error('Session unavailable',error);if(listeners.has(callback))callback(null);});
  return ()=>listeners.delete(callback);
}
export async function signOut(){await request('/api/auth/logout',{});auth.currentUser=null;sessionReady=Promise.resolve(null);cache.clear();for(const callback of listeners)callback(null);}
export class GoogleAuthProvider {}
export function signInWithRedirect(){const target=new URL('/api/auth/start',location.origin);target.searchParams.set('return',location.pathname+location.search);location.assign(target.href);}
export const getRedirectResult=async()=>null;
export const signInWithCredential=()=>{throw new Error('This old sign-in link has expired. Use the Google sign-in button again.');};
function reference(base,...parts){const path=[base?.path,...parts].filter(Boolean).join('/');return {path,id:path.split('/').at(-1),kind:'document'};}
export const collection=(base,...parts)=>({...reference(base,...parts),kind:'collection'});
export function doc(base,...parts){return reference(base,...(parts.length?parts:[crypto.randomUUID()]));}
export const documentId=()=>'__name__';
export const where=(field,op,value)=>({type:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({type:'orderBy',field,direction});
export const limit=value=>({type:'limit',value});
export const startAfter=(value,...rest)=>({type:'startAfter',id:value?.id,values:value?.data?value.data():[value,...rest]});
export const query=(ref,...filters)=>({...ref,filters:[...(ref.filters||[]),...filters]});
export const serverTimestamp=()=>({__cloudflareOperation:'timestamp'});
function hydrate(value){if(Array.isArray(value))return value.map(hydrate);if(value&&typeof value==='object'){if(typeof value.seconds==='number'&&typeof value.nanoseconds==='number'&&Object.keys(value).length===2)return {...value,toMillis:()=>value.seconds*1000+value.nanoseconds/1000000,toDate:()=>new Date(value.seconds*1000+value.nanoseconds/1000000)};return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,hydrate(v)]));}return value;}
function snapshot(row,ref){return {id:ref.id,ref,version:row?.version||0,exists:()=>!!row,data:()=>row?hydrate(row.data):undefined,metadata:{fromCache:false}};}
export async function getDoc(ref){const result=await request('/api/db',{action:'get',path:ref.path});const value=snapshot(result.document,ref);cache.set(ref.path,value);return value;}
export async function getDocs(ref){const result=await request('/api/db',{action:'list',path:ref.path,filters:ref.filters||[]});const docs=result.documents.map(row=>snapshot(row,{path:row.path,id:row.id,kind:'document'}));const value={docs,size:docs.length,empty:!docs.length,forEach:callback=>docs.forEach(callback),docChanges:()=>docs.map(doc=>({type:'added',doc})),metadata:{fromCache:false}};cache.set(JSON.stringify(ref),value);return value;}
export async function getDocFromCache(ref){if(cache.has(ref.path))return cache.get(ref.path);throw new Error('No cached record');}
export async function getDocsFromCache(ref){const key=JSON.stringify(ref);if(cache.has(key))return cache.get(key);throw new Error('No cached results');}
export const setDoc=(ref,data,options={})=>request('/api/db',{action:'set',path:ref.path,data,merge:!!options.merge});
export const updateDoc=(ref,data)=>request('/api/db',{action:'update',path:ref.path,data,merge:true});
export const deleteDoc=ref=>request('/api/db',{action:'delete',path:ref.path});
export async function addDoc(ref,data){const created=doc(ref);await setDoc(created,data);return created;}
export function writeBatch(){const operations=[];const batch={set:(ref,data,options={})=>{operations.push({action:'set',path:ref.path,data,merge:!!options.merge});return batch;},update:(ref,data)=>{operations.push({action:'update',path:ref.path,data,merge:true});return batch;},delete:ref=>{operations.push({action:'delete',path:ref.path});return batch;},commit:()=>request('/api/batch',{operations})};return batch;}
export async function runTransaction(instance,callback){
  for(let attempt=0;attempt<3;attempt++){
    const operations=[],readVersions={};
    const result=await callback({get:async ref=>{const value=await getDoc(ref);readVersions[ref.path]=value.version;return value;},set:(ref,data,options={})=>operations.push({action:'set',path:ref.path,data,merge:!!options.merge}),update:(ref,data)=>operations.push({action:'update',path:ref.path,data,merge:true}),delete:ref=>operations.push({action:'delete',path:ref.path})});
    try{if(operations.length)await request('/api/batch',{operations,readVersions});return result;}catch(error){if(error.status!==409||attempt===2)throw error;}
  }
}
export function onSnapshot(ref,...args){
  const callback=args.find(arg=>typeof arg==='function'),errorCallback=args.filter(arg=>typeof arg==='function')[1];
  let active=true,timer,previous=new Map(),last='';
  const poll=async()=>{
    try{
      const value=await (ref.kind==='collection'?getDocs(ref):getDoc(ref));if(!active)return;
      const signature=JSON.stringify(value.docs?value.docs.map(doc=>[doc.id,doc.version]):[value.exists(),value.version]);
      if(signature!==last){
        if(value.docs){const changes=[];const next=new Map(value.docs.map(doc=>[doc.id,doc]));for(const doc of value.docs)if(!previous.has(doc.id))changes.push({type:'added',doc});else if(previous.get(doc.id).version!==doc.version)changes.push({type:'modified',doc});for(const [id,doc]of previous)if(!next.has(id))changes.push({type:'removed',doc});value.docChanges=()=>changes;previous=next;}
        last=signature;callback(value);
      }
    }catch(error){if(active)errorCallback?.(error);}
    if(active)timer=setTimeout(poll,document.hidden?30000:4000);
  };
  queueMicrotask(poll);return ()=>{active=false;clearTimeout(timer);};
}
export function ref(instance,path){
  if(/^https?:|^\/media\//.test(path)){const url=new URL(path,location.origin);if(url.pathname.startsWith('/media/'))path=decodeURIComponent(url.pathname.slice(7));else throw new Error('Only Cloudflare media URLs are supported.');}
  return {path,fullPath:path,name:path.split('/').at(-1)};
}
export const getDownloadURL=async target=>new URL('/media/'+encodeURIComponent(target.path),location.origin).href;
export async function getBlob(target){const response=await fetch(await getDownloadURL(target),{credentials:'same-origin'});if(!response.ok)throw new Error('File is unavailable');return response.blob();}
export const deleteObject=target=>request('/api/storage?key='+encodeURIComponent(target.path),undefined,'DELETE');
export async function uploadBytes(target,file,metadata={}){
  const response=await fetch('/api/storage?key='+encodeURIComponent(target.path),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':metadata.contentType||file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name||target.name)},body:file});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');return {ref:target,metadata:{size:file.size,fullPath:target.path}};
}
export function uploadBytesResumable(target,file,metadata={}){
  const observers=new Set(),xhr=new XMLHttpRequest();
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const task={snapshot:{ref:target,bytesTransferred:0,totalBytes:file.size,state:'running'},then:(...args)=>promise.then(...args),catch:(...args)=>promise.catch(...args),cancel:()=>{xhr.abort();return true;},on:(event,next,error,complete)=>{const observer={next,error,complete};observers.add(observer);next?.(task.snapshot);return ()=>observers.delete(observer);}};
  xhr.open('PUT','/api/storage?key='+encodeURIComponent(target.path));xhr.withCredentials=true;xhr.setRequestHeader('Content-Type',metadata.contentType||file.type||'application/octet-stream');xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name||target.name));
  xhr.upload.onprogress=event=>{task.snapshot.bytesTransferred=event.loaded;for(const observer of observers)observer.next?.(task.snapshot);};
  const failed=error=>{task.snapshot.state='error';for(const observer of observers)observer.error?.(error);reject(error);};
  xhr.onerror=()=>failed(new Error('Upload connection failed'));xhr.onabort=()=>failed(new Error('Upload canceled'));
  xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{return failed(new Error('Upload failed'));}if(xhr.status<200||xhr.status>=300)return failed(new Error(result.error||'Upload failed'));task.snapshot={...task.snapshot,state:'success',bytesTransferred:file.size};for(const observer of observers){observer.next?.(task.snapshot);observer.complete?.();}resolve(task.snapshot);};
  queueMicrotask(()=>xhr.send(file));return task;
}
export async function uploadString(target,value,format='raw',metadata={}){const source=format==='data_url'?value:format==='base64'?'data:'+(metadata.contentType||'application/octet-stream')+';base64,'+value:null;const file=source?await (await fetch(source)).blob():new Blob([value],{type:metadata.contentType});return uploadBytes(target,file,metadata);}
export async function registerWebPush(registration){
  const config=await request('/api/push/config',undefined,'GET');
  const base64=config.publicKey.replace(/-/g,'+').replace(/_/g,'/');const decoded=atob(base64+'='.repeat((4-base64.length%4)%4));const applicationServerKey=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  await request('/api/push/subscribe',{subscription:subscription.toJSON()});return subscription.endpoint;
}
