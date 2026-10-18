const FORMAT='aias-portfolio-theme';
const VERSION=1;
export const builtInThemeIds=Object.freeze(['minimal','editorial','executive','studio','gallery','resume','technical','bold','monochrome','warm']);
export const themeSurfaceIds=Object.freeze(['cards','flat','outline','elevated']);
export const themeWorkLayoutIds=Object.freeze(['cards','posters','list']);
export const themeDensityIds=Object.freeze(['comfortable','compact','spacious']);
const HEX=/^#[0-9a-f]{6}$/i;
const clean=(value,max=120)=>String(value??'').trim().slice(0,max);
const colour=(value,fallback)=>HEX.test(String(value||''))?String(value).toLowerCase():fallback;
const slug=value=>clean(value,64).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||`palette-${Date.now()}`;
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const number=(value,min,max,fallback)=>{const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback};
export const GOOGLE_FONTS = Object.freeze([
  // Modern / Display Sans
  { family: 'Manrope', category: 'Modern display', type: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'Geometric display', type: 'sans-serif' },
  { family: 'DM Sans', category: 'Clean sans', type: 'sans-serif' },
  { family: 'Inter', category: 'Neutral neo-grotesque', type: 'sans-serif' },
  { family: 'Outfit', category: 'Modern geometric', type: 'sans-serif' },
  { family: 'Space Grotesk', category: 'Tech display', type: 'sans-serif' },
  { family: 'Syne', category: 'Creative headline', type: 'sans-serif' },
  { family: 'Montserrat', category: 'Architectural sans', type: 'sans-serif' },
  { family: 'Poppins', category: 'Geometric rounded', type: 'sans-serif' },
  { family: 'Cabinet Grotesk', category: 'Brutalist display', type: 'sans-serif' },
  { family: 'Epilogue', category: 'Editorial sans', type: 'sans-serif' },
  { family: 'Sora', category: 'Modern tech', type: 'sans-serif' },
  { family: 'Work Sans', category: 'Industrial sans', type: 'sans-serif' },
  { family: 'Rubik', category: 'Soft geometric', type: 'sans-serif' },
  { family: 'Urbanist', category: 'Contemporary sans', type: 'sans-serif' },
  { family: 'Roboto', category: 'Standard clean sans', type: 'sans-serif' },
  { family: 'Open Sans', category: 'Humanist sans', type: 'sans-serif' },
  { family: 'Lato', category: 'Warm sans', type: 'sans-serif' },
  { family: 'Oswald', category: 'Condensed display', type: 'sans-serif' },
  { family: 'Raleway', category: 'Elegant display', type: 'sans-serif' },
  { family: 'Nunito', category: 'Rounded sans', type: 'sans-serif' },
  { family: 'Figtree', category: 'Friendly geometric', type: 'sans-serif' },
  { family: 'Lexend', category: 'Readable sans', type: 'sans-serif' },
  { family: 'Red Hat Display', category: 'Publication display', type: 'sans-serif' },
  { family: 'Spline Sans', category: 'UI geometric', type: 'sans-serif' },
  { family: 'Tenor Sans', category: 'Refined sans', type: 'sans-serif' },

  // Editorial & Classical Serifs
  { family: 'Playfair Display', category: 'High-contrast serif', type: 'serif' },
  { family: 'Cinzel', category: 'Classical Roman serif', type: 'serif' },
  { family: 'Cinzel Decorative', category: 'Ornate Roman serif', type: 'serif' },
  { family: 'Cormorant Garamond', category: 'Refined serif', type: 'serif' },
  { family: 'Fraunces', category: 'Expressive warm serif', type: 'serif' },
  { family: 'Bodoni Moda', category: 'Luxury fashion serif', type: 'serif' },
  { family: 'Prata', category: 'Didone elegant serif', type: 'serif' },
  { family: 'Lora', category: 'Contemporary book serif', type: 'serif' },
  { family: 'Merriweather', category: 'Readable editorial', type: 'serif' },
  { family: 'DM Serif Display', category: 'Poster display serif', type: 'serif' },
  { family: 'EB Garamond', category: 'Classic renaissance', type: 'serif' },
  { family: 'Libre Baskerville', category: 'Traditional book serif', type: 'serif' },
  { family: 'Libre Caslon Display', category: 'Editorial caslon', type: 'serif' },
  { family: 'Marcellus', category: 'Inscriptional serif', type: 'serif' },
  { family: 'Italiana', category: 'Italian luxury serif', type: 'serif' },
  { family: 'Castoro', category: 'Scholarly serif', type: 'serif' },
  { family: 'Newsreader', category: 'Editorial news serif', type: 'serif' },
  { family: 'Spectral', category: 'Literary serif', type: 'serif' },
  { family: 'Abril Fatface', category: 'Bold poster serif', type: 'serif' },
  { family: 'Instrument Serif', category: 'Contemporary serif', type: 'serif' },

  // Technical & Monospace
  { family: 'Space Mono', category: 'Technical blueprint', type: 'monospace' },
  { family: 'JetBrains Mono', category: 'Developer mono', type: 'monospace' },
  { family: 'Fira Code', category: 'Geometric code', type: 'monospace' },
  { family: 'IBM Plex Mono', category: 'Industrial mono', type: 'monospace' },
  { family: 'Source Code Pro', category: 'Clean developer mono', type: 'monospace' },
  { family: 'Roboto Mono', category: 'Technical mono', type: 'monospace' },
  { family: 'Courier Prime', category: 'Screenplay mono', type: 'monospace' },
  { family: 'DM Mono', category: 'Simplified mono', type: 'monospace' },

  // Arabic & Bilingual (Essential for Iraqi / AIAS Basra portfolios)
  { family: 'Alexandria', category: 'Modern Arabic & Latin', type: 'sans-serif', script: 'arabic' },
  { family: 'Tajawal', category: 'Clean Arabic & Latin', type: 'sans-serif', script: 'arabic' },
  { family: 'Cairo', category: 'Contemporary Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Almarai', category: 'Corporate Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Noto Sans Arabic', category: 'Universal Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Noto Naskh Arabic', category: 'Traditional Naskh', type: 'serif', script: 'arabic' },
  { family: 'Noto Kufi Arabic', category: 'Geometric Kufi', type: 'sans-serif', script: 'arabic' },
  { family: 'IBM Plex Sans Arabic', category: 'Technical Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Readex Pro', category: 'Balanced Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Amiri', category: 'Classical Naskh Arabic', type: 'serif', script: 'arabic' },
  { family: 'Scheherazade New', category: 'Traditional Quranic Naskh', type: 'serif', script: 'arabic' },
  { family: 'Reem Kufi', category: 'Contemporary Kufic', type: 'sans-serif', script: 'arabic' },
  { family: 'Changa', category: 'Bold Kufi Display', type: 'sans-serif', script: 'arabic' },
  { family: 'Lalezar', category: 'Retro Arabic Display', type: 'sans-serif', script: 'arabic' },
  { family: 'El Messiri', category: 'Artistic Arabic Display', type: 'serif', script: 'arabic' },
  { family: 'Marhey', category: 'Playful Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Rakkas', category: 'Title Arabic Display', type: 'serif', script: 'arabic' },
  { family: 'Vazirmatn', category: 'Legible Persian & Arabic', type: 'sans-serif', script: 'arabic' },
  { family: 'Aref Ruqaa', category: 'Calligraphic Ruqaa', type: 'serif', script: 'arabic' }
]);

