import {request} from './cloudflare-client.js';
import {canManage,canView} from './rbac.js';
const $=id=>document.getElementById(id);
const pages={overview:['Overview','Your products, content, and people at a glance.','https://aiasbsr.com/'],professional:['BASRA Professional','Manage professional accounts, businesses, and portfolio categories.','https://professional.aiasbsr.com/'],market:['Market','Manage stores, products, categories, and store teams.','https://market.aiasbsr.com/'],events:['Events','Create gatherings, manage registrations, and keep your calendar current.'],articles:['Magazine','Write, edit, and publish stories from your chapter.'],library:['Library','Organize the resources your members rely on.'],models3d:['3D models','Manage models and their previews.'],fbd:['Freedom by Design','Share projects and activities that make a difference.'],settings:['Settings','Manage website settings and structured content.'],roles:['Roles & access','Give your team the right tools for their responsibilities.'],community:['Community · private preview','Manage the private preview. Only administrators can enter.','https://community.aiasbsr.com/']};
let access,accounts=[],loading=false,accountPage=0;
function updatePage(tab){
 const [title,description,url]=pages[tab]||pages.overview;
 $('workspacePageTitle').textContent=title;$('workspacePageDescription').textContent=description;$('workspaceBreadcrumb').textContent=title;
 $('workspaceOpenProduct').hidden=!url;if(url){$('workspaceOpenProduct').href=url;$('workspaceOpenProduct').textContent=tab==='overview'?'View website ↗':'Open product ↗';}
 document.querySelector('.top-actions').hidden=['overview','professional','market','community','settings','roles'].includes(tab);
 history.replaceState(null,'','#'+tab);
 if(tab==='overview')loadOverview();if(tab==='professional')loadAccounts();
}
async function loadOverview(){
 try{const totals=await request('/api/admin/overview',undefined,'GET');$('overviewAccountCount').textContent=totals.accounts;$('overviewPublishedCount').textContent=totals.published;$('overviewStoresCount').textContent=totals.stores;}
 catch{$('overviewAccountCount').textContent='Unavailable';}
}
window.addEventListener('aias-workspace-tab',event=>{access=event.detail.access;updatePage(event.detail.tab);document.querySelectorAll('[data-workspace-tab]').forEach(button=>button.hidden=!canView(access,button.dataset.workspaceTab));});
document.querySelectorAll('[data-workspace-tab]').forEach(button=>button.addEventListener('click',()=>window.showTab(button.dataset.workspaceTab)));
const search=$('workspaceSearch');
search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();let count=0;document.querySelectorAll('#mainNav li').forEach(item=>{const button=item.querySelector('button[data-tab]'),link=item.querySelector('a');if(button||link){item.hidden=!!button?.hidden||!(button||link).textContent.toLowerCase().includes(query);if(!item.hidden)count++;}else item.hidden=!!query;});$('workspaceSearchEmpty').hidden=!!count;});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){event.preventDefault();search.focus();}if(event.key==='Escape'&&document.activeElement===search){search.value='';search.dispatchEvent(new Event('input'));search.blur();}});
async function loadAccounts(){
 if(loading)return;loading=true;$('professionalAccounts').setAttribute('aria-busy','true');
 try{const result=await request('/api/admin/professional',undefined,'GET');accounts=result.accounts;renderAccounts();$('professionalStatus').textContent='';}
 catch(error){$('professionalStatus').textContent=error.message;}finally{loading=false;$('professionalAccounts').setAttribute('aria-busy','false');}
}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function renderAccounts(){
 const query=$('professionalSearch').value.trim().toLowerCase(),filter=$('professionalFilter').value;
 const visible=accounts.filter(account=>[account.displayName,account.username,account.email].join(' ').toLowerCase().includes(query)&&(filter==='all'||filter==='published'&&account.portfolioStatus==='published'||filter==='business'&&account.businessStatus!=='none'||filter==='verified'&&account.verified));
 $('professionalCount').textContent=`${visible.length} of ${accounts.length} accounts`;
 const container=$('professionalAccounts');container.replaceChildren();
 const pages=Math.max(1,Math.ceil(visible.length/8));accountPage=Math.min(accountPage,pages-1);$('professionalPageInfo').textContent=`Page ${accountPage+1} of ${pages}`;$('professionalPrevious').disabled=accountPage===0;$('professionalNext').disabled=accountPage===pages-1;
 if(!visible.length){container.append(element('p','workspace-empty','No accounts match your filters.'));return;}
 for(const account of visible.slice(accountPage*8,(accountPage+1)*8)){
  const row=element('article','professional-account'),avatar=element('span','professional-avatar',(account.displayName||account.username||'P').slice(0,1).toUpperCase()),identity=element('div','professional-identity');
  identity.append(element('h3','',account.displayName||account.username||'Account'),element('p','',`@${account.username||'pending'} · ${account.email}`));
  const badges=element('div','professional-badges');badges.append(element('span','workspace-badge',account.portfolioStatus));if(account.verified)badges.append(element('span','workspace-badge positive','Verified Professional'));if(account.businessStatus!=='none')badges.append(element('span','workspace-badge',`Business: ${account.businessStatus}`));identity.append(badges);
  const actions=element('div','professional-actions');
  if(account.portfolioStatus==='published'){const link=element('a','workspace-outline','View portfolio ↗');link.href='https://professional.aiasbsr.com/portfolio.html?id='+encodeURIComponent(account.uid);actions.append(link);}
  if(canManage(access,'professional')){
   const verify=element('button','workspace-outline',account.verified?'Remove verification':'Verify account');verify.addEventListener('click',()=>mutate(account,account.verified?'unverify':'verify',verify));actions.append(verify);
   const business=element('button','workspace-outline',account.businessStatus==='active'?'Suspend business':account.businessStatus==='suspended'?'Restore business':'Enable business');business.addEventListener('click',()=>mutate(account,account.businessStatus==='active'?'suspend_business':account.businessStatus==='suspended'?'restore_business':'grant_business',business));actions.append(business);
  }
  row.append(avatar,identity,actions);container.append(row);
 }
}
async function mutate(account,action,button){button.disabled=true;$('professionalStatus').textContent='Saving changes…';try{await request('/api/admin/professional',{uid:account.uid,action});await loadAccounts();$('professionalStatus').textContent='Account updated.';}catch(error){$('professionalStatus').textContent=error.message;}finally{button.disabled=false;}}
$('professionalSearch').addEventListener('input',()=>{accountPage=0;renderAccounts();});$('professionalFilter').addEventListener('change',()=>{accountPage=0;renderAccounts();});$('professionalRefresh').addEventListener('click',loadAccounts);

if(window.aiasWorkspaceState){access=window.aiasWorkspaceState.access;updatePage(window.aiasWorkspaceState.tab);}

$('professionalPrevious').addEventListener('click',()=>{accountPage=Math.max(0,accountPage-1);renderAccounts();});$('professionalNext').addEventListener('click',()=>{accountPage++;renderAccounts();});
document.querySelectorAll('[data-professional-panel]').forEach(button=>button.addEventListener('click',()=>{const accounts=button.dataset.professionalPanel==='accounts';$('professionalAccountsPanel').hidden=!accounts;$('professionalCategoriesPanel').hidden=accounts;document.querySelectorAll('[data-professional-panel]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));}));
