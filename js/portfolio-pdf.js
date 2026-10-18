import {auth,db} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {collection,doc,getDoc,getDocs,query,where} from '/js/cloudflare-client.js';
import {esc,safeUrl,initials,applyPresentationPalette,presentationClasses} from './portfolio-shared.js?v=20260821-full-theme-editor-v1';

const root=document.getElementById('pdfDocument');
const status=document.getElementById('pdfStatus');
const printButton=document.getElementById('printPdf');
const portfolioId=new URLSearchParams(location.search).get('id')||'';
const autoPrint=new URLSearchParams(location.search).get('print')==='1';
const viewerReady=()=>new Promise(resolve=>{let stop=()=>{};stop=onAuthStateChanged(auth,user=>{stop();resolve(user)},()=>resolve(null))});
const chunk=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,index*size+size));
const clean=value=>String(value??'').trim();
const displayLink=link=>clean(link?.label)||'Professional link';

function fieldValue(field={}){const value=clean(field.value);if(!value)return'';if(field.type==='boolean'){const yes=['true','yes','1','on'].includes(value.toLowerCase());return `<span class="pdf-field-boolean ${yes?'yes':'no'}">${yes?'✓ Yes':'– No'}</span>`}if(field.type==='daterange'){const[start,end]=value.split('|');return `<span class="pdf-field-range"><time>${esc(clean(start)||'Start')}</time><b>→</b><time>${esc(clean(end)||'Present')}</time></span>`}if(field.type==='multiselect'||field.type==='tags'){const items=value.split(',').map(item=>item.trim()).filter(Boolean);return `<span class="pdf-field-tags">${items.map(item=>`<i>${esc(item)}</i>`).join('')}</span>`}if(field.type==='level'){const level=Math.max(0,Math.min(100,Number(value)||0));return `<span class="pdf-field-level"><span>${level}%</span><i><b style="width:${level}%"></b></i></span>`}if(field.type==='youtube'){const url=safeUrl(value);return url?`<a href="${esc(url)}">Watch YouTube video ↗</a>`:esc(value)}if(field.type==='url'||field.type==='file'){const url=safeUrl(value);return url?`<a href="${esc(url)}">${esc(field.label||'Open link')} ↗</a>`:esc(value)}if(field.type==='email')return `<a href="mailto:${esc(value)}">${esc(value)}</a>`;if(field.type==='phone')return `<a href="tel:${esc(value.replace(/[^+\d]/g,''))}">${esc(value)}</a>`;if(field.type==='image')return'';return `<span class="${field.type==='longtext'?'pdf-field-longtext':''}">${esc(value)}</span>`}
function fieldMarkup(field={}){const value=fieldValue(field);const type=clean(field.type)||'text';const labelSize=['small','standard','large','display'].includes(field.labelSize)?field.labelSize:'standard';const valueSize=['small','standard','large','display'].includes(field.valueSize)?field.valueSize:'standard';return value?`<div class="pdf-field pdf-field-type-${esc(type)} field-label-size-${labelSize} field-value-size-${valueSize}"><small>${esc(field.label||'Detail')}</small><div>${value}</div></div>`:''}
function sectionMarkup(section={}){const fields=(section.fields||[]).filter(field=>field?.visible!==false&&clean(field?.value)&&field?.type!=='image');return `<section class="pdf-section"><h2>${esc(section.title||'Professional section')}</h2>${clean(section.content)?`<p class="pdf-rich">${esc(section.content)}</p>`:''}${fields.length?`<div class="pdf-fields">${fields.map(fieldMarkup).join('')}</div>`:''}</section>`}
function ratingMarkup(skill,ratings={}){const level=Math.max(1,Math.min(5,Number(ratings?.[skill])||3));return `<div class="pdf-skill"><span><strong>${esc(skill)}</strong><small>${level}/5</small></span><i>${[1,2,3,4,5].map(value=>`<b${value<=level?' class="active"':''}></b>`).join('')}</i></div>`}
function contactMarkup(item={}){const value=clean(item.value);if(!value||item.visible===false)return'';const label=clean(item.label)||item.type||'Contact';let content=esc(value);if(item.type==='email')content=`<a href="mailto:${esc(value)}">${esc(value)}</a>`;else if(item.type==='phone')content=`<a href="tel:${esc(value.replace(/[^+\d]/g,''))}">${esc(value)}</a>`;else if(['website','social'].includes(item.type)){const url=safeUrl(value);content=url?`<a href="${esc(url)}">${esc(label)} ↗</a>`:esc(value)}return `<div class="pdf-contact"><small>${esc(label)}</small><div>${content}</div></div>`}
function sidebarMarkup(portfolio={}){const sidebar=portfolio.sidebar||{};const details=[];if(sidebar.showLocation!==false&&clean(portfolio.location))details.push({label:'Location',value:portfolio.location});if(sidebar.showAvailability!==false&&clean(portfolio.availability))details.push({label:'Availability',value:portfolio.availability});(sidebar.fields||[]).filter(field=>field?.visible!==false).forEach(field=>details.push(field));const contacts=(portfolio.contacts||[]).filter(contact=>contact?.visible!==false);const links=(portfolio.links||[]).filter(link=>link?.visible!==false&&safeUrl(link?.url));return `<aside class="pdf-sidebar">${details.length?`<section><h2>${esc(sidebar.title||'Resume details')}</h2><div class="pdf-sidebar-list">${details.map(fieldMarkup).join('')}</div></section>`:''}${sidebar.showSkills!==false&&(portfolio.skills||[]).length?`<section><h2>Professional skills</h2><div class="pdf-skill-list">${portfolio.skills.map(skill=>ratingMarkup(skill,portfolio.skillRatings)).join('')}</div></section>`:''}${sidebar.showContact!==false&&(contacts.length||links.length)?`<section><h2>Contact & links</h2><div class="pdf-sidebar-list">${contacts.map(contactMarkup).join('')}${links.map(link=>`<div class="pdf-contact"><small>${esc(displayLink(link))}</small><div><a href="${esc(safeUrl(link.url))}">${esc(displayLink(link))} ↗</a></div></div>`).join('')}</div></section>`:''}</aside>`}
function workMarkup(work={}){const image=safeUrl(work.coverUrl);const tags=(work.tags||[]).slice(0,4);return `<article class="pdf-work-card">${image?`<img src="${esc(image)}" alt="">`:`<div class="pdf-work-placeholder">${esc(initials(work.title))}</div>`}<div class="pdf-work-copy"><div class="pdf-work-meta"><span>${esc(work.workType||'Professional work')}</span><span>${esc(work.ownerName||'')}</span></div><h2>${esc(work.title||'Untitled work')}</h2><p>${esc(work.summary||'Open the published project page for the complete case study.')}</p>${tags.length?`<div class="pdf-tags">${tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>`:''}<a href="${esc(new URL(`portfolio-work.html?id=${encodeURIComponent(work.id)}`,location.origin).href)}">View complete project ↗</a></div></article>`}
function pageShell(content,label='Professional portfolio'){return `<section class="pdf-sheet"><div class="pdf-page-content">${content}</div><footer><span>${esc(label)}</span><span data-page-number></span></footer></section>`}
function buildDocument(portfolio,works){const avatar=safeUrl(portfolio.avatarUrl);const allSections=portfolio.sections||[];const sections=allSections.filter(section=>section?.visible!==false&&!['hero','work'].includes(section.type));const workSections=allSections.filter(section=>section?.visible!==false&&section.type==='work');const includesEveryWork=workSections.some(section=>!Array.isArray(section.workIds));const selectedWorkIds=new Set(workSections.flatMap(section=>Array.isArray(section.workIds)?section.workIds:[]));const selectedWorks=workSections.length?works.filter(work=>includesEveryWork||selectedWorkIds.has(work.id)):[];const overview=sections.slice(0,3);const continuation=chunk(sections.slice(3),3);const workPages=chunk(selectedWorks,2);const header=`<header class="pdf-profile-header"><div class="pdf-avatar">${avatar?`<img src="${esc(avatar)}" alt="">`:esc(initials(portfolio.displayName))}</div><div><p>${esc(portfolio.professionalTitle||'Professional portfolio')}</p><h1>${esc(portfolio.displayName||'Portfolio')}</h1>${clean(portfolio.tagline)?`<div>${esc(portfolio.tagline)}</div>`:''}</div></header>`;const pages=[pageShell(`${header}<div class="pdf-overview"><div>${sidebarMarkup(portfolio)}</div><main>${overview.map(sectionMarkup).join('')||'<section class="pdf-section"><h2>Profile</h2><p class="pdf-rich">Published professional portfolio.</p></section>'}</main></div>`,portfolio.displayName)];continuation.forEach(group=>pages.push(pageShell(`<header class="pdf-continuation-header"><span>${esc(portfolio.professionalTitle||'Portfolio')}</span><h1>${esc(portfolio.displayName)}</h1></header><main class="pdf-continuation">${group.map(sectionMarkup).join('')}</main>`,portfolio.displayName)));workPages.forEach((group,index)=>pages.push(pageShell(`<header class="pdf-continuation-header"><span>Selected professional work</span><h1>${index?'More projects':'Projects'}</h1></header><div class="pdf-work-list">${group.map(workMarkup).join('')}</div>`,portfolio.displayName)));root.innerHTML=pages.join('');const sheets=[...root.querySelectorAll('.pdf-sheet')];sheets.forEach((sheet,index)=>{sheet.querySelector('[data-page-number]').textContent=`${index+1} / ${sheets.length}`});}
async function waitForImages(){const images=[...root.querySelectorAll('img')];await Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true})})));await document.fonts?.ready}
function printPortfolio(){document.title=`${root.dataset.portfolioName||'Portfolio'} — Professional Portfolio`;window.print()}

