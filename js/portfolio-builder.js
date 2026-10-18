import {auth,db,storage,callFunction} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {collection,doc,getDoc,getDocs,query,where,deleteDoc,onSnapshot,orderBy} from '/js/cloudflare-client.js';
import {deleteObject,getDownloadURL,ref as storageRef,uploadBytesResumable} from '/js/cloudflare-client.js';
import {esc,safeUrl,initials,workCard,portfolioContentSection,portfolioBusinessSection,portfolioSidebar,bindImageFallbacks,presentationClasses,portfolioPalettes,applyPresentationPalette,workPresentation,workPageClass,workPageMarkup,bindWorkImageViewer} from './portfolio-shared.js?v=20260821-full-theme-editor-v1';
import {normaliseThemePackage,applyThemePackageToProfile,readThemeFile} from './portfolio-theme-package.js?v=20260821-full-theme-editor-v1';

const $=id=>document.getElementById(id);
const IDENTITY='__identity';
const DESIGN='__design';
const BUSINESS='__business';
let isBusinessAccount=false;
let businessAccount=null;
let businessProfile=null;
let myBusinessPosts=[];
let myBusinessOpportunities=[];
let myApplicants=[];
let applicantFilterOpportunity='all';
let applicantFilterStatus='all';
let editingBusinessOpportunity=null;
let editingBusinessPost=null;
const defaultBusinessProfile=()=>({name:businessAccount?.businessName||profile.displayName||communityProfile.displayName||'',username:(communityProfile.username||'').toLowerCase()||`studio_${user?.uid?.slice(0,6)||'biz'}`,industry:'Architecture & Urban Design',logoUrl:profile.avatarUrl||'',coverUrl:profile.coverUrl||'',location:profile.location||'Basra, Iraq',companySize:'1-10 architects & designers',shortDescription:profile.tagline||'',about:'',services:[],specializations:[],website:'',contactEmail:profile.contactEmail||communityProfile.email||'',contactPhone:'',address:'',gallery:[],status:'published'});
const sectionTypes=['about','gallery','work','experience','education','skills','services','testimonials','awards','certifications','publications','clients','contact','resume','custom'];
const fieldTypes=['text','longtext','number','date','daterange','location','url','youtube','email','phone','select','multiselect','tags','boolean','level','image','file'];
const themes=[
  {id:'minimal',name:'Architect Minimal',note:'Calm image-led introduction'},
  {id:'editorial',name:'Editorial Journal',note:'Magazine cover and serif type'},
  {id:'executive',name:'Executive Profile',note:'Confident professional banner'},
  {id:'studio',name:'Creative Studio',note:'Dark experimental showcase'},
  {id:'gallery',name:'Artist Gallery',note:'Immersive full-image opening'},
  {id:'resume',name:'Professional Résumé',note:'Credentials-first two columns'},
  {id:'technical',name:'Technical Blueprint',note:'Numbered precision system'},
  {id:'bold',name:'Playful Bold',note:'Fun colour and oversized type'},
  {id:'monochrome',name:'Type Monochrome',note:'Graphic black and white'},
  {id:'warm',name:'Craft & Story',note:'Personal, warm and organic'}
];
let user=null;
let communityProfile={};
let profile={};
let works=[];
let savedThemes=[];
let myThemes=[];
let selectedSection=IDENTITY;
let selectedWork=null;
let previewWork=null;
let activeTab='sections';
let saving=false;
let savingWork=false;
let portfolioExists=false;
let profileHasUnsavedChanges=false;
let profileHasDraft=false;
let workHasUnsavedChanges=false;
const pendingProfileMediaDeletes=new Set();

const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
const defaultSidebar=()=>({visible:true,title:'Resume details',width:'balanced',showSkills:true,showLocation:true,showAvailability:true,showContact:true,fields:[]});
const defaultProfile=()=>({displayName:'',professionalTitle:'',tagline:'',location:'',availability:'',contactEmail:'',contactPublic:false,contacts:[],avatarUrl:'',avatarVisible:true,coverUrl:'',theme:'minimal',palette:'heritage_wine',accent:'#661f22',themePackage:null,themePaletteId:'',multiThemePublish:{enabled:false,themes:[]},navigation:'top',surfaceStyle:'cards',workLayout:'cards',density:'comfortable',fieldBackgrounds:true,skills:[],skillRatings:{},links:[],sidebar:defaultSidebar(),sections:[{id:uid(),type:'work',title:'Selected work',content:'',visible:true,fields:[]},{id:uid(),type:'contact',title:'Contact',content:'',visible:true,fields:[]}],status:'draft'});

function status(message,error=false){$('builderStatus').textContent=message;$('builderStatus').style.color=error?'#ffb4ad':'#cfc4c4'}
function preserveBuilderScroll(render){const scrollers=[document.querySelector('.builder-panel:not(.right)'),document.querySelector('.builder-preview-wrap'),document.querySelector('.builder-panel.right')].filter(Boolean);const positions=scrollers.map(element=>({element,top:element.scrollTop,left:element.scrollLeft}));render();const restore=()=>{document.documentElement.scrollTop=0;document.body.scrollTop=0;positions.forEach(({element,top,left})=>{element.scrollTop=top;element.scrollLeft=left})};restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(restore)});document.querySelectorAll('.builder-preview img').forEach(image=>{if(!image.complete){image.addEventListener('load',restore,{once:true});image.addEventListener('error',restore,{once:true})}});if('ResizeObserver'in window){const preview=document.querySelector('.builder-preview');if(preview){const observer=new ResizeObserver(restore);observer.observe(preview);setTimeout(()=>observer.disconnect(),1500)}}}
function input(label,key,value,type='text',options=[]){const control=type==='textarea'?`<textarea data-profile="${key}">${esc(value)}</textarea>`:type==='select'?`<select data-profile="${key}">${options.map(option=>{const item=typeof option==='string'?{value:option,label:option}:option;return `<option value="${esc(item.value)}"${value===item.value?' selected':''}>${esc(item.label)}</option>`}).join('')}</select>`:`<input data-profile="${key}" type="${type}" value="${esc(value)}">`;return `<label>${esc(label)}${control}</label>`}
const contactTypes=[{value:'email',label:'Email'},{value:'phone',label:'Phone'},{value:'website',label:'Website'},{value:'social',label:'Social profile'},{value:'location',label:'Address / location'},{value:'other',label:'Other'}];
const fieldTextSizes=[{value:'small',label:'Small'},{value:'standard',label:'Standard'},{value:'large',label:'Large'},{value:'display',label:'Display'}];
function moveItem(items,index,step){const target=index+step;if(index<0||target<0||target>=items.length)return items;const next=[...items];[next[index],next[target]]=[next[target],next[index]];return next}
function contactEditor(){const contacts=Array.isArray(profile.contacts)?profile.contacts:[];return `<div class="builder-collection"><div class="builder-collection-head"><div><strong>Contact information</strong><small>Add any number of public contact methods. Each one can be hidden separately.</small></div><button id="addContact" type="button">+ Add contact</button></div><div class="builder-collection-list">${contacts.map((contact,index)=>`<div class="builder-collection-row" data-contact-index="${index}"><div class="builder-collection-toolbar"><strong>Contact ${index+1}</strong><span><button type="button" data-move-contact="-1" aria-label="Move contact up"${index===0?' disabled':''}>↑</button><button type="button" data-move-contact="1" aria-label="Move contact down"${index===contacts.length-1?' disabled':''}>↓</button><button type="button" data-remove-contact aria-label="Remove contact">Remove</button></span></div><div class="builder-collection-grid"><label>Type<select data-contact-key="type">${contactTypes.map(type=>`<option value="${type.value}"${contact.type===type.value?' selected':''}>${type.label}</option>`).join('')}</select></label><label>Label<input data-contact-key="label" value="${esc(contact.label||'')}" maxlength="80" placeholder="e.g. Work email"></label></div><label>Contact value<input data-contact-key="value" value="${esc(contact.value||'')}" maxlength="240" placeholder="${contact.type==='email'?'name@example.com':contact.type==='phone'?'+964 …':contact.type==='website'||contact.type==='social'?'https://…':'Enter contact information'}"></label><label class="builder-visibility-toggle"><span><input data-contact-key="visible" type="checkbox"${contact.visible!==false?' checked':''}> Show on public portfolio</span></label></div>`).join('')||'<div class="builder-collection-empty">No contact information yet. Add email, phone, website, social profile, address, or another contact method.</div>'}</div></div>`}
function linkEditor(){const links=Array.isArray(profile.links)?profile.links:[];return `<div class="builder-collection"><div class="builder-collection-head"><div><strong>Professional links</strong><small>Add a clear label and URL for every portfolio link.</small></div><button id="addProfileLink" type="button">+ Add link</button></div><div class="builder-collection-list">${links.map((link,index)=>`<div class="builder-collection-row" data-link-index="${index}"><div class="builder-collection-toolbar"><strong>Link ${index+1}</strong><span><button type="button" data-move-link="-1" aria-label="Move link up"${index===0?' disabled':''}>↑</button><button type="button" data-move-link="1" aria-label="Move link down"${index===links.length-1?' disabled':''}>↓</button><button type="button" data-remove-link aria-label="Remove link">Remove</button></span></div><label>Link label<input data-link-key="label" value="${esc(link.label||'')}" maxlength="80" placeholder="e.g. GitHub, LinkedIn, Personal website"></label><label>URL<input data-link-key="url" type="url" value="${esc(link.url||'')}" maxlength="500" placeholder="https://example.com"></label><label class="builder-visibility-toggle"><span><input data-link-key="visible" type="checkbox"${link.visible!==false?' checked':''}> Show on public portfolio</span></label></div>`).join('')||'<div class="builder-collection-empty">No professional links yet.</div>'}</div></div>`}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function isTransient(error){const value=`${error?.code||''} ${error?.message||''}`.toLowerCase();return ['unavailable','deadline-exceeded','network','quic','too_many_rtos','internal','fetch'].some(token=>value.includes(token))}
async function withRetry(operation,label){let lastError;for(let attempt=1;attempt<=3;attempt+=1){try{return await operation()}catch(error){lastError=error;if(attempt===3||!isTransient(error))throw error;status(`${label} — reconnecting (${attempt}/2)…`);await delay(700*attempt)}}throw lastError}
function friendlyError(error,fallback){const message=String(error?.message||'');if(isTransient(error))return 'Firebase connection was interrupted. Please check your connection and try again.';if(message.includes('Add a portfolio display name'))return message.replace(/^.*?:\s*/,'');return message||fallback}
function tagEditor(id,values,placeholder){return `<div class="builder-tag-editor"><div class="builder-tag-list">${(values||[]).map((tag,index)=>`<span>${esc(tag)}<button type="button" data-remove-tag="${index}" aria-label="Remove ${esc(tag)}">×</button></span>`).join('')||'<small>No tags added yet.</small>'}</div><div class="builder-tag-add"><input id="${id}Input" placeholder="${esc(placeholder)}" maxlength="80"><button id="${id}Add" type="button">Add</button></div></div>`}
function skillEditor(){const skills=profile.skills||[];return `<div class="builder-skill-editor"><div class="builder-skill-list">${skills.map((skill,index)=>{const level=Math.max(1,Math.min(5,Number(profile.skillRatings?.[skill])||3));return `<div class="builder-skill-row" data-skill-index="${index}"><div class="builder-skill-order" aria-label="Arrange ${esc(skill)}"><button type="button" data-move-skill="-1" aria-label="Move ${esc(skill)} up" ${index===0?'disabled':''}>↑</button><button type="button" data-move-skill="1" aria-label="Move ${esc(skill)} down" ${index===skills.length-1?'disabled':''}>↓</button></div><label class="builder-skill-name"><input data-skill-name maxlength="80" value="${esc(skill)}" aria-label="Skill name"><small>Proficiency</small></label><div class="builder-skill-rating" role="radiogroup" aria-label="${esc(skill)} proficiency">${[1,2,3,4,5].map(value=>`<button type="button" data-skill-rating="${value}" class="${value<=level?'active':''}" aria-label="${value} out of 5" aria-pressed="${value===level}">★</button>`).join('')}</div><button class="builder-skill-remove" type="button" data-remove-skill="${index}" aria-label="Remove ${esc(skill)}">×</button></div>`}).join('')||'<div class="builder-skill-empty">Add a skill, then choose its proficiency.</div>'}</div><div class="builder-tag-add"><input id="profileSkillInput" placeholder="Type a professional skill" maxlength="80"><button id="profileSkillAdd" type="button">Add</button></div></div>`}
function bindSkillEditor(){const refresh=()=>{renderIdentitySettings();renderPreview();dirty()};const add=()=>{const input=$('profileSkillInput');const skill=input.value.trim();if(!skill)return;if((profile.skills||[]).some(item=>item.toLowerCase()===skill.toLowerCase())){status('That professional skill is already listed.',true);return}profile.skills=[...(profile.skills||[]),skill];profile.skillRatings={...(profile.skillRatings||{}),[skill]:3};refresh()};$('profileSkillAdd').addEventListener('click',add);$('profileSkillInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add()}});$('settingsPanel').querySelectorAll('[data-skill-index]').forEach(row=>{const index=Number(row.dataset.skillIndex);const skill=profile.skills[index];const nameInput=row.querySelector('[data-skill-name]');const rename=()=>{const renamed=nameInput.value.trim();if(!renamed){nameInput.value=skill;status('A skill name cannot be empty.',true);return}if(renamed===skill)return;if(profile.skills.some((item,itemIndex)=>itemIndex!==index&&item.toLowerCase()===renamed.toLowerCase())){nameInput.value=skill;status('That professional skill is already listed.',true);return}const level=Math.max(1,Math.min(5,Number(profile.skillRatings?.[skill])||3));const next={...(profile.skillRatings||{})};delete next[skill];next[renamed]=level;profile.skillRatings=next;profile.skills=profile.skills.map((item,itemIndex)=>itemIndex===index?renamed:item);refresh()};nameInput.addEventListener('change',rename);nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();nameInput.blur()}else if(event.key==='Escape'){nameInput.value=skill;nameInput.blur()}});row.querySelectorAll('[data-move-skill]').forEach(button=>button.addEventListener('click',()=>{profile.skills=moveItem(profile.skills,index,Number(button.dataset.moveSkill));refresh()}));row.querySelectorAll('[data-skill-rating]').forEach(button=>button.addEventListener('click',()=>{profile.skillRatings={...(profile.skillRatings||{}),[skill]:Number(button.dataset.skillRating)};refresh()}));row.querySelector('[data-remove-skill]').addEventListener('click',()=>{const next={...(profile.skillRatings||{})};delete next[skill];profile.skillRatings=next;profile.skills=profile.skills.filter((_,skillIndex)=>skillIndex!==index);refresh()})})}
function imageUpload(id,label,url,multiple=false,removeId=''){const image=safeUrl(url);return `<div class="builder-upload"><strong>${esc(label)}</strong>${image?`<img class="builder-upload-preview" src="${esc(image)}" alt="${esc(label)} preview">`:'<div class="builder-upload-empty">No image uploaded</div>'}<div class="builder-upload-actions"><label class="builder-upload-button">${multiple?'Add images':'Choose image'}<input id="${id}" type="file" accept="image/jpeg,image/png,image/webp"${multiple?' multiple':''}></label>${image&&removeId?`<button id="${removeId}" class="builder-remove-media" type="button">Remove image</button>`:''}</div><small id="${id}Status">JPG, PNG, or WebP · maximum 10 MB each</small></div>`}
function ensureImage(file){if(!file)return;const allowed=['image/jpeg','image/png','image/webp'];if(!allowed.includes(file.type))throw new Error('Choose a JPG, PNG, or WebP image.');if(file.size>10*1024*1024)throw new Error('Each image must be 10 MB or smaller.')}
function cleanFileName(name){return String(name||'image').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)}
function uploadImage(file,path,statusElement){ensureImage(file);return new Promise((resolve,reject)=>{let timedOut=false;const task=uploadBytesResumable(storageRef(storage,path),file,{contentType:file.type,cacheControl:'public,max-age=31536000',customMetadata:{ownerId:user.uid}});const timeout=setTimeout(()=>{timedOut=true;task.cancel()},90000);const finish=(callback,value)=>{clearTimeout(timeout);callback(value)};task.on('state_changed',snapshot=>{const percent=Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100);statusElement.textContent=`Uploading… ${percent}%`},error=>finish(reject,timedOut?new Error('The upload timed out. Please check your connection and try again.'):error),async()=>{try{const url=await getDownloadURL(task.snapshot.ref);finish(resolve,url)}catch(error){finish(reject,error)}})})}
function queueMediaDelete(url,target){if(!url||String(url).startsWith('blob:'))return;try{const reference=storageRef(storage,url);if(reference.fullPath.startsWith(`portfolios/${user.uid}/`))target.add(reference.fullPath)}catch{}}
async function flushMediaDeletes(target){const paths=[...target];if(!paths.length)return 0;const results=await Promise.allSettled(paths.map(path=>deleteObject(storageRef(storage,path))));results.forEach((result,index)=>{if(result.status==='fulfilled'||result.reason?.code==='storage/object-not-found')target.delete(paths[index])});return results.filter(result=>result.status==='rejected'&&result.reason?.code!=='storage/object-not-found').length}
const workMediaDeletes=work=>{if(!(work._mediaDeletes instanceof Set))work._mediaDeletes=new Set();return work._mediaDeletes};
function bindTagEditor(id,getValues,setValues,beforeRender,render){const inputElement=$(`${id}Input`);const addBtn=$(`${id}Add`);if(!inputElement||!addBtn)return;const add=()=>{beforeRender?.();const value=inputElement.value.trim();if(!value)return;const current=getValues();if(!current.some(tag=>tag.toLowerCase()===value.toLowerCase()))setValues([...current,value]);render();dirty()};addBtn.addEventListener('click',add);inputElement.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add()}});$('settingsPanel').querySelectorAll('[data-remove-tag]').forEach(button=>button.addEventListener('click',()=>{beforeRender?.();setValues(getValues().filter((_,index)=>index!==Number(button.dataset.removeTag)));render();dirty()}))}

