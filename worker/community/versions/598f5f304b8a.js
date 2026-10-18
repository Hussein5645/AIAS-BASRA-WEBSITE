import {initializeApp,getFirestore,FieldValue,Timestamp,getStorage,onCall,onRequest,onDocumentCreated,onDocumentWritten,HttpsError,logger,context} from '../../platform.js';
export const functions = {};
import assistant from '../assistants/de81f31c1374.js';
const {
  processCommentMentionIfPresent,
  processAiSpaceMessage,
  processSpaceChatAiReply,
  generateAiCommunityReply
} = assistant;









initializeApp();

const db = getFirestore();
const SARAY_ORIGIN = 'https://aiasbsr.com';
const CONTENT_COLLECTIONS = {post:'communityPosts', space:'communitySpaces'};
const MODERATION_ACTIONS = new Set(['flag', 'clear_flag', 'warn', 'archive', 'restore']);
const POST_TYPES = new Set(['text', 'question']);
const SHARE_FALLBACK_IMAGE = SARAY_ORIGIN + '/static/images/branding/LOGO.png';

function shareText(value, max = 220) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeMeta(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

async function publicStorageImage(path) { return path ? context().origin + '/media/' + encodeURIComponent(String(path)) : ''; }

async function revokeFirebaseDownloadToken(file, metadata = null) {
  const current = metadata || (await file.getMetadata())[0];
  const customMetadata = {...(current.metadata || {}), firebaseStorageDownloadTokens:''};
  await file.setMetadata({metadata:customMetadata});
}

async function revokeDownloadTokensUnderPrefix(prefix) {
  const [files] = await getStorage().bucket().getFiles({prefix});
  for (let offset = 0; offset < files.length; offset += 50) {
    await Promise.all(files.slice(offset, offset + 50).filter(file => !file.name.endsWith('/')).map(file => revokeFirebaseDownloadToken(file).catch(error => logger.warn('Media token revocation failed', {path:file.name, error:error.message}))));
  }
  return files.filter(file => !file.name.endsWith('/')).length;
}

function shareHtml({title, description, image, shareUrl, destination}) {
  const safeTitle = escapeMeta(title);
  const safeDescription = escapeMeta(description);
  const safeImage = escapeMeta(image || SHARE_FALLBACK_IMAGE);
  const safeShareUrl = escapeMeta(shareUrl);
  const safeDestination = escapeMeta(destination);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title><meta name="description" content="${safeDescription}"><meta name="robots" content="noindex,follow">
<meta property="og:type" content="article"><meta property="og:site_name" content="AIAS Basra Community"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:image" content="${safeImage}"><meta property="og:url" content="${safeShareUrl}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}">
<link rel="canonical" href="${safeShareUrl}"><meta http-equiv="refresh" content="0;url=${safeDestination}">
</head><body><p>Opening <a href="${safeDestination}">${safeTitle}</a>…</p><script>location.replace(${JSON.stringify(destination)});<\/script></body></html>`;
}

function cleanReason(value, required = true) {
  const reason = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (required && reason.length < 3) throw new HttpsError('invalid-argument', 'A moderation reason of at least 3 characters is required.');
  return reason;
}

function cleanId(value, label = 'content') {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new HttpsError('invalid-argument', `Invalid ${label} identifier.`);
  return id;
}

function cleanText(value, max, label, required = true) {
  const text = String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  if (required && !text) throw new HttpsError('invalid-argument', `${label} is required.`);
  return text;
}

function cleanUrl(value, label, required = false) {
  const text = String(value || '').trim();
  if (!text) {
    if (required) throw new HttpsError('invalid-argument', `${label} is required.`);
    return '';
  }
  if (!/^(https?:\/\/|gs:\/\/|data:image\/|\/)/i.test(text)) {
    return '';
  }
  return text.slice(0, 2048);
}

function safeMarketImageUrl(value) {
  const candidate = String(value || '').trim().slice(0, 2000);
  if (!candidate) return '';
  try {
    const url = new URL(candidate, SARAY_ORIGIN);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

async function resolveMarketAttachment(kindValue, idValue, postType) {
  const requestedKind = String(kindValue || '').trim();
  const requestedId = String(idValue || '').trim();
  if (!requestedKind && !requestedId) return null;
  if (!requestedKind || !requestedId) throw new HttpsError('invalid-argument', 'Choose a complete market item or store to share.');
  if (postType !== 'text') throw new HttpsError('invalid-argument', 'Market shares must be published as thought posts.');
  if (!['item', 'store'].includes(requestedKind)) throw new HttpsError('invalid-argument', 'Choose a valid market share type.');
  const id = cleanId(requestedId, requestedKind === 'item' ? 'market item' : 'market store');

  if (requestedKind === 'store') {
    const storeSnapshot = await db.collection('marketStores').doc(id).get();
    const store = storeSnapshot.data();
    if (!storeSnapshot.exists || store?.status !== 'active') throw new HttpsError('not-found', 'This market store is unavailable.');
    return {
      kind:'store', id, storeId:id, itemId:'',
      title:shareText(store.name, 120) || 'AIAS Market store',
      description:shareText(store.bio, 500),
      imageUrl:safeMarketImageUrl(store.bannerImage) || safeMarketImageUrl(store.profileImage),
      storeName:shareText(store.name, 120) || 'AIAS Market store',
      tag:'', itemType:'', quantity:'', delivery:'', verified:store.verified === true,
      url:`${SARAY_ORIGIN}/store.html?id=${encodeURIComponent(id)}`
    };
  }

  const itemSnapshot = await db.collection('marketItems').doc(id).get();
  const item = itemSnapshot.data();
  if (!itemSnapshot.exists || item?.status !== 'active') throw new HttpsError('not-found', 'This market item is unavailable.');
  const storeId = cleanId(item.storeId, 'market store');
  const storeSnapshot = await db.collection('marketStores').doc(storeId).get();
  const store = storeSnapshot.data();
  if (!storeSnapshot.exists || store?.status !== 'active') throw new HttpsError('not-found', 'The store for this market item is unavailable.');
  const quantity = item.quantity === undefined || item.quantity === null || item.quantity === '' ? 'Unlimited' : String(item.quantity).slice(0, 40);
  return {
    kind:'item', id, storeId, itemId:id,
    title:shareText(item.name, 120) || 'AIAS Market item',
    description:shareText(item.description, 500),
    imageUrl:safeMarketImageUrl(item.imageUrl),
    storeName:shareText(store.name || item.storeName, 120) || 'AIAS Market store',
    tag:shareText(item.tag, 80), itemType:shareText(item.type, 80), quantity,
    delivery:shareText(item.deliverTime, 80), verified:store.verified === true,
    url:`${SARAY_ORIGIN}/market.html?item=${encodeURIComponent(id)}`
  };
}

function cleanPortfolioUrl(value) {
  const candidate = String(value || '').trim().slice(0, 2000);
  if (!candidate) return '';
  try {
    const url = new URL(candidate, SARAY_ORIGIN);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function cleanPortfolioList(value, maxItems = 24, maxLength = 80) {
  return (Array.isArray(value) ? value : [])
    .map(item => cleanText(item, maxLength, 'Portfolio value', false))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanPortfolioSkillRatings(value, skills) {
  const ratings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(skills.map(skill => [skill, Math.max(1, Math.min(5, Math.round(Number(ratings[skill]) || 3)))]));
}

function cleanPortfolioFields(value) {
  return (Array.isArray(value) ? value : []).slice(0, 40).map((field, index) => ({
    id:cleanText(field?.id || `field-${index + 1}`, 64, 'Field identifier'),
    label:cleanText(field?.label, 80, 'Field label'),
    value:cleanText(field?.value, 1200, 'Field value', false),
    type:['text','longtext','number','date','daterange','location','url','youtube','email','phone','select','multiselect','tags','boolean','level','image','file'].includes(field?.type) ? field.type : 'text',
    labelSize:['small','standard','large','display'].includes(field?.labelSize) ? field.labelSize : 'standard',
    valueSize:['small','standard','large','display'].includes(field?.valueSize) ? field.valueSize : 'standard',
    visible:field?.visible !== false
  }));
}

function cleanPortfolioSections(value) {
  const allowed = new Set(['hero','about','gallery','work','experience','education','skills','services','testimonials','awards','certifications','publications','clients','contact','resume','custom']);
  return (Array.isArray(value) ? value : []).slice(0, 24).map((section, index) => ({
    id:cleanText(section?.id || `section-${index + 1}`, 64, 'Section identifier'),
    type:allowed.has(section?.type) ? section.type : 'custom',
    title:cleanText(section?.title || 'Section', 100, 'Section title'),
    content:cleanText(section?.content, 5000, 'Section content', false),
    visible:section?.visible !== false,
    fields:cleanPortfolioFields(section?.fields),
    ...(Array.isArray(section?.workIds) ? {workIds:cleanPortfolioList(section.workIds, 50, 128)} : {})
  }));
}

const PORTFOLIO_THEME_IDS = ['minimal','editorial','executive','studio','gallery','resume','technical','bold','monochrome','warm'];
const PORTFOLIO_THEME_SURFACES = ['cards','flat','outline','elevated'];
const PORTFOLIO_THEME_WORK_LAYOUTS = ['cards','posters','list'];
const PORTFOLIO_THEME_DENSITIES = ['comfortable','compact','spacious'];
function cleanThemeColour(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
}
function cleanThemeChoice(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function cleanThemeNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function cleanPortfolioThemeTokens(value) {
  const t = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    headingFont:cleanText(t.headingFont || 'Manrope', 80, 'Heading font', false) || 'Manrope',
    bodyFont:cleanText(t.bodyFont || 'DM Sans', 80, 'Body font', false) || 'DM Sans',
    headingScale:cleanThemeNumber(t.headingScale,.75,1.5,1),
    bodyScale:cleanThemeNumber(t.bodyScale,.82,1.25,1),
    contentWidth:cleanThemeNumber(t.contentWidth,820,1600,1180),
    pageGutter:cleanThemeNumber(t.pageGutter,12,96,32),
    heroStyle:cleanThemeChoice(t.heroStyle,['gradient','solid','surface','accent'],'gradient'),
    heroHeight:cleanThemeNumber(t.heroHeight,160,620,300),
    heroAlign:cleanThemeChoice(t.heroAlign,['left','center','right'],'left'),
    heroComposition:cleanThemeChoice(t.heroComposition,['portrait-left','portrait-right','stacked'],'portrait-left'),
    avatarShape:cleanThemeChoice(t.avatarShape,['square','rounded','circle','portrait'],'rounded'),
    avatarSize:cleanThemeNumber(t.avatarSize,64,220,112),
    sectionRadius:cleanThemeNumber(t.sectionRadius,0,40,18),
    sectionBorder:cleanThemeNumber(t.sectionBorder,0,4,1),
    sectionShadow:cleanThemeChoice(t.sectionShadow,['none','soft','strong'],'none'),
    sectionPadding:cleanThemeNumber(t.sectionPadding,12,64,28),
    sidebarPosition:cleanThemeChoice(t.sidebarPosition,['left','right'],'right'),
    sidebarWidth:cleanThemeNumber(t.sidebarWidth,220,460,330),
    sidebarStyle:cleanThemeChoice(t.sidebarStyle,['blend','panel','accent'],'blend'),
    workImageRatio:cleanThemeChoice(t.workImageRatio,['wide','landscape','square','portrait'],'landscape'),
    workCardRadius:cleanThemeNumber(t.workCardRadius,0,40,16),
    labelCase:cleanThemeChoice(t.labelCase,['uppercase','title','none'],'uppercase')
  };
}
function cleanPortfolioThemePackage(value, owner = {}) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const palettes = (Array.isArray(data.palettes) ? data.palettes : []).slice(0, 12).map((palette, index) => ({
    id:cleanText(String(palette?.id || palette?.name || `palette-${index + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-'), 48, 'Palette identifier'),
    name:cleanText(palette?.name || `Palette ${index + 1}`, 60, 'Palette name'),
    accent:cleanThemeColour(palette?.accent, '#661f22'), bg:cleanThemeColour(palette?.bg, '#f7f3ed'),
    surface:cleanThemeColour(palette?.surface, '#fffdfa'), ink:cleanThemeColour(palette?.ink, '#211a1b'),
    soft:cleanThemeColour(palette?.soft, '#f0daa1')
  }));
  if (!palettes.length) throw new HttpsError('invalid-argument', 'Add at least one colour palette.');
  return {format:'aias-portfolio-theme', version:1, name:cleanText(data.name, 100, 'Theme name'), description:cleanText(data.description, 500, 'Theme description', false), creatorId:owner.uid || '', creatorName:cleanText(owner.name || data.creatorName || 'Community creator', 120, 'Creator name'), baseTheme:PORTFOLIO_THEME_IDS.includes(data.baseTheme) ? data.baseTheme : 'minimal', surfaceStyle:PORTFOLIO_THEME_SURFACES.includes(data.surfaceStyle) ? data.surfaceStyle : 'cards', workLayout:PORTFOLIO_THEME_WORK_LAYOUTS.includes(data.workLayout) ? data.workLayout : 'cards', density:PORTFOLIO_THEME_DENSITIES.includes(data.density) ? data.density : 'comfortable', fieldBackgrounds:data.fieldBackgrounds !== false, tokens:cleanPortfolioThemeTokens(data.tokens), palettes};
}

function cleanMultiThemePublish(value) {
  if (!value || typeof value !== 'object') return {enabled:false, themes:[]};
  const enabled = value.enabled === true;
  const themes = (Array.isArray(value.themes) ? value.themes : []).slice(0, 10).map((t, idx) => ({
    id:cleanText(t?.id || `theme-${idx + 1}`, 64, 'Theme identifier', false),
    name:cleanText(t?.name || `Style ${idx + 1}`, 60, 'Theme style name', false),
    type:t?.type === 'community' ? 'community' : 'built-in',
    theme:PORTFOLIO_THEME_IDS.includes(t?.theme) ? t.theme : 'minimal',
    palette:cleanText(t?.palette || 'heritage_wine', 64, 'Palette identifier', false),
    accent:cleanThemeColour(t?.accent, '#661f22'),
    surfaceStyle:PORTFOLIO_THEME_SURFACES.includes(t?.surfaceStyle) ? t.surfaceStyle : 'cards',
    workLayout:PORTFOLIO_THEME_WORK_LAYOUTS.includes(t?.workLayout) ? t.workLayout : 'cards',
    density:PORTFOLIO_THEME_DENSITIES.includes(t?.density) ? t.density : 'comfortable',
    fieldBackgrounds:t?.fieldBackgrounds !== false,
    themePackage:t?.themePackage ? cleanPortfolioThemePackage(t.themePackage) : null,
    themePaletteId:cleanText(t?.themePaletteId || '', 48, 'Palette identifier', false)
  }));
  return {enabled, themes};
}

async function resolvePortfolioAttachment(kindValue, idValue, postType) {
  const kind = String(kindValue || '').trim();
  const requestedId = String(idValue || '').trim();
  if (!kind && !requestedId) return null;
  if (!kind || !requestedId) throw new HttpsError('invalid-argument', 'Choose a complete portfolio item to share.');
  if (postType !== 'text') throw new HttpsError('invalid-argument', 'Portfolio shares must be published as thought posts.');
  if (!['portfolio', 'work', 'job', 'internship', 'biz_post'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Choose a valid portfolio share type.');
  }
  const id = cleanId(requestedId, kind);

  if (kind === 'portfolio') {
    const snapshot = await db.collection('portfolioProfiles').doc(id).get();
    const portfolio = snapshot.data();
    if (!snapshot.exists || portfolio?.status !== 'published') throw new HttpsError('not-found', 'This portfolio is not public.');
    const bizSnap = await db.collection('businessAccounts').doc(id).get().catch(() => null);
    const isBiz = bizSnap?.exists && bizSnap.data().status === 'active';
    return {
      kind: 'portfolio', id, portfolioId: id, workId: '',
      title: shareText(portfolio.displayName || portfolio.title, 120) || 'Professional portfolio',
      description: shareText(portfolio.tagline || portfolio.professionalTitle, 500),
      imageUrl: cleanPortfolioUrl(portfolio.coverUrl || portfolio.avatarUrl),
      professionalTitle: shareText(portfolio.professionalTitle, 120),
      isBusiness: isBiz,
      workType: isBiz ? 'Studio Practice' : 'Practitioner',
      tags: cleanPortfolioList(portfolio.skills, 6, 60),
      url: `${SARAY_ORIGIN}/portfolio.html?id=${encodeURIComponent(id)}`
    };
  }

  if (kind === 'work') {
    const snapshot = await db.collection('portfolioWorks').doc(id).get();
    const work = snapshot.data();
    if (!snapshot.exists || work?.status !== 'published') throw new HttpsError('not-found', 'This portfolio work is not public.');
    const portfolioSnapshot = await db.collection('portfolioProfiles').doc(cleanId(work.ownerId, 'portfolio')).get();
    const portfolio = portfolioSnapshot.data();
    if (!portfolioSnapshot.exists || portfolio?.status !== 'published') throw new HttpsError('not-found', 'The portfolio for this work is not public.');
    return {
      kind: 'work', id, portfolioId: work.ownerId, workId: id,
      title: shareText(work.title, 120) || 'Portfolio work',
      description: shareText(work.summary || work.content, 500),
      imageUrl: cleanPortfolioUrl(work.coverUrl || work.previewUrl),
      professionalTitle: shareText(portfolio.displayName || portfolio.professionalTitle, 120),
      workType: shareText(work.workType, 80),
      tags: cleanPortfolioList(work.tags, 6, 60),
      url: `${SARAY_ORIGIN}/portfolio-work.html?id=${encodeURIComponent(id)}`
    };
  }

  if (kind === 'job' || kind === 'internship') {
    const snapshot = await db.collection('businessOpportunities').doc(id).get();
    const opp = snapshot.data();
    if (!snapshot.exists || opp?.status !== 'open') throw new HttpsError('not-found', 'This opportunity is no longer open.');
    const [bizAccSnap, bizProfSnap] = await Promise.all([
      db.collection('businessAccounts').doc(opp.ownerUid).get(),
      db.collection('businessProfiles').doc(opp.ownerUid).get()
    ]);
    if (!bizAccSnap.exists || bizAccSnap.data().status !== 'active') throw new HttpsError('failed-precondition', 'The studio offering this position is unavailable.');
    const bizProf = bizProfSnap.exists ? bizProfSnap.data() : {};
    const isJob = opp.type === 'job' || kind === 'job';
    return {
      kind: isJob ? 'job' : 'internship',
      id,
      opportunityId: id,
      companyId: opp.ownerUid,
      title: shareText(opp.title, 120),
      description: shareText(opp.description, 500),
      imageUrl: cleanPortfolioUrl(bizProf.coverUrl || bizProf.logoUrl),
      companyName: shareText(bizProf.name || opp.businessName, 120),
      professionalTitle: shareText(bizProf.name || opp.businessName, 120),
      isBusiness: true,
      verified: true,
      workType: isJob ? (opp.employmentType || 'Full-time') : (opp.duration || 'Internship'),
      tags: [opp.location, opp.workplaceType, opp.experience || opp.compensation].filter(Boolean),
      url: `${SARAY_ORIGIN}/portfolios.html?tab=${isJob ? 'jobs' : 'internships'}&id=${encodeURIComponent(id)}`
    };
  }

  if (kind === 'biz_post') {
    const snapshot = await db.collection('businessPosts').doc(id).get();
    const post = snapshot.data();
    if (!snapshot.exists || post?.status !== 'published') throw new HttpsError('not-found', 'This announcement is not public.');
    const bizProfSnap = await db.collection('businessProfiles').doc(post.ownerUid).get();
    const bizProf = bizProfSnap.exists ? bizProfSnap.data() : {};
    return {
      kind: 'biz_post',
      id,
      postId: id,
      companyId: post.ownerUid,
      title: shareText(post.title, 120),
      description: shareText(post.body || post.summary, 500),
      imageUrl: cleanPortfolioUrl(post.photoUrl || bizProf.coverUrl || bizProf.logoUrl),
      companyName: shareText(bizProf.name || post.businessName, 120),
      professionalTitle: shareText(bizProf.name || post.businessName, 120),
      isBusiness: true,
      verified: true,
      workType: 'Studio Announcement',
      tags: ['Announcement', bizProf.industry || 'Architecture & Design'],
      url: `${SARAY_ORIGIN}/portfolio.html?id=${encodeURIComponent(post.ownerUid)}`
    };
  }

  return null;
}

function stageSpaceAccess(batch, spaceRef, space, userId, state = {}) {
  const manager = state.manager === true;
  const member = state.member === true;
  const blocked = state.blocked === true;
  const chatBanned = state.chatBanned === true;
  const chatApproved = manager || state.chatApproved === true;
  const active = space?.active === true && space?.archived !== true;
  const accessRef = spaceRef.collection('access').doc(userId);
  if (!manager && !member && !blocked && !chatBanned) {
    batch.delete(accessRef);
    return;
  }
  batch.set(accessRef, {
    userId,
    spaceId:spaceRef.id,
    manager,
    member,
    blocked,
    chatBanned,
    chatApproved,
    canReadPosts:active && !blocked && (space?.isPrivate !== true || manager || member),
    canUseChat:active && space?.chatEnabled === true && !blocked && !chatBanned && (manager || (member && chatApproved)),
    updatedAt:FieldValue.serverTimestamp()
  }, {merge:false});
}

async function rebuildSpaceAccessRecords(spaceRef, space) {
  const [members, admins, blocks, chatBans, existing] = await Promise.all([
    spaceRef.collection('connections').get(),
    spaceRef.collection('admins').get(),
    spaceRef.collection('blocks').get(),
    spaceRef.collection('chatBans').get(),
    spaceRef.collection('access').get()
  ]);
  const memberMap = new Map(members.docs.map(item => [item.id, item.data()]));
  const adminIds = new Set(admins.docs.map(item => item.id));
  const blockedIds = new Set(blocks.docs.map(item => item.id));
  const bannedIds = new Set(chatBans.docs.map(item => item.id));
  const ids = new Set([space.creatorId, ...memberMap.keys(), ...adminIds, ...blockedIds, ...bannedIds, ...existing.docs.map(item => item.id)].filter(Boolean));
  const operations = [...ids].map(userId => batch => stageSpaceAccess(batch, spaceRef, space, userId, {
    manager:space.creatorId === userId || adminIds.has(userId),
    member:space.creatorId === userId || memberMap.has(userId),
    blocked:blockedIds.has(userId),
    chatBanned:bannedIds.has(userId),
    chatApproved:space.creatorId === userId || adminIds.has(userId) || (memberMap.has(userId) && memberMap.get(userId).chatAccessApproved !== false)
  }));
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach(operation => operation(batch));
    await batch.commit();
  }
  return ids.size;
}