try{
  const viewer=await viewerReady();
  if(!portfolioId)throw new Error('not-found');
  const portfolioSnapshot=await getDoc(doc(db,'portfolioProfiles',portfolioId));
  if(!portfolioSnapshot.exists()||portfolioSnapshot.data().status!=='published')throw new Error('publish-required');
  const portfolio={id:portfolioSnapshot.id,...portfolioSnapshot.data()};
  const isOwner=Boolean(viewer?.uid&&viewer.uid===portfolioId);
  const isVisitor=!viewer||viewer.uid!==portfolioId;
  const worksSnapshot=await getDocs(query(collection(db,'portfolioWorks'),where('status','==','published'),where('moderationStatus','==','clear')));
  const works=worksSnapshot.docs.map(item=>({id:item.id,...item.data()})).filter(work=>work.ownerId===portfolioId);
  applyPresentationPalette(document.documentElement,portfolio);
  root.className=`pdf-document ${presentationClasses(portfolio)}`;
  root.dataset.portfolioName=portfolio.displayName||'Portfolio';
  document.body.classList.toggle('portfolio-avatar-hidden',portfolio.avatarVisible===false);
  buildDocument(portfolio,works);
  await waitForImages();

  const backLink=document.querySelector('.pdf-toolbar a');
  if(backLink){
    if(isOwner){
      backLink.href='portfolio-builder.html';
      backLink.textContent='← Back to builder';
    }else{
      backLink.href=`portfolio.html?id=${encodeURIComponent(portfolioId)}`;
      backLink.textContent='← Back to portfolio';
    }
  }

  if(isOwner){
    status.textContent='Your published PDF layout is ready.';
    printButton.hidden=false;
    printButton.disabled=false;
    printButton.addEventListener('click',printPortfolio);
    if(autoPrint)setTimeout(printPortfolio,350);
  }else{
    status.textContent='PDF preview mode (view-only)';
    printButton.hidden=true;
    printButton.disabled=true;
    window.addEventListener('beforeprint',event=>{event.preventDefault();alert('PDF export is available to the portfolio owner.')});
  }
}catch(error){
  console.error(error);
  const message=error.message==='publish-required'?'This portfolio must be published before its PDF layout can be viewed.':error.message==='owner-only'?'Only the signed-in portfolio owner can export this PDF.':'The PDF is currently unavailable. Please return to the portfolio and try again.';
  status.textContent=message;
  root.innerHTML=`<section class="pdf-error"><h1>PDF unavailable</h1><p>${esc(message)}</p><a href="portfolios.html">Explore published portfolios</a></section>`;
}