function renderLists(){
  document.querySelectorAll('[data-builder-tab]').forEach(button=>button.classList.toggle('active',button.dataset.builderTab===activeTab));
  $('sectionPanel').hidden=activeTab!=='sections';$('workPanel').hidden=activeTab!=='works';
  const bizPinned=isBusinessAccount?`<div class="builder-list-item pinned${selectedSection===BUSINESS?' active':''}" data-select-section="${BUSINESS}"><span class="builder-item-icon">🏛️</span><strong>Business profile</strong><small>Verified Studio</small></div>`:'';
  const pinned=`<div class="builder-list-item pinned${selectedSection===IDENTITY?' active':''}" data-select-section="${IDENTITY}"><span class="builder-item-icon">Aa</span><strong>Identity & details</strong><small>Portfolio-owned</small></div>${bizPinned}<div class="builder-list-item pinned${selectedSection===DESIGN?' active':''}" data-select-section="${DESIGN}"><span class="builder-item-icon">◐</span><strong>Design & presentation</strong><small>Theme</small></div>`;
  const sections=(profile.sections||[]).map((section,index)=>`<div class="builder-list-item${selectedSection===section.id?' active':''}" data-select-section="${esc(section.id)}"><button data-move-section="${esc(section.id)}|-1" aria-label="Move up"${index===0?' disabled':''}>↑</button><button data-move-section="${esc(section.id)}|1" aria-label="Move down"${index===profile.sections.length-1?' disabled':''}>↓</button><strong>${esc(section.title)}</strong><button data-delete-section="${esc(section.id)}" aria-label="Delete">×</button></div>`).join('');
  $('sectionList').innerHTML=pinned+sections;
  $('workList').innerHTML=works.length?works.map(work=>`<div class="builder-list-item${selectedWork===work.id?' active':''}" data-select-work="${esc(work.id)}"><strong>${esc(work.title||'Untitled work')}</strong><small>${esc(work.status==='published'?(work._hasDraft?'published · draft changes':'published'):'draft')}</small></div>`).join(''):'<div class="builder-empty">Your professional work will appear here.</div>';
  bindListActions();
}
function bindListActions(){
  $('sectionList').querySelectorAll('[data-select-section]').forEach(item=>item.addEventListener('click',event=>{if(event.target.closest('button'))return;selectedSection=item.dataset.selectSection;selectedWork=null;previewWork=null;renderAll()}));
  $('sectionList').querySelectorAll('[data-move-section]').forEach(button=>button.addEventListener('click',()=>{const[id,stepValue]=button.dataset.moveSection.split('|');const index=profile.sections.findIndex(section=>section.id===id);const target=index+Number(stepValue);if(index<0||target<0||target>=profile.sections.length)return;[profile.sections[index],profile.sections[target]]=[profile.sections[target],profile.sections[index]];renderAll();dirty()}));
  $('sectionList').querySelectorAll('[data-delete-section]').forEach(button=>button.addEventListener('click',()=>{if(!confirm('Remove this section?'))return;profile.sections=profile.sections.filter(section=>section.id!==button.dataset.deleteSection);selectedSection=IDENTITY;renderAll();dirty()}));
  $('workList').querySelectorAll('[data-select-work]').forEach(item=>item.addEventListener('click',()=>{selectedWork=item.dataset.selectWork;selectedSection=null;previewWork=works.find(work=>work.id===selectedWork)||null;renderAll()}));
}

function sidebarSettingsMarkup(sidebar){return `<div class="builder-design-divider builder-sidebar-settings"><div><strong class="builder-form-heading">Résumé sidebar</strong><p class="builder-form-copy">Place skills and professional details in a theme-responsive side area, or hide it completely.</p></div><label><span><input id="sidebarVisible" type="checkbox"${sidebar.visible!==false?' checked':''}> Show résumé sidebar</span></label><div id="sidebarControls"${sidebar.visible===false?' hidden':''}><label>Sidebar heading<input data-sidebar="title" value="${esc(sidebar.title||'Resume details')}" maxlength="100"></label><div class="builder-check-grid"><label><span><input data-sidebar-toggle="showSkills" type="checkbox"${sidebar.showSkills!==false?' checked':''}> Skills</span></label><label><span><input data-sidebar-toggle="showLocation" type="checkbox"${sidebar.showLocation!==false?' checked':''}> Location</span></label><label><span><input data-sidebar-toggle="showAvailability" type="checkbox"${sidebar.showAvailability!==false?' checked':''}> Availability</span></label><label><span><input data-sidebar-toggle="showContact" type="checkbox"${sidebar.showContact!==false?' checked':''}> Contact & links</span></label></div><strong class="builder-form-heading">Custom résumé details</strong><div id="sidebarFields">${(sidebar.fields||[]).map((field,index)=>fieldEditor(field,index)).join('')}</div><button id="addSidebarField" class="builder-add" type="button">+ Add sidebar detail</button></div></div>`}
const builderCardState={};
function builderCard(id,title,content,open=true,note=''){const isOpen=Object.hasOwn(builderCardState,id)?builderCardState[id]:open;return `<details class="builder-collapsible" data-builder-card="${esc(id)}"${isOpen?' open':''}><summary><span><strong>${esc(title)}</strong>${note?`<small>${esc(note)}</small>`:''}</span><b aria-hidden="true">⌄</b></summary><div class="builder-collapsible-content">${content}</div></details>`}
function rememberBuilderCards(){document.querySelectorAll('[data-builder-card]').forEach(card=>card.addEventListener('toggle',()=>{builderCardState[card.dataset.builderCard]=card.open}))}

function bindIdentityCollections(){
  $('addContact').addEventListener('click',()=>{profile.contacts=[...(profile.contacts||[]),{id:uid(),type:'email',label:'Email',value:'',visible:true}];renderIdentitySettings();renderPreview();dirty()});
  $('settingsPanel').querySelectorAll('[data-contact-index]').forEach(row=>{const index=Number(row.dataset.contactIndex);row.querySelectorAll('[data-contact-key]').forEach(control=>control.addEventListener(control.type==='checkbox'?'change':'input',()=>{const key=control.dataset.contactKey;profile.contacts[index][key]=control.type==='checkbox'?control.checked:control.value;renderPreview();dirty()}));row.querySelector('[data-contact-key="type"]').addEventListener('change',()=>renderIdentitySettings());row.querySelector('[data-remove-contact]').addEventListener('click',()=>{profile.contacts=profile.contacts.filter((_,itemIndex)=>itemIndex!==index);renderIdentitySettings();renderPreview();dirty()});row.querySelectorAll('[data-move-contact]').forEach(button=>button.addEventListener('click',()=>{profile.contacts=moveItem(profile.contacts,index,Number(button.dataset.moveContact));renderIdentitySettings();renderPreview();dirty()}))});
  $('addProfileLink').addEventListener('click',()=>{profile.links=[...(profile.links||[]),{id:uid(),label:'',url:'',visible:true}];renderIdentitySettings();renderPreview();dirty()});
  $('settingsPanel').querySelectorAll('[data-link-index]').forEach(row=>{const index=Number(row.dataset.linkIndex);row.querySelectorAll('[data-link-key]').forEach(control=>control.addEventListener(control.type==='checkbox'?'change':'input',()=>{const key=control.dataset.linkKey;profile.links[index][key]=control.type==='checkbox'?control.checked:control.value;renderPreview();dirty()}));row.querySelector('[data-remove-link]').addEventListener('click',()=>{profile.links=profile.links.filter((_,itemIndex)=>itemIndex!==index);renderIdentitySettings();renderPreview();dirty()});row.querySelectorAll('[data-move-link]').forEach(button=>button.addEventListener('click',()=>{profile.links=moveItem(profile.links,index,Number(button.dataset.moveLink));renderIdentitySettings();renderPreview();dirty()}))});
}

function renderIdentitySettings(){
  $('settingsTitle').textContent='Portfolio identity';
  profile.sidebar={...defaultSidebar(),...(profile.sidebar||{}),fields:Array.isArray(profile.sidebar?.fields)?profile.sidebar.fields:[]};
  $('settingsPanel').innerHTML=`<div class="builder-form"><div class="builder-notice">Build your professional identity. Your portfolio starts with the account details you provided at registration.</div><button id="useCommunityData" class="builder-community-copy" type="button">↙ Use my account name, details & photo</button>${builderCard('identity','Identity details',`${input('Portfolio display name','displayName',profile.displayName)}${input('Professional title','professionalTitle',profile.professionalTitle)}${input('Short professional statement','tagline',profile.tagline,'textarea')}<div class="builder-inline">${input('Location','location',profile.location)}${input('Availability','availability',profile.availability)}</div>`,true,'Name, role and professional statement')}${builderCard('skills','Professional skills & proficiency',skillEditor(),true,'Edit, rate and arrange your skills')}${builderCard('sidebar','Résumé sidebar',sidebarSettingsMarkup(profile.sidebar),false,'Optional professional details beside your work')}${builderCard('contacts','Contact information',contactEditor(),false,'Public contact methods')}${builderCard('links','Professional links',linkEditor(),false,'Websites and social profiles')}${builderCard('images','Portfolio images',`<label class="builder-visibility-toggle"><span><input data-profile="avatarVisible" type="checkbox"${profile.avatarVisible!==false?' checked':''}> Show image on portfolio page and PDF</span><small>The uploaded avatar or studio logo stays saved when hidden.</small></label>${imageUpload('profileAvatarUpload','Portfolio avatar',profile.avatarUrl,false,'removeProfileAvatar')}${imageUpload('profileCoverUpload','Portfolio cover',profile.coverUrl,false,'removeProfileCover')}`,false,'Avatar and cover image')}</div>`;
  rememberBuilderCards();
  const sidebarChecks=$('sidebarControls')?.querySelector('.builder-check-grid');
  sidebarChecks?.insertAdjacentHTML('beforebegin',`<label>Section width<select data-sidebar="width"><option value="narrow"${profile.sidebar.width==='narrow'?' selected':''}>Narrow — more room for portfolio content</option><option value="balanced"${profile.sidebar.width==='balanced'?' selected':''}>Balanced</option><option value="wide"${profile.sidebar.width==='wide'?' selected':''}>Wide — more room for résumé details</option></select></label>`);
  bindProfileInputs();
  bindSkillEditor();
  bindProfileImageUpload('profileAvatarUpload','avatarUrl','avatar');
  bindProfileImageUpload('profileCoverUpload','coverUrl','cover');
  bindProfileImageRemoval('removeProfileAvatar','avatarUrl','Avatar');
  bindProfileImageRemoval('removeProfileCover','coverUrl','Cover');
  bindSidebarSettings();
  bindIdentityCollections();
  $('useCommunityData').addEventListener('click',()=>{profile.displayName=communityProfile.displayName||user?.displayName||profile.displayName;profile.professionalTitle=communityProfile.specialization||communityProfile.profession||profile.professionalTitle;profile.location=communityProfile.location||profile.location;profile.avatarUrl=communityProfile.photoURL||user?.photoURL||profile.avatarUrl;profile.contactEmail=user?.email||profile.contactEmail;if(user?.email&&!(profile.contacts||[]).some(contact=>contact.type==='email'&&contact.value===user.email))profile.contacts=[...(profile.contacts||[]),{id:uid(),type:'email',label:'Professional email',value:user.email,visible:false}];renderAll();dirty();status('Professional details copied — review them before saving')});
}
function bindSidebarSettings(){const sidebar=profile.sidebar;$('sidebarVisible').addEventListener('change',event=>{sidebar.visible=event.target.checked;renderIdentitySettings();renderPreview();dirty()});$('settingsPanel').querySelectorAll('[data-sidebar]').forEach(control=>control.addEventListener('input',()=>{sidebar[control.dataset.sidebar]=control.value;renderPreview();dirty()}));$('settingsPanel').querySelectorAll('[data-sidebar-toggle]').forEach(control=>control.addEventListener('change',()=>{sidebar[control.dataset.sidebarToggle]=control.checked;renderPreview();dirty()}));bindFieldEditors(sidebar,'sidebarFields',()=>renderIdentitySettings());$('addSidebarField')?.addEventListener('click',()=>{sidebar.fields.push({id:uid(),label:'New detail',value:'',type:'text',labelSize:'standard',valueSize:'standard',visible:true});renderIdentitySettings();renderPreview();dirty()})}
function bindProfileImageRemoval(buttonId,key,label){$(buttonId)?.addEventListener('click',()=>{queueMediaDelete(profile[key],pendingProfileMediaDeletes);profile[key]='';renderIdentitySettings();renderPreview();dirty();status(`${label} removed — save your portfolio to confirm`)})}
function bindProfileImageUpload(inputId,key,kind){
  $(inputId).addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;const progress=$(`${inputId}Status`);try{const previous=profile[key];const path=`portfolios/${user.uid}/profile/${kind}-${Date.now()}-${cleanFileName(file.name)}`;profile[key]=await uploadImage(file,path,progress);queueMediaDelete(previous,pendingProfileMediaDeletes);preserveBuilderScroll(()=>{renderIdentitySettings();renderPreview()});dirty();status(`${kind==='avatar'?'Avatar':'Cover'} uploaded — save your portfolio to keep it`)}catch(error){console.error(error);progress.textContent=friendlyError(error,'Upload failed. Please try again.');progress.style.color='#a32626'}});
}
function themeActionsMarkup(){
  const custom=profile.themePackage?normaliseThemePackage(profile.themePackage):null;
  const totalThemes=savedThemes.length+myThemes.length;
  return `
    <div class="builder-theme-sources">
      <div>
        <strong class="builder-form-heading">Theme library &amp; management</strong>
        <p class="builder-form-copy">Use platform themes, manage your created themes, or apply community styles.</p>
      </div>
      <div class="builder-theme-actions">
        <label class="builder-theme-action">
          ↑<span><strong>Upload local file</strong><small>.aias-theme.json</small></span>
          <input id="uploadThemeFile" type="file" accept=".json,.aias-theme.json,application/json">
        </label>
        <button id="openSavedThemes" class="builder-theme-action" type="button">
          ▣<span><strong>Saved themes</strong><small>${totalThemes} in your library</small></span>
        </button>
        <a class="builder-theme-action" href="portfolio-theme-builder.html">
          ＋<span><strong>Create new theme</strong><small>Open Theme Studio</small></span>
        </a>
        ${custom?`
          <button id="toolbarDetachTheme" class="builder-theme-action" type="button" style="border-color:#e0a0a0;background:#fff8f8;">
            ✕<span><strong style="color:#b91c1c;">Remove custom theme</strong><small>Restore preset themes</small></span>
          </button>
        `:''}
      </div>
      ${custom?`
        <div class="builder-active-community-theme">
          <div class="builder-active-theme-card">
            <div class="builder-active-theme-head">
              <span class="builder-active-theme-badge">★ Active Custom Theme</span>
              <button id="removeCommunityTheme" class="builder-detach-theme-btn" type="button">✕ Remove custom theme</button>
            </div>
            <strong class="builder-active-theme-name">${esc(custom.name)}</strong>
            <p class="builder-active-theme-note">${esc(custom.description||'Custom typography, colors, and layout from Theme Studio.')}</p>
            <label class="builder-active-theme-palette-label">Theme palette
              <select id="communityThemePalette">
                ${custom.palettes.map(palette=>`<option value="${esc(palette.id)}"${profile.themePaletteId===palette.id?' selected':''}>${esc(palette.name)}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
      `:''}
    </div>
  `;
}

function ensureSavedThemeDialog(){
  let dialog=$('savedThemeDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='savedThemeDialog';
  dialog.className='builder-theme-dialog';
  document.body.append(dialog);
  return dialog;
}

function applyCommunityTheme(themePackage,paletteId=''){
  applyThemePackageToProfile(profile,themePackage,paletteId);
  renderDesignSettings();
  renderPreview();
  dirty();
  status(`“${profile.themePackage.name}” applied — save or publish your portfolio to keep it`);
}

function renderThemeManagerDialog(dialog, currentTab='my'){
  const totalCount=myThemes.length+savedThemes.length;
  dialog.innerHTML=`
    <div class="builder-theme-dialog-head">
      <div>
        <strong>Theme Library &amp; Management</strong>
        <small>${totalCount} theme${totalCount===1?'':'s'} in your personal library</small>
      </div>
      <button type="button" aria-label="Close">×</button>
    </div>
    <div class="builder-theme-tabs">
      <button class="builder-theme-tab${currentTab==='my'?' active':''}" type="button" data-manager-tab="my">Created by me (${myThemes.length})</button>
      <button class="builder-theme-tab${currentTab==='saved'?' active':''}" type="button" data-manager-tab="saved">Saved from Store (${savedThemes.length})</button>
    </div>
    <div id="savedThemeGrid" class="builder-saved-theme-grid"></div>
    <div class="builder-theme-dialog-foot">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <a class="builder-theme-store-link" href="portfolio-theme-builder.html">＋ Create new theme in Studio</a>
        <span>·</span>
        <label style="cursor:pointer;color:#661f22;font-weight:800">
          ↑ Upload theme file (.json)
          <input id="modalUploadThemeFile" type="file" accept=".json,.aias-theme.json,application/json" style="display:none">
        </label>
      </div>
      <a class="builder-theme-store-link" href="market-themes.html" target="_blank">Explore Theme Store →</a>
    </div>
  `;

  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close();};

  dialog.querySelectorAll('[data-manager-tab]').forEach(btn=>{
    btn.onclick=()=>renderThemeManagerDialog(dialog, btn.dataset.managerTab);
  });

  dialog.querySelector('#modalUploadThemeFile')?.addEventListener('change',async event=>{
    try{
      const pkg=await readThemeFile(event.target.files?.[0]);
      dialog.close();
      applyCommunityTheme(pkg,pkg.palettes[0].id);
    }catch(error){
      status(error.message||'Could not read theme file.',true);
    }
  });

  const grid=dialog.querySelector('#savedThemeGrid');
  if(currentTab==='my'){
    if(!myThemes.length){
      grid.innerHTML=`
        <div class="builder-theme-empty">
          <strong>No created themes yet</strong>
          <p>Design your own theme directions with complete control over fonts, layouts, and colors.</p>
          <a class="pf-button primary" href="portfolio-theme-builder.html" style="margin-top:10px">+ Open Theme Studio</a>
        </div>
      `;
    }else{
      grid.innerHTML=myThemes.map((item,index)=>{
        const p=item.palettes[0]||{accent:'#661f22',bg:'#f7f3ed',ink:'#211a1b'};
        const isPublished=item.status==='published';
        return `
          <article class="builder-theme-item">
            <div class="builder-saved-theme-preview" style="--saved-accent:${p.accent};--saved-bg:${p.bg};--saved-ink:${p.ink}">
              <i></i><span></span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              <strong>${esc(item.name)}</strong>
              <span class="theme-status-pill ${isPublished?'published':'private'}"><i></i>${isPublished?'Store':'Private'}</span>
            </div>
            <small>${esc(item.description||`${item.baseTheme} style`)} · ${item.palettes.length} palette${item.palettes.length===1?'':'s'}</small>
            <label>Palette
              <select data-my-palette="${index}">
                ${item.palettes.map(palette=>`<option value="${esc(palette.id)}">${esc(palette.name)}</option>`).join('')}
              </select>
            </label>
            <div class="builder-theme-item-actions">
              <button class="primary" type="button" data-use-my-theme="${index}">Use theme</button>
              <a href="portfolio-theme-builder.html?id=${encodeURIComponent(item.id)}">Edit in Studio</a>
              <button type="button" data-toggle-my-visibility="${index}">${isPublished?'Make Private':'Share in Store'}</button>
              <button type="button" data-download-my-theme="${index}">Download</button>
              <button class="danger" type="button" data-delete-my-theme="${index}">Delete</button>
            </div>
          </article>
        `;
      }).join('');

      grid.querySelectorAll('[data-use-my-theme]').forEach(button=>{
        button.onclick=()=>{
          const index=Number(button.dataset.useMyTheme);
          const themeItem=myThemes[index];
          const palette=grid.querySelector(`[data-my-palette="${index}"]`).value;
          dialog.close();
          applyCommunityTheme(themeItem,palette);
        };
      });

      grid.querySelectorAll('[data-toggle-my-visibility]').forEach(button=>{
        button.onclick=async()=>{
          const index=Number(button.dataset.toggleMyVisibility);
          const themeItem=myThemes[index];
          const nextStatus=themeItem.status==='published'?'private':'published';
          button.disabled=true;
          button.textContent='Updating…';
          try{
            await callFunction('setPortfolioThemeStatus',{themeId:themeItem.id,status:nextStatus});
            themeItem.status=nextStatus;
            status(`Theme “${themeItem.name}” is now ${nextStatus==='published'?'shared in the Theme Store':'private'}`);
            renderThemeManagerDialog(dialog, 'my');
          }catch(error){
            console.error(error);
            status(error.message||'Could not update theme status.',true);
            button.disabled=false;
          }
        };
      });

      grid.querySelectorAll('[data-download-my-theme]').forEach(button=>{
        button.onclick=()=>{
          const index=Number(button.dataset.downloadMyTheme);
          themeDownload(myThemes[index]);
          status('Theme file downloaded');
        };
      });

      grid.querySelectorAll('[data-delete-my-theme]').forEach(button=>{
        button.onclick=async()=>{
          const index=Number(button.dataset.deleteMyTheme);
          const themeItem=myThemes[index];
          if(!confirm(`Are you sure you want to delete the theme “${themeItem.name}”?`))return;
          button.disabled=true;
          button.textContent='Deleting…';
          try{
            try{
              await callFunction('deletePortfolioTheme',{themeId:themeItem.id});
            }catch(callErr){
              await deleteDoc(doc(db,'portfolioThemes',themeItem.id));
              await deleteDoc(doc(db,'users',user.uid,'savedPortfolioThemes',themeItem.id)).catch(()=>{});
            }
            myThemes.splice(index,1);
            status(`Theme “${themeItem.name}” deleted.`);
            renderThemeManagerDialog(dialog, 'my');
          }catch(error){
            console.error(error);
            status(error.message||'Could not delete theme.',true);
            button.disabled=false;
          }
        };
      });
    }
  }else{
    if(!savedThemes.length){
      grid.innerHTML=`
        <div class="builder-theme-empty">
          <strong>No saved themes yet</strong>
          <p>Visit the Theme Store to discover free community themes and save them to your account.</p>
          <a class="pf-button secondary" href="market-themes.html" target="_blank" style="margin-top:10px">Browse Theme Store →</a>
        </div>
      `;
    }else{
      grid.innerHTML=savedThemes.map((entry,index)=>{
        const item=normaliseThemePackage(entry.themePackage);
        const p=item.palettes[0]||{accent:'#661f22',bg:'#f7f3ed',ink:'#211a1b'};
        return `
          <article class="builder-theme-item">
            <div class="builder-saved-theme-preview" style="--saved-accent:${p.accent};--saved-bg:${p.bg};--saved-ink:${p.ink}">
              <i></i><span></span>
            </div>
            <strong>${esc(item.name)}</strong>
            <small>By ${esc(item.creatorName||'Professional creator')} · ${item.palettes.length} palette${item.palettes.length===1?'':'s'}</small>
            <label>Palette
              <select data-saved-palette="${index}">
                ${item.palettes.map(palette=>`<option value="${esc(palette.id)}">${esc(palette.name)}</option>`).join('')}
              </select>
            </label>
            <div class="builder-theme-item-actions">
              <button class="primary" type="button" data-use-saved-theme="${index}">Use theme</button>
              <button type="button" data-download-saved-theme="${index}">Download</button>
              <button class="danger" type="button" data-remove-saved-theme="${index}">Remove</button>
            </div>
          </article>
        `;
      }).join('');

      grid.querySelectorAll('[data-use-saved-theme]').forEach(button=>{
        button.onclick=()=>{
          const index=Number(button.dataset.useSavedTheme);
          const entry=savedThemes[index];
          const palette=grid.querySelector(`[data-saved-palette="${index}"]`).value;
          dialog.close();
          applyCommunityTheme(entry.themePackage,palette);
        };
      });

      grid.querySelectorAll('[data-download-saved-theme]').forEach(button=>{
        button.onclick=()=>{
          const index=Number(button.dataset.downloadSavedTheme);
          themeDownload(normaliseThemePackage(savedThemes[index].themePackage));
          status('Theme file downloaded');
        };
      });

      grid.querySelectorAll('[data-remove-saved-theme]').forEach(button=>{
        button.onclick=async()=>{
          const index=Number(button.dataset.removeSavedTheme);
          const entry=savedThemes[index];
          const themeId=entry.themeId||entry.id;
          button.disabled=true;
          button.textContent='Removing…';
          try{
            try{
              await callFunction('removeSavedPortfolioTheme',{themeId});
            }catch(callErr){
              await deleteDoc(doc(db,'users',user.uid,'savedPortfolioThemes',themeId));
            }
            savedThemes.splice(index,1);
            status('Theme removed from your account.');
            renderThemeManagerDialog(dialog, 'saved');
          }catch(error){
            console.error(error);
            status(error.message||'Could not remove theme.',true);
            button.disabled=false;
          }
        };
      });
    }
  }
}

function showSavedThemes(){
  const dialog=ensureSavedThemeDialog();
  renderThemeManagerDialog(dialog, myThemes.length ? 'my' : 'saved');
  dialog.showModal();
}

function bindThemeSourceActions(){
  $('uploadThemeFile')?.addEventListener('change',async event=>{
    try{
      const packageValue=await readThemeFile(event.target.files?.[0]);
      applyCommunityTheme(packageValue,packageValue.palettes[0].id);
    }catch(error){
      status(error.message||'Could not read the theme file.',true);
    }finally{
      event.target.value='';
    }
  });
  $('openSavedThemes')?.addEventListener('click',showSavedThemes);
  $('communityThemePalette')?.addEventListener('change',event=>applyCommunityTheme(profile.themePackage,event.target.value));
  const detachCustomTheme=()=>{
    profile.themePackage=null;
    profile.themePaletteId='';
    profile.palette='heritage_wine';
    profile.accent='#661f22';
    renderDesignSettings();
    renderPreview();
    dirty();
    status('Custom theme detached — platform theme library restored. Save your portfolio to confirm.');
  };
  $('removeCommunityTheme')?.addEventListener('click',detachCustomTheme);
  $('toolbarDetachTheme')?.addEventListener('click',detachCustomTheme);
  $('bannerDetachTheme')?.addEventListener('click',detachCustomTheme);
}
function openMultiThemePicker(){
  let dialog=$('multiThemePickerDialog');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='multiThemePickerDialog';
    dialog.className='builder-theme-dialog';
    document.body.append(dialog);
  }

  const builtIns=themes.map(t=>({
    id:`built-in-${t.id}`,
    name:t.name,
    type:'built-in',
    theme:t.id,
    palette:'heritage_wine',
    accent:'#661f22',
    surfaceStyle:'cards',
    workLayout:'cards',
    density:'comfortable',
    fieldBackgrounds:true,
    themePackage:null,
    themePaletteId:''
  }));

  const communityOptions=[...myThemes,...savedThemes.map(s=>s.themePackage?normaliseThemePackage(s.themePackage):null).filter(Boolean)].map(item=>({
    id:`community-${item.id||uid()}`,
    name:item.name,
    type:'community',
    theme:item.baseTheme||'minimal',
    palette:item.palettes?.[0]?.id||'custom',
    accent:item.palettes?.[0]?.accent||'#661f22',
    surfaceStyle:item.surfaceStyle||'cards',
    workLayout:item.workLayout||'cards',
    density:item.density||'comfortable',
    fieldBackgrounds:item.fieldBackgrounds!==false,
    themePackage:item,
    themePaletteId:item.palettes?.[0]?.id||''
  }));

  const allAvailable=[...builtIns,...communityOptions];

  dialog.innerHTML=`
    <div class="builder-theme-dialog-head">
      <div>
        <strong>Add Theme Style to Showcase</strong>
        <small>Choose a style visitors can switch to on your public portfolio</small>
      </div>
      <button type="button" aria-label="Close">×</button>
    </div>
    <div class="builder-saved-theme-grid" style="padding:20px">
      ${allAvailable.map((opt,idx)=>`
        <article class="builder-theme-item">
          <div class="builder-saved-theme-preview" style="--saved-accent:${opt.accent};--saved-bg:#f7f3ed;--saved-ink:#211a1b">
            <i></i><span></span>
          </div>
          <strong>${esc(opt.name)}</strong>
          <small>${esc(opt.type==='community'?'Custom theme package':'Platform preset')}</small>
          <button class="primary" type="button" data-select-showcase-theme="${idx}">+ Add to Showcase</button>
        </article>
      `).join('')}
    </div>
  `;
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
  dialog.querySelectorAll('[data-select-showcase-theme]').forEach(btn=>{
    btn.onclick=()=>{
      const idx=Number(btn.dataset.selectShowcaseTheme);
      const chosen=allAvailable[idx];
      profile.multiThemePublish=profile.multiThemePublish||{enabled:true,themes:[]};
      profile.multiThemePublish.enabled=true;
      profile.multiThemePublish.themes=Array.isArray(profile.multiThemePublish.themes)?profile.multiThemePublish.themes:[];
      profile.multiThemePublish.themes.push(chosen);
      dialog.close();
      renderDesignSettings();
      renderPreview();
      dirty();
      status(`“${chosen.name}” added to multi-theme showcase`);
    };
  });
  dialog.showModal();
}

function isThemeItemActive(item, prof){
  if (item.type === 'community' || item.themePackage) {
    const pkgId = item.themePackage?.id;
    return Boolean(prof.themePackage && prof.themePackage.id === pkgId && (prof.themePaletteId || '') === (item.themePaletteId || ''));
  }
  return !prof.themePackage && prof.theme === item.theme && prof.palette === item.palette && (item.accent ? prof.accent === item.accent : true);
}

function applyThemeOptionToProfile(item){
  if(item.type==='community'||item.themePackage){
    profile.themePackage=normaliseThemePackage(item.themePackage);
    profile.themePaletteId=item.themePaletteId||'';
    profile.surfaceStyle=item.surfaceStyle||profile.themePackage.surfaceStyle||'cards';
    profile.workLayout=item.workLayout||profile.themePackage.workLayout||'cards';
    profile.density=item.density||profile.themePackage.density||'comfortable';
    profile.fieldBackgrounds=item.fieldBackgrounds!==false;
  }else{
    profile.themePackage=null;
    profile.themePaletteId='';
    profile.theme=item.theme||'minimal';
    profile.palette=item.palette||'heritage_wine';
    profile.accent=item.accent||'#661f22';
    profile.surfaceStyle=item.surfaceStyle||'cards';
    profile.workLayout=item.workLayout||'cards';
    profile.density=item.density||'comfortable';
    profile.fieldBackgrounds=item.fieldBackgrounds!==false;
  }
}

function createThemeOptionSnapshot(){
  const custom=profile.themePackage?normaliseThemePackage(profile.themePackage):null;
  const p=custom?(custom.palettes?.find(x=>x.id===profile.themePaletteId)||custom.palettes?.[0]):(portfolioPalettes.find(x=>x.id===profile.palette)||{name:'Custom',accent:profile.accent||'#661f22'});
  return{
    id:`style-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    name:custom?`${custom.name} (${p?.name||'Custom'})`:`${themes.find(t=>t.id===profile.theme)?.name||'Theme'} (${p?.name||'Palette'})`,
    type:custom?'community':'built-in',
    theme:profile.theme||'minimal',
    palette:profile.palette||'heritage_wine',
    accent:profile.accent||'#661f22',
    surfaceStyle:profile.surfaceStyle||'cards',
    workLayout:profile.workLayout||'cards',
    density:profile.density||'comfortable',
    fieldBackgrounds:profile.fieldBackgrounds!==false,
    themePackage:profile.themePackage||null,
    themePaletteId:profile.themePaletteId||''
  };
}