async function requireCompleteProfile(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists || profile.data().profileComplete !== true || !profile.data().username) {
    throw new HttpsError('failed-precondition', 'Complete your account profile first.');
  }
  return profile.data();
}

async function requirePostSpaceAccess(uid, slug) {
  const profile = await db.collection('users').doc(uid).get();
  // Accounts created before this field existed are grandfathered. New registrations explicitly store false.
  const canPostMain = profile.exists && profile.data().mainThreadPostingAccess !== false;
  if (slug === 'main') {
    if (!canPostMain) throw new HttpsError('permission-denied', 'Main-thread posting access is required. Apply from your profile.');
    return {isPrivate:false, canPostMain};
  }
  const spaceRef = db.collection('communitySpaces').doc(slug);
  const [space, access] = await Promise.all([spaceRef.get(), spaceRef.collection('access').doc(uid).get()]);
  if (!space.exists || space.data().active !== true || space.data().archived === true
      || !access.exists || access.data().blocked === true || access.data().canReadPosts !== true
      || (access.data().manager !== true && access.data().member !== true)) {
    throw new HttpsError('permission-denied', 'You cannot publish to this space.');
  }
  if (space.data().isPrivate !== true && !canPostMain) {
    throw new HttpsError('permission-denied', 'Main-thread posting access is required for public spaces. You may post in private spaces.');
  }
  return {...space.data(), canPostMain};
}

function postVisibilityForSpace(slug, space = {}) {
  return slug !== 'main' && space.isPrivate === true ? 'private' : 'public';
}

async function requireReadablePost(uid, postId) {
  const postRef = db.collection('communityPosts').doc(postId);
  const postSnapshot = await postRef.get();
  if (!postSnapshot.exists) throw new HttpsError('not-found', 'This post is unavailable.');
  const post = postSnapshot.data();
  if (post.published !== true || post.archived === true || post.moderationStatus === 'flagged') {
    throw new HttpsError('failed-precondition', 'This post is not open for engagement.');
  }
  const spaceId = String(post.communitySlug || 'main');
  if (spaceId !== 'main') {
    const access = uid ? await db.collection('communitySpaces').doc(spaceId).collection('access').doc(uid).get() : null;
    if (access?.exists && access.data().blocked === true) throw new HttpsError('permission-denied', 'This post is not available to your account.');
    if (post.visibility === 'private' && (!access?.exists || access.data().canReadPosts !== true)) {
      throw new HttpsError('permission-denied', 'You cannot access this private-space post.');
    }
  }
  return {postRef, post};
}

function publicProfileFields(profile = {}) {
  return {
    username:String(profile.username || '').slice(0, 24),
    displayName:String(profile.displayName || 'Community member').slice(0, 100),
    school:String(profile.school || '').slice(0, 160),
    city:String(profile.city || '').slice(0, 120),
    bio:String(profile.bio || '').slice(0, 1000),
    interests:String(profile.interests || '').slice(0, 500),
    photoURL:String(profile.photoURL || '').slice(0, 2000),
    bannerURL:String(profile.bannerURL || '').slice(0, 2000),
    profileComplete:profile.profileComplete === true,
    verified:profile.verified === true,
    updatedAt:FieldValue.serverTimestamp()
  };
}

async function updateSpacePostVisibility(spaceId, visibility) {
  const snapshot = await db.collection('communityPosts').where('communitySlug', '==', spaceId).get();
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    if (visibility === 'private') {
      const bucket = getStorage().bucket();
      await Promise.all(snapshot.docs.slice(offset, offset + 400).flatMap(item => (Array.isArray(item.data().imagePaths) ? item.data().imagePaths : []).map(async path => {
        const file = bucket.file(String(path));
        await revokeFirebaseDownloadToken(file).catch(error => logger.warn('Private post token revocation failed', {postId:item.id, path, error:error.message}));
      })));
    }
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + 400).forEach(item => batch.update(item.ref, {visibility}));
    await batch.commit();
  }
  return snapshot.size;
}

functions.syncCommunityPublicProfile = onDocumentWritten('users/{userId}', async event => {
  const userId = event.params.userId;
  const after = event.data?.after;
  const target = db.collection('publicProfiles').doc(userId);
  if (!after?.exists) return target.delete().catch(() => {});
  return target.set(publicProfileFields(after.data()), {merge:false});
});

async function getRecipientNotificationPreferences(userId) {
  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return { preferences: {}, mutedSpaceChats: [] };
    const data = snap.data() || {};
    return {
      preferences: data.notificationPreferences || {},
      mutedSpaceChats: Array.isArray(data.mutedSpaceChats) ? data.mutedSpaceChats : []
    };
  } catch (error) {
    console.warn('[Notification Preferences] Error fetching preferences for', userId, error);
    return { preferences: {}, mutedSpaceChats: [] };
  }
}

functions.requestMainThreadPostingAccess = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to apply.');
  const ref = db.collection('users').doc(request.auth.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().profileComplete !== true) throw new HttpsError('failed-precondition', 'Complete your profile first.');
  if (snapshot.data().mainThreadPostingAccess !== false) return {ok:true, status:'approved'};
  await ref.set({mainThreadPostingAccess:false, mainThreadAccessStatus:'pending', mainThreadAccessRequestedAt:FieldValue.serverTimestamp()}, {merge:true});
  return {ok:true, status:'pending'};
});

functions.reviewMainThreadPostingAccess = onCall(async request => {
  await requireCommunityAdmin(request);
  const userId = cleanId(request.data?.userId, 'user');
  const decision = String(request.data?.decision || '');
  if (!['grant', 'deny', 'revoke'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose grant, deny, or revoke.');
  const ref = db.collection('users').doc(userId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'User not found.');
  const granted = decision === 'grant';
  await ref.set({
    mainThreadPostingAccess:granted,
    mainThreadAccessStatus:granted ? 'approved' : decision === 'deny' ? 'denied' : 'revoked',
    mainThreadAccessReviewedAt:FieldValue.serverTimestamp(),
    mainThreadAccessReviewedBy:request.auth.uid
  }, {merge:true});
  await ref.collection('notifications').doc(`main_thread_access_${Date.now()}`).set({
    recipientId:userId, actorId:request.auth.uid, actorName:'Community administration', actorUsername:'',
    type:granted ? 'main_thread_access_granted' : 'main_thread_access_denied', postId:'', postTitle:'Main-thread posting access', detailId:'',
    reason:granted ? '' : 'Your main-thread posting request was not approved.', read:false, createdAt:FieldValue.serverTimestamp()
  });
  return {ok:true, granted};
});

functions.setCommunitySpaceVisibility = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const isPrivate = request.data?.isPrivate === true;
  const isViewOnly = !isPrivate && request.data?.isViewOnly === true;
  const showInMainThread = !isPrivate && request.data?.showInMainThread === true;
  const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
  if (!isPrivate && !isViewOnly) {
    const connections = await spaceRef.collection('connections').get();
    const ids = [...new Set([space.creatorId, ...connections.docs.map(item => item.id)])];
    const profiles = await Promise.all(ids.map(id => db.collection('users').doc(id).get()));
    const blockedUserIds = profiles.filter(item => !item.exists || item.data().mainThreadPostingAccess === false).map(item => item.id);
    if (blockedUserIds.length) throw new HttpsError('failed-precondition', `This space cannot become public while ${blockedUserIds.length} member(s) lack main-thread posting access. Keep it private or remove those members.`, {blockedUserIds});
  }
  let updatedPostCount = 0;
  if (isPrivate) updatedPostCount = await updateSpacePostVisibility(spaceId, 'private');
  await spaceRef.set({isPrivate, isViewOnly, showInMainThread, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
  await rebuildSpaceAccessRecords(spaceRef, {...space, isPrivate, isViewOnly, showInMainThread});
  if (!isPrivate) updatedPostCount = await updateSpacePostVisibility(spaceId, 'public');
  return {ok:true, isPrivate, isViewOnly, showInMainThread, updatedPostCount};
});

functions.createCommunityPost = onCall(async request => {
  const profile = await requireCompleteProfile(request);
  const parentPostId = request.data?.parentPostId ? cleanId(request.data.parentPostId, 'parentPost') : null;

  // ── Sub-post path ─────────────────────────────────────────────────────────
  if (parentPostId) {
    const parentRef = db.collection('communityPosts').doc(parentPostId);
    const parentSnap = await parentRef.get();
    if (!parentSnap.exists) throw new HttpsError('not-found', 'Parent post not found.');
    const parentData = parentSnap.data();
    if (parentData.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the post author can add thread posts.');
    if (parentData.isSubPost) throw new HttpsError('invalid-argument', 'Cannot create a sub-post of a sub-post.');
    const title = cleanText(request.data?.title, 160, 'Title');
    const content = cleanText(request.data?.content, 10000, 'Content', false);
    const communitySlug = parentData.communitySlug || 'main';
    const mediaCount = Math.max(0, Math.min(10, Number(request.data?.mediaCount) || 0));
    const ref = db.collection('communityPosts').doc();
    const batch = db.batch();
    batch.create(ref, {
      type: 'text', title, content, summary: content.slice(0, 360), behanceSrc: '',
      communitySlug, parentPostId,
      isSubPost: true,
      userId: request.auth.uid,
      authorName: profile.displayName || request.auth.token?.name || 'Member',
      authorUsername: profile.username,
      published: mediaCount === 0,
      visibility: parentData.visibility || 'public',
      imagePaths: [], mediaCount,
      score: 0, upvoteCount: 0, downvoteCount: 0, commentsCount: 0,
      featureRequest: false, featureStatus: 'none', featured: false,
      archived: false, moderationStatus: 'clear',
      createdAt: FieldValue.serverTimestamp()
    });
    batch.update(parentRef, { subPostCount: FieldValue.increment(1) });
    await batch.commit();
    return { ok: true, postId: ref.id, published: mediaCount === 0 };
  }

  // ── Regular post path ─────────────────────────────────────────────────────
  const type = String(request.data?.type || 'text');
  if (!POST_TYPES.has(type)) throw new HttpsError('invalid-argument', 'Choose a valid post type.');
  const title = cleanText(request.data?.title, 160, 'Title');
  const content = cleanText(request.data?.content, 10000, 'Content', false);
  const communitySlug = cleanText(request.data?.communitySlug, 32, 'Space handle');
  if (!/^(main|[a-z0-9-]{3,32})$/.test(communitySlug)) throw new HttpsError('invalid-argument', 'Invalid space handle.');
  const spaceAccess = await requirePostSpaceAccess(request.auth.uid, communitySlug);
  const behanceSrc = '';
  const mediaCount = Math.max(0, Math.min(10, Number(request.data?.mediaCount) || 0));
  const marketAttachment = await resolveMarketAttachment(request.data?.marketKind, request.data?.marketId, type);
  const portfolioAttachment = await resolvePortfolioAttachment(request.data?.portfolioKind, request.data?.portfolioId, type);
  if (marketAttachment && portfolioAttachment) throw new HttpsError('invalid-argument', 'Attach either Market content or Portfolio content, not both.');
  const ref = db.collection('communityPosts').doc();
  await ref.create({
    type, title, content, summary:content.slice(0, 360), behanceSrc, communitySlug,
    userId:request.auth.uid,
    authorName:profile.displayName || request.auth.token?.name || 'Member',
    authorUsername:profile.username,
    published:mediaCount === 0,
    visibility:postVisibilityForSpace(communitySlug, spaceAccess),
    imagePaths:[], mediaCount,
    score:0, upvoteCount:0, downvoteCount:0, commentsCount:0,
    featureRequest:false, featureStatus:'none', featured:false,
    archived:false, moderationStatus:'clear',
    ...(marketAttachment ? {marketAttachment} : {}),
    ...(portfolioAttachment ? {portfolioAttachment} : {}),
    createdAt:FieldValue.serverTimestamp()
  });
  return {ok:true, postId:ref.id, published:mediaCount === 0};
});

functions.savePortfolioProfile = onCall(async request => {
  const communityProfile = await requireCompleteProfile(request);
  const uid = request.auth.uid;
  const existing = await db.collection('portfolioProfiles').doc(uid).get();
  const data = request.data || {};
  const requestedStatus = data.status === 'published' ? 'published' : 'draft';
  const username = cleanText(communityProfile.username || uid, 80, 'Username');
  const displayName = cleanText(data.displayName, 120, 'Display name', false);
  const sidebarData = data.sidebar && typeof data.sidebar === 'object' ? data.sidebar : {};
  const skills = cleanPortfolioList(data.skills, 40, 80);
  const contacts = (Array.isArray(data.contacts) ? data.contacts : []).filter(contact => String(contact?.value || '').trim()).slice(0, 50).map((contact, index) => ({
    id:cleanText(contact?.id || `contact-${index + 1}`, 64, 'Contact identifier'),
    type:['email','phone','website','social','location','other'].includes(contact?.type) ? contact.type : 'other',
    label:cleanText(contact?.label || '', 80, 'Contact label', false),
    value:cleanText(contact?.value, 240, 'Contact value'),
    visible:contact?.visible !== false
  }));
  const primaryEmail = contacts.find(contact => contact.type === 'email');
  if (requestedStatus === 'published' && !displayName) throw new HttpsError('invalid-argument', 'Add a portfolio display name before publishing.');
  const portfolio = {
    ownerId:uid,
    username,
    displayName,
    professionalTitle:cleanText(data.professionalTitle, 120, 'Professional title', false),
    tagline:cleanText(data.tagline, 220, 'Tagline', false),
    location:cleanText(data.location, 120, 'Location', false),
    availability:cleanText(data.availability, 120, 'Availability', false),
    contactEmail:cleanText(primaryEmail?.value || data.contactEmail, 200, 'Contact email', false),
    contactPublic:primaryEmail ? primaryEmail.visible : data.contactPublic === true,
    contacts,
    avatarUrl:cleanPortfolioUrl(data.avatarUrl),
    avatarVisible:data.avatarVisible !== false,
    coverUrl:cleanPortfolioUrl(data.coverUrl),
    theme:['minimal','editorial','executive','studio','gallery','resume','technical','bold','monochrome','warm'].includes(data.theme) ? data.theme : 'minimal',
    palette:['heritage_wine','navy_gold','slate_blue','oxford_red','forest_cream','emerald_stone','sage_charcoal','olive_linen','ocean_mist','arctic_cyan','cobalt_ice','indigo_lavender','plum_blush','rose_quartz','violet_electric','teal_coral','terracotta_clay','desert_sun','coffee_copper','sunset_punch','graphite','midnight_neon','deep_ocean','black_white','custom'].includes(data.palette) ? data.palette : 'heritage_wine',
    surfaceStyle:['cards','flat','outline','elevated'].includes(data.surfaceStyle) ? data.surfaceStyle : 'cards',
    workLayout:['cards','posters','list'].includes(data.workLayout) ? data.workLayout : 'cards',
    density:['comfortable','compact','spacious'].includes(data.density) ? data.density : 'comfortable',
    fieldBackgrounds:data.fieldBackgrounds !== false,
    themePackage:data.themePackage ? cleanPortfolioThemePackage(data.themePackage, {uid, name:communityProfile.displayName || communityProfile.username}) : null,
    themePaletteId:cleanText(data.themePaletteId, 48, 'Theme palette identifier', false),
    accent:/^#[0-9a-f]{6}$/i.test(String(data.accent || '')) ? String(data.accent).toLowerCase() : '#661f22',
    navigation:['top','side','compact'].includes(data.navigation) ? data.navigation : 'top',
    skills,
    skillRatings:cleanPortfolioSkillRatings(data.skillRatings, skills),
    links:(Array.isArray(data.links) ? data.links : []).filter(link => cleanPortfolioUrl(link?.url)).slice(0, 50).map((link, index) => ({
      id:cleanText(link?.id || `link-${index + 1}`, 64, 'Link identifier'),
      label:cleanText(link?.label || 'Link', 80, 'Link label'),
      url:cleanPortfolioUrl(link?.url),
      visible:link?.visible !== false
    })).filter(link => link.url),
    sidebar:{
      visible:sidebarData.visible !== false,
      title:cleanText(sidebarData.title || 'Resume details', 100, 'Sidebar title'),
      width:['narrow','balanced','wide'].includes(sidebarData.width) ? sidebarData.width : 'balanced',
      showSkills:sidebarData.showSkills !== false,
      showLocation:sidebarData.showLocation !== false,
      showAvailability:sidebarData.showAvailability !== false,
      showContact:sidebarData.showContact !== false,
      fields:cleanPortfolioFields(sidebarData.fields)
    },
    sections:cleanPortfolioSections(data.sections),
    multiThemePublish:cleanMultiThemePublish(data.multiThemePublish),
    status:requestedStatus,
    updatedAt:FieldValue.serverTimestamp(),
    createdAt:existing.data()?.createdAt || FieldValue.serverTimestamp(),
    ...(requestedStatus === 'published' ? {publishedAt:existing.data()?.publishedAt || FieldValue.serverTimestamp()} : {})
  };
  if (requestedStatus === 'draft' && existing.data()?.status === 'published') {
    const {status, updatedAt, createdAt, publishedAt, draftData, hasDraft, draftUpdatedAt, ...draftContent} = portfolio;
    await Promise.all([
      db.collection('portfolioProfileDrafts').doc(uid).set({...draftContent, ownerId:uid, updatedAt:FieldValue.serverTimestamp()}, {merge:false}),
      db.collection('portfolioProfiles').doc(uid).set({draftData:FieldValue.delete(), hasDraft:true, draftUpdatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()}, {merge:true})
    ]);
    return {ok:true, portfolioId:uid, status:'published', hasDraft:true, username};
  }
  portfolio.hasDraft = false;
  await Promise.all([
    db.collection('portfolioProfiles').doc(uid).set(portfolio, {merge:false}),
    db.collection('portfolioProfileDrafts').doc(uid).delete().catch(() => null)
  ]);
  return {ok:true, portfolioId:uid, status:requestedStatus, hasDraft:false, username};
});

functions.unpublishPortfolioProfile = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const ref = db.collection('portfolioProfiles').doc(request.auth.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Portfolio not found.');
  await ref.update({status:'draft', unpublishedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
  return {ok:true, status:'draft', hasDraft:snapshot.data().hasDraft === true};
});

functions.savePortfolioTheme = onCall(async request => {
  const communityProfile = await requireCompleteProfile(request);const uid = request.auth.uid;
  const requestedId = String(request.data?.themeId || '').trim();const themeId = requestedId ? cleanId(requestedId, 'portfolio theme') : db.collection('portfolioThemes').doc().id;
  const ref = db.collection('portfolioThemes').doc(themeId);const existing = await ref.get();
  if (existing.exists && existing.data().ownerId !== uid) throw new HttpsError('permission-denied', 'You do not own this theme.');
  const packageData = cleanPortfolioThemePackage(request.data?.themePackage, {uid, name:communityProfile.displayName || communityProfile.username});const status = request.data?.status === 'published' ? 'published' : 'private';
  const record = {...packageData,id:themeId,ownerId:uid,status,downloads:Number(existing.data()?.downloads || 0),saves:Number(existing.data()?.saves || 0),updatedAt:FieldValue.serverTimestamp(),createdAt:existing.data()?.createdAt || FieldValue.serverTimestamp(),...(status === 'published' ? {publishedAt:existing.data()?.publishedAt || FieldValue.serverTimestamp()} : {})};
  await Promise.all([ref.set(record,{merge:false}),db.collection('users').doc(uid).collection('savedPortfolioThemes').doc(themeId).set({themeId,themePackage:record,source:'created',savedAt:FieldValue.serverTimestamp()},{merge:false})]);
  return {ok:true,themeId,status};
});

functions.savePortfolioThemeToAccount = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to save this theme.');
  const themeId=cleanId(request.data?.themeId,'portfolio theme');const snapshot=await db.collection('portfolioThemes').doc(themeId).get();
  if(!snapshot.exists||(snapshot.data().status!=='published'&&snapshot.data().ownerId!==request.auth.uid))throw new HttpsError('not-found','This theme is unavailable.');
  const packageData=cleanPortfolioThemePackage(snapshot.data(),{uid:snapshot.data().ownerId,name:snapshot.data().creatorName});
  await Promise.all([db.collection('users').doc(request.auth.uid).collection('savedPortfolioThemes').doc(themeId).set({themeId,themePackage:{...packageData,id:themeId},source:snapshot.data().ownerId===request.auth.uid?'created':'market',savedAt:FieldValue.serverTimestamp()},{merge:false}),snapshot.ref.update({saves:FieldValue.increment(1)})]);
  return {ok:true,themeId};
});

functions.removeSavedPortfolioTheme = onCall(async request => {
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in to continue.');const themeId=cleanId(request.data?.themeId,'portfolio theme');
  await db.collection('users').doc(request.auth.uid).collection('savedPortfolioThemes').doc(themeId).delete();return{ok:true};
});

functions.deletePortfolioTheme = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete a theme.');
  const themeId = cleanId(request.data?.themeId, 'portfolio theme');
  const ref = db.collection('portfolioThemes').doc(themeId);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    if (snapshot.data().ownerId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only delete themes you created.');
    await ref.delete();
  }
  await db.collection('users').doc(request.auth.uid).collection('savedPortfolioThemes').doc(themeId).delete().catch(() => {});
  return { ok: true, themeId };
});

