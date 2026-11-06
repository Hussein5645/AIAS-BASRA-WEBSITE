import catalog from './i18n-catalog.js';
const normalize=value=>value.replace(/\s+/g,' ').trim();
const cookieLanguage=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('aias_language='))?.slice(14);
let language=cookieLanguage()||localStorage.getItem('language')||'en';language=language==='ar'?'ar':'en';
localStorage.setItem('language',language);
const textStates=new WeakMap(),attributeStates=new WeakMap();
const excluded='script,style,code,pre,textarea,[contenteditable], [translate="no"], [data-user-content], .professional-identity h3, .professional-identity p, .pro-person-header-meta h3, .pro-person-bio, .pro-person-title, .pro-work-card h3, .home-article-title, .home-article-summary, .portfolio-rich, .post-content, .file-name, .library-entry strong, #previewTitle, #previewMetadata';
export const getLanguage=()=>language;
export function t(value,lang=language){
 if(lang!=='ar'||!value)return value;
 const key=normalize(String(value));if(catalog[key])return catalog[key];
 const patterns=[[/^(\d+) of (\d+) accounts$/,(a,b)=>`${a} من ${b} حساب`],[/^Page (\d+) of (\d+)$/,(a,b)=>`الصفحة ${a} من ${b}`],[/^Business: (.+)$/,status=>`الأعمال: ${t(status)}`],[/^Exp:\s*(.+)$/,range=>`الخبرة: ${t(range)}`],[/^Studio Announcement · (.+)$/,date=>`إعلان استوديو · ${date}`],[/^(\d+) (?:items?|stores?|projects?|files?|accounts?) (shown|loaded)?$/, (count)=>`${count} عنصر`],[/^Remove (.+)$/,name=>`إزالة ${t(name)}`],[/^By (.+)$/,name=>`بواسطة ${name}`]];
 for(const [pattern,format]of patterns){const match=key.match(pattern);if(match)return format(...match.slice(1));}
 const decorated=key.match(/^([^\p{L}\p{N}]*)(.+?)(\s*[↗←→]+)?$/u);
 if(decorated&&catalog[decorated[2].trim()])return (decorated[1]||'')+catalog[decorated[2].trim()]+(decorated[3]||'');
 return value;
}
function translateNode(node){
 if(!node.parentElement||node.parentElement.closest(excluded)||!node.nodeValue.trim())return;
 const parent=node.parentElement;let state=textStates.get(node),current=node.nodeValue;
 if(state&&current!==state.last&&current!==state.original)state=null;
 const annotated=parent.hasAttribute('data-en')&&parent.hasAttribute('data-ar');
 if(!state){const original=annotated?parent.dataset.en:normalize(current);if(!annotated&&t(original,'ar')===original)return;state={original,last:current};textStates.set(node,state);}
 let translated=annotated?parent.getAttribute('data-'+language):t(state.original);
 if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.setAttribute('value',state.original);
 const leading=current.match(/^\s*/)[0],trailing=current.match(/\s*$/)[0];translated=leading+translated+trailing;
 if(current!==translated)node.nodeValue=translated;state.last=translated;
}
function translateAttributes(element){
 if(element.closest(excluded))return;
 let states=attributeStates.get(element);if(!states){states={};attributeStates.set(element,states);}
 for(const name of ['placeholder','aria-label','title','alt']){
  const current=element.getAttribute(name);if(!current)continue;let state=states[name];if(state&&state.last!==current&&state.original!==current)state=null;
  const en=element.getAttribute('data-'+name+'-en')||(name==='placeholder'&&element.matches('input,textarea')?element.dataset.en:null);
  const ar=element.getAttribute('data-'+name+'-ar')||(name==='placeholder'&&element.matches('input,textarea')?element.dataset.ar:null);
  if(!state){const original=en||current;if(!ar&&t(original,'ar')===original)continue;state=states[name]={original,last:current};}
  const next=language==='ar'&&ar?ar:t(state.original);if(next!==current)element.setAttribute(name,next);state.last=next;
 }
}
export function translate(root=document.body){
 if(!root)return;
 if(root.nodeType===Node.TEXT_NODE){translateNode(root);return;}
 if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root);
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(node.nodeType===Node.TEXT_NODE)translateNode(node);else translateAttributes(node);}
}
function controls(){
 const native=document.querySelector('#languageToggle,#communityLanguageToggle,[data-language-toggle]');let shared=document.getElementById('siteLanguageToggle');
 if(!native&&!shared){shared=document.createElement('button');shared.id='siteLanguageToggle';shared.type='button';shared.className='site-language-toggle';document.body.append(shared);}
 if(shared){shared.hidden=!!native;const header=document.querySelector('.workspace-user');if(header&&!header.contains(shared))header.prepend(shared);}
 for(const button of [native,shared].filter(Boolean)){
  const label=language==='ar'?'English':'العربية';const existing=button.querySelector('#currentLang,#communityLanguageLabel,.language-label,span');
  if(existing){if(existing.textContent!==label)existing.textContent=label;}else if(button.textContent!==label)button.textContent=label;
  const aria=language==='ar'?'التبديل إلى الإنجليزية':'Switch to Arabic';if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);button.setAttribute('lang',language==='ar'?'en':'ar');
 }
}
export function setLanguage(value){
 language=value==='ar'?'ar':'en';localStorage.setItem('language',language);
 const domain=location.hostname==='aiasbsr.com'||location.hostname.endsWith('.aiasbsr.com')?'; Domain=aiasbsr.com':'';
 document.cookie=`aias_language=${language}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${location.protocol==='https:'?'; Secure':''}`;
 document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';if(document.body)document.body.dir=document.documentElement.dir;
 translate();translate(document.head);controls();window.dispatchEvent(new CustomEvent('aias-language-changed',{detail:{language}}));
}
window.aiasI18n={setLanguage,t,translate,getLanguage};window.setLanguage=setLanguage;
document.addEventListener('click',event=>{const button=event.target.closest?.('#languageToggle,#communityLanguageToggle,#siteLanguageToggle,[data-language-toggle]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();setLanguage(language==='ar'?'en':'ar');},true);
let scheduled=false,roots=new Set();
const observer=new MutationObserver(mutations=>{for(const mutation of mutations){if(mutation.type==='characterData')roots.add(mutation.target);else if(mutation.type==='attributes')roots.add(mutation.target);else mutation.addedNodes.forEach(node=>roots.add(node));}if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;const batch=[...roots];roots.clear();for(const root of batch)if(root.isConnected)translate(root);controls();});}});
function start(){setLanguage(language);translate(document.head);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('focus',()=>{const shared=cookieLanguage();if(shared&&shared!==language)setLanguage(shared);});
window.addEventListener('storage',event=>{if(event.key==='language'&&event.newValue!==language)setLanguage(event.newValue);});