function multiThemeShowcaseMarkup(){
  profile.multiThemePublish=profile.multiThemePublish||{enabled:false,themes:[]};
  const isEnabled=profile.multiThemePublish.enabled===true;
  const currentThemes=Array.isArray(profile.multiThemePublish.themes)?profile.multiThemePublish.themes:[];
  return `
    <div class="builder-multi-theme-section">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <strong class="builder-form-heading">Multi-theme showcase</strong>
        ${currentThemes.length?`<span class="builder-multi-theme-count">${currentThemes.length} style${currentThemes.length===1?'':'s'}</span>`:''}
      </div>
      <p class="builder-form-copy">Publish your portfolio in multiple design styles so visitors can switch between them on your public page.</p>
      <label class="builder-multi-theme-toggle">
        <input id="toggleMultiThemePublish" type="checkbox"${isEnabled?' checked':''}>
        <span>Allow visitors to switch theme styles on published page</span>
      </label>
      <div id="multiThemePublishControls"${isEnabled?'':' style="display:none"'}>
        <div class="builder-multi-theme-list">
          ${currentThemes.map((item,index)=>{
            const isPrimary = index === 0;
            const p=item.themePackage?(item.themePackage.palettes?.find(x=>x.id===item.themePaletteId)||item.themePackage.palettes?.[0]):(portfolioPalettes.find(x=>x.id===item.palette)||{accent:item.accent||'#661f22',bg:'#f7f3ed',name:item.palette});
            const isCurrentActive = isThemeItemActive(item, profile);
            return `
              <div class="builder-multi-theme-item${isCurrentActive?' active':''}" data-multi-theme-index="${index}">
                <i style="background:${p?.accent||'#661f22'}"></i>
                <div class="builder-multi-theme-item-body" data-select-multi-theme="${index}" title="Click to view and edit this theme style in the builder">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong>${esc(item.name||item.theme||'Theme style')}</strong>
                    ${isPrimary?'<span class="builder-primary-badge">★ Primary</span>':''}
                    ${isCurrentActive?'<span class="builder-editing-badge">Editing</span>':''}
                  </div>
                  <small>${esc(item.type==='community'?'Custom theme':'Platform theme')} · ${esc(p?.name||item.palette||'Palette')}</small>
                </div>
                <div class="builder-multi-theme-item-actions">
                  ${!isPrimary?`<button type="button" class="builder-make-primary-btn" data-make-primary-multi-theme="${index}" title="Set as primary (default) theme">★ Set primary</button>`:''}
                  <button type="button" class="builder-remove-multi-theme-btn" data-remove-multi-theme="${index}" title="Remove style from showcase" aria-label="Remove theme from showcase">×</button>
                </div>
              </div>
            `;
          }).join('')||'<div class="builder-collection-empty">No alternate styles added yet. Add current or library themes to your showcase.</div>'}
        </div>
        <div class="builder-add-multi-theme-bar">
          <button id="addCurrentAsMultiTheme" type="button" class="builder-add">+ Add current style to showcase</button>
          <button id="pickThemeForMultiTheme" type="button" class="pf-button secondary">+ Add from library</button>
        </div>
      </div>
      <div class="builder-design-divider" style="margin-top:16px;"></div>
    </div>
  `;
}

