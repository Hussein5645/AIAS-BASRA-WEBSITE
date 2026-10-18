import {auth,db,callFunction} from './platform-client.js';
import {onAuthStateChanged} from '/js/cloudflare-client.js';
import {doc,getDoc} from '/js/cloudflare-client.js';
import {builtInThemeIds,normaliseThemePackage,themeTokenDefaults,themeTokenStyles,themeDownload,GOOGLE_FONTS,ensureGoogleFonts,sanitizeFontFamily} from './portfolio-theme-package.js?v=20260821-full-theme-editor-v2';
import {presentationClasses,applyPresentationPalette} from './portfolio-shared.js?v=20260821-full-theme-editor-v2';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const themeNames={minimal:'Architect Minimal',editorial:'Editorial Journal',executive:'Executive Profile',studio:'Creative Studio',gallery:'Artist Gallery',resume:'Professional Résumé',technical:'Technical Blueprint',bold:'Playful Bold',monochrome:'Type Monochrome',warm:'Craft & Story'};

let user=null,themeId=params.get('id')||'',activePalette=0,dirty=false,saving=false;
let theme=normaliseThemePackage({
  name:'',description:'',baseTheme:'minimal',surfaceStyle:'cards',workLayout:'cards',density:'comfortable',fieldBackgrounds:true,
  palettes:[
    {id:'signature',name:'Signature',accent:'#741f25',bg:'#f6f1eb',surface:'#fffdfa',ink:'#211a1b',soft:'#e8c7ad'},
    {id:'night',name:'Night',accent:'#e3b95f',bg:'#171416',surface:'#242023',ink:'#fff8ef',soft:'#624b35'}
  ]
});

function status(message,error=false){
  const el=$('themeStatus');
  if(!el)return;
  el.textContent=message;
  el.classList.toggle('error',error);
}

function markDirty(){
  dirty=true;
  status('Unsaved theme changes');
}

window.addEventListener('beforeunload',event=>{
  if(!dirty)return;
  event.preventDefault();
  event.returnValue='';
});

function packageFromForm(){
  theme.name=$('themeName').value.trim();
  theme.description=$('themeDescription').value.trim();
  theme.baseTheme=$('baseTheme').value;
  theme.surfaceStyle=$('surfaceStyle').value;
  theme.workLayout=$('workLayout').value;
  theme.density=$('density').value;
  theme.fieldBackgrounds=$('fieldBackgrounds').checked;
  return normaliseThemePackage(theme);
}

function preview(){
  const pkg=packageFromForm();
  if(!theme.palettes||!theme.palettes.length){
    theme.palettes=[{id:'signature',name:'Signature',accent:'#741f25',bg:'#f6f1eb',surface:'#fffdfa',ink:'#211a1b',soft:'#e8c7ad'}];
  }
  if(activePalette>=theme.palettes.length)activePalette=0;
  const palette=theme.palettes[activePalette]||theme.palettes[0];
  const root=$('themePreview');
  if(!root)return;

  const previewProfile={
    displayName:'Hussein Mustafa',
    professionalTitle:'Architect & Designer',
    tagline:'Architect with a strong passion for design, technology, and visualization, combining creative thinking with technical problem-solving to create thoughtful, functional, and engaging spaces and experiences.',
    theme:pkg.baseTheme,
    surfaceStyle:pkg.surfaceStyle,
    workLayout:pkg.workLayout,
    density:pkg.density,
    fieldBackgrounds:pkg.fieldBackgrounds,
    palette:'custom',
    accent:palette.accent,
    themePackage:pkg,
    themePaletteId:palette.id
  };

  ensureGoogleFonts([pkg.tokens?.headingFont, pkg.tokens?.bodyFont]);

  root.className=`portfolio-page builder-preview has-portfolio-cover ${presentationClasses(previewProfile)}`;
  applyPresentationPalette(root, previewProfile);
  $('previewThemeName').textContent=theme.name||'Untitled theme';
}

function paletteSwatch(palette){
  return `<i>${['ink','accent','soft','surface'].map(key=>`<span style="background:${palette[key]||'#888'}"></span>`).join('')}</i>`;
}

function renderPaletteTabsOnly(){
  const tabs=$('paletteTabs');
  if(!tabs)return;
  const scroll=tabs.scrollLeft;
  tabs.innerHTML=theme.palettes.map((palette,index)=>`
    <button class="theme-palette-tab${index===activePalette?' active':''}" type="button" data-palette-tab="${index}">
      ${paletteSwatch(palette)}
      <b>${escapeHtml(palette.name||`Palette ${index+1}`)}</b>
    </button>
  `).join('');
  tabs.scrollLeft=scroll;
  tabs.querySelectorAll('[data-palette-tab]').forEach(button=>{
    button.onclick=()=>{
      activePalette=Number(button.dataset.paletteTab);
      renderPalettes();
      preview();
    };
  });
}