functions.setPortfolioThemeStatus = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to update theme status.');
  const themeId = cleanId(request.data?.themeId, 'portfolio theme');
  const status = request.data?.status === 'published' ? 'published' : 'private';
  const ref = db.collection('portfolioThemes').doc(themeId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this theme.');
  const updateData = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === 'published' && !snapshot.data().publishedAt ? { publishedAt: FieldValue.serverTimestamp() } : {})
  };
  await ref.update(updateData);
  const savedRef = db.collection('users').doc(request.auth.uid).collection('savedPortfolioThemes').doc(themeId);
  const savedSnap = await savedRef.get();
  if (savedSnap.exists) {
    await savedRef.set({
      themePackage: { ...savedSnap.data().themePackage, status }
    }, { merge: true });
  }
  return { ok: true, themeId, status };
});

functions.recordPortfolioThemeDownload = onCall(async request => {
  const themeId=cleanId(request.data?.themeId,'portfolio theme');const ref=db.collection('portfolioThemes').doc(themeId);const snapshot=await ref.get();
  if(!snapshot.exists||snapshot.data().status!=='published')throw new HttpsError('not-found','This theme is unavailable.');await ref.update({downloads:FieldValue.increment(1)});return{ok:true};
});

functions.savePortfolioWork = onCall(async request => {
  const communityProfile = await requireCompleteProfile(request);
  const uid = request.auth.uid;
  const data = request.data || {};
  const workId = data.workId ? cleanId(data.workId, 'portfolio work') : db.collection('portfolioWorks').doc().id;
  const ref = db.collection('portfolioWorks').doc(workId);
  const existing = await ref.get();
  if (existing.exists && existing.data().ownerId !== uid) throw new HttpsError('permission-denied', 'You do not own this portfolio work.');
  const portfolio = await db.collection('portfolioProfiles').doc(uid).get();
  if (!portfolio.exists) throw new HttpsError('failed-precondition', 'Create your portfolio profile first.');
  const status = data.status === 'published' ? 'published' : 'draft';
  const work = {
    ownerId:uid,
    ownerUsername:cleanText(communityProfile.username || uid, 80, 'Username'),
    ownerName:cleanText(portfolio.data().displayName || communityProfile.displayName || 'Member', 120, 'Owner name'),
    title:cleanText(data.title, 160, 'Work title'),
    workType:cleanText(data.workType || 'Project', 80, 'Work type'),
    summary:cleanText(data.summary, 1200, 'Summary', false),
    content:cleanText(data.content, 10000, 'Content', false),
    coverUrl:cleanPortfolioUrl(data.coverUrl),
    gallery:cleanPortfolioList(data.gallery, 20, 2000).map(cleanPortfolioUrl).filter(Boolean),
    tags:cleanPortfolioList(data.tags, 30, 80),
    fields:cleanPortfolioFields(data.fields),
    theme:['minimal','editorial','executive','studio','gallery','resume','technical','bold','monochrome','warm'].includes(data.theme) ? data.theme : 'minimal',
    palette:['heritage_wine','navy_gold','slate_blue','oxford_red','forest_cream','emerald_stone','sage_charcoal','olive_linen','ocean_mist','arctic_cyan','cobalt_ice','indigo_lavender','plum_blush','rose_quartz','violet_electric','teal_coral','terracotta_clay','desert_sun','coffee_copper','sunset_punch','graphite','midnight_neon','deep_ocean','black_white','custom'].includes(data.palette) ? data.palette : 'heritage_wine',
    accent:/^#[0-9a-f]{6}$/i.test(String(data.accent || '')) ? String(data.accent).toLowerCase() : '#661f22',
    pageLayout:['case-study','editorial','visual'].includes(data.pageLayout) ? data.pageLayout : 'case-study',
    links:(Array.isArray(data.links) ? data.links : []).slice(0, 12).map((link, index) => ({
      id:cleanText(link?.id || `link-${index + 1}`, 64, 'Link identifier'),
      label:cleanText(link?.label, 80, 'Link label'),
      url:cleanPortfolioUrl(link?.url)
    })).filter(link => link.url),
    status,
    moderationStatus:'clear',
    updatedAt:FieldValue.serverTimestamp(),
    ...(existing.exists ? {createdAt:existing.data().createdAt || FieldValue.serverTimestamp()} : {createdAt:FieldValue.serverTimestamp()}),
    ...(status === 'published' ? {publishedAt:existing.data()?.publishedAt || FieldValue.serverTimestamp()} : {})
  };
  if (status === 'draft' && existing.data()?.status === 'published') {
    const {status:ignoredStatus, moderationStatus, updatedAt, createdAt, publishedAt, draftData, hasDraft, draftUpdatedAt, ...draftContent} = work;
    await Promise.all([
      db.collection('portfolioWorkDrafts').doc(workId).set({...draftContent, ownerId:uid, updatedAt:FieldValue.serverTimestamp()}, {merge:false}),
      ref.set({draftData:FieldValue.delete(), hasDraft:true, draftUpdatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()}, {merge:true})
    ]);
    return {ok:true, workId, status:'published', hasDraft:true};
  }
  work.hasDraft = false;
  await Promise.all([
    ref.set(work, {merge:false}),
    db.collection('portfolioWorkDrafts').doc(workId).delete().catch(() => null)
  ]);
  return {ok:true, workId, status, hasDraft:false};
});

functions.unpublishPortfolioWork = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const workId = cleanId(request.data?.workId, 'portfolio work');
  const ref = db.collection('portfolioWorks').doc(workId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this portfolio work.');
  await ref.update({status:'draft', unpublishedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
  return {ok:true, status:'draft', hasDraft:snapshot.data().hasDraft === true};
});

functions.deletePortfolioWork = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const workId = cleanId(request.data?.workId, 'portfolio work');
  const ref = db.collection('portfolioWorks').doc(workId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return {ok:true, deleted:false};
  if (snapshot.data().ownerId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this portfolio work.');
  await Promise.all([
    ref.delete(),
    db.collection('portfolioWorkDrafts').doc(workId).delete().catch(() => null),
    getStorage().bucket().deleteFiles({prefix:`portfolios/${request.auth.uid}/works/${workId}/`, force:true}).catch(error => logger.warn('Portfolio work media cleanup failed', {workId, error:error.message}))
  ]);
  return {ok:true, deleted:true};
});

functions.finalizeCommunityPostMedia = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this post.');
  await requirePostSpaceAccess(request.auth.uid, String(snapshot.data().communitySlug || 'main'));
  const expected = Math.max(0, Math.min(10, Number(snapshot.data().mediaCount) || 0));
  const [files] = await getStorage().bucket().getFiles({prefix:`community/posts/${postId}/`});
  const valid = files.filter(file => !file.name.endsWith('/') && /^image\/(jpeg|png|webp)$/.test(String(file.metadata.contentType || '')) && Number(file.metadata.size || 0) <= 10 * 1024 * 1024)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (valid.length !== expected) throw new HttpsError('failed-precondition', `Expected ${expected} uploaded images, found ${valid.length}.`);
  if (snapshot.data().visibility === 'private') await Promise.all(valid.map(file => revokeFirebaseDownloadToken(file, file.metadata)));
  const imagePaths = valid.map(file => file.name);
  await ref.update({imagePaths, published:true, mediaFinalizedAt:FieldValue.serverTimestamp()});
  return {ok:true, imagePaths};
});

async function canManagePost(request, postData) {
  if (!request.auth?.uid) return false;
  if (postData.userId === request.auth.uid) return true;
  const userEmail = String(request.auth.token?.email || '').trim().toLowerCase();
  if (userEmail && postData.authorEmail && String(postData.authorEmail).trim().toLowerCase() === userEmail) return true;
  try {
    const access = await communityAdminAuthorization(request);
    if (access.isSuperAdmin || access.permissions.includes('manage_community') || access.permissions.includes('*')) {
      return true;
    }
  } catch (e) {
    logger.warn('Admin check in canManagePost failed', { error: e.message });
  }
  return false;
}

functions.deleteOwnCommunityPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Post not found.');
  const postData = snapshot.data();
  const allowed = await canManagePost(request, postData);
  if (!allowed) throw new HttpsError('permission-denied', 'You do not own this post.');

  // If deleting a sub-post, decrement parent's subPostCount
  if (postData.parentPostId) {
    const parentRef = db.collection('communityPosts').doc(postData.parentPostId);
    await parentRef.update({ subPostCount: FieldValue.increment(-1) }).catch(err => logger.warn('Parent subPostCount decrement failed', { parentId: postData.parentPostId, error: err.message }));
  } else {
    // If deleting a main post, delete all child sub-posts
    const subPostsSnap = await db.collection('communityPosts').where('parentPostId', '==', postId).get();
    if (!subPostsSnap.empty) {
      await Promise.all(subPostsSnap.docs.map(subDoc => {
        return Promise.all([
          db.recursiveDelete(subDoc.ref),
          getStorage().bucket().deleteFiles({prefix:`community/posts/${subDoc.id}/`, force:true}).catch(() => {})
        ]);
      }));
    }
  }

  await Promise.all([
    db.recursiveDelete(ref),
    getStorage().bucket().deleteFiles({prefix:`community/posts/${postId}/`, force:true}).catch(error => logger.warn('Post media cleanup failed', {postId, error:error.message}))
  ]);
  return {ok:true};
});

functions.archiveOwnCommunityPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Post not found.');
  const postData = snapshot.data();
  const allowed = await canManagePost(request, postData);
  if (!allowed) throw new HttpsError('permission-denied', 'You do not own this post.');
  if (postData.archived === true) return {ok:true, alreadyArchived:true};

  const batch = db.batch();
  batch.update(ref, {
    archived: true,
    archiveReason: 'Archived by author',
    archiveCause: 'user_archived',
    archivedAt: FieldValue.serverTimestamp(),
    archivedBy: request.auth.uid
  });

  // If main thread post, also cascade archive any attached sub-posts
  if (!postData.parentPostId) {
    const subPostsSnap = await db.collection('communityPosts').where('parentPostId', '==', postId).get();
    subPostsSnap.docs.forEach(subDoc => {
      batch.update(subDoc.ref, {
        archived: true,
        archiveReason: 'Parent post archived by author',
        archiveCause: 'parent_cascade',
        archivedAt: FieldValue.serverTimestamp(),
        archivedBy: request.auth.uid
      });
    });
  }

  await batch.commit();
  return {ok:true, postId};
});

functions.restoreOwnCommunityPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this post.');
  const postData = snapshot.data();
  if (postData.archived !== true) return {ok:true, alreadyActive:true};
  if (postData.archiveCause === 'moderation') throw new HttpsError('permission-denied', 'This post was restricted by moderation and cannot be self-restored.');

  const batch = db.batch();
  batch.update(ref, {
    archived: false,
    archiveReason: FieldValue.delete(),
    archiveCause: FieldValue.delete(),
    archiveCascadeId: FieldValue.delete(),
    archivedAt: FieldValue.delete(),
    archivedBy: FieldValue.delete(),
    restoredAt: FieldValue.serverTimestamp()
  });

  // If restoring a main post, also restore child sub-posts
  if (!postData.parentPostId) {
    const subPostsSnap = await db.collection('communityPosts').where('parentPostId', '==', postId).get();
    subPostsSnap.docs.forEach(subDoc => {
      if (subDoc.data().archiveCause === 'parent_cascade' || subDoc.data().archiveCause === 'user_archived') {
        batch.update(subDoc.ref, {
          archived: false,
          archiveReason: FieldValue.delete(),
          archiveCause: FieldValue.delete(),
          archivedAt: FieldValue.delete(),
          archivedBy: FieldValue.delete(),
          restoredAt: FieldValue.serverTimestamp()
        });
      }
    });
  }

  await batch.commit();
  return {ok:true, postId};
});

functions.setCommunityPostVote = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to react.');
  const postId = cleanId(request.data?.postId, 'post');
  const value = Number(request.data?.value);
  if (![0, 1, -1].includes(value)) throw new HttpsError('invalid-argument', 'Choose a valid reaction.');
  const {postRef, post} = await requireReadablePost(request.auth.uid, postId);
  const voteRef = postRef.collection('votes').doc(request.auth.uid);
  const result = await db.runTransaction(async transaction => {
    const [freshPost, previousVote] = await Promise.all([transaction.get(postRef), transaction.get(voteRef)]);
    const previous = previousVote.exists ? Number(previousVote.data().value || 0) : 0;
    if (previous === value) return {
      score:Number(freshPost.data().score || 0),
      upvoteCount:Number(freshPost.data().upvoteCount || 0),
      downvoteCount:Number(freshPost.data().downvoteCount || 0),
      value
    };
    const score = Math.max(-2147483648, Number(freshPost.data().score || 0) + value - previous);
    const upvoteCount = Math.max(0, Number(freshPost.data().upvoteCount || 0) + (value === 1 ? 1 : 0) - (previous === 1 ? 1 : 0));
    const downvoteCount = Math.max(0, Number(freshPost.data().downvoteCount || 0) + (value === -1 ? 1 : 0) - (previous === -1 ? 1 : 0));
    if (value === 0) transaction.delete(voteRef);
    else transaction.set(voteRef, {userId:request.auth.uid, value, updatedAt:FieldValue.serverTimestamp()});
    transaction.update(postRef, {score, upvoteCount, downvoteCount, lastActivityAt:FieldValue.serverTimestamp()});
    return {score, upvoteCount, downvoteCount, value};
  });
  if (value === 1 && post.userId && post.userId !== request.auth.uid) {
    const { preferences } = await getRecipientNotificationPreferences(post.userId);
    if (preferences.postApplauses !== false) {
      const actor = await db.collection('users').doc(request.auth.uid).get();
      const profile = actor.data() || {};
      await db.collection('users').doc(post.userId).collection('notifications').doc(`applause_${postId}_${request.auth.uid}`).set({
        recipientId:post.userId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 100),
        actorUsername:String(profile.username || '').slice(0, 24), type:'applause', postId, postTitle:String(post.title || '').slice(0, 160),
        detailId:'', read:false, createdAt:FieldValue.serverTimestamp()
      });
    }
  } else if (post.userId && post.userId !== request.auth.uid) {
    await db.collection('users').doc(post.userId).collection('notifications').doc(`applause_${postId}_${request.auth.uid}`).delete().catch(() => {});
  }
  return {ok:true, ...result};
});

functions.createCommunityComment = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to join the discussion.');
  const postId = cleanId(request.data?.postId, 'post');
  const text = cleanText(request.data?.text, 2000, 'Comment');
  const parentId = request.data?.parentId ? cleanId(request.data.parentId, 'parent comment') : null;
  const {postRef, post} = await requireReadablePost(request.auth.uid, postId);
  const profileSnapshot = await db.collection('users').doc(request.auth.uid).get();
  const profile = profileSnapshot.data() || {};
  let parent = null;
  if (parentId) {
    const parentSnapshot = await postRef.collection('comments').doc(parentId).get();
    if (!parentSnapshot.exists) throw new HttpsError('not-found', 'The comment you are replying to is unavailable.');
    parent = parentSnapshot.data();
  }
  const commentRef = postRef.collection('comments').doc();
  const batch = db.batch();
  batch.create(commentRef, {
    userId:request.auth.uid,
    userName:String(profile.displayName || profile.username || 'Community member').slice(0, 100),
    userUsername:String(profile.username || '').slice(0, 24), text, parentId, createdAt:FieldValue.serverTimestamp()
  });
  batch.update(postRef, {commentsCount:FieldValue.increment(1), lastActivityAt:FieldValue.serverTimestamp()});
  await batch.commit();
  const recipientId = parentId ? String(parent?.userId || '') : String(post.userId || '');
  if (recipientId && recipientId !== request.auth.uid) {
    const { preferences } = await getRecipientNotificationPreferences(recipientId);
    const allowNotify = parentId ? (preferences.commentReplies !== false) : (preferences.postComments !== false);
    if (allowNotify) {
      await db.collection('users').doc(recipientId).collection('notifications').doc(`${parentId ? 'reply' : 'comment'}_${postId}_${commentRef.id}`).set({
        recipientId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 100),
        actorUsername:String(profile.username || '').slice(0, 24), type:parentId ? 'reply' : 'comment', postId,
        postTitle:String(post.title || '').slice(0, 160), detailId:parentId || commentRef.id, sourceId:commentRef.id,
        read:false, createdAt:FieldValue.serverTimestamp()
      });
    }
  }
  processCommentMentionIfPresent({ postId, commentId: commentRef.id, commentText: text, parentId, authorId: request.auth.uid, db })
    .catch(err => logger.warn('[AI Assistant] processCommentMentionIfPresent error', { error: err.message }));
  return {ok:true, commentId:commentRef.id};
});

functions.updateCommunityComment = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to edit comments.');
  const postId = cleanId(request.data?.postId, 'post');
  const commentId = cleanId(request.data?.commentId, 'comment');
  const text = cleanText(request.data?.text, 2000, 'Comment');
  const {postRef} = await requireReadablePost(request.auth.uid, postId);
  const commentRef = postRef.collection('comments').doc(commentId);
  const comment = await commentRef.get();
  if (!comment.exists || comment.data().userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can edit only your own comment.');
  await commentRef.update({text, editedAt:FieldValue.serverTimestamp()});
  return {ok:true};
});

functions.deleteCommunityComment = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete comments.');
  const postId = cleanId(request.data?.postId, 'post');
  const commentId = cleanId(request.data?.commentId, 'comment');
  const {postRef, post} = await requireReadablePost(request.auth.uid, postId);
  const commentRef = postRef.collection('comments').doc(commentId);
  const comment = await commentRef.get();
  if (!comment.exists) return {ok:true};
  if (comment.data().userId !== request.auth.uid && post.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You cannot delete this comment.');

  // Fetch all comments to recursively find and delete all nested replies
  const commentsSnapshot = await postRef.collection('comments').get();
  const allComments = commentsSnapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));

  const childrenByParent = new Map();
  allComments.forEach(c => {
    if (c.parentId) {
      if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, []);
      childrenByParent.get(c.parentId).push(c);
    }
  });

  const toDeleteRefs = [commentRef];
  const queue = [commentId];
  while (queue.length > 0) {
    const currentParentId = queue.shift();
    const children = childrenByParent.get(currentParentId) || [];
    for (const child of children) {
      toDeleteRefs.push(child.ref);
      queue.push(child.id);
    }
  }

  const deleteCount = toDeleteRefs.length;
  const chunkSize = 400;
  for (let i = 0; i < toDeleteRefs.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = toDeleteRefs.slice(i, i + chunkSize);
    chunk.forEach(ref => batch.delete(ref));
    if (i === 0) {
      batch.update(postRef, {
        commentsCount: FieldValue.increment(-deleteCount),
        lastActivityAt: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
  }

  return {ok:true, deletedCount:deleteCount};
});

async function deleteUserPostsInSpace(userId, spaceId) {
  const snapshot = await db.collection('communityPosts').where('userId', '==', userId).get();
  const posts = snapshot.docs.filter(item => item.data().communitySlug === spaceId && item.data().archived !== true);
  await Promise.all(posts.map(async item => {
    await Promise.all([
      db.recursiveDelete(item.ref),
      getStorage().bucket().deleteFiles({prefix:`community/posts/${item.id}/`, force:true})
        .catch(error => logger.warn('Space post media cleanup failed', {postId:item.id, spaceId, error:error.message}))
    ]);
  }));
  return posts.length;
}

async function requireSpaceManager(uid, spaceId) {
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  const [spaceSnapshot, adminSnapshot, blockSnapshot] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection('admins').doc(uid).get(),
    spaceRef.collection('blocks').doc(uid).get()
  ]);
  if (!spaceSnapshot.exists) throw new HttpsError('not-found', 'This space is unavailable.');
  if (blockSnapshot.exists) throw new HttpsError('permission-denied', 'This space is not available to your account.');
  const space = spaceSnapshot.data();
  if (space.creatorId !== uid && !adminSnapshot.exists) {
    throw new HttpsError('permission-denied', 'Space management permission is required.');
  }
  return {spaceRef, space, owner:space.creatorId === uid};
}

