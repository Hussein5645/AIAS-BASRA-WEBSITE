import {normaliseThemePackage,selectedThemePalette,themeTokenStyles,ensureGoogleFonts} from './portfolio-theme-package.js?v=20260821-full-theme-editor-v2';
export const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
export const text=value=>String(value??'').trim();
export const safeUrl=value=>{try{const url=new URL(text(value),location.origin);return url.protocol==='blob:'||url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?url.href:''}catch{return''}};
export const initials=value=>text(value).split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'PF';
export const time=value=>typeof value?.seconds==='number'?value.seconds:0;
const THEMES=new Set(['minimal','editorial','executive','studio','gallery','resume','technical','bold','monochrome','warm']);
const SURFACES=new Set(['cards','flat','outline','elevated']);
const WORK_LAYOUTS=new Set(['cards','posters','list']);
const DENSITIES=new Set(['comfortable','compact','spacious']);
const SIDEBAR_WIDTHS=new Set(['narrow','balanced','wide']);
export function presentationClasses(profile={}){const custom=profile.themePackage?normaliseThemePackage(profile.themePackage):null;const theme=custom?'minimal':(THEMES.has(profile.theme)?profile.theme:'minimal');const surface=SURFACES.has(custom?.surfaceStyle)?custom.surfaceStyle:SURFACES.has(profile.surfaceStyle)?profile.surfaceStyle:'cards';const work=WORK_LAYOUTS.has(custom?.workLayout)?custom.workLayout:WORK_LAYOUTS.has(profile.workLayout)?profile.workLayout:'cards';const density=DENSITIES.has(custom?.density)?custom.density:DENSITIES.has(profile.density)?profile.density:'comfortable';const sidebarWidth=SIDEBAR_WIDTHS.has(profile.sidebar?.width)?profile.sidebar.width:'balanced';const fieldBackgrounds=(custom?custom.fieldBackgrounds:profile.fieldBackgrounds)===false?'field-backgrounds-off':'field-backgrounds-on';const tokenClasses=custom?`theme-hero-${custom.tokens.heroStyle} theme-align-${custom.tokens.heroAlign} theme-compose-${custom.tokens.heroComposition} theme-avatar-${custom.tokens.avatarShape} theme-sidebar-${custom.tokens.sidebarPosition} theme-sidebar-style-${custom.tokens.sidebarStyle} theme-label-${custom.tokens.labelCase}`:'';return `theme-${theme} surface-${surface} work-${work} density-${density} sidebar-width-${sidebarWidth} ${fieldBackgrounds} ${custom?'theme-community':''} ${tokenClasses}`}
export const portfolioPalettes=Object.freeze([
  {id:'heritage_wine',name:'Heritage Wine',family:'Classic',accent:'#661f22',bg:'#f7f3ed',surface:'#fffdfa',ink:'#211a1b',soft:'#f0daa1'},
  {id:'navy_gold',name:'Navy & Gold',family:'Professional',accent:'#b88a3b',bg:'#eaf0f4',surface:'#ffffff',ink:'#14283a',soft:'#d9c18c'},
  {id:'slate_blue',name:'Slate Blue',family:'Professional',accent:'#426b8a',bg:'#edf2f5',surface:'#ffffff',ink:'#233642',soft:'#c9d9e3'},
  {id:'oxford_red',name:'Oxford Red',family:'Professional',accent:'#8b2635',bg:'#f2f0ef',surface:'#ffffff',ink:'#252124',soft:'#dec2c7'},
  {id:'forest_cream',name:'Forest & Cream',family:'Natural',accent:'#2f6b4f',bg:'#f1efe5',surface:'#fffdf4',ink:'#1e3328',soft:'#c9d7b5'},
  {id:'emerald_stone',name:'Emerald Stone',family:'Natural',accent:'#087f5b',bg:'#e9f0ec',surface:'#fbfdfc',ink:'#17372d',soft:'#a9d4c2'},
  {id:'sage_charcoal',name:'Sage Charcoal',family:'Natural',accent:'#687c61',bg:'#eef0ea',surface:'#fcfdf9',ink:'#2c332b',soft:'#cbd4c2'},
  {id:'olive_linen',name:'Olive Linen',family:'Natural',accent:'#75843f',bg:'#f4f0e5',surface:'#fffdf8',ink:'#363626',soft:'#d8d5a9'},
  {id:'ocean_mist',name:'Ocean Mist',family:'Cool',accent:'#23879b',bg:'#eaf5f6',surface:'#ffffff',ink:'#19383e',soft:'#b9dfe4'},
  {id:'arctic_cyan',name:'Arctic Cyan',family:'Cool',accent:'#0e7490',bg:'#edf8fb',surface:'#ffffff',ink:'#16404b',soft:'#bde9f2'},
  {id:'cobalt_ice',name:'Cobalt Ice',family:'Cool',accent:'#2859c5',bg:'#eef3ff',surface:'#ffffff',ink:'#17294d',soft:'#c7d6fb'},
  {id:'indigo_lavender',name:'Indigo Lavender',family:'Cool',accent:'#5b55a5',bg:'#f0eef8',surface:'#fdfcff',ink:'#292744',soft:'#d6d0ee'},
  {id:'plum_blush',name:'Plum Blush',family:'Creative',accent:'#7a3e6f',bg:'#f7edf3',surface:'#fffafd',ink:'#3d2838',soft:'#e6bfd7'},
  {id:'rose_quartz',name:'Rose Quartz',family:'Creative',accent:'#b55470',bg:'#faeff2',surface:'#fffafb',ink:'#452c34',soft:'#efc8d2'},
  {id:'violet_electric',name:'Electric Violet',family:'Creative',accent:'#7c3aed',bg:'#f3efff',surface:'#ffffff',ink:'#2e2050',soft:'#d9c8ff'},
  {id:'teal_coral',name:'Teal & Coral',family:'Creative',accent:'#e2675f',bg:'#eaf4f2',surface:'#fffdfb',ink:'#194542',soft:'#a9d8d1'},
  {id:'terracotta_clay',name:'Terracotta Clay',family:'Warm',accent:'#b85c3f',bg:'#f5e8da',surface:'#fff9f2',ink:'#4a2d24',soft:'#e7b994'},
  {id:'desert_sun',name:'Desert Sun',family:'Warm',accent:'#c67c22',bg:'#f7edda',surface:'#fffcf5',ink:'#4b3824',soft:'#efd19b'},
  {id:'coffee_copper',name:'Coffee Copper',family:'Warm',accent:'#a5663f',bg:'#eee4da',surface:'#fbf7f2',ink:'#382821',soft:'#d7b69d'},
  {id:'sunset_punch',name:'Sunset Punch',family:'Warm',accent:'#ef5b3f',bg:'#fff0e7',surface:'#fffaf6',ink:'#482722',soft:'#ffc1a6'},
  {id:'graphite',name:'Graphite',family:'Dark',accent:'#697386',bg:'#17191d',surface:'#23262c',ink:'#f2f4f7',soft:'#383d46'},
  {id:'midnight_neon',name:'Midnight Neon',family:'Dark',accent:'#c8f43d',bg:'#0d1110',surface:'#171c1a',ink:'#f5f7ef',soft:'#303b24'},
  {id:'deep_ocean',name:'Deep Ocean',family:'Dark',accent:'#44c7d8',bg:'#091c24',surface:'#102a34',ink:'#eefbfc',soft:'#214853'},
  {id:'black_white',name:'Black & White',family:'Dark',accent:'#111111',bg:'#f2f2f2',surface:'#ffffff',ink:'#111111',soft:'#d8d8d8'}
]);
export const PALETTES=new Map(portfolioPalettes.map(palette=>[palette.id,palette]));
function alpha(hex,value){return /^#[0-9a-f]{6}$/i.test(hex)?`${hex}${value}`:hex}

export function resolveMultiThemes(profile={}){
  const list=Array.isArray(profile.multiThemePublish?.themes)?profile.multiThemePublish.themes:[];
  if(profile.multiThemePublish?.enabled&&list.length>1){
    return list.map((item,index)=>({
      id:item.id||`theme-${index+1}`,
      name:item.name||`Style ${index+1}`,
      type:item.type||(item.themePackage?'community':'built-in'),
      theme:item.theme||'minimal',
      palette:item.palette||'heritage_wine',
      accent:item.accent||'#661f22',
      surfaceStyle:item.surfaceStyle||'cards',
      workLayout:item.workLayout||'cards',
      density:item.density||'comfortable',
      fieldBackgrounds:item.fieldBackgrounds!==false,
      themePackage:item.themePackage?normaliseThemePackage(item.themePackage):null,
      themePaletteId:item.themePaletteId||''
    }));
  }
  return [{
    id:'primary',
    name:profile.themePackage?(profile.themePackage.name||'Custom Theme'):'Primary style',
    type:profile.themePackage?'community':'built-in',
    theme:profile.theme||'minimal',
    palette:profile.palette||'heritage_wine',
    accent:profile.accent||'#661f22',
    surfaceStyle:profile.surfaceStyle||'cards',
    workLayout:profile.workLayout||'cards',
    density:profile.density||'comfortable',
    fieldBackgrounds:profile.fieldBackgrounds!==false,
    themePackage:profile.themePackage?normaliseThemePackage(profile.themePackage):null,
    themePaletteId:profile.themePaletteId||''
  }];
}

export function profileFromThemeOption(baseProfile={},themeOption={}){
  return{
    ...baseProfile,
    theme:themeOption.theme||baseProfile.theme||'minimal',
    surfaceStyle:themeOption.surfaceStyle||baseProfile.surfaceStyle||'cards',
    workLayout:themeOption.workLayout||baseProfile.workLayout||'cards',
    density:themeOption.density||baseProfile.density||'comfortable',
    fieldBackgrounds:themeOption.fieldBackgrounds!==false,
    palette:themeOption.palette||baseProfile.palette||'heritage_wine',
    accent:themeOption.accent||baseProfile.accent||'#661f22',
    themePackage:themeOption.themePackage||null,
    themePaletteId:themeOption.themePaletteId||''
  };
}
export function applyPresentationPalette(target,profile={}){
  const community=profile.themePackage?selectedThemePalette(profile.themePackage,profile.themePaletteId):null;
  const legacyCustom=!profile.palette&&/^#[0-9a-f]{6}$/i.test(String(profile.accent||''))&&String(profile.accent).toLowerCase()!=='#661f22';
  const paletteId=profile.palette||(legacyCustom?'custom':'heritage_wine');
  const builtInBase=PALETTES.get(paletteId)||PALETTES.get('heritage_wine');
  const accent=paletteId==='custom'&&/^#[0-9a-f]{6}$/i.test(String(profile.accent||''))?String(profile.accent).toLowerCase():builtInBase.accent;
  const base=community||builtInBase;
  const soft=paletteId==='custom'?alpha(accent,'2e'):base.soft;
  const resolvedAccent=community?base.accent:accent;
  const style=target?.style;
  if(!style)return;
  style.setProperty('--accent',resolvedAccent);
  style.setProperty('--palette-bg',base.bg);
  style.setProperty('--palette-surface',base.surface);
  style.setProperty('--palette-ink',base.ink);
  style.setProperty('--palette-muted',alpha(base.ink,'b3'));
  style.setProperty('--palette-line',alpha(base.ink,'28'));
  style.setProperty('--palette-soft',soft);
  if(community)style.setProperty('--palette-soft',base.soft);
  style.setProperty('--palette-soft-ink',base.ink);
  style.setProperty('--palette-hero-start',base.family==='Dark'||luminance(base.bg)<.25?base.bg:base.ink);
  style.setProperty('--palette-hero-end',resolvedAccent);
  style.setProperty('--palette-hero-ink','#ffffff');
  if(profile.themePackage){
    const doc=target?.ownerDocument||(typeof document!=='undefined'?document:null);
    ensureGoogleFonts([profile.themePackage.tokens?.headingFont,profile.themePackage.tokens?.bodyFont],doc);
    Object.entries(themeTokenStyles(profile.themePackage)).forEach(([property,value])=>style.setProperty(property,value));
  }
}
function luminance(hex){const values=(String(hex).match(/[0-9a-f]{2}/gi)||['ff','ff','ff']).map(value=>parseInt(value,16)/255);return values.reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)}
const WORK_PAGE_LAYOUTS=new Set(['case-study','editorial','visual']);
export function workPresentation(work={},portfolio={}){return{...portfolio,theme:THEMES.has(work.theme)?work.theme:portfolio.theme,palette:PALETTES.has(work.palette)||work.palette==='custom'?work.palette:portfolio.palette,accent:/^#[0-9a-f]{6}$/i.test(String(work.accent||''))?work.accent:portfolio.accent}}
export function workPageClass(work={},portfolio={}){const layout=WORK_PAGE_LAYOUTS.has(work.pageLayout)?work.pageLayout:'case-study';return `portfolio-page ${presentationClasses(workPresentation(work,portfolio))} work-page work-page-layout-${layout}`}
export function workPageMarkup(work={},portfolio={},options={}){const cover=safeUrl(work.previewUrl||work.coverUrl);const fields=(Array.isArray(work.fields)?work.fields:[]).filter(field=>field?.visible!==false&&text(field?.value));const gallery=(Array.isArray(work.gallery)?work.gallery:[]).map(safeUrl).filter(Boolean);const visibleGallery=gallery.slice(0,3);const links=(Array.isArray(work.links)?work.links:[]).filter(link=>safeUrl(link?.url));const actionMarkup=options.actions||'';const previewMarkup=options.preview?'<span class="builder-preview-label">Work page preview</span>':'';const content=text(work.content);const empty=!content&&!fields.length&&!gallery.length&&!links.length;return `<section class="work-hero"${cover?` style="--work-cover:url(&quot;${esc(cover)}&quot;)"`:''}>${cover?`<button class="work-image-expand work-hero-expand" type="button" data-work-image="${esc(cover)}" aria-label="Expand project cover image">⛶ <span>Expand image</span></button>`:''}<div class="work-hero-copy"><div class="pf-eyebrow"><i></i>${esc(work.workType||'Professional work')} · ${esc(portfolio.displayName||'Your portfolio')}</div><h1>${esc(work.title||'Untitled professional work')}</h1><p>${esc(work.summary||'Add a short summary to introduce this work.')}</p>${actionMarkup}${previewMarkup}</div></section><main class="work-body">${content?`<section class="work-story"><header><span>01</span><h2>About this work</h2></header><div class="portfolio-rich">${esc(content)}</div></section>`:''}${fields.length?`<section class="work-details"><header><span>${content?'02':'01'}</span><h2>Project details</h2></header><div class="portfolio-field-grid">${fields.map(portfolioFieldMarkup).join('')}</div></section>`:''}${gallery.length?`<section class="work-gallery-section"><header><span>${String((content?1:0)+(fields.length?1:0)+1).padStart(2,'0')}</span><h2>Gallery</h2><small>${gallery.length} image${gallery.length===1?'':'s'}</small></header><div class="work-gallery">${visibleGallery.map((url,index)=>`<figure><button class="work-gallery-image" type="button" data-work-image="${esc(url)}" aria-label="Expand gallery image ${index+1}"><img src="${esc(url)}" alt="${esc(work.title||'Work')} image ${index+1}" loading="lazy">${index===2&&gallery.length>3?`<span class="work-gallery-more">+${gallery.length-3}<small>View all</small></span>`:'<span class="work-gallery-zoom" aria-hidden="true">⛶</span>'}</button></figure>`).join('')}</div></section>`:''}${links.length?`<section class="work-links"><header><h2>Project links</h2></header><div class="portfolio-contact-list">${links.map(link=>`<a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener">${esc(link.label||'Open link')} ↗</a>`).join('')}</div></section>`:''}${empty?'<section class="builder-empty"><h2>Build the work page</h2><p>Add a case study, project details, or gallery images from the editor.</p></section>':''}</main>`}
const workViewerContexts=new WeakMap();
let workViewerDialog=null;
function workImageSources(work={}){const fields=(Array.isArray(work.fields)?work.fields:[]).filter(field=>field?.type==='image'&&field?.visible!==false).map(field=>safeUrl(field.value)).filter(Boolean);const gallery=(Array.isArray(work.gallery)?work.gallery:[]).map(safeUrl).filter(Boolean);return [...new Set([safeUrl(work.previewUrl||work.coverUrl),...fields,...gallery].filter(Boolean))]}
function ensureWorkViewer(){if(workViewerDialog?.isConnected)return workViewerDialog;const dialog=document.createElement('dialog');dialog.className='work-image-viewer';dialog.innerHTML=`<div class="work-image-viewer-stage"><button type="button" class="work-image-viewer-close" aria-label="Close image viewer">×</button><button type="button" class="work-image-viewer-nav previous" aria-label="Previous image">‹</button><img alt="Expanded project image"><button type="button" class="work-image-viewer-nav next" aria-label="Next image">›</button><output aria-live="polite"></output></div>`;const show=index=>{const sources=dialog._sources||[];if(!sources.length)return;dialog._index=(index+sources.length)%sources.length;dialog.querySelector('img').src=sources[dialog._index];dialog.querySelector('output').textContent=`${dialog._index+1} / ${sources.length}`;dialog.querySelectorAll('.work-image-viewer-nav').forEach(button=>button.hidden=sources.length<2)};dialog._show=show;dialog.querySelector('.work-image-viewer-close').addEventListener('click',()=>dialog.close());dialog.querySelector('.previous').addEventListener('click',()=>show((dialog._index||0)-1));dialog.querySelector('.next').addEventListener('click',()=>show((dialog._index||0)+1));dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')show((dialog._index||0)-1);else if(event.key==='ArrowRight')show((dialog._index||0)+1)});document.body.append(dialog);workViewerDialog=dialog;return dialog}
export function bindWorkImageViewer(root,work={}){if(!root)return;workViewerContexts.set(root,work);if(root.dataset.workImageViewerBound)return;root.dataset.workImageViewerBound='true';root.addEventListener('click',event=>{const trigger=event.target.closest('[data-work-image],.portfolio-field-image');if(!trigger||!root.contains(trigger))return;const current=workViewerContexts.get(root)||{};const source=safeUrl(trigger.dataset.workImage||trigger.currentSrc||trigger.src);if(!source)return;const viewer=ensureWorkViewer();viewer._sources=workImageSources(current);if(!viewer._sources.includes(source))viewer._sources.push(source);viewer._show(viewer._sources.indexOf(source));viewer.showModal()})}
export function bindImageFallbacks(root=document){root.querySelectorAll('img[data-portfolio-image]').forEach(image=>image.addEventListener('error',()=>{const cover=image.closest('.pf-card-cover');if(cover){cover.classList.add('image-unavailable');image.remove()}},{once:true}))}
const SECTION_PRESENTATIONS=Object.freeze({
  about:{icon:'Aa',label:'Profile',style:'narrative'},gallery:{icon:'▦',label:'Visual collection',style:'gallery'},experience:{icon:'↗',label:'Career history',style:'timeline'},education:{icon:'⌁',label:'Education',style:'timeline'},skills:{icon:'✦',label:'Capabilities',style:'capabilities'},services:{icon:'◆',label:'Professional services',style:'capabilities'},testimonials:{icon:'“',label:'Testimonials',style:'quote'},awards:{icon:'★',label:'Recognition',style:'credentials'},certifications:{icon:'✓',label:'Credentials',style:'credentials'},publications:{icon:'¶',label:'Published work',style:'credentials'},clients:{icon:'◎',label:'Clients & collaborators',style:'capabilities'},contact:{icon:'@',label:'Get in touch',style:'contact'},resume:{icon:'CV',label:'Résumé',style:'timeline'},custom:{icon:'+',label:'Portfolio section',style:'narrative'}
});
export function youtubeEmbedUrl(value){try{const url=new URL(text(value));const host=url.hostname.toLowerCase();let id='';if(host==='youtu.be')id=url.pathname.split('/').filter(Boolean)[0]||'';else if(host==='youtube.com'||host.endsWith('.youtube.com')){if(url.pathname==='/watch')id=url.searchParams.get('v')||'';else{const parts=url.pathname.split('/').filter(Boolean);if(['embed','shorts','live'].includes(parts[0]))id=parts[1]||''}}return /^[A-Za-z0-9_-]{6,20}$/.test(id)?`https://www.youtube-nocookie.com/embed/${id}`:''}catch{return''}}
const FIELD_TYPES=new Set(['text','longtext','number','date','daterange','location','url','youtube','email','phone','select','multiselect','tags','boolean','level','image','file']);
const fieldItems=value=>text(value).split(/[,\n]+/).map(item=>item.trim()).filter(Boolean).slice(0,20);
export function portfolioFieldMarkup(field={}){let type=FIELD_TYPES.has(field.type)?field.type:'text';const value=text(field.value);if(type==='url'&&youtubeEmbedUrl(value))type='youtube';const label=esc(field.label||'Detail');const labelSize=['small','standard','large','display'].includes(field.labelSize)?field.labelSize:'standard';const valueSize=['small','standard','large','display'].includes(field.valueSize)?field.valueSize:'standard';if(!value)return'';let content='';if(type==='youtube'){const embed=youtubeEmbedUrl(value);const href=safeUrl(value);content=embed?`<div class="portfolio-youtube"><iframe src="${esc(embed)}" title="${label}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`:href?`<a class="portfolio-field-link" href="${esc(href)}" target="_blank" rel="noopener">Open YouTube video <b aria-hidden="true">↗</b></a>`:`<span>Invalid YouTube link</span>`}else if(type==='url'||type==='file'){const href=safeUrl(value);content=href?`<a class="portfolio-field-link" href="${esc(href)}" target="_blank" rel="noopener">${type==='file'?'Open file':'Visit link'} <b aria-hidden="true">↗</b></a>`:`<span>${esc(value)}</span>`}else if(type==='email'){content=`<a class="portfolio-field-link" href="mailto:${esc(value)}">${esc(value)}</a>`}else if(type==='phone'){content=`<a class="portfolio-field-link" href="tel:${esc(value.replace(/[^+\d]/g,''))}">${esc(value)}</a>`}else if(type==='location'){content=`<span class="portfolio-field-location"><b aria-hidden="true">⌖</b> ${esc(value)}</span>`}else if(type==='date'){content=`<time datetime="${esc(value)}">${esc(value)}</time>`}else if(type==='daterange'){const[start,end]=value.split('|').map(part=>part.trim());content=`<span class="portfolio-field-range"><time datetime="${esc(start||'')}">${esc(start||'Start')}</time><b aria-hidden="true">→</b><time datetime="${esc(end||'')}">${esc(end||'Present')}</time></span>`}else if(type==='multiselect'||type==='tags'){content=`<span class="portfolio-field-tags">${fieldItems(value).map(item=>`<i>${esc(item)}</i>`).join('')}</span>`}else if(type==='boolean'){const enabled=['true','yes','1','on'].includes(value.toLowerCase());content=`<span class="portfolio-field-boolean ${enabled?'yes':'no'}"><b aria-hidden="true">${enabled?'✓':'–'}</b> ${enabled?'Yes':'No'}</span>`}else if(type==='level'){const level=Math.max(0,Math.min(100,Number(value)||0));content=`<span class="portfolio-field-level"><span>${level}%</span><i><b style="width:${level}%"></b></i></span>`}else if(type==='image'){const src=safeUrl(value);content=src?`<img class="portfolio-field-image" src="${esc(src)}" alt="${label}" loading="lazy">`:`<span>${esc(value)}</span>`}else if(type==='select'){content=`<span class="portfolio-field-choice">${esc(value)}</span>`}else{content=`<span class="${type==='longtext'?'portfolio-field-longtext':''}">${esc(value)}</span>`}return `<div class="portfolio-field portfolio-field-type-${esc(type)} field-label-size-${labelSize} field-value-size-${valueSize}"><small>${label}</small>${content}</div>`}
export function portfolioContentSection(section={}){if(section.visible===false||section.type==='hero')return'';const type=SECTION_PRESENTATIONS[section.type]?section.type:'custom';const meta=SECTION_PRESENTATIONS[type];const fields=(Array.isArray(section.fields)?section.fields:[]).filter(field=>field?.visible!==false&&text(field?.value));return `<section class="portfolio-section portfolio-section-${type} portfolio-section-${meta.style}" data-section-type="${esc(type)}"><header class="portfolio-section-heading"><h2>${esc(section.title||meta.label)}</h2></header>${text(section.content)?`<div class="portfolio-rich">${esc(section.content)}</div>`:''}${fields.length?`<div class="portfolio-field-grid">${fields.map(portfolioFieldMarkup).join('')}</div>`:''}</section>`}
function portfolioSkillMarkup(skill,ratings={}){const level=Math.max(1,Math.min(5,Number(ratings?.[skill])||3));return `<div class="portfolio-skill" data-skill-level="${level}"><span class="portfolio-skill-head"><strong>${esc(skill)}</strong><small>${level}/5</small></span><span class="portfolio-skill-bar" aria-hidden="true"><i style="width:${level*20}%"></i></span><span class="portfolio-skill-dots" aria-label="${level} out of 5">${[1,2,3,4,5].map(value=>`<i${value<=level?' class="filled"':''}></i>`).join('')}</span></div>`}
function portfolioContactMarkup(contact={}){const type=['email','phone','website','location','social','other'].includes(contact.type)?contact.type:'other';const value=text(contact.value);if(!value)return'';const label=text(contact.label)||({email:'Email',phone:'Phone',website:'Website',location:'Location',social:'Social',other:'Contact'}[type]);let content=`<span>${esc(value)}</span>`;if(type==='email')content=`<a href="mailto:${esc(value)}">${esc(value)}</a>`;else if(type==='phone')content=`<a href="tel:${esc(value.replace(/[^+\d]/g,''))}">${esc(value)}</a>`;else if(type==='website'||type==='social'){const url=safeUrl(value);content=url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(value)} ↗</a>`:`<span>${esc(value)}</span>`}return `<div class="portfolio-contact-item portfolio-contact-${esc(type)}"><small>${esc(label)}</small>${content}</div>`}
export function portfolioBusinessSection(biz = {}, posts = [], opportunities = []) {
  if (!biz || typeof biz !== 'object') return '';
  const services = Array.isArray(biz.services) ? biz.services.filter(Boolean) : [];
  const specializations = Array.isArray(biz.specializations) ? biz.specializations.filter(Boolean) : [];
  const gallery = Array.isArray(biz.gallery) ? biz.gallery.map(safeUrl).filter(Boolean) : [];
  const about = text(biz.about || biz.shortDescription);
  const postList = Array.isArray(posts) ? posts.filter(p => p && p.status !== 'draft') : [];
  const openOppList = Array.isArray(opportunities) ? opportunities.filter(o => o && o.status === 'open') : [];

  const postsMarkup = postList.length ? `
    <div class="portfolio-biz-posts-section">
      <div class="portfolio-biz-posts-head">
        <div>
          <span class="portfolio-biz-posts-kicker">STUDIO DISPATCHES</span>
          <h3>Company Updates & Announcements</h3>
        </div>
        <span class="portfolio-biz-posts-count">${postList.length} ${postList.length === 1 ? 'Update' : 'Updates'}</span>
      </div>
      <div class="portfolio-biz-posts-grid">
        ${postList.map(post => {
          const categoryLabels = {
            update: 'Studio Update',
            announcement: 'Announcement',
            project: 'New Project',
            hiring: 'We Are Hiring',
            achievement: 'Achievement'
          };
          const catLabel = categoryLabels[post.category] || 'Update';
          const postImg = safeUrl(post.imageUrl);
          let dateStr = '';
          if (post.createdAt) {
            try {
              const d = typeof post.createdAt?.toDate === 'function' ? post.createdAt.toDate() : new Date(post.createdAt);
              if (!isNaN(d)) dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            } catch {}
          }
          return `
            <article class="portfolio-biz-post-card">
              <div class="portfolio-biz-post-header">
                <span class="portfolio-biz-post-badge ${esc(post.category || 'update')}">${esc(catLabel)}</span>
                ${dateStr ? `<time class="portfolio-biz-post-time">${esc(dateStr)}</time>` : ''}
              </div>
              ${post.title ? `<h4 class="portfolio-biz-post-title">${esc(post.title)}</h4>` : ''}
              <div class="portfolio-biz-post-body">${esc(post.content || '').replace(/\\n/g, '<br>')}</div>
              ${postImg ? `<div class="portfolio-biz-post-media"><img src="${esc(postImg)}" alt="${esc(post.title || 'Studio update')}" loading="lazy"></div>` : ''}
            </article>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const oppsMarkup = openOppList.length ? `
    <div class="portfolio-biz-posts-section portfolio-biz-opps-section">
      <div class="portfolio-biz-posts-head">
        <div>
          <span class="portfolio-biz-posts-kicker">CAREERS & OPPORTUNITIES</span>
          <h3>Studio Openings & Roles</h3>
        </div>
        <span class="portfolio-biz-posts-count">${openOppList.length} ${openOppList.length === 1 ? 'Opening' : 'Openings'}</span>
      </div>
      <div class="pro-jobs-grid">
        ${openOppList.map(opp => {
          const isJob = opp.type === 'job';
          const skills = [...(opp.skills || []), ...(opp.software || [])].slice(0, 3);
          return `
            <article class="pro-job-card" data-opportunity-id="${esc(opp.id)}">
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                  <span class="pro-job-type-badge ${isJob ? 'job' : 'internship'}">${isJob ? '💼 Job Opening' : '🎓 Internship'}</span>
                  ${opp.deadline ? `<small style="font-size:0.72rem;color:var(--muted);font-weight:750;">Deadline: ${esc(opp.deadline)}</small>` : ''}
                </div>
                <h4 class="pro-job-title">${esc(opp.title)}</h4>
                <div class="pro-job-pill-row">
                  <span class="pro-job-pill">⌖ ${esc(opp.location || 'Basra')}</span>
                  ${isJob ? `<span class="pro-job-pill">${esc(opp.employmentType || 'Full-time')}</span><span class="pro-job-pill">${esc(opp.workplaceType || 'On-site')}</span>` : `<span class="pro-job-pill">⏱ ${esc(opp.duration || '3 Months')}</span><span class="pro-job-pill">${esc(opp.compensation || 'Paid')}</span>`}
                </div>
                ${opp.description ? `<p class="pro-job-desc-snippet" style="margin-top:10px;">${esc(opp.description)}</p>` : ''}
                ${skills.length ? `<div class="pro-job-chips-group">${skills.map(s => `<span class="pro-job-chip software">${esc(s)}</span>`).join('')}</div>` : ''}
              </div>
              <div class="pro-job-card-actions">
                <button class="pf-button primary btn-sm" type="button" data-view-opportunity="${esc(opp.id)}"><span>View Role Details</span></button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const galleryMarkup = gallery.length ? `
    <div class="portfolio-biz-gallery">
      <header class="portfolio-biz-gallery-head">
        <div>
          <span class="portfolio-biz-posts-kicker">STUDIO &amp; WORKSPACE</span>
          <h3>Studio &amp; Workspace Gallery</h3>
        </div>
        <small style="font-weight:800;color:var(--muted);">${gallery.length} ${gallery.length === 1 ? 'Photo' : 'Photos'}</small>
      </header>
      <div class="work-gallery portfolio-biz-gallery-grid">
        ${gallery.map((img, idx) => `
          <figure class="portfolio-biz-gallery-item">
            <button class="work-gallery-image" type="button" data-work-image="${esc(img)}" aria-label="Expand studio photo ${idx + 1}">
              <img src="${esc(img)}" alt="Studio workspace photo ${idx + 1}" loading="lazy">
              <span class="work-gallery-zoom" aria-hidden="true">⛶</span>
            </button>
          </figure>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `<section class="portfolio-section portfolio-section-business"><header class="portfolio-section-heading portfolio-biz-section-head"><div class="portfolio-biz-section-badge"><span class="pro-verified-badge">✓ Verified Business</span>${biz.industry ? `<span class="portfolio-biz-industry-pill">${esc(biz.industry)}</span>` : ''}</div><h2>Business & Practice Profile</h2></header>${about ? `<div class="portfolio-rich portfolio-biz-about">${esc(about).replace(/\\n/g, '<br>')}</div>` : ''}${services.length ? `<div class="portfolio-biz-meta-block"><h3>Services Offered</h3><div class="portfolio-tag-chips">${services.map(s => `<span class="portfolio-tag-chip">✦ ${esc(s)}</span>`).join('')}</div></div>` : ''}${specializations.length ? `<div class="portfolio-biz-meta-block"><h3>Specializations & Typologies</h3><div class="portfolio-tag-chips">${specializations.map(s => `<span class="portfolio-tag-chip secondary">${esc(s)}</span>`).join('')}</div></div>` : ''}${(biz.companySize || biz.website || biz.contactEmail || biz.contactPhone || biz.address) ? `<div class="portfolio-field-grid portfolio-biz-grid">${biz.companySize ? `<div class="portfolio-field"><small>Company Size</small><span>👥 ${esc(biz.companySize)}</span></div>` : ''}${biz.location ? `<div class="portfolio-field"><small>Headquarters</small><span>⌖ ${esc(biz.location)}</span></div>` : ''}${biz.website ? `<div class="portfolio-field"><small>Website</small><a class="portfolio-field-link" href="${esc(safeUrl(biz.website))}" target="_blank" rel="noopener">${esc(biz.website)} ↗</a></div>` : ''}${biz.contactEmail ? `<div class="portfolio-field"><small>Contact Email</small><a class="portfolio-field-link" href="mailto:${esc(biz.contactEmail)}">${esc(biz.contactEmail)}</a></div>` : ''}${biz.contactPhone ? `<div class="portfolio-field"><small>Phone</small><a class="portfolio-field-link" href="tel:${esc(biz.contactPhone)}">${esc(biz.contactPhone)}</a></div>` : ''}${biz.address ? `<div class="portfolio-field"><small>Office Address</small><span>${esc(biz.address)}</span></div>` : ''}</div>` : ''}${galleryMarkup}${postsMarkup}${oppsMarkup}</section>`;
}

export function portfolioSidebar(profile={}, businessProfile=null){const sidebar={visible:true,title:'Resume details',showSkills:true,showLocation:true,showAvailability:true,showContact:true,fields:[],...(profile.sidebar||{})};if(sidebar.visible===false&&!businessProfile)return'';let bizCardMarkup='';if(businessProfile){const bizLogo=safeUrl(businessProfile.logoUrl);const services=Array.isArray(businessProfile.services)?businessProfile.services:[];bizCardMarkup=`<section class="portfolio-side-business"><div class="portfolio-biz-card-head"><div class="portfolio-biz-logo">${bizLogo?`<img src="${esc(bizLogo)}" alt="${esc(businessProfile.name)}" loading="lazy">`:`<span>${esc(initials(businessProfile.name))}</span>`}</div><div class="portfolio-biz-info"><div class="portfolio-biz-badge-row"><span class="pro-verified-badge-mini" title="Verified Practice">✓</span><small>Verified Studio & Practice</small></div><h3>${esc(businessProfile.name)}</h3></div></div>${businessProfile.industry?`<p class="portfolio-biz-industry">🏛️ ${esc(businessProfile.industry)}</p>`:''}${businessProfile.shortDescription?`<p class="portfolio-biz-desc">${esc(businessProfile.shortDescription)}</p>`:''}${services.length?`<div class="portfolio-biz-tags">${services.slice(0,3).map(s=>`<span>${esc(s)}</span>`).join('')}</div>`:''}</section>`;}const detailFields=[];if(sidebar.showLocation!==false&&text(profile.location))detailFields.push({label:'Location',value:profile.location,type:'text'});if(sidebar.showAvailability!==false&&text(profile.availability))detailFields.push({label:'Availability',value:profile.availability,type:'text'});(Array.isArray(sidebar.fields)?sidebar.fields:[]).filter(field=>field?.visible!==false&&text(field?.value)).forEach(field=>detailFields.push({...field,label:field.label||'Detail'}));const skills=sidebar.showSkills!==false&&Array.isArray(profile.skills)?profile.skills.filter(text):[];const contacts=sidebar.showContact!==false&&Array.isArray(profile.contacts)?profile.contacts.filter(contact=>contact?.visible!==false&&text(contact?.value)):[];if(sidebar.showContact!==false&&!contacts.length&&profile.contactPublic===true&&text(profile.contactEmail))contacts.push({type:'email',label:'Email',value:profile.contactEmail,visible:true});const links=sidebar.showContact!==false&&Array.isArray(profile.links)?profile.links.filter(link=>link?.visible!==false&&safeUrl(link?.url)):[];if(!detailFields.length&&!skills.length&&!links.length&&!contacts.length&&!bizCardMarkup)return'';return `<aside class="portfolio-side" aria-label="${esc(sidebar.title||'Resume details')}">${bizCardMarkup}${detailFields.length?`<section class="portfolio-side-details"><h2>${esc(sidebar.title||'Resume details')}</h2><div class="portfolio-field-grid">${detailFields.map(portfolioFieldMarkup).join('')}</div></section>`:''}${skills.length?`<section class="portfolio-side-skills"><h2>Professional skills</h2><div class="portfolio-skills">${skills.map(skill=>portfolioSkillMarkup(skill,profile.skillRatings)).join('')}</div></section>`:''}${contacts.length||links.length?`<section class="portfolio-side-contact"><h2>Contact & links</h2><div class="portfolio-contact-list">${contacts.map(portfolioContactMarkup).join('')}${links.map(link=>`<div class="portfolio-contact-item portfolio-contact-link"><small>${esc(link.label||'Link')}</small><a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener">${esc(link.url)} ↗</a></div>`).join('')}</div></section>`:''}</aside>`}
export function portfolioCard(profile){
  const image=safeUrl(profile.avatarUrl||profile.coverUrl);
  const skills=(Array.isArray(profile.skills)?profile.skills:[]).slice(0,4);
  const projectCount=typeof profile.projectCount==='number'?profile.projectCount:0;
  return `<article class="pf-card pro-person-card" data-search="${esc([profile.displayName,profile.professionalTitle,profile.tagline,profile.location,...skills].join(' ').toLowerCase())}" data-person-id="${esc(profile.id)}"><div class="pro-person-card-top"><a class="pro-person-avatar-wrap" href="portfolio.html?id=${encodeURIComponent(profile.id)}">${image?`<img data-portfolio-image src="${esc(image)}" alt="${esc(profile.displayName)}" loading="lazy">`:`<span class="pf-card-placeholder">${esc(initials(profile.displayName))}</span>`}</a><div class="pro-person-header-meta"><div class="pro-person-kicker"><span>Portfolio</span>${profile.location?`<span class="pro-person-loc"><b aria-hidden="true">⌖</b> ${esc(profile.location)}</span>`:''}</div><h3><a href="portfolio.html?id=${encodeURIComponent(profile.id)}">${esc(profile.displayName||'Portfolio')}</a></h3><p class="pro-person-title">${esc(profile.professionalTitle||profile.tagline||'Practitioner')}</p></div></div><div class="pro-person-card-body">${profile.tagline&&profile.tagline!==profile.professionalTitle?`<p class="pro-person-bio">${esc(profile.tagline)}</p>`:''}<div class="pf-card-meta pro-person-skills">${skills.map(skill=>`<span>${esc(skill)}</span>`).join('')}</div><div class="pro-person-stats"><span class="pro-person-stat"><strong>${projectCount}</strong> ${projectCount===1?'Project':'Projects'}</span>${profile.availability?`<span class="pro-person-availability"><i class="pro-dot" aria-hidden="true"></i> ${esc(profile.availability)}</span>`:''}</div></div><div class="pro-person-card-actions"><a class="pf-button secondary btn-sm" href="portfolio.html?id=${encodeURIComponent(profile.id)}">View</a><a class="pf-button secondary btn-sm" href="/community.html?view=messages&to=${encodeURIComponent(profile.id)}" title="Direct message">Message 💬</a><button class="pf-button primary btn-sm" type="button" data-toggle-connect="${esc(profile.id)}" data-name="${esc(profile.displayName||'Professional')}"><span>+ Connect</span></button></div></article>`;
}
export function workCard(work){const image=safeUrl(work.previewUrl||work.coverUrl);const tags=(Array.isArray(work.tags)?work.tags:[]).slice(0,3);return `<article class="pf-card" data-search="${esc([work.title,work.workType,work.summary,work.ownerName,...tags].join(' ').toLowerCase())}"><a class="pf-card-cover" href="portfolio-work.html?id=${encodeURIComponent(work.id)}">${image?`<img data-portfolio-image src="${esc(image)}" alt="${esc(work.title)}" loading="lazy">`:`<span class="pf-card-placeholder">${esc(initials(work.title))}</span>`}</a><div class="pf-card-body"><div class="pf-card-kicker"><span>${esc(work.workType||'Professional work')}</span><span>${esc(work.ownerName||'')}</span></div><h3>${esc(work.title||'Untitled work')}</h3><p>${esc(work.summary||'Open this work to learn more.')}</p><div class="pf-card-meta">${tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><a class="pf-card-action" href="portfolio-work.html?id=${encodeURIComponent(work.id)}"><span>Open work</span><b>↗</b></a></div></article>`}
export function emptyState(title,description){return `<div class="pf-empty"><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`}