function renderPalettes(){
  if(activePalette>=theme.palettes.length)activePalette=Math.max(0,theme.palettes.length-1);
  renderPaletteTabsOnly();
  const palette=theme.palettes[activePalette]||theme.palettes[0];
  const colours=[
    ['accent','Accent colour','Primary highlights, buttons, and badges'],
    ['bg','Page background','Backdrop surface of the portfolio'],
    ['surface','Card surface','Background for cards, sections, and panels'],
    ['ink','Text colour','Headings, body copy, and icons'],
    ['soft','Soft highlight','Subtle tags, avatar background, and tints']
  ];

  $('paletteEditor').innerHTML=`
    <label>Palette name
      <input data-palette-name value="${escapeHtml(palette.name)}" maxlength="60" placeholder="E.g. Heritage Wine, Midnight Blue">
    </label>
    <div class="theme-palette-colours">
      ${colours.map(([key,label,hint])=>`
        <div class="theme-colour-input">
          <div class="theme-colour-row">
            <div>
              <span>${label}</span>
              <small style="display:block;color:var(--muted);font-size:.65rem">${hint}</small>
            </div>
            <div class="theme-colour-pickers">
              <input type="color" data-palette-colour="${key}" value="${palette[key]||'#661f22'}">
              <input type="text" data-palette-hex="${key}" value="${palette[key]||'#661f22'}" maxlength="7" spellcheck="false" placeholder="#hex">
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    ${theme.palettes.length>1?'<button class="theme-remove-palette" type="button">Remove this palette</button>':''}
  `;

  // Palette name live handler
  const nameInput=$('paletteEditor').querySelector('[data-palette-name]');
  if(nameInput){
    nameInput.oninput=event=>{
      theme.palettes[activePalette].name=event.target.value;
      renderPaletteTabsOnly();
      markDirty();
    };
  }

  // Color picker & hex text input two-way sync handlers
  $('paletteEditor').querySelectorAll('[data-palette-colour]').forEach(colorInput=>{
    const key=colorInput.dataset.paletteColour;
    const hexInput=$('paletteEditor').querySelector(`[data-palette-hex="${key}"]`);

    colorInput.oninput=event=>{
      const val=event.target.value.toLowerCase();
      theme.palettes[activePalette][key]=val;
      if(hexInput)hexInput.value=val;
      renderPaletteTabsOnly();
      preview();
      markDirty();
    };

    if(hexInput){
      hexInput.oninput=event=>{
        let val=event.target.value.trim().toLowerCase();
        if(!val.startsWith('#')&&val.length>0)val='#'+val;
        if(/^#[0-9a-f]{6}$/i.test(val)){
          theme.palettes[activePalette][key]=val;
          colorInput.value=val;
          renderPaletteTabsOnly();
          preview();
          markDirty();
        }
      };
      hexInput.onblur=event=>{
        let val=event.target.value.trim().toLowerCase();
        if(!/^#[0-9a-f]{6}$/i.test(val)){
          hexInput.value=theme.palettes[activePalette][key]||'#661f22';
        }
        renderPaletteTabsOnly();
        preview();
        markDirty();
      };
    }
  });

  // Remove palette button
  $('paletteEditor').querySelector('.theme-remove-palette')?.addEventListener('click',()=>{
    theme.palettes.splice(activePalette,1);
    activePalette=Math.max(0,activePalette-1);
    renderPalettes();
    preview();
    markDirty();
  });
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

const selectOptions=(values,current)=>values.map(([value,label])=>`<option value="${value}"${current===value?' selected':''}>${label}</option>`).join('');
const tokenSelect=(label,key,values)=>`<label>${label}<select data-theme-token="${key}">${selectOptions(values,theme.tokens[key])}</select></label>`;
const tokenRange=(label,key,min,max,step,unit='')=>`<label class="theme-range"><span>${label}<output data-token-output="${key}">${theme.tokens[key]}${unit}</output></span><input type="range" data-theme-token="${key}" min="${min}" max="${max}" step="${step}" value="${theme.tokens[key]}" data-unit="${unit}"></label>`;

function fontControlMarkup(label,key){
  const current=sanitizeFontFamily(theme.tokens[key],key==='headingFont'?'Manrope':'DM Sans');

  return `
    <div class="theme-font-picker" data-font-key="${key}">
      <label>${label}
        <div class="theme-font-input-wrap">
          <span class="theme-font-search-icon" aria-hidden="true">🔍</span>
          <input type="text" class="theme-font-input" data-font-input="${key}" value="${escapeHtml(current)}" placeholder="Type to search Google Fonts (e.g. Cinzel, Outfit, Cairo)..." autocomplete="off" spellcheck="false">
          <button type="button" class="theme-font-toggle-btn" data-font-toggle="${key}" aria-label="Browse Google Fonts">⌄</button>
        </div>
      </label>
      <div class="theme-font-dropdown" data-font-dropdown="${key}" style="display:none">
        <div class="theme-font-filter-bar">
          <button type="button" class="theme-font-filter-chip active" data-filter="all">All</button>
          <button type="button" class="theme-font-filter-chip" data-filter="sans-serif">Sans</button>
          <button type="button" class="theme-font-filter-chip" data-filter="serif">Serif</button>
          <button type="button" class="theme-font-filter-chip" data-filter="monospace">Mono</button>
          <button type="button" class="theme-font-filter-chip" data-filter="arabic">Arabic</button>
        </div>
        <div class="theme-font-results" data-font-results="${key}"></div>
      </div>
    </div>
  `;
}

function bindFontPickers(host){
  ['headingFont','bodyFont'].forEach(key=>{
    const picker=host.querySelector(`[data-font-key="${key}"]`);
    if(!picker)return;

    const input=picker.querySelector(`[data-font-input="${key}"]`);
    const toggleBtn=picker.querySelector(`[data-font-toggle="${key}"]`);
    const dropdown=picker.querySelector(`[data-font-dropdown="${key}"]`);
    const resultsContainer=picker.querySelector(`[data-font-results="${key}"]`);
    const filterChips=picker.querySelectorAll('.theme-font-filter-chip');

    let currentFilter='all';

    function renderResults(){
      const query=input.value.trim().toLowerCase();
      let list=GOOGLE_FONTS.slice();

      if(currentFilter==='arabic'){
        list=list.filter(f=>f.script==='arabic'||['Alexandria','Tajawal','Cairo','Almarai','Noto Sans Arabic','Noto Naskh Arabic','Noto Kufi Arabic','IBM Plex Sans Arabic','Readex Pro','Amiri','Scheherazade New','Reem Kufi','Changa','Lalezar','El Messiri','Marhey','Rakkas','Vazirmatn','Aref Ruqaa'].includes(f.family));
      }else if(currentFilter!=='all'){
        list=list.filter(f=>f.type===currentFilter);
      }

      if(query){
        list=list.filter(f=>f.family.toLowerCase().includes(query)||f.category.toLowerCase().includes(query));
      }

      const exactMatch=GOOGLE_FONTS.some(f=>f.family.toLowerCase()===query);
      const customItem=(query&&!exactMatch)?`
        <div class="theme-font-custom-item" data-font-choice="${escapeHtml(input.value.trim())}">
          <div>
            <span style="font-size:.74rem;color:var(--wine);font-weight:900">✨ Use Google Font</span>
            <strong style="display:block;font-size:.86rem;margin-top:2px">"${escapeHtml(input.value.trim())}"</strong>
            <small style="color:var(--muted);font-size:.65rem">Load directly from fonts.google.com</small>
          </div>
          <span style="background:var(--wine);color:#fff;padding:4px 8px;border-radius:6px;font-size:.7rem;font-weight:800">Apply</span>
        </div>
      `:'';

      if(!list.length&&!customItem){
        resultsContainer.innerHTML=`
          <div style="padding:18px 12px;text-align:center;color:var(--muted);font-size:.76rem">
            No font matching "${escapeHtml(input.value)}". Press Enter to use as custom Google Font.
          </div>
        `;
        return;
      }

      // Pre-load visible fonts so their real typeface renders immediately in the dropdown
      ensureGoogleFonts(list.slice(0,35).map(f=>f.family));

      resultsContainer.innerHTML=customItem+list.map(f=>{
        const isSelected=sanitizeFontFamily(theme.tokens[key]).toLowerCase()===f.family.toLowerCase();
        const fallback=f.type==='serif'?'serif':f.type==='monospace'?'monospace':'sans-serif';
        const fontStyle=`font-family:'${escapeHtml(f.family)}',${fallback}`;
        const isArabic=f.script==='arabic';
        return `
          <div class="theme-font-item${isSelected?' active':''}" data-font-choice="${escapeHtml(f.family)}">
            <span class="theme-font-item-name" style="${fontStyle}">
              <strong style="${fontStyle}">${escapeHtml(f.family)}</strong>
              ${isArabic?`<small style="${fontStyle};color:var(--wine);font-size:.84rem;font-weight:800;margin-left:4px">أبجدية</small>`:''}
              ${isSelected?'<b style="color:var(--wine);font-size:.8rem;margin-left:auto">✓</b>':''}
            </span>
            <span class="theme-font-item-meta">${escapeHtml(f.category)}</span>
          </div>
        `;
      }).join('');

      resultsContainer.querySelectorAll('[data-font-choice]').forEach(item=>{
        item.addEventListener('mousedown',event=>{
          event.preventDefault();
          selectFont(item.dataset.fontChoice);
        });
      });
    }

    function selectFont(fontFamily){
      const cleaned=sanitizeFontFamily(fontFamily,key==='headingFont'?'Manrope':'DM Sans');
      theme.tokens[key]=cleaned;
      input.value=cleaned;
      picker.classList.remove('is-open');
      dropdown.style.display='none';
      toggleBtn.textContent='⌄';
      ensureGoogleFonts([theme.tokens.headingFont,theme.tokens.bodyFont]);
      preview();
      markDirty();
    }

    function openDropdown(){
      picker.classList.add('is-open');
      dropdown.style.display='flex';
      toggleBtn.textContent='⌃';
      renderResults();
    }

    function closeDropdown(){
      picker.classList.remove('is-open');
      dropdown.style.display='none';
      toggleBtn.textContent='⌄';
    }

    input.addEventListener('focus',openDropdown);
    input.addEventListener('input',()=>{
      openDropdown();
      const val=input.value.trim();
      if(val){
        theme.tokens[key]=val;
        ensureGoogleFonts([theme.tokens.headingFont,theme.tokens.bodyFont]);
        preview();
        markDirty();
      }
    });

    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        const val=input.value.trim();
        if(val)selectFont(val);
        else closeDropdown();
      }else if(event.key==='Escape'){
        closeDropdown();
      }
    });

    input.addEventListener('blur',()=>{
      setTimeout(closeDropdown,200);
    });

    toggleBtn.addEventListener('click',()=>{
      if(dropdown.style.display==='none'){
        openDropdown();
        input.focus();
      }else{
        closeDropdown();
      }
    });

    filterChips.forEach(chip=>{
      chip.addEventListener('mousedown',event=>{
        event.preventDefault();
        filterChips.forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter=chip.dataset.filter;
        renderResults();
      });
    });
  });
}

function editorGroup(title,note,content,open=false){
  return `<details class="theme-editor-group"${open?' open':''}><summary><span><strong>${title}</strong><small>${note}</small></span><b>⌄</b></summary><div>${content}</div></details>`;
}

function renderAdvancedEditor(){
  let host=$('advancedThemeEditor');
  if(!host){
    host=document.createElement('section');
    host.id='advancedThemeEditor';
    host.className='theme-advanced-editor';
    document.querySelector('.theme-editor').append(host);
  }
  host.innerHTML=`
    <div class="theme-step"><b>3</b><span><strong>Full visual editor</strong><small>Search Google Fonts when typing, set spacing &amp; surfaces</small></span></div>
    ${editorGroup('Typography','Google Fonts & reading styles',`
      ${fontControlMarkup('Heading typeface','headingFont')}
      ${fontControlMarkup('Body typeface','bodyFont')}
      ${tokenRange('Heading scale','headingScale',.75,1.5,.05,'×')}
      ${tokenRange('Body scale','bodyScale',.82,1.25,.01,'×')}
    `,true)}
    ${editorGroup('Page & rhythm','Canvas width and spacing',`
      ${tokenRange('Content width','contentWidth',820,1600,20,'px')}
      ${tokenRange('Page side space','pageGutter',12,96,2,'px')}
    `)}
    ${editorGroup('Hero & portrait','Opening composition',`
      ${tokenSelect('Hero treatment','heroStyle',[['gradient','Palette gradient'],['solid','Solid dark'],['surface','Light surface'],['accent','Accent colour']])}
      ${tokenRange('Hero height','heroHeight',160,620,10,'px')}
      ${tokenSelect('Text alignment','heroAlign',[['left','Left'],['center','Center'],['right','Right']])}
      ${tokenSelect('Portrait composition','heroComposition',[['portrait-left','Portrait left'],['portrait-right','Portrait right'],['stacked','Stacked / centered']])}
      ${tokenSelect('Portrait shape','avatarShape',[['square','Square'],['rounded','Rounded'],['circle','Circle'],['portrait','Portrait ratio']])}
      ${tokenRange('Portrait size','avatarSize',64,220,4,'px')}
    `)}
    ${editorGroup('Sections & fields','Card geometry and emphasis',`
      ${tokenRange('Corner radius','sectionRadius',0,40,1,'px')}
      ${tokenRange('Border width','sectionBorder',0,4,1,'px')}
      ${tokenSelect('Card shadow','sectionShadow',[['none','None'],['soft','Soft'],['strong','Strong']])}
      ${tokenRange('Inner padding','sectionPadding',12,64,2,'px')}
      ${tokenSelect('Label style','labelCase',[['uppercase','Uppercase'],['title','Title case'],['none','As written']])}
    `)}
    ${editorGroup('Résumé sidebar','Position, width, and surface',`
      ${tokenSelect('Sidebar position','sidebarPosition',[['left','Left'],['right','Right']])}
      ${tokenRange('Sidebar width','sidebarWidth',220,460,10,'px')}
      ${tokenSelect('Sidebar treatment','sidebarStyle',[['blend','Blend with page'],['panel','Separate panel'],['accent','Accent panel']])}
    `)}
    ${editorGroup('Work cards','Project image and card form',`
      ${tokenSelect('Image proportion','workImageRatio',[['wide','Wide cinematic'],['landscape','Landscape'],['square','Square'],['portrait','Portrait']])}
      ${tokenRange('Work-card radius','workCardRadius',0,40,1,'px')}
    `)}
    <button id="resetThemeDesign" class="theme-reset-design" type="button">Reset visual controls</button>
  `;

  // Bind interactive font search pickers
  bindFontPickers(host);

  // Standard token range & select controls
  host.querySelectorAll('[data-theme-token]').forEach(control=>{
    const update=event=>{
      const key=event.target.dataset.themeToken;
      theme.tokens[key]=event.target.type==='range'?Number(event.target.value):event.target.value;
      const output=host.querySelector(`[data-token-output="${key}"]`);
      if(output)output.value=`${event.target.value}${event.target.dataset.unit||''}`;
      preview();
      markDirty();
    };
    control.addEventListener('input',update);
    control.addEventListener('change',update);
  });

  $('resetThemeDesign').onclick=()=>{
    theme.tokens={...themeTokenDefaults};
    renderAdvancedEditor();
    preview();
    markDirty();
    status('Visual controls reset');
  };
}

function populateForm(){
  $('themeName').value=theme.name;
  $('themeDescription').value=theme.description;
  $('baseTheme').value=theme.baseTheme;
  $('surfaceStyle').value=theme.surfaceStyle;
  $('workLayout').value=theme.workLayout;
  $('density').value=theme.density;
  $('fieldBackgrounds').checked=theme.fieldBackgrounds;
  renderAdvancedEditor();
  renderPalettes();
  updateActionButtons();
  preview();
}

function updateActionButtons(){
  const publishBtn=$('publishTheme');
  if(!publishBtn)return;
  const isPublished=Boolean(themeId && theme.status==='published');
  publishBtn.textContent=isPublished?'Update in Theme Store':'Share in Theme Store';
}

async function save(statusValue){
  if(saving)return;
  if(!$('themeName').value.trim()){
    status('Add a theme name before saving.',true);
    $('themeName').focus();
    return;
  }
  const wasAlreadyPublished=Boolean(themeId && theme.status==='published');
  saving=true;
  document.querySelectorAll('.theme-top-actions button').forEach(button=>button.disabled=true);
  try{
    const pkg=packageFromForm();
    const result=await callFunction('savePortfolioTheme',{themeId,themePackage:pkg,status:statusValue});
    themeId=result.themeId;
    theme.id=themeId;
    theme.status=statusValue;
    dirty=false;
    history.replaceState({},'',`portfolio-theme-builder.html?id=${encodeURIComponent(themeId)}`);
    updateActionButtons();
    if(statusValue==='published'){
      status(wasAlreadyPublished?'Theme updated in the Theme Store':'Theme shared in the Theme Store');
    }else{
      status('Theme saved privately to your account');
    }
  }catch(error){
    console.error(error);
    status(error.message||'Could not save the theme.',true);
  }finally{
    saving=false;
    document.querySelectorAll('.theme-top-actions button').forEach(button=>button.disabled=false);
  }
}

async function loadExisting(){
  if(!themeId)return;
  const snapshot=await getDoc(doc(db,'portfolioThemes',themeId));
  if(!snapshot.exists())throw new Error('Theme not found.');
  const data=snapshot.data();
  if(data.ownerId!==user.uid)throw new Error('You can view this theme in the store, but only its creator can edit it.');
  theme=normaliseThemePackage(data);
  theme.id=themeId;
  theme.status=data.status;
  updateActionButtons();
}

function bindStudioResizers(){
  const studio=$('themeStudio');
  if(!studio)return;
  const savedLeft=Number(localStorage.getItem('themeStudioLeftWidth'));
  const savedRight=Number(localStorage.getItem('themeStudioRightWidth'));
  if(Number.isFinite(savedLeft)&&savedLeft>=240&&savedLeft<=520)studio.style.setProperty('--studio-left-width',`${savedLeft}px`);
  if(Number.isFinite(savedRight)&&savedRight>=260&&savedRight<=560)studio.style.setProperty('--studio-right-width',`${savedRight}px`);

  const apply=(side,delta)=>{
    const bounds=studio.getBoundingClientRect();
    const previewMin=380;
    const available=Math.max(0,bounds.width-previewMin-24);
    const left=Number.parseFloat(getComputedStyle(studio).getPropertyValue('--studio-left-width'))||320;
    const right=Number.parseFloat(getComputedStyle(studio).getPropertyValue('--studio-right-width'))||340;
    const next=side==='left'?Math.max(240,Math.min(520,left+delta)):Math.max(260,Math.min(560,right-delta));
    const remaining=side==='left'?available-right:available-left;
    if(next>remaining)return;
    studio.style.setProperty(side==='left'?'--studio-left-width':'--studio-right-width',`${next}px`);
    localStorage.setItem(side==='left'?'themeStudioLeftWidth':'themeStudioRightWidth',String(next));
  };

  studio.querySelectorAll('[data-theme-resizer]').forEach(handle=>{
    let startX=0;
    const side=handle.dataset.themeResizer;
    const move=event=>{
      const delta=event.clientX-startX;
      startX=event.clientX;
      apply(side,delta);
    };
    const stop=()=>{
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',stop);
      document.body.classList.remove('theme-resizing');
    };
    handle.addEventListener('pointerdown',event=>{
      startX=event.clientX;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add('theme-resizing');
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',stop);
    });
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      apply(side,event.key==='ArrowLeft'?-20:20);
    });
  });
}

function bind(){
  builtInThemeIds.forEach(id=>$('baseTheme').insertAdjacentHTML('beforeend',`<option value="${id}">${themeNames[id]}</option>`));
  document.querySelectorAll('.theme-editor input,.theme-editor textarea,.theme-editor select').forEach(control=>{
    control.addEventListener('input',()=>{preview();markDirty()});
    control.addEventListener('change',()=>{preview();markDirty()});
  });

  bindStudioResizers();

  $('addPalette').onclick=()=>{
    const base=theme.palettes[activePalette]||theme.palettes[0];
    const copy={...base,id:`palette-${Date.now()}`,name:`Palette ${theme.palettes.length+1}`};
    theme.palettes.push(copy);
    activePalette=theme.palettes.length-1;
    renderPalettes();
    preview();
    markDirty();
  };

  document.querySelectorAll('[data-preview-size]').forEach(button=>button.onclick=()=>{
    document.querySelectorAll('[data-preview-size]').forEach(item=>item.classList.toggle('active',item===button));
    $('themePreviewFrame').classList.toggle('mobile',button.dataset.previewSize==='mobile');
  });

  $('saveTheme').onclick=()=>save('private');
  $('publishTheme').onclick=()=>save('published');
  $('downloadTheme').onclick=()=>{
    if(!$('themeName').value.trim()){
      status('Add a theme name before downloading.',true);
      return;
    }
    themeDownload(packageFromForm());
    status('Theme file downloaded');
  };

  populateForm();
}

onAuthStateChanged(auth,async activeUser=>{
  if(!activeUser){
    location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop()+location.search)}`);
    return;
  }
  user=activeUser;
  try{
    status('Loading Theme Studio…');
    await loadExisting();
    bind();
    dirty=false;
    status(themeId?'Your saved theme is ready':'New theme ready');
  }catch(error){
    console.error(error);
    status(error.message||'Could not load Theme Studio.',true);
  }
});