const legacyFontMap = {
  'manrope': 'Manrope',
  'dm-sans': 'DM Sans',
  'serif': 'Georgia',
  'mono': 'Space Mono'
};

export function sanitizeFontFamily(name, fallback = 'Manrope'){
  if (!name) return fallback;
  const lower = String(name).trim().toLowerCase();
  if (legacyFontMap[lower]) return legacyFontMap[lower];
  return clean(name, 80) || fallback;
}

export function googleFontUrl(fontFamilies = []){
  const cleanList = [...new Set(fontFamilies.map(f => String(f || '').trim()).filter(Boolean))];
  const systemFonts = new Set(['sans-serif', 'serif', 'monospace', 'georgia', 'times new roman', 'courier new', 'arial', 'helvetica']);
  const remoteFonts = cleanList.filter(f => !systemFonts.has(f.toLowerCase()));
  if (!remoteFonts.length) return '';
  const familiesParam = remoteFonts.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700;800;900`).join('&');
  return `https://fonts.googleapis.com/css2?${familiesParam}&display=swap`;
}

export function ensureGoogleFonts(fonts = [], doc = (typeof document !== 'undefined' ? document : null)){
  if (!doc || typeof doc.createElement !== 'function') return;
  const url = googleFontUrl(fonts);
  let link = doc.getElementById('aias-google-fonts-link');
  if (!url){
    if (link) link.remove();
    return;
  }
  if (!link){
    link = doc.createElement('link');
    link.id = 'aias-google-fonts-link';
    link.rel = 'stylesheet';
    doc.head.append(link);
  }
  if (link.href !== url){
    link.href = url;
  }
}

