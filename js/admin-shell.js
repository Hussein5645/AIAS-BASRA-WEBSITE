import {onAuthStateChanged,getAuth,signOut} from './cloudflare-client.js';
import {getAdminAccess,canView} from './rbac.js';
const content=document.querySelector('main');
if(content){
 document.body.classList.add('admin-workspace','admin-secondary');
 for(const old of document.querySelectorAll('body>aside,body>header,body>amp-auto-ads'))old.hidden=true;
 const media=location.pathname.includes('storage'),title=media?'Media library':location.pathname.includes('articles')?'Article editor':location.pathname.includes('users')?'Community accounts · private':'Community moderation · private';
 const header=document.createElement('header');header.className='workspace-topbar';
 header.innerHTML='<a class="workspace-logo" href="/admin-dashboard.html"><span class="workspace-monogram">A</span><span>AIAS BASRA<small>Management workspace</small></span></a><span class="workspace-shell-title"></span><div class="workspace-user"><span id="shellRole" class="access-badge">Checking access…</span><a class="workspace-site-link" href="/">View website ↗</a><button id="shellLogout" class="logout-btn">Sign out</button></div>';
 header.querySelector('.workspace-shell-title').textContent=title;
 const layout=document.createElement('div');layout.className='dashboard';const sidebar=document.createElement('aside');sidebar.className='sidebar';sidebar.setAttribute('aria-label','Workspace navigation');
 const nav=document.createElement('ul');nav.id='mainNav';nav.className='nav';
 const links=[['overview','Overview','◫'],['professional','Professional','◈'],['market','Market','▤'],['events','Events','▦'],['articles','Magazine','▧'],['library','Library','▥'],['models3d','3D models','◇'],['fbd','Freedom by Design','✳'],['media','Media library','▣'],['settings','Settings','⚙'],['roles','Roles & access','◎'],['community','Community · private','◌']];
 for(const [tab,label,icon] of links){const group={professional:'PRODUCTS',events:'WEBSITE',media:'WORKSPACE',community:'PRIVATE PREVIEW'}[tab];if(group){const heading=document.createElement('li');heading.className='nav-group-label';heading.setAttribute('aria-hidden','true');heading.textContent=group;nav.append(heading);}const li=document.createElement('li'),link=document.createElement('a');link.href=tab==='media'?'/admin-storage.html':'/admin-dashboard.html#'+tab;link.innerHTML='<span class="nav-icon" aria-hidden="true"></span><span></span>';link.firstElementChild.textContent=icon;link.lastElementChild.textContent=label;link.dataset.section=tab;if(tab===(media?'media':title.startsWith('Article')?'articles':'community'))link.setAttribute('aria-current','page');li.append(link);nav.append(li);}
 sidebar.append(nav);const wrapper=document.createElement('div');wrapper.className='content';const breadcrumb=document.createElement('div');breadcrumb.className='workspace-breadcrumb';breadcrumb.textContent='Workspace / '+title;wrapper.append(breadcrumb,content);layout.append(sidebar,wrapper);document.body.prepend(header,layout);
 header.querySelector('#shellLogout').addEventListener('click',async()=>{await signOut();location.assign('/');});
 onAuthStateChanged(getAuth(),async user=>{if(!user)return;const access=await getAdminAccess(null,user.email);header.querySelector('#shellRole').textContent=access.role?.name||'Administrator';for(const link of nav.querySelectorAll('a')){const tab=link.dataset.section;link.parentElement.hidden=['overview','media'].includes(tab)?false:['roles','settings'].includes(tab)?!access.isSuperAdmin:!canView(access,tab);}});
}
