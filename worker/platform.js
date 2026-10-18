import {AsyncLocalStorage} from 'node:async_hooks';
import {Buffer} from 'node:buffer';
import {mergeData,validPath} from './policy.js';
export const runtime=new AsyncLocalStorage();
export const handlers={};
let triggers={};
export const configureTriggers=value=>{triggers=value;};
export const context=()=>{const value=runtime.getStore();if(!value)throw new Error('Missing request context');return value;};
export class HttpsError extends Error {
  constructor(code,message,details){super(message);this.code=code;this.details=details;this.status=({'unauthenticated':401,'permission-denied':403,'not-found':404,'invalid-argument':400,'already-exists':409,'failed-precondition':409,'resource-exhausted':429,'unavailable':503})[code]||500;}
}
export const onCall=(...args)=>args.at(-1);
export const onRequest=handler=>handler;
export const onDocumentWritten=(path,handler)=>handler;
export const onDocumentCreated=(path,handler)=>handler;
export const logger={info:(message)=>console.info(message),warn:(message)=>console.warn(message),error:(message)=>console.error(message)};
export const initializeApp=()=>({});
const operation=(type,value)=>({__cloudflareOperation:type,value});
export const FieldValue={serverTimestamp:()=>operation('timestamp'),increment:value=>operation('increment',value),arrayUnion:(...value)=>operation('union',value),arrayRemove:(...value)=>operation('remove',value),delete:()=>operation('delete')};
export class Timestamp {
  constructor(seconds,nanoseconds=0){this.seconds=seconds;this.nanoseconds=nanoseconds;}
  static now(){return Timestamp.fromMillis(Date.now());}
  static fromMillis(ms){return new Timestamp(Math.floor(ms/1000),(ms%1000)*1000000);}
  static fromDate(date){return Timestamp.fromMillis(date.getTime());}
  toMillis(){return this.seconds*1000+this.nanoseconds/1000000;}
  toDate(){return new Date(this.toMillis());}
}
export function hydrate(value){
  if(Array.isArray(value))return value.map(hydrate);
  if(value && typeof value==='object'){
    if(typeof value.seconds==='number' && typeof value.nanoseconds==='number' && Object.keys(value).length<=2)return new Timestamp(value.seconds,value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([key,val])=>[key,hydrate(val)]));
  }
  return value;
}
function resolveValues(value,current){
  if(value && typeof value==='object' && value.__cloudflareOperation){
    switch(value.__cloudflareOperation){
      case 'timestamp':return Timestamp.now();
      case 'increment':return Number(current||0)+Number(value.value||0);
      case 'union':return [...new Map([...(Array.isArray(current)?current:[]),...value.value].map(v=>[JSON.stringify(v),v])).values()];
      case 'remove':return (Array.isArray(current)?current:[]).filter(v=>!value.value.some(target=>JSON.stringify(target)===JSON.stringify(v)));
      case 'delete':return undefined;
      default:throw new HttpsError('invalid-argument','Invalid field operation');
    }
  }
  if(Array.isArray(value))return value.map(item=>resolveValues(item));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,val])=>[key,resolveValues(val,current?.[key])]));
  return value;
}
const field=(data,name)=>name==='__name__'?data?.id:name.split('.').reduce((value,key)=>value?.[key],data);
export function matches(data,filter){
  const a=field(data,filter.field),b=filter.value;
  switch(filter.op){case '==':return JSON.stringify(a)===JSON.stringify(b);case '!=':return a!==undefined&&JSON.stringify(a)!==JSON.stringify(b);case '<':return a<b;case '<=':return a<=b;case '>':return a>b;case '>=':return a>=b;case 'in':return b.includes(a);case 'not-in':return a!==undefined&&!b.includes(a);case 'array-contains':return Array.isArray(a)&&a.includes(b);case 'array-contains-any':return Array.isArray(a)&&b.some(v=>a.includes(v));default:throw new HttpsError('invalid-argument','Unsupported query operator');}
}
export async function record(path){
  if(!validPath(path))throw new HttpsError('invalid-argument','Invalid document path');
  const store=context();store.records??=new Map();if(store.records.has(path))return store.records.get(path);
  const row=await context().env.DB.prepare('SELECT * FROM documents WHERE path=?').bind(path).first();
  const value=row?{...row,data:hydrate(JSON.parse(row.data))}:null;store.records.set(path,value);return value;
}
export function snapshot(row,reference){return {id:reference.id,ref:reference,exists:!!row,data:()=>row?.data,version:row?.version||0};}
class Reference {
  constructor(path){if(!validPath(path))throw new HttpsError('invalid-argument','Invalid document path');this.path=path;this.id=path.split('/').at(-1);}
  collection(name){return new Query(this.path+'/'+name);}
  async get(){return snapshot(await record(this.path),this);}
  set(data,options={}){return commit([{action:'set',path:this.path,data,merge:!!options.merge}]);}
  create(data){return commit([{action:'create',path:this.path,data}]);}
  update(data){return commit([{action:'update',path:this.path,data,merge:true}]);}
  delete(){return commit([{action:'delete',path:this.path}]);}
}
export class Query {
  constructor(path,filters=[],orders=[],maximum=null){if(!validPath(path))throw new HttpsError('invalid-argument','Invalid collection path');this.path=path;this.id=path.split('/').at(-1);this.filters=filters;this.orders=orders;this.maximum=maximum;}
  doc(id=crypto.randomUUID()){return new Reference(this.path+'/'+id);}
  where(field,op,value){return new Query(this.path,[...this.filters,{field,op,value}],this.orders,this.maximum);}
  orderBy(field,direction='asc'){return new Query(this.path,this.filters,[...this.orders,{field,direction}],this.maximum);}
  limit(value){return new Query(this.path,this.filters,this.orders,value);}
  async add(data){const ref=this.doc();await ref.create(data);return ref;}
  async get(){
    const rows=await context().env.DB.prepare('SELECT * FROM documents WHERE collection=? ORDER BY id').bind(this.path).all();
    let docs=rows.results.map(row=>snapshot({...row,data:hydrate(JSON.parse(row.data))},new Reference(row.path)));
    for(const filter of this.filters)docs=docs.filter(doc=>matches({...doc.data(),id:doc.id},filter));
    if(this.orders.length)docs.sort((a,b)=>{for(const order of this.orders){let av=field(a.data(),order.field),bv=field(b.data(),order.field);av=av?.toMillis?.()??av;bv=bv?.toMillis?.()??bv;const result=av<bv?-1:av>bv?1:0;if(result)return order.direction==='desc'?-result:result;}return a.id.localeCompare(b.id);});
    if(this.maximum!==null)docs=docs.slice(0,this.maximum);
    return {docs,size:docs.length,empty:!docs.length,forEach:callback=>docs.forEach(callback)};
  }
}
function stageBatch(){const operations=[];const batch={set:(ref,data,options={})=>{operations.push({action:'set',path:ref.path,data,merge:!!options.merge});return batch;},create:(ref,data)=>{operations.push({action:'create',path:ref.path,data});return batch;},update:(ref,data)=>{operations.push({action:'update',path:ref.path,data,merge:true});return batch;},delete:ref=>{operations.push({action:'delete',path:ref.path});return batch;},commit:()=>commit(operations),operations};return batch;}
async function apply(operations,reads=new Map()){
  if(!operations.length)return;
  const env=context().env,states=new Map(),changes=[];
  for(const op of operations){
    if(!validPath(op.path)||op.path.split('/').length%2)throw new HttpsError('invalid-argument','Invalid document path');
    if(!states.has(op.path)){const current=await record(op.path);states.set(op.path,current);if(!reads.has(op.path))reads.set(op.path,current?.version||0);}
    const current=states.get(op.path);
    if(op.action==='create'&&current)throw new HttpsError('already-exists','This record already exists.');
    if(op.action==='update'&&!current)throw new HttpsError('not-found','Record not found');
    if(op.action==='delete'){changes.push({path:op.path,before:current,data:null});states.set(op.path,null);continue;}
    const resolved={};
    for(const [key,value] of Object.entries(op.data||{}))resolved[key]=resolveValues(value,field(current?.data,key));
    const data=op.merge?mergeData(current?.data,resolved):mergeData({},resolved);
    // Field deletion is explicit, including dotted update paths.
    for(const [key,value] of Object.entries(op.data||{}))if(value?.__cloudflareOperation==='delete'){
      const parts=key.split('.');let target=data;for(const part of parts.slice(0,-1))target=target?.[part];if(target)delete target[parts.at(-1)];
    }
    changes.push({path:op.path,before:current,data});states.set(op.path,{path:op.path,data,version:(current?.version||0)+1});
  }
  const transaction=crypto.randomUUID(),sql=[];
  for(const [path,version] of reads)sql.push(env.DB.prepare('INSERT INTO transaction_checks(id,valid) VALUES(?,CASE WHEN COALESCE((SELECT version FROM documents WHERE path=?),0)=? THEN 1 ELSE 0 END)').bind(transaction+':'+path,path,version));
  for(const [path,current] of states){
    if(!current)sql.push(env.DB.prepare('DELETE FROM documents WHERE path=?').bind(path));
    else{const parts=path.split('/');sql.push(env.DB.prepare('INSERT INTO documents(path,collection,id,data,version,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at').bind(path,parts.slice(0,-1).join('/'),parts.at(-1),JSON.stringify(current.data),current.version,Date.now()));}
    sql.push(env.DB.prepare('INSERT INTO audit_log(actor,action,path,created_at) VALUES(?,?,?,?)').bind(context().user?.email||'system',current?'write':'delete',path,Date.now()));
  }
  sql.push(env.DB.prepare('DELETE FROM transaction_checks WHERE id>=? AND id<?').bind(transaction+':',transaction+':\uffff'));
  await env.DB.batch(sql);
  context().records?.clear();
  for(const change of changes){
    const parts=change.path.split('/'),ref=new Reference(change.path),after=snapshot(change.data?{data:change.data}:null,ref);
    if(parts.length===2&&parts[0]==='users'&&triggers.profile)await triggers.profile({params:{userId:parts[1]},data:{before:snapshot(change.before,ref),after}});
    if(parts.length===4&&parts[0]==='users'&&parts[2]==='notifications'&&!change.before&&change.data&&triggers.notification){
      const task=triggers.notification({params:{userId:parts[1],notificationId:parts[3]},data:after}).catch(()=>console.warn('Notification delivery failed'));
      if(context().execution?.waitUntil)context().execution.waitUntil(task);else await task;
    }
  }
}
export async function commit(operations,reads){
  for(let attempt=0;attempt<3;attempt++)try{return await apply(operations,reads?new Map(reads):new Map());}catch(error){if(!String(error.message).includes('CHECK constraint failed'))throw error;if(reads||attempt===2)throw new HttpsError('already-exists','This record changed. Refresh and try again.');}
}
const database={
  collection:path=>new Query(path),doc:path=>new Reference(path),getAll:(...refs)=>Promise.all(refs.map(ref=>ref.get())),batch:stageBatch,
  async runTransaction(callback){
    for(let attempt=0;attempt<3;attempt++){
      const batch=stageBatch(),reads=new Map();
      const transaction={...batch,get:async ref=>{const result=await ref.get();if(result.docs)result.docs.forEach(doc=>reads.set(doc.ref.path,doc.version));else reads.set(ref.path,result.version);return result;}};
      const value=await callback(transaction);
      try{await apply(batch.operations,reads);return value;}catch(error){if(!String(error.message).includes('CHECK constraint failed')||attempt===2)throw error;}
    }
  },
  async recursiveDelete(ref){const prefix=ref.path+'/';await context().env.DB.prepare('DELETE FROM documents WHERE path=? OR (path>=? AND path<?)').bind(ref.path,prefix,prefix+'\uffff').run();}
};
export const getFirestore=()=>database;
function storageFile(key){return {name:key,bucket:{name:'aias-basra-media'},
  async exists(){return [!!(await context().env.MEDIA.head(key))];},
  async getMetadata(){const object=await context().env.MEDIA.head(key);if(!object)throw new HttpsError('not-found','File not found');return [{name:key,size:object.size,contentType:object.httpMetadata?.contentType,metadata:object.customMetadata||{}}];},
  async download(){const object=await context().env.MEDIA.get(key);if(!object)throw new HttpsError('not-found','File not found');return [Buffer.from(await object.arrayBuffer())];},
  async setMetadata(value){const object=await context().env.MEDIA.get(key);if(!object)return;const metadata={...value.metadata};delete metadata.firebaseStorageDownloadTokens;await context().env.MEDIA.put(key,object.body,{httpMetadata:object.httpMetadata,customMetadata:metadata});},
  async delete(){await context().env.MEDIA.delete(key);},
  async copy(destination){const object=await context().env.MEDIA.get(key);if(!object)throw new HttpsError('not-found','File not found');const target=typeof destination==='string'?destination:destination.name;await context().env.MEDIA.put(target,object.body,{httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});return [storageFile(target)];}
};}
export const getStorage=()=>({bucket:()=>({file:storageFile,
  async getFiles({prefix=''}){const objects=[];let cursor;do{const result=await context().env.MEDIA.list({prefix,cursor});objects.push(...result.objects.map(o=>storageFile(o.key)));cursor=result.truncated?result.cursor:undefined;}while(cursor);return [objects];},
  async deleteFiles({prefix=''}){if(!prefix)throw new Error('A storage prefix is required');let cursor;do{const result=await context().env.MEDIA.list({prefix,cursor});if(result.objects.length)await context().env.MEDIA.delete(result.objects.map(o=>o.key));cursor=result.truncated?result.cursor:undefined;}while(cursor);}
})});