export function formatFontFamily(fontName){
  const cleanName = String(fontName || '').trim();
  if (!cleanName) return "'DM Sans', sans-serif";
  if (cleanName.toLowerCase() === 'georgia') return "Georgia, 'Times New Roman', serif";
  const found = GOOGLE_FONTS.find(f => f.family.toLowerCase() === cleanName.toLowerCase());
  const fallback = found ? (found.type === 'serif' ? 'serif' : found.type === 'monospace' ? 'monospace' : 'sans-serif') : 'sans-serif';
  return `'${cleanName}', ${fallback}`;
}

export const themeTokenDefaults=Object.freeze({headingFont:'Manrope',bodyFont:'DM Sans',headingScale:1,bodyScale:1,contentWidth:1180,pageGutter:32,heroStyle:'gradient',heroHeight:300,heroAlign:'left',heroComposition:'portrait-left',avatarShape:'rounded',avatarSize:112,sectionRadius:18,sectionBorder:1,sectionShadow:'none',sectionPadding:28,sidebarPosition:'right',sidebarWidth:330,sidebarStyle:'blend',workImageRatio:'landscape',workCardRadius:16,labelCase:'uppercase'});

export function normaliseThemeTokens(value={}){
  const t=value&&typeof value==='object'?value:{};
  return{
    headingFont:sanitizeFontFamily(t.headingFont,'Manrope'),
    bodyFont:sanitizeFontFamily(t.bodyFont,'DM Sans'),
    headingScale:number(t.headingScale,.75,1.5,1),
    bodyScale:number(t.bodyScale,.82,1.25,1),
    contentWidth:number(t.contentWidth,820,1600,1180),
    pageGutter:number(t.pageGutter,12,96,32),
    heroStyle:choice(t.heroStyle,['gradient','solid','surface','accent'],'gradient'),
    heroHeight:number(t.heroHeight,160,620,300),
    heroAlign:choice(t.heroAlign,['left','center','right'],'left'),
    heroComposition:choice(t.heroComposition,['portrait-left','portrait-right','stacked'],'portrait-left'),
    avatarShape:choice(t.avatarShape,['square','rounded','circle','portrait'],'rounded'),
    avatarSize:number(t.avatarSize,64,220,112),
    sectionRadius:number(t.sectionRadius,0,40,18),
    sectionBorder:number(t.sectionBorder,0,4,1),
    sectionShadow:choice(t.sectionShadow,['none','soft','strong'],'none'),
    sectionPadding:number(t.sectionPadding,12,64,28),
    sidebarPosition:choice(t.sidebarPosition,['left','right'],'right'),
    sidebarWidth:number(t.sidebarWidth,220,460,330),
    sidebarStyle:choice(t.sidebarStyle,['blend','panel','accent'],'blend'),
    workImageRatio:choice(t.workImageRatio,['wide','landscape','square','portrait'],'landscape'),
    workCardRadius:number(t.workCardRadius,0,40,16),
    labelCase:choice(t.labelCase,['uppercase','title','none'],'uppercase')
  };
}

export function normaliseThemePalette(value={},index=0){
  const accent=colour(value.accent,'#661f22');
  return{id:slug(value.id||value.name||`palette-${index+1}`),name:clean(value.name,60)||`Palette ${index+1}`,accent,bg:colour(value.bg,'#f7f3ed'),surface:colour(value.surface,'#fffdfa'),ink:colour(value.ink,'#211a1b'),soft:colour(value.soft,accent)};
}

