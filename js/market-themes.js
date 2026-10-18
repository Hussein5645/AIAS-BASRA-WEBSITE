import {auth,db,callFunction} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {collection,doc,deleteDoc,setDoc,getDocs,query,where} from '/js/cloudflare-client.js';
import {builtInThemeIds,normaliseThemePackage,selectedThemePalette,themeTokenStyles,themeDownload,ensureGoogleFonts} from './portfolio-theme-package.js?v=20260821-full-theme-editor-v2';

const $=id=>document.getElementById(id);
const names={minimal:'Architect Minimal',editorial:'Editorial Journal',executive:'Executive Profile',studio:'Creative Studio',gallery:'Artist Gallery',resume:'Professional Résumé',technical:'Technical Blueprint',bold:'Playful Bold',monochrome:'Type Monochrome',warm:'Craft & Story'};

let user=null;
let themes=[];
let myCreatedThemes=[];
let savedThemesMap=new Map();
let currentTab='all'; // 'all' | 'saved' | 'my'
let modalPreviewSize='desktop';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function previewStyle(theme,paletteId=''){
  const p=selectedThemePalette(theme,paletteId),tokens=themeTokenStyles(theme);
  return[
    `--theme-accent:${p.accent}`,
    `--theme-bg:${p.bg}`,
    `--theme-surface:${p.surface}`,
    `--theme-ink:${p.ink}`,
    `--theme-soft:${p.soft}`,
    ...Object.entries(tokens).map(([key,value])=>`${key}:${value}`)
  ].join(';');
}

function previewClasses(theme){
  const t=theme.tokens;
  return[
    `theme-${theme.baseTheme}`,
    `surface-${theme.surfaceStyle}`,
    `density-${theme.density}`,
    `theme-hero-${t.heroStyle}`,
    `theme-align-${t.heroAlign}`,
    `theme-compose-${t.heroComposition}`,
    `theme-avatar-${t.avatarShape}`,
    `theme-sidebar-${t.sidebarPosition}`,
    `theme-sidebar-style-${t.sidebarStyle}`,
    `theme-label-${t.labelCase}`
  ].join(' ');
}

function expandedPreview(theme,paletteId=''){
  const isLeft=theme.tokens.sidebarPosition==='left';
  return `
    <div class="theme-detail-preview-container">
      <div id="detailPreviewFrame" class="theme-detail-preview-frame ${modalPreviewSize==='mobile'?'mobile':''}">
        <div id="expandedThemePreview" class="theme-expanded-preview ${previewClasses(theme)}" style="${previewStyle(theme,paletteId)}">
          <header class="theme-preview-hero">
            <div class="theme-expanded-avatar">HM</div>
            <div class="theme-preview-hero-copy">
              <span class="theme-preview-eyebrow">ARCHITECT &amp; DESIGNER</span>
              <h2>Hussein Mustafa</h2>
              <p>Architect with a strong passion for design, technology, and visualization, creating thoughtful, functional spaces.</p>
            </div>
          </header>
          <div class="theme-expanded-layout ${isLeft?'sidebar-left':''}">
            <div class="theme-preview-main">
              <section class="theme-preview-section">
                <header class="theme-preview-section-head">
                  <small>01</small>
                  <h3>About Practice</h3>
                </header>
                <p>Multidisciplinary architecture professional exploring digital design, computational tools, and contemporary spatial experiences in Basra.</p>
              </section>
              <section class="theme-preview-section">
                <header class="theme-preview-section-head">
                  <small>02</small>
                  <h3>Selected Work</h3>
                </header>
                <div class="theme-preview-work-grid">
                  <article class="theme-preview-work-card">
                    <div class="theme-preview-work-cover">
                      <span>Featured project</span>
                    </div>
                    <div class="theme-preview-work-body">
                      <small>PUBLIC INFRASTRUCTURE · BASRA, IRAQ</small>
                      <strong>Cultural Design Center</strong>
                      <p>Research, urban planning, and computational visualization for community-led public spaces.</p>
                      <div class="theme-preview-work-tags">
                        <span>Architecture</span>
                        <span>Visualization</span>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </div>
            <aside class="theme-preview-side">
              <section class="theme-preview-section">
                <header class="theme-preview-section-head">
                  <h3>Resume Details</h3>
                </header>
                <div class="theme-preview-fields">
                  <div class="theme-preview-field">
                    <small>Location</small>
                    <span>Basra, Iraq</span>
                  </div>
                  <div class="theme-preview-field">
                    <small>Languages</small>
                    <span>Arabic · English · Python</span>
                  </div>
                </div>
              </section>
              <section class="theme-preview-section">
                <header class="theme-preview-section-head">
                  <h3>Professional Skills</h3>
                </header>
                <div class="theme-preview-skills">
                  <div class="theme-preview-skill">
                    <div class="theme-preview-skill-label">
                      <strong>Architecture</strong>
                      <small>5/5</small>
                    </div>
                    <div class="theme-preview-skill-meter"><i style="width:100%"></i></div>
                  </div>
                  <div class="theme-preview-skill">
                    <div class="theme-preview-skill-label">
                      <strong>Visualization</strong>
                      <small>4/5</small>
                    </div>
                    <div class="theme-preview-skill-meter"><i style="width:80%"></i></div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  `;
}