async function requireSpaceChatMember(uid, spaceId) {
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  if (spaceId === 'aias-assistant' || spaceId === 'aias_assistant') {
    return {
      spaceRef,
      space: { name: 'AIAS Assistant', chatEnabled: true, active: true, archived: false, isPrivate: false },
      manager: false
    };
  }
  const spaceSnapshot = await spaceRef.get();
  if (!spaceSnapshot.exists || spaceSnapshot.data().active !== true || spaceSnapshot.data().archived === true) throw new HttpsError('not-found', 'This space is unavailable.');
  const space = spaceSnapshot.data();

  if (space.isDirectMessage === true || spaceId.startsWith('dm-')) {
    const participants = Array.isArray(space.directParticipants) ? space.directParticipants : [];
    if (!participants.includes(uid) && space.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'You are not a participant in this conversation.');
    }
    return { spaceRef, space, manager: false };
  }

  const [memberSnapshot, adminSnapshot, blockSnapshot, chatBanSnapshot] = await Promise.all([
    spaceRef.collection('connections').doc(uid).get(),
    spaceRef.collection('admins').doc(uid).get(),
    spaceRef.collection('blocks').doc(uid).get(),
    spaceRef.collection('chatBans').doc(uid).get()
  ]);
  if (blockSnapshot.exists) throw new HttpsError('permission-denied', 'This space is not available to your account.');
  if (chatBanSnapshot.exists) throw new HttpsError('permission-denied', 'Your Messages access has been removed by a space administrator.');
  if (space.chatEnabled !== true) throw new HttpsError('failed-precondition', 'Messages have not been enabled for this space.');
  if (space.creatorId !== uid && !memberSnapshot.exists && !adminSnapshot.exists) throw new HttpsError('permission-denied', 'Connect to this space before opening its messages.');
  if (space.creatorId !== uid && !adminSnapshot.exists && memberSnapshot.data()?.chatAccessApproved === false) {
    throw new HttpsError('permission-denied', 'Ask a space administrator to approve your Messages access.');
  }
  return {spaceRef, space, manager:space.creatorId === uid || adminSnapshot.exists};
}

async function canReadSharedPost(uid, post) {
  const slug = String(post.communitySlug || 'main');
  if (slug === 'main') return true;
  const spaceRef = db.collection('communitySpaces').doc(slug);
  const [spaceSnapshot, block] = await Promise.all([spaceRef.get(), uid ? spaceRef.collection('blocks').doc(uid).get() : Promise.resolve(null)]);
  if (!spaceSnapshot.exists || block?.exists) return false;
  if (spaceSnapshot.data().isPrivate !== true) return true;
  const [member, admin] = await Promise.all([
    spaceRef.collection('connections').doc(uid).get(),
    spaceRef.collection('admins').doc(uid).get()
  ]);
  return spaceSnapshot.data().creatorId === uid || member.exists || admin.exists;
}

async function notifySpaceModeration({recipientId, actorId, spaceId, postId = '', type, reason, title}) {
  if (!recipientId || recipientId === actorId) return;
  const id = `${type}_${postId || spaceId}_${Date.now()}`;
  await db.collection('users').doc(recipientId).collection('notifications').doc(id).set({
    recipientId, actorId, actorName:'Space moderation', actorUsername:'', type,
    contentType:postId ? 'post' : 'user', postId, postTitle:String(title || '').slice(0, 160),
    detailId:spaceId, reason, read:false, createdAt:FieldValue.serverTimestamp()
  });
}

async function notifySpaceChatAccessRequest(spaceRef, space, requesterId) {
  const [admins, requester] = await Promise.all([
    spaceRef.collection('admins').get(),
    db.collection('users').doc(requesterId).get()
  ]);
  const actor = requester.exists ? requester.data() : {};
  const recipients = new Set([space.creatorId, ...admins.docs.map(item => item.id)].filter(id => id && id !== requesterId));
  await Promise.all([...recipients].map(recipientId => db.collection('users').doc(recipientId).collection('notifications').doc().set({
    recipientId, actorId:requesterId,
    actorName:String(actor.displayName || actor.username || 'Community member').slice(0, 100),
    actorUsername:String(actor.username || '').slice(0, 24),
    type:'space_chat_request', postId:'', postTitle:String(space.name || `a/${spaceRef.id}`).slice(0, 160),
    detailId:spaceRef.id, reason:'', read:false, createdAt:FieldValue.serverTimestamp()
  })));
}

