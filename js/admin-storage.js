import {request} from './cloudflare-client.js';
import {t} from './i18n.js';
const $=id=>document.getElementById(id);
let source='database',path='',folders=[],files=[],cursor=null,sequence=0,loaded=false;
const endpoint=options=>'/api/admin/library?'+new URLSearchParams({source,...options});
function node(tag,className,text){const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;}
async function load(append=false){
 const current=++sequence;$('libraryEntries').setAttribute('aria-busy','true');$('libraryMessage').textContent=t('Loading folder…');
 try{const data=await request(endpoint({path,...(append&&cursor?{cursor}:{})}),undefined,'GET');if(current!==sequence)return;folders=append?[...folders,...data.folders]:data.folders;files=append?[...files,...data.files]:data.files;cursor=data.cursor;loaded=true;render();$('libraryMessage').textContent='';}
 catch(error){if(current===sequence)$('libraryMessage').textContent=t(error.message);}finally{if(current===sequence)$('libraryEntries').setAttribute('aria-busy','false');}
}
function navigate(next){path=next;cursor=null;$('librarySearch').value='';load();}
function render(){
 const crumbs=$('libraryBreadcrumbs');crumbs.replaceChildren();const root=node('button','workspace-outline',t('Root'));root.onclick=()=>navigate('');crumbs.append(root);const parts=path.split('/').filter(Boolean);parts.forEach((part,index)=>{crumbs.append(node('span','library-separator','/'));const button=node('button','workspace-outline',part);button.translate=false;button.onclick=()=>navigate(parts.slice(0,index+1).join('/'));crumbs.append(button);});
 const query=$('librarySearch').value.trim().toLowerCase(),entries=$('libraryEntries');entries.replaceChildren();
 const seen=new Set();for(const folder of folders){if(seen.has(folder.path)||!folder.name.toLowerCase().includes(query))continue;seen.add(folder.path);const button=node('button','library-entry library-folder');button.append(node('span','library-icon','▰'),node('strong','',folder.name),node('span','library-entry-meta',t('Folder')),node('span','', '›'));button.onclick=()=>navigate(folder.path);entries.append(button);}
 for(const file of files){if(!file.name.toLowerCase().includes(query))continue;const button=node('button','library-entry library-file');button.append(node('span','library-icon',source==='database'?'{}':'▧'),node('strong','',file.name),node('span','library-entry-meta',source==='database'?t('Record'):(file.size/1024).toLocaleString(undefined,{maximumFractionDigits:1})+' KB'),node('span','',t('Preview')));button.onclick=()=>preview(file);entries.append(button);}
 if(!entries.childElementCount)entries.append(node('p','workspace-empty',t(query?'No matches in this folder.':'This folder is empty.')));$('libraryMore').hidden=!cursor;
}
async function preview(file){
 const dialog=$('libraryPreview'),content=$('previewContent');$('previewTitle').textContent=file.name;$('previewMetadata').textContent=file.path;content.replaceChildren(node('p','',t('Loading preview…')));dialog.showModal();
 try{const result=await request(endpoint({file:file.path}),undefined,'GET');content.replaceChildren();
  if(result.kind==='document'){const pre=node('pre','library-json',JSON.stringify(result.data,null,2));pre.dir='ltr';pre.translate=false;content.append(pre);}
  else if(/^image\/(png|jpeg|webp|gif|avif)$/.test(result.contentType)){const image=node('img','library-image');image.src=result.url;image.alt=file.name;content.append(image);}
  else if(result.contentType==='application/pdf'){const frame=node('iframe','library-pdf');frame.src=result.url;frame.title=file.name;frame.setAttribute('sandbox','');content.append(frame);}
  else content.append(node('p','workspace-empty',t('A visual preview is not available for this file type.')));
 }catch(error){content.replaceChildren(node('p','',t(error.message)));}
}
$('previewClose').onclick=()=>{$('libraryPreview').close();$('previewContent').replaceChildren();};$('libraryPreview').addEventListener('close',()=>$('previewContent').replaceChildren());
$('librarySearch').oninput=render;$('libraryMore').onclick=()=>load(true);
document.querySelectorAll('[data-source]').forEach(button=>button.onclick=()=>{source=button.dataset.source;document.querySelectorAll('[data-source]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));navigate('');});
window.addEventListener('aias-language-changed',()=>{if(loaded)render();});await load();