function card(theme){
  const isOwner=user&&theme.ownerId===user.uid;
  const isPrivate=theme.status==='private';
  const t=theme.tokens;
  const isLeft=t.sidebarPosition==='left';
  return `
    <article class="theme-card" data-theme-id="${esc(theme.id)}" tabindex="0">
      <div class="theme-card-preview ${previewClasses(theme)}" style="${previewStyle(theme)}">
        <div class="theme-mini-hero">
          <div class="theme-mini-avatar">HM</div>
          <div class="theme-mini-copy">
            <span class="theme-mini-title">Architect &amp; Designer</span>
            <strong class="theme-mini-name">Hussein Mustafa</strong>
          </div>
        </div>
        <div class="theme-mini-body ${isLeft?'sidebar-left':''}">
          <div class="theme-mini-main">
            <div class="theme-mini-section">
              <span class="theme-mini-heading">About</span>
              <p class="theme-mini-text">Architectural practice &amp; visualization.</p>
            </div>
            <div class="theme-mini-section">
              <span class="theme-mini-heading">Selected Work</span>
              <div class="theme-mini-work-card">
                <i class="theme-mini-work-cover"></i>
                <div class="theme-mini-work-info">
                  <small>Cultural Center</small>
                </div>
              </div>
            </div>
          </div>
          <div class="theme-mini-side">
            <div class="theme-mini-section">
              <span class="theme-mini-heading">Resume</span>
              <div class="theme-mini-pill">Iraq / Basra</div>
              <div class="theme-mini-skill-bar"><i></i></div>
            </div>
          </div>
        </div>
      </div>
      <div class="theme-card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <h2>${esc(theme.name)}</h2>
          ${isOwner?`<span class="theme-status-pill ${isPrivate?'private':'published'}"><i></i>${isPrivate?'Private':'Published'}</span>`:''}
        </div>
        <p>${esc(theme.description||`${names[theme.baseTheme]} portfolio theme`)}</p>
        <div class="theme-card-palettes" title="${theme.palettes.length} colour palettes">
          ${theme.palettes.slice(0,6).map(palette=>`<i style="background:${palette.accent}"></i>`).join('')}
        </div>
        <div class="theme-card-meta">
          <span>By ${esc(theme.creatorName||(isOwner?'You':'Independent creator'))}</span>
          <span>${theme.palettes.length} palette${theme.palettes.length===1?'':'s'} · ${Number(theme.saves||0)} saves</span>
        </div>
      </div>
    </article>
  `;
}