async function runCommunityCompatibilityOperation(request) {
  const operation = String(request.data?.operation || '');
  if (!operation) return null;
  if (operation === 'check_space_handle') {
    const spaceId = String(request.data?.spaceId || '').trim().toLowerCase();
    if (spaceId === 'main' || !/^[a-z0-9-]{3,32}$/.test(spaceId)) return {ok:true, available:false};
    const snapshot = await db.collection('communitySpaces').doc(spaceId).get();
    return {ok:true, available:!snapshot.exists};
  }
  if (operation === 'create_space') {
    const profile = await requireCompleteProfile(request);
    const spaceId = String(request.data?.spaceId || '').trim().toLowerCase();
    if (spaceId === 'main' || !/^[a-z0-9-]{3,32}$/.test(spaceId)) throw new HttpsError('invalid-argument', 'Choose a valid, non-reserved space handle.');
    const ownedSpacesSnapshot = await db.collection('communitySpaces')
      .where('creatorId', '==', request.auth.uid)
      .get();
    const activeOwnedCount = ownedSpacesSnapshot.docs.filter(item => item.data().archived !== true).length;
    if (activeOwnedCount >= 5) {
      throw new HttpsError('resource-exhausted', 'You have reached the maximum limit of 5 owned spaces.');
    }
    const name = cleanText(request.data?.name, 80, 'Space name');
    const description = cleanText(request.data?.description, 360, 'Description');
    const canPublishPublicly = profile.mainThreadPostingAccess !== false;
    const isPrivate = !canPublishPublicly || request.data?.isPrivate === true;
    const isViewOnly = !isPrivate && request.data?.isViewOnly === true;
    const showInMainThread = !isPrivate && request.data?.showInMainThread === true;
    const ref = db.collection('communitySpaces').doc(spaceId);
    const spaceRecord = {
      name, description, symbol:String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase().slice(0, 4) || 'A',
      active:true, archived:false, moderationStatus:'clear', creatorId:request.auth.uid,
      creatorUsername:profile.username, imageBase64:'', bannerBase64:'', imageURL:'', bannerURL:'',
      isPrivate, isViewOnly, showInMainThread, createdAt:FieldValue.serverTimestamp()
    };
    try {
      const batch = db.batch();
      batch.create(ref, spaceRecord);
      stageSpaceAccess(batch, ref, spaceRecord, request.auth.uid, {manager:true, member:true, chatApproved:true});
      await batch.commit();
    } catch (error) {
      if (error?.code === 6 || error?.code === 'already-exists') throw new HttpsError('already-exists', 'That space handle is already taken.');
      throw error;
    }
    return {ok:true, spaceId, isPrivate, isViewOnly, showInMainThread};
  }
  if (operation === 'get_managed_spaces') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
    const spaces = await db.collection('communitySpaces').where('archived', '==', false).get();
    const ownedIds = spaces.docs.filter(item => item.data().creatorId === request.auth.uid).map(item => item.id);
    const candidates = spaces.docs.filter(item => item.data().creatorId !== request.auth.uid);
    const appointed = candidates.length
      ? await db.getAll(...candidates.map(item => item.ref.collection('admins').doc(request.auth.uid)))
      : [];
    const spaceIds = [...ownedIds, ...appointed.filter(item => item.exists).map(item => item.ref.parent.parent.id)];
    return {ok:true, spaceIds};
  }
  if (operation === 'enable_space_chat') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    if (space.chatEnabled === true) return {ok:true, enabled:true};
    const updatedSpace = {...space, chatEnabled:true};
    await spaceRef.set({chatEnabled:true, chatEnabledAt:FieldValue.serverTimestamp(), chatEnabledBy:request.auth.uid}, {merge:true});
    await rebuildSpaceAccessRecords(spaceRef, updatedSpace);
    return {ok:true, enabled:true};
  }
  if (operation === 'send_space_message') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to send messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const text = cleanText(request.data?.text, 2000, 'Message', false);
    const replyToId = request.data?.replyToId ? cleanId(request.data.replyToId, 'reply') : '';
    const sharedPostId = request.data?.sharedPostId ? cleanId(request.data.sharedPostId, 'post') : '';
    const imagePath = String(request.data?.imagePath || '').trim();
    const audioPath = String(request.data?.audioPath || '').trim();
    const audioDurationMs = Math.round(Number(request.data?.audioDurationMs || 0));
    if (!text && !sharedPostId && !imagePath && !audioPath) throw new HttpsError('invalid-argument', 'Write a message, send media, or share a post.');
    if (imagePath && audioPath) throw new HttpsError('invalid-argument', 'Send either an image or a voice message at one time.');
    const {spaceRef} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const profileSnapshot = await db.collection('users').doc(request.auth.uid).get();
    const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
    let reply = {};
    if (replyToId) {
      const replySnapshot = await spaceRef.collection('messages').doc(replyToId).get();
      if (!replySnapshot.exists) throw new HttpsError('not-found', 'The message you are replying to is unavailable.');
      const source = replySnapshot.data();
      reply = {
        replyToId,
        replyToSenderId:String(source.senderId || ''),
        replyToSenderName:String(source.senderName || 'Member').slice(0, 80),
        replyToText:String(source.text || (source.imagePath ? 'Photo' : source.audioPath ? 'Voice message' : source.sharedPostId ? 'Shared post' : 'Message')).slice(0, 180)
      };
    }
    if (sharedPostId) {
      const postSnapshot = await db.collection('communityPosts').doc(sharedPostId).get();
      if (!postSnapshot.exists || postSnapshot.data().archived === true || postSnapshot.data().published === false) throw new HttpsError('not-found', 'This post is unavailable.');
      if (!(await canReadSharedPost(request.auth.uid, postSnapshot.data()))) throw new HttpsError('permission-denied', 'You cannot share a private post you cannot access.');
    }
    let image = {};
    if (imagePath) {
      const safeSpace = spaceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeUser = request.auth.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!(new RegExp(`^community/space-messages/${safeSpace}/${safeUser}/[A-Za-z0-9_-]{8,128}\\.(?:jpg|jpeg|png|webp)$`)).test(imagePath)) {
        throw new HttpsError('permission-denied', 'Invalid space-message image path.');
      }
      try {
        const file = getStorage().bucket().file(imagePath);
        const [metadata] = await file.getMetadata();
        const contentType = String(metadata.contentType || '').toLowerCase();
        const size = Number(metadata.size || 0);
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || size < 1 || size > 8 * 1024 * 1024) {
          throw new HttpsError('invalid-argument', 'The chat image must be JPEG, PNG, or WebP and no larger than 8 MB.');
        }
        await revokeFirebaseDownloadToken(file, metadata);
        image = {imagePath, imageContentType:contentType, imageSize:size};
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('failed-precondition', 'The uploaded chat image could not be verified.');
      }
    }
    let audio = {};
    if (audioPath) {
      const safeSpace = spaceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeUser = request.auth.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!(new RegExp(`^community/space-messages/${safeSpace}/${safeUser}/[A-Za-z0-9_-]{8,128}\\.(?:m4a|mp4|webm|ogg|aac|mp3)$`)).test(audioPath)) throw new HttpsError('permission-denied', 'Invalid voice-message path.');
      if (!Number.isFinite(audioDurationMs) || audioDurationMs < 250 || audioDurationMs > 5 * 60 * 1000) throw new HttpsError('invalid-argument', 'Voice messages must be between 1 second and 5 minutes.');
      try {
        const file = getStorage().bucket().file(audioPath);
        const [metadata] = await file.getMetadata();
        const contentType = String(metadata.contentType || '').toLowerCase();
        const size = Number(metadata.size || 0);
        if (!['audio/webm','audio/mp4','audio/ogg','audio/aac','audio/mpeg'].includes(contentType) || size < 1 || size > 12 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Voice messages must use a supported audio format and be no larger than 12 MB.');
        await revokeFirebaseDownloadToken(file, metadata);
        audio = {audioPath, audioDurationMs, audioContentType:contentType, audioSize:size};
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('failed-precondition', 'The uploaded voice message could not be verified.');
      }
    }
    if (spaceId === 'aias-assistant' || spaceId === 'aias_assistant') {
      const userMessageRef = db.collection('users').doc(request.auth.uid).collection('aiMessages').doc();
      await userMessageRef.set({
        spaceId:'aias-assistant',
        senderId:request.auth.uid,
        senderName:String(profile.displayName || profile.username || 'Community member').slice(0, 80),
        senderUsername:String(profile.username || '').slice(0, 24),
        text,
        sharedPostId,
        ...image,
        ...audio,
        ...reply,
        createdAt:FieldValue.serverTimestamp()
      });
      processAiSpaceMessage({ userId:request.auth.uid, text, sharedPostId, imagePath, replyToId:reply.replyToId, db })
        .catch(err => logger.warn('[AI Assistant] processAiSpaceMessage error', { error: err.message }));
      return {ok:true, messageId:userMessageRef.id};
    }
    const messageRef = spaceRef.collection('messages').doc();
    await messageRef.set({
      senderId:request.auth.uid,
      senderName:String(profile.displayName || profile.username || 'Community member').slice(0, 80),
      senderUsername:String(profile.username || '').slice(0, 24),
      text,
      sharedPostId,
      ...image,
      ...audio,
      ...reply,
      createdAt:FieldValue.serverTimestamp()
    });
    const isAiTriggered = /(?:^|\s)@(?:ai|AI|Ai|gemini|Gemini|aias|AIAS)(?:\s|$|[،!?.])/i.test(text) ||
                          reply.replyToSenderId === 'aias_assistant';

    if (isAiTriggered) {
      processSpaceChatAiReply({
        spaceId,
        spaceRef,
        userId: request.auth.uid,
        text,
        sharedPostId,
        imagePath,
        replyToId: messageRef.id,
        db
      }).catch(err => logger.warn('[AI Assistant] processSpaceChatAiReply error', { spaceId, error: err.message }));
    }

    const usernames = [...new Set((text.match(/(?:^|\s)@([a-z0-9_]{3,24})/gi) || []).map(value => value.trim().slice(1).toLowerCase()))];
    const spaces = [...new Set([...text.matchAll(/(?:^|\s)@?a\/([a-z0-9-]{3,32})/gi)].map(match => match[1].toLowerCase()))];
    const recipients = new Set();
    await Promise.all(usernames.map(async username => {
      const index = await db.collection('usernames').doc(username).get();
      if (index.exists && index.data().userId !== request.auth.uid) recipients.add(index.data().userId);
    }));
    await Promise.all(spaces.map(async slug => {
      const mentioned = await db.collection('communitySpaces').doc(slug).get();
      if (mentioned.exists && mentioned.data().creatorId !== request.auth.uid) recipients.add(mentioned.data().creatorId);
    }));
    if (reply.replyToSenderId && reply.replyToSenderId !== request.auth.uid) recipients.add(reply.replyToSenderId);
    await Promise.all([...recipients].map(async recipientId => {
      const { preferences, mutedSpaceChats } = await getRecipientNotificationPreferences(recipientId);
      if (preferences.chatMessages === false) return;
      if (mutedSpaceChats.includes(spaceId)) return;
      if (reply.replyToSenderId === recipientId && preferences.chatReplies === false) return;
      if (reply.replyToSenderId !== recipientId && preferences.chatMentions === false) return;

      await db.collection('users').doc(recipientId).collection('notifications').doc(`space_message_${messageRef.id}`).set({
        recipientId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 80), actorUsername:String(profile.username || ''),
        type:'space_message', postId:sharedPostId, postTitle:text.slice(0, 120) || (imagePath ? 'Sent a photo' : audioPath ? 'Sent a voice message' : 'Shared a post'), detailId:spaceId,
        read:false, createdAt:FieldValue.serverTimestamp()
      });
    }));
    return {ok:true, messageId:messageRef.id};
  }
  if (operation === 'mark_space_messages_seen') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to update message receipts.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const messageId = cleanId(request.data?.messageId, 'message');
    const {spaceRef} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const messageSnapshot = await spaceRef.collection('messages').doc(messageId).get();
    if (!messageSnapshot.exists) throw new HttpsError('not-found', 'The last message is unavailable.');
    await spaceRef.collection('messageReads').doc(request.auth.uid).set({
      userId:request.auth.uid,
      lastMessageId:messageId,
      lastMessageCreatedAt:messageSnapshot.data().createdAt || FieldValue.serverTimestamp(),
      seenAt:FieldValue.serverTimestamp()
    }, {merge:true});
    return {ok:true};
  }
  if (operation === 'toggle_space_message_applause') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to applaud messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const messageId = cleanId(request.data?.messageId, 'message');
    const {spaceRef} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const messageRef = spaceRef.collection('messages').doc(messageId);
    const applauseRef = messageRef.collection('applause').doc(request.auth.uid);
    const result = await db.runTransaction(async transaction => {
      const [messageSnapshot, applauseSnapshot] = await Promise.all([transaction.get(messageRef), transaction.get(applauseRef)]);
      if (!messageSnapshot.exists || messageSnapshot.data().deleted === true) throw new HttpsError('not-found', 'This message is unavailable.');
      const next = Math.max(0, Number(messageSnapshot.data().applauseCount || 0) + (applauseSnapshot.exists ? -1 : 1));
      if (applauseSnapshot.exists) transaction.delete(applauseRef); else transaction.set(applauseRef, {userId:request.auth.uid, createdAt:FieldValue.serverTimestamp()});
      transaction.update(messageRef, {applauseCount:next});
      return {applauded:!applauseSnapshot.exists, count:next};
    });
    return {ok:true, ...result};
  }
  if (operation === 'set_space_message_reaction') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to react to messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const messageId = cleanId(request.data?.messageId, 'message');
    const emoji = String(request.data?.emoji || '');
    const allowedEmojis = ['❤️','😂','😮','😢','🔥','👏'];
    if (!allowedEmojis.includes(emoji)) throw new HttpsError('invalid-argument', 'Choose a supported reaction.');
    const {spaceRef} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const messageRef = spaceRef.collection('messages').doc(messageId);
    const reactionRef = messageRef.collection('reactions').doc(request.auth.uid);
    const result = await db.runTransaction(async transaction => {
      const [messageSnapshot, reactionSnapshot] = await Promise.all([transaction.get(messageRef), transaction.get(reactionRef)]);
      if (!messageSnapshot.exists || messageSnapshot.data().deleted === true) throw new HttpsError('not-found', 'This message is unavailable.');
      const previous = reactionSnapshot.exists ? String(reactionSnapshot.data().emoji || '') : '';
      const counts = {...(messageSnapshot.data().reactionCounts || {})};
      if (previous) counts[previous] = Math.max(0, Number(counts[previous] || 0) - 1);
      if (counts[previous] === 0) delete counts[previous];
      const removed = previous === emoji;
      if (removed) transaction.delete(reactionRef);
      else {
        counts[emoji] = Number(counts[emoji] || 0) + 1;
        transaction.set(reactionRef, {userId:request.auth.uid, emoji, createdAt:FieldValue.serverTimestamp()});
      }
      transaction.update(messageRef, {reactionCounts:counts});
      return {emoji:removed ? '' : emoji, reactionCounts:counts};
    });
    return {ok:true, ...result};
  }
  if (operation === 'request_space_chat_access') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to request Messages access.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const spaceRef = db.collection('communitySpaces').doc(spaceId);
    const [spaceSnapshot, membership, adminSnapshot, blockSnapshot, banSnapshot, requestSnapshot] = await Promise.all([
      spaceRef.get(), spaceRef.collection('connections').doc(request.auth.uid).get(), spaceRef.collection('admins').doc(request.auth.uid).get(),
      spaceRef.collection('blocks').doc(request.auth.uid).get(), spaceRef.collection('chatBans').doc(request.auth.uid).get(),
      spaceRef.collection('chatAccessRequests').doc(request.auth.uid).get()
    ]);
    if (!spaceSnapshot.exists || spaceSnapshot.data().active !== true || spaceSnapshot.data().archived === true) throw new HttpsError('not-found', 'This space is unavailable.');
    if (blockSnapshot.exists) throw new HttpsError('permission-denied', 'Messages access is not available to your account.');
    if (spaceSnapshot.data().creatorId === request.auth.uid || adminSnapshot.exists) return {ok:true, status:'approved'};
    if (!membership.exists) throw new HttpsError('permission-denied', 'Connect to this space before requesting Messages access.');
    if (membership.data().chatAccessApproved !== false && !banSnapshot.exists) return {ok:true, status:'approved'};
    if (requestSnapshot.exists && requestSnapshot.data().status === 'pending') return {ok:true, status:'pending'};
    await spaceRef.collection('chatAccessRequests').doc(request.auth.uid).set({
      userId:request.auth.uid, spaceSlug:spaceId, status:'pending', requestedAt:FieldValue.serverTimestamp(), requestedAfterBan:banSnapshot.exists
    }, {merge:true});
    await notifySpaceChatAccessRequest(spaceRef, spaceSnapshot.data(), request.auth.uid);
    return {ok:true, status:'pending'};
  }
  if (operation === 'review_space_connection') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage space access.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const approved = request.data?.approved === true;
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    const [requestSnapshot, blockSnapshot] = await Promise.all([
      spaceRef.collection('connectionRequests').doc(userId).get(),
      spaceRef.collection('blocks').doc(userId).get()
    ]);
    if (!requestSnapshot.exists || requestSnapshot.data().status !== 'pending') throw new HttpsError('failed-precondition', 'This access request is no longer pending.');
    if (approved && blockSnapshot.exists) throw new HttpsError('failed-precondition', 'Unblock this user before approving access.');
    const batch = db.batch();
    batch.set(spaceRef.collection('connectionRequests').doc(userId), {status:approved ? 'approved' : 'denied', reviewedAt:FieldValue.serverTimestamp(), reviewedBy:request.auth.uid}, {merge:true});
    if (approved) {
      const record = {userId, spaceSlug:spaceId, chatAccessApproved:false, createdAt:FieldValue.serverTimestamp()};
      batch.set(spaceRef.collection('connections').doc(userId), record);
      batch.set(db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId), record);
      stageSpaceAccess(batch, spaceRef, space, userId, {member:true, chatApproved:false});
    }
    await batch.commit();
    return {ok:true, approved};
  }
  if (operation === 'review_space_chat_access') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage Messages access.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const approved = request.data?.approved === true;
    const ban = request.data?.ban === true;
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    const memberRef = spaceRef.collection('connections').doc(userId);
    const [memberSnapshot, banSnapshot, blockSnapshot, adminSnapshot] = await Promise.all([
      memberRef.get(),
      spaceRef.collection('chatBans').doc(userId).get(),
      spaceRef.collection('blocks').doc(userId).get(),
      spaceRef.collection('admins').doc(userId).get()
    ]);
    if (!memberSnapshot.exists) throw new HttpsError('failed-precondition', 'This user is not a connected member.');
    if (approved && blockSnapshot.exists) throw new HttpsError('failed-precondition', 'Unblock this user before approving Messages access.');
    const batch = db.batch();
    if (approved && banSnapshot.exists) batch.delete(spaceRef.collection('chatBans').doc(userId));
    if (!approved && ban) batch.set(spaceRef.collection('chatBans').doc(userId), {userId, reason:'Messages access removed by a space administrator.', kickedBy:request.auth.uid, kickedAt:FieldValue.serverTimestamp()});
    batch.set(memberRef, {chatAccessApproved:approved, chatAccessReviewedAt:FieldValue.serverTimestamp(), chatAccessReviewedBy:request.auth.uid}, {merge:true});
    batch.set(db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId), {chatAccessApproved:approved}, {merge:true});
    batch.set(spaceRef.collection('chatAccessRequests').doc(userId), {userId, spaceSlug:spaceId, status:approved ? 'approved' : 'denied', reviewedAt:FieldValue.serverTimestamp(), reviewedBy:request.auth.uid}, {merge:true});
    stageSpaceAccess(batch, spaceRef, space, userId, {
      manager:adminSnapshot.exists,
      member:true,
      blocked:blockSnapshot.exists,
      chatBanned:approved ? false : (ban || banSnapshot.exists),
      chatApproved:approved
    });
    await batch.commit();
    return {ok:true, approved};
  }
  if (operation === 'edit_space_message') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to edit messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const messageId = cleanId(request.data?.messageId, 'message');
    const text = cleanText(request.data?.text, 2000, 'Message', false);
    const {spaceRef} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const messageRef = spaceRef.collection('messages').doc(messageId);
    const snapshot = await messageRef.get();
    if (!snapshot.exists || snapshot.data().deleted === true) throw new HttpsError('not-found', 'This message is unavailable.');
    const message = snapshot.data();
    if (message.senderId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can edit only your own messages.');
    if (!text && !message.imagePath && !message.audioPath && !message.sharedPostId) throw new HttpsError('invalid-argument', 'A text-only message cannot be empty.');
    await messageRef.update({text, editedAt:FieldValue.serverTimestamp()});
    return {ok:true};
  }
  if (operation === 'delete_space_message') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const messageId = cleanId(request.data?.messageId, 'message');
    const {spaceRef, manager} = await requireSpaceChatMember(request.auth.uid, spaceId);
    const messageRef = spaceRef.collection('messages').doc(messageId);
    const snapshot = await messageRef.get();
    if (!snapshot.exists || snapshot.data().deleted === true) return {ok:true};
    const message = snapshot.data();
    if (message.senderId !== request.auth.uid && !manager) throw new HttpsError('permission-denied', 'Only the sender or a space administrator can delete this message.');
    await messageRef.update({
      deleted:true, deletedAt:FieldValue.serverTimestamp(), deletedBy:request.auth.uid,
      deletedByModerator:message.senderId !== request.auth.uid,
      text:'', sharedPostId:'', imagePath:'', imageContentType:'', imageSize:0,
      audioPath:'', audioContentType:'', audioSize:0, audioDurationMs:0
    });
    if (message.imagePath) await getStorage().bucket().file(String(message.imagePath)).delete({ignoreNotFound:true}).catch(error => logger.warn('Deleted chat image cleanup failed', {spaceId, messageId, error:error.message}));
    if (message.audioPath) await getStorage().bucket().file(String(message.audioPath)).delete({ignoreNotFound:true}).catch(error => logger.warn('Deleted chat audio cleanup failed', {spaceId, messageId, error:error.message}));
    return {ok:true};
  }
  if (operation === 'kick_space_chat') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage space messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const reason = cleanReason(request.data?.reason);
    const {spaceRef, space, owner} = await requireSpaceManager(request.auth.uid, spaceId);
    if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be removed from messages.');
    const [targetAdmin, membership] = await Promise.all([
      spaceRef.collection('admins').doc(userId).get(),
      spaceRef.collection('connections').doc(userId).get()
    ]);
    if (targetAdmin.exists && !owner) throw new HttpsError('permission-denied', 'Only the space owner can remove another administrator from messages.');
    const batch = db.batch();
    batch.set(spaceRef.collection('chatBans').doc(userId), {userId, reason, kickedBy:request.auth.uid, kickedAt:FieldValue.serverTimestamp()});
    stageSpaceAccess(batch, spaceRef, space, userId, {manager:targetAdmin.exists, member:membership.exists, chatBanned:true, chatApproved:membership.data()?.chatAccessApproved !== false});
    await batch.commit();
    await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_chat_removed', reason, title:space.name});
    return {ok:true};
  }
  if (operation === 'block_space_user') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage this space.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const reason = cleanReason(request.data?.reason);
    const {spaceRef, space, owner} = await requireSpaceManager(request.auth.uid, spaceId);
    if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be blocked.');
    const targetAdmin = await spaceRef.collection('admins').doc(userId).get();
    if (targetAdmin.exists && !owner) throw new HttpsError('permission-denied', 'Only the owner can block another administrator.');
    const batch = db.batch();
    batch.set(spaceRef.collection('blocks').doc(userId), {userId, reason, blockedBy:request.auth.uid, blockedAt:FieldValue.serverTimestamp()});
    batch.set(db.collection('users').doc(userId).collection('blockedSpaces').doc(spaceId), {spaceId, blockedBy:request.auth.uid, blockedAt:FieldValue.serverTimestamp()});
    batch.delete(spaceRef.collection('connections').doc(userId));
    batch.delete(db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId));
    batch.delete(spaceRef.collection('connectionRequests').doc(userId));
    batch.delete(spaceRef.collection('chatAccessRequests').doc(userId));
    batch.delete(spaceRef.collection('chatBans').doc(userId));
    if (targetAdmin.exists) batch.delete(spaceRef.collection('admins').doc(userId));
    stageSpaceAccess(batch, spaceRef, space, userId, {blocked:true});
    await batch.commit();
    await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_member_removed', reason, title:space.name});
    return {ok:true};
  }
  if (operation === 'unblock_space_user') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage this space.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const {spaceRef} = await requireSpaceManager(request.auth.uid, spaceId);
    const batch = db.batch();
    batch.delete(spaceRef.collection('blocks').doc(userId));
    batch.delete(db.collection('users').doc(userId).collection('blockedSpaces').doc(spaceId));
    batch.delete(spaceRef.collection('access').doc(userId));
    await batch.commit();
    return {ok:true};
  }
  if (operation === 'unban_space_chat') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage space messages.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    const [membership, admin, block] = await Promise.all([
      spaceRef.collection('connections').doc(userId).get(),
      spaceRef.collection('admins').doc(userId).get(),
      spaceRef.collection('blocks').doc(userId).get()
    ]);
    const batch = db.batch();
    batch.delete(spaceRef.collection('chatBans').doc(userId));
    stageSpaceAccess(batch, spaceRef, space, userId, {
      manager:admin.exists,
      member:membership.exists,
      blocked:block.exists,
      chatBanned:false,
      chatApproved:admin.exists || (membership.exists && membership.data().chatAccessApproved !== false)
    });
    await batch.commit();
    return {ok:true};
  }
  if (operation === 'request_main_thread_access') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to apply.');
    const ref = db.collection('users').doc(request.auth.uid);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().profileComplete !== true) throw new HttpsError('failed-precondition', 'Complete your profile first.');
    if (snapshot.data().mainThreadPostingAccess !== false) return {ok:true, status:'approved'};
    await ref.set({mainThreadPostingAccess:false, mainThreadAccessStatus:'pending', mainThreadAccessRequestedAt:FieldValue.serverTimestamp()}, {merge:true});
    return {ok:true, status:'pending'};
  }
  if (operation === 'complete_profile') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to complete your profile.');
    const userId = request.auth.uid;
    const username = String(request.data?.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new HttpsError('invalid-argument', 'Use a valid username.');
    const displayName = cleanText(request.data?.displayName, 100, 'Name');
    const school = cleanText(request.data?.school, 160, 'School or organization');
    const city = cleanText(request.data?.city, 120, 'City');
    const bio = cleanText(request.data?.bio, 1000, 'Bio');
    const interests = cleanText(request.data?.interests, 500, 'Interests', false);
    const photoURL = cleanText(request.data?.photoURL, 2000, 'Profile image', false);
    const bannerURL = cleanText(request.data?.bannerURL, 2000, 'Profile banner', false);
    if ((photoURL && !/^https:\/\//i.test(photoURL)) || (bannerURL && !/^https:\/\//i.test(bannerURL))) throw new HttpsError('invalid-argument', 'Profile media must use secure HTTPS URLs.');
    const userRef = db.collection('users').doc(userId);
    const usernameRef = db.collection('usernames').doc(username);
    await db.runTransaction(async transaction => {
      const [userSnapshot, usernameSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(usernameRef)]);
      if (usernameSnapshot.exists && usernameSnapshot.data().userId !== userId) throw new HttpsError('already-exists', 'That username is already taken.');
      if (userSnapshot.exists && userSnapshot.data().username && userSnapshot.data().username !== username) throw new HttpsError('failed-precondition', 'Your username is permanent and cannot be changed.');
      if (!usernameSnapshot.exists) transaction.create(usernameRef, {userId, username, createdAt:FieldValue.serverTimestamp()});
      const defaults = userSnapshot.exists && 'mainThreadPostingAccess' in userSnapshot.data() ? {} : {mainThreadPostingAccess:false, mainThreadAccessStatus:'not_requested'};
      transaction.set(userRef, {
        email:String(request.auth.token?.email || '').slice(0, 320), username, displayName, school, city, bio, interests,
        photoBase64:'', bannerBase64:'', photoURL, bannerURL, profileComplete:true,
        ...defaults, updatedAt:FieldValue.serverTimestamp()
      }, {merge:true});
    });
    return {ok:true, username};
  }
  if (operation === 'review_main_thread_access') {
    await requireCommunityAdmin(request);
    const userId = cleanId(request.data?.userId, 'user');
    const decision = String(request.data?.decision || '');
    if (!['grant', 'deny', 'revoke'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose grant, deny, or revoke.');
    const ref = db.collection('users').doc(userId);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', 'User not found.');
    const granted = decision === 'grant';
    await ref.set({mainThreadPostingAccess:granted, mainThreadAccessStatus:granted ? 'approved' : decision === 'deny' ? 'denied' : 'revoked', mainThreadAccessReviewedAt:FieldValue.serverTimestamp(), mainThreadAccessReviewedBy:request.auth.uid}, {merge:true});
    await ref.collection('notifications').doc(`main_thread_access_${Date.now()}`).set({recipientId:userId, actorId:request.auth.uid, actorName:'Community administration', actorUsername:'', type:granted ? 'main_thread_access_granted' : 'main_thread_access_denied', postId:'', postTitle:'Main-thread posting access', detailId:'', reason:granted ? '' : 'Your main-thread posting request was not approved.', read:false, createdAt:FieldValue.serverTimestamp()});
    return {ok:true, granted};
  }
  if (operation === 'set_space_visibility') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const isPrivate = request.data?.isPrivate === true;
    const isViewOnly = !isPrivate && request.data?.isViewOnly === true;
    const showInMainThread = !isPrivate && request.data?.showInMainThread === true;
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    if (!isPrivate && !isViewOnly) {
      const connections = await spaceRef.collection('connections').get();
      const ids = [...new Set([space.creatorId, ...connections.docs.map(item => item.id)])];
      const profiles = await Promise.all(ids.map(id => db.collection('users').doc(id).get()));
      const blockedUserIds = profiles.filter(item => !item.exists || item.data().mainThreadPostingAccess === false).map(item => item.id);
      if (blockedUserIds.length) throw new HttpsError('failed-precondition', `This space cannot become public while ${blockedUserIds.length} member(s) lack main-thread posting access. Keep it private or remove those members.`, {blockedUserIds});
    }
    let updatedPostCount = 0;
    if (isPrivate) updatedPostCount = await updateSpacePostVisibility(spaceId, 'private');
    await spaceRef.set({isPrivate, isViewOnly, showInMainThread, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    await rebuildSpaceAccessRecords(spaceRef, {...space, isPrivate, isViewOnly, showInMainThread});
    if (!isPrivate) updatedPostCount = await updateSpacePostVisibility(spaceId, 'public');
    return {ok:true, isPrivate, isViewOnly, showInMainThread, updatedPostCount};
  }
  if (operation === 'delete_owned_space') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete this space.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const spaceRef = db.collection('communitySpaces').doc(spaceId);
    const snapshot = await spaceRef.get();
    if (!snapshot.exists || snapshot.data().creatorId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the space owner can delete this space.');
    const members = await spaceRef.collection('connections').get();
    for (let offset = 0; offset < members.docs.length; offset += 400) {
      const batch = db.batch();
      members.docs.slice(offset, offset + 400).forEach(item => batch.delete(db.collection('users').doc(item.id).collection('connectedSpaces').doc(spaceId)));
      await batch.commit();
    }
    await Promise.all([
      db.recursiveDelete(spaceRef),
      getStorage().bucket().deleteFiles({prefix:`community/spaces/${spaceId}/`, force:true}).catch(error => logger.warn('Deleted space media cleanup failed', {spaceId, error:error.message}))
    ]);
    return {ok:true};
  }
  if (operation === 'moderate_space_post') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to moderate this space.');
    const postId = cleanId(request.data?.postId, 'post');
    const action = String(request.data?.action || '');
    if (!['warn', 'delete'].includes(action)) throw new HttpsError('invalid-argument', 'Choose warn or delete.');
    const reason = cleanReason(request.data?.reason);
    const postRef = db.collection('communityPosts').doc(postId);
    const postSnapshot = await postRef.get();
    if (!postSnapshot.exists) throw new HttpsError('not-found', 'This post no longer exists.');
    const post = postSnapshot.data();
    const spaceId = String(post.communitySlug || 'main');
    if (spaceId === 'main') throw new HttpsError('permission-denied', 'This is not a space post.');
    await requireSpaceManager(request.auth.uid, spaceId);
    if (action === 'warn') {
      await notifySpaceModeration({recipientId:post.userId, actorId:request.auth.uid, spaceId, postId, type:'space_post_warned', reason, title:post.title});
      return {ok:true, action};
    }
    await Promise.all([db.recursiveDelete(postRef), getStorage().bucket().deleteFiles({prefix:`community/posts/${postId}/`, force:true}).catch(error => logger.warn('Moderated space post media cleanup failed', {postId, error:error.message}))]);
    await notifySpaceModeration({recipientId:post.userId, actorId:request.auth.uid, spaceId, postId, type:'space_post_deleted', reason, title:post.title});
    return {ok:true, action};
  }
  if (operation === 'warn_space_member') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to moderate this space.');
    const spaceId = cleanId(request.data?.spaceId, 'space');
    const userId = cleanId(request.data?.userId, 'user');
    const reason = cleanReason(request.data?.reason);
    const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
    if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be warned.');
    if (!(await spaceRef.collection('connections').doc(userId).get()).exists) throw new HttpsError('failed-precondition', 'This user is not a connected space member.');
    await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_member_warned', reason, title:space.name});
    return {ok:true};
  }
  throw new HttpsError('invalid-argument', 'Unsupported community operation.');
}

functions.setCommunitySpaceConnection = onCall(async request => {
  const compatibilityResult = await runCommunityCompatibilityOperation(request);
  if (compatibilityResult) return compatibilityResult;
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to connect with spaces.');
  const userId = request.auth.uid;
  const spaceId = cleanId(request.data?.spaceId, 'space');
  if (spaceId === 'main' || !/^[a-z0-9-]{3,32}$/.test(spaceId)) throw new HttpsError('invalid-argument', 'Invalid space handle.');
  const connected = request.data?.connected === true;
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  const spaceSnapshot = await spaceRef.get();
  if (!spaceSnapshot.exists || spaceSnapshot.data().active !== true || spaceSnapshot.data().archived === true) {
    throw new HttpsError('not-found', 'This space is unavailable.');
  }
  const space = spaceSnapshot.data();
  const memberRef = spaceRef.collection('connections').doc(userId);
  const userSpaceRef = db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId);
  const requestRef = spaceRef.collection('connectionRequests').doc(userId);

  if (connected) {
    if ((await spaceRef.collection('blocks').doc(userId).get()).exists) throw new HttpsError('permission-denied', 'This space is not available to your account.');
    if (space.creatorId === userId) return {ok:true, status:'owner'};
    if (space.isPrivate === true || space.isViewOnly === true) {
      const membership = await memberRef.get();
      if (membership.exists) return {ok:true, status:'connected'};
      await requestRef.set({userId, spaceSlug:spaceId, status:'pending', requestedAt:FieldValue.serverTimestamp()});
      return {ok:true, status:'requested'};
    }
    const record = {userId, spaceSlug:spaceId, chatAccessApproved:false, createdAt:FieldValue.serverTimestamp()};
    const batch = db.batch();
    batch.set(memberRef, record);
    batch.set(userSpaceRef, record);
    stageSpaceAccess(batch, spaceRef, space, userId, {member:true, chatApproved:false});
    await batch.commit();
    return {ok:true, status:'connected'};
  }

  const deletedPosts = await deleteUserPostsInSpace(userId, spaceId);
  const batch = db.batch();
  batch.delete(memberRef);
  batch.delete(userSpaceRef);
  batch.delete(requestRef);
  batch.delete(spaceRef.collection('chatAccessRequests').doc(userId));
  batch.delete(spaceRef.collection('chatBans').doc(userId));
  batch.delete(spaceRef.collection('access').doc(userId));
  await batch.commit();
  return {ok:true, status:'disconnected', deletedPosts};
});

functions.removeCommunitySpaceMember = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const userId = cleanId(request.data?.userId, 'user');
  const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
  if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be removed.');
  const deletedPosts = await deleteUserPostsInSpace(userId, spaceId);
  const batch = db.batch();
  batch.delete(spaceRef.collection('connections').doc(userId));
  batch.delete(db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId));
  batch.delete(spaceRef.collection('chatAccessRequests').doc(userId));
  batch.delete(spaceRef.collection('chatBans').doc(userId));
  batch.delete(spaceRef.collection('access').doc(userId));
  batch.set(spaceRef.collection('connectionRequests').doc(userId), {
    userId, spaceSlug:spaceId, status:'removed', reviewedAt:FieldValue.serverTimestamp(), reviewedBy:request.auth.uid
  }, {merge:true});
  await batch.commit();
  await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_member_removed', reason:'Access removed by a space administrator.', title:space.name});
  return {ok:true, deletedPosts};
});

functions.setCommunitySpaceAdmin = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const userId = cleanId(request.data?.userId, 'user');
  const enabled = request.data?.enabled === true;
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  const spaceSnapshot = await spaceRef.get();
  if (!spaceSnapshot.exists || spaceSnapshot.data().creatorId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the space owner can appoint administrators.');
  }
  if (userId === request.auth.uid) throw new HttpsError('failed-precondition', 'The owner already manages this space.');
  const [userSnapshot, membership] = await Promise.all([
    db.collection('users').doc(userId).get(), spaceRef.collection('connections').doc(userId).get()
  ]);
  if (!userSnapshot.exists || !membership.exists) throw new HttpsError('failed-precondition', 'Choose a connected space member.');
  const adminRef = spaceRef.collection('admins').doc(userId);
  const [block, chatBan] = await Promise.all([
    spaceRef.collection('blocks').doc(userId).get(),
    spaceRef.collection('chatBans').doc(userId).get()
  ]);
  if (enabled && (block.exists || chatBan.exists)) throw new HttpsError('failed-precondition', 'Unblock and unban this member before appointing them as an administrator.');
  const batch = db.batch();
  if (enabled) batch.set(adminRef, {userId, addedBy:request.auth.uid, createdAt:FieldValue.serverTimestamp()});
  else batch.delete(adminRef);
  stageSpaceAccess(batch, spaceRef, spaceSnapshot.data(), userId, {
    manager:enabled,
    member:true,
    blocked:block.exists,
    chatBanned:chatBan.exists,
    chatApproved:enabled || membership.data().chatAccessApproved !== false
  });
  await batch.commit();
  return {ok:true, enabled};
});