function renderDesignSettings(){
  $('settingsTitle').textContent='Design & presentation';
  const custom=profile.themePackage?normaliseThemePackage(profile.themePackage):null;
  const paletteGroups=[...new Set(portfolioPalettes.map(palette=>palette.family))];

  const manualControlsMarkup=`
    <div><strong class="builder-form-heading">Portfolio theme</strong><p class="builder-form-copy">Choose a complete visual direction. Your content stays unchanged.</p></div>
    <div class="builder-theme-grid">${themes.map(theme=>`<button type="button" class="builder-theme-card theme-swatch-${theme.id}${profile.theme===theme.id&&!custom?' active':''}" data-theme="${theme.id}"><i></i><strong>${theme.name}</strong><small>${theme.note}</small></button>`).join('')}</div>
    <div class="builder-design-divider"><strong class="builder-form-heading">Colour palette</strong><p class="builder-form-copy">Every palette works with every theme. Try combinations until the design matches your work.</p></div>
    <div class="builder-palette-library">${paletteGroups.map(family=>`<section><h4>${esc(family)}</h4><div class="builder-palette-grid">${portfolioPalettes.filter(palette=>palette.family===family).map(palette=>`<button type="button" class="builder-palette-card${profile.palette===palette.id&&!custom?' active':''}" data-palette="${palette.id}" title="${esc(palette.name)}"><i><span style="background:${palette.ink}"></span><span style="background:${palette.accent}"></span><span style="background:${palette.soft}"></span><span style="background:${palette.surface}"></span></i><strong>${esc(palette.name)}</strong></button>`).join('')}</div></section>`).join('')}<section><h4>Custom</h4><button type="button" class="builder-palette-card custom${profile.palette==='custom'&&!custom?' active':''}" data-palette="custom"><i><span style="background:#211a1b"></span><span style="background:${esc(profile.accent||'#661f22')}"></span><span style="background:#f0daa1"></span><span style="background:#fffdfa"></span></i><strong>Custom accent</strong></button><label class="builder-custom-colour">Choose custom accent<input id="customPaletteAccent" type="color" value="${esc(profile.accent||'#661f22')}"></label></section></div>
    ${input('Section presentation','surfaceStyle',profile.surfaceStyle,'select',[{value:'cards',label:'Professional cards'},{value:'flat',label:'Clean borderless'},{value:'outline',label:'Outlined panels'},{value:'elevated',label:'Elevated cards'}])}
    <label class="builder-presentation-toggle"><span><input data-profile="fieldBackgrounds" type="checkbox"${profile.fieldBackgrounds!==false?' checked':''}> Show filled backgrounds behind detail fields</span><small>Turn this off for clean text-only details while keeping the selected theme.</small></label>
    ${input('Work presentation','workLayout',profile.workLayout,'select',[{value:'cards',label:'Standard cards'},{value:'posters',label:'Large visual posters'},{value:'list',label:'Compact professional list'}])}
    ${input('Content spacing','density',profile.density,'select',[{value:'comfortable',label:'Comfortable'},{value:'compact',label:'Compact'},{value:'spacious',label:'Spacious'}])}
  `;

  $('settingsPanel').innerHTML=`
    <div class="builder-form">
      ${themeActionsMarkup()}
      ${multiThemeShowcaseMarkup()}
      ${custom?`
        <div class="builder-theme-locked-banner" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <i>🔒</i>
            <span>Manual controls locked by <strong>${esc(custom.name)}</strong>.</span>
          </div>
          <button id="bannerDetachTheme" type="button" class="builder-detach-theme-btn" style="white-space:nowrap;">✕ Remove custom theme</button>
        </div>
        <fieldset class="builder-theme-locked-fieldset" disabled>
          ${manualControlsMarkup}
        </fieldset>
      `:manualControlsMarkup}
    </div>
  `;

  if(!custom){
    $('settingsPanel').querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{profile.themePackage=null;profile.themePaletteId='';profile.theme=button.dataset.theme;renderDesignSettings();renderPreview();dirty()}));
    $('settingsPanel').querySelectorAll('[data-palette]').forEach(button=>button.addEventListener('click',()=>{profile.themePackage=null;profile.themePaletteId='';profile.palette=button.dataset.palette;const selected=portfolioPalettes.find(palette=>palette.id===profile.palette);if(selected)profile.accent=selected.accent;renderDesignSettings();renderPreview();dirty()}));
    $('customPaletteAccent')?.addEventListener('input',event=>{profile.themePackage=null;profile.themePaletteId='';profile.palette='custom';profile.accent=event.target.value;renderPreview();dirty()});
    $('customPaletteAccent')?.addEventListener('change',()=>renderDesignSettings());
    bindProfileInputs();
  }

  bindThemeSourceActions();

  $('toggleMultiThemePublish')?.addEventListener('change',event=>{
    profile.multiThemePublish=profile.multiThemePublish||{enabled:false,themes:[]};
    profile.multiThemePublish.enabled=event.target.checked;
    if(event.target.checked&&(!profile.multiThemePublish.themes||!profile.multiThemePublish.themes.length)){
      profile.multiThemePublish.themes=[createThemeOptionSnapshot()];
    }
    renderDesignSettings();
    dirty();
  });

  $('addCurrentAsMultiTheme')?.addEventListener('click',()=>{
    profile.multiThemePublish=profile.multiThemePublish||{enabled:true,themes:[]};
    profile.multiThemePublish.enabled=true;
    profile.multiThemePublish.themes=Array.isArray(profile.multiThemePublish.themes)?profile.multiThemePublish.themes:[];
    profile.multiThemePublish.themes.push(createThemeOptionSnapshot());
    renderDesignSettings();
    dirty();
    status('Current style snapshot added to multi-theme showcase');
  });

  $('pickThemeForMultiTheme')?.addEventListener('click',openMultiThemePicker);

  $('settingsPanel').querySelectorAll('[data-select-multi-theme]').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx=Number(el.dataset.selectMultiTheme);
      const item=profile.multiThemePublish?.themes?.[idx];
      if(!item)return;
      applyThemeOptionToProfile(item);
      renderDesignSettings();
      renderPreview();
      dirty();
      status(`Editing showcase style: “${item.name||item.theme}”`);
    });
  });

  $('settingsPanel').querySelectorAll('[data-make-primary-multi-theme]').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      const idx=Number(btn.dataset.makePrimaryMultiTheme);
      if(idx > 0 && profile.multiThemePublish?.themes?.length > idx){
        const [chosen]=profile.multiThemePublish.themes.splice(idx,1);
        profile.multiThemePublish.themes.unshift(chosen);
        applyThemeOptionToProfile(chosen);
        renderDesignSettings();
        renderPreview();
        dirty();
        status(`“${chosen.name||chosen.theme}” is now the Primary theme`);
      }
    });
  });

  $('settingsPanel').querySelectorAll('[data-remove-multi-theme]').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      const idx=Number(btn.dataset.removeMultiTheme);
      profile.multiThemePublish.themes.splice(idx,1);
      renderDesignSettings();
      dirty();
    });
  });
}
function workSelectionMarkup(section){const published=works.filter(work=>work.status==='published');const selected=Array.isArray(section.workIds)?new Set(section.workIds):new Set(published.map(work=>work.id));return `<div class="builder-work-picker"><div><strong>Projects shown in this section</strong><small>Choose from your published professional work. You can use different selections in different Work sections.</small></div>${published.length?`<div class="builder-work-picker-list">${published.map(work=>`<label><input type="checkbox" data-section-work="${esc(work.id)}"${selected.has(work.id)?' checked':''}><span>${work.coverUrl?`<img src="${esc(safeUrl(work.coverUrl))}" alt="">`:''}<b>${esc(work.title||'Untitled work')}</b><small>${esc(work.workType||'Professional work')}</small></span></label>`).join('')}</div>`:'<div class="builder-notice">Publish a project first, then return here to select it.</div>'}</div>`}
function renderSectionSettings(section){
  $('settingsTitle').textContent='Edit section';
  $('settingsPanel').innerHTML=`<div class="builder-form">${input('Section title','sectionTitle',section.title)}${input('Section type','sectionType',section.type,'select',sectionTypes)}${input('Introduction','sectionContent',section.content,'textarea')}<label><span><input id="sectionVisible" type="checkbox"${section.visible!==false?' checked':''}> Show this section</span></label>${section.type==='work'?workSelectionMarkup(section):''}<h3 style="margin:8px 0 0">Custom fields</h3><div id="sectionFields">${(section.fields||[]).map((field,index)=>fieldEditor(field,index,(section.fields||[]).length)).join('')}</div><button id="addField" class="builder-add" type="button">+ Add custom field</button></div>`;
  $('settingsPanel').querySelector('[data-profile="sectionTitle"]').addEventListener('input',event=>{section.title=event.target.value;renderLists();renderPreview();dirty()});$('settingsPanel').querySelector('[data-profile="sectionType"]').addEventListener('change',event=>{section.type=event.target.value;renderSectionSettings(section);renderPreview();dirty()});$('settingsPanel').querySelector('[data-profile="sectionContent"]').addEventListener('input',event=>{section.content=event.target.value;renderPreview();dirty()});$('sectionVisible').addEventListener('change',event=>{section.visible=event.target.checked;renderPreview();dirty()});$('settingsPanel').querySelectorAll('[data-section-work]').forEach(control=>control.addEventListener('change',()=>{const publishedIds=works.filter(work=>work.status==='published').map(work=>work.id);const current=new Set(Array.isArray(section.workIds)?section.workIds:publishedIds);control.checked?current.add(control.dataset.sectionWork):current.delete(control.dataset.sectionWork);section.workIds=[...current];renderPreview();dirty()}));bindFieldEditors(section,'sectionFields',()=>renderSectionSettings(section));$('addField').addEventListener('click',()=>{section.fields.push({id:uid(),label:'New field',value:'',type:'text',labelSize:'standard',valueSize:'standard',visible:true});renderSectionSettings(section);renderPreview();dirty()});
}
function fieldValueControl(field){const value=String(field.value||'');const common=`data-field-key="value" value="${esc(value)}"`;if(field.type==='longtext')return `<textarea data-field-key="value" placeholder="Write a longer description">${esc(value)}</textarea>`;if(field.type==='number')return `<input ${common} type="number" inputmode="decimal">`;if(field.type==='date')return `<input ${common} type="date">`;if(field.type==='daterange'){const[start='',end='']=value.split('|');return `<div class="builder-inline builder-date-range"><label>Start<input data-field-range="start" type="date" value="${esc(start)}"></label><label>End<input data-field-range="end" type="date" value="${esc(end)}"></label></div>`}if(field.type==='url')return `<input ${common} type="url" placeholder="https://example.com">`;if(field.type==='youtube')return `<input ${common} type="url" placeholder="https://www.youtube.com/watch?v=…"><small>Paste a YouTube, YouTube Shorts, Live, or youtu.be link.</small>`;if(field.type==='email')return `<input ${common} type="email" placeholder="name@example.com">`;if(field.type==='phone')return `<input ${common} type="tel" placeholder="+964 …">`;if(field.type==='location')return `<input ${common} type="text" placeholder="City, country or remote">`;if(field.type==='multiselect'||field.type==='tags')return `<input ${common} type="text" placeholder="Add values separated by commas">`;if(field.type==='boolean')return `<select data-field-key="value"><option value="true"${value==='true'?' selected':''}>Yes</option><option value="false"${value==='false'?' selected':''}>No</option></select>`;if(field.type==='level')return `<div class="builder-level-control"><input data-field-key="value" type="range" min="0" max="100" step="1" value="${esc(value||'50')}"><output>${esc(value||'50')}%</output></div>`;if(field.type==='image'){const image=safeUrl(value);return `${image?`<img class="builder-field-image-preview" src="${esc(image)}" alt="Field preview">`:'<div class="builder-upload-empty">No image selected</div>'}<input ${common} type="url" placeholder="Image URL"><label class="builder-upload-button">Choose image<input data-field-upload="image" type="file" accept="image/jpeg,image/png,image/webp"></label><small data-field-upload-status>JPG, PNG, or WebP · maximum 10 MB</small>`}if(field.type==='file')return `<input ${common} type="url" placeholder="Public file URL">`;return `<input ${common} type="text" placeholder="${field.type==='select'?'Selected option':'Field value'}">`}
function fieldEditor(field,index,total=1){const sizeOptions=(selected='standard')=>fieldTextSizes.map(size=>`<option value="${size.value}"${selected===size.value?' selected':''}>${size.label}</option>`).join('');return `<div class="builder-field-row" data-field-index="${index}"><div class="builder-field-toolbar"><strong>Field ${index+1}</strong><span><button data-move-field="-1" type="button" aria-label="Move field up"${index===0?' disabled':''}>↑</button><button data-move-field="1" type="button" aria-label="Move field down"${index===total-1?' disabled':''}>↓</button></span></div><div class="builder-inline"><label>Label<input data-field-key="label" value="${esc(field.label)}"></label><label>Type<select data-field-key="type">${fieldTypes.map(type=>`<option${field.type===type?' selected':''}>${type}</option>`).join('')}</select></label></div><div class="builder-inline builder-field-size-controls"><label>Title text size<select data-field-key="labelSize">${sizeOptions(field.labelSize)}</select></label><label>Value text size<select data-field-key="valueSize">${sizeOptions(field.valueSize)}</select></label></div><div class="builder-value-field"><span>Value</span>${fieldValueControl(field)}</div><div class="builder-field-actions"><button data-remove-field="${index}" type="button">Remove field</button></div></div>`}
function fieldDeleteQueue(target){return Object.prototype.hasOwnProperty.call(target,'_persisted')?workMediaDeletes(target):pendingProfileMediaDeletes}
async function uploadFieldImage(target,index,file,row,rerender){if(!file)return;const field=target.fields[index];const progress=row.querySelector('[data-field-upload-status]');try{ensureImage(file);const workTarget=Object.prototype.hasOwnProperty.call(target,'_persisted');const path=workTarget?`portfolios/${user.uid}/works/${ensureWorkId(target)}/field-${field.id}-${Date.now()}-${cleanFileName(file.name)}`:`portfolios/${user.uid}/profile/field-${field.id}-${Date.now()}-${cleanFileName(file.name)}`;const previous=field.value;field.value=await uploadImage(file,path,progress);queueMediaDelete(previous,fieldDeleteQueue(target));preserveBuilderScroll(()=>{rerender();renderPreview()});dirty();status('Field image uploaded — save to keep it')}catch(error){console.error(error);progress.textContent=friendlyError(error,'Image upload failed.');progress.style.color='#a32626'}}
function bindFieldEditors(target,containerId='sectionFields',rerender=()=>renderSectionSettings(target),beforeRerender=()=>{}){const container=$(containerId);if(!container)return;container.querySelectorAll('[data-field-index]').forEach(row=>{const index=Number(row.dataset.fieldIndex);row.querySelectorAll('[data-field-key]').forEach(control=>{const key=control.dataset.fieldKey;control.addEventListener(key==='type'?'change':'input',()=>{target.fields[index][key]=control.value;if(key==='type'){beforeRerender();rerender();renderPreview()}else{row.querySelector('output')&&(row.querySelector('output').textContent=`${control.value}%`);renderPreview()}dirty()})});row.querySelectorAll('[data-field-range]').forEach(control=>control.addEventListener('input',()=>{const current=String(target.fields[index].value||'').split('|');const start=control.dataset.fieldRange==='start'?control.value:current[0]||'';const end=control.dataset.fieldRange==='end'?control.value:current[1]||'';target.fields[index].value=`${start}|${end}`;renderPreview();dirty()}));row.querySelector('[data-field-upload]')?.addEventListener('change',event=>uploadFieldImage(target,index,event.target.files?.[0],row,rerender));row.querySelectorAll('[data-move-field]').forEach(button=>button.addEventListener('click',()=>{beforeRerender();target.fields=moveItem(target.fields,index,Number(button.dataset.moveField));rerender();renderPreview();dirty()}))});container.querySelectorAll('[data-remove-field]').forEach(button=>button.addEventListener('click',()=>{beforeRerender();const index=Number(button.dataset.removeField);const field=target.fields[index];if(field?.type==='image')queueMediaDelete(field.value,fieldDeleteQueue(target));target.fields.splice(index,1);rerender();renderPreview();dirty()}))}
function ensureWorkId(work){if(!work.id)work.id=doc(collection(db,'portfolioWorks')).id;return work.id}
function syncWorkForm(work){const panel=$('settingsPanel');const value=key=>panel.querySelector(`[data-profile="${key}"]`)?.value;if(value('workTitle')!==undefined)work.title=value('workTitle');if(value('workType')!==undefined)work.workType=value('workType');if(value('workSummary')!==undefined)work.summary=value('workSummary');if(value('workContent')!==undefined)work.content=value('workContent');return work}
function galleryMarkup(work){return (work.gallery||[]).length?`<div class="builder-gallery-editor">${work.gallery.map((url,index)=>`<div><img src="${esc(safeUrl(url))}" alt="Gallery image ${index+1}"><button type="button" data-remove-gallery="${index}" aria-label="Remove gallery image ${index+1}">×</button></div>`).join('')}</div>`:'<div class="builder-upload-empty">No gallery images uploaded</div>'}
const workPageLayouts=[{value:'case-study',label:'Case study',note:'Clear, structured storytelling'},{value:'editorial',label:'Editorial feature',note:'Expressive typography and rhythm'},{value:'visual',label:'Visual showcase',note:'Large imagery for creative work'}];
function prepareWorkDesign(work){if(!themes.some(theme=>theme.id===work.theme))work.theme=profile.theme||'minimal';if(!portfolioPalettes.some(palette=>palette.id===work.palette)&&work.palette!=='custom')work.palette=profile.palette||'heritage_wine';if(!/^#[0-9a-f]{6}$/i.test(String(work.accent||'')))work.accent=profile.accent||'#661f22';if(!workPageLayouts.some(layout=>layout.value===work.pageLayout))work.pageLayout='case-study';return work}
function workDesignEditor(work){const groups=[...new Set(portfolioPalettes.map(palette=>palette.family))];return `<div><strong class="builder-form-heading">Project page layout</strong><p class="builder-form-copy">Choose how this project tells its story.</p></div><div class="builder-work-layout-grid">${workPageLayouts.map(layout=>`<button type="button" class="builder-work-layout${work.pageLayout===layout.value?' active':''}" data-work-layout="${layout.value}"><strong>${layout.label}</strong><small>${layout.note}</small></button>`).join('')}</div><div class="builder-design-divider"><strong class="builder-form-heading">Art style</strong><p class="builder-form-copy">This theme applies only to this project page.</p></div><div class="builder-theme-grid">${themes.map(theme=>`<button type="button" class="builder-theme-card theme-swatch-${theme.id}${work.theme===theme.id?' active':''}" data-work-theme="${theme.id}"><i></i><strong>${theme.name}</strong><small>${theme.note}</small></button>`).join('')}</div><div class="builder-design-divider"><strong class="builder-form-heading">Project colour palette</strong><p class="builder-form-copy">Use a different palette from the main portfolio when this project needs its own mood.</p></div><div class="builder-palette-library compact">${groups.map(family=>`<section><h4>${esc(family)}</h4><div class="builder-palette-grid">${portfolioPalettes.filter(palette=>palette.family===family).map(palette=>`<button type="button" class="builder-palette-card${work.palette===palette.id?' active':''}" data-work-palette="${palette.id}"><i><span style="background:${palette.ink}"></span><span style="background:${palette.accent}"></span><span style="background:${palette.soft}"></span><span style="background:${palette.surface}"></span></i><strong>${esc(palette.name)}</strong></button>`).join('')}</div></section>`).join('')}<section><h4>Custom</h4><button type="button" class="builder-palette-card custom${work.palette==='custom'?' active':''}" data-work-palette="custom"><i><span style="background:#211a1b"></span><span style="background:${esc(work.accent)}"></span><span style="background:#f0daa1"></span><span style="background:#fffdfa"></span></i><strong>Custom accent</strong></button><label class="builder-custom-colour">Choose custom accent<input id="workCustomAccent" type="color" value="${esc(work.accent)}"></label></section></div>`}
function workForm(work){prepareWorkDesign(work);const fieldCount=(work.fields||[]).length;const basics=`<input id="workId" type="hidden" value="${esc(work.id||'')}">${input('Work title','workTitle',work.title||'')}${input('Work type','workType',work.workType||'Project')}${input('Summary','workSummary',work.summary||'','textarea')}${input('Full case study','workContent',work.content||'','textarea')}`;const media=`${imageUpload('workCoverUpload','Work cover image',work.coverUrl,false,'removeWorkCover')}<div class="builder-upload"><strong>Work gallery</strong>${galleryMarkup(work)}<label class="builder-upload-button">Add gallery images<input id="workGalleryUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><small id="workGalleryUploadStatus">Up to 20 JPG, PNG, or WebP images · 10 MB each</small></div>`;const details=`<label>Work tags${tagEditor('workTag',work.tags||[],'Type a tag')}</label><div class="builder-collection-head"><div><strong>Project fields</strong><small>Arrange these in the exact order they should appear on the project page.</small></div></div><div id="sectionFields">${(work.fields||[]).map((field,index)=>fieldEditor(field,index,fieldCount)).join('')}</div><button id="addField" class="builder-add" type="button">+ Add custom field</button>`;return `<div class="builder-form">${work._hasDraft?'<div class="builder-notice">Draft changes are saved. Your last published version remains live until you publish again.</div>':''}${builderCard('work-basics','Project story',basics,true,'Title, summary, and case study')}${builderCard('work-design','Design & presentation',workDesignEditor(work),false,'Per-project art style and colour palette')}${builderCard('work-media','Project media',media,false,'Cover and gallery images')}${builderCard('work-fields','Tags & arranged fields',details,true,'Details shown in your chosen order')}<div class="builder-inline"><button id="saveWorkDraft" class="pf-button secondary" type="button">Save draft</button><button id="publishWork" class="pf-button primary" type="button">Publish work</button></div>${work._persisted&&work.status==='published'?'<button id="unpublishWork" class="pf-button danger" type="button">Unpublish work</button>':''}${work._persisted?'<button id="deleteWork" class="pf-button danger" type="button">Delete work</button>':''}</div>`}
function renderWorkSettings(work){
  previewWork=work;
  $('settingsTitle').textContent=work._persisted?'Edit professional work':'New professional work';$('settingsPanel').innerHTML=workForm(work);rememberBuilderCards();bindFieldEditors(work,'sectionFields',()=>renderWorkSettings(work),()=>syncWorkForm(work));
  $('settingsPanel').querySelectorAll('[data-work-layout]').forEach(button=>button.addEventListener('click',()=>{syncWorkForm(work);work.pageLayout=button.dataset.workLayout;renderWorkSettings(work);renderPreview();dirty('work')}));
  $('settingsPanel').querySelectorAll('[data-work-theme]').forEach(button=>button.addEventListener('click',()=>{syncWorkForm(work);work.theme=button.dataset.workTheme;renderWorkSettings(work);renderPreview();dirty('work')}));
  $('settingsPanel').querySelectorAll('[data-work-palette]').forEach(button=>button.addEventListener('click',()=>{syncWorkForm(work);work.palette=button.dataset.workPalette;const palette=portfolioPalettes.find(item=>item.id===work.palette);if(palette)work.accent=palette.accent;renderWorkSettings(work);renderPreview();dirty('work')}));
  $('workCustomAccent')?.addEventListener('input',event=>{work.palette='custom';work.accent=event.target.value;renderPreview();dirty('work')});$('workCustomAccent')?.addEventListener('change',()=>{syncWorkForm(work);renderWorkSettings(work)});
  $('settingsPanel').querySelectorAll('[data-profile]').forEach(control=>control.addEventListener('input',()=>{syncWorkForm(work);renderPreview();dirty('work')}));
  bindTagEditor('workTag',()=>work.tags||[],values=>{work.tags=values},()=>syncWorkForm(work),()=>{renderWorkSettings(work);renderPreview()});
  $('settingsPanel').querySelectorAll('[data-remove-gallery]').forEach(button=>button.addEventListener('click',()=>{syncWorkForm(work);const index=Number(button.dataset.removeGallery);queueMediaDelete(work.gallery?.[index],workMediaDeletes(work));work.gallery=(work.gallery||[]).filter((_,itemIndex)=>itemIndex!==index);renderWorkSettings(work);renderPreview();dirty();status('Gallery image removed — save the work to confirm')}));
  $('workCoverUpload').addEventListener('change',event=>uploadWorkCover(work,event.target.files?.[0]));
  $('workGalleryUpload').addEventListener('change',event=>uploadWorkGallery(work,[...(event.target.files||[])]));
  $('removeWorkCover')?.addEventListener('click',()=>{syncWorkForm(work);queueMediaDelete(work.coverUrl,workMediaDeletes(work));work.coverUrl='';delete work.previewUrl;renderWorkSettings(work);renderPreview();dirty();status('Work cover removed — save the work to confirm')});
  $('addField').addEventListener('click',()=>{syncWorkForm(work);work.fields.push({id:uid(),label:'New field',value:'',type:'text',labelSize:'standard',valueSize:'standard',visible:true});renderWorkSettings(work);dirty('work')});$('saveWorkDraft').addEventListener('click',()=>saveWork(work,'draft'));$('publishWork').addEventListener('click',()=>saveWork(work,'published'));$('unpublishWork')?.addEventListener('click',()=>unpublishWork(work));$('deleteWork')?.addEventListener('click',()=>deleteWork(work));
}
async function uploadWorkCover(work,file){if(!file)return;syncWorkForm(work);const progress=$('workCoverUploadStatus');let localPreview='';try{ensureImage(file);const previous=work.coverUrl;localPreview=URL.createObjectURL(file);work.previewUrl=localPreview;preserveBuilderScroll(renderPreview);progress.textContent='Preparing image preview…';const workId=ensureWorkId(work);work.coverUrl=await uploadImage(file,`portfolios/${user.uid}/works/${workId}/cover-${Date.now()}-${cleanFileName(file.name)}`,progress);queueMediaDelete(previous,workMediaDeletes(work));URL.revokeObjectURL(localPreview);delete work.previewUrl;preserveBuilderScroll(()=>{renderWorkSettings(work);renderPreview()});dirty();status('Work cover uploaded — save the work to keep it')}catch(error){console.error(error);if(localPreview&&!work.previewUrl)URL.revokeObjectURL(localPreview);progress.textContent=friendlyError(error,'Upload failed. Please try again.');progress.style.color='#a32626';status('Image was not uploaded. Choose it again to retry.',true)}}
async function uploadWorkGallery(work,files){if(!files.length)return;syncWorkForm(work);const progress=$('workGalleryUploadStatus');try{const room=Math.max(0,20-(work.gallery||[]).length);if(!room)throw new Error('A work gallery can contain up to 20 images.');const selected=files.slice(0,room);const workId=ensureWorkId(work);const uploaded=[];for(let index=0;index<selected.length;index+=1){ensureImage(selected[index]);progress.textContent=`Uploading image ${index+1} of ${selected.length}…`;uploaded.push(await uploadImage(selected[index],`portfolios/${user.uid}/works/${workId}/gallery-${Date.now()}-${index}-${cleanFileName(selected[index].name)}`,progress))}work.gallery=[...(work.gallery||[]),...uploaded];preserveBuilderScroll(()=>{renderWorkSettings(work);renderPreview()});dirty();status(`${uploaded.length} gallery image${uploaded.length===1?'':'s'} uploaded — save the work to keep them`)}catch(error){console.error(error);progress.textContent=friendlyError(error,'Upload failed. Please try again.');progress.style.color='#a32626'}}
function bindProfileInputs(){$('settingsPanel').querySelectorAll('[data-profile]').forEach(control=>control.addEventListener('input',()=>{const key=control.dataset.profile;profile[key]=control.type==='checkbox'?control.checked:key==='skills'?csv(control.value):control.value;renderPreview();dirty()}))}
function renderSettings(){if(selectedSection===IDENTITY)renderIdentitySettings();else if(selectedSection===BUSINESS)renderBusinessSettings();else if(selectedSection===DESIGN)renderDesignSettings();else{const section=profile.sections.find(item=>item.id===selectedSection);const work=works.find(item=>item.id===selectedWork);if(section)renderSectionSettings(section);else if(work)renderWorkSettings(work);else renderIdentitySettings()}renderLists()}
function sectionMarkup(section){if(section.visible===false||section.type==='hero')return'';if(section.type==='work'){const selected=Array.isArray(section.workIds)?new Set(section.workIds):null;const visibleWorks=works.filter(work=>work.status==='published'&&(!selected||selected.has(work.id)));return `<section class="portfolio-work-section"><h2>${esc(section.title||'Selected work')}</h2>${section.content?`<div class="portfolio-rich">${esc(section.content)}</div>`:''}<div class="portfolio-work-grid">${visibleWorks.map(workCard).join('')||'<div class="builder-empty">Choose published projects for this section.</div>'}</div></section>`}return portfolioContentSection(section)}
function renderWorkPreview(work){const preview=$('builderPreview');prepareWorkDesign(work);const presentation=workPresentation(work,profile);preview.className=`builder-preview builder-work-preview portfolio-page ${workPageClass(work,profile)}`;applyPresentationPalette(preview,presentation);preview.innerHTML=workPageMarkup(work,profile,{preview:true});bindImageFallbacks(preview);bindWorkImageViewer(preview,work)}
function renderPreview(){
  if(selectedSection===null&&previewWork&&(selectedWork||!previewWork._persisted)){renderWorkPreview(previewWork);return}
  const displayAvatar=profile.avatarVisible===false?'':isBusinessAccount&&businessProfile&&safeUrl(businessProfile.logoUrl)?safeUrl(businessProfile.logoUrl):safeUrl(profile.avatarUrl);
  const displayCover=isBusinessAccount&&businessProfile&&safeUrl(businessProfile.coverUrl)?safeUrl(businessProfile.coverUrl):safeUrl(profile.coverUrl);
  const sidebar=portfolioSidebar(profile,isBusinessAccount?businessProfile:null);
  const preview=$('builderPreview');
  preview.className=`builder-preview portfolio-page ${presentationClasses(profile)} ${displayCover?'has-portfolio-cover':'no-portfolio-cover'}`;
  applyPresentationPalette(preview,profile);
  preview.style.setProperty('--portfolio-cover',displayCover?`url(${JSON.stringify(displayCover)})`:'none');

  const heroCopy=isBusinessAccount&&businessProfile?`
    <div class="portfolio-copy portfolio-biz-hero-copy">
      <div class="portfolio-biz-badge-row">
        <span class="pro-verified-badge">✓ Verified Business</span>
        ${businessProfile.industry?`<span class="portfolio-biz-industry-pill">${esc(businessProfile.industry)}</span>`:''}
      </div>
      <div class="title">${esc(businessProfile.industry||profile.professionalTitle||'Architecture Practice')}</div>
      <h1>${esc(businessProfile.name||profile.displayName||'Your Studio Name')}</h1>
      <p class="portfolio-hero-location">
        ${businessProfile.location?`<span>⌖ ${esc(businessProfile.location)}</span>`:''}
        ${businessProfile.location&&(businessProfile.shortDescription||profile.tagline)?' · ':''}
        ${esc(businessProfile.shortDescription||profile.tagline||'')}
      </p>
    </div>
  `:`
    <div class="portfolio-copy">
      <div class="title">${esc(profile.professionalTitle||'Professional title')}</div>
      <h1>${esc(profile.displayName||'Your portfolio name')}</h1>
      <p>${esc(profile.tagline||'Add a professional statement that is unique to this portfolio.')}</p>
    </div>
  `;

  const bizSectionHtml=isBusinessAccount&&businessProfile?portfolioBusinessSection(businessProfile,myBusinessPosts,myBusinessOpportunities):'';
  const sectionsHtml=(profile.sections||[]).map(sectionMarkup).join('');

  preview.innerHTML=`<section class="portfolio-hero">${displayCover?`<div class="portfolio-banner-art" aria-hidden="true"><span>${esc(profile.professionalTitle||'Selected practice')}</span></div>`:''}<div class="pf-shell portfolio-identity${profile.avatarVisible===false?' no-avatar':''}">${profile.avatarVisible===false?'':`<div class="portfolio-avatar">${displayAvatar?`<img src="${esc(displayAvatar)}" alt="">`:esc(initials((businessProfile?.name)||profile.displayName||'Portfolio'))}</div>`}${heroCopy}</div></section><div class="portfolio-layout${sidebar?'':' no-sidebar'}"><div class="portfolio-main">${bizSectionHtml}${sectionsHtml}</div>${sidebar}</div>`;
  bindImageFallbacks(preview);
  bindWorkImageViewer(preview, { gallery: businessProfile?.gallery || [] });
}
let previewSize='desktop';
function syncPreviewSize(){
  document.querySelectorAll('[data-preview-size]').forEach(item=>item.classList.toggle('active',item.dataset.previewSize===previewSize));
  $('builderPreviewFrame')?.classList.toggle('mobile',previewSize==='mobile');
}
function bindPreviewDeviceSwitch(){
  document.querySelectorAll('[data-preview-size]').forEach(button=>button.addEventListener('click',()=>{
    previewSize=button.dataset.previewSize||'desktop';
    syncPreviewSize();
  }));
}
function renderAll(){renderLists();renderSettings();renderPreview();syncPreviewSize()}
function syncPublishControls(){const unpublish=$('unpublishPortfolio');if(unpublish)unpublish.hidden=profile.status!=='published';const button=$('exportPortfolioPdf');if(!button)return;const available=portfolioExists&&profile.status==='published'&&!profileHasUnsavedChanges&&!profileHasDraft;button.disabled=!available;button.title=available?'Export your published portfolio as PDF':profileHasUnsavedChanges||profileHasDraft?'Publish your latest portfolio changes before exporting':'Publish your portfolio before exporting it'}
function dirty(scope=selectedSection===null?'work':'profile'){if(scope==='work')workHasUnsavedChanges=true;else profileHasUnsavedChanges=true;syncPublishControls();status('Unsaved changes')}
function hasUnsavedChanges(){return profileHasUnsavedChanges||workHasUnsavedChanges}
window.addEventListener('beforeunload',event=>{if(!hasUnsavedChanges())return;event.preventDefault();event.returnValue=''})
function bindBuilderResizers(){const app=$('builderApp');if(!app)return;const savedLeft=Number(localStorage.getItem('portfolioBuilderLeftWidth'));const savedRight=Number(localStorage.getItem('portfolioBuilderRightWidth'));if(Number.isFinite(savedLeft)&&savedLeft>=220)app.style.setProperty('--builder-left-width',`${savedLeft}px`);if(Number.isFinite(savedRight)&&savedRight>=260)app.style.setProperty('--builder-right-width',`${savedRight}px`);const apply=(side,delta)=>{const bounds=app.getBoundingClientRect();const previewMin=440;const available=Math.max(0,bounds.width-previewMin-20);const left=Number.parseFloat(getComputedStyle(app).getPropertyValue('--builder-left-width'))||300;const right=Number.parseFloat(getComputedStyle(app).getPropertyValue('--builder-right-width'))||330;const next=side==='left'?Math.max(220,Math.min(420,left+delta)):Math.max(260,Math.min(500,right-delta));const remaining=side==='left'?available-right:available-left;if(next>remaining)return;app.style.setProperty(side==='left'?'--builder-left-width':'--builder-right-width',`${next}px`);localStorage.setItem(side==='left'?'portfolioBuilderLeftWidth':'portfolioBuilderRightWidth',String(next))};app.querySelectorAll('[data-builder-resizer]').forEach(handle=>{let startX=0;const side=handle.dataset.builderResizer;const move=event=>{const delta=event.clientX-startX;startX=event.clientX;apply(side,delta)},stop=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.body.classList.remove('builder-resizing')};handle.addEventListener('pointerdown',event=>{startX=event.clientX;handle.setPointerCapture?.(event.pointerId);document.body.classList.add('builder-resizing');document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop)});handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();apply(side,event.key==='ArrowLeft'?-20:20)})})}
function exportPdf(){if(!user||!portfolioExists||profile.status!=='published'||profileHasUnsavedChanges||profileHasDraft){status('Publish your latest portfolio changes before exporting them as PDF.',true);syncPublishControls();return}window.open(`portfolio-pdf.html?id=${encodeURIComponent(user.uid)}&print=1`,'_blank','noopener')}
function payload(statusValue){const{bio,draftData,hasDraft,...portfolioData}=profile;return{...portfolioData,status:statusValue,sections:(profile.sections||[]).map(section=>({...section,fields:section.fields||[]}))}}
async function saveProfile(statusValue,rethrow=false){if(saving){if(rethrow)throw new Error('Please wait for the current portfolio save to finish.');return null}saving=true;status(statusValue==='published'?'Publishing portfolio…':'Saving draft…');try{if(isBusinessAccount&&businessProfile){try{await callFunction('saveBusinessProfile',{name:businessProfile.name||profile.displayName||'Architecture Practice',username:businessProfile.username||(communityProfile.username||'').toLowerCase()||`studio_${user.uid.slice(0,6)}`,industry:businessProfile.industry||'Architecture & Design',logoUrl:businessProfile.logoUrl||'',coverUrl:businessProfile.coverUrl||'',gallery:Array.isArray(businessProfile.gallery)?businessProfile.gallery:[],location:businessProfile.location||profile.location||'Basra, Iraq',companySize:businessProfile.companySize||'1-10 architects & designers',shortDescription:businessProfile.shortDescription||profile.tagline||'',about:businessProfile.about||'',services:Array.isArray(businessProfile.services)?businessProfile.services:[],specializations:Array.isArray(businessProfile.specializations)?businessProfile.specializations:[],website:businessProfile.website||'',contactEmail:businessProfile.contactEmail||profile.contactEmail||'',contactPhone:businessProfile.contactPhone||'',address:businessProfile.address||'',status:statusValue});}catch(bizErr){console.warn('[Builder] Business profile save notice:',bizErr);}}const result=await withRetry(()=>callFunction('savePortfolioProfile',payload(statusValue)),'Saving portfolio');profile.status=result.status;profileHasDraft=result.hasDraft===true;portfolioExists=true;profileHasUnsavedChanges=false;syncPublishControls();$('previewPortfolio').href=`portfolio.html?id=${encodeURIComponent(result.portfolioId)}`;const cleanupFailures=await flushMediaDeletes(pendingProfileMediaDeletes);status(cleanupFailures?'Portfolio saved, but some unused images could not be removed':statusValue==='published'?'Portfolio published':result.status==='published'?'Draft saved — your last published portfolio remains live':'Draft saved',cleanupFailures>0);return result}catch(error){console.error(error);status(friendlyError(error,'Could not save portfolio'),true);if(rethrow)throw error;return null}finally{saving=false}}
async function unpublishProfile(){if(profile.status!=='published'||!confirm('Unpublish this portfolio? It will no longer be visible publicly until you publish it again.'))return;try{status('Unpublishing portfolio…');const result=await callFunction('unpublishPortfolioProfile',{});profile.status=result.status;profileHasDraft=result.hasDraft===true;syncPublishControls();renderLists();status('Portfolio unpublished. Your draft is still available in the builder.')}catch(error){status(friendlyError(error,'Could not unpublish portfolio'),true)}}
function readWorkForm(work){syncWorkForm(work);prepareWorkDesign(work);return{workId:ensureWorkId(work),title:work.title||'',workType:work.workType||'Project',summary:work.summary||'',content:work.content||'',coverUrl:work.coverUrl||'',gallery:work.gallery||[],tags:work.tags||[],fields:work.fields||[],theme:work.theme,palette:work.palette,accent:work.accent,pageLayout:work.pageLayout}}
async function saveWork(work,statusValue){if(savingWork)return;savingWork=true;const buttons=[$('saveWorkDraft'),$('publishWork')].filter(Boolean);buttons.forEach(button=>button.disabled=true);try{status('Saving professional work…');const values=readWorkForm(work);if(!values.title.trim())throw new Error('Add a work title before saving.');if(!portfolioExists)await saveProfile('draft',true);const result=await withRetry(()=>callFunction('savePortfolioWork',{...values,status:statusValue}),'Saving professional work');const saved={...work,...values,id:result.workId,status:result.status,_hasDraft:result.hasDraft===true,_persisted:true};const cleanupFailures=await flushMediaDeletes(workMediaDeletes(saved));const index=works.findIndex(item=>item.id===saved.id);if(index>=0)works[index]=saved;else works.unshift(saved);workHasUnsavedChanges=false;selectedWork=saved.id;selectedSection=null;renderAll();status(cleanupFailures?'Work saved, but some unused images could not be removed':statusValue==='published'?'Work published':result.status==='published'?'Draft saved — the last published work remains live':'Work draft saved',cleanupFailures>0)}catch(error){console.error(error);status(friendlyError(error,'Could not save work'),true)}finally{savingWork=false;buttons.forEach(button=>button.disabled=false)}}
async function unpublishWork(work){if(work.status!=='published'||!confirm('Unpublish this work? It will disappear from public portfolio sections until you publish it again.'))return;try{status('Unpublishing work…');const result=await callFunction('unpublishPortfolioWork',{workId:work.id});work.status=result.status;work._hasDraft=result.hasDraft===true;renderAll();status('Work unpublished. Its saved draft remains available.')}catch(error){status(friendlyError(error,'Could not unpublish work'),true)}}
async function deleteWork(work){if(!confirm('Permanently delete this professional work?'))return;try{await callFunction('deletePortfolioWork',{workId:work.id});works=works.filter(item=>item.id!==work.id);workHasUnsavedChanges=false;selectedWork=null;selectedSection=IDENTITY;renderAll();status('Work deleted')}catch(error){status(error.message||'Could not delete work',true)}}
async function initialize(activeUser){
  user=activeUser;
  status('Loading your portfolio…');
  const[communitySnap,portfolioSnap,worksSnap,profileDraftSnap,workDraftsSnap,savedThemesSnap,myThemesSnap,bizAccountSnap,bizProfileSnap,bizPostsSnap,bizOppsSnap,appsSnap]=await withRetry(()=>Promise.all([
    getDoc(doc(db,'users',user.uid)),
    getDoc(doc(db,'portfolioProfiles',user.uid)),
    getDocs(query(collection(db,'portfolioWorks'),where('ownerId','==',user.uid))),
    getDoc(doc(db,'portfolioProfileDrafts',user.uid)),
    getDocs(query(collection(db,'portfolioWorkDrafts'),where('ownerId','==',user.uid))),
    getDocs(collection(db,'users',user.uid,'savedPortfolioThemes')),
    getDocs(query(collection(db,'portfolioThemes'),where('ownerId','==',user.uid))),
    getDoc(doc(db,'businessAccounts',user.uid)).catch(()=>null),
    getDoc(doc(db,'businessProfiles',user.uid)).catch(()=>null),
    getDocs(query(collection(db,'businessPosts'),where('ownerUid','==',user.uid))).catch(()=>({docs:[]})),
    getDocs(query(collection(db,'businessOpportunities'),where('ownerUid','==',user.uid))).catch(()=>({docs:[]})),
    getDocs(query(collection(db,'jobApplications'),where('businessUid','==',user.uid))).catch(()=>({docs:[]}))
  ]),'Loading builder');
  isBusinessAccount=Boolean(bizAccountSnap?.exists()&&bizAccountSnap.data().status==='active');
  if(isBusinessAccount) { ensureFloatingBizMessenger(); }
  businessAccount=isBusinessAccount?bizAccountSnap.data():null;
  businessProfile=isBusinessAccount?(bizProfileSnap?.exists()?{id:bizProfileSnap.id,...bizProfileSnap.data()}:defaultBusinessProfile()):null;
  if(bizPostsSnap&&bizPostsSnap.docs){
    myBusinessPosts=bizPostsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const ta=a.createdAt?.toMillis?a.createdAt.toMillis():(new Date(a.createdAt).getTime()||0);
      const tb=b.createdAt?.toMillis?b.createdAt.toMillis():(new Date(b.createdAt).getTime()||0);
      return tb-ta;
    });
  }else{
    myBusinessPosts=[];
  }
  if(bizOppsSnap&&bizOppsSnap.docs){
    myBusinessOpportunities=bizOppsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const ta=a.createdAt?.toMillis?a.createdAt.toMillis():(new Date(a.createdAt).getTime()||0);
      const tb=b.createdAt?.toMillis?b.createdAt.toMillis():(new Date(b.createdAt).getTime()||0);
      return tb-ta;
    });
  }else{
    myBusinessOpportunities=[];
  }
  if(appsSnap&&appsSnap.docs){
    myApplicants=appsSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const ta=a.createdAt?.toMillis?a.createdAt.toMillis():(new Date(a.createdAt).getTime()||0);
      const tb=b.createdAt?.toMillis?b.createdAt.toMillis():(new Date(b.createdAt).getTime()||0);
      return tb-ta;
    });
  }else{
    myApplicants=[];
  }
  communityProfile=communitySnap.exists()?communitySnap.data():{};
  portfolioExists=portfolioSnap.exists();
  const storedPortfolio=portfolioExists?portfolioSnap.data():null;
  const savedPortfolioDraft=profileDraftSnap.exists()?profileDraftSnap.data():null;
  const portfolioData=storedPortfolio?{...storedPortfolio,...(savedPortfolioDraft||{}),status:storedPortfolio.status}:null;
  profileHasDraft=Boolean(savedPortfolioDraft);
  profile=portfolioExists?{...defaultProfile(),...portfolioData,sidebar:{...defaultSidebar(),...(portfolioData.sidebar||{}),fields:Array.isArray(portfolioData.sidebar?.fields)?portfolioData.sidebar.fields:[]},sections:portfolioData.sections||[]}:defaultProfile();
  profile.contacts=Array.isArray(profile.contacts)?profile.contacts.map(contact=>({...contact,visible:contact.visible!==false})):[];
  if(!profile.contacts.length&&profile.contactEmail)profile.contacts=[{id:uid(),type:'email',label:'Email',value:profile.contactEmail,visible:profile.contactPublic===true}];
  profile.links=Array.isArray(profile.links)?profile.links.map(link=>({...link,visible:link.visible!==false})):[];
  if(portfolioExists&&!portfolioData.palette&&profile.accent&&profile.accent.toLowerCase()!=='#661f22')profile.palette='custom';
  if(profile.theme==='grid')profile.theme='gallery';
  savedThemes=savedThemesSnap.docs.map(item=>({id:item.id,...item.data()}));
  myThemes=myThemesSnap.docs.map(item=>({...normaliseThemePackage(item.data()),...item.data(),id:item.id}));
  const queuedTheme=sessionStorage.getItem('portfolioThemeToApply');
  if(queuedTheme){try{const queued=JSON.parse(queuedTheme);applyThemePackageToProfile(profile,queued.themePackage,queued.paletteId);profileHasUnsavedChanges=true}finally{sessionStorage.removeItem('portfolioThemeToApply')}}
  const workDrafts=new Map(workDraftsSnap.docs.map(item=>[item.id,item.data()]));
  works=worksSnap.docs.map(item=>{const stored={id:item.id,...item.data()};const savedDraft=workDrafts.get(item.id);return{...stored,...(savedDraft||{}),id:item.id,status:stored.status,_hasDraft:Boolean(savedDraft),_persisted:true}});
  $('previewPortfolio').href=`portfolio.html?id=${encodeURIComponent(user.uid)}`;
  selectedSection=IDENTITY;
  renderAll();
  syncPublishControls();
  status(profile.status==='published'?(profileHasDraft?'Draft changes loaded — the last published portfolio remains live':'Published portfolio loaded'):'Draft workspace ready');
}