function filtered(){
  const search=$('themeSearch').value.trim().toLowerCase();
  const style=$('themeStyleFilter').value;
  let list=[];

  if(currentTab==='my'){
    list=myCreatedThemes.slice();
  }else if(currentTab==='saved'){
    const savedList=[...savedThemesMap.values()];
    list=savedList.map(item=>item.themePackage||item);
  }else{
    list=themes.slice();
  }

  list=list.filter(theme=>{
    const matchSearch=!search||`${theme.name} ${theme.description} ${theme.creatorName}`.toLowerCase().includes(search);
    const matchStyle=!style||theme.baseTheme===style;
    return matchSearch&&matchStyle;
  });

  const sort=$('themeSort').value;
  list.sort((a,b)=>{
    if(sort==='name')return a.name.localeCompare(b.name);
    if(sort==='popular')return Number(b.saves||0)-Number(a.saves||0);
    if(sort==='downloads')return Number(b.downloads||0)-Number(a.downloads||0);
    return Number(b.publishedAt?.seconds||b.updatedAt?.seconds||0)-Number(a.publishedAt?.seconds||a.updatedAt?.seconds||0);
  });

  return list;
}

function render(){
  const list=filtered();
  $('themeResults').textContent=`${list.length} theme${list.length===1?'':'s'} ${currentTab==='my'?'created by you':currentTab==='saved'?'saved to your account':'available'}`;

  if(!list.length){
    let emptyTitle='No themes match your search';
    let emptyCopy='Try another search or art direction filter.';
    if(currentTab==='saved'){
      emptyTitle='No saved themes yet';
      emptyCopy='Browse creator themes and click “Save to my account” to access them quickly.';
    }else if(currentTab==='my'){
      emptyTitle='You haven’t created any themes yet';
      emptyCopy='Design your own custom visual styles with Theme Studio and share them or keep them private.';
    }
    $('themeGrid').innerHTML=`
      <div class="theme-empty">
        <h2>${emptyTitle}</h2>
        <p>${emptyCopy}</p>
        ${currentTab==='my'?'<a class="theme-button primary" href="portfolio-theme-builder.html" style="margin-top:16px">+ Create your first theme</a>':''}
      </div>
    `;
    return;
  }

  $('themeGrid').innerHTML=list.map(card).join('');
  $('themeGrid').querySelectorAll('[data-theme-id]').forEach(item=>{
    item.onclick=()=>openTheme(item.dataset.themeId);
    item.onkeydown=event=>{if(event.key==='Enter')openTheme(item.dataset.themeId);};
  });
}

function paletteList(theme){
  return theme.palettes.map(p=>`
    <div class="theme-detail-palette">
      <i>${['ink','accent','soft','surface'].map(k=>`<span style="background:${p[k]||'#888'}"></span>`).join('')}</i>
      <b>${esc(p.name)}</b>
    </div>
  `).join('');
}

