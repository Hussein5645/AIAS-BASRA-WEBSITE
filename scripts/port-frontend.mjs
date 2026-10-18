import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'acorn';
const sourceRoot='.migration/source-current';
const communityFiles=new Set();
async function recover(dir=''){
  for(const entry of await readdir(path.join(sourceRoot,dir),{withFileTypes:true})){
    const relative=path.join(dir,entry.name).replaceAll('\\','/');
    if(entry.isDirectory()){await recover(relative);continue;}
    if(!/\.(html|js|css|json|webmanifest)$/.test(entry.name)||entry.name==='auth-relay.html'||relative==='js/firebase-client.js'||relative.startsWith('__/'))continue;
    let target=relative==='index.html'?'community.html':relative==='css/style.css'?'css/community-base.css':relative;
    await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(sourceRoot,relative),target);communityFiles.add(target);
  }
}
await recover();
function rewrite(source,isCommunity){
  source=source.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^'"\s]+\/firebase-(?:app|auth|firestore|storage|functions|messaging)\.js/g,'/js/cloudflare-client.js');
  source=source.replaceAll('./firebase-client.js','./platform-client.js');
  source=source.replace(/const\s+(firebaseConfig|communityConfig|config)\s*=\s*\{[^{}]*(?:apiKey|authDomain)[^{}]*\};/g,'const $1 = { projectId: "aias-basra" };');
  source=source.replace(/new URL\(['"]https:\/\/space-42d87\.firebaseapp\.com\/auth-relay\.html['"]\)/g,"new URL('/api/auth/start', location.origin)");
  source=source.replaceAll('https://space-42d87.web.app/?','/community.html?').replaceAll('https://space-42d87.web.app/"','/community.html"').replaceAll("https://space-42d87.web.app/'","/community.html'");
  source=source.replaceAll('https://space-42d87.web.app','').replaceAll('https://www.aiasbsr.com','https://aiasbsr.com');
  source=source.replace(/const PRODUCTION_ORIGIN = ['"][^'"]+['"];/,"const PRODUCTION_ORIGIN = location.origin;");
  if(isCommunity){
    source=source.replaceAll('css/style.css','css/community-base.css');
    source=source.replace(/(['"`])\/\?/g,'$1/community.html?').replaceAll('href="/"','href="/community.html"');
    source=source.replace(/(location(?:\.href)?\s*=\s*|return\s+|navigateTo\(|new URL\()(['"])\/\2/g,"$1$2/community.html$2");
    source=source.replace("destination.pathname === '/'","['/community.html','/community'].includes(destination.pathname)");
  }
  return source;
}
const files=[];
for(const entry of await readdir('.'))if(entry.endsWith('.html')&&!entry.includes('backup'))files.push(entry);
for(const entry of await readdir('js'))if(entry.endsWith('.js')&&entry!=='cloudflare-client.js')files.push('js/'+entry);
for(const file of files){let source=await readFile(file,'utf8');source=rewrite(source,communityFiles.has(file));
  if(file==='login.html'||file==='signup.html'){
    source=source.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/g,(all,start,script,end)=>{
      const ast=parse(script,{ecmaVersion:'latest',sourceType:'module'});const edits=[];
      for(const node of ast.body){if(node.type==='FunctionDeclaration'&&node.id.name==='finishRelaySignIn')edits.push(node);if(node.type==='ExpressionStatement'&&script.slice(node.start,node.end).startsWith('finishRelaySignIn()'))edits.push(node);}
      for(const node of edits.sort((a,b)=>b.start-a.start))script=script.slice(0,node.start)+script.slice(node.end);
      return start+script+end;
    });
  }
  if(file==='js/community.js'){
    // Repair a truncated keyboard listener in the deployed source using the prior repository version.
    const old=await readFile('.migration/community-reference/public/js/community.js','utf8');
    const start=source.indexOf('  const tag = document.activeElement?.tagName;');
    const end=source.indexOf("window.visualViewport?.addEventListener('resize', syncCommentKeyboardOffset);",start);
    const originalStart=old.indexOf('  const tag = document.activeElement?.tagName;');
    const originalEnd=old.indexOf("window.visualViewport?.addEventListener('resize', syncCommentKeyboardOffset);",originalStart);
    if(start>=0&&end>=0&&originalStart>=0&&originalEnd>=0)source=source.slice(0,start)+old.slice(originalStart,originalEnd)+source.slice(end);
    source=source.replace(/import \{ getMessaging, getToken, isSupported \} from ['"][^'"]+['"];?/,'import {registerWebPush} from "/js/cloudflare-client.js";');
    const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
    const node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='registerPushSubscription');
    if(node)source=source.slice(0,node.start)+`async function registerPushSubscription() { if(!currentUser || !('Notification' in window) || Notification.permission!=='granted')return null;const registration=await registerNotificationServiceWorker();return registration?registerWebPush(registration):null; }`+source.slice(node.end);
  }
  await writeFile(file,source);
}
await writeFile('js/platform-client.js',`import {getApp,getAuth,getFirestore,getStorage,callFunction as invoke} from './cloudflare-client.js';
export const app=getApp(),auth=getAuth(),db=getFirestore(),storage=getStorage();
const operations={checkCommunitySpaceHandle:'check_space_handle',requestMainThreadPostingAccess:'request_main_thread_access',reviewMainThreadPostingAccess:'review_main_thread_access',setCommunitySpaceVisibility:'set_space_visibility',moderateCommunitySpacePost:'moderate_space_post',warnCommunitySpaceMember:'warn_space_member'};
export const callFunction=(name,data={})=>operations[name]?invoke('setCommunitySpaceConnection',{...data,operation:operations[name]}):invoke(name,data);
`);
await writeFile('community-notifications-sw.js',`self.addEventListener('push',event=>{let data={};try{data=event.data.json();}catch{}event.waitUntil(self.registration.showNotification(data.title||'AIAS Basra Community',{body:data.body||'New community activity',icon:'/static/images/branding/LOGO.png',tag:data.notificationId,data:{url:data.url||'/community.html'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const candidate=new URL(event.notification.data?.url||'/community.html',self.location.origin);const target=candidate.origin===self.location.origin?candidate.href:self.location.origin+'/community.html';event.waitUntil((async()=>{const windows=await clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);if(existing){await existing.focus();return existing.navigate(target);}return clients.openWindow(target);})());});
`);
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));manifest.start_url='/community.html';manifest.id='/community';await writeFile('manifest.webmanifest',JSON.stringify(manifest,null,2));
console.log(`Recovered and ported ${communityFiles.size} deployed website files; main-site SDK imports now target the Cloudflare client.`);
