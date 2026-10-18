import {validPath} from './policy.js';
import {runtime,context,configureTriggers} from './platform.js';
import {canAccessMedia,permissions} from './access.js';
import {communityHandlers} from './community/handlers.js';
import {databaseRoute,batchRoute,functionRoute,storageRoute,mediaRoute,shareRoute,json} from './routes.js';
import {pushRoute,sendNotification} from './push.js';
import {publicAssets} from './public-assets.js';
configureTriggers({profile:communityHandlers.syncCommunityPublicProfile,notification:sendNotification});
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const cookie = (request, key) => (request.headers.get('Cookie') || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1);
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join(''); }
async function session(request,env) {
  const token = cookie(request,'aias_session');
  if (!token) return null;
  const row = await env.DB.prepare('SELECT user_json FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first();
  return row ? JSON.parse(row.user_json) : null;
}
function sessionCookie(token,seconds) { return `aias_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`; }
async function createSession(env,profile) {
  let identity=await env.DB.prepare('SELECT * FROM identities WHERE google_subject=?').bind(profile.sub).first();
  if(identity?.disabled)fail(403,'This account is disabled.');
  if(!identity){const uid=crypto.randomUUID();await env.DB.prepare('INSERT OR IGNORE INTO identities(google_subject,user_id,email,disabled) VALUES(?,?,?,0)').bind(profile.sub,uid,profile.email.toLowerCase()).run();identity=await env.DB.prepare('SELECT * FROM identities WHERE google_subject=?').bind(profile.sub).first();}
  const user = {uid:identity.user_id,email:profile.email.toLowerCase(),displayName:profile.name || '',photoURL:profile.picture || ''};
  const token = random();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_json,expires_at) VALUES(?,?,?)').bind(await hash(token),JSON.stringify(user),Date.now()+604800000).run();
  return {user,token};
}
async function authRoute(request,env,url) {
  if (url.pathname==='/api/auth/session') return json({user:await session(request,env)});
  if (url.pathname==='/api/auth/logout' && request.method==='POST') {
    const token=cookie(request,'aias_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({success:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  if (url.pathname==='/api/auth/start') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) fail(503,'Google sign-in needs its Cloudflare OAuth configuration.');
    const state=random();
    const next=url.searchParams.get('return') || '/login.html';
    const destination=new URL(next,url.origin);
    if (destination.origin!==url.origin || !['/login.html','/signup.html','/admin-storage.html','/community.html','/admin-dashboard.html'].includes(destination.pathname)) fail(400,'Invalid return address');
    const endpoint=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    endpoint.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:url.origin+'/api/auth/callback',response_type:'code',scope:'openid email profile',state}).toString();
    return new Response(null,{status:302,headers:{Location:endpoint.href,'Set-Cookie':`aias_oauth=${state}.${encodeURIComponent(destination.pathname+destination.search)}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
  }
  if (url.pathname==='/api/auth/callback') {
    const saved=cookie(request,'aias_oauth') || '';
    const separator=saved.indexOf('.');
    const state=saved.slice(0,separator),next=saved.slice(separator+1);
    if (!state || state!==url.searchParams.get('state') || !url.searchParams.get('code')) fail(400,'Sign-in expired. Try again.');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:url.origin+'/api/auth/callback',grant_type:'authorization_code'})});
    if (!response.ok) fail(401,'Google sign-in could not be completed.');
    const tokens=await response.json();
    const info=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}});
    if (!info.ok) fail(401,'Could not verify Google identity.');
    const profile=await info.json();
    if (!profile.email_verified) fail(403,'A verified email is required.');
    const {token}=await createSession(env,profile);
    const target=new URL(decodeURIComponent(next || '%2Flogin.html'),url.origin);
    if (target.origin!==url.origin) fail(400,'Invalid return address');
    const headers=new Headers({Location:target.href,'Cache-Control':'no-store'});
    headers.append('Set-Cookie',sessionCookie(token,604800));
    headers.append('Set-Cookie','aias_oauth=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null,{status:302,headers});
  }
  fail(404,'Unknown authentication endpoint');
}
async function serveMedia(request,env,key) {
  if (!validPath(key)) fail(400,'Invalid media path');
  if(!publicAssets.has(key)&&!await canAccessMedia(key))fail(context().user?403:401,'This file is private.');
  const object=await env.MEDIA.get(key,{range:request.headers,onlyIf:request.headers});
  if (!object) fail(404,'File not found');
  const headers=new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':publicAssets.has(key)?'public, max-age=3600':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});
  object.writeHttpMetadata(headers);
  headers.set('ETag',object.httpEtag);
  if (!('body' in object)) return new Response(null,{status:304,headers});
  const active=/text\/html|javascript|svg|xml/.test(headers.get('Content-Type') || '');
  if (active) headers.set('Content-Disposition','attachment');
  let status=200;
  if (request.headers.has('Range') && object.range) {
    status=206;
    headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);
  }
  headers.set('Accept-Ranges','bytes');
  return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
export default {
 async fetch(request,env,execution){
  const url=new URL(request.url);
  try{
   if(url.pathname.startsWith('/api/')&&request.method!=='GET'&&request.headers.get('Origin')!==url.origin)fail(403,'Invalid request origin');
   if(url.hostname==='www.aiasbsr.com'){url.hostname='aiasbsr.com';return Response.redirect(url.href,308);}
   const needsUser=url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/')||url.pathname.startsWith('/share');
   const user=needsUser?await session(request,env):null;
   return await runtime.run({env,user,execution,origin:url.origin},async()=>{
    if(url.pathname.startsWith('/api/')){
     if(!env.DB||!env.MEDIA)fail(503,'Cloudflare database and storage bindings are required.');
     if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)fail(403,'Invalid request origin');
     if(url.pathname.startsWith('/api/auth/'))return authRoute(request,env,url);
     if(url.pathname==='/api/db'&&request.method==='POST')return databaseRoute(request);
     if(url.pathname==='/api/batch'&&request.method==='POST')return batchRoute(request);
     if(url.pathname.startsWith('/api/functions/')&&request.method==='POST')return functionRoute(request,decodeURIComponent(url.pathname.slice(15)));
     if(url.pathname==='/api/storage')return storageRoute(request,url);
     if(url.pathname==='/api/media')return mediaRoute(request,url);
     if(url.pathname.startsWith('/api/push/'))return pushRoute(request,url);
     if(url.pathname==='/api/health'){
      if(!(await permissions()).length)fail(403,'Administrator access is required.');
      await env.DB.prepare('SELECT 1').first();await env.MEDIA.list({limit:1});
      return json({success:true,hosting:'Cloudflare Workers',database:'Cloudflare D1',storage:'Cloudflare R2'});
     }
     fail(404,'Unknown API endpoint');
    }
    if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed');
    if(url.pathname.startsWith('/media/'))return serveMedia(request,env,decodeURIComponent(url.pathname.slice(7)));
    if(url.pathname.startsWith('/share'))return shareRoute(request,url);
    if(publicAssets.has(decodeURIComponent(url.pathname.slice(1))))return serveMedia(request,env,decodeURIComponent(url.pathname.slice(1)));
    if(url.pathname==='/'){url.pathname=url.searchParams.has('post')||url.searchParams.has('view')?'/community.html':'/index.html';return env.ASSETS.fetch(new Request(url,request));}
    if(/^\/(a|p)\/[^/]+\/?$/.test(url.pathname)||url.pathname==='/community'){url.pathname='/community.html';return env.ASSETS.fetch(new Request(url,request));}
    return env.ASSETS.fetch(request);
   });
  }catch(error){
   if(!error.status)console.error('Request failed:',error.message);
   return json({error:error.status?error.message:'The request could not be completed.',code:error.code},error.status||500);
  }
 }
};