export function normaliseThemePackage(value={}){
  const source=value?.themePackage&&typeof value.themePackage==='object'?value.themePackage:value;
  const palettes=(Array.isArray(source.palettes)?source.palettes:[]).slice(0,12).map(normaliseThemePalette);
  if(!palettes.length)palettes.push(normaliseThemePalette({id:'signature',name:'Signature',accent:'#661f22',bg:'#f7f3ed',surface:'#fffdfa',ink:'#211a1b',soft:'#f0daa1'}));
  return{format:FORMAT,version:VERSION,id:clean(source.id,80),name:clean(source.name,100)||'Untitled theme',description:clean(source.description,500),creatorId:clean(source.creatorId,128),creatorName:clean(source.creatorName,120),baseTheme:builtInThemeIds.includes(source.baseTheme)?source.baseTheme:'minimal',surfaceStyle:themeSurfaceIds.includes(source.surfaceStyle)?source.surfaceStyle:'cards',workLayout:themeWorkLayoutIds.includes(source.workLayout)?source.workLayout:'cards',density:themeDensityIds.includes(source.density)?source.density:'comfortable',fieldBackgrounds:source.fieldBackgrounds!==false,tokens:normaliseThemeTokens(source.tokens),palettes};
}

export function themeTokenStyles(themePackage){
  const t=normaliseThemePackage(themePackage).tokens;
  const shadows={none:'none',soft:'0 12px 32px rgba(20,15,16,.10)',strong:'0 20px 55px rgba(20,15,16,.22)'};
  const ratios={wide:'16 / 7',landscape:'4 / 3',square:'1 / 1',portrait:'3 / 4'};
  return{
    '--theme-heading-font':formatFontFamily(t.headingFont),
    '--theme-body-font':formatFontFamily(t.bodyFont),
    '--theme-heading-scale':t.headingScale,
    '--theme-body-scale':t.bodyScale,
    '--theme-content-width':`${t.contentWidth}px`,
    '--theme-page-gutter':`${t.pageGutter}px`,
    '--theme-hero-height':`${t.heroHeight}px`,
    '--theme-avatar-size':`${t.avatarSize}px`,
    '--theme-section-radius':`${t.sectionRadius}px`,
    '--theme-section-border':`${t.sectionBorder}px`,
    '--theme-section-shadow':shadows[t.sectionShadow],
    '--theme-section-padding':`${t.sectionPadding}px`,
    '--theme-sidebar-width':`${t.sidebarWidth}px`,
    '--theme-work-ratio':ratios[t.workImageRatio],
    '--theme-work-radius':`${t.workCardRadius}px`
  };
}

export function validateThemeFile(value){
  if(!value||typeof value!=='object'||value.format!==FORMAT)throw new Error('This is not an AIAS portfolio theme file.');
  if(Number(value.version)!==VERSION)throw new Error('This theme file version is not supported.');
  return normaliseThemePackage(value);
}

export function selectedThemePalette(themePackage,selectedId=''){
  const packageValue=normaliseThemePackage(themePackage);
  return packageValue.palettes.find(item=>item.id===selectedId)||packageValue.palettes[0];
}

export function applyThemePackageToProfile(profile,themePackage,paletteId=''){
  const packageValue=normaliseThemePackage(themePackage);const palette=selectedThemePalette(packageValue,paletteId);
  profile.themePackage=packageValue;profile.themePaletteId=palette.id;profile.theme=packageValue.baseTheme;profile.surfaceStyle=packageValue.surfaceStyle;profile.workLayout=packageValue.workLayout;profile.density=packageValue.density;profile.fieldBackgrounds=packageValue.fieldBackgrounds;profile.palette='custom';profile.accent=palette.accent;
  return profile;
}

export function themeDownload(themePackage){
  const cleanPackage=normaliseThemePackage(themePackage);const body=JSON.stringify({...cleanPackage,id:'',creatorId:''},null,2);const blob=new Blob([body],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${slug(cleanPackage.name)}.aias-theme.json`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function readThemeFile(file){
  if(!file)throw new Error('Choose a theme file first.');
  if(file.size>256*1024)throw new Error('Theme files must be smaller than 256 KB.');
  let value;try{value=JSON.parse(await file.text())}catch{throw new Error('The selected theme file is not valid JSON.');}
  return validateThemeFile(value);
}