if(!matchMedia('(max-width:899px)').matches){
  bindBuilderResizers();
  bindPreviewDeviceSwitch();
  document.querySelectorAll('[data-builder-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.builderTab;selectedSection=activeTab==='sections'?IDENTITY:null;selectedWork=null;renderAll()}));
  $('addSection').addEventListener('click',()=>{const section={id:uid(),type:'custom',title:'New section',content:'',visible:true,fields:[]};profile.sections.push(section);selectedSection=section.id;renderAll();dirty()});
  $('addWork').addEventListener('click',()=>{selectedSection=null;selectedWork=null;renderWorkSettings({id:'',title:'',workType:'Project',summary:'',content:'',coverUrl:'',gallery:[],tags:[],fields:[],_persisted:false});renderPreview()});
  $('exportPortfolioPdf').addEventListener('click',exportPdf);$('saveDraft').addEventListener('click',()=>saveProfile('draft'));$('unpublishPortfolio').addEventListener('click',unpublishProfile);$('publishPortfolio').addEventListener('click',()=>saveProfile('published'));
  onAuthStateChanged(auth,activeUser=>{if(!activeUser){location.replace('login.html?next=portfolio-builder.html');return}initialize(activeUser).catch(error=>{console.error(error);status(error.message||'Could not load the builder',true)})});
}





function businessApplicantsMarkup(){
  const oppList=myBusinessOpportunities;
  let list=myApplicants;

  if(applicantFilterOpportunity!=='all'){
    list=list.filter(a=>a.opportunityId===applicantFilterOpportunity);
  }
  if(applicantFilterStatus!=='all'){
    list=list.filter(a=>a.status===applicantFilterStatus);
  }

  const statuses=['new','reviewed','shortlisted','interview','accepted','not_selected'];
  const statusLabels={
    new:'New Application',
    reviewed:'Reviewed',
    shortlisted:'Shortlisted ★',
    interview:'Interview Scheduled',
    accepted:'Accepted ✓',
    not_selected:'Not Selected'
  };
  const statusColors={
    new:'#1e40af',reviewed:'#475569',shortlisted:'#854d0e',interview:'#6b21a8',accepted:'#166534',not_selected:'#991b1b'
  };
  const statusBgs={
    new:'#eff6ff',reviewed:'#f1f5f9',shortlisted:'#fef9c3',interview:'#f3e8ff',accepted:'#f0fdf4',not_selected:'#fef2f2'
  };

  const filterBar=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <label style="font-size:0.75rem;font-weight:750;color:var(--muted);">Filter by Role
        <select id="bizAppOppFilter" style="height:36px;font-size:0.8rem;">
          <option value="all">All Roles &amp; Openings (${myApplicants.length})</option>
          ${oppList.map(o=>`<option value="${esc(o.id)}"${applicantFilterOpportunity===o.id?' selected':''}>${esc(o.title)}</option>`).join('')}
        </select>
      </label>
      <label style="font-size:0.75rem;font-weight:750;color:var(--muted);">Filter by Status
        <select id="bizAppStatusFilter" style="height:36px;font-size:0.8rem;">
          <option value="all">All Statuses</option>
          ${statuses.map(st=>`<option value="${st}"${applicantFilterStatus===st?' selected':''}>${statusLabels[st]}</option>`).join('')}
        </select>
      </label>
    </div>
  `;

  const cardsMarkup=list.length?`
    <div class="builder-applicants-list" style="display:grid;gap:14px;margin-bottom:14px;">
      ${list.map(app=>{
        const avatar=safeUrl(app.applicantAvatar);
        const works=Array.isArray(app.selectedWorks)?app.selectedWorks:[];
        let dateStr='';
        if(app.createdAt){
          try{
            const d=typeof app.createdAt?.toDate==='function'?app.createdAt.toDate():new Date(app.createdAt);
            if(!isNaN(d))dateStr=d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
          }catch{}
        }

        return `
          <div class="builder-applicant-card" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 2px 8px rgba(61,17,21,0.03);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
              <div style="display:flex;gap:12px;align-items:center;">
                <div style="width:46px;height:46px;border-radius:12px;background:var(--wine);color:#fff;display:grid;place-items:center;overflow:hidden;font-weight:800;font-size:0.95rem;">
                  ${avatar?`<img src="${esc(avatar)}" alt="${esc(app.applicantName)}" style="width:100%;height:100%;object-fit:cover;">`:`<span>${esc(initials(app.applicantName))}</span>`}
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong style="font-size:0.92rem;color:var(--ink);">${esc(app.applicantName)}</strong>
                    <span style="font-size:0.72rem;color:var(--muted);">· ${esc(app.applicantLocation||'Basra')}</span>
                  </div>
                  <div style="font-size:0.78rem;color:var(--wine);font-weight:750;">${esc(app.applicantTitle||'Architect')}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <span class="pro-job-type-badge ${app.opportunityType==='job'?'job':'internship'}" style="font-size:0.68rem;padding:2px 8px;">${esc(app.opportunityTitle)}</span>
                ${dateStr?`<div style="font-size:0.7rem;color:var(--muted);margin-top:2px;">${esc(dateStr)}</div>`:''}
              </div>
            </div>

            ${app.coverLetter?`<div style="font-size:0.82rem;line-height:1.5;color:var(--ink);background:#fcfaf8;padding:10px 12px;border-radius:8px;border:1px solid #ebdcd5;margin:8px 0;">${esc(app.coverLetter)}</div>`:''}

            ${works.length?`
              <div style="margin:10px 0;">
                <span style="font-size:0.72rem;font-weight:800;color:var(--muted);text-transform:uppercase;">Selected Portfolio Projects:</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                  ${works.map(w=>`
                    <a href="portfolio-work.html?id=${encodeURIComponent(w.id)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:#f7f3ee;border:1px solid var(--line);font-size:0.74rem;font-weight:750;color:var(--ink);text-decoration:none;">
                      ${w.coverUrl?`<img src="${esc(safeUrl(w.coverUrl))}" alt="" style="width:16px;height:16px;border-radius:3px;object-fit:cover;">`:''}
                      <span>${esc(w.title)}</span>
                      <small style="color:var(--muted);">↗</small>
                    </a>
                  `).join('')}
                </div>
              </div>
            `:''}

            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid #f0eae5;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:0.74rem;font-weight:800;color:var(--muted);">Status:</span>
                <select data-update-applicant-status="${esc(app.id)}" style="height:32px;font-size:0.78rem;font-weight:800;border-radius:8px;padding:0 8px;background:${statusBgs[app.status]||'#fff'};color:${statusColors[app.status]||'#333'};border:1px solid var(--line);">
                  ${statuses.map(st=>`<option value="${st}"${app.status===st?' selected':''}>${statusLabels[st]}</option>`).join('')}
                </select>
              </div>

              <div style="display:flex;gap:8px;align-items:center;">
                <a class="pf-button primary btn-sm" href="portfolio.html?id=${encodeURIComponent(app.applicantUid)}" target="_blank" style="padding:6px 12px;font-size:0.76rem;">View Portfolio →</a>
                <button class="pf-button secondary btn-sm" type="button" data-biz-message-applicant="${esc(app.applicantUid)}" data-applicant-name="${esc(app.applicantName)}" data-applicant-title="${esc(app.applicantTitle||app.opportunityTitle||'Candidate')}" style="padding:6px 10px;font-size:0.76rem;">Message 💬</button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `:'<div class="builder-upload-empty" style="margin-bottom:14px;">No candidate applications match your filter.</div>';

  return `${filterBar}${cardsMarkup}`;
}

function businessOpportunitiesEditorMarkup(){
  if(editingBusinessOpportunity){
    const opp=editingBusinessOpportunity;
    const isJob=opp.type==='job';
    return `
      <div class="builder-biz-opp-form" style="background:#fcfaf8;padding:16px;border-radius:14px;border:1px solid #ebdcd5;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h4 style="margin:0;font-size:0.92rem;color:var(--wine);font-weight:800;">${opp.id?(isJob?'Edit Job Listing':'Edit Internship'):(isJob?'New Studio Job Opening':'New Studio Internship Program')}</h4>
          <span class="pro-job-type-badge ${isJob?'job':'internship'}">${isJob?'💼 Job':'🎓 Internship'}</span>
        </div>

        <label>Role / Position Title *<input id="bizOppTitleInput" value="${esc(opp.title||'')}" maxlength="160" placeholder="${isJob?'e.g. Junior Architect / Computational Designer':'e.g. Summer Architecture Internship'}"></label>
        <label>Listing Status<select id="bizOppStatusInput"><option value="open"${opp.status==='open'?' selected':''}>Open &amp; Published</option><option value="draft"${opp.status==='draft'?' selected':''}>Draft (Private)</option><option value="closed"${opp.status==='closed'?' selected':''}>Closed (Not accepting)</option><option value="filled"${opp.status==='filled'?' selected':''}>Position Filled</option></select></label>
        <label>Location / City<input id="bizOppLocationInput" value="${esc(opp.location||'Basra, Iraq')}" maxlength="120" placeholder="e.g. Basra, Iraq"></label>

        ${isJob ? `
          <div class="builder-inline">
            <label>Employment Type<select id="bizOppEmploymentInput"><option value="Full-time"${opp.employmentType==='Full-time'?' selected':''}>Full-time</option><option value="Part-time"${opp.employmentType==='Part-time'?' selected':''}>Part-time</option><option value="Contract"${opp.employmentType==='Contract'?' selected':''}>Contract</option><option value="Freelance"${opp.employmentType==='Freelance'?' selected':''}>Freelance</option></select></label>
            <label>Workplace Type<select id="bizOppWorkplaceInput"><option value="On-site"${opp.workplaceType==='On-site'?' selected':''}>On-site</option><option value="Hybrid"${opp.workplaceType==='Hybrid'?' selected':''}>Hybrid</option><option value="Remote"${opp.workplaceType==='Remote'?' selected':''}>Remote</option></select></label>
          </div>
          <div class="builder-inline">
            <label>Experience Level<select id="bizOppExperienceInput"><option value="Entry level"${opp.experience==='Entry level'?' selected':''}>Entry level</option><option value="1-3 years"${opp.experience==='1-3 years'?' selected':''}>1-3 years</option><option value="3-5 years"${opp.experience==='3-5 years'?' selected':''}>3-5 years</option><option value="Senior / Lead"${opp.experience==='Senior / Lead'?' selected':''}>Senior / Lead</option></select></label>
            <label>Compensation (optional)<input id="bizOppCompensationInput" value="${esc(opp.compensation||'')}" placeholder="e.g. $800 - $1200 / month"></label>
          </div>
          <label>Education Requirements (optional)<input id="bizOppEducationInput" value="${esc(opp.education||'')}" placeholder="e.g. Bachelor of Architecture (B.Arch)"></label>
        ` : `
          <div class="builder-inline">
            <label>Internship Duration<select id="bizOppDurationInput"><option value="1 Month"${opp.duration==='1 Month'?' selected':''}>1 Month</option><option value="2 Months"${opp.duration==='2 Months'?' selected':''}>2 Months</option><option value="3 Months"${opp.duration==='3 Months'?' selected':''}>3 Months</option><option value="6 Months"${opp.duration==='6 Months'?' selected':''}>6 Months</option><option value="Flexible"${opp.duration==='Flexible'?' selected':''}>Flexible</option></select></label>
            <label>Compensation<select id="bizOppCompensationInput"><option value="Paid"${opp.compensation==='Paid'?' selected':''}>Paid</option><option value="Stipend provided"${opp.compensation==='Stipend provided'?' selected':''}>Stipend provided</option><option value="Unpaid / Academic"${opp.compensation==='Unpaid / Academic'?' selected':''}>Unpaid / Academic</option></select></label>
          </div>
          <label>Target Student / University Level<input id="bizOppStudentReqInput" value="${esc(opp.studentRequirements||'')}" placeholder="e.g. 3rd or 4th year Architecture / Engineering students"></label>
        `}

        <div class="builder-inline">
          <label>Number of Openings<input id="bizOppOpeningsInput" type="number" min="1" max="50" value="${esc(opp.openings||1)}"></label>
          <label>Application Deadline (optional)<input id="bizOppDeadlineInput" type="date" value="${esc(opp.deadline||'')}"></label>
        </div>

        <label>Full Role Description &amp; Responsibilities *<textarea id="bizOppDescInput" rows="6" placeholder="Describe the role, key responsibilities, studio culture, and expectations…">${esc(opp.description||'')}</textarea></label>

        <label>Required Capabilities &amp; Skills${tagEditor('bizOppSkill',opp.skills||[],'Type a skill (e.g. BIM, Parametric Design)')}</label>
        <div class="builder-design-divider" style="margin:12px 0;"></div>
        <label>Required Software Tools${tagEditor('bizOppSoftware',opp.software||[],'Type software (e.g. Revit, Rhino, Lumion)')}</label>

        <div style="margin-top:14px;padding:12px 14px;background:#fff;border:1px solid #ebdcd5;border-radius:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.84rem;cursor:pointer;color:var(--ink);">
            <input type="checkbox" id="bizOppShareCommunity" style="accent-color:var(--wine);" checked>
            <span>Share to AIAS Basra Professional feed</span>
          </label>
          <p style="margin:4px 0 0 24px;font-size:0.75rem;color:var(--muted);">Publishes a verified studio preview card in the Professional feed referencing this opportunity.</p>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
          <button id="saveBizOppBtn" class="pf-button primary btn-sm" type="button"><span>${opp.id?'Save Listing':'Publish Listing'}</span></button>
          <button id="cancelBizOppBtn" class="pf-button secondary btn-sm" type="button">Cancel</button>
        </div>
      </div>
    `;
  }

  const list=myBusinessOpportunities;
  const itemsMarkup=list.length?`
    <div class="builder-biz-opps-list" style="display:grid;gap:10px;margin-bottom:14px;">
      ${list.map((opp)=>{
        const isJob=opp.type==='job';
        const statusColors={open:'#166534',draft:'#78716c',closed:'#991b1b',filled:'#1e40af'};
        const statusBgs={open:'#f0fdf4',draft:'#f5f5f4',closed:'#fef2f2',filled:'#eff6ff'};
        return `
          <div class="builder-biz-opp-item" style="padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <span class="pro-job-type-badge ${isJob?'job':'internship'}" style="font-size:0.68rem;padding:2px 8px;">${isJob?'💼 Job':'🎓 Internship'}</span>
              <span style="font-size:0.72rem;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:6px;background:${statusBgs[opp.status]||'#f5f5f4'};color:${statusColors[opp.status]||'#78716c'};">${esc(opp.status||'open')}</span>
            </div>
            <strong style="display:block;font-size:0.86rem;color:var(--ink);margin-bottom:4px;">${esc(opp.title)}</strong>
            <p style="margin:0 0 8px;font-size:0.76rem;color:var(--muted);">⌖ ${esc(opp.location||'Basra')}${isJob?' · '+esc(opp.employmentType||'Full-time'):' · '+esc(opp.duration||'3 Months')}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid #f0eae5;padding-top:8px;">
              <button type="button" class="builder-field-edit-btn" data-edit-biz-opp="${esc(opp.id)}" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid var(--line);background:#f7f3ee;">Edit</button>
              ${opp.status==='open'?`
                <button type="button" data-status-biz-opp="${esc(opp.id)}" data-set-status="closed" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid #fed7d7;background:#fff5f5;color:#c53030;">Close</button>
                <button type="button" data-status-biz-opp="${esc(opp.id)}" data-set-status="filled" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e40af;">Mark Filled</button>
              `:`
                <button type="button" data-status-biz-opp="${esc(opp.id)}" data-set-status="open" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;">Reopen</button>
              `}
              <button type="button" class="builder-field-delete-btn" data-delete-biz-opp="${esc(opp.id)}" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid #fed7d7;background:#fff5f5;color:#c53030;margin-left:auto;">Delete</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `:'<div class="builder-upload-empty" style="margin-bottom:14px;">No studio jobs or internship listings yet.</div>';

  return `
    ${itemsMarkup}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="createNewJobBtn" class="builder-add" type="button" style="flex:1;min-width:140px;">+ Post Job Opening</button>
      <button id="createNewInternshipBtn" class="builder-add" type="button" style="flex:1;min-width:140px;">+ Post Internship</button>
    </div>
  `;
}

function businessPostsEditorMarkup(){
  if(editingBusinessPost){
    const p=editingBusinessPost;
    const categoryOptions=[
      {value:'update',label:'Studio Update / News'},
      {value:'announcement',label:'Official Announcement'},
      {value:'project',label:'New Project / Commission'},
      {value:'hiring',label:'Hiring / Studio Opening'},
      {value:'achievement',label:'Award & Achievement'}
    ];
    return `
      <div class="builder-biz-post-form" style="background:#fcfaf8;padding:16px;border-radius:14px;border:1px solid #ebdcd5;margin-bottom:12px;">
        <h4 style="margin:0 0 12px;font-size:0.9rem;color:var(--wine);font-weight:800;">${p.id?'Edit Studio Update':'New Studio Update & Announcement'}</h4>
        <label>Update Headline / Title (optional)<input id="bizPostTitleInput" value="${esc(p.title||'')}" maxlength="160" placeholder="e.g. Breaking ground on new cultural center"></label>
        <label>Category<select id="bizPostCategoryInput">${categoryOptions.map(cat=>`<option value="${cat.value}"${(p.category||'update')===cat.value?' selected':''}>${cat.label}</option>`).join('')}</select></label>
        <label>Update Content / Details *<textarea id="bizPostContentInput" rows="5" placeholder="Share your studio's latest update, office culture, new design commissions, or milestones…">${esc(p.content||'')}</textarea></label>
        ${imageUpload('bizPostMediaUpload','Attached Photo / Image (optional)',p.imageUrl,false,'removeBizPostMedia')}
        <div style="margin-top:14px;padding:12px 14px;background:#fff;border:1px solid #ebdcd5;border-radius:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.84rem;cursor:pointer;color:var(--ink);">
            <input type="checkbox" id="bizPostShareCommunity" style="accent-color:var(--wine);" checked>
            <span>Share to AIAS Basra Professional feed</span>
          </label>
          <p style="margin:4px 0 0 24px;font-size:0.75rem;color:var(--muted);">Publishes a verified studio preview card in the Professional feed referencing this announcement.</p>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button id="saveBizPostBtn" class="pf-button primary btn-sm" type="button"><span>${p.id?'Save Update':'Publish Update'}</span></button>
          <button id="cancelBizPostBtn" class="pf-button secondary btn-sm" type="button">Cancel</button>
        </div>
      </div>
    `;
  }

  const list=myBusinessPosts;
  const itemsMarkup=list.length?`
    <div class="builder-biz-posts-list" style="display:grid;gap:10px;margin-bottom:14px;">
      ${list.map((post,index)=>{
        const categoryLabels={
          update:'Studio Update',
          announcement:'Announcement',
          project:'New Project',
          hiring:'Hiring',
          achievement:'Achievement'
        };
        return `
          <div class="builder-biz-post-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span class="portfolio-biz-post-badge ${esc(post.category||'update')}" style="font-size:0.68rem;padding:2px 8px;">${esc(categoryLabels[post.category]||'Update')}</span>
                ${post.status==='draft'?'<span style="font-size:0.68rem;color:#78716c;font-weight:700;">[Draft]</span>':''}
              </div>
              <strong style="display:block;font-size:0.84rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(post.title||post.content.slice(0,60))}</strong>
              <p style="margin:2px 0 0;font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(post.content||'')}</p>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" class="builder-field-edit-btn" data-edit-biz-post="${esc(post.id)}" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid var(--line);background:#f7f3ee;">Edit</button>
              <button type="button" class="builder-field-delete-btn" data-delete-biz-post="${esc(post.id)}" style="padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:6px;border:1px solid #fed7d7;background:#fff5f5;color:#c53030;">×</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `:'<div class="builder-upload-empty" style="margin-bottom:14px;">No studio updates or announcements yet.</div>';

  return `
    ${itemsMarkup}
    <button id="createNewBizPostBtn" class="builder-add" type="button" style="width:100%;">+ Create studio update / announcement</button>
  `;
}

function businessGalleryMarkup(){
  const gallery=Array.isArray(businessProfile?.gallery)?businessProfile.gallery:[];
  return gallery.length?`<div class="builder-gallery-editor">${gallery.map((url,index)=>`<div><img src="${esc(safeUrl(url))}" alt="Studio gallery ${index+1}"><button type="button" data-remove-biz-gallery="${index}" aria-label="Remove photo">×</button></div>`).join('')}</div>`:'<div class="builder-upload-empty">No studio gallery photos uploaded</div>';
}

function renderBusinessSettings(){
  if(!businessProfile)businessProfile=defaultBusinessProfile();
  $('settingsTitle').textContent='Business & practice profile';
  const companySizes=['1-10 architects & designers','11-50 employees','51-200 employees','200+ employees'];

  const branding=`
    <label>Practice / Company name *<input id="bizNameInput" value="${esc(businessProfile.name||'')}" maxlength="120" placeholder="e.g. KHA Architects"></label>
    <label>Industry / Practice focus<input id="bizIndustryInput" value="${esc(businessProfile.industry||'')}" maxlength="100" placeholder="e.g. Architecture & Urban Design"></label>
    ${imageUpload('bizLogoUpload','Studio Logo / Brand Icon',businessProfile.logoUrl,false,'removeBizLogo')}
    ${imageUpload('bizCoverUpload','Studio Cover Banner',businessProfile.coverUrl,false,'removeBizCover')}
  `;

  const narrative=`
    <label>Short tagline / practice subtitle<input id="bizTaglineInput" value="${esc(businessProfile.shortDescription||'')}" maxlength="280" placeholder="e.g. Award-winning architectural studio specializing in sustainable urbanism"></label>
    <label>About the studio / Practice overview<textarea id="bizAboutInput" rows="6" placeholder="Describe your studio history, design philosophy, leadership, and vision…">${esc(businessProfile.about||'')}</textarea></label>
    <label>Headquarters / Main location<input id="bizLocationInput" value="${esc(businessProfile.location||'')}" maxlength="120" placeholder="e.g. Basra, Iraq"></label>
    <label>Company size<select id="bizSizeInput">${companySizes.map(size=>`<option value="${esc(size)}"${(businessProfile.companySize||'')===size?' selected':''}>${esc(size)}</option>`).join('')}</select></label>
  `;

  const services=`
    <label>Services offered${tagEditor('bizService',businessProfile.services||[],'Type a service and press Add')}</label>
    <div class="builder-design-divider" style="margin:16px 0;"></div>
    <label>Specializations &amp; typologies${tagEditor('bizSpec',businessProfile.specializations||[],'Type a specialization')}</label>
  `;

  const contact=`
    <label>Official website<input id="bizWebsiteInput" type="url" value="${esc(businessProfile.website||'')}" maxlength="250" placeholder="https://example.com"></label>
    <label>Contact email<input id="bizEmailInput" type="email" value="${esc(businessProfile.contactEmail||'')}" maxlength="120" placeholder="contact@example.com"></label>
    <label>Office phone<input id="bizPhoneInput" type="tel" value="${esc(businessProfile.contactPhone||'')}" maxlength="40" placeholder="+964 …"></label>
    <label>Physical office address<input id="bizAddressInput" value="${esc(businessProfile.address||'')}" maxlength="200" placeholder="Street, District, Basra"></label>
  `;

  const gallery=`
    <div class="builder-upload">
      <strong>Studio &amp; workspace gallery</strong>
      ${businessGalleryMarkup()}
      <label class="builder-upload-button">Add studio photos<input id="bizGalleryUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
      <small id="bizGalleryUploadStatus">JPG, PNG, or WebP · maximum 10 MB each</small>
    </div>
  `;

  $('settingsPanel').innerHTML=`
    <div class="builder-form">
      <div class="builder-notice" style="border-left:3px solid #166534;background:#f0fdf4;color:#166534;">
        <strong>🏛️ Verified Business Presence</strong>
        <p style="margin:4px 0 0;font-size:.78rem;">Your published portfolio also serves as your public company &amp; studio profile.</p>
      </div>
      ${builderCard('biz-brand','Studio Branding & Identity',branding,true,'Name, logo, cover & handle')}
      ${builderCard('biz-narrative','Practice Overview & Details',narrative,true,'Tagline, about, headquarters & size')}
      ${builderCard('biz-services','Services & Specializations',services,true,'Offered services & typologies')}
      ${builderCard('biz-contact','Official Contact & Links',contact,false,'Website, email, phone & address')}
      ${builderCard('biz-gallery','Studio & Workspace Gallery',gallery,false,'Photos of your studio and team')}
      ${builderCard('biz-posts','Studio Updates & Announcements',businessPostsEditorMarkup(),true,'Publish updates, news & announcements')}
      ${builderCard('biz-opps','Jobs & Internship Opportunities',businessOpportunitiesEditorMarkup(),true,'Publish studio openings and training programs')}
      ${builderCard('biz-applicants','Applicants & Candidate Portfolios',businessApplicantsMarkup(),false,'Review received portfolio applications (' + myApplicants.length + ')')}
    </div>
  `;

  rememberBuilderCards();
  bindBusinessSettingsEvents();
}

function bindBusinessSettingsEvents(){
  const sync=()=>{renderPreview();dirty()};

  $('bizNameInput')?.addEventListener('input',e=>{businessProfile.name=e.target.value;if(!profile.displayName)profile.displayName=e.target.value;sync()});
  $('bizIndustryInput')?.addEventListener('input',e=>{businessProfile.industry=e.target.value;if(!profile.professionalTitle)profile.professionalTitle=e.target.value;sync()});
  $('bizTaglineInput')?.addEventListener('input',e=>{businessProfile.shortDescription=e.target.value;if(!profile.tagline)profile.tagline=e.target.value;sync()});
  $('bizAboutInput')?.addEventListener('input',e=>{businessProfile.about=e.target.value;sync()});
  $('bizLocationInput')?.addEventListener('input',e=>{businessProfile.location=e.target.value;if(!profile.location)profile.location=e.target.value;sync()});
  $('bizSizeInput')?.addEventListener('change',e=>{businessProfile.companySize=e.target.value;sync()});
  $('bizWebsiteInput')?.addEventListener('input',e=>{businessProfile.website=e.target.value;sync()});
  $('bizEmailInput')?.addEventListener('input',e=>{businessProfile.contactEmail=e.target.value;sync()});
  $('bizPhoneInput')?.addEventListener('input',e=>{businessProfile.contactPhone=e.target.value;sync()});
  $('bizAddressInput')?.addEventListener('input',e=>{businessProfile.address=e.target.value;sync()});

  bindTagEditor('bizService',()=>businessProfile.services||[],v=>{businessProfile.services=v},null,()=>{renderBusinessSettings();renderPreview()});
  bindTagEditor('bizSpec',()=>businessProfile.specializations||[],v=>{businessProfile.specializations=v},null,()=>{renderBusinessSettings();renderPreview()});

  $('bizLogoUpload')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const progress=$('bizLogoUploadStatus');
    try{
      ensureImage(file);
      progress.textContent='Uploading logo…';
      const path=`businesses/${user.uid}/logo-${Date.now()}-${cleanFileName(file.name)}`;
      businessProfile.logoUrl=await uploadImage(file,path,progress);
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      dirty();
      status('Studio logo uploaded — save to keep it');
    }catch(err){
      console.error(err);
      progress.textContent=friendlyError(err,'Logo upload failed.');
    }
  });

  $('removeBizLogo')?.addEventListener('click',()=>{
    businessProfile.logoUrl='';
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
    dirty();
    status('Studio logo removed — save to confirm');
  });

  $('bizCoverUpload')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const progress=$('bizCoverUploadStatus');
    try{
      ensureImage(file);
      progress.textContent='Uploading cover…';
      const path=`businesses/${user.uid}/cover-${Date.now()}-${cleanFileName(file.name)}`;
      businessProfile.coverUrl=await uploadImage(file,path,progress);
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      dirty();
      status('Studio cover banner uploaded — save to keep it');
    }catch(err){
      console.error(err);
      progress.textContent=friendlyError(err,'Cover upload failed.');
    }
  });

  $('removeBizCover')?.addEventListener('click',()=>{
    businessProfile.coverUrl='';
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
    dirty();
    status('Studio cover banner removed — save to confirm');
  });

  $('bizGalleryUpload')?.addEventListener('change',async event=>{
    const files=Array.from(event.target.files||[]);if(!files.length)return;
    const progress=$('bizGalleryUploadStatus');
    try{
      const current=Array.isArray(businessProfile.gallery)?[...businessProfile.gallery]:[];
      const room=Math.max(0,12-current.length);
      if(!room)throw new Error('A studio gallery can contain up to 12 images.');
      const selected=files.slice(0,room);
      for(let i=0;i<selected.length;i++){
        ensureImage(selected[i]);
        progress.textContent=`Uploading photo ${i+1} of ${selected.length}…`;
        const path=`businesses/${user.uid}/gallery/${Date.now()}-${i}-${cleanFileName(selected[i].name)}`;
        const url=await uploadImage(selected[i],path,progress);
        current.push(url);
      }
      businessProfile.gallery=current;
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      dirty();
      status(`${selected.length} studio photo${selected.length===1?'':'s'} uploaded — save to keep them`);
    }catch(err){
      console.error(err);
      progress.textContent=friendlyError(err,'Gallery upload failed.');
    }
  });




  // Applicant status updater and filters
  $('bizAppOppFilter')?.addEventListener('change',e=>{
    applicantFilterOpportunity=e.target.value;
    preserveBuilderScroll(()=>{renderBusinessSettings()});
  });

  $('bizAppStatusFilter')?.addEventListener('change',e=>{
    applicantFilterStatus=e.target.value;
    preserveBuilderScroll(()=>{renderBusinessSettings()});
  });

  $('settingsPanel').querySelectorAll('[data-update-applicant-status]').forEach(select=>{
    select.addEventListener('change',async e=>{
      const applicationId=select.dataset.updateApplicantStatus;
      const nextStatus=e.target.value;
      const app=myApplicants.find(a=>a.id===applicationId);
      if(!app)return;

      status('Updating candidate status…');
      try{
        await callFunction('updateJobApplicationStatus',{applicationId,status:nextStatus});
        app.status=nextStatus;
        preserveBuilderScroll(()=>{renderBusinessSettings()});
        status(`Applicant marked as ${nextStatus}`);
      }catch(err){
        console.error(err);
        status(friendlyError(err,'Could not update applicant status.'),true);
      }
    });
  });

  // Business Opportunities Event Listeners
  $('createNewJobBtn')?.addEventListener('click',()=>{
    editingBusinessOpportunity={id:'',type:'job',title:'',description:'',location:businessProfile.location||'Basra, Iraq',employmentType:'Full-time',workplaceType:'On-site',experience:'Entry level',education:'',compensation:'',openings:1,deadline:'',skills:[],software:[],status:'open'};
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
  });

  $('createNewInternshipBtn')?.addEventListener('click',()=>{
    editingBusinessOpportunity={id:'',type:'internship',title:'',description:'',location:businessProfile.location||'Basra, Iraq',duration:'3 Months',compensation:'Paid',startDate:'',studentRequirements:'',openings:1,deadline:'',skills:[],software:[],status:'open'};
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
  });

  $('cancelBizOppBtn')?.addEventListener('click',()=>{
    editingBusinessOpportunity=null;
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
  });

  $('bizOppTitleInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.title=e.target.value});
  $('bizOppStatusInput')?.addEventListener('change',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.status=e.target.value});
  $('bizOppLocationInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.location=e.target.value});
  $('bizOppEmploymentInput')?.addEventListener('change',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.employmentType=e.target.value});
  $('bizOppWorkplaceInput')?.addEventListener('change',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.workplaceType=e.target.value});
  $('bizOppExperienceInput')?.addEventListener('change',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.experience=e.target.value});
  $('bizOppCompensationInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.compensation=e.target.value});
  $('bizOppEducationInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.education=e.target.value});
  $('bizOppDurationInput')?.addEventListener('change',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.duration=e.target.value});
  $('bizOppStudentReqInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.studentRequirements=e.target.value});
  $('bizOppOpeningsInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.openings=Number(e.target.value)||1});
  $('bizOppDeadlineInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.deadline=e.target.value});
  $('bizOppDescInput')?.addEventListener('input',e=>{if(editingBusinessOpportunity)editingBusinessOpportunity.description=e.target.value});

  bindTagEditor('bizOppSkill',()=>editingBusinessOpportunity?.skills||[],v=>{if(editingBusinessOpportunity)editingBusinessOpportunity.skills=v},null,()=>{renderBusinessSettings();renderPreview()});
  bindTagEditor('bizOppSoftware',()=>editingBusinessOpportunity?.software||[],v=>{if(editingBusinessOpportunity)editingBusinessOpportunity.software=v},null,()=>{renderBusinessSettings();renderPreview()});

  $('saveBizOppBtn')?.addEventListener('click',async()=>{
    if(!editingBusinessOpportunity)return;
    const title=String(editingBusinessOpportunity.title||'').trim();
    const desc=String(editingBusinessOpportunity.description||'').trim();
    if(!title){status('Please provide a position title.',true);return}
    if(!desc){status('Please provide a description for this opportunity.',true);return}

    status('Saving opportunity…');
    try{
      const result=await callFunction('saveBusinessOpportunity',{
        ...editingBusinessOpportunity,
        id:editingBusinessOpportunity.id||undefined
      });
      if(result&&result.opportunity){
        const idx=myBusinessOpportunities.findIndex(o=>o.id===result.opportunity.id);
        if(idx>=0)myBusinessOpportunities[idx]=result.opportunity;
        else myBusinessOpportunities.unshift(result.opportunity);
      }
      const shareToComm = $('bizOppShareCommunity')?.checked;
      if (shareToComm && result?.opportunity?.id && result?.opportunity?.status === 'open') {
        callFunction('createCommunityPost', {
          type: 'text',
          title: result.opportunity.title,
          content: `🏛️ **${businessProfile.name || 'Studio'}** published a new ${result.opportunity.type === 'internship' ? 'internship opportunity' : 'job opening'}:\n\n${desc.slice(0, 240)}`,
          communitySlug: 'main',
          portfolioKind: result.opportunity.type === 'internship' ? 'internship' : 'job',
          portfolioId: result.opportunity.id
        }).catch(err => console.warn('[Cross-Posting] Failed to share opportunity to Professional:', err));
      }
      editingBusinessOpportunity=null;
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      status('Opportunity listing updated');
    }catch(err){
      console.error(err);
      status(friendlyError(err,'Could not save opportunity.'),true);
    }
  });

  $('settingsPanel').querySelectorAll('[data-edit-biz-opp]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const oppId=btn.dataset.editBizOpp;
      const found=myBusinessOpportunities.find(o=>o.id===oppId);
      if(found){
        editingBusinessOpportunity={...found,skills:[...(found.skills||[])],software:[...(found.software||[])]};
        preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      }
    });
  });

  $('settingsPanel').querySelectorAll('[data-status-biz-opp]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const oppId=btn.dataset.statusBizOpp;
      const nextStatus=btn.dataset.setStatus;
      const found=myBusinessOpportunities.find(o=>o.id===oppId);
      if(!found)return;
      status('Updating listing status…');
      try{
        const updated={...found,status:nextStatus};
        await callFunction('saveBusinessOpportunity',updated);
        found.status=nextStatus;
        preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
        status(`Listing marked as ${nextStatus}`);
      }catch(err){
        console.error(err);
        status(friendlyError(err,'Could not update status.'),true);
      }
    });
  });

  $('settingsPanel').querySelectorAll('[data-delete-biz-opp]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const oppId=btn.dataset.deleteBizOpp;
      if(!confirm('Are you sure you want to delete this listing?'))return;
      status('Deleting listing…');
      try{
        await callFunction('deleteBusinessOpportunity',{id:oppId});
        myBusinessOpportunities=myBusinessOpportunities.filter(o=>o.id!==oppId);
        preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
        status('Listing removed');
      }catch(err){
        console.error(err);
        status(friendlyError(err,'Could not delete listing.'),true);
      }
    });
  });

  // Business Posts Event Listeners
  $('createNewBizPostBtn')?.addEventListener('click',()=>{
    editingBusinessPost={id:'',title:'',content:'',category:'update',imageUrl:'',status:'published'};
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
  });

  $('cancelBizPostBtn')?.addEventListener('click',()=>{
    editingBusinessPost=null;
    preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
  });

  $('bizPostTitleInput')?.addEventListener('input',e=>{if(editingBusinessPost)editingBusinessPost.title=e.target.value});
  $('bizPostCategoryInput')?.addEventListener('change',e=>{if(editingBusinessPost)editingBusinessPost.category=e.target.value});
  $('bizPostContentInput')?.addEventListener('input',e=>{if(editingBusinessPost)editingBusinessPost.content=e.target.value});

  $('bizPostMediaUpload')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file||!editingBusinessPost)return;
    const progress=$('bizPostMediaUploadStatus');
    try{
      ensureImage(file);
      progress.textContent='Uploading photo…';
      const path=`businesses/${user.uid}/posts/post-${Date.now()}-${cleanFileName(file.name)}`;
      editingBusinessPost.imageUrl=await uploadImage(file,path,progress);
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
    }catch(err){
      console.error(err);
      progress.textContent=friendlyError(err,'Photo upload failed.');
    }
  });

  $('removeBizPostMedia')?.addEventListener('click',()=>{
    if(editingBusinessPost){
      editingBusinessPost.imageUrl='';
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
    }
  });

  $('saveBizPostBtn')?.addEventListener('click',async()=>{
    if(!editingBusinessPost)return;
    const content=String(editingBusinessPost.content||'').trim();
    if(!content){
      status('Please provide content for your studio update.',true);
      return;
    }
    status('Publishing studio update…');
    try{
      const result=await callFunction('saveBusinessPost',{
        postId:editingBusinessPost.id||undefined,
        title:editingBusinessPost.title||'',
        content,
        category:editingBusinessPost.category||'update',
        imageUrl:editingBusinessPost.imageUrl||'',
        status:'published'
      });
      if(result&&result.post){
        const idx=myBusinessPosts.findIndex(p=>p.id===result.post.id);
        if(idx>=0){
          myBusinessPosts[idx]=result.post;
        }else{
          myBusinessPosts.unshift(result.post);
        }
      }
      editingBusinessPost=null;
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      status('Studio update published to your portfolio');
    }catch(err){
      console.error(err);
      status(friendlyError(err,'Could not save studio update.'),true);
    }
  });

  $('settingsPanel').querySelectorAll('[data-edit-biz-post]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const postId=btn.dataset.editBizPost;
      const found=myBusinessPosts.find(p=>p.id===postId);
      if(found){
        editingBusinessPost={...found};
        preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      }
    });
  });

  $('settingsPanel').querySelectorAll('[data-delete-biz-post]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const postId=btn.dataset.deleteBizPost;
      if(!confirm('Are you sure you want to delete this studio update?'))return;
      status('Deleting update…');
      try{
        await callFunction('deleteBusinessPost',{postId});
        myBusinessPosts=myBusinessPosts.filter(p=>p.id!==postId);
        preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
        status('Studio update removed');
      }catch(err){
        console.error(err);
        status(friendlyError(err,'Could not delete update.'),true);
      }
    });
  });

  $('settingsPanel').querySelectorAll('[data-remove-biz-gallery]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const index=Number(btn.dataset.removeBizGallery);
      const current=Array.isArray(businessProfile.gallery)?[...businessProfile.gallery]:[];
      current.splice(index,1);
      businessProfile.gallery=current;
      preserveBuilderScroll(()=>{renderBusinessSettings();renderPreview()});
      dirty();
      status('Gallery photo removed — save to confirm');
    });
  });
}


/* ─── FLOATING BUSINESS MESSENGER ─────────────────────────────────────── */
let bizMessengerActiveUid = null;
let bizMessengerActiveSpace = null;
let bizMessengerUnsubMessages = null;
let bizMessengerUnsubThreads = null;
let bizMessengerThreads = [];

function ensureFloatingBizMessenger() {
  if (!isBusinessAccount) return;
  if ($('builderBizMessengerDock')) return;

  const dock = document.createElement('div');
  dock.id = 'builderBizMessengerDock';
  dock.className = 'builder-biz-messenger-dock';
  dock.innerHTML = `
    <div id="bizMessengerPanel" class="biz-messenger-panel" hidden>
      <header class="biz-messenger-header">
        <div class="biz-messenger-header-title">
          <strong>💬 Candidate Messages</strong>
          <small id="bizMessengerActiveTitle">Direct Inquiries &amp; Applicants</small>
        </div>
        <div class="biz-messenger-header-actions">
          <button id="bizMessengerBackToList" type="button" class="biz-messenger-head-btn" title="Back to chats" hidden>←</button>
          <button id="bizMessengerMinimizeBtn" type="button" class="biz-messenger-head-btn" title="Close">×</button>
        </div>
      </header>

      <div class="biz-messenger-body">
        <!-- Threads List View -->
        <div id="bizMessengerListView" class="biz-messenger-list-view">
          <div class="biz-messenger-search-wrap">
            <input id="bizMessengerSearch" type="search" placeholder="Search candidate conversations…">
          </div>
          <div id="bizMessengerThreadsList" class="biz-messenger-threads-list">
            <div class="biz-messenger-empty">Loading conversations…</div>
          </div>
        </div>

        <!-- Chat View -->
        <div id="bizMessengerChatView" class="biz-messenger-chat-view" hidden>
          <div id="bizMessengerChatHeader" class="biz-messenger-chat-head">
            <div class="biz-messenger-chat-candidate">
              <div id="bizMessengerChatAvatar" class="biz-messenger-thread-avatar">A</div>
              <div>
                <strong id="bizMessengerChatName">Candidate</strong>
                <small id="bizMessengerChatRole">Applicant</small>
              </div>
            </div>
            <a id="bizMessengerViewPortfolioLink" href="#" target="_blank" class="biz-messenger-mini-link">Portfolio ↗</a>
          </div>

          <div id="bizMessengerMessagesList" class="biz-messenger-messages-stream">
            <div class="biz-messenger-empty">No messages yet. Send a message to initiate the conversation.</div>
          </div>

          <form id="bizMessengerSendForm" class="biz-messenger-composer">
            <input id="bizMessengerInput" type="text" placeholder="Type a message to candidate…" autocomplete="off">
            <button type="submit" class="biz-messenger-send-btn" aria-label="Send message">➤</button>
          </form>
        </div>
      </div>
    </div>

    <button id="bizMessengerToggleBtn" class="biz-messenger-dock-btn" type="button">
      <span class="biz-dock-icon">💬</span>
      <span class="biz-dock-text">Candidate Messages</span>
      <span id="bizMessengerUnreadBadge" class="biz-messenger-dock-badge" hidden>0</span>
    </button>
  `;
  document.body.appendChild(dock);

  const toggleBtn = $('bizMessengerToggleBtn');
  const panel = $('bizMessengerPanel');
  const minimizeBtn = $('bizMessengerMinimizeBtn');
  const backBtn = $('bizMessengerBackToList');
  const searchInput = $('bizMessengerSearch');
  const sendForm = $('bizMessengerSendForm');

  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && $('bizMessengerListView').hidden && !bizMessengerActiveSpace) {
      showBizMessengerList();
    }
  });

  minimizeBtn.addEventListener('click', () => {
    panel.hidden = true;
  });

  backBtn.addEventListener('click', () => {
    showBizMessengerList();
  });

  searchInput.addEventListener('input', (e) => {
    renderBizMessengerThreadsList(e.target.value);
  });

  sendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('bizMessengerInput');
    const text = (input.value || '').trim();
    if (!text || !bizMessengerActiveSpace) return;
    input.value = '';
    try {
      await callFunction('setCommunitySpaceConnection', {
        operation: 'send_space_message',
        spaceId: bizMessengerActiveSpace.slug,
        text: text
      });
    } catch (err) {
      console.error('[BizMessenger] Send error:', err);
      alert('Could not send message: ' + (err.message || ''));
    }
  });

  listenBizMessengerThreads();
}

function showBizMessengerList() {
  $('bizMessengerListView').hidden = false;
  $('bizMessengerChatView').hidden = true;
  $('bizMessengerBackToList').hidden = true;
  $('bizMessengerActiveTitle').textContent = 'Direct Inquiries & Applicants';
  bizMessengerActiveSpace = null;
  bizMessengerActiveUid = null;
  if (bizMessengerUnsubMessages) {
    bizMessengerUnsubMessages();
    bizMessengerUnsubMessages = null;
  }
}

async function openBizMessengerCandidate(candidateUid, candidateName = '', candidateTitle = '') {
  ensureFloatingBizMessenger();
  const panel = $('bizMessengerPanel');
  panel.hidden = false;
  $('bizMessengerListView').hidden = true;
  $('bizMessengerChatView').hidden = false;
  $('bizMessengerBackToList').hidden = false;

  $('bizMessengerChatName').textContent = candidateName || 'Candidate';
  $('bizMessengerChatRole').textContent = candidateTitle || 'Applicant';
  $('bizMessengerChatAvatar').textContent = initials(candidateName || 'Candidate');
  $('bizMessengerViewPortfolioLink').href = `portfolio.html?id=${encodeURIComponent(candidateUid)}`;
  $('bizMessengerActiveTitle').textContent = candidateName || 'Candidate Conversation';

  getDoc(doc(db, 'users', candidateUid)).then(snap => {
    if (snap.exists()) {
      const data = snap.data();
      const photo = data.photoBase64 || data.photoURL;
      if (photo) {
        $('bizMessengerChatAvatar').innerHTML = `<img src="${esc(safeUrl(photo))}" alt="">`;
      }
    }
  }).catch(() => {});

  $('bizMessengerMessagesList').innerHTML = '<div class="biz-messenger-empty">Loading conversation…</div>';

  try {
    const res = await callFunction('openDirectConversation', { targetUid: candidateUid });
    if (res && res.space) {
      bizMessengerActiveSpace = { slug: res.spaceId, ...res.space };
      bizMessengerActiveUid = candidateUid;
      subscribeBizMessengerChat(res.spaceId);
      setTimeout(() => $('bizMessengerInput')?.focus(), 100);
    }
  } catch (err) {
    console.error('[BizMessenger] open error:', err);
    $('bizMessengerMessagesList').innerHTML = `<div class="biz-messenger-empty" style="color:var(--wine);">${esc(err.message || 'Could not open conversation.')}</div>`;
  }
}

function subscribeBizMessengerChat(spaceSlug) {
  if (bizMessengerUnsubMessages) {
    bizMessengerUnsubMessages();
  }
  const q = query(
    collection(db, 'communitySpaces', spaceSlug, 'messages'),
    orderBy('createdAt', 'asc')
  );

  bizMessengerUnsubMessages = onSnapshot(q, snapshot => {
    const stream = $('bizMessengerMessagesList');
    if (!stream) return;
    if (snapshot.empty) {
      stream.innerHTML = '<div class="biz-messenger-empty">No messages yet. Send a message to start chatting with the candidate.</div>';
      return;
    }

    const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    stream.innerHTML = messages.map(msg => {
      const isMine = msg.senderId === user.uid;
      const timeStr = msg.createdAt ? (msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '') : '';
      return `
        <div class="biz-msg-bubble ${isMine ? 'outgoing' : 'incoming'}">
          <div>${esc(msg.text || '')}</div>
          <div class="biz-msg-meta">${esc(timeStr)}</div>
        </div>
      `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
  }, err => {
    console.warn('[BizMessenger] stream error:', err);
  });
}

function listenBizMessengerThreads() {
  if (!user) return;
  const q = query(
    collection(db, 'communitySpaces'),
    where('isDirectMessage', '==', true),
    where('directParticipants', 'array-contains', user.uid)
  );

  if (bizMessengerUnsubThreads) {
    bizMessengerUnsubThreads();
  }

  bizMessengerUnsubThreads = onSnapshot(q, async snapshot => {
    const threads = await Promise.all(snapshot.docs.map(async d => {
      const data = d.data();
      const otherUid = (Array.isArray(data.directParticipants) ? data.directParticipants : []).find(id => id !== user.uid) || d.id.replace(/^dm-/, '').split('-').find(id => id !== user.uid);
      const otherSnap = otherUid ? await getDoc(doc(db, 'users', otherUid)).catch(() => null) : null;
      const otherProf = otherSnap?.exists() ? otherSnap.data() : {};

      const app = myApplicants.find(a => a.applicantUid === otherUid);

      return {
        slug: d.id,
        id: d.id,
        otherUid,
        name: otherProf.displayName || otherProf.username || app?.applicantName || 'Candidate',
        role: app ? `${app.opportunityTitle} (${app.opportunityType})` : (otherProf.professionalTitle || 'Professional Member'),
        avatar: otherProf.photoBase64 || otherProf.photoURL || '',
        updatedAt: data.updatedAt || data.createdAt || null
      };
    }));

    bizMessengerThreads = threads;
    renderBizMessengerThreadsList();
  }, err => {
    console.warn('[BizMessenger] threads listener error:', err);
  });
}

function renderBizMessengerThreadsList(searchQuery = '') {
  const container = $('bizMessengerThreadsList');
  if (!container) return;

  const q = searchQuery.trim().toLowerCase();
  let filtered = bizMessengerThreads;
  if (q) {
    filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(q) || (t.role || '').toLowerCase().includes(q));
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="biz-messenger-empty">${q ? 'No matching candidate chats.' : 'No candidate conversations yet. Use "Message 💬" on any applicant to initiate a conversation.'}</div>`;
    return;
  }

  container.innerHTML = filtered.map(t => `
    <div class="biz-messenger-thread-item" data-open-thread-uid="${esc(t.otherUid)}" data-thread-name="${esc(t.name)}" data-thread-role="${esc(t.role)}">
      <div class="biz-messenger-thread-avatar">
        ${t.avatar ? `<img src="${esc(safeUrl(t.avatar))}" alt="">` : `<span>${esc(initials(t.name))}</span>`}
      </div>
      <div class="biz-messenger-thread-info">
        <div class="biz-messenger-thread-top">
          <strong>${esc(t.name)}</strong>
        </div>
        <div class="biz-messenger-thread-role">${esc(t.role)}</div>
        <p class="biz-messenger-thread-preview">Click to open chat</p>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-open-thread-uid]').forEach(item => {
    item.addEventListener('click', () => {
      openBizMessengerCandidate(item.dataset.openThreadUid, item.dataset.threadName, item.dataset.threadRole);
    });
  });
}
