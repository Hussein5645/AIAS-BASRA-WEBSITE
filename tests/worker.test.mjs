import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
let mf,db;
const origin='https://example.com';
const admin={uid:'admin-test',email:'basrah@aias.org',displayName:'Test administrator'};
const member={uid:'member-test',email:'member@example.com'};
async function session(user,token){await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),JSON.stringify(user),Date.now()+600000).run();}
async function api(path,body,token='admin-session',method='POST'){
  const headers={Origin:origin,Cookie:token?'aias_session='+token:''};
  if(body instanceof FormData){
    const encoded=new Request(origin,{method:'POST',body});
    headers['Content-Type']=encoded.headers.get('Content-Type');
    return mf.dispatchFetch(origin+path,{method,headers,body:new Uint8Array(await encoded.arrayBuffer())});
  }
  return mf.dispatchFetch(origin+path,{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
before(async()=>{
  execFileSync(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--outdir','.migration/test-worker'],{stdio:'pipe',windowsHide:true});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile('.migration/test-worker/index.js','utf8'),compatibilityDate:'2026-10-18',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['MEDIA'],bindings:{ADMIN_EMAILS:admin.email}}));
  db=await mf.getD1Database('DB');
  for(const file of (await readdir('migrations')).sort()){
   const sql=await readFile('migrations/'+file,'utf8');
   for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  await session(admin,'admin-session');await session(member,'member-session');
});
after(async()=>{await mf?.dispose();});
test('anonymous visitors can read content but cannot edit it or list media',async()=>{
  assert.equal((await api('/api/db',{action:'list',path:'content/events/items'},'')).status,200);
  assert.equal((await api('/api/db',{action:'set',path:'content/events',data:{title:'attack'}},'')).status,401);
  assert.equal((await api('/api/media',undefined,'','GET')).status,401);
});
test('content writes persist in D1, merge nested fields, and record an audit entry',async()=>{
  assert.equal((await api('/api/db',{action:'set',path:'content/events',data:{title:'Chapter event',details:{city:'Basra',venue:'Hall A'}}})).status,200);
  assert.equal((await api('/api/db',{action:'update',path:'content/events',data:{'details.venue':'Hall B'}})).status,200);
  const result=await (await api('/api/db',{action:'get',path:'content/events'})).json();
  assert.deepEqual(result.document.data.details,{city:'Basra',venue:'Hall B'});
  const audit=await db.prepare('SELECT COUNT(*) AS count FROM audit_log WHERE path=?').bind('content/events').first();
  assert.equal(audit.count,2);
});
test('ordinary members cannot change roles or read other members private profiles',async()=>{
  assert.equal((await api('/api/db',{action:'set',path:'config/roles',data:{roles:{super_admin:{permissions:['*']}}}},'member-session')).status,403);
  assert.equal((await api('/api/db',{action:'get',path:'users/admin-test'},'member-session')).status,403);
  assert.equal((await api('/api/db',{action:'set',path:'users/member-test',data:{email:member.email,role:'super_admin'}},'member-session')).status,403);
});
test('scoped administrators can edit their area and cannot escalate permissions',async()=>{
  await api('/api/db',{action:'set',path:'config/userRoles',data:{assignments:{[member.email]:'event_editor'}}});
  await api('/api/db',{action:'set',path:'config/roles',data:{roles:{event_editor:{permissions:['manage_events']}}}});
  assert.equal((await api('/api/db',{action:'set',path:'content/events/items/scoped',data:{title:'Scoped event'}},'member-session')).status,200);
  assert.equal((await api('/api/db',{action:'set',path:'content/magazine/articles/scoped',data:{title:'Blocked'}},'member-session')).status,403);
  assert.equal((await api('/api/db',{action:'set',path:'config/admins',data:{admins:[member.email]}},'member-session')).status,403);
});
test('embedded files are rejected by the content API',async()=>{
  const response=await api('/api/db',{action:'set',path:'content/library/items/file',data:{image:'data:image/png;base64,AA=='}});
  assert.equal(response.status,400);
});
test('uploads store bytes in R2, return a usable URL, and support range reads',async()=>{
  const form=new FormData();form.set('file',new File(['%PDF-test-file'],'chapter.pdf',{type:'application/pdf'}));form.set('prefix','uploads/library');
  const response=await api('/api/media',form);assert.equal(response.status,200);
  const uploaded=await response.json();
  const stored=await (await mf.getR2Bucket('MEDIA')).get(uploaded.key);assert.equal(await stored.text(),'%PDF-test-file');
  const download=await mf.dispatchFetch(new URL(uploaded.url,origin).href);assert.equal(download.status,200);assert.equal(await download.text(),'%PDF-test-file');
  assert.equal(download.headers.get('Content-Type'),'application/pdf');
  const range=await mf.dispatchFetch(new URL(uploaded.url,origin).href,{headers:{Range:'bytes=0-3'}});assert.equal(range.status,206);assert.equal(await range.text(),'%PDF');
  const listing=await (await api('/api/media',undefined,'admin-session','GET')).json();assert.equal(listing.objects.length,1);
  assert.equal(listing.objects[0].key,uploaded.key);
});
test('unsafe active-content uploads are rejected',async()=>{
  const form=new FormData();form.set('file',new File(['<script>alert(1)</script>'],'page.html',{type:'text/html'}));
  assert.equal((await api('/api/media',form)).status,400);
});
test('health verifies both services and logout revokes the server session',async()=>{
  assert.equal((await api('/api/health',undefined,'admin-session','GET')).status,200);
  await session(admin,'logout-test');
  assert.equal((await api('/api/auth/logout',{},'logout-test')).status,200);
  const current=await (await api('/api/auth/session',undefined,'logout-test','GET')).json();assert.equal(current.user,null);
});
test('OAuth reports missing configuration without redirecting to Firebase',async()=>{
  const response=await api('/api/auth/start?return=/admin-storage.html',undefined,'','GET');
  assert.equal(response.status,503);
});

test('community registration uses server validation and creates a public profile without private email',async()=>{
 const response=await api('/api/functions/setCommunitySpaceConnection',{operation:'complete_profile',username:'test_member',displayName:'Test Member',school:'Basra University',city:'Basra',bio:'Test profile'},'member-session');
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const own=await (await api('/api/db',{action:'get',path:'users/member-test'},'member-session')).json();
 assert.equal(own.document.data.profileComplete,true);
 const publicProfile=await (await api('/api/db',{action:'get',path:'publicProfiles/member-test'},'')).json();
 assert.equal(publicProfile.document.data.username,'test_member');assert.equal(publicProfile.document.data.email,undefined);
});

test('private posts, messages, media and server-only handlers remain inaccessible to outsiders',async()=>{
 await api('/api/db',{action:'set',path:'communityPosts/private-test',data:{userId:'owner-test',published:true,visibility:'private',communitySlug:'private-space'}});
 await api('/api/db',{action:'set',path:'communitySpaces/private-space',data:{creatorId:'owner-test',isPrivate:true,archived:false}});
 await (await mf.getR2Bucket('MEDIA')).put('community/posts/private-test/00.jpg','private-image');
 assert.equal((await api('/api/db',{action:'get',path:'communityPosts/private-test'},'member-session')).status,403);
 assert.equal((await api('/api/functions/getCommunityThread',{postId:'private-test'},'member-session')).status,403);
 assert.equal((await mf.dispatchFetch(origin+'/media/'+encodeURIComponent('community/posts/private-test/00.jpg'))).status,401);
 assert.equal((await api('/api/functions/syncCommunityPublicProfile',{},'member-session')).status,404);
 const list=await (await api('/api/db',{action:'list',path:'communityPosts'},'')).json();assert.equal(list.documents.some(doc=>doc.id==='private-test'),false);
});

test('batches roll back all changes when a read version is stale',async()=>{
 const path='content/events/items/transaction';await api('/api/db',{action:'set',path,data:{title:'Original'}});
 const current=await (await api('/api/db',{action:'get',path})).json();
 await api('/api/db',{action:'update',path,data:{title:'Updated'}});
 const result=await api('/api/batch',{operations:[{action:'update',path,data:{title:'Stale'}},{action:'set',path:'content/events/items/rollback',data:{title:'Must roll back'}}],readVersions:{[path]:current.document.version}});
 assert.equal(result.status,409);assert.equal(await db.prepare('SELECT * FROM documents WHERE path=?').bind('content/events/items/rollback').first(),null);
});