// Callable endpoints must accept browser preflight publicly; authorization is enforced below.
functions.moderateCommunitySpacePost = onCall({invoker:'public'}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to moderate this space.');
  const postId = cleanId(request.data?.postId, 'post');
  const action = String(request.data?.action || '');
  if (!['warn', 'delete'].includes(action)) throw new HttpsError('invalid-argument', 'Choose warn or delete.');
  const reason = cleanReason(request.data?.reason);
  const postRef = db.collection('communityPosts').doc(postId);
  const postSnapshot = await postRef.get();
  if (!postSnapshot.exists) throw new HttpsError('not-found', 'This post no longer exists.');
  const post = postSnapshot.data();
  const spaceId = String(post.communitySlug || 'main');
  if (spaceId === 'main') throw new HttpsError('permission-denied', 'This is not a space post.');
  await requireSpaceManager(request.auth.uid, spaceId);
  if (action === 'warn') {
    await notifySpaceModeration({recipientId:post.userId, actorId:request.auth.uid, spaceId, postId, type:'space_post_warned', reason, title:post.title});
    return {ok:true, action};
  }
  await Promise.all([
    db.recursiveDelete(postRef),
    getStorage().bucket().deleteFiles({prefix:`community/posts/${postId}/`, force:true}).catch(error => logger.warn('Moderated space post media cleanup failed', {postId, error:error.message}))
  ]);
  await notifySpaceModeration({recipientId:post.userId, actorId:request.auth.uid, spaceId, postId, type:'space_post_deleted', reason, title:post.title});
  return {ok:true, action};
});

functions.warnCommunitySpaceMember = onCall({invoker:'public'}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to moderate this space.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const userId = cleanId(request.data?.userId, 'user');
  const reason = cleanReason(request.data?.reason);
  const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
  if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be warned.');
  if (!(await spaceRef.collection('connections').doc(userId).get()).exists) throw new HttpsError('failed-precondition', 'This user is not a connected space member.');
  await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_member_warned', reason, title:space.name});
  return {ok:true};
});

async function communityAdminAuthorization(request) {
  if (!request.auth?.uid || !request.auth.token?.email) throw new HttpsError('unauthenticated', 'Sign in as an administrator.');
  const email = String(request.auth.token.email).trim().toLowerCase();
  const [adminsDoc, rolesDoc, assignmentsDoc] = await Promise.all([
    db.doc('config/admins').get(), db.doc('config/roles').get(), db.doc('config/userRoles').get()
  ]);
  const legacy = Array.isArray(adminsDoc.data()?.admins) && adminsDoc.data().admins.map(item => String(item).toLowerCase()).includes(email);
  const assignments = assignmentsDoc.data()?.assignments || {};
  const roleId = assignments[email];
  const roles = rolesDoc.data()?.roles || {};
  const permissions = roles?.[roleId]?.permissions || [];
  const isSuperAdmin = legacy || roleId === 'super_admin' || permissions.includes('*');
  return {uid:request.auth.uid, email, legacy, roleId, roles, assignments, permissions, isSuperAdmin};
}

async function requireCommunityAdmin(request) {
  const access = await communityAdminAuthorization(request);
  if (!access.isSuperAdmin && !access.permissions.includes('manage_community')) {
    throw new HttpsError('permission-denied', 'Community management permission is required.');
  }
  return {uid:access.uid, email:access.email};
}

function safeCommunityRoles(input = {}) {
  const allowed = /^(view|manage)_(professional|community|events|articles|library|models3d|fbd|market)$/;
  const roles = {};
  Object.entries(input).forEach(([id, role]) => {
    if (!/^[a-z0-9_-]{2,48}$/.test(id)) return;
    roles[id] = {
      name:String(role?.name || '').trim().slice(0, 80),
      description:String(role?.description || '').trim().slice(0, 240),
      permissions:id === 'super_admin' ? ['*'] : [...new Set((Array.isArray(role?.permissions) ? role.permissions : []).map(String).filter(permission => allowed.test(permission)))],
      builtIn:role?.builtIn === true
    };
  });
  roles.super_admin = {name:'Super Admin', description:'Complete access, including roles and user assignments.', permissions:['*'], builtIn:true};
  return roles;
}

functions.getCommunityAdminAccess = onCall(async request => {
  try {
    const access = await communityAdminAuthorization(request);
    const allowed = access.isSuperAdmin || access.permissions.length > 0;
    return {
      allowed, isSuperAdmin:access.isSuperAdmin, isLegacyAdmin:access.legacy,
      roleId:access.isSuperAdmin ? 'super_admin' : access.roleId || null,
      role:access.isSuperAdmin ? access.roles.super_admin || null : access.roles[access.roleId] || null,
      permissions:access.isSuperAdmin ? ['*'] : access.permissions,
      roles:access.isSuperAdmin ? access.roles : {}, assignments:access.isSuperAdmin ? access.assignments : {},
      legacyAdmins:[]
    };
  } catch (error) {
    if (error instanceof HttpsError && ['unauthenticated', 'permission-denied'].includes(error.code)) return {allowed:false, isSuperAdmin:false, roleId:null, role:null, permissions:[], roles:{}, assignments:{}, legacyAdmins:[]};
    throw error;
  }
});

functions.manageCommunityRoleConfiguration = onCall(async request => {
  const access = await communityAdminAuthorization(request);
  if (!access.isSuperAdmin) throw new HttpsError('permission-denied', 'Super administrator access is required.');
  const operation = String(request.data?.operation || '');
  if (operation === 'ensure') {
    const roles = safeCommunityRoles({...request.data?.defaultRoles, ...access.roles});
    const batch = db.batch();
    batch.set(db.doc('config/roles'), {roles, updatedAt:FieldValue.serverTimestamp(), updatedBy:access.email}, {merge:false});
    batch.set(db.doc('config/userRoles'), {assignments:access.assignments, updatedAt:FieldValue.serverTimestamp(), updatedBy:access.email}, {merge:false});
    await batch.commit();
    return {ok:true};
  }
  if (operation === 'save_roles') {
    const roles = safeCommunityRoles(request.data?.roles || {});
    await db.doc('config/roles').set({roles, updatedAt:FieldValue.serverTimestamp(), updatedBy:access.email}, {merge:false});
    return {ok:true, roles};
  }
  if (operation === 'save_assignments') {
    const roles = access.roles || {};
    const assignments = {};
    Object.entries(request.data?.assignments || {}).forEach(([email, roleId]) => {
      const normalized = String(email).trim().toLowerCase();
      const safeRoleId = String(roleId || '');
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && roles[safeRoleId]) assignments[normalized] = safeRoleId;
    });
    await db.doc('config/userRoles').set({assignments, updatedAt:FieldValue.serverTimestamp(), updatedBy:access.email}, {merge:false});
    return {ok:true, assignments};
  }
  throw new HttpsError('invalid-argument', 'Choose a valid role configuration operation.');
});

function cleanBusinessApplicationInput(raw = {}) {
  return {
    studioName:cleanText(raw.studioName, 160, 'Studio name', false),
    legalName:cleanText(raw.legalName, 160, 'Legal name', false),
    registrationNumber:cleanText(raw.registrationNumber, 100, 'Registration number', false),
    contactEmail:cleanText(raw.contactEmail, 160, 'Contact email', false).toLowerCase(),
    contactPhone:cleanText(raw.contactPhone, 60, 'Contact phone', false),
    website:raw.website ? cleanUrl(raw.website, 'website') : '',
    address:cleanText(raw.address, 240, 'Address', false),
    description:cleanText(raw.description, 4000, 'Studio description', false),
    evidenceUrls:(Array.isArray(raw.evidenceUrls) ? raw.evidenceUrls : []).map(value => cleanUrl(value, 'evidence URL')).filter(Boolean).slice(0, 10)
  };
}