function openTheme(id){
  const allList=[...themes,...myCreatedThemes,[...savedThemesMap.values()].map(v=>v.themePackage||v)];
  const theme=allList.find(item=>item.id===id);
  if(!theme)return;

  ensureGoogleFonts([theme.tokens?.headingFont, theme.tokens?.bodyFont]);

  const isOwner=user&&theme.ownerId===user.uid;
  const isSaved=savedThemesMap.has(id);
  const isPublished=theme.status==='published';

  $('themeDetailContent').innerHTML=`
    <div class="theme-detail-heading">
      <div class="theme-detail-heading-main">
        <span>${esc(names[theme.baseTheme]||'PORTFOLIO THEME')}</span>
        <h2>${esc(theme.name)}</h2>
        <p>By ${esc(theme.creatorName||(isOwner?'You':'Independent creator'))}</p>
      </div>
      ${isOwner?`
        <span class="theme-status-pill ${isPublished?'published':'private'}">
          <i></i>${isPublished?'Shared in Store':'Private theme'}
        </span>
      `:''}
    </div>
    <div class="theme-detail-preview-toolbar">
      <div class="theme-detail-device-switch">
        <button class="${modalPreviewSize==='desktop'?'active':''}" type="button" data-modal-preview="desktop">Desktop</button>
        <button class="${modalPreviewSize==='mobile'?'active':''}" type="button" data-modal-preview="mobile">Mobile</button>
      </div>
      <span style="font-size:.74rem;color:#bcaeac;font-weight:700">Interactive live preview</span>
    </div>
    ${expandedPreview(theme)}
    <div class="theme-detail-body">
      <p>${esc(theme.description||'A community-made theme for AIAS Basra Portfolios.')}</p>
      <div class="theme-detail-palette-list">
        ${paletteList(theme)}
      </div>
      <div class="theme-detail-actions">
        <select id="detailPalette" aria-label="Preview colour palette">
          ${theme.palettes.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} palette</option>`).join('')}
        </select>
        <button id="applyTheme" class="theme-button primary" type="button">Use in Portfolio Builder</button>
        <button id="saveThemeAccount" class="theme-button" type="button">${isSaved?'Saved to account':'Save to my account'}</button>
        <button id="downloadThemeFile" class="theme-button" type="button">Download theme file</button>
        ${isOwner?`
          <a class="theme-button" href="portfolio-theme-builder.html?id=${encodeURIComponent(id)}">Edit in Theme Studio</a>
          <button id="toggleThemeVisibility" class="theme-button" type="button">${isPublished?'Make Private':'Share in Theme Store'}</button>
          <button id="deleteThemeBtn" class="theme-button danger" type="button" style="color:#c92a2a;border-color:#ffc9c9">Delete theme</button>
        `:''}
      </div>
    </div>
  `;

  $('themeDetail').showModal();

  // Device switcher
  $('themeDetail').querySelectorAll('[data-modal-preview]').forEach(btn=>{
    btn.onclick=()=>{
      modalPreviewSize=btn.dataset.modalPreview;
      $('themeDetail').querySelectorAll('[data-modal-preview]').forEach(b=>b.classList.toggle('active',b===btn));
      $('detailPreviewFrame')?.classList.toggle('mobile',modalPreviewSize==='mobile');
    };
  });

  // Palette selector
  $('detailPalette').onchange=event=>{
    const preview=$('expandedThemePreview');
    if(preview){
      preview.className=`theme-expanded-preview ${previewClasses(theme)}`;
      preview.style.cssText=previewStyle(theme,event.target.value);
    }
  };

  // Apply theme in portfolio builder
  $('applyTheme').onclick=async()=>{
    if(!user){
      location.href=`login.html?next=${encodeURIComponent(`market-themes.html?theme=${id}`)}`;
      return;
    }
    if(!savedThemesMap.has(id))await saveTheme(theme);
    sessionStorage.setItem('portfolioThemeToApply',JSON.stringify({
      themePackage:theme,
      paletteId:$('detailPalette').value
    }));
    location.href='portfolio-builder.html?applySavedTheme=1';
  };

  // Save to account
  $('saveThemeAccount').onclick=()=>saveTheme(theme);

  // Download theme file
  $('downloadThemeFile').onclick=()=>{
    themeDownload(theme);
    callFunction('recordPortfolioThemeDownload',{themeId:id}).catch(()=>{});
    theme.downloads=Number(theme.downloads||0)+1;
  };

  // Creator visibility toggle
  $('toggleThemeVisibility')?.addEventListener('click',async()=>{
    const btn=$('toggleThemeVisibility');
    btn.disabled=true;
    btn.textContent='Updating…';
    const nextStatus=isPublished?'private':'published';
    try{
      await callFunction('setPortfolioThemeStatus',{themeId:id,status:nextStatus});
      theme.status=nextStatus;
      $('themeDetail').close();
      await load();
    }catch(error){
      console.error(error);
      alert(error.message||'Could not update theme status.');
      btn.disabled=false;
      btn.textContent=isPublished?'Make Private':'Share in Theme Store';
    }
  });

  // Creator delete theme
  $('deleteThemeBtn')?.addEventListener('click',async()=>{
    if(!confirm(`Are you sure you want to delete the theme “${theme.name}”? This cannot be undone.`))return;
    const btn=$('deleteThemeBtn');
    btn.disabled=true;
    btn.textContent='Deleting…';
    try{
      try{
        await callFunction('deletePortfolioTheme',{themeId:id});
      }catch(callErr){
        await deleteDoc(doc(db,'portfolioThemes',id));
        await deleteDoc(doc(db,'users',user.uid,'savedPortfolioThemes',id)).catch(()=>{});
      }
      $('themeDetail').close();
      await load();
    }catch(error){
      console.error(error);
      alert(error.message||'Could not delete theme.');
      btn.disabled=false;
      btn.textContent='Delete theme';
    }
  });
}

async function saveTheme(theme){
  if(!user){
    location.href=`login.html?next=${encodeURIComponent(`market-themes.html?theme=${theme.id}`)}`;
    return;
  }
  const button=$('saveThemeAccount');
  if(button){
    button.disabled=true;
    button.textContent='Saving…';
  }
  try{
    try{
      await callFunction('savePortfolioThemeToAccount',{themeId:theme.id});
    }catch(callErr){
      const packageData=normaliseThemePackage(theme);
      await setDoc(doc(db,'users',user.uid,'savedPortfolioThemes',theme.id),{
        themeId:theme.id,
        themePackage:packageData,
        source:'market'
      },{merge:true});
    }
    savedThemesMap.set(theme.id,{themePackage:theme});
    theme.saves=Number(theme.saves||0)+1;
    if(button){
      button.textContent='Saved to account';
      button.disabled=false;
    }
    render();
  }catch(error){
    console.error(error);
    alert(error.message||'Could not save theme to account.');
    if(button){
      button.textContent='Save to my account';
      button.disabled=false;
    }
  }
}

async function load(){
  try{
    const snapshot=await getDocs(query(collection(db,'portfolioThemes'),where('status','==','published')));
    themes=snapshot.docs.map(item=>({...normaliseThemePackage(item.data()),...item.data(),id:item.id}));

    if(user){
      // Load saved themes
      const saved=await getDocs(collection(db,'users',user.uid,'savedPortfolioThemes'));
      savedThemesMap=new Map(saved.docs.map(item=>[item.id,item.data()]));

      // Load user's created themes (both published and private)
      const myThemesSnap=await getDocs(query(collection(db,'portfolioThemes'),where('ownerId','==',user.uid)));
      myCreatedThemes=myThemesSnap.docs.map(item=>({...normaliseThemePackage(item.data()),...item.data(),id:item.id}));
    }else{
      savedThemesMap=new Map();
      myCreatedThemes=[];
    }

    render();

    const requested=new URLSearchParams(location.search).get('theme');
    if(requested)openTheme(requested);
  }catch(error){
    console.error(error);
    $('themeResults').textContent='Theme Store unavailable';
    $('themeGrid').innerHTML=`<div class="theme-empty"><h2>Could not load themes</h2><p>${esc(error.message)}</p></div>`;
  }
}

function setTab(tab){
  if((tab==='saved'||tab==='my')&&!user){
    location.href=`login.html?next=${encodeURIComponent('market-themes.html?tab='+tab)}`;
    return;
  }
  currentTab=tab;
  $('tabAllThemes').classList.toggle('active',tab==='all');
  $('tabSavedThemes').classList.toggle('active',tab==='saved');
  $('tabMyThemes').classList.toggle('active',tab==='my');
  render();
}

$('tabAllThemes').onclick=()=>setTab('all');
$('tabSavedThemes').onclick=()=>setTab('saved');
$('tabMyThemes').onclick=()=>setTab('my');
$('myThemesNav')?.addEventListener('click',event=>{
  event.preventDefault();
  setTab('my');
});

builtInThemeIds.forEach(id=>$('themeStyleFilter').insertAdjacentHTML('beforeend',`<option value="${id}">${names[id]}</option>`));
['themeSearch','themeStyleFilter','themeSort'].forEach(id=>$(id).addEventListener(id==='themeSearch'?'input':'change',render));

$('themeDetail').querySelector('.theme-dialog-close').onclick=()=>$('themeDetail').close();
$('themeDetail').onclick=event=>{if(event.target===$('themeDetail'))$('themeDetail').close();};

// Check query param for manage/myThemes tab
const initialParams=new URLSearchParams(location.search);
if(initialParams.has('manage')||initialParams.has('myThemes')||initialParams.get('tab')==='my'){
  currentTab='my';
  $('tabAllThemes').classList.remove('active');
  $('tabMyThemes').classList.add('active');
}else if(initialParams.get('tab')==='saved'){
  currentTab='saved';
  $('tabAllThemes').classList.remove('active');
  $('tabSavedThemes').classList.add('active');
}

onAuthStateChanged(auth,activeUser=>{
  user=activeUser;
  load();
});