function validateBusinessApplicationSubmission(application) {
  if (!application.studioName || !application.legalName || !application.contactEmail || !application.description) {
    throw new HttpsError('failed-precondition', 'Studio name, legal name, contact email, and studio description are required before submission.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.contactEmail)) {
    throw new HttpsError('invalid-argument', 'Enter a valid contact email.');
  }
}

function businessApplicationAuditRecord({applicationId, applicantUid, action, actorUid, actorEmail = '', fromStatus = null, toStatus, reason = ''}) {
  return {applicationId, applicantUid, action, actorUid, actorEmail, fromStatus, toStatus, reason, createdAt:FieldValue.serverTimestamp()};
}

functions.manageBusinessApplication = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage a Business Status application.');
  const uid = request.auth.uid;
  const operation = String(request.data?.operation || 'save_draft');
  if (!['save_draft', 'submit', 'withdraw'].includes(operation)) throw new HttpsError('invalid-argument', 'Choose a valid application operation.');
  const applicationRef = db.collection('businessApplications').doc(uid);
  const auditRef = db.collection('businessApplicationAudit').doc();

  return db.runTransaction(async transaction => {
    const [existingSnapshot, accountSnapshot] = await Promise.all([transaction.get(applicationRef), transaction.get(db.collection('businessAccounts').doc(uid))]);
    const existing = existingSnapshot.exists ? existingSnapshot.data() : null;
    const fromStatus = existing?.status || null;
    if (accountSnapshot.exists && ['active', 'suspended'].includes(accountSnapshot.data().status)) throw new HttpsError('failed-precondition', 'This Business Account cannot submit a new application in its current state.');

    if (operation === 'withdraw') {
      if (!existing || !['draft', 'submitted', 'under_review'].includes(fromStatus)) throw new HttpsError('failed-precondition', 'This application can no longer be withdrawn.');
      transaction.update(applicationRef, {status:'withdrawn', withdrawnAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
      if (accountSnapshot.exists && accountSnapshot.data().status === 'pending') transaction.set(db.collection('businessAccounts').doc(uid), {status:'removed', directoryEligible:false, statusUpdatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.set(auditRef, businessApplicationAuditRecord({applicationId:uid, applicantUid:uid, action:'withdraw', actorUid:uid, actorEmail:request.auth.token?.email || '', fromStatus, toStatus:'withdrawn'}));
      return {ok:true, applicationId:uid, status:'withdrawn'};
    }

    if (existing && !['draft', 'rejected'].includes(fromStatus)) throw new HttpsError('failed-precondition', 'This application cannot be edited in its current state.');
    const content = cleanBusinessApplicationInput(request.data?.application || {});
    const nextStatus = operation === 'submit' ? 'submitted' : 'draft';
    if (operation === 'submit') validateBusinessApplicationSubmission(content);
    const cycle = existing ? Number(existing.submissionCycle || 1) + (fromStatus === 'rejected' ? 1 : 0) : 1;
    const record = {
      ...content,
      applicantUid:uid,
      status:nextStatus,
      reviewVisible:operation === 'submit',
      submissionCycle:cycle,
      updatedAt:FieldValue.serverTimestamp(),
      reviewFeedback:FieldValue.delete(), rejectionReason:FieldValue.delete(), reviewerUid:FieldValue.delete(), reviewerEmail:FieldValue.delete(), reviewedAt:FieldValue.delete(), decidedAt:FieldValue.delete()
    };
    if (!existingSnapshot.exists) record.createdAt = FieldValue.serverTimestamp();
    if (operation === 'submit') {
      record.submittedAt = FieldValue.serverTimestamp();
      record.wasSubmitted = true;
    }
    transaction.set(applicationRef, record, {merge:true});
    if (operation === 'submit') transaction.set(db.collection('businessAccounts').doc(uid), {communityUid:uid, businessProfileId:uid, businessName:content.studioName, status:'pending', directoryEligible:false, updatedAt:FieldValue.serverTimestamp(), ...(accountSnapshot.exists ? {} : {createdAt:FieldValue.serverTimestamp()})}, {merge:true});
    transaction.set(auditRef, businessApplicationAuditRecord({applicationId:uid, applicantUid:uid, action:operation, actorUid:uid, actorEmail:request.auth.token?.email || '', fromStatus, toStatus:nextStatus}));
    return {ok:true, applicationId:uid, status:nextStatus};
  });
});

functions.reviewBusinessApplication = onCall(async request => {
  const access = await requireCommunityAdmin(request);
  const applicationId = cleanId(request.data?.applicationId, 'application');
  const decision = String(request.data?.decision || '');
  if (!['start_review', 'approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose a valid review decision.');
  const feedback = cleanText(request.data?.feedback || '', 1000, 'review feedback', false);
  const rejectionReason = cleanText(request.data?.rejectionReason || '', 1000, 'rejection reason', false);
  if (decision === 'reject' && rejectionReason.length < 3) throw new HttpsError('invalid-argument', 'A rejection reason is required.');
  const applicationRef = db.collection('businessApplications').doc(applicationId);
  const auditRef = db.collection('businessApplicationAudit').doc();

  return db.runTransaction(async transaction => {
    const applicationSnapshot = await transaction.get(applicationRef);
    if (!applicationSnapshot.exists) throw new HttpsError('not-found', 'Business application not found.');
    const application = applicationSnapshot.data();
    if (application.applicantUid !== applicationId) throw new HttpsError('failed-precondition', 'Application identity is invalid.');
    const allowed = decision === 'start_review' ? ['submitted'] : ['submitted', 'under_review'];
    if (!allowed.includes(application.status)) throw new HttpsError('failed-precondition', 'This application is no longer reviewable.');
    const nextStatus = decision === 'start_review' ? 'under_review' : decision === 'approve' ? 'approved' : 'rejected';
    const accountRef = db.collection('businessAccounts').doc(applicationId);
    const accountSnapshot = decision === 'approve' ? await transaction.get(accountRef) : null;
    const userRef = db.collection('users').doc(applicationId);
    const userSnapshot = decision === 'approve' ? await transaction.get(userRef) : null;
    if (decision === 'approve' && !userSnapshot.exists) throw new HttpsError('failed-precondition', 'The applicant’s Community account no longer exists.');
    const reviewFields = {status:nextStatus, reviewerUid:access.uid, reviewerEmail:access.email, reviewedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()};
    if (feedback) reviewFields.reviewFeedback = feedback;
    if (decision === 'reject') Object.assign(reviewFields, {rejectionReason, decidedAt:FieldValue.serverTimestamp()});
    if (decision === 'approve') reviewFields.decidedAt = FieldValue.serverTimestamp();
    transaction.update(applicationRef, reviewFields);

    if (decision === 'approve') {
      const approvedAt = accountSnapshot.exists && accountSnapshot.data().approvedAt ? accountSnapshot.data().approvedAt : FieldValue.serverTimestamp();
      transaction.set(accountRef, {communityUid:applicationId, businessProfileId:applicationId, businessName:application.studioName, status:'active', directoryEligible:false, verified:true, approvedBy:access.email, approvedByUid:access.uid, approvedAt, verificationUpdatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.set(userRef, {isBusiness:true, businessStatus:'active', businessApprovedBy:access.email, businessApprovedAt:approvedAt, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.set(db.collection('publicProfiles').doc(applicationId), {isBusiness:true, businessStatus:'active', businessName:application.studioName, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    } else if (decision === 'reject') {
      transaction.set(accountRef, {status:'removed', directoryEligible:false, statusUpdatedBy:access.email, statusUpdatedByUid:access.uid, statusUpdatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.set(db.collection('users').doc(applicationId), {isBusiness:false, businessStatus:'removed', updatedAt:FieldValue.serverTimestamp()}, {merge:true});
      transaction.set(db.collection('publicProfiles').doc(applicationId), {isBusiness:false, businessStatus:'removed', updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    }
    transaction.set(auditRef, businessApplicationAuditRecord({applicationId, applicantUid:application.applicantUid, action:decision, actorUid:access.uid, actorEmail:access.email, fromStatus:application.status, toStatus:nextStatus, reason:decision === 'reject' ? rejectionReason : feedback}));
    return {ok:true, applicationId, status:nextStatus};
  });
});

functions.setBusinessAccountStatus = onCall(async request => {
  const access = await requireCommunityAdmin(request);
  const userId = cleanId(request.data?.userId, 'user');
  const action = String(request.data?.action || '').trim().toLowerCase();
  const businessName = cleanText(request.data?.businessName || '', 160, 'businessName', false);
  const notes = cleanText(request.data?.notes || '', 500, 'notes', false);

  if (!['suspend', 'restore', 'remove'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Business Status can be granted only by approving an application. Valid account actions are suspend, restore, or remove.');
  }

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Community user account not found.');
  }
  const user = userSnap.data();

  const bizRef = db.collection('businessAccounts').doc(userId);
  const bizSnap = await bizRef.get();
  const existingBiz = bizSnap.data() || {};
  const profileSnap = await db.collection('businessProfiles').doc(userId).get();

  if (!bizSnap.exists || !['active', 'suspended', 'removed'].includes(existingBiz.status)) throw new HttpsError('failed-precondition', 'A reviewed Business Account is required.');
  let status = 'active';
  let isBusiness = true;
  let notifType = 'business_status_restored';
  let notifTitle = 'Business Status Restored';
  let notifMessage = 'Your Business Status has been restored to active.';

  if (action === 'restore') {
    if (existingBiz.status !== 'suspended') throw new HttpsError('failed-precondition', 'Only a suspended Business Account can be restored.');
    status = 'active';
    isBusiness = true;
  } else if (action === 'suspend') {
    if (existingBiz.status !== 'active') throw new HttpsError('failed-precondition', 'Only an active Business Account can be suspended.');
    status = 'suspended';
    isBusiness = false;
    notifType = 'business_status_suspended';
    notifTitle = 'Business Status Suspended';
    notifMessage = 'Your Business Status is temporarily suspended. Your normal Community account access is unaffected.';
  } else if (action === 'remove') {
    if (existingBiz.status === 'removed') throw new HttpsError('failed-precondition', 'This Business Account is already removed.');
    status = 'removed';
    isBusiness = false;
    notifType = 'business_status_removed';
    notifTitle = 'Business Status Removed';
    notifMessage = 'Your Business Status has been removed. Your normal Community account remains active.';
  }

  const batch = db.batch();

  {
    const bizRecord = {
      communityUid: userId,
      businessProfileId: userId,
      status,
      directoryEligible: action === 'restore' && profileSnap.exists && profileSnap.data().status === 'published',
      businessName: businessName || user.displayName || user.username || 'Business Account',
      statusReason: notes || '',
      statusUpdatedBy: access.email,
      statusUpdatedByUid: access.uid,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    batch.set(bizRef, bizRecord, { merge: true });
    batch.set(userRef, {
      isBusiness,
      businessStatus: status,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(db.collection('publicProfiles').doc(userId), {
      isBusiness,
      businessStatus: status,
      businessName: existingBiz.businessName || businessName || user.displayName || user.username || 'Business Account',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // Send system notification to user
  const notifRef = userRef.collection('notifications').doc(`business_status_${Date.now()}`);
  batch.set(notifRef, {
    recipientId: userId,
    actorId: access.uid,
    actorName: 'Master Administration',
    actorUsername: '',
    type: notifType,
    postId: '',
    postTitle: notifTitle,
    detailId: userId,
    reason: notifMessage,
    read: false,
    createdAt: FieldValue.serverTimestamp()
  });

  await batch.commit();

  return { ok: true, userId, status, isBusiness };
});

functions.saveBusinessProfile = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage your Business Profile.');
  const uid = request.auth.uid;

  try {
    // Check active Business Status
    const bizAccountSnap = await db.collection('businessAccounts').doc(uid).get();
    if (!bizAccountSnap.exists || bizAccountSnap.data().status !== 'active') {
      throw new HttpsError('permission-denied', 'Active Business Status is required to publish a Business Profile.');
    }

    const raw = request.data || {};
    const name = cleanText(raw.name || 'Architecture Practice', 120, 'Business Name', false) || 'Architecture Practice';
    let username = String(raw.username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!username) username = `business_${uid.slice(0, 8)}`;

    // Validate username uniqueness if changed
    const existingDoc = await db.collection('businessProfiles').doc(uid).get();
    const currentUsername = existingDoc.exists ? existingDoc.data().username : null;
    if (username !== currentUsername) {
      const existingWithUsername = await db.collection('businessProfiles').where('username', '==', username).get();
      const otherDocs = existingWithUsername.docs.filter(d => d.id !== uid);
      if (otherDocs.length > 0) {
        throw new HttpsError('already-exists', 'This professional username is already in use by another business.');
      }
    }

    const services = (Array.isArray(raw.services) ? raw.services : [])
      .map(s => cleanText(s, 80, 'service', false))
      .filter(Boolean)
      .slice(0, 30);

    const specializations = (Array.isArray(raw.specializations) ? raw.specializations : [])
      .map(s => cleanText(s, 80, 'specialization', false))
      .filter(Boolean)
      .slice(0, 30);

    const socialLinks = (Array.isArray(raw.socialLinks) ? raw.socialLinks : [])
      .filter(link => link && typeof link === 'object' && link.url)
      .map(link => ({
        platform: cleanText(link.platform, 40, 'platform', false) || 'website',
        url: cleanUrl(link.url, 'socialLink')
      }))
      .slice(0, 10);

    const gallery = (Array.isArray(raw.gallery) ? raw.gallery : [])
      .map(url => cleanUrl(url, 'galleryImage'))
      .filter(Boolean)
      .slice(0, 12);

    const profileData = {
      id: uid,
      ownerUid: uid,
      name,
      username,
      logoUrl: raw.logoUrl ? cleanUrl(raw.logoUrl, 'logoUrl') : '',
      coverUrl: raw.coverUrl ? cleanUrl(raw.coverUrl, 'coverUrl') : '',
      industry: cleanText(raw.industry, 100, 'industry', false) || 'Architecture & Design',
      location: cleanText(raw.location, 120, 'location', false) || 'Basra, Iraq',
      shortDescription: cleanText(raw.shortDescription, 280, 'shortDescription', false) || '',
      about: cleanText(raw.about, 5000, 'about', false) || '',
      website: raw.website ? cleanUrl(raw.website, 'website') : '',
      contactEmail: cleanText(raw.contactEmail, 120, 'contactEmail', false) || '',
      contactPhone: cleanText(raw.contactPhone, 40, 'contactPhone', false) || '',
      address: cleanText(raw.address, 200, 'address', false) || '',
      companySize: cleanText(raw.companySize, 60, 'companySize', false) || '1-10 employees',
      services,
      specializations,
      socialLinks,
      gallery,
      status: raw.status === 'draft' ? 'draft' : 'published',
      directoryEligible: raw.status !== 'draft',
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!existingDoc.exists) {
      profileData.createdAt = FieldValue.serverTimestamp();
    }

    const batch = db.batch();
    batch.set(db.collection('businessProfiles').doc(uid), profileData, { merge: true });
    batch.set(db.collection('businessAccounts').doc(uid), {
      businessName: name,
      businessProfileId: uid,
      directoryEligible: profileData.status === 'published',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();

    return { ok: true, profile: profileData };
  } catch (error) {
    console.error('[saveBusinessProfile] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to save business profile.');
  }
});

functions.saveBusinessPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to publish studio updates.');
  const uid = request.auth.uid;

  try {
    const bizAccountSnap = await db.collection('businessAccounts').doc(uid).get();
    if (!bizAccountSnap.exists || bizAccountSnap.data().status !== 'active') {
      throw new HttpsError('permission-denied', 'Active Business Status is required to publish studio updates.');
    }

    const raw = request.data || {};
    const postId = raw.postId ? cleanId(raw.postId, 'postId') : db.collection('businessPosts').doc().id;
    const content = cleanText(raw.content, 5000, 'Post content', true);
    const title = cleanText(raw.title || '', 160, 'Post title', false) || '';
    const category = ['update', 'announcement', 'project', 'hiring', 'achievement'].includes(raw.category)
      ? raw.category
      : 'update';
    const imageUrl = raw.imageUrl ? cleanUrl(raw.imageUrl, 'imageUrl') : '';
    const status = raw.status === 'draft' ? 'draft' : 'published';

    const [bizProfileSnap, userSnap] = await Promise.all([
      db.collection('businessProfiles').doc(uid).get(),
      db.collection('users').doc(uid).get()
    ]);
    const bizProfile = bizProfileSnap.exists ? bizProfileSnap.data() : {};
    const userData = userSnap.exists ? userSnap.data() : {};

    const businessName = bizProfile.name || bizAccountSnap.data().businessName || userData.displayName || 'Architecture Studio';
    const businessLogoUrl = bizProfile.logoUrl || userData.photoURL || '';
    const businessIndustry = bizProfile.industry || 'Architecture & Design';
    const businessLocation = bizProfile.location || userData.city || 'Basra, Iraq';

    const existingDoc = await db.collection('businessPosts').doc(postId).get();
    if (existingDoc.exists && existingDoc.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'You cannot edit posts belonging to another business.');
    }

    const postData = {
      id: postId,
      ownerUid: uid,
      title,
      content,
      category,
      imageUrl,
      status,
      businessName,
      businessLogoUrl,
      businessIndustry,
      businessLocation,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!existingDoc.exists) {
      postData.createdAt = FieldValue.serverTimestamp();
    }

    await db.collection('businessPosts').doc(postId).set(postData, { merge: true });

    return { ok: true, post: postData };
  } catch (error) {
    console.error('[saveBusinessPost] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to save studio update.');
  }
});

functions.deleteBusinessPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete studio updates.');
  const uid = request.auth.uid;
  const raw = request.data || {};
  const postId = cleanId(raw.postId, 'postId');

  try {
    const existingDoc = await db.collection('businessPosts').doc(postId).get();
    if (!existingDoc.exists) return { ok: true, postId };
    if (existingDoc.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'You cannot delete posts belonging to another business.');
    }

    await db.collection('businessPosts').doc(postId).delete();
    return { ok: true, postId };
  } catch (error) {
    console.error('[deleteBusinessPost] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to delete studio update.');
  }
});

functions.saveBusinessOpportunity = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to post jobs or internships.');
  const uid = request.auth.uid;

  try {
    const bizAccountSnap = await db.collection('businessAccounts').doc(uid).get();
    if (!bizAccountSnap.exists || bizAccountSnap.data().status !== 'active') {
      throw new HttpsError('permission-denied', 'Active Business Status is required to publish jobs or internships.');
    }

    const raw = request.data || {};
    const type = raw.type === 'internship' ? 'internship' : 'job';
    const id = raw.id ? cleanId(raw.id, 'opportunityId') : db.collection('businessOpportunities').doc().id;
    const title = cleanText(raw.title, 160, 'Title', true);
    const description = cleanText(raw.description, 10000, 'Description', true);
    const location = cleanText(raw.location || 'Basra, Iraq', 120, 'Location', false) || 'Basra, Iraq';
    const status = ['draft', 'open', 'closed', 'filled', 'expired', 'archived'].includes(raw.status) ? raw.status : 'open';
    const deadline = raw.deadline ? cleanText(raw.deadline, 40, 'deadline', false) : '';
    const openings = Math.max(1, Math.min(100, Number(raw.openings) || 1));
    const skills = (Array.isArray(raw.skills) ? raw.skills : []).map(s => cleanText(s, 60, 'skill', false)).filter(Boolean).slice(0, 20);
    const software = (Array.isArray(raw.software) ? raw.software : []).map(s => cleanText(s, 60, 'software', false)).filter(Boolean).slice(0, 20);

    const [bizProfileSnap, userSnap] = await Promise.all([
      db.collection('businessProfiles').doc(uid).get(),
      db.collection('users').doc(uid).get()
    ]);
    const bizProfile = bizProfileSnap.exists ? bizProfileSnap.data() : {};
    const userData = userSnap.exists ? userSnap.data() : {};

    const businessName = bizProfile.name || bizAccountSnap.data().businessName || userData.displayName || 'Architecture Studio';
    const businessLogoUrl = bizProfile.logoUrl || userData.photoURL || '';
    const businessIndustry = bizProfile.industry || 'Architecture & Design';
    const businessLocation = bizProfile.location || userData.city || 'Basra, Iraq';

    const existingDoc = await db.collection('businessOpportunities').doc(id).get();
    if (existingDoc.exists && existingDoc.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'You cannot edit listings belonging to another business.');
    }

    const oppData = {
      id,
      ownerUid: uid,
      type,
      title,
      description,
      location,
      status,
      deadline,
      openings,
      skills,
      software,
      businessName,
      businessLogoUrl,
      businessIndustry,
      businessLocation,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (type === 'job') {
      oppData.employmentType = cleanText(raw.employmentType || 'Full-time', 50, 'employmentType', false) || 'Full-time';
      oppData.workplaceType = cleanText(raw.workplaceType || 'On-site', 50, 'workplaceType', false) || 'On-site';
      oppData.experience = cleanText(raw.experience || 'Entry level', 50, 'experience', false) || 'Entry level';
      oppData.education = cleanText(raw.education || '', 100, 'education', false) || '';
      oppData.compensation = cleanText(raw.compensation || '', 100, 'compensation', false) || '';
    } else {
      oppData.duration = cleanText(raw.duration || '3 Months', 50, 'duration', false) || '3 Months';
      oppData.compensation = cleanText(raw.compensation || 'Paid', 50, 'compensation', false) || 'Paid';
      oppData.startDate = cleanText(raw.startDate || '', 50, 'startDate', false) || '';
      oppData.studentRequirements = cleanText(raw.studentRequirements || '', 200, 'studentRequirements', false) || '';
    }

    if (!existingDoc.exists) {
      oppData.createdAt = FieldValue.serverTimestamp();
    }
    if (status === 'open' && (!existingDoc.exists || existingDoc.data().status !== 'open')) {
      oppData.publishedAt = FieldValue.serverTimestamp();
    }

    await db.collection('businessOpportunities').doc(id).set(oppData, { merge: true });

    return { ok: true, opportunity: oppData };
  } catch (error) {
    console.error('[saveBusinessOpportunity] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to save opportunity.');
  }
});

functions.deleteBusinessOpportunity = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete listing.');
  const uid = request.auth.uid;
  const raw = request.data || {};
  const id = cleanId(raw.id, 'opportunityId');

  try {
    const existingDoc = await db.collection('businessOpportunities').doc(id).get();
    if (!existingDoc.exists) return { ok: true, id };
    if (existingDoc.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'You cannot delete listings belonging to another business.');
    }

    await db.collection('businessOpportunities').doc(id).delete();
    return { ok: true, id };
  } catch (error) {
    console.error('[deleteBusinessOpportunity] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to delete listing.');
  }
});

functions.submitJobApplication = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to apply with your portfolio.');
  const uid = request.auth.uid;
  const raw = request.data || {};
  const opportunityId = cleanId(raw.opportunityId, 'opportunityId');
  const coverLetter = cleanText(raw.coverLetter || '', 3000, 'coverLetter', false) || '';
  const selectedWorkIds = (Array.isArray(raw.selectedWorkIds) ? raw.selectedWorkIds : [])
    .map(id => cleanId(id, 'workId'))
    .slice(0, 6);

  try {
    // 1. Verify applicant has a published portfolio
    const portfolioSnap = await db.collection('portfolioProfiles').doc(uid).get();
    if (!portfolioSnap.exists || portfolioSnap.data().status !== 'published') {
      throw new HttpsError('failed-precondition', 'You need a published Space Portfolio to apply for professional opportunities.');
    }
    const portData = portfolioSnap.data();

    // 2. Fetch opportunity
    const oppSnap = await db.collection('businessOpportunities').doc(opportunityId).get();
    if (!oppSnap.exists) throw new HttpsError('not-found', 'Opportunity not found.');
    const oppData = oppSnap.data();
    if (oppData.status !== 'open') throw new HttpsError('failed-precondition', 'This opportunity is no longer open for applications.');
    if (oppData.ownerUid === uid) throw new HttpsError('failed-precondition', 'You cannot apply to your own studio opportunity.');

    // 3. Prevent duplicate applications
    const existingSnap = await db.collection('jobApplications')
      .where('opportunityId', '==', opportunityId)
      .where('applicantUid', '==', uid)
      .get();
    if (!existingSnap.empty) {
      throw new HttpsError('already-exists', 'You have already submitted an application for this position.');
    }

    // 4. Fetch user profile & selected works
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    let selectedWorks = [];
    if (selectedWorkIds.length > 0) {
      const worksSnaps = await Promise.all(
        selectedWorkIds.map(wId => db.collection('portfolioWorks').doc(wId).get())
      );
      selectedWorks = worksSnaps
        .filter(snap => snap.exists && snap.data().ownerId === uid)
        .map(snap => ({
          id: snap.id,
          title: snap.data().title || 'Project',
          coverUrl: snap.data().previewUrl || snap.data().coverUrl || '',
          workType: snap.data().workType || 'Project'
        }));
    }

    const appId = db.collection('jobApplications').doc().id;
    const applicationData = {
      id: appId,
      opportunityId,
      opportunityType: oppData.type || 'job',
      opportunityTitle: oppData.title || 'Studio Role',
      businessUid: oppData.ownerUid,
      businessName: oppData.businessName || 'Architecture Studio',
      applicantUid: uid,
      portfolioId: uid,
      applicantName: portData.displayName || userData.displayName || 'Architect',
      applicantAvatar: portData.avatarUrl || userData.photoURL || '',
      applicantTitle: portData.professionalTitle || 'Designer',
      applicantLocation: portData.location || userData.city || 'Basra, Iraq',
      selectedWorkIds,
      selectedWorks,
      coverLetter,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection('jobApplications').doc(appId).set(applicationData);

    // 5. Notify business owner
    const notifRef = db.collection('users').doc(oppData.ownerUid).collection('notifications').doc(`app_${appId}`);
    await notifRef.set({
      recipientId: oppData.ownerUid,
      actorId: uid,
      actorName: applicationData.applicantName,
      actorUsername: userData.username || '',
      type: 'job_application',
      postId: '',
      postTitle: oppData.title,
      detailId: appId,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    }).catch(err => console.warn('[submitJobApplication] Notification error:', err));

    return { ok: true, applicationId: appId };
  } catch (error) {
    console.error('[submitJobApplication] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to submit application.');
  }
});

functions.updateJobApplicationStatus = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to review applications.');
  const uid = request.auth.uid;
  const raw = request.data || {};
  const applicationId = cleanId(raw.applicationId, 'applicationId');
  const validStatuses = ['reviewed', 'shortlisted', 'interview', 'accepted', 'not_selected'];
  const nextStatus = raw.status;
  if (!validStatuses.includes(nextStatus)) {
    throw new HttpsError('invalid-argument', 'Invalid application status.');
  }

  try {
    const appSnap = await db.collection('jobApplications').doc(applicationId).get();
    if (!appSnap.exists) throw new HttpsError('not-found', 'Application not found.');
    const appData = appSnap.data();

    // Verify hiring business owner
    if (appData.businessUid !== uid) {
      throw new HttpsError('permission-denied', 'You cannot manage applications for another business.');
    }

    const allowedTransitions = {
      new:['reviewed', 'shortlisted', 'interview', 'accepted', 'not_selected'],
      reviewed:['shortlisted', 'interview', 'accepted', 'not_selected'],
      shortlisted:['interview', 'accepted', 'not_selected'],
      interview:['accepted', 'not_selected']
    };
    if (!(allowedTransitions[appData.status] || []).includes(nextStatus)) throw new HttpsError('failed-precondition', 'This application status transition is not allowed.');

    await db.collection('jobApplications').doc(applicationId).update({
      status: nextStatus,
      statusUpdatedBy:uid,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Notify applicant of update
    const notifRef = db.collection('users').doc(appData.applicantUid).collection('notifications').doc(`app_status_${applicationId}_${Date.now()}`);
    await notifRef.set({
      recipientId: appData.applicantUid,
      actorId: uid,
      actorName: appData.businessName || 'Studio',
      type: 'job_status_update',
      postId: '',
      postTitle: `${appData.opportunityTitle} (${nextStatus})`,
      detailId: applicationId,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    }).catch(err => console.warn('[updateJobApplicationStatus] Notification error:', err));

    return { ok: true, status: nextStatus };
  } catch (error) {
    console.error('[updateJobApplicationStatus] Error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to update application status.');
  }
});

functions.withdrawJobApplication = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to withdraw an application.');
  const applicationId = cleanId(request.data?.applicationId, 'applicationId');
  const ref = db.collection('jobApplications').doc(applicationId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Application not found.');
    const application = snapshot.data();
    if (application.applicantUid !== request.auth.uid) throw new HttpsError('permission-denied', 'You cannot withdraw another applicant’s application.');
    if (!['new', 'reviewed', 'shortlisted', 'interview'].includes(application.status)) throw new HttpsError('failed-precondition', 'This application can no longer be withdrawn.');
    transaction.update(ref, {status:'withdrawn', statusUpdatedBy:request.auth.uid, statusUpdatedAt:FieldValue.serverTimestamp(), withdrawnAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
    return {ok:true, status:'withdrawn'};
  });
});

functions.backfillCommunitySchema = onCall(async request => {
  await requireCommunityAdmin(request);
  const [spacesSnapshot, postsSnapshot, usersSnapshot] = await Promise.all([
    db.collection('communitySpaces').get(), db.collection('communityPosts').get(), db.collection('users').get()
  ]);
  const spaces = new Map(spacesSnapshot.docs.map(item => [item.id, item.data()]));
  const results = {communitySpaces:{documents:spacesSnapshot.size, updated:0, accessRecords:0, protectedChatFiles:0}, communityPosts:{documents:postsSnapshot.size, updated:0, protectedPrivateFiles:0}, publicProfiles:{documents:usersSnapshot.size, updated:0}};
  for (let offset = 0; offset < spacesSnapshot.docs.length; offset += 400) {
    const batch = db.batch();
    spacesSnapshot.docs.slice(offset, offset + 400).forEach(item => {
      const defaults = {archived:false, moderationStatus:'clear', active:true, isPrivate:false, isViewOnly:false, showInMainThread:true};
      const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in item.data())));
      if (Object.keys(missing).length) { batch.update(item.ref, missing); results.communitySpaces.updated += 1; }
    });
    await batch.commit();
  }
  for (const item of spacesSnapshot.docs) {
    const normalizedSpace = {archived:false, active:true, isPrivate:false, isViewOnly:false, showInMainThread:true, ...item.data()};
    results.communitySpaces.accessRecords += await rebuildSpaceAccessRecords(item.ref, normalizedSpace);
    results.communitySpaces.protectedChatFiles += await revokeDownloadTokensUnderPrefix(`community/space-messages/${item.id}/`);
  }
  for (const item of postsSnapshot.docs) {
    const post = item.data();
    const [votes, comments] = await Promise.all([item.ref.collection('votes').get(), item.ref.collection('comments').get()]);
    const values = votes.docs.map(vote => Number(vote.data().value || 0));
    const space = spaces.get(String(post.communitySlug || 'main')) || {};
    const visibility = postVisibilityForSpace(String(post.communitySlug || 'main'), space);
    if (visibility === 'private') results.communityPosts.protectedPrivateFiles += await revokeDownloadTokensUnderPrefix(`community/posts/${item.id}/`);
    await item.ref.set({
      archived:post.archived === true,
      moderationStatus:String(post.moderationStatus || 'clear'),
      published:post.published !== false,
      featured:post.featured === true,
      featureRequest:post.featureRequest === true,
      featureStatus:String(post.featureStatus || 'none'),
      visibility,
      score:values.reduce((total, value) => total + value, 0),
      upvoteCount:values.filter(value => value === 1).length,
      downvoteCount:values.filter(value => value === -1).length,
      commentsCount:comments.size
    }, {merge:true});
    results.communityPosts.updated += 1;
  }
  for (let offset = 0; offset < usersSnapshot.docs.length; offset += 400) {
    const batch = db.batch();
    usersSnapshot.docs.slice(offset, offset + 400).forEach(item => batch.set(db.collection('publicProfiles').doc(item.id), publicProfileFields(item.data()), {merge:false}));
    await batch.commit();
    results.publicProfiles.updated += usersSnapshot.docs.slice(offset, offset + 400).length;
  }
  return {ok:true, results};
});

function auditRef() { return db.collection('communityModerationAudit').doc(); }

function auditRecord({actor, action, contentType, contentId, reason, cascadeId = null, details = {}}) {
  return {
    moderatorId:actor.uid,
    moderatorEmail:actor.email,
    action,
    contentType,
    contentId,
    reason,
    cascadeId,
    details,
    createdAt:FieldValue.serverTimestamp()
  };
}

function notificationRecord(userId, actor, type, contentType, contentId, title, reason, eligibleToRepost = false) {
  return {
    recipientId:userId,
    actorId:actor.uid,
    actorName:'AIAS Basra moderation',
    actorUsername:'aias-basra',
    type,
    moderationAction:type,
    contentType,
    postId:contentType === 'post' ? contentId : '',
    detailId:contentType === 'space' ? contentId : '',
    postTitle:String(title || '').slice(0, 160),
    reason,
    eligibleToRepost,
    read:false,
    createdAt:FieldValue.serverTimestamp()
  };
}

async function commitOperations(operations) {
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach(operation => operation(batch));
    await batch.commit();
  }
}

async function archiveSpace(spaceRef, space, actor, reason) {
  if (space.archived === true) throw new HttpsError('failed-precondition', 'This space is already archived.');
  // Revoke every derived grant before changing or cascading content. A failed
  // archive therefore fails closed instead of leaving stale live access.
  await rebuildSpaceAccessRecords(spaceRef, {...space, active:false, archived:true});
  const cascadeId = `space_${spaceRef.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const postSnapshot = await db.collection('communityPosts').where('communitySlug', '==', spaceRef.id).get();
  const activePosts = postSnapshot.docs.filter(item => item.data().archived !== true);
  const operations = [
    batch => batch.update(spaceRef, {active:false, archived:true, archiveReason:reason, archiveCause:'moderation', archiveCascadeId:cascadeId, archivedAt:FieldValue.serverTimestamp(), archivedBy:actor.email}),
    batch => batch.set(auditRef(), auditRecord({actor, action:'archive', contentType:'space', contentId:spaceRef.id, reason, cascadeId, details:{cascadedPostCount:activePosts.length}}))
  ];
  if (space.creatorId) operations.push(batch => batch.set(db.collection('users').doc(space.creatorId).collection('notifications').doc(), notificationRecord(space.creatorId, actor, 'moderation_archived', 'space', spaceRef.id, space.name, reason, false)));
  activePosts.forEach(postDoc => {
    const post = postDoc.data();
    operations.push(batch => batch.update(postDoc.ref, {archived:true, moderationStatus:post.moderationStatus || 'clear', archiveReason:reason, archiveCause:'space_cascade', archiveCascadeId:cascadeId, archivedAt:FieldValue.serverTimestamp(), archivedBy:actor.email}));
    operations.push(batch => batch.set(auditRef(), auditRecord({actor, action:'archive', contentType:'post', contentId:postDoc.id, reason, cascadeId, details:{sourceSpaceId:spaceRef.id}})));
    if (post.userId) operations.push(batch => batch.set(db.collection('users').doc(post.userId).collection('notifications').doc(), notificationRecord(post.userId, actor, 'moderation_archived', 'post', postDoc.id, post.title, reason, post.moderationStatus !== 'flagged')));
  });
  await commitOperations(operations);
  return {cascadeId, cascadedPostCount:activePosts.length};
}

async function restoreSpace(spaceRef, space, actor, reason) {
  if (space.archived !== true) throw new HttpsError('failed-precondition', 'This space is not archived.');
  const cascadeId = space.archiveCascadeId || null;
  const postSnapshot = cascadeId ? await db.collection('communityPosts').where('archiveCascadeId', '==', cascadeId).get() : {docs:[]};
  const cascadePosts = postSnapshot.docs.filter(item => item.data().archived === true && item.data().archiveCause === 'space_cascade');
  const operations = [
    batch => batch.update(spaceRef, {active:true, archived:false, restoredAt:FieldValue.serverTimestamp(), restoredBy:actor.email, restoreReason:reason, archiveReason:FieldValue.delete(), archiveCause:FieldValue.delete(), archiveCascadeId:FieldValue.delete(), archivedAt:FieldValue.delete(), archivedBy:FieldValue.delete()}),
    batch => batch.set(auditRef(), auditRecord({actor, action:'restore', contentType:'space', contentId:spaceRef.id, reason, cascadeId, details:{restoredPostCount:cascadePosts.length}}))
  ];
  if (space.creatorId) operations.push(batch => batch.set(db.collection('users').doc(space.creatorId).collection('notifications').doc(), notificationRecord(space.creatorId, actor, 'moderation_restored', 'space', spaceRef.id, space.name, reason, false)));
  cascadePosts.forEach(postDoc => {
    const post = postDoc.data();
    operations.push(batch => batch.update(postDoc.ref, {archived:false, restoredAt:FieldValue.serverTimestamp(), restoredBy:actor.email, restoreReason:reason, archiveReason:FieldValue.delete(), archiveCause:FieldValue.delete(), archiveCascadeId:FieldValue.delete(), archivedAt:FieldValue.delete(), archivedBy:FieldValue.delete()}));
    operations.push(batch => batch.set(auditRef(), auditRecord({actor, action:'restore', contentType:'post', contentId:postDoc.id, reason, cascadeId, details:{sourceSpaceId:spaceRef.id}})));
    if (post.userId) operations.push(batch => batch.set(db.collection('users').doc(post.userId).collection('notifications').doc(), notificationRecord(post.userId, actor, 'moderation_restored', 'post', postDoc.id, post.title, reason, false)));
  });
  await commitOperations(operations);
  await rebuildSpaceAccessRecords(spaceRef, {...space, active:true, archived:false});
  return {cascadeId, restoredPostCount:cascadePosts.length};
}

functions.moderateCommunityContent = onCall(async request => {
  const actor = await requireCommunityAdmin(request);
  const action = String(request.data?.action || '');
  const contentType = String(request.data?.contentType || '');
  if (!MODERATION_ACTIONS.has(action) || !CONTENT_COLLECTIONS[contentType]) throw new HttpsError('invalid-argument', 'Choose a valid moderation action and content type.');
  const contentId = cleanId(request.data?.contentId);
  const reason = cleanReason(request.data?.reason, action !== 'clear_flag');
  const ref = db.collection(CONTENT_COLLECTIONS[contentType]).doc(contentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'The requested content no longer exists.');
  const content = snapshot.data();

  if (contentType === 'space' && action === 'archive') return {ok:true, ...(await archiveSpace(ref, content, actor, reason))};
  if (contentType === 'space' && action === 'restore') return {ok:true, ...(await restoreSpace(ref, content, actor, reason))};
  if (action === 'restore' && content.archived !== true) throw new HttpsError('failed-precondition', 'This content is not archived.');
  if (action === 'archive' && content.archived === true) throw new HttpsError('failed-precondition', 'This content is already archived.');

  const fields = {moderationUpdatedAt:FieldValue.serverTimestamp(), moderationUpdatedBy:actor.email};
  if (action === 'flag') Object.assign(fields, {moderationStatus:'flagged', moderationReason:reason, flaggedAt:FieldValue.serverTimestamp(), flaggedBy:actor.email});
  if (action === 'clear_flag') Object.assign(fields, {moderationStatus:'clear', moderationReason:reason || '', flagClearedAt:FieldValue.serverTimestamp(), flagClearedBy:actor.email});
  if (action === 'warn') Object.assign(fields, {warningReason:reason, warnedAt:FieldValue.serverTimestamp(), warnedBy:actor.email});
  if (action === 'archive') Object.assign(fields, {archived:true, archiveReason:reason, archiveCause:'moderation', archiveCascadeId:FieldValue.delete(), archivedAt:FieldValue.serverTimestamp(), archivedBy:actor.email});
  if (action === 'restore') Object.assign(fields, {archived:false, restoredAt:FieldValue.serverTimestamp(), restoredBy:actor.email, restoreReason:reason, archiveReason:FieldValue.delete(), archiveCause:FieldValue.delete(), archiveCascadeId:FieldValue.delete(), archivedAt:FieldValue.delete(), archivedBy:FieldValue.delete()});
  const ownerId = content.userId || content.creatorId;
  const notifyType = {flag:'moderation_flagged', clear_flag:'moderation_cleared', warn:'moderation_warned', archive:'moderation_archived', restore:'moderation_restored'}[action];
  const operations = [
    batch => batch.update(ref, fields),
    batch => batch.set(auditRef(), auditRecord({actor, action, contentType, contentId, reason}))
  ];
  if (ownerId) operations.push(batch => batch.set(db.collection('users').doc(ownerId).collection('notifications').doc(), notificationRecord(ownerId, actor, notifyType, contentType, contentId, content.title || content.name, reason, action === 'archive' && contentType === 'post' && content.archiveCause === 'space_cascade' && action !== 'flag')));
  await commitOperations(operations);
  return {ok:true};
});

functions.permanentlyDeleteCommunityContent = onCall(async request => {
  const actor = await requireCommunityAdmin(request);
  const contentType = String(request.data?.contentType || '');
  if (!CONTENT_COLLECTIONS[contentType]) throw new HttpsError('invalid-argument', 'Choose a valid content type.');
  const contentId = cleanId(request.data?.contentId);
  const reason = cleanReason(request.data?.reason);
  const ref = db.collection(CONTENT_COLLECTIONS[contentType]).doc(contentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'The requested content no longer exists.');
  const content = snapshot.data();
  if (content.archived !== true) throw new HttpsError('failed-precondition', 'Only archived content can be permanently deleted.');
  const ownerId = content.userId || content.creatorId || '';
  const tombstoneRef = db.collection('communityModerationTombstones').doc(contentType).collection('items').doc(contentId);
  await tombstoneRef.set({contentType, contentId, ownerId, moderatorId:actor.uid, moderatorEmail:actor.email, reason, permanentlyDeletedAt:FieldValue.serverTimestamp(), restorable:false});
  await auditRef().set(auditRecord({actor, action:'permanent_delete', contentType, contentId, reason}));
  if (ownerId) await db.collection('users').doc(ownerId).collection('notifications').add(notificationRecord(ownerId, actor, 'moderation_permanently_deleted', contentType, contentId, content.title || content.name, reason, false));
  await db.recursiveDelete(ref);
  const storagePrefix = contentType === 'post' ? `community/posts/${contentId}/` : `community/spaces/${contentId}/`;
  await getStorage().bucket().deleteFiles({prefix:storagePrefix, force:true}).catch(error => logger.warn('Moderated content media cleanup failed', {contentType, contentId, error:error.message}));
  return {ok:true, restorable:false};
});

functions.repostUnavailableSpacePost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to repost your content.');
  const postId = cleanId(request.data?.postId, 'post');
  const sourceRef = db.collection('communityPosts').doc(postId);
  const initial = await sourceRef.get();
  if (!initial.exists) throw new HttpsError('not-found', 'The archived post no longer exists.');
  const initialPost = initial.data();
  if (initialPost.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only repost your own archived posts.');
  const newRef = db.collection('communityPosts').doc();
  const sourcePaths = Array.isArray(initialPost.imagePaths) ? initialPost.imagePaths : [];
  const imagePaths = sourcePaths.map(path => `community/posts/${newRef.id}/${String(path).split('/').pop()}`);
  const bucket = getStorage().bucket();
  try {
    await Promise.all(sourcePaths.map((path, index) => bucket.file(path).copy(bucket.file(imagePaths[index]))));
    await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'The archived post no longer exists.');
    const post = snapshot.data();
    if (post.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only repost your own archived posts.');
    if (post.archived !== true || post.archiveCause !== 'space_cascade') throw new HttpsError('failed-precondition', 'This post is not eligible for reposting.');
    if (post.moderationStatus === 'flagged') throw new HttpsError('failed-precondition', 'Flagged content cannot be reposted until an administrator clears it.');
    if (post.repostedPostId) throw new HttpsError('already-exists', 'This archived post has already been reposted.');
    const copy = {...post};
    ['archived', 'archiveReason', 'archiveCause', 'archiveCascadeId', 'archivedAt', 'archivedBy', 'moderationStatus', 'moderationReason', 'moderationUpdatedAt', 'moderationUpdatedBy', 'flaggedAt', 'flaggedBy', 'repostedPostId', 'repostedAt'].forEach(key => delete copy[key]);
    Object.assign(copy, {communitySlug:'main', published:true, imagePaths, mediaCount:imagePaths.length, featured:false, featureRequest:false, featureStatus:'none', repostedFromPostId:postId, repostedFromUnavailableSpace:post.communitySlug || '', createdAt:FieldValue.serverTimestamp()});
    transaction.create(newRef, copy);
    transaction.update(sourceRef, {repostedPostId:newRef.id, repostedAt:FieldValue.serverTimestamp()});
    });
    return {ok:true, postId:newRef.id};
  } catch (error) {
    await bucket.deleteFiles({prefix:`community/posts/${newRef.id}/`, force:true}).catch(() => {});
    throw error;
  }
});

functions.communityShare = onRequest(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.set('Allow', 'GET, HEAD').status(405).send('Method not allowed');
    return;
  }
  const match = request.path.match(/^\/share\/(post|space)\/([A-Za-z0-9_-]{1,128})\/?$/);
  if (!match) {
    response.status(404).send('Share link not found');
    return;
  }

  const [, type, id] = match;
  const shareUrl = SARAY_ORIGIN + '/share/' + type + '/' + encodeURIComponent(id);
  let title = 'AIAS Basra Community';
  let description = 'Architecture, design, ideas, and conversations from the AIAS Basra community.';
  let image = SHARE_FALLBACK_IMAGE;
  let destination = SARAY_ORIGIN;
  let found = false;

  try {
    if (type === 'space') {
      const snapshot = await db.collection('communitySpaces').doc(id).get();
      const space = snapshot.data();
      destination = SARAY_ORIGIN + '/a/' + encodeURIComponent(id);
      if (snapshot.exists && space?.active === true && space?.archived !== true && space?.isPrivate !== true) {
        found = true;
        title = `${shareText(space.name, 90) || 'Community space'} — AIAS Basra`;
        description = shareText(space.description) || `Explore a/${id} on AIAS Basra Community.`;
        const candidate = String(space.bannerURL || space.imageURL || '');
        if (/^https:\/\//i.test(candidate)) image = candidate;
      }
    } else {
      const snapshot = await db.collection('communityPosts').doc(id).get();
      const post = snapshot.data();
      destination = SARAY_ORIGIN + '/?post=' + encodeURIComponent(id);
      if (snapshot.exists && post?.published === true && post?.archived !== true && post?.moderationStatus !== 'flagged') {
        const slug = String(post.communitySlug || 'main');
        const spaceSnapshot = slug === 'main' ? null : await db.collection('communitySpaces').doc(slug).get();
        const space = spaceSnapshot?.data();
        const publicSpace = slug === 'main' || (spaceSnapshot?.exists && space?.active === true && space?.archived !== true && space?.isPrivate !== true);
        if (publicSpace) {
          found = true;
          const spaceName = slug === 'main' ? 'AIAS Basra Community' : shareText(space.name, 70) || `a/${slug}`;
          title = `${shareText(post.title, 120) || 'Community post'} — ${spaceName}`;
          description = shareText(post.summary || post.content || post.marketAttachment?.description || post.portfolioAttachment?.description) || `A post shared by ${shareText(post.authorName, 70) || 'a community member'}.`;
          image = safeMarketImageUrl(post.marketAttachment?.imageUrl || post.portfolioAttachment?.imageUrl) || await publicStorageImage(Array.isArray(post.imagePaths) ? post.imagePaths[0] : '');
          if (!image && /^https:\/\//i.test(String(space?.bannerURL || space?.imageURL || ''))) image = space.bannerURL || space.imageURL;
          if (!image) image = SHARE_FALLBACK_IMAGE;
        }
      }
    }
  } catch (error) {
    logger.error('Community share preview failed.', {type, id, error:error.message});
  }

  response.set('Cache-Control', found ? 'public, max-age=300, s-maxage=600' : 'no-store');
  response.status(found ? 200 : 404).type('html').send(shareHtml({title, description, image, shareUrl, destination:found ? destination : SARAY_ORIGIN}));
});

function destinationFor(notification) {
  if (String(notification.type || '').startsWith('moderation_')) {
    if (notification.eligibleToRepost) return SARAY_ORIGIN + '/community-archived.html';
    return notification.contentType === 'space' ? SARAY_ORIGIN + '/' : SARAY_ORIGIN + '/?post=' + encodeURIComponent(notification.postId || '');
  }
  if (notification.type === 'connection') return SARAY_ORIGIN + '/?view=profile&user=' + encodeURIComponent(notification.actorId || '');
  if (notification.type === 'space_message') return SARAY_ORIGIN + '/?view=messages&area=' + encodeURIComponent(notification.detailId || '');
  if (['space_connection', 'space_request', 'space_chat_request', 'space_member_warned', 'space_member_removed', 'space_chat_removed'].includes(notification.type)) return SARAY_ORIGIN + '/a/' + encodeURIComponent(notification.detailId || '');
  return SARAY_ORIGIN + '/?post=' + encodeURIComponent(notification.postId || '') + '&comments=1';
}

function notificationBody(notification) {
  if (String(notification.type || '').startsWith('moderation_')) {
    const action = {
      moderation_flagged:'was flagged', moderation_cleared:'was cleared by moderation',
      moderation_warned:'received a warning', moderation_archived:'was archived',
      moderation_restored:'was restored', moderation_permanently_deleted:'was permanently deleted'
    }[notification.type] || 'was updated by moderation';
    const eligibility = notification.eligibleToRepost ? ' You can repost an eligible copy to the main thread.' : '';
    return `Your ${notification.contentType || 'content'} ${action}. Reason: ${notification.reason || 'No reason provided.'}${eligibility}`;
  }
  const actor = notification.actorName || 'A community member';
  const action = {
    space_post:'posted in your space',
    mention:'mentioned you',
    space_mention:'mentioned your space',
    connection:'connected with you',
    space_connection:'connected with your space',
    space_request:'requested access to your space',
    space_chat_request:'requested Messages access for your space',
    reply:'replied to your comment',
    applause:'applauded your post',
    space_post_warned:'warned your space post',
    space_post_deleted:'deleted your space post',
    space_member_warned:'sent you a space warning',
    space_member_removed:'removed you from a space',
    space_chat_removed:'removed you from space messages',
    space_message:'mentioned or replied to you in space messages',
    main_thread_access_granted:'approved your main-thread posting access',
    main_thread_access_denied:'did not approve your main-thread posting access',
    business_status_granted:'granted your account Business Status',
    business_status_suspended:'suspended your Business Status',
    business_status_restored:'restored your Business Status',
    business_status_removed:'removed your Business Status'
  }[notification.type] || 'commented on your post';
  return actor + ' ' + action + (notification.postTitle ? ' · ' + notification.postTitle : '');
}

functions.setCommunityNotificationPreferences = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to update preferences.');
  const raw = request.data?.preferences || {};
  const preferences = {
    chatMessages: raw.chatMessages !== false,
    chatMentions: raw.chatMentions !== false,
    chatReplies: raw.chatReplies !== false,
    postComments: raw.postComments !== false,
    commentReplies: raw.commentReplies !== false,
    postMentions: raw.postMentions !== false,
    postApplauses: raw.postApplauses !== false,
    connections: raw.connections !== false,
    spaceRequests: raw.spaceRequests !== false,
    pushEnabled: raw.pushEnabled !== false
  };
  await db.collection('users').doc(request.auth.uid).set({
    notificationPreferences: preferences,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true, preferences };
});

functions.toggleMuteSpaceChat = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to mute chats.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const muted = request.data?.muted === true;
  const userRef = db.collection('users').doc(request.auth.uid);
  if (muted) {
    await userRef.set({
      mutedSpaceChats: FieldValue.arrayUnion(spaceId),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } else {
    await userRef.set({
      mutedSpaceChats: FieldValue.arrayRemove(spaceId),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { ok: true, spaceId, muted };
});



functions.getCommunityThread = onCall(async request => {
  const parentPostId = cleanId(request.data?.postId, 'postId');
  const snap = await db.collection('communityPosts')
    .where('parentPostId', '==', parentPostId)
    .where('archived', '==', false)
    .get();

  const subPosts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { ok: true, subPosts };
});

functions.openDirectConversation = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to open conversations.');
  const currentUid = request.auth.uid;
  const targetUid = cleanId(request.data?.targetUid, 'targetUid');
  if (!targetUid || targetUid === currentUid) {
    throw new HttpsError('invalid-argument', 'Cannot open a direct conversation with yourself.');
  }

  const [targetUserDoc, targetBizDoc, currentBizDoc] = await Promise.all([
    db.collection('users').doc(targetUid).get(),
    db.collection('businessAccounts').doc(targetUid).get().catch(() => null),
    db.collection('businessAccounts').doc(currentUid).get().catch(() => null)
  ]);

  if (!targetUserDoc.exists) throw new HttpsError('not-found', 'Recipient not found.');

  const isTargetBusiness = targetBizDoc?.exists && targetBizDoc.data().status === 'active';
  const isCurrentBusiness = currentBizDoc?.exists && currentBizDoc.data().status === 'active';

  // Deterministic space ID
  const sortedIds = [currentUid, targetUid].sort();
  const spaceId = `dm-${sortedIds[0]}-${sortedIds[1]}`;
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  const spaceSnap = await spaceRef.get();

  // Enforce business initiative restriction:
  // "users cant message a bussnese unless bussnes started message with them"
  if (isTargetBusiness && !isCurrentBusiness && !spaceSnap.exists) {
    throw new HttpsError('permission-denied', 'Businesses must initiate the direct conversation first.');
  }

  if (spaceSnap.exists) {
    return { ok: true, spaceId, space: { id: spaceId, slug: spaceId, ...spaceSnap.data() }, exists: true };
  }

  // Create new direct conversation space
  const targetData = targetUserDoc.data();
  const [currentUserDoc, targetBizProfile, currentBizProfile, targetPortfolioDoc, currentPortfolioDoc] = await Promise.all([
    db.collection('users').doc(currentUid).get(),
    isTargetBusiness ? db.collection('businessProfiles').doc(targetUid).get().catch(() => null) : null,
    isCurrentBusiness ? db.collection('businessProfiles').doc(currentUid).get().catch(() => null) : null,
    db.collection('portfolioProfiles').doc(targetUid).get().catch(() => null),
    db.collection('portfolioProfiles').doc(currentUid).get().catch(() => null)
  ]);

  const currentData = currentUserDoc.exists ? currentUserDoc.data() : {};
  const targetName = (isTargetBusiness && targetBizProfile?.exists) ? (targetBizProfile.data().name || targetData.displayName) : (targetData.displayName || targetData.username || 'Member');
  const currentName = (isCurrentBusiness && currentBizProfile?.exists) ? (currentBizProfile.data().name || currentData.displayName) : (currentData.displayName || currentData.username || 'Member');

  const newSpaceRecord = {
    name: `${currentName} & ${targetName}`,
    description: `Direct professional conversation`,
    symbol: 'DM',
    active: true,
    archived: false,
    chatEnabled: true,
    isPrivate: true,
    isDirectMessage: true,
    directParticipants: sortedIds,
    participantMetadata: {
      [currentUid]: {
        name: currentName,
        isBusiness: isCurrentBusiness,
        professionalTitle: currentPortfolioDoc?.exists ? (currentPortfolioDoc.data().professionalTitle || '') : ''
      },
      [targetUid]: {
        name: targetName,
        isBusiness: isTargetBusiness,
        professionalTitle: targetPortfolioDoc?.exists ? (targetPortfolioDoc.data().professionalTitle || '') : ''
      }
    },
    creatorId: currentUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  batch.set(spaceRef, newSpaceRecord);

  // Set access records for both participants
  const accessRecord = { canUseChat: true, canReadPosts: true, blocked: false, chatBanned: false, chatApproved: true, updatedAt: FieldValue.serverTimestamp() };
  batch.set(spaceRef.collection('access').doc(currentUid), accessRecord);
  batch.set(spaceRef.collection('access').doc(targetUid), accessRecord);

  const connRecord = { userId: currentUid, spaceSlug: spaceId, createdAt: FieldValue.serverTimestamp() };
  batch.set(spaceRef.collection('connections').doc(currentUid), connRecord);
  batch.set(spaceRef.collection('connections').doc(targetUid), { userId: targetUid, spaceSlug: spaceId, createdAt: FieldValue.serverTimestamp() });

  await batch.commit();

  return { ok: true, spaceId, space: { id: spaceId, slug: spaceId, ...newSpaceRecord }, created: true };
});
