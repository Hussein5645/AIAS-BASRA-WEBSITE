import {onAuthStateChanged, signOut} from '/js/cloudflare-client.js';
import {collection, doc, getDoc, getDocFromCache, getDocs, getDocsFromCache, addDoc, setDoc, updateDoc, deleteDoc, query, where, limit, orderBy, startAfter, onSnapshot, writeBatch, runTransaction, serverTimestamp} from '/js/cloudflare-client.js';
import {registerWebPush} from "/js/cloudflare-client.js";
import {deleteObject, getBlob, getDownloadURL, ref as storageRef, uploadBytesResumable, uploadString} from '/js/cloudflare-client.js';
import {app, auth, db, storage, callFunction} from './platform-client.js?v=20260813-chat-seen-v1';

// Set this to the public Web Push certificate from the space-42d87 Firebase
// console when a custom VAPID key is enabled. Without it, Firebase Messaging
// uses the project's default web-push credentials.
const FCM_VAPID_KEY = '';
const profileCache = new Map();
const protectedMediaUrls = new Map();
let currentUser = null;
let currentProfile = null;

const SMART_CACHE_PREFIX = 'aias-community-cache-v2:';
const SMART_CACHE_TTL = 90 * 1000;
const smartSnapshots = new Map();
const smartRefreshes = new Map();

function smartCacheCheckedAt(key) {
  try { return Number(localStorage.getItem(SMART_CACHE_PREFIX + key)) || 0; } catch { return 0; }
}

function markSmartCacheChecked(key) {
  try { localStorage.setItem(SMART_CACHE_PREFIX + key, String(Date.now())); } catch {}
}

function invalidateSmartData(...prefixes) {
  [...smartSnapshots.keys()].forEach(key => {
    if (prefixes.some(prefix => key.startsWith(prefix))) smartSnapshots.delete(key);
  });
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = localStorage.key(index) || '';
      const dataKey = storageKey.startsWith(SMART_CACHE_PREFIX) ? storageKey.slice(SMART_CACHE_PREFIX.length) : '';
      if (prefixes.some(prefix => dataKey.startsWith(prefix))) localStorage.removeItem(storageKey);
    }
  } catch {}
}

async function refreshSmartQuery(key, sourceQuery, notify = false) {
  if (smartRefreshes.has(key)) return smartRefreshes.get(key);
  const refresh = getDocs(sourceQuery).then(snapshot => {
    smartSnapshots.set(key, snapshot);
    markSmartCacheChecked(key);
    if (notify) window.dispatchEvent(new CustomEvent('community-smart-refresh', {detail:{key}}));
    return snapshot;
  }).finally(() => smartRefreshes.delete(key));
  smartRefreshes.set(key, refresh);
  return refresh;
}

async function smartQuery(key, sourceQuery, maxAge = SMART_CACHE_TTL) {
  if (smartSnapshots.has(key)) return smartSnapshots.get(key);
  let cached = null;
  try { cached = await getDocsFromCache(sourceQuery); } catch {}
  const checkedAt = smartCacheCheckedAt(key);
  if (checkedAt && cached) {
    smartSnapshots.set(key, cached);
    if (Date.now() - checkedAt > maxAge) refreshSmartQuery(key, sourceQuery, true).catch(error => console.warn('[Community] Background refresh failed.', key, error));
    return cached;
  }
  return refreshSmartQuery(key, sourceQuery, false);
}

async function smartDocument(key, reference, maxAge = SMART_CACHE_TTL) {
  if (smartSnapshots.has(key)) return smartSnapshots.get(key);
  let cached = null;
  try { cached = await getDocFromCache(reference); } catch {}
  const checkedAt = smartCacheCheckedAt(key);
  if (checkedAt && cached) {
    smartSnapshots.set(key, cached);
    if (Date.now() - checkedAt > maxAge && !smartRefreshes.has(key)) {
      const refresh = getDoc(reference).then(snapshot => {
        smartSnapshots.set(key, snapshot);
        markSmartCacheChecked(key);
        return snapshot;
      }).catch(error => { console.warn('[Community] Background document refresh failed.', key, error); return cached; })
        .finally(() => smartRefreshes.delete(key));
      smartRefreshes.set(key, refresh);
    }
    return cached;
  }
  const snapshot = await getDoc(reference);
  smartSnapshots.set(key, snapshot);
  markSmartCacheChecked(key);
  return snapshot;
}

const readablePostsQuery = query(collection(db, 'communityPosts'), where('archived', '==', false), where('published', '==', true), where('moderationStatus', '==', 'clear'), where('visibility', '==', 'public'));
const readableSpacesQuery = query(collection(db, 'communitySpaces'), where('archived', '==', false));
const getReadablePosts = () => smartQuery('posts:all', readablePostsQuery, 4 * 60 * 1000);
const getReadableSpaces = () => smartQuery('spaces:active', readableSpacesQuery, 2 * 60 * 1000);
async function getFeedPosts(slug) {
  const optimizedQuery = slug
    ? query(collection(db, 'communityPosts'), where('archived', '==', false), where('published', '==', true), where('moderationStatus', '==', 'clear'), where('communitySlug', '==', slug), orderBy('createdAt', 'desc'), limit(45))
    : query(collection(db, 'communityPosts'), where('archived', '==', false), where('published', '==', true), where('moderationStatus', '==', 'clear'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(75));
  const key = slug ? 'posts:space:' + slug : 'posts:feed';
  if (feedListenerKey !== key) {
    unsubscribeFeed?.();
    feedListenerKey = key;
    let initial = true;
    feedInitialSnapshot = new Promise((resolve, reject) => {
      unsubscribeFeed = onSnapshot(optimizedQuery, snapshot => {
        smartSnapshots.set(key, snapshot);
        markSmartCacheChecked(key);
        if (initial) { initial = false; resolve(snapshot); }
        else window.dispatchEvent(new CustomEvent('community-smart-refresh', {detail:{key}}));
      }, reject);
    });
  }
  return feedInitialSnapshot;
}
let communitySort = ['latest','smart','upvoted'].includes(localStorage.getItem('communitySort')) ? localStorage.getItem('communitySort') : 'latest';
let communityType = ['both','text','question'].includes(localStorage.getItem('communityType')) ? localStorage.getItem('communityType') : 'both';
let activeCommentsPostId = null;
let toastTimer = null;
let routeSequence = 0;
let postPaintSequence = 0;
let feedVisibleLimit = 18;
let lastFeedScope = '';
let feedRefreshCycle = 0;
let sessionSeenPosts = new Set();
let activeAreaSlug = null;
let communityAreas = {};
let communityDataReady = null;
let selectedPromptPostId = null;
let spaceAvailabilitySequence = 0;
let communitySearchIndex = null;
let communitySearchIndexLoadedAt = 0;
let communitySearchIndexPromise = null;
let communitySearchSequence = 0;
let communitySearchActiveIndex = -1;
let profilePostFilter = 'grid';
let showOwnPrivateSpacePosts = false;
let activeProfilePosts = [];
let activePosts = [];
let loadedProfilePostsFor = null;
let activeEditPostId = null;
let composerMarketShare = null;
let composerPortfolioShare = null;
let spaceDirectorySort = 'popular';
let spaceDirectoryFilter = 'all';
let spaceDirectoryView = localStorage.getItem('spaceDirectoryView') === 'list' ? 'list' : 'grid';
let spaceDirectoryPage = 1;
const SPACE_DIRECTORY_PAGE_SIZE = 24;
let spaceDirectoryItems = [];
let popularSpaceStats = new Map();
let railSpacesExpanded = false;
let selectedShellProjects = [];
let newSpaceImageBase64 = '';
let newSpaceBannerBase64 = '';
let newSpaceMediaBusy = 0;
let activeEditSpaceSlug = null;
let editSpaceImageBase64 = '';
let editSpaceBannerBase64 = '';
let editSpaceMediaBusy = 0;
let feedMode = 'following';
let connectedUserIds = new Set();
let connectedSpaceSlugs = new Set();
let chatApprovedSpaceSlugs = new Set();
let blockedSpaceSlugs = new Set();
let managedSpaceSlugs = new Set();
let expandedManagedSpaceSlugs = new Set();
let managedSpacesAccordionReady = false;
let activeProfileId = null;
let profileConnectionActive = false;
let activeAreaConnection = false;
let unsubscribeNotifications = null;
let unsubscribeCurrentProfile = null;
let unsubscribeFeed = null;
let feedListenerKey = '';
let feedInitialSnapshot = null;
let unsubscribeComments = null;
let unsubscribeInlineComments = null;
let notificationItems = [];
let currentNotificationPreferences = {
  chatMessages: true,
  chatMentions: true,
  chatReplies: true,
  postComments: true,
  commentReplies: true,
  postMentions: true,
  postApplauses: true,
  connections: true,
  spaceRequests: true,
  pushEnabled: true
};
let currentMutedSpaceChats = new Set();
let notificationSnapshotReady = false;
let notificationServiceWorkerReady = null;
let fcmMessagingReady = null;
let connectionDirectoryType = 'people';
let connectionPeopleItems = [];
let connectionSpaceItems = [];
let activeImagePost = null;
let activeImageIndex = 0;
let unsubscribeSpaceMessages = null;
let unsubscribeSpaceAccess = null;
let unsubscribeAreaAccess = null;
let unsubscribeAreaChatRequest = null;
let unsubscribeSpaceMessageReads = null;
let activeMessageReply = null;
let activeMessageImage = null;
let activeMessageVoice = null;
let messageMediaRecorder = null;
let messageVoiceTimer = null;
let activeSharePost = null;
const sharedPostCache = new Map();
const chatImageUrls = new Map();
let activeSpaceMessages = [];
let liveSpaceMessages = [];
let olderSpaceMessages = [];
let activeSpaceMessageReads = [];
let activeMessagesSpace = null;
let lastSeenMessageMarked = '';
let unsubscribeSpaceChatPresence = null;
let chatPresenceTimer = null;
let activeChatPresence = [];
let showTopApplaudedMessages = false;
let activeReactionMessageId = '';
const CHAT_REACTION_EMOJIS = ['❤️','😂','😮','😢','🔥','👏'];
const CHAT_REACTION_LABELS = Object.freeze({
  '❤️':['Love','أحببته'],
  '😂':['Funny','مضحك'],
  '😮':['Wow','واو'],
  '😢':['Sad','حزين'],
  '🔥':['Fire','رائع'],
  '👏':['Applause','تصفيق']
});
const activeMessageReactions = new Map();
let chatInboxPresenceUnsubscribers = [];
let oldestSpaceMessageCursor = null;
let loadingOlderSpaceMessages = false;
let hasOlderSpaceMessages = true;
let spaceMessagePaintVersion = 0;
let postImages = [];
let communitySplashDismissed = false;
let mentionMenu = null;
let mentionMenuInput = null;
let mentionMenuRange = null;
let mentionMenuItems = [];
let mentionMenuIndex = 0;
let mentionMenuSequence = 0;
const chatMentionIndexCache = new Map();
const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const POST_IMAGE_CHUNK_SIZE = 700000;
const POST_IMAGE_MAX_COUNT = 6;
const POST_IMAGE_MAX_CHUNKS = 72;
const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const CHAT_AUDIO_MAX_MS = 5 * 60 * 1000;

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let currentLanguage = localStorage.getItem('language') === 'ar' ? 'ar' : 'en';
const isArabic = () => currentLanguage === 'ar';
const tr = (english, arabic) => isArabic() ? arabic : english;

function dismissCommunitySplash() {
  if (communitySplashDismissed) return;
  communitySplashDismissed = true;
  window.clearTimeout(window.__communitySplashFallback);
  const splash = $('communitySplash');
  document.body.classList.remove('community-booting');
  if (!splash) return;
  splash.classList.add('is-leaving');
  window.setTimeout(() => { splash.hidden = true; }, 450);
}

function applyCommunityTranslations(root = document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  const elements = scope.matches?.('[data-en][data-ar]')
    ? [scope, ...scope.querySelectorAll('[data-en][data-ar]')]
    : [...scope.querySelectorAll('[data-en][data-ar]')];
  elements.forEach(element => {
    const translation = element.getAttribute('data-' + currentLanguage);
    if (!translation) return;
    if (element.matches('input,textarea')) element.placeholder = translation;
    else if (!element.children.length) element.textContent = translation;
    else {
      const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = translation;
    }
  });
  scope.querySelectorAll?.('[data-aria-en][data-aria-ar]').forEach(element => element.setAttribute('aria-label', element.getAttribute('data-aria-' + currentLanguage)));
}

function setCommunityLanguage(language, rerender = true) {
  currentLanguage = language === 'ar' ? 'ar' : 'en';
  localStorage.setItem('language', currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = isArabic() ? 'rtl' : 'ltr';
  document.body.dir = isArabic() ? 'rtl' : 'ltr';
  $('communityLanguageLabel').textContent = isArabic() ? 'EN' : 'العربية';
  $('communityLanguageToggle').setAttribute('aria-label', isArabic() ? 'Switch to English' : 'التبديل إلى العربية');
  applyCommunityTranslations();
  if (activeEditPostId) {
    const editedPost = activeProfilePosts.find(item => item.id === activeEditPostId);
    if (editedPost) $('postEditBodyLabel').textContent = isProject(editedPost) ? tr('Project description','وصف المشروع') : tr('Content','المحتوى');
  }
  if (!rerender) return;
  renderCommunitySpaces();
  renderNotifications();
  loadPromptOfTheWeek();
  handleRoute(false);
  if (!$('communitySearchResults').hidden) runCommunitySearch($('communitySearch').value);
  if (activeCommentsPostId) openComments(activeCommentsPostId, false);
}

const isProject = post => post.type === 'behance';
const isQuestion = post => post.type === 'question';
const postLabel = post => isProject(post) ? tr('Project','مشروع') : isQuestion(post) ? tr('Open question','سؤال مفتوح') : tr('Thought','فكرة');

function extractBehanceEmbed(value) {
  const raw = String(value || '').trim();
  const iframeMatch = raw.match(/src=["']([^"']+)["']/i);
  const candidate = (iframeMatch ? iframeMatch[1] : raw).replace(/&amp;/g, '&');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !/^(www\.)?behance\.net$/i.test(url.hostname) || !url.pathname.startsWith('/embed/project/')) return '';
    return url.href;
  } catch {
    return '';
  }
}

async function loadLocalImage(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('This image could not be opened.','تعذر فتح هذه الصورة.'))); };
    image.src = url;
  });
}

async function prepareProfileImage(file, kind) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error(tr('Choose a valid image file.','اختر ملف صورة صالحاً.'));
  if (file.size > 10 * 1024 * 1024) throw new Error(tr('Choose an image smaller than 10 MB.','اختر صورة أصغر من 10 ميغابايت.'));
  const image = await loadLocalImage(file);
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  const settings = kind === 'avatar'
    ? {width:420, height:420, maxChars:180000}
    : {width:1400, height:466, maxChars:520000};
  const targetRatio = settings.width / settings.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0, sourceY = 0, cropWidth = sourceWidth, cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  let lastResult = '';
  for (const scale of [1, .82, .68]) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(settings.width * scale);
    canvas.height = Math.round(settings.height * scale);
    const context = canvas.getContext('2d', {alpha:false});
    context.fillStyle = '#f4f0eb';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    for (const quality of [.84, .72, .6, .48]) {
      lastResult = canvas.toDataURL('image/jpeg', quality);
      if (lastResult.length <= settings.maxChars) {
        image.close?.();
        return lastResult;
      }
    }
  }
  image.close?.();
  if (lastResult.length <= settings.maxChars) return lastResult;
  throw new Error(tr('This image is too detailed to save. Try a simpler or smaller image.','هذه الصورة كبيرة التفاصيل ولا يمكن حفظها. جرّب صورة أبسط أو أصغر.'));
}

function getPathRoute() {
  const segments = decodeURIComponent(location.pathname).split('/').filter(Boolean);
  const areaIndex = segments.lastIndexOf('a');
  const profileIndex = segments.lastIndexOf('p');
  return {
    area: areaIndex >= 0 && segments[areaIndex + 1] ? segments[areaIndex + 1].toLowerCase() : null,
    profile: profileIndex >= 0 && segments[profileIndex + 1] ? segments[profileIndex + 1] : null
  };
}

function areaUrl(slug) {
  return '/a/' + encodeURIComponent(slug);
}

function profileUrl(uid, username) {
  return '/p/' + encodeURIComponent(username || uid);
}

function extractMentions(text) {
  const usernames = new Set();
  const spaceSlugs = new Set();
  const pattern = /(^|[^A-Za-z0-9_.+-])@(?:(?:a\/)([a-z0-9-]{3,32})|([a-z0-9_]{3,24}))/gi;
  let match;
  while ((match = pattern.exec(String(text || '')))) {
    if (match[2]) spaceSlugs.add(match[2].toLowerCase());
    else if (match[3]) usernames.add(match[3].toLowerCase());
  }
  return {usernames:[...usernames].slice(0, 20), spaceSlugs:[...spaceSlugs].slice(0, 20)};
}

async function resolveMentions(text) {
  const extracted = extractMentions(text);
  const userIds = (await Promise.all(extracted.usernames.map(async username => {
    try {
      const snapshot = await getDoc(doc(db, 'usernames', username));
      return snapshot.exists() ? snapshot.data().userId || '' : '';
    } catch {
      return '';
    }
  }))).filter(Boolean);
  return {
    userIds:[...new Set(userIds)].slice(0, 20),
    spaceSlugs:extracted.spaceSlugs.filter(slug => communityAreas[slug]).slice(0, 20)
  };
}

function formatMarkdownSpans(raw) {
  let escaped = escapeHtml(raw);
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bidi-isolate">$1</code>');
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="bidi-isolate">$1</strong>');
  escaped = escaped.replace(/(^|[^\*])\*([^*]+)\*/g, '$1<em class="bidi-isolate">$2</em>');
  return escaped;
}

function renderMentionsInString(str) {
  const pattern = /(^|[^A-Za-z0-9_.+-])@(?:(?:a\/)([a-z0-9-]{3,32})|([a-z0-9_]{3,24}))/gi;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(str))) {
    result += formatMarkdownSpans(str.slice(lastIndex, match.index));
    result += formatMarkdownSpans(match[1] || '');
    if (match[2]) {
      const slug = match[2].toLowerCase();
      result += '<a class="community-mention space bidi-isolate" href="' + areaUrl(slug) + '">@a/' + escapeHtml(slug) + '</a>';
    } else {
      const username = match[3].toLowerCase();
      result += '<a class="community-mention person bidi-isolate" href="' + profileUrl('', username) + '">@' + escapeHtml(username) + '</a>';
    }
    lastIndex = pattern.lastIndex;
  }
  result += formatMarkdownSpans(str.slice(lastIndex));
  return result;
}

function renderMentionedText(text) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n/);
  const formattedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<br>';
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      return '<div class="content-heading" dir="auto">' + renderMentionsInString(headingMatch[1]) + '</div>';
    }
    const listMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (listMatch) {
      return '<div class="content-bullet" dir="auto"><span class="bullet-dot">•</span><span class="bullet-text">' + renderMentionsInString(listMatch[1]) + '</span></div>';
    }
    return '<div class="content-line" dir="auto">' + renderMentionsInString(trimmed) + '</div>';
  });
  return formattedLines.join('');
}

function renderMentionedTitle(text, destination) {
  const value = String(text || '');
  const pattern = /(^|[^A-Za-z0-9_.+-])@(?:(?:a\/)([a-z0-9-]{3,32})|([a-z0-9_]{3,24}))/gi;
  const postLink = value => value ? '<a href="' + escapeHtml(destination) + '">' + escapeHtml(value) + '</a>' : '';
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(value))) {
    const prefixEnd = match.index + (match[1] || '').length;
    result += postLink(value.slice(lastIndex, prefixEnd));
    if (match[2]) {
      const slug = match[2].toLowerCase();
      result += '<a class="community-mention space" href="' + areaUrl(slug) + '">@a/' + escapeHtml(slug) + '</a>';
    } else {
      const username = match[3].toLowerCase();
      result += '<a class="community-mention person" href="' + profileUrl('', username) + '">@' + escapeHtml(username) + '</a>';
    }
    lastIndex = pattern.lastIndex;
  }
  return result + postLink(value.slice(lastIndex));
}

function mentionQueryAtCursor(input) {
  const cursor = input.selectionStart;
  if (!Number.isInteger(cursor)) return null;
  const before = input.value.slice(0, cursor);
  const match = before.match(/(^|[^A-Za-z0-9_.+-])@([a-z0-9_\/-]*)$/i);
  if (!match) return null;
  const start = cursor - match[2].length - 1;
  return {start, end:cursor, query:match[2].toLowerCase()};
}

function closeMentionMenu() {
  mentionMenu?.remove();
  mentionMenu = null;
  mentionMenuInput?.removeAttribute('aria-controls');
  mentionMenuInput?.removeAttribute('aria-expanded');
  mentionMenuInput?.removeAttribute('aria-activedescendant');
  mentionMenuInput = null;
  mentionMenuRange = null;
  mentionMenuItems = [];
}

function positionMentionMenu() {
  if (!mentionMenu || !mentionMenuInput) return;
  const rect = mentionMenuInput.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 280), 430, window.innerWidth - 20);
  mentionMenu.style.width = width + 'px';
  mentionMenu.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)) + 'px';
  const menuHeight = Math.min(mentionMenu.scrollHeight || 260, 300);
  const showAbove = window.innerHeight - rect.bottom < menuHeight + 12 && rect.top > menuHeight;
  mentionMenu.style.top = (showAbove ? Math.max(10, rect.top - menuHeight - 7) : Math.min(window.innerHeight - menuHeight - 10, rect.bottom + 7)) + 'px';
}

function paintMentionMenu() {
  if (!mentionMenu) return;
  mentionMenu.querySelectorAll('[data-mention-option]').forEach((button, index) => {
    const active = index === mentionMenuIndex;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    if (active) {
      mentionMenuInput?.setAttribute('aria-activedescendant', button.id);
      button.scrollIntoView({block:'nearest'});
    }
  });
}

function chooseMention(index = mentionMenuIndex) {
  const item = mentionMenuItems[index];
  const input = mentionMenuInput;
  const range = mentionMenuRange;
  if (!item || !input || !range) return;
  const token = item.kind === 'space' ? '@a/' + item.handle : '@' + item.handle;
  input.setRangeText(token + ' ', range.start, range.end, 'end');
  input.dispatchEvent(new Event('input', {bubbles:true}));
  closeMentionMenu();
  input.focus();
}

async function openMentionMenu(input) {
  const range = mentionQueryAtCursor(input);
  if (!range) return closeMentionMenu();
  const sequence = ++mentionMenuSequence;
  let index;
  try { index = input.id === 'messageText' ? await loadChatMentionIndex(activeMessagesSpace) : await loadCommunitySearchIndex(); }
  catch { return closeMentionMenu(); }
  if (sequence !== mentionMenuSequence || document.activeElement !== input) return;
  const raw = range.query;
  const chatOnly = input.id === 'messageText';
  const spaceOnly = !chatOnly && raw.startsWith('a/');
  const queryText = normalizeSearchText(raw.replace(/^a\//, ''));
  const aiCandidate = {
    kind: 'member', id: 'aias_assistant', title: tr('AIAS AI Assistant', 'مساعد AIAS الذكي'), handle: 'ai',
    searchText: 'ai assistant ذكاء اصطناعي مساعد aias', icon: 'AI', photo: '', sortTime: 9999999999
  };
  const baseIndex = [aiCandidate, ...index.filter(item => item.id !== 'aias_assistant')];
  const candidates = baseIndex
    .filter(item => (item.kind === 'member' || item.kind === 'space') && (!chatOnly || item.kind === 'member') && (!spaceOnly || item.kind === 'space'))
    .map(item => ({...item, mentionScore:queryText ? searchResultScore(item, (item.kind === 'member' ? '@' : 'a/') + queryText) : (item.id === 'aias_assistant' ? 10 : (item.kind === 'member' ? 8 : 7))}))
    .filter(item => item.mentionScore >= 0)
    .sort((left, right) => right.mentionScore - left.mentionScore || right.sortTime - left.sortTime)
    .slice(0, 8);
  if (!candidates.length) return closeMentionMenu();
  closeMentionMenu();
  mentionMenuInput = input;
  mentionMenuRange = range;
  mentionMenuItems = candidates;
  mentionMenuIndex = 0;
  mentionMenu = document.createElement('div');
  mentionMenu.id = 'communityMentionMenu';
  mentionMenu.className = 'mention-menu';
  mentionMenu.setAttribute('role', 'listbox');
  mentionMenu.innerHTML = candidates.map((item, itemIndex) => {
    const handle = item.kind === 'space' ? '@a/' + item.handle : '@' + item.handle;
    const kind = item.kind === 'space' ? tr('Space','مساحة') : input.id === 'messageText' ? tr('Chat member','عضو في الدردشة') : tr('Person','شخص');
    const visual = item.photo ? '<img src="' + escapeHtml(item.photo) + '" alt="">' : escapeHtml(item.icon);
    return '<button id="mention-option-' + itemIndex + '" type="button" role="option" data-mention-option="' + itemIndex + '"><span class="mention-option-icon ' + item.kind + '">' + visual + '</span><span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(handle) + ' · ' + kind + '</small></span></button>';
  }).join('');
  document.body.appendChild(mentionMenu);
  input.setAttribute('aria-controls', mentionMenu.id);
  input.setAttribute('aria-expanded', 'true');
  mentionMenu.addEventListener('mousedown', event => event.preventDefault());
  mentionMenu.addEventListener('click', event => {
    const option = event.target.closest('[data-mention-option]');
    if (option) chooseMention(Number(option.dataset.mentionOption));
  });
  positionMentionMenu();
  paintMentionMenu();
}

async function loadChatMentionIndex(space) {
  if (!space?.slug) return [];
  const cached = chatMentionIndexCache.get(space.slug);
  if (cached && Date.now() - cached.loadedAt < 45000) return cached.items;
  const [connections, admins] = await Promise.all([
    getDocs(collection(db, 'communitySpaces', space.slug, 'connections')),
    getDocs(collection(db, 'communitySpaces', space.slug, 'admins')).catch(() => null)
  ]);
  const ids = new Set(connections.docs.map(item => item.data().userId || item.id).filter(Boolean));
  admins?.docs.forEach(item => ids.add(item.data().userId || item.id));
  if (space.creatorId) ids.add(space.creatorId);
  if (currentUser?.uid) ids.add(currentUser.uid);
  const profiles = await Promise.all([...ids].map(async id => ({id, profile:await getProfile(id)})));
  const items = profiles.filter(({profile}) => profile.username).map(({id, profile}) => ({
    kind:'member', id, title:profile.displayName || '@' + profile.username, handle:profile.username,
    searchText:[profile.username, profile.displayName].join(' '), icon:initials(profile.displayName || profile.username),
    photo:profile.photoBase64 || profile.photoURL || '', sortTime:profile.updatedAt?.seconds || 0
  }));
  chatMentionIndexCache.set(space.slug, {loadedAt:Date.now(), items});
  return items;
}

function notificationKey(type, postId, actorId, detailId = '') {
  return [type, postId, actorId, detailId].filter(Boolean).join('_');
}

async function sendNotification(recipientId, type, post, detailId = '', eventId = detailId, sourceId = '') {
  if (!currentUser || !recipientId || recipientId === currentUser.uid) return;
  const id = notificationKey(type, post.id, currentUser.uid, eventId);
  try {
    await setDoc(doc(db, 'users', recipientId, 'notifications', id), {
      recipientId,
      actorId:currentUser.uid,
      actorName:currentProfile?.displayName || currentUser.displayName || tr('Member','عضو'),
      actorUsername:currentProfile?.username || '',
      type,
      postId:post.id,
      postTitle:post.title || tr('Community post','منشور المجتمع'),
      detailId,
      sourceId,
      read:false,
      createdAt:serverTimestamp()
    });
  } catch (error) {
    console.warn('[Community] Notification could not be created.', error);
  }
}

async function removeNotification(recipientId, type, postId, detailId = '') {
  if (!currentUser || !recipientId || recipientId === currentUser.uid) return;
  try { await deleteDoc(doc(db, 'users', recipientId, 'notifications', notificationKey(type, postId, currentUser.uid, detailId))); }
  catch (error) { console.warn('[Community] Notification could not be removed.', error); }
}

async function updateConnectionNotification(recipientId, type, detailId, title, connected) {
  if (!currentUser || !recipientId || recipientId === currentUser.uid) return;
  const notificationRef = doc(db, 'users', recipientId, 'notifications', notificationKey(type, detailId, currentUser.uid));
  try {
    if (!connected) {
      await deleteDoc(notificationRef);
      return;
    }
    await setDoc(notificationRef, {
      recipientId,
      actorId:currentUser.uid,
      actorName:currentProfile?.displayName || currentUser.displayName || tr('Member','عضو'),
      actorUsername:currentProfile?.username || '',
      type,
      postId:'',
      postTitle:title || tr('Community connection','تواصل مجتمعي'),
      detailId,
      read:false,
      createdAt:serverTimestamp()
    });
  } catch (error) {
    console.warn('[Community] Connection notification could not be updated.', error);
  }
}

async function sendSpaceRequestNotification(space) {
  if (!currentUser || !space?.creatorId || space.creatorId === currentUser.uid) return;
  const notificationRef = doc(db, 'users', space.creatorId, 'notifications', notificationKey('space_request', space.slug, currentUser.uid));
  try {
    await setDoc(notificationRef, {
      recipientId:space.creatorId,
      actorId:currentUser.uid,
      actorName:currentProfile?.displayName || currentUser.displayName || tr('Member','عضو'),
      actorUsername:currentProfile?.username || '',
      type:'space_request',
      postId:'',
      postTitle:space.name || 'a/' + space.slug,
      detailId:space.slug,
      read:false,
      createdAt:serverTimestamp()
    });
  } catch (error) { console.warn('[Community] Space-request notification could not be created.', error); }
}

function notificationCopy(item) {
  if (item.type === 'main_thread_access_granted') return tr(' approved your main-thread posting access',' وافق على تصريح النشر في المسار الرئيسي');
  if (item.type === 'main_thread_access_denied') return tr(' reviewed your main-thread posting request',' راجع طلب تصريح النشر في المسار الرئيسي');
  if (item.type === 'space_post_warned') return tr(' warned your space post',' حذّرك بشأن منشورك في المساحة');
  if (item.type === 'space_post_deleted') return tr(' deleted your space post',' حذف منشورك في المساحة');
  if (item.type === 'space_member_warned') return tr(' sent you a space warning',' أرسل إليك تحذيراً في المساحة');
  if (item.type === 'space_member_removed') return tr(' removed you from a space',' أزالك من المساحة');
  if (item.type === 'space_chat_removed') return tr(' removed you from space messages',' أزالك من رسائل المساحة');
  if (item.type === 'space_message') return tr(' mentioned or replied to you in space messages',' أشار إليك أو رد عليك في رسائل المساحة');
  if (item.type === 'space_post') return tr(' posted in your space',' نشر في مساحتك');
  if (item.type === 'mention') return tr(' mentioned you',' أشار إليك');
  if (item.type === 'space_mention') return tr(' mentioned your space',' أشار إلى مساحتك');
  if (item.type === 'connection') return tr(' connected with you',' تواصل معك');
  if (item.type === 'space_connection') return tr(' connected with your space',' تواصل مع مساحتك');
  if (item.type === 'space_request') return tr(' requested access to your space',' طلب الوصول إلى مساحتك');
  if (item.type === 'space_chat_request') return tr(' requested Messages access for your space',' طلب الوصول إلى رسائل مساحتك');
  if (item.type === 'reply') return tr(' replied to your comment',' ردّ على تعليقك');
  if (item.type === 'applause') return tr(' applauded your post',' صفّق لمنشورك');
  return tr(' commented on your post',' علّق على منشورك');
}

function renderNotifications() {
  const unread = notificationItems.filter(item => !item.read).length;
  $('notificationBadge').hidden = unread === 0;
  $('notificationBadge').textContent = unread > 99 ? '99+' : String(unread);
  $('markNotificationsRead').disabled = unread === 0;
  $('notificationList').innerHTML = notificationItems.length
    ? notificationItems.map(item => {
      const targetUrl = item.type === 'connection'
        ? profileUrl(item.actorId, item.actorUsername)
        : ['space_message'].includes(item.type)
          ? '/community.html?view=messages&area=' + encodeURIComponent(item.detailId)
          : ['space_connection','space_request','space_chat_request','space_member_warned','space_member_removed','space_post_deleted','space_chat_removed'].includes(item.type)
            ? areaUrl(item.detailId)
          : '/community.html?post=' + encodeURIComponent(item.postId) + '&comments=1';
      const symbol = item.type === 'connection' ? '◎' : item.type === 'space_connection' ? '#' : item.type === 'space_request' ? '◐' : item.type === 'reply' ? '↩' : item.type === 'applause' ? '✦' : '◯';
      return '<button class="notification-item' + (item.read ? '' : ' unread') + '" type="button" data-notification-id="' + escapeHtml(item.id) + '" data-notification-url="' + escapeHtml(targetUrl) + '"><span class="notification-symbol" aria-hidden="true">' + symbol + '</span><span><strong>' + escapeHtml(item.actorName || tr('Member','عضو')) + notificationCopy(item) + '</strong><small>' + escapeHtml(item.postTitle || tr('Community post','منشور المجتمع')) + ' · ' + escapeHtml(formatDate(item.createdAt)) + '</small></span><i aria-hidden="true"></i></button>';
    }).join('')
    : '<p class="notification-empty">' + tr('No notifications yet.','لا توجد إشعارات بعد.') + '</p>';
}

function stopNotificationInbox() {
  unsubscribeNotifications?.();
  unsubscribeNotifications = null;
  notificationItems = [];
  notificationSnapshotReady = false;
  $('notificationBell').hidden = true;
  $('notificationPanel').hidden = true;
  renderNotifications();
}

function playNotificationTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.08, context.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .24);
    oscillator.addEventListener('ended', () => context.close());
  } catch {}
}

function registerNotificationServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  if (!notificationServiceWorkerReady) {
    notificationServiceWorkerReady = navigator.serviceWorker.register('/community-notifications-sw.js')
      .then(registration => navigator.serviceWorker.ready.then(() => registration))
      .catch(error => { console.warn('[Community] Native notification service is unavailable.', error); return null; });
  }
  return notificationServiceWorkerReady;
}

async function sendMentionNotifications(post, mentions, sourceId = '') {
  if (!currentUser || !post?.id || !mentions) return;
  const tasks = mentions.userIds.map(userId => sendNotification(userId, 'mention', post, sourceId, sourceId || post.id));
  mentions.spaceSlugs.forEach(slug => {
    const ownerId = communityAreas[slug]?.creatorId;
    if (ownerId) tasks.push(sendNotification(ownerId, 'space_mention', post, slug, (sourceId || post.id) + '_' + slug, sourceId));
  });
  await Promise.all(tasks);
}

async function notifySpaceAdminOfPost(post) {
  const slug = post?.communitySlug;
  const ownerId = slug && slug !== 'main' ? communityAreas[slug]?.creatorId : '';
  if (ownerId) await sendNotification(ownerId, 'space_post', post, slug, post.id);
}

function notificationPermissionHelp() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (appleMobile) return tr('On iPhone or iPad, add this website to the Home Screen, open it from its icon, then tap the bell again.','على iPhone أو iPad، أضف الموقع إلى الشاشة الرئيسية، وافتحه من الأيقونة ثم اضغط الجرس مرة أخرى.');
  if (safari) return tr('Allow this website in Safari → Settings → Websites → Notifications.','اسمح للموقع من Safari ← الإعدادات ← مواقع الويب ← الإشعارات.');
  return tr('Browser notifications are blocked. Enable them in your browser site settings.','إشعارات المتصفح محظورة. فعّلها من إعدادات الموقع في المتصفح.');
}

async function notificationTokenId(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function registerPushSubscription() { if(!currentUser || !('Notification' in window) || Notification.permission!=='granted')return null;const registration=await registerNotificationServiceWorker();return registration?registerWebPush(registration):null; }

async function showBrowserNotification(item) {
  if (!item || item.read || !('Notification' in window) || Notification.permission !== 'granted') return;
  const target = item.type === 'connection' ? profileUrl(item.actorId, item.actorUsername) : item.type === 'space_connection' || item.type === 'space_request' || item.type === 'space_chat_request' ? areaUrl(item.detailId) : '/community.html?post=' + encodeURIComponent(item.postId) + '&comments=1';
  const options = {
    body:(item.actorName || tr('Member','عضو')) + notificationCopy(item) + ' · ' + (item.postTitle || ''),
    icon:'/LOGO.png',
    tag:item.id,
    renotify:true,
    silent:false,
    data:{url:target}
  };
  try {
    const registration = await registerNotificationServiceWorker();
    if (registration?.showNotification) await registration.showNotification('AIAS Basra Community', options);
    else {
      const notification = new Notification('AIAS Basra Community', options);
      notification.onclick = () => { window.focus(); navigateTo(target, false); notification.close(); };
    }
  } catch (error) {
    console.warn('[Community] Browser notification could not be shown.', error);
  }
  playNotificationTone();
}

function startNotificationInbox() {
  unsubscribeNotifications?.();
  if (!currentUser) return stopNotificationInbox();
  notificationSnapshotReady = false;
  $('notificationBell').hidden = false;
  if ('Notification' in window && Notification.permission === 'granted') registerPushSubscription().catch(error => console.warn('[Community] Push subscription could not be registered.', error));
  const inboxQuery = query(collection(db, 'users', currentUser.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(40));
  unsubscribeNotifications = onSnapshot(inboxQuery, snapshot => {
    notificationItems = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    renderNotifications();
    if (notificationSnapshotReady) snapshot.docChanges().filter(change => change.type === 'added').forEach(change => showBrowserNotification({id:change.doc.id, ...change.doc.data()}));
    notificationSnapshotReady = true;
  }, error => {
    console.warn('[Community] Notifications unavailable.', error);
    $('notificationList').innerHTML = '<p class="notification-empty">' + tr('Notifications are unavailable right now.','الإشعارات غير متاحة حالياً.') + '</p>';
  });
}

async function loadConnections() {
  connectedUserIds = new Set();
  connectedSpaceSlugs = new Set();
  chatApprovedSpaceSlugs = new Set();
  blockedSpaceSlugs = new Set();
  if (!currentUser) return;
  try {
    const [people, spaces, blockedSpaces] = await Promise.all([
      getDocs(collection(db, 'users', currentUser.uid, 'connections')),
      getDocs(collection(db, 'users', currentUser.uid, 'connectedSpaces')),
      getDocs(collection(db, 'users', currentUser.uid, 'blockedSpaces'))
    ]);
    connectedUserIds = new Set(people.docs.map(item => item.id));
    connectedSpaceSlugs = new Set(spaces.docs.map(item => item.id).filter(slug => communityAreas[slug]));
    chatApprovedSpaceSlugs = new Set(spaces.docs.filter(item => item.data().chatAccessApproved !== false).map(item => item.id));
    blockedSpaceSlugs = new Set(blockedSpaces.docs.map(item => item.id));
  } catch (error) {
    console.warn('[Community] Connections unavailable.', error);
  }
}

function renderConnectionManager() {
  const peopleTotal = connectionPeopleItems.length;
  const spacesTotal = connectionSpaceItems.length;
  const numberLocale = isArabic() ? 'ar-IQ' : undefined;
  $('connectionPeopleTotal').textContent = peopleTotal.toLocaleString(numberLocale);
  $('connectionSpacesTotal').textContent = spacesTotal.toLocaleString(numberLocale);
  $('connectionPeopleTabCount').textContent = peopleTotal.toLocaleString(numberLocale);
  $('connectionSpacesTabCount').textContent = spacesTotal.toLocaleString(numberLocale);
  document.querySelectorAll('[data-connection-type]').forEach(button => button.classList.toggle('active', button.dataset.connectionType === connectionDirectoryType));
  const term = $('connectionsSearch').value.trim().toLowerCase();
  const source = connectionDirectoryType === 'people' ? connectionPeopleItems : connectionSpaceItems;
  const filtered = source.filter(item => item.searchText.includes(term));
  if (!filtered.length) {
    const hasConnections = source.length > 0;
    $('connectionsList').innerHTML = '<div class="connections-empty"><span aria-hidden="true">' + (connectionDirectoryType === 'people' ? '◎' : '#') + '</span><h2>' + (hasConnections ? tr('No matching connections','لا توجد تواصلات مطابقة') : connectionDirectoryType === 'people' ? tr('No people connected yet','لا يوجد أشخاص متصلون بعد') : tr('No spaces connected yet','لا توجد مساحات متصلة بعد')) + '</h2><p>' + (hasConnections ? tr('Try a different name or handle.','جرّب اسماً أو معرّفاً مختلفاً.') : tr('Use Discover to find people and spaces that interest you.','استخدم صفحة اكتشف للعثور على أشخاص ومساحات تهمك.')) + '</p>' + (!hasConnections ? '<a href="' + (connectionDirectoryType === 'spaces' ? '/community.html?view=spaces' : '/community.html?feed=discover') + '">' + tr('Start discovering','ابدأ الاكتشاف') + ' →</a>' : '') + '</div>';
    return;
  }
  $('connectionsList').innerHTML = filtered.map(item => connectionDirectoryType === 'people'
    ? '<article class="connection-card"><a href="' + escapeHtml(profileUrl(item.uid, item.username)) + '">' + avatarMarkup(item.displayName, item.photo, 'connection-card-avatar', item.verified === true) + '<span class="connection-card-copy"><strong>' + escapeHtml(item.displayName) + '</strong>' + businessBadgeMarkup(item, true) + '<small>' + escapeHtml(item.username ? '@' + item.username : tr('Community member','عضو في المجتمع')) + '</small><p>' + escapeHtml(item.bio || [item.school, item.city].filter(Boolean).join(' · ') || tr('AIAS Basra community','مجتمع AIAS البصرة')) + '</p></span></a><button type="button" data-disconnect-user="' + escapeHtml(item.uid) + '"><span>' + tr('Disconnect','إلغاء التواصل') + '</span><b aria-hidden="true">×</b></button></article>'
    : '<article class="connection-card space"><a href="' + escapeHtml(areaUrl(item.slug)) + '">' + spaceVisual(item.area, 'connection-card-avatar') + '<span class="connection-card-copy"><strong>' + escapeHtml(item.area.name || item.slug) + '</strong><small>a/' + escapeHtml(item.slug) + '</small><p>' + escapeHtml(item.area.description || tr('Community space','مساحة مجتمعية')) + '</p></span></a><button type="button" data-disconnect-space="' + escapeHtml(item.slug) + '"><span>' + tr('Disconnect','إلغاء التواصل') + '</span><b aria-hidden="true">×</b></button></article>'
  ).join('');
}

async function loadConnectionManager() {
  if (!currentUser) {
    $('connectionsManager').hidden = true;
    $('connectionsGate').innerHTML = '<p class="notice">' + tr('Sign in to view and manage your connections.','سجّل الدخول لعرض تواصلاتك وإدارتها.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    return;
  }
  $('connectionsGate').innerHTML = '';
  $('connectionsManager').hidden = false;
  $('connectionsList').innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  const people = await Promise.all([...connectedUserIds].map(async uid => {
    const profile = await getProfile(uid);
    const displayName = profile.displayName || tr('Community member','عضو في المجتمع');
    return {uid, ...profile, displayName, photo:profile.photoBase64 || profile.photoURL || '', searchText:[displayName, profile.username, profile.school, profile.city, profile.bio].filter(Boolean).join(' ').toLowerCase()};
  }));
  connectionPeopleItems = people.sort((a,b) => a.displayName.localeCompare(b.displayName));
  connectionSpaceItems = [...connectedSpaceSlugs].filter(slug => communityAreas[slug]).map(slug => {
    const area = communityAreas[slug];
    return {slug, area, searchText:[slug, area.name, area.description].filter(Boolean).join(' ').toLowerCase()};
  }).sort((a,b) => (a.area.name || a.slug).localeCompare(b.area.name || b.slug));
  renderConnectionManager();
}

async function toggleUserConnection(targetId) {
  if (!currentUser) { location.href = loginUrl(); return false; }
  if (!targetId || targetId === currentUser.uid) return false;
  const next = !connectedUserIds.has(targetId);
  const batch = writeBatch(db);
  const connectionRef = doc(db, 'users', currentUser.uid, 'connections', targetId);
  const followerRef = doc(db, 'users', targetId, 'followers', currentUser.uid);
  if (next) {
    const record = {userId:currentUser.uid, targetUserId:targetId, createdAt:serverTimestamp()};
    batch.set(connectionRef, record);
    batch.set(followerRef, record);
  } else {
    batch.delete(connectionRef);
    batch.delete(followerRef);
  }
  await batch.commit();
  if (next) connectedUserIds.add(targetId); else connectedUserIds.delete(targetId);
  await updateConnectionNotification(targetId, 'connection', targetId, tr('New connection','تواصل جديد'), next);
  return next;
}

async function toggleSpaceConnection(slug) {
  if (!currentUser) { location.href = loginUrl(); return false; }
  if (!slug || !communityAreas[slug]) return false;
  const space = communityAreas[slug];
  const next = !connectedSpaceSlugs.has(slug);
  if (!next) {
    const postsSnapshot = await getDocs(query(collection(db, 'communityPosts'), where('userId', '==', currentUser.uid), where('archived', '==', false)));
    const spacePosts = postsSnapshot.docs.filter(item => item.data().communitySlug === slug);
    const warning = tr(
      'Disconnect from a/' + slug + '? All of your posts in this space (' + spacePosts.length.toLocaleString() + ') will be permanently deleted. This cannot be undone.',
      'هل تريد إلغاء الاتصال من a/' + slug + '؟ سيتم حذف جميع منشوراتك في هذه المساحة (' + spacePosts.length.toLocaleString('ar-IQ') + ') نهائياً. لا يمكن التراجع عن ذلك.'
    );
    if (!confirm(warning)) return null;
  }
  const result = await callFunction('setCommunitySpaceConnection', {spaceId:slug, connected:next});
  if (result.status === 'requested') {
    await sendSpaceRequestNotification(space);
    return 'requested';
  }
  if (next) connectedSpaceSlugs.add(slug); else { connectedSpaceSlugs.delete(slug); chatApprovedSpaceSlugs.delete(slug); }
  renderCommunitySpaces();
  if (!next) invalidateCommunitySearchIndex();
  await updateConnectionNotification(space.creatorId, 'space_connection', slug, space.name || 'a/' + slug, next);
  return next;
}

function extractInterestTokens(interestsStr, skillsStr = '', bioStr = '') {
  const combined = [interestsStr || '', skillsStr || '', bioStr || ''].join(' ');
  if (!combined.trim()) return [];
  return combined
    .toLowerCase()
    .split(/[,،\n\s/|#]+/)
    .map(s => s.trim().replace(/^#+/, ''))
    .filter(s => s.length >= 2 && !['and', 'the', 'for', 'with', 'via', 'في', 'من', 'على', 'مع'].includes(s));
}

function calculatePersonalAffinity(post, userTokens) {
  if (!userTokens || !userTokens.length) return 0;
  const postText = ((post.title || '') + ' ' + (post.content || '') + ' ' + (post.summary || '') + ' ' + (post.communitySlug || '')).toLowerCase();
  let matchCount = 0;
  for (const token of userTokens) {
    if (postText.includes(token)) {
      matchCount++;
    }
  }
  return Math.min(18, matchCount * 6);
}

function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function discoverScore(post) {
  const meta = post.meta || { score: Number(post.score) || 0, commentsCount: Number(post.commentsCount) || 0 };
  const created = post.createdAt?.seconds || (Date.now() / 1000);
  const updated = post.lastActivityAt?.seconds || post.editedAt?.seconds || post.updatedAt?.seconds || created;
  const lastActive = Math.max(created, updated);
  const ageHours = Math.max(0, Date.now() / 1000 - lastActive) / 3600;

  // 1. Dynamic Half-life Decay curve with activity recency
  const timeFactor = 100 / Math.pow(1 + ageHours / 22, 1.25);

  // 2. Engagement & Interaction Velocity (Applause + Comments + Sub-post depth)
  const rawScore = Number(meta.score) || 0;
  const applauseScore = rawScore > 0 ? Math.log2(rawScore + 1) * 16 : (rawScore < 0 ? -8 : 0);
  const commentsScore = Math.log2(Math.max(0, Number(meta.commentsCount) || 0) + 1) * 14;
  const threadBonus = Number(post.subPostCount) > 0 ? Math.log2(Number(post.subPostCount) + 1) * 9 : 0;
  const engagementSum = applauseScore + commentsScore + threadBonus;

  // 3. Content Quality & Presentation signals
  const isProj = isProject(post);
  const isQuest = isQuestion(post);
  const imageUrls = post.imageUrls || post.images || [];
  const imageCount = Array.isArray(imageUrls) ? imageUrls.length : (post.imageURL ? 1 : 0);
  const textLength = String(post.content || post.summary || post.text || '').length;

  let qualityScore = 0;
  if (post.featured) qualityScore += 24; // Curated spotlight
  if (isProj) qualityScore += 16; // Architectural showcase / portfolio
  if (imageCount > 0) qualityScore += Math.min(10, imageCount * 3.5); // Visual renders / drawings
  if (textLength >= 280) qualityScore += 6; // Deep thought / writeup
  else if (textLength >= 90) qualityScore += 3;
  if (isQuest && (Number(meta.commentsCount) || 0) < 5) qualityScore += 8; // Unanswered question seeking community peers

  // 4. Personal Affinity & Social Connections
  let socialScore = 0;
  const isConnectedAuthor = currentUser && connectedUserIds.has(post.userId);
  const isConnectedSpace = post.communitySlug && connectedSpaceSlugs.has(post.communitySlug);
  if (isConnectedAuthor) socialScore += 12;
  if (isConnectedSpace) socialScore += 8;

  // Personal interest match from current profile
  const userInterests = currentProfile ? extractInterestTokens(currentProfile.interests, currentProfile.skills, currentProfile.bio) : [];
  const interestMatchScore = calculatePersonalAffinity(post, userInterests);

  // 5. Cold-Start Discovery Boost for fresh submissions (< 4 hours old)
  const coldStartBoost = ageHours <= 4 ? (4 - ageHours) * 4.5 : 0;

  // 6. Session Seen Fatigue & Harmonic Refresh Rotation
  const isSeenInSession = sessionSeenPosts.has(post.id);
  const seenDampener = isSeenInSession ? 0.52 : 1.0;
  const jitter = Math.sin(stringHash(post.id || '') + feedRefreshCycle * 1.618) * 7.5;

  // Composite Formula
  const baseScore = engagementSum + qualityScore + socialScore + interestMatchScore + jitter;
  const totalScore = (baseScore * (timeFactor / 100) * seenDampener) + (timeFactor * 0.45) + coldStartBoost;

  return Math.max(0.1, totalScore);
}

function rankDiscoverPosts(posts) {
  if (!Array.isArray(posts) || posts.length <= 1) return posts || [];

  const pool = posts.map(post => ({
    ...post,
    discoverScore: discoverScore(post)
  })).sort((a, b) => b.discoverScore - a.discoverScore);

  const result = [];
  const authorCounts = new Map();
  const spaceCounts = new Map();

  while (pool.length) {
    const lastPost = result.at(-1);
    const lastAuthor = lastPost?.userId;
    const lastSpace = lastPost?.communitySlug;

    // 1. Ideal candidate: Not same author as last, not exceeding 2 posts per author, not same space 3x in a row
    let index = pool.findIndex(post => {
      const authorCount = authorCounts.get(post.userId) || 0;
      const isDiffAuthor = post.userId !== lastAuthor;
      const isUnderAuthorCap = authorCount < 2;
      const isDiffSpace = !lastSpace || post.communitySlug !== lastSpace || post.communitySlug === 'main';
      return isDiffAuthor && isUnderAuthorCap && isDiffSpace;
    });

    // Fallback 1: Different author, under author cap
    if (index < 0) {
      index = pool.findIndex(post => post.userId !== lastAuthor && (authorCounts.get(post.userId) || 0) < 2);
    }

    // Fallback 2: Different author regardless of cap
    if (index < 0) {
      index = pool.findIndex(post => post.userId !== lastAuthor);
    }

    // Fallback 3: Top remaining candidate
    if (index < 0) {
      index = 0;
    }

    const [post] = pool.splice(index, 1);
    authorCounts.set(post.userId, (authorCounts.get(post.userId) || 0) + 1);
    if (post.communitySlug) spaceCounts.set(post.communitySlug, (spaceCounts.get(post.communitySlug) || 0) + 1);
    result.push(post);
  }

  return result;
}

async function resolveProfileId(routeValue) {
  if (!routeValue) return null;
  const normalized = String(routeValue).toLowerCase();
  if (currentUser && (routeValue === currentUser.uid || normalized === currentProfile?.username)) return currentUser.uid;
  try {
    const usernameSnapshot = await getDoc(doc(db, 'usernames', normalized));
    if (usernameSnapshot.exists()) return usernameSnapshot.data().userId || null;
  } catch (error) {
    console.warn('[Community] Username index unavailable, trying profile fallback.', error);
  }
  try {
    const userSnapshot = await getDoc(doc(db, 'publicProfiles', routeValue));
    if (userSnapshot.exists()) return routeValue;
    const legacySnapshot = await getDocs(query(collection(db, 'publicProfiles'), where('username', '==', normalized), limit(1)));
    return legacySnapshot.empty ? null : legacySnapshot.docs[0].id;
  } catch { return null; }
}

function normalizeCommunityHandle(value) {
  return String(value || '').trim().toLowerCase().replace(/^\/?a\//, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function spaceVisual(area, className, tag = 'span') {
  const image = area?.imageURL || area?.imageBase64 || '';
  return '<' + tag + ' class="' + className + '">' + (image
    ? '<img src="' + escapeHtml(image) + '" alt="">'
    : escapeHtml(area?.symbol || initials(area?.name || 'A'))) + '</' + tag + '>';
}

function canPostToSpace(slug) {
  const mainAccess = currentProfile?.mainThreadPostingAccess !== false;
  if (slug === 'main') return mainAccess;
  const area = communityAreas[slug];
  return Boolean(currentUser && area && (area.creatorId === currentUser.uid || connectedSpaceSlugs.has(slug)) && (mainAccess || area.isPrivate === true));
}

function canAccessPrivateSpace(area) {
  return !blockedSpaceSlugs.has(area?.slug) && (!area?.isPrivate || area.creatorId === currentUser?.uid || connectedSpaceSlugs.has(area.slug));
}

function renderPrivateSpaceGate(area) {
  const restricted = Boolean(area?.isPrivate && !canAccessPrivateSpace(area));
  const gate = $('privateSpaceGate');
  if (!gate) return false;
  gate.hidden = !restricted;
  if (!restricted) return false;
  const title = $('privateSpaceDialogTitle');
  const copy = $('privateSpaceDialogCopy');
  const requestButton = $('privateSpaceRequest');
  if (!title || !copy || !requestButton) return false;
  title.textContent = tr('This space is private','هذه المساحة خاصة');
  copy.textContent = currentUser
    ? tr('a/' + area.slug + ' is available to approved members only. Send a request and the space admin can review it.','مساحة a/' + area.slug + ' متاحة للأعضاء الموافق عليهم فقط. أرسل طلباً ليتمكن مشرف المساحة من مراجعته.')
    : tr('a/' + area.slug + ' is available to approved members only. Sign in to request access from its admin.','مساحة a/' + area.slug + ' متاحة للأعضاء الموافق عليهم فقط. سجّل الدخول لطلب الوصول من مشرفها.');
  requestButton.querySelector('span').textContent = currentUser ? tr('Request access','طلب الوصول') : tr('Sign in to request','سجّل الدخول للطلب');
  return true;
}

function canViewSpacePost(post) {
  const area = communityAreas[post.communitySlug];
  return !blockedSpaceSlugs.has(post.communitySlug) && (!area?.isPrivate || area.creatorId === currentUser?.uid || connectedSpaceSlugs.has(post.communitySlug) || post.userId === currentUser?.uid);
}

function renderCommunitySpaces() {
  const spaces = Object.entries(communityAreas).filter(([slug]) => !blockedSpaceSlugs.has(slug)).sort((a,b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
  const ownedSpaces = currentUser
    ? spaces.filter(([,area]) => area.creatorId === currentUser.uid).sort((a,b) => spaceTimestamp(b[1].createdAt) - spaceTimestamp(a[1].createdAt) || (a[1].name || a[0]).localeCompare(b[1].name || b[0]))
    : [];
  const visibleOwnedSpaces = railSpacesExpanded ? ownedSpaces : ownedSpaces.slice(0, 3);
  $('railSpacesList').innerHTML = visibleOwnedSpaces.length
    ? visibleOwnedSpaces.map(([slug, area]) => '<a href="' + areaUrl(slug) + '">' + spaceVisual(area, 'rail-space-image', 'i') + '<span>a/' + escapeHtml(slug) + '</span></a>').join('')
    : '<span class="spaces-loading">' + (currentUser ? tr('Your created spaces will appear here.','ستظهر المساحات التي أنشأتها هنا.') : tr('Sign in to see your spaces.','سجّل الدخول لعرض مساحاتك.')) + '</span>';
  $('railSpacesExpand').hidden = ownedSpaces.length <= 3;
  $('railSpacesExpand').setAttribute('aria-expanded', String(railSpacesExpanded));
  $('railSpacesExpand').textContent = railSpacesExpanded
    ? tr('Show fewer','عرض أقل')
    : tr('Show ','عرض ') + (ownedSpaces.length - 3).toLocaleString(isArabic() ? 'ar-IQ' : undefined) + tr(' more',' إضافية');
  const popularSpaces = [...spaces].sort((a,b) => {
    const aStats = popularSpaceStats.get(a[0]) || {postCount:0,lastActivity:0};
    const bStats = popularSpaceStats.get(b[0]) || {postCount:0,lastActivity:0};
    return bStats.postCount - aStats.postCount || bStats.lastActivity - aStats.lastActivity || spaceTimestamp(b[1].createdAt) - spaceTimestamp(a[1].createdAt);
  }).slice(0, 3);
  $('sideSpacesList').innerHTML = popularSpaces.length
    ? popularSpaces.map(([slug, area]) => '<a href="' + areaUrl(slug) + '">' + spaceVisual(area, 'space-avatar') + '<span><strong>a/' + escapeHtml(slug) + '</strong><small>' + escapeHtml(area.description || area.name) + '</small></span><b>›</b></a>').join('')
    : '<span class="spaces-loading">' + tr('Community spaces will appear here.','ستظهر مساحات المجتمع هنا.') + '</span>';
  const postingSpaces = spaces.filter(([slug]) => canPostToSpace(slug));
  $('communityHandles').innerHTML = '<option value="main">' + tr('Main thread','المسار الرئيسي') + '</option>' + postingSpaces.map(([slug, area]) => '<option value="a/' + escapeHtml(slug) + '">' + escapeHtml(area.name || slug) + '</option>').join('');
  $('mobileSpacesLink').href = '/community.html?view=spaces';
}

function spaceTimestamp(value) {
  return value?.seconds || (value?.toMillis ? Math.floor(value.toMillis() / 1000) : 0);
}

function renderSpaceDirectory() {
  const queryText = $('spaceDirectorySearch').value.trim().toLowerCase();
  const items = spaceDirectoryItems
    .filter(item => !queryText || [item.slug,item.name,item.description,item.creatorUsername].join(' ').toLowerCase().includes(queryText))
    .filter(item => spaceDirectoryFilter === 'all' || (spaceDirectoryFilter === 'private' ? item.isPrivate : !item.isPrivate))
    .sort((a,b) => spaceDirectorySort === 'new'
      ? b.createdAt - a.createdAt
      : b.postCount - a.postCount || b.lastActivity - a.lastActivity);
  const pageCount = Math.max(1, Math.ceil(items.length / SPACE_DIRECTORY_PAGE_SIZE));
  spaceDirectoryPage = Math.min(spaceDirectoryPage, pageCount);
  const firstItem = (spaceDirectoryPage - 1) * SPACE_DIRECTORY_PAGE_SIZE;
  const visibleItems = items.slice(firstItem, firstItem + SPACE_DIRECTORY_PAGE_SIZE);
  document.querySelectorAll('[data-space-sort]').forEach(button => button.classList.toggle('active', button.dataset.spaceSort === spaceDirectorySort));
  document.querySelectorAll('[data-space-filter]').forEach(button => button.classList.toggle('active', button.dataset.spaceFilter === spaceDirectoryFilter));
  document.querySelectorAll('[data-space-view]').forEach(button => {
    const active = button.dataset.spaceView === spaceDirectoryView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('spaceDirectoryGrid').classList.toggle('is-list', spaceDirectoryView === 'list');
  $('spaceDirectoryCount').textContent = isArabic()
    ? items.length.toLocaleString('ar-IQ') + ' ' + (items.length === 1 ? 'مساحة' : 'مساحات')
    : items.length.toLocaleString() + (items.length === 1 ? ' space' : ' spaces');
  if (!items.length) {
    $('spaceDirectoryGrid').innerHTML = '<div class="space-directory-empty"><span>A</span><h2>' + tr('No spaces found','لم يتم العثور على مساحات') + '</h2><p>' + tr('Try another search or create a new member space.','جرّب بحثاً آخر أو أنشئ مساحة جديدة للأعضاء.') + '</p><a href="/community.html?view=space">' + tr('Create a space','إنشاء مساحة') + ' <b aria-hidden="true">+</b></a></div>';
    $('spaceDirectoryPagination').hidden = true;
    return;
  }
  $('spaceDirectoryGrid').innerHTML = visibleItems.map((item,index) => {
    const newSpace = item.createdAt && Date.now() / 1000 - item.createdAt < 60 * 60 * 24 * 30;
    const badge = spaceDirectorySort === 'new' && newSpace ? tr('New','جديدة') : item.postCount > 0 ? tr('Active','نشطة') : tr('Open','مفتوحة');
    const accessStatus = item.isPrivate ? tr('Private','خاصة') : item.isViewOnly ? tr('View only','للعرض فقط') : tr('Public','عامة');
    const feedStatus = item.isPrivate || item.showInMainThread === false ? tr('Space only','المساحة فقط') : tr('Main thread','المسار الرئيسي');
    const banner = item.bannerURL || item.bannerBase64 || '';
    return '<a class="space-directory-card" href="' + areaUrl(item.slug) + '" style="--space-index:' + index + ';' + (banner ? '--space-banner:url(&quot;' + escapeHtml(banner) + '&quot;)' : '') + '"><div class="space-directory-card-head">' + spaceVisual(item, 'space-directory-symbol') + '<span class="space-directory-badge">' + badge + '</span></div><span class="mini-kicker">a/' + escapeHtml(item.slug) + '</span><h2>' + escapeHtml(item.name) + '</h2><p>' + escapeHtml(item.description || tr('A member space for community conversation.','مساحة للأعضاء وحوارات المجتمع.')) + '</p><div class="space-card-statuses"><span class="' + (item.isPrivate ? 'private' : 'public') + '">' + accessStatus + '</span><span class="' + (item.isPrivate || item.showInMainThread === false ? 'space-only' : 'main-thread') + '">' + feedStatus + '</span></div><footer><span>' + (isArabic() ? item.postCount.toLocaleString('ar-IQ') : item.postCount.toLocaleString()) + ' ' + tr(item.postCount === 1 ? 'post' : 'posts','منشور') + '</span><b aria-hidden="true">' + (isArabic() ? '←' : '→') + '</b></footer></a>';
  }).join('');
  renderSpaceDirectoryPagination(pageCount);
}

function renderSpaceDirectoryPagination(pageCount) {
  const pagination = $('spaceDirectoryPagination');
  pagination.hidden = pageCount <= 1;
  if (pageCount <= 1) return;
  const pages = [...new Set([1, spaceDirectoryPage - 1, spaceDirectoryPage, spaceDirectoryPage + 1, pageCount])]
    .filter(page => page >= 1 && page <= pageCount)
    .sort((a,b) => a - b);
  let previousPage = 0;
  const pageButtons = pages.map(page => {
    const gap = previousPage && page - previousPage > 1 ? '<span aria-hidden="true">…</span>' : '';
    previousPage = page;
    return gap + '<button type="button" data-space-page="' + page + '" class="' + (page === spaceDirectoryPage ? 'active' : '') + '" aria-current="' + (page === spaceDirectoryPage ? 'page' : 'false') + '">' + page.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + '</button>';
  }).join('');
  pagination.innerHTML = '<button type="button" data-space-page="' + (spaceDirectoryPage - 1) + '" ' + (spaceDirectoryPage === 1 ? 'disabled' : '') + ' aria-label="' + tr('Previous page','الصفحة السابقة') + '">' + (isArabic() ? '→' : '←') + '</button>' + pageButtons + '<button type="button" data-space-page="' + (spaceDirectoryPage + 1) + '" ' + (spaceDirectoryPage === pageCount ? 'disabled' : '') + ' aria-label="' + tr('Next page','الصفحة التالية') + '">' + (isArabic() ? '←' : '→') + '</button>';
}

async function loadSpaceDirectory() {
  $('spaceDirectoryGrid').innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    const postsSnapshot = await getReadablePosts();
    const stats = new Map();
    postsSnapshot.docs.forEach(item => {
      const post = item.data();
      if (post.archived === true || post.published === false || !post.communitySlug || post.communitySlug === 'main') return;
      const current = stats.get(post.communitySlug) || {postCount:0,lastActivity:0};
      current.postCount += 1;
      current.lastActivity = Math.max(current.lastActivity, spaceTimestamp(post.createdAt));
      stats.set(post.communitySlug, current);
    });
    popularSpaceStats = stats;
    spaceDirectoryItems = Object.entries(communityAreas)
      .filter(([slug]) => slug !== 'aias-assistant' && slug !== 'aias_assistant')
      .map(([slug,area]) => ({
      slug,
      name:area.name || slug,
      description:area.description || '',
      symbol:area.symbol || initials(area.name || slug),
      imageBase64:area.imageBase64 || '',
      bannerBase64:area.bannerBase64 || '',
      imageURL:area.imageURL || '',
      bannerURL:area.bannerURL || '',
      creatorUsername:area.creatorUsername || '',
      isPrivate:Boolean(area.isPrivate),
      isViewOnly:Boolean(area.isViewOnly),
      showInMainThread:area.showInMainThread !== false,
      createdAt:spaceTimestamp(area.createdAt),
      postCount:stats.get(slug)?.postCount || 0,
      lastActivity:stats.get(slug)?.lastActivity || 0
    }));
    renderCommunitySpaces();
    renderSpaceDirectory();
  } catch (error) {
    console.error(error);
    $('spaceDirectoryGrid').innerHTML = '<p class="notice error">' + tr('Spaces are unavailable right now.','المساحات غير متاحة حالياً.') + '</p>';
  }
}

function renderSelectedShell() {
  const searchText = $('selectedShellSearch').value.trim().toLowerCase();
  const projects = selectedShellProjects.filter(project => !searchText || [project.title,project.summary,project.authorName,project.authorUsername].join(' ').toLowerCase().includes(searchText));
  $('selectedShellCount').textContent = isArabic()
    ? projects.length.toLocaleString('ar-IQ') + ' ' + (projects.length === 1 ? 'مشروع مختار' : 'مشاريع مختارة')
    : projects.length + (projects.length === 1 ? ' selected project' : ' selected projects');
  if (!projects.length) {
    $('selectedShellGrid').innerHTML = '<div class="selected-shell-empty"><span>A</span><h2>' + tr('No selected projects found','لم يتم العثور على مشاريع مختارة') + '</h2><p>' + tr('Try another search or share a project with the community.','جرّب بحثاً آخر أو شارك مشروعاً مع المجتمع.') + '</p></div>';
    return;
  }
  $('selectedShellGrid').innerHTML = projects.map((project,index) => '<article class="selected-shell-card" style="--selected-index:' + index + '"><a class="selected-shell-preview" href="project.html?communityPost=' + encodeURIComponent(project.id) + '"><iframe title="' + tr('Preview of ','معاينة ') + escapeHtml(project.title) + '" src="' + escapeHtml(project.behanceSrc) + '" loading="lazy"></iframe><span>' + String(index + 1).padStart(2,'0') + '</span></a><div class="selected-shell-content"><div class="selected-shell-meta"><span>' + tr('Selected project','مشروع مختار') + '</span><span>·</span><a href="' + profileUrl(project.userId, project.authorUsername) + '">@' + escapeHtml(project.authorUsername || project.authorName || tr('member','عضو')) + '</a></div><h2>' + escapeHtml(project.title) + '</h2><p>' + escapeHtml(project.summary) + '</p><a class="selected-shell-open" href="project.html?communityPost=' + encodeURIComponent(project.id) + '">' + tr('Open full project →','فتح المشروع كاملاً ←') + '</a></div></article>').join('');
}

async function loadSelectedShell() {
  $('selectedShellGrid').innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    selectedShellProjects = (await getReadablePosts()).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(project => project.archived !== true && project.type === 'behance' && project.featured === true && project.published !== false)
      .sort((a,b) => (b.featuredAt?.seconds || b.createdAt?.seconds || 0) - (a.featuredAt?.seconds || a.createdAt?.seconds || 0));
    renderSelectedShell();
  } catch (error) {
    console.error(error);
    $('selectedShellGrid').innerHTML = '<p class="notice error">' + tr('Selected projects are unavailable right now.','المشاريع المختارة غير متاحة حالياً.') + '</p>';
  }
}

function renderSpaceSuggestions(value = '') {
  const target = $('spaceSuggestions');
  const term = normalizeCommunityHandle(value);
  const matches = Object.entries(communityAreas)
    .filter(([slug]) => canPostToSpace(slug))
    .filter(([slug, area]) => !term || slug.includes(term) || String(area.name || '').toLowerCase().includes(term))
    .sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))
    .slice(0, 6);
  const options = [['main', {name:tr('Main thread','المسار الرئيسي')}], ...matches];
  target.innerHTML = options.map(([slug, area]) => '<button type="button" data-space-choice="' + escapeHtml(slug) + '" title="' + escapeHtml(area.name || slug) + '">' + (slug === 'main' ? tr('Main thread','المسار الرئيسي') : 'a/' + escapeHtml(slug)) + '</button>').join('');
  target.hidden = false;
}

async function loadCommunitySpaces() {
  try {
    const snapshot = await getReadableSpaces();
    communityAreas = Object.fromEntries(snapshot.docs
      .map(item => [item.id, {slug:item.id, ...item.data()}])
      .filter(([, area]) => area.archived !== true && area.active !== false && area.slug !== 'aias-assistant' && area.slug !== 'aias_assistant'));
    try {
      const postsSnapshot = await getFeedPosts(null);
      popularSpaceStats = new Map();
      postsSnapshot.docs.forEach(item => {
        const post = item.data();
        if (post.archived === true || post.published === false || !post.communitySlug || post.communitySlug === 'main') return;
        const current = popularSpaceStats.get(post.communitySlug) || {postCount:0,lastActivity:0};
        current.postCount += 1;
        current.lastActivity = Math.max(current.lastActivity, spaceTimestamp(post.createdAt));
        popularSpaceStats.set(post.communitySlug, current);
      });
    } catch (error) { console.warn('[Community] Space popularity could not be loaded.', error); }
  } catch (error) {
    console.error('[Community] Could not load spaces.', error);
    communityAreas = {};
  }
  renderCommunitySpaces();
  return communityAreas;
}

async function loadManagedSpaceSlugs() {
  managedSpaceSlugs = new Set();
  if (!currentUser) return;
  Object.entries(communityAreas).forEach(([slug, area]) => { if (area.creatorId === currentUser.uid) managedSpaceSlugs.add(slug); });
  try {
    const result = await callFunction('setCommunitySpaceConnection', {operation:'get_managed_spaces'});
    (result?.spaceIds || []).filter(slug => communityAreas[slug]).forEach(slug => managedSpaceSlugs.add(slug));
  } catch (error) {
    console.warn('[Community] Appointed space-admin status is temporarily unavailable.', error);
  }
}

const canManageSpace = slug => Boolean(currentUser && slug && slug !== 'main' && managedSpaceSlugs.has(slug));
const canAccessSpaceChat = area => Boolean(currentUser && area?.chatEnabled === true && !blockedSpaceSlugs.has(area.slug) && (area.creatorId === currentUser.uid || managedSpaceSlugs.has(area.slug) || (connectedSpaceSlugs.has(area.slug) && chatApprovedSpaceSlugs.has(area.slug))));

function validateCommunityHandle(showMessage) {
  const raw = $('postCommunity').value;
  const slug = normalizeCommunityHandle(raw);
  const valid = canPostToSpace(slug);
  $('postCommunity').setCustomValidity(valid ? '' : tr('Connect to this space or choose a space you own.','اتصل بهذه المساحة أو اختر مساحة تملكها.'));
  if (showMessage) {
    const status = $('postCommunityStatus');
    status.className = valid ? 'valid' : 'invalid';
    status.textContent = valid
      ? (slug === 'main' ? tr('Posting to the main thread.','سيُنشر في المسار الرئيسي.') : tr('Posting to a/','سيُنشر في a/') + slug + ((communityAreas[slug]?.showInMainThread !== false) ? tr(' and the main thread.',' وفي المسار الرئيسي.') : tr(' only.',' فقط.')))
      : tr('No community space exists with that handle.','لا توجد مساحة مجتمعية بهذا المعرّف.');
  }
  if (showMessage && !valid) $('postCommunityStatus').textContent = tr('You can only post in spaces you own or are connected to.','يمكنك النشر فقط في المساحات التي تملكها أو تتصل بها.');
  return valid ? slug : null;
}

async function validateCommunityHandleLive(showMessage) {
  return validateCommunityHandle(showMessage);
}

async function checkSpaceHandleAvailability(input, status) {
  const sequence = ++spaceAvailabilitySequence;
  const handle = normalizeCommunityHandle(input.value);
  if (input.value !== handle) input.value = handle;
  if (handle === 'main') {
    input.setCustomValidity(tr('The main handle is reserved.','المعرّف main محجوز.'));
    status.className = 'username-check invalid';
    status.textContent = tr('a/main is reserved for the main community thread.','المعرّف a/main محجوز للمسار الرئيسي.');
    return false;
  }
  if (!/^[a-z0-9-]{3,32}$/.test(handle)) {
    input.setCustomValidity(tr('Use 3–32 lowercase letters, numbers, or hyphens.','استخدم من 3 إلى 32 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة.'));
    status.className = 'username-check invalid';
    status.textContent = tr('Use 3–32 lowercase letters, numbers, or hyphens.','استخدم من 3 إلى 32 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة.');
    return false;
  }
  status.className = 'username-check';
  status.textContent = tr('Checking a/','جارٍ التحقق من a/') + handle + '…';
  try {
    const result = await callFunction('setCommunitySpaceConnection', {operation:'check_space_handle', spaceId:handle});
    if (sequence !== spaceAvailabilitySequence || normalizeCommunityHandle(input.value) !== handle) return false;
    const available = result?.available === true;
    input.setCustomValidity(available ? '' : tr('That space handle is already taken.','معرّف المساحة هذا مستخدم بالفعل.'));
    status.className = 'username-check ' + (available ? 'valid' : 'invalid');
    status.textContent = available ? 'a/' + handle + tr(' is available.',' متاح.') : 'a/' + handle + tr(' is already taken.',' مستخدم بالفعل.');
    return available;
  } catch {
    if (sequence !== spaceAvailabilitySequence) return false;
    input.setCustomValidity(tr('Space availability could not be checked.','تعذر التحقق من توفر المساحة.'));
    status.className = 'username-check invalid';
    status.textContent = tr('Could not check this handle. Try again.','تعذر التحقق من هذا المعرّف. حاول مجدداً.');
    return false;
  }
}

async function createCommunitySpace(name, requestedHandle, description, imageBase64 = '', bannerBase64 = '', isPrivate = false, isViewOnly = false, showInMainThread = true) {
  if (currentProfile?.mainThreadPostingAccess === false) {
    isPrivate = true;
    isViewOnly = false;
    showInMainThread = false;
  }
  if (isPrivate) isViewOnly = false;
  const handle = normalizeCommunityHandle(requestedHandle);
  if (!/^[a-z0-9-]{3,32}$/.test(handle) || handle === 'main') throw new Error(tr('Choose a valid, non-reserved space handle.','اختر معرّف مساحة صالحاً وغير محجوز.'));
  const spaceRef = doc(db, 'communitySpaces', handle);
  const created = await callFunction('setCommunitySpaceConnection', {
    operation:'create_space', spaceId:handle, name, description,
    isPrivate:Boolean(isPrivate), isViewOnly:Boolean(isViewOnly), showInMainThread:Boolean(showInMainThread)
  });
  const record = {
    name,
    description,
    symbol: initials(name),
    active: true,
    archived: false,
    moderationStatus: 'clear',
    creatorId: currentUser.uid,
    creatorUsername: currentProfile.username,
    imageBase64:'',
    bannerBase64:'',
    imageURL:'',
    bannerURL:'',
    isPrivate:created.isPrivate === true,
    isViewOnly:created.isViewOnly === true,
    showInMainThread:created.showInMainThread === true,
    createdAt: serverTimestamp()
  };
  const [imageURL, bannerURL] = await Promise.all([
    imageBase64 ? storeCommunityImage(`community/spaces/${handle}/avatar`, imageBase64) : '',
    bannerBase64 ? storeCommunityImage(`community/spaces/${handle}/banner`, bannerBase64) : ''
  ]);
  Object.assign(record, {imageURL, bannerURL});
  if (imageURL || bannerURL) await setDoc(spaceRef, {imageURL, bannerURL}, {merge:true});
  invalidateCommunitySearchIndex();
  communityAreas[handle] = {...record, slug:handle};
  renderCommunitySpaces();
  return handle;
}

let currentManageTab = 'profile';
let manageProfileTabsInitialized = false;

function initManageProfileTabs() {
  if (manageProfileTabsInitialized) return;
  manageProfileTabsInitialized = true;
  document.querySelectorAll('.manage-tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.manageTab;
      switchManageTab(tab, true);
    });
  });

  const tabsContainer = document.querySelector('.manage-profile-tabs');
  if (tabsContainer) {
    // Wheel scroll horizontally on desktop
    tabsContainer.addEventListener('wheel', event => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        tabsContainer.scrollLeft += (isArabic() ? -event.deltaY : event.deltaY);
      }
    }, { passive: false });

    // Drag-to-scroll with mouse on PC
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    tabsContainer.addEventListener('mousedown', e => {
      isDown = true;
      hasMoved = false;
      startX = e.pageX - tabsContainer.offsetLeft;
      scrollLeft = tabsContainer.scrollLeft;
      tabsContainer.classList.add('is-dragging');
    });
    window.addEventListener('mouseleave', () => {
      isDown = false;
      tabsContainer.classList.remove('is-dragging');
    });
    window.addEventListener('mouseup', () => {
      isDown = false;
      tabsContainer.classList.remove('is-dragging');
    });
    tabsContainer.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - tabsContainer.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 3) hasMoved = true;
      tabsContainer.scrollLeft = scrollLeft - (isArabic() ? -walk : walk);
    });
    tabsContainer.addEventListener('click', e => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
      }
    }, true);
  }
}

function switchManageTab(tab, updateRoute = true) {
  currentManageTab = tab;
  document.querySelectorAll('.manage-tab-btn').forEach(btn => {
    const active = btn.dataset.manageTab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    if (active) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  });
  document.querySelectorAll('.manage-tab-panel').forEach(panel => {
    panel.hidden = panel.id !== 'manageTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  });
  if (updateRoute) {
    const params = new URLSearchParams(location.search);
    params.set('view', 'manage-profile');
    params.set('tab', tab);
    history.replaceState({}, '', '/community.html?' + params.toString());
  }
  loadManageTabContent(tab);
}

async function loadManageProfile(defaultTab = 'profile') {
  initManageProfileTabs();
  if (!currentUser) {
    $('manageProfileContainer').innerHTML = '';
    $('manageProfileGate').innerHTML = '<p class="notice">' + tr('Sign in to manage your profile and account.','سجّل الدخول لإدارة ملفك الشخصي وحسابك.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    switchManageTab(defaultTab, false);
    return;
  }
  $('manageProfileGate').innerHTML = '';
  switchManageTab(defaultTab, false);
  updateManageHubBadges();
}

async function updateManageHubBadges() {
  if (!currentUser) return;
  const connBadge = $('manageConnectionsCountBadge');
  if (connBadge) connBadge.textContent = (connectedUserIds.size + connectedSpaceSlugs.size).toLocaleString(isArabic() ? 'ar-IQ' : undefined);
  const spaceBadge = $('manageSpacesCountBadge');
  if (spaceBadge) spaceBadge.textContent = managedSpaceSlugs.size.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
}

async function loadManageTabContent(tab) {
  if (!currentUser) return;
  if (tab === 'profile') {
    await renderManageProfileSettings();
  } else if (tab === 'notifications') {
    await renderManageNotificationsSettings();
  } else if (tab === 'connections') {
    await loadConnectionManager();
  } else if (tab === 'spaces') {
    await loadManageSpaces();
  } else if (tab === 'archive') {
    await loadArchivedPosts('all');
  } else if (tab === 'portfolio') {
    const link = $('managePortfolioPublicLink');
    if (link) link.href = 'portfolio-builder.html';
  }
}

async function renderManageProfileSettings() {
  const container = $('manageProfileContainer');
  if (!container) return;
  container.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  const profile = currentProfile || (await getProfile(currentUser.uid));
  const displayName = profile.displayName || currentUser.displayName || '';
  const photo = profile.photoBase64 || profile.photoURL || currentUser.photoURL || '';
  const banner = profile.bannerURL || profile.bannerBase64 || '';

  container.innerHTML = [
    '<div class="profile-hero" style="box-shadow:none; padding:0; background:transparent; border:none; margin:0;">',
      '<form id="manageProfileForm" class="profile-form" style="display:grid; gap:16px;">',
        '<div class="profile-media-grid">',
          '<section class="profile-media-field"><span>' + tr('Profile image','صورة الملف الشخصي') + '</span><div id="managePhotoPreview" class="profile-media-preview avatar">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="">' : tr('No image','لا توجد صورة')) + '</div><input id="managePhotoFile" type="file" accept="image/*"><div class="profile-media-actions"><small id="managePhotoStatus">' + tr('Square image recommended','يُفضّل استخدام صورة مربعة') + '</small><button id="manageRemovePhoto" class="profile-media-remove" type="button">' + tr('Remove','إزالة') + '</button></div></section>',
          '<section class="profile-media-field"><span>' + tr('Profile banner','غلاف الملف الشخصي') + '</span><div id="manageBannerPreview" class="profile-media-preview banner">' + (banner ? '<img src="' + escapeHtml(banner) + '" alt="">' : tr('No banner','لا يوجد غلاف')) + '</div><input id="manageBannerFile" type="file" accept="image/*"><div class="profile-media-actions"><small id="manageBannerStatus">' + tr('Wide image recommended','يُفضّل استخدام صورة عريضة') + '</small><button id="manageRemoveBanner" class="profile-media-remove" type="button">' + tr('Remove','إزالة') + '</button></div></section>',
        '</div>',
        '<div class="form-grid">',
          '<div class="form-group"><label for="manageProfileName">' + tr('Name','الاسم') + '</label><input id="manageProfileName" required value="' + escapeHtml(displayName) + '"></div>',
          '<div class="form-group"><label for="manageProfileUsername">' + tr('Unique username','اسم مستخدم فريد') + '</label><input id="manageProfileUsername" required minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}" value="' + escapeHtml(profile.username || '') + '" ' + (profile.username ? 'readonly' : '') + ' placeholder="your_handle"><small id="manageUsernameStatus" class="username-check ' + (profile.username ? 'valid' : '') + '">' + (profile.username ? tr('Your permanent profile address is ','عنوان ملفك الدائم هو ') + 'p/' + escapeHtml(profile.username) : tr('Availability will be checked as you type.','سيتم التحقق من التوفر أثناء الكتابة.')) + '</small></div>',
        '</div>',
        '<div class="form-group"><label for="manageProfileSchool">' + tr('School / organization','الجامعة / المؤسسة') + '</label><input id="manageProfileSchool" required value="' + escapeHtml(profile.school || '') + '"></div>',
        '<div class="form-grid">',
          '<div class="form-group"><label for="manageProfileCity">' + tr('City','المدينة') + '</label><input id="manageProfileCity" required value="' + escapeHtml(profile.city || '') + '"></div>',
          '<div class="form-group"><label for="manageProfileInterests">' + tr('Interests','الاهتمامات') + '</label><input id="manageProfileInterests" value="' + escapeHtml(profile.interests || '') + '" placeholder="' + tr('Urbanism, interiors, sketching','العمران، التصميم الداخلي، الرسم') + '"></div>',
        '</div>',
        '<div class="form-group"><label for="manageProfileBio">' + tr('Bio','نبذة') + '</label><textarea id="manageProfileBio" required>' + escapeHtml(profile.bio || '') + '</textarea></div>',
        '<div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">',
          '<button class="primary-button" type="submit"><span>' + tr('Save changes','حفظ التغييرات') + '</span><b aria-hidden="true">→</b></button>',
        '</div>',
      '</form>',
    '</div>'
  ].join('');

  let nextPhotoBase64 = photo;
  let nextBannerBase64 = banner;
  let profileMediaBusy = 0;

  $('managePhotoFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    profileMediaBusy++;
    $('managePhotoStatus').textContent = tr('Preparing image…','جارٍ تجهيز الصورة…');
    try {
      nextPhotoBase64 = await convertFileToWebP(file, 640, 640, 0.84);
      updateSpaceMediaPreview('managePhotoPreview', nextPhotoBase64, tr('No image','لا توجد صورة'));
      $('managePhotoStatus').textContent = tr('Image ready','الصورة جاهزة');
    } catch (e) {
      console.error(e);
      showToast(tr('Image could not be processed.','تعذر تجهيز الصورة.'));
    } finally {
      profileMediaBusy--;
    }
  });

  $('manageRemovePhoto')?.addEventListener('click', () => {
    nextPhotoBase64 = '';
    updateSpaceMediaPreview('managePhotoPreview', '', tr('No image','لا توجد صورة'));
    if ($('managePhotoFile')) $('managePhotoFile').value = '';
    $('managePhotoStatus').textContent = tr('Image removed','تمت إزالة الصورة');
  });

  $('manageBannerFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    profileMediaBusy++;
    $('manageBannerStatus').textContent = tr('Preparing banner…','جارٍ تجهيز الغلاف…');
    try {
      nextBannerBase64 = await convertFileToWebP(file, 1600, 600, 0.86);
      updateSpaceMediaPreview('manageBannerPreview', nextBannerBase64, tr('No banner','لا يوجد غلاف'));
      $('manageBannerStatus').textContent = tr('Banner ready','الغلاف جاهز');
    } catch (e) {
      console.error(e);
      showToast(tr('Banner could not be processed.','تعذر تجهيز الغلاف.'));
    } finally {
      profileMediaBusy--;
    }
  });

  $('manageRemoveBanner')?.addEventListener('click', () => {
    nextBannerBase64 = '';
    updateSpaceMediaPreview('manageBannerPreview', '', tr('No banner','لا يوجد غلاف'));
    if ($('manageBannerFile')) $('manageBannerFile').value = '';
    $('manageBannerStatus').textContent = tr('Banner removed','تمت إزالة الغلاف');
  });

  if (!profile.username) {
    $('manageProfileUsername')?.addEventListener('input', () => {
      checkUsernameAvailability($('manageProfileUsername'), $('manageUsernameStatus'), currentUser.uid);
    });
  }

  $('manageProfileForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (profileMediaBusy > 0) throw new Error(tr('Wait for images to finish preparing.','انتظر حتى يكتمل تجهيز الصور.'));
      const uid = currentUser.uid;
      let username = profile.username;
      if (!username) {
        const available = await checkUsernameAvailability($('manageProfileUsername'), $('manageUsernameStatus'), uid);
        if (!available) throw new Error(tr('Choose an available username.','اختر اسم مستخدم متاحاً.'));
        username = normalizeUsername($('manageProfileUsername').value);
      }
      const [photoURL, bannerURL] = await Promise.all([
        nextPhotoBase64 && nextPhotoBase64.startsWith('data:') ? storeCommunityImage(`community/profiles/${uid}/avatar`, nextPhotoBase64) : Promise.resolve(nextPhotoBase64),
        nextBannerBase64 && nextBannerBase64.startsWith('data:') ? storeCommunityImage(`community/profiles/${uid}/banner`, nextBannerBase64) : Promise.resolve(nextBannerBase64)
      ]);
      await callFunction('setCommunitySpaceConnection', {
        operation: 'complete_profile',
        username,
        displayName: $('manageProfileName').value.trim(),
        school: $('manageProfileSchool').value.trim(),
        city: $('manageProfileCity').value.trim(),
        interests: $('manageProfileInterests').value.trim(),
        bio: $('manageProfileBio').value.trim(),
        photoBase64: '',
        bannerBase64: '',
        photoURL,
        bannerURL
      });
      invalidateCommunitySearchIndex();
      profileCache.delete(uid);
      currentProfile = await getProfile(uid);
      showToast(tr('Profile settings saved.','تم حفظ إعدادات الملف الشخصي.'));
      await renderManageProfileSettings();
    } catch (error) {
      console.error(error);
      showToast(error.message || tr('Could not save profile settings.','تعذر حفظ الإعدادات.'));
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderManageNotificationsSettings() {
  const gate = $('manageNotificationsGate');
  const container = $('manageNotificationsContainer');
  if (!container) return;
  if (gate) gate.innerHTML = '';
  container.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';

  const profile = currentProfile || (await getProfile(currentUser.uid));
  if (profile.notificationPreferences) {
    currentNotificationPreferences = {
      ...currentNotificationPreferences,
      ...profile.notificationPreferences
    };
  }
  if (Array.isArray(profile.mutedSpaceChats)) {
    currentMutedSpaceChats = new Set(profile.mutedSpaceChats);
  }

  const prefs = currentNotificationPreferences;
  const isMasterChatOff = prefs.chatMessages === false;

  container.innerHTML = [
    '<div class="notifications-management-card">',
      '<div class="pref-head">',
        '<div>',
          '<h2>' + tr('Notification Preferences', 'تفضيلات الإشعارات') + '</h2>',
          '<p>' + tr('Choose which activities trigger alerts in your inbox and browser.', 'اختر النشاطات التي ترسل لك تنبيهات في صندوق الإشعارات والمتصفح.') + '</p>',
        '</div>',
      '</div>',

      // Group 1: Space Chats & Messages
      '<div class="notification-pref-group master-chat-group">',
        '<div class="notification-pref-group-title">',
          '<span class="group-icon" aria-hidden="true">💬</span>',
          '<div>',
            '<h3>' + tr('Space Chats & Messages', 'رسائل ومحادثات المساحات') + '</h3>',
          '</div>',
          '<span class="badge">' + tr('Chat', 'المحادثات') + '</span>',
        '</div>',
        '<div class="notification-pref-list">',
          '<label class="notification-pref-row" for="pref-chatMessages">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Space chat messages (Master)', 'رسائل محادثات المساحات (عام)') + '</strong>',
              '<small>' + tr('Master switch: when disabled, you will not receive any notifications for space messages across all spaces.', 'مفتاح رئيسي: عند التعطيل لن تتلقى أي إشعارات لرسائل المساحات عبر جميع المساحات.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-chatMessages" type="checkbox" data-pref-key="chatMessages"' + (prefs.chatMessages !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row' + (isMasterChatOff ? ' is-disabled' : '') + '" for="pref-chatMentions">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Mentions in chats', 'الإشارات في المحادثات') + '</strong>',
              '<small>' + tr('Alert when someone mentions you with @username in a space chat.', 'تنبيه عندما يشير إليك شخص باستخدام @username في محادثة المساحة.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-chatMentions" type="checkbox" data-pref-key="chatMentions"' + (prefs.chatMentions !== false ? ' checked' : '') + (isMasterChatOff ? ' disabled' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row' + (isMasterChatOff ? ' is-disabled' : '') + '" for="pref-chatReplies">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Replies to your messages', 'الردود على رسائلك') + '</strong>',
              '<small>' + tr('Alert when someone replies directly to your message in a chat.', 'تنبيه عندما يرد شخص على رسالتك مباشرة في المحادثة.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-chatReplies" type="checkbox" data-pref-key="chatReplies"' + (prefs.chatReplies !== false ? ' checked' : '') + (isMasterChatOff ? ' disabled' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
        '</div>',
      '</div>',

      // Group 2: Posts & Discussions
      '<div class="notification-pref-group">',
        '<div class="notification-pref-group-title">',
          '<span class="group-icon" aria-hidden="true">📝</span>',
          '<div>',
            '<h3>' + tr('Posts & Discussions', 'المنشورات والنقاشات') + '</h3>',
          '</div>',
          '<span class="badge">' + tr('Posts', 'المنشورات') + '</span>',
        '</div>',
        '<div class="notification-pref-list">',
          '<label class="notification-pref-row" for="pref-postComments">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Comments on your posts', 'التعليقات على منشوراتك') + '</strong>',
              '<small>' + tr('Alert when a member comments on your post.', 'تنبيه عندما يترك عضو تعليقاً على منشورك.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-postComments" type="checkbox" data-pref-key="postComments"' + (prefs.postComments !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row" for="pref-commentReplies">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Replies to your comments', 'الردود على تعليقاتك') + '</strong>',
              '<small>' + tr('Alert when someone replies to your comment.', 'تنبيه عندما يرد شخص على تعليقك.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-commentReplies" type="checkbox" data-pref-key="commentReplies"' + (prefs.commentReplies !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row" for="pref-postMentions">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Mentions in posts & comments', 'الإشارات في المنشورات والتعليقات') + '</strong>',
              '<small>' + tr('Alert when you are tagged with @username.', 'تنبيه عندما تتم الإشارة إليك باستخدام @username.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-postMentions" type="checkbox" data-pref-key="postMentions"' + (prefs.postMentions !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row" for="pref-postApplauses">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Applauses & reactions', 'التفاعلات والإعجابات') + '</strong>',
              '<small>' + tr('Alert when someone reacts to or applauds your post.', 'تنبيه عندما يتفاعل شخص مع منشورك أو يعجب به.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-postApplauses" type="checkbox" data-pref-key="postApplauses"' + (prefs.postApplauses !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
        '</div>',
      '</div>',

      // Group 3: Connections & Spaces
      '<div class="notification-pref-group">',
        '<div class="notification-pref-group-title">',
          '<span class="group-icon" aria-hidden="true">👥</span>',
          '<div>',
            '<h3>' + tr('Connections & Spaces', 'التواصل والمساحات') + '</h3>',
          '</div>',
          '<span class="badge">' + tr('Community', 'المجتمع') + '</span>',
        '</div>',
        '<div class="notification-pref-list">',
          '<label class="notification-pref-row" for="pref-connections">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('New connections', 'تواصلات جديدة') + '</strong>',
              '<small>' + tr('Alert when a member connects with you.', 'تنبيه عندما يتصل عضو بملفك الشخصي.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-connections" type="checkbox" data-pref-key="connections"' + (prefs.connections !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
          '<label class="notification-pref-row" for="pref-spaceRequests">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Space requests & approvals', 'طلبات وموافقات المساحات') + '</strong>',
              '<small>' + tr('Alert when someone requests space membership or chat access in spaces you manage.', 'تنبيه عند تلقي طلب انضمام لمساحة أو إذن دردشة في مساحاتك.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-spaceRequests" type="checkbox" data-pref-key="spaceRequests"' + (prefs.spaceRequests !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
        '</div>',
      '</div>',

      // Group 4: Browser Push Notifications
      '<div class="notification-pref-group">',
        '<div class="notification-pref-group-title">',
          '<span class="group-icon" aria-hidden="true">🔔</span>',
          '<div>',
            '<h3>' + tr('Browser Push Notifications', 'إشعارات المتصفح الفورية') + '</h3>',
          '</div>',
          '<span class="badge">' + tr('Push', 'فورية') + '</span>',
        '</div>',
        '<div class="notification-pref-list">',
          '<label class="notification-pref-row" for="pref-pushEnabled">',
            '<div class="notification-pref-copy">',
              '<strong>' + tr('Enable browser push notifications', 'تفعيل الإشعارات الفورية للمتصفح') + '</strong>',
              '<small>' + tr('Receive real-time push alerts on your device even when the website is closed.', 'استقبال تنبيهات فورية على جهازك حتى عند إغلاق الموقع.') + '</small>',
            '</div>',
            '<span class="toggle-control"><input id="pref-pushEnabled" type="checkbox" data-pref-key="pushEnabled"' + (prefs.pushEnabled !== false ? ' checked' : '') + '><i aria-hidden="true"></i></span>',
          '</label>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  container.querySelectorAll('input[data-pref-key]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.prefKey;
      currentNotificationPreferences[key] = input.checked;

      if (key === 'chatMessages') {
        const isOff = !input.checked;
        const mentionsInput = $('pref-chatMentions');
        const repliesInput = $('pref-chatReplies');
        if (mentionsInput) {
          mentionsInput.disabled = isOff;
          mentionsInput.closest('.notification-pref-row')?.classList.toggle('is-disabled', isOff);
        }
        if (repliesInput) {
          repliesInput.disabled = isOff;
          repliesInput.closest('.notification-pref-row')?.classList.toggle('is-disabled', isOff);
        }
      }

      if (key === 'pushEnabled' && input.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        try {
          await enableBrowserNotifications();
        } catch (e) {
          console.warn(e);
        }
      }

      try {
        await callFunction('setCommunityNotificationPreferences', { preferences: currentNotificationPreferences });
        if (currentProfile) currentProfile.notificationPreferences = { ...currentNotificationPreferences };
        showToast(tr('Notification preferences saved.', 'تم حفظ تفضيلات الإشعارات.'));
      } catch (error) {
        console.error(error);
        showToast(error.message || tr('Could not save preferences.', 'تعذر حفظ التفضيلات.'));
      }
    });
  });
}

let archivedPostsCache = [];
let archivedSubPostsByParent = new Map();
let currentArchiveFilter = 'all';
let archiveFiltersInitialized = false;

async function loadArchivedPosts(activeFilter = 'all') {
  currentArchiveFilter = activeFilter;
  const list = $('archivedPostsList');
  if (!list) return;

  if (!archiveFiltersInitialized) {
    archiveFiltersInitialized = true;
    document.querySelectorAll('[data-archive-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.archiveFilter;
        document.querySelectorAll('[data-archive-filter]').forEach(b => b.classList.toggle('active', b.dataset.archiveFilter === filter));
        renderArchivedPosts(filter);
      });
    });
  }

  list.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    let snapshot;
    try {
      snapshot = await getDocs(query(collection(db, 'communityPosts'), where('userId', '==', currentUser.uid), where('archived', '==', true), orderBy('archivedAt', 'desc')));
    } catch (e) {
      snapshot = await getDocs(query(collection(db, 'communityPosts'), where('userId', '==', currentUser.uid), where('archived', '==', true)));
    }
    const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allDocs.sort((a, b) => (b.archivedAt?.seconds || 0) - (a.archivedAt?.seconds || 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    archivedSubPostsByParent = new Map();
    const mainPosts = [];
    const orphanSubPosts = [];

    allDocs.forEach(post => {
      if (post.parentPostId) {
        if (!archivedSubPostsByParent.has(post.parentPostId)) {
          archivedSubPostsByParent.set(post.parentPostId, []);
        }
        archivedSubPostsByParent.get(post.parentPostId).push(post);
      } else {
        mainPosts.push(post);
      }
    });

    // Sort sub-posts inside each parent by threadOrder / createdAt
    archivedSubPostsByParent.forEach(subList => {
      subList.sort((a, b) => (a.threadOrder ?? 0) - (b.threadOrder ?? 0) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    });

    // Check for orphan sub-posts whose parent isn't in mainPosts
    const mainPostIds = new Set(mainPosts.map(p => p.id));
    archivedSubPostsByParent.forEach((subList, parentId) => {
      if (!mainPostIds.has(parentId)) {
        orphanSubPosts.push(...subList);
      }
    });

    archivedPostsCache = [...mainPosts, ...orphanSubPosts];

    // Update counts
    const selfCount = archivedPostsCache.filter(p => p.archiveCause === 'user_archived' || !p.archiveCause).length;
    const spaceCount = archivedPostsCache.filter(p => p.archiveCause === 'space_cascade').length;
    const modCount = archivedPostsCache.filter(p => p.archiveCause === 'moderation' || p.moderationStatus === 'flagged').length;
    const totalCount = archivedPostsCache.length;

    if ($('archiveAllCount')) $('archiveAllCount').textContent = totalCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
    if ($('archiveSelfCount')) $('archiveSelfCount').textContent = selfCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
    if ($('archiveSpaceCount')) $('archiveSpaceCount').textContent = spaceCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
    if ($('archiveModCount')) $('archiveModCount').textContent = modCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
    if ($('manageArchiveCountBadge')) $('manageArchiveCountBadge').textContent = totalCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined);

    renderArchivedPosts(activeFilter);
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="notice error">' + tr('Could not load archived posts. Please try again.','تعذر تحميل المنشورات المؤرشفة. حاول مرة أخرى.') + '</p>';
  }
}

function renderArchivedPosts(filter = 'all') {
  const list = $('archivedPostsList');
  if (!list) return;
  const filtered = archivedPostsCache.filter(post => {
    if (filter === 'self') return post.archiveCause === 'user_archived' || !post.archiveCause;
    if (filter === 'space') return post.archiveCause === 'space_cascade';
    if (filter === 'moderation') return post.archiveCause === 'moderation' || post.moderationStatus === 'flagged';
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><span class="empty-mark">📦</span><h3>' + tr('No archived posts','لا توجد منشورات مؤرشفة') + '</h3><p>' + tr('When you archive posts, they will be kept here privately and can be restored whenever you like.','عند أرشفة منشوراتك، ستُحفظ هنا بخصوصية ويمكنك استعادتها وقتما تشاء.') + '</p></div>';
    return;
  }

  list.innerHTML = filtered.map(post => {
    const isSelf = post.archiveCause === 'user_archived' || !post.archiveCause;
    const isSpaceCascade = post.archiveCause === 'space_cascade';
    const isMod = post.archiveCause === 'moderation' || post.moderationStatus === 'flagged';
    const isOrphan = Boolean(post.parentPostId);

    const tagMarkup = isSelf
      ? '<span class="archive-tag self">📦 ' + tr('Archived by you','مؤرشف بواسطتك') + '</span>'
      : isSpaceCascade
        ? '<span class="archive-tag space">🪐 ' + tr('Unavailable space','مساحة غير متاحة') + ' (a/' + escapeHtml(post.communitySlug) + ')</span>'
        : '<span class="archive-tag moderation">⚠️ ' + tr('Moderation restricted','مقيّد بالإشراف') + '</span>';

    const reasonText = post.archiveReason || (isSelf ? tr('Archived by author','مؤرشف من قبلك') : isSpaceCascade ? tr('Original space is unavailable.','المساحة الأصلية غير متاحة.') : tr('Restricted by moderation.','مقيّد من قِبل المشرفين.'));
    const timeFormatted = formatDate(post.archivedAt || post.createdAt);

    // Sub-posts list under this main post
    const subPosts = archivedSubPostsByParent.get(post.id) || [];
    const subPostsMarkup = subPosts.length ? [
      '<div class="archive-subposts-section">',
        '<div class="archive-subposts-header">',
          '<span>🧵 ' + tr('Thread sub-posts','سلسلة المنشورات الفرعية') + ' (' + subPosts.length.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + ')</span>',
        '</div>',
        '<div class="archive-subposts-list">',
          subPosts.map((sub, idx) => {
            const subTime = formatDate(sub.archivedAt || sub.createdAt);
            const subContent = sub.content || sub.summary || '';
            const subTitle = sub.title && sub.title !== post.title ? sub.title : '';
            return [
              '<div class="archive-subpost-card" data-archive-subpost="' + escapeHtml(sub.id) + '">',
                '<div class="archive-subpost-head">',
                  '<span class="archive-subpost-number">#' + (idx + 1) + '</span>',
                  '<time class="archive-subpost-time">' + subTime + '</time>',
                '</div>',
                subTitle ? '<h4 class="archive-subpost-title">' + escapeHtml(subTitle) + '</h4>' : '',
                subContent ? '<p class="archive-subpost-content">' + escapeHtml(subContent) + '</p>' : '',
                '<div class="archive-subpost-actions">',
                  '<button class="archive-subpost-btn-delete" type="button" data-delete-archive="' + escapeHtml(sub.id) + '">' + tr('Delete sub-post','حذف المنشور الفرعي') + '</button>',
                '</div>',
              '</div>'
            ].join('');
          }).join(''),
        '</div>',
      '</div>'
    ].join('') : '';

    return [
      '<article class="archive-card' + (isOrphan ? ' is-orphan-subpost' : '') + '" data-archive-card="' + escapeHtml(post.id) + '">',
        '<div class="archive-card-head">',
          '<div>',
            tagMarkup,
            (isOrphan ? '<span class="archive-tag self" style="margin-inline-start:6px;">🧵 ' + tr('Standalone sub-post','منشور فرعي مستقل') + '</span>' : ''),
            '<h3 class="archive-card-title" style="margin-top:8px;">' + escapeHtml(post.title || tr('Untitled post','منشور بدون عنوان')) + '</h3>',
            '<p class="archive-card-meta">' + timeFormatted + '</p>',
          '</div>',
        '</div>',
        (post.summary || post.content ? '<p class="archive-card-summary">' + escapeHtml(post.summary || post.content) + '</p>' : ''),
        subPostsMarkup,
        '<div class="manage-portfolio-notice" style="padding:10px 14px; margin:0; font-size:.78rem;">',
          '<span>ℹ️</span><strong>' + tr('Reason:','السبب:') + '</strong> ' + escapeHtml(reasonText),
        '</div>',
        '<div class="archive-card-actions">',
          '<button class="archive-btn-delete" type="button" data-delete-archive="' + escapeHtml(post.id) + '">' + tr('Delete permanently','حذف نهائي') + '</button>',
          isSelf
            ? '<button class="archive-btn-restore" type="button" data-restore-archive="' + escapeHtml(post.id) + '">' + tr('Restore to feed','استعادة للنشر') + '</button>'
            : isSpaceCascade
              ? '<button class="archive-btn-restore" type="button" data-repost-archive="' + escapeHtml(post.id) + '" ' + (post.repostedPostId ? 'disabled' : '') + '>' + (post.repostedPostId ? tr('Already reposted','تمت إعادة النشر') : tr('Repost to main thread','إعادة نشر في المسار الرئيسي')) + '</button>'
              : '',
        '</div>',
      '</article>'
    ].join('');
  }).join('');

  // Bind restore, repost, delete actions
  list.querySelectorAll('[data-restore-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.restoreArchive;
      if (!confirm(tr('Restore this post to the community feed?','هل تريد استعادة هذا المنشور إلى خلاصة المجتمع؟'))) return;
      btn.disabled = true;
      try {
        await callFunction('restoreOwnCommunityPost', {postId});
        showToast(tr('Post restored to feed.','تمت استعادة المنشور إلى الخلاصة.'));
        await loadArchivedPosts(currentArchiveFilter);
      } catch (error) {
        console.error(error);
        showToast(error.message || tr('Could not restore post.','تعذر استعادة المنشور.'));
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-repost-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.repostArchive;
      if (!confirm(tr('Create a new copy of this post in the main thread?','هل تريد إنشاء نسخة جديدة من هذا المنشور في المسار الرئيسي؟'))) return;
      btn.disabled = true;
      try {
        await callFunction('repostUnavailableSpacePost', {postId});
        showToast(tr('Post reposted to main thread.','تمت إعادة نشر المنشور في المسار الرئيسي.'));
        await loadArchivedPosts(currentArchiveFilter);
      } catch (error) {
        console.error(error);
        showToast(error.message || tr('Could not repost.','تعذر إعادة النشر.'));
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-delete-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.deleteArchive;
      if (!confirm(tr('Delete this archived post permanently? This cannot be undone.','هل تريد حذف هذا المنشور المؤرشف نهائياً؟ لا يمكن التراجع عن هذا الإجراء.'))) return;
      btn.disabled = true;
      try {
        await callFunction('deleteOwnCommunityPost', {postId});
        showToast(tr('Post deleted permanently.','تم حذف المنشور نهائياً.'));
        await loadArchivedPosts(currentArchiveFilter);
      } catch (error) {
        console.error(error);
        showToast(error.message || tr('Could not delete post.','تعذر حذف المنشور.'));
        btn.disabled = false;
      }
    });
  });
}

async function loadManageSpaces() {
  if (!currentUser) {
    $('manageSpacesList').innerHTML = '';
    $('manageSpacesGate').innerHTML = '<p class="notice">' + tr('Sign in to manage your spaces.','سجّل الدخول لإدارة مساحاتك.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    return;
  }
  $('manageSpacesGate').innerHTML = '';
  const spaces = Object.entries(communityAreas).filter(([slug]) => managedSpaceSlugs.has(slug));
  if (!spaces.length) {
    $('manageSpacesList').innerHTML = '<div class="connections-empty"><span>#</span><h2>' + tr('No spaces yet','لا توجد مساحات بعد') + '</h2><p>' + tr('Create a space to control its membership and visibility.','أنشئ مساحة للتحكم بعضويتها وظهور منشوراتها.') + '</p><a href="/community.html?view=space">' + tr('Create a space','إنشاء مساحة') + ' →</a></div>';
    return;
  }
  if (!managedSpacesAccordionReady) {
    expandedManagedSpaceSlugs.add(spaces[0][0]);
    managedSpacesAccordionReady = true;
  }
  $('manageSpacesList').innerHTML = '<div class="manage-spaces-grid">' + (await Promise.all(spaces.map(async ([slug, area]) => {
    let requests = [];
    let members = [];
    let adminIds = new Set();
    let chatAccessRequests = [];
    let blockedUsers = [];
    let chatBannedIds = new Set();
    try {
      const owner = area.creatorId === currentUser.uid;
      const [requestSnapshot, memberSnapshot, adminSnapshot, chatAccessSnapshot, blockedSnapshot, chatBanSnapshot] = await Promise.all([
        canManageSpace(slug) ? getDocs(query(collection(db, 'communitySpaces', slug, 'connectionRequests'), where('status', '==', 'pending'))) : Promise.resolve(null),
        getDocs(collection(db, 'communitySpaces', slug, 'connections')),
        getDocs(collection(db, 'communitySpaces', slug, 'admins')),
        getDocs(query(collection(db, 'communitySpaces', slug, 'chatAccessRequests'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'communitySpaces', slug, 'blocks')),
        getDocs(collection(db, 'communitySpaces', slug, 'chatBans'))
      ]);
      requests = requestSnapshot ? requestSnapshot.docs.map(item => ({id:item.id, ...item.data()})) : [];
      members = memberSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
      adminIds = new Set(adminSnapshot.docs.map(item => item.id));
      chatAccessRequests = chatAccessSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
      blockedUsers = blockedSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
      chatBannedIds = new Set(chatBanSnapshot.docs.map(item => item.id));
    } catch (error) { console.warn('[Community] Space membership unavailable.', error); }
    const requestRows = requests.length ? '<div class="space-request-list">' + (await Promise.all(requests.map(async request => { const profile = await getProfile(request.userId); return '<div><span>' + escapeHtml(profile.displayName || profile.username || tr('Member','عضو')) + '</span><button type="button" data-approve-request="' + escapeHtml(slug) + '|' + escapeHtml(request.userId) + '">' + tr('Approve','موافقة') + '</button><button type="button" data-deny-request="' + escapeHtml(slug) + '|' + escapeHtml(request.userId) + '">' + tr('Deny','رفض') + '</button></div>'; }))).join('') + '</div>' : '<p class="space-request-empty">' + tr('No pending requests.','لا توجد طلبات معلقة.') + '</p>';
    const visibilityProfiles = area.creatorId === currentUser.uid
      ? await Promise.all([getProfile(area.creatorId), ...members.map(member => getProfile(member.userId))])
      : [];
    const restrictedVisibilityCount = visibilityProfiles.filter(profile => profile.mainThreadPostingAccess !== true).length;
    const publicBlocked = area.isPrivate === true && restrictedVisibilityCount > 0;
    const visibilityWarning = publicBlocked
      ? '<p class="notice warning">' + tr('This space must remain private because ' + restrictedVisibilityCount + ' owner/member account(s) do not have main-thread posting access. Remove those members or wait for access approval before making it public.','يجب أن تبقى هذه المساحة خاصة لأن ' + restrictedVisibilityCount + ' من حسابات المالك/الأعضاء لا تملك تصريح النشر في المسار الرئيسي. أزل هؤلاء الأعضاء أو انتظر الموافقة على التصريح قبل جعلها عامة.') + '</p>'
      : '';
    const settingToggles = '<div class="manage-space-toggles">'
      + '<label class="space-setting-toggle compact' + (publicBlocked ? ' is-disabled' : '') + '"><span class="space-setting-icon" aria-hidden="true">◐</span><span class="space-setting-copy"><strong>' + tr('Private space','مساحة خاصة') + '</strong><small>' + tr('Require approval to connect','تتطلب الموافقة للاتصال') + '</small></span><span class="toggle-control"><input type="checkbox" data-manage-space-setting="' + escapeHtml(slug) + '|isPrivate"' + (area.isPrivate ? ' checked' : '') + (publicBlocked ? ' disabled' : '') + '><i aria-hidden="true"></i></span></label>'
      + '<label class="space-setting-toggle compact"><span class="space-setting-icon" aria-hidden="true">◎</span><span class="space-setting-copy"><strong>' + tr('View only','للعرض فقط') + '</strong><small>' + tr('Public reading; approval required to post or use Messages','قراءة عامة؛ والموافقة مطلوبة للنشر أو استخدام الرسائل') + '</small></span><span class="toggle-control"><input type="checkbox" data-manage-space-setting="' + escapeHtml(slug) + '|isViewOnly"' + (area.isViewOnly ? ' checked' : '') + '><i aria-hidden="true"></i></span></label>'
      + '<label class="space-setting-toggle compact' + (area.isPrivate ? ' is-disabled' : '') + '"><span class="space-setting-icon" aria-hidden="true">⌁</span><span class="space-setting-copy"><strong>' + tr('Main-thread posts','منشورات المسار الرئيسي') + '</strong><small>' + tr('Show posts outside this space','إظهار المنشورات خارج المساحة') + '</small></span><span class="toggle-control"><input type="checkbox" data-manage-space-setting="' + escapeHtml(slug) + '|showInMainThread"' + (area.showInMainThread !== false && !area.isPrivate ? ' checked' : '') + (area.isPrivate ? ' disabled' : '') + '><i aria-hidden="true"></i></span></label></div>';
    const managementSettings = canManageSpace(slug) ? visibilityWarning + settingToggles + (area.creatorId === currentUser.uid ? '<button type="button" data-manage-edit="' + escapeHtml(slug) + '">' + tr('Edit name, description & media','تعديل الاسم والوصف والوسائط') + '</button>' : '') : '';
    const requestSection = canManageSpace(slug) ? '<div class="member-management-group"><strong>' + tr('Membership requests','طلبات العضوية') + ' <span>(' + requests.length + ')</span></strong>' + requestRows + '</div>' : '';
    const unifiedMemberRows = members.length ? '<div class="space-member-tools"><label><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" data-space-member-search="' + escapeHtml(slug) + '" placeholder="' + escapeHtml(tr('Search members','ابحث عن الأعضاء')) + '" aria-label="' + escapeHtml(tr('Search space members','البحث في أعضاء المساحة')) + '"></label><small data-space-member-count="' + escapeHtml(slug) + '">' + members.length + ' ' + tr('members','أعضاء') + '</small></div><div class="space-member-list" id="spaceMemberList-' + escapeHtml(slug) + '">' + (await Promise.all(members.map(async member => {
      const profile = await getProfile(member.userId);
      const name = profile.displayName || profile.username || tr('Member','عضو');
      const searchText = [name, profile.username || '', profile.school || '', profile.city || ''].join(' ').toLowerCase();
      const isAdmin = adminIds.has(member.userId);
      const accessRequest = chatAccessRequests.find(item => item.userId === member.userId);
      const chatApproved = member.chatAccessApproved !== false;
      const chatBanned = chatBannedIds.has(member.userId);
      const labels = [isAdmin ? tr('Admin','مشرف') : '', area.chatEnabled === true ? (chatApproved ? tr('Messages enabled','الرسائل مفعّلة') : accessRequest ? tr('Messages pending','الرسائل معلّقة') : tr('Messages off','الرسائل غير مفعّلة')) : ''].filter(Boolean);
      if (chatBanned && area.chatEnabled === true) labels[labels.length - 1] = tr('Messages banned','الرسائل محظورة');
      const adminAction = area.creatorId === currentUser.uid ? '<button type="button" data-set-space-admin="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '|' + (isAdmin ? '0' : '1') + '">' + (isAdmin ? tr('Remove admin','إزالة المشرف') : tr('Make admin','تعيين مشرف')) + '</button>' : '';
      const chatActions = area.chatEnabled !== true ? '' : (chatBanned
        ? '<button type="button" data-review-chat-access="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '|1|0">' + tr('Restore Messages','استعادة الرسائل') + '</button>'
        : (!chatApproved
          ? '<button type="button" data-review-chat-access="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '|1|0">' + tr('Grant Messages','منح الرسائل') + '</button>' + (accessRequest ? '<button type="button" data-review-chat-access="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '|0|0">' + tr('Deny request','رفض الطلب') + '</button>' : '')
          : '<button type="button" data-review-chat-access="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '|0|1">' + tr('Ban from Messages','حظر من الرسائل') + '</button>'));
      return '<article data-space-member="' + escapeHtml(searchText) + '"><a href="' + escapeHtml(profileUrl(member.userId, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'space-member-avatar', profile.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(profile.username ? '@' + profile.username : tr('Space member','عضو في المساحة')) + '</small>' + (labels.length ? '<em class="space-member-status">' + escapeHtml(labels.join(' · ')) + '</em>' : '') + '</span></a><details class="space-member-menu"><summary aria-label="' + escapeHtml(tr('Member actions','إجراءات العضو')) + '" title="' + escapeHtml(tr('Member actions','إجراءات العضو')) + '">⋮</summary><div>' + adminAction + chatActions + '<button type="button" data-warn-space-member="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '">' + tr('Warn','تحذير') + '</button><button type="button" class="danger" data-block-space-user="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '">' + tr('Block from space','حظر من المساحة') + '</button><button type="button" class="danger" data-remove-space-member="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '">' + tr('Remove member','إزالة العضو') + '</button></div></details></article>';
    }))).join('') + '</div>' : '<p class="space-request-empty">' + tr('No connected members yet.','لا يوجد أعضاء متصلون بعد.') + '</p>';
    const blockedRows = blockedUsers.length ? '<div class="space-member-list">' + (await Promise.all(blockedUsers.map(async blocked => { const profile = await getProfile(blocked.userId || blocked.id); const name = profile.displayName || profile.username || tr('Member','عضو'); return '<article><a href="' + escapeHtml(profileUrl(blocked.userId || blocked.id, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'space-member-avatar', profile.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(blocked.reason || tr('Blocked from this space','محظور من هذه المساحة')) + '</small></span></a><button type="button" data-unblock-space-user="' + escapeHtml(slug) + '|' + escapeHtml(blocked.userId || blocked.id) + '">' + tr('Unblock','إلغاء الحظر') + '</button></article>'; }))).join('') + '</div>' : '<p class="space-request-empty">' + tr('No blocked users.','لا يوجد مستخدمون محظورون.') + '</p>';
    const memberManagement = '<section class="member-management-section"><header><div><span class="member-management-icon" aria-hidden="true">◎</span><strong>' + tr('Space access','الوصول إلى المساحة') + '</strong></div><small>' + members.length.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + ' ' + tr('members','أعضاء') + ' · ' + blockedUsers.length.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + ' ' + tr('blocked','محظورون') + '</small></header><div class="member-management-tabs"><button class="active" type="button" data-member-tab="' + escapeHtml(slug) + '|members">' + tr('Manage members','إدارة الأعضاء') + '</button><button type="button" data-member-tab="' + escapeHtml(slug) + '|blocked">' + tr('Blocked users','المستخدمون المحظورون') + ' (' + blockedUsers.length + ')</button></div><div class="member-management-groups"><div data-member-panel="' + escapeHtml(slug) + '|members">' + requestSection + '<div class="member-management-group"><strong>' + tr('All space members','كل أعضاء المساحة') + ' <span>(' + members.length + ')</span></strong><p class="member-management-help">' + tr('Use the three-dot menu to manage permissions or block a member from the entire space.','استخدم قائمة النقاط الثلاث لإدارة الصلاحيات أو حظر العضو من المساحة بالكامل.') + '</p>' + unifiedMemberRows + '</div></div><div data-member-panel="' + escapeHtml(slug) + '|blocked" hidden><div class="member-management-group"><strong>' + tr('Blocked users','المستخدمون المحظورون') + '</strong><p class="member-management-help">' + tr('Blocked users cannot view this space or any of its posts, even by direct link.','لا يستطيع المستخدمون المحظورون عرض هذه المساحة أو أي من منشوراتها حتى عبر رابط مباشر.') + '</p>' + blockedRows + '</div></div></div></section>';
    const openState = expandedManagedSpaceSlugs.has(slug) ? ' open' : '';
    const accessLabel = area.isPrivate ? tr('Private','خاصة') : area.isViewOnly ? tr('View only','للعرض فقط') : tr('Public','عامة');
    return '<details class="manage-space-card" data-managed-space="' + escapeHtml(slug) + '"' + openState + '><summary class="manage-space-summary"><span class="manage-space-summary-visual">' + spaceVisual(area, 'manage-space-avatar') + '</span><span class="manage-space-summary-copy"><span class="mini-kicker">a/' + escapeHtml(slug) + '</span><strong>' + escapeHtml(area.name || slug) + '</strong><small>' + escapeHtml(area.description || tr('A community space.','مساحة مجتمعية.')) + '</small></span><span class="manage-space-summary-stats"><span>' + accessLabel + '</span><span>' + members.length.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + ' ' + tr('members','أعضاء') + '</span>' + (requests.length ? '<span class="has-requests">' + requests.length.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + ' ' + tr('pending','معلّقة') + '</span>' : '') + '</span><span class="manage-space-chevron" aria-hidden="true"></span></summary><div class="manage-space-body">' + managementSettings + memberManagement + '</div></details>';
  }))).join('') + '</div>';
  $('manageSpacesList').querySelectorAll('[data-managed-space]').forEach(card => card.addEventListener('toggle', () => {
    if (card.open) expandedManagedSpaceSlugs.add(card.dataset.managedSpace);
    else expandedManagedSpaceSlugs.delete(card.dataset.managedSpace);
  }));
}

async function reviewSpaceRequest(slug, userId, approved) {
  const area = communityAreas[slug];
  if (!area || !canManageSpace(slug)) return;
  await callFunction('setCommunitySpaceConnection', {operation:'review_space_connection', spaceId:slug, userId, approved});
  await loadManageSpaces();
  showToast(approved ? tr('Request approved.','تمت الموافقة على الطلب.') : tr('Request denied.','تم رفض الطلب.'));
}

async function removeSpaceMember(slug, userId) {
  const area = communityAreas[slug];
  if (!area || !canManageSpace(slug) || !userId) return;
  const postsSnapshot = await getDocs(query(collection(db, 'communityPosts'), where('userId', '==', userId), where('archived', '==', false)));
  const spacePosts = postsSnapshot.docs.filter(item => item.data().communitySlug === slug);
  const warning = tr(
    'Remove this member from a/' + slug + '? They will lose access immediately and all ' + spacePosts.length.toLocaleString() + ' of their posts in this space will be permanently deleted.',
    'إزالة هذا العضو من a/' + slug + '؟ سيفقد الوصول فوراً وسيتم حذف جميع منشوراته في هذه المساحة نهائياً (' + spacePosts.length.toLocaleString('ar-IQ') + ').'
  );
  if (!confirm(warning)) return;
  await callFunction('removeCommunitySpaceMember', {spaceId:slug, userId});
  await loadManageSpaces();
  showToast(tr('Member access removed.','تمت إزالة وصول العضو.'));
}

async function setSpaceAdmin(slug, userId, enabled) {
  await callFunction('setCommunitySpaceAdmin', {spaceId:slug, userId, enabled});
  await loadManageSpaces();
  showToast(enabled ? tr('Space admin added.','تم تعيين مشرف للمساحة.') : tr('Space admin removed.','تمت إزالة مشرف المساحة.'));
}

async function warnSpaceMember(slug, userId) {
  const reason = prompt(tr('Warning reason (required):','سبب التحذير (مطلوب):'))?.trim();
  if (!reason) return;
  await callFunction('warnCommunitySpaceMember', {spaceId:slug, userId, reason});
  showToast(tr('Warning sent to the member.','تم إرسال التحذير إلى العضو.'));
}

async function blockSpaceUser(slug, userId) {
  const reason = prompt(tr('Reason for blocking this user from the entire space:','سبب حظر هذا المستخدم من المساحة بالكامل:'))?.trim();
  if (!reason || reason.length < 3) return;
  if (!confirm(tr('Block this user from the space? They will lose membership and will not be able to view the space or any of its posts, even through a direct link.','حظر هذا المستخدم من المساحة؟ سيفقد العضوية ولن يتمكن من عرض المساحة أو أي من منشوراتها حتى عبر رابط مباشر.'))) return;
  await callFunction('setCommunitySpaceConnection', {operation:'block_space_user', spaceId:slug, userId, reason});
  await loadManageSpaces();
  showToast(tr('User blocked from the space.','تم حظر المستخدم من المساحة.'));
}

async function unblockSpaceUser(slug, userId) {
  await callFunction('setCommunitySpaceConnection', {operation:'unblock_space_user', spaceId:slug, userId});
  await loadManageSpaces();
  showToast(tr('User unblocked. They may request access again.','تم إلغاء الحظر. يمكن للمستخدم طلب الوصول مجدداً.'));
}

async function moderateSpacePost(post, action) {
  const reason = prompt(tr(action === 'delete' ? 'Deletion reason (required):' : 'Warning reason (required):', action === 'delete' ? 'سبب الحذف (مطلوب):' : 'سبب التحذير (مطلوب):'))?.trim();
  if (!reason) return;
  if (action === 'delete' && !confirm(tr('Permanently delete this post?','حذف هذا المنشور نهائياً؟'))) return;
  await callFunction('moderateCommunitySpacePost', {postId:post.id, action, reason});
  showToast(action === 'delete' ? tr('Post deleted.','تم حذف المنشور.') : tr('Post warning sent.','تم إرسال تحذير المنشور.'));
  if (action === 'delete') await loadPosts();
}

async function updateManagedSpaceSetting(slug, setting, enabled) {
  const area = communityAreas[slug];
  if (!area || !canManageSpace(slug) || !['isPrivate', 'isViewOnly', 'showInMainThread'].includes(setting)) return;
  const nextPrivate = setting === 'isPrivate' ? enabled : area.isPrivate === true;
  const nextViewOnly = nextPrivate ? false : (setting === 'isViewOnly' ? enabled : area.isViewOnly === true);
  const normalizedPrivate = nextViewOnly ? false : nextPrivate;
  const nextMainThread = normalizedPrivate ? false : (setting === 'showInMainThread' ? enabled : area.showInMainThread !== false);
  const confirmation = setting === 'isPrivate'
    ? (enabled ? tr('Make this space private? Only approved members will retain access to its posts.', 'جعل هذه المساحة خاصة؟ سيحتفظ الأعضاء الموافق عليهم فقط بالوصول إلى منشوراتها.') : tr('Make this space public? Its posts may become visible outside the space.', 'جعل هذه المساحة عامة؟ قد تصبح منشوراتها مرئية خارج المساحة.'))
    : setting === 'isViewOnly'
      ? (enabled ? tr('Enable view-only mode? New members will require approval before posting or using Messages.', 'تفعيل وضع العرض فقط؟ سيحتاج الأعضاء الجدد إلى موافقة قبل النشر أو استخدام الرسائل.') : tr('Disable view-only mode?', 'إلغاء وضع العرض فقط؟'))
      : (enabled ? tr('Show this space’s posts in the main thread?', 'إظهار منشورات هذه المساحة في المسار الرئيسي؟') : tr('Hide this space’s posts from the main thread?', 'إخفاء منشورات هذه المساحة من المسار الرئيسي؟'));
  if (!confirm(confirmation)) { await loadManageSpaces(); return; }
  await callFunction('setCommunitySpaceVisibility', {spaceId:slug, isPrivate:normalizedPrivate, isViewOnly:nextViewOnly, showInMainThread:nextMainThread});
  const changes = {isPrivate:normalizedPrivate, isViewOnly:nextViewOnly, showInMainThread:nextMainThread};
  communityAreas[slug] = {...area, ...changes};
  renderCommunitySpaces();
  await loadManageSpaces();
  showToast(tr('Space settings saved.','تم حفظ إعدادات المساحة.'));
}

function updateSpaceMediaPreview(targetId, value, emptyCopy) {
  $(targetId).innerHTML = value ? '<img src="' + escapeHtml(value) + '" alt="">' : '<span>' + emptyCopy + '</span>';
}

function bindSpaceMediaInput(inputId, statusId, previewId, kind, setValue, updateBusy) {
  $(inputId).addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateBusy(1);
    $(statusId).textContent = tr('Preparing image…','جارٍ تجهيز الصورة…');
    try {
      const value = await prepareProfileImage(file, kind);
      setValue(value);
      updateSpaceMediaPreview(previewId, value, '');
      $(statusId).textContent = tr('Ready to save','جاهزة للحفظ');
    } catch (error) {
      console.error(error);
      event.target.value = '';
      $(statusId).textContent = error.message || tr('Image could not be prepared.','تعذر تجهيز الصورة.');
    } finally {
      updateBusy(-1);
    }
  });
}

function renderActiveAreaHeader(area) {
  const areaImage = area.imageURL || area.imageBase64 || '';
  const areaBanner = area.bannerURL || area.bannerBase64 || '';
  $('areaSymbol').innerHTML = areaImage
    ? '<img src="' + escapeHtml(areaImage) + '" alt="">'
    : escapeHtml(area.symbol || initials(area.name));
  $('areaBanner').innerHTML = areaBanner ? '<img src="' + escapeHtml(areaBanner) + '" alt="">' : '';
  $('areaHeader').classList.toggle('has-banner', Boolean(areaBanner));
  $('areaPath').textContent = 'a/' + activeAreaSlug + (area.isViewOnly ? ' · ' + tr('VIEW ONLY','للعرض فقط') : '');
  $('areaTitle').textContent = area.name;
  $('areaDescription').textContent = area.description;
  const owner = currentUser && area.creatorId === currentUser.uid;
  const manager = canManageSpace(activeAreaSlug);
  $('areaManage').hidden = !manager;
  $('areaConnect').hidden = Boolean(owner);
  activeAreaConnection = connectedSpaceSlugs.has(activeAreaSlug);
  $('areaConnect').classList.toggle('connected', activeAreaConnection);
  $('areaConnect').setAttribute('aria-pressed', String(activeAreaConnection));
  $('areaConnect').querySelector('span').textContent = activeAreaConnection ? tr('Disconnect','إلغاء التواصل') : (area.isPrivate || area.isViewOnly ? tr('Request to connect','طلب اتصال') : tr('Connect','تواصل'));
  $('areaConnect').title = activeAreaConnection ? tr('Leave this space','مغادرة هذه المساحة') : '';
  const canPost = Boolean(owner || activeAreaConnection);
  $('areaMessages').hidden = !(manager || activeAreaConnection);
  const chatAllowed = canAccessSpaceChat(area);
  $('areaMessages').querySelector('span').textContent = area.chatEnabled !== true ? tr('Add Messages','إضافة الرسائل') : chatAllowed ? tr('Messages','الرسائل') : tr('Request Messages','طلب الرسائل');
  watchAreaMessagesAccess(area);
  $('areaCreate').disabled = !canPost;
  $('areaCreate').title = canPost ? '' : tr(area.isViewOnly ? 'Request connection approval before posting. You can still comment and vote.' : 'Connect to this space before posting.', area.isViewOnly ? 'اطلب الموافقة على الاتصال قبل النشر. لا يزال بإمكانك التعليق والتصويت.' : 'اتصل بهذه المساحة قبل النشر.');
  refreshAreaConnectionCount(activeAreaSlug);
}

function watchAreaMessagesAccess(area) {
  unsubscribeAreaAccess?.();
  unsubscribeAreaChatRequest?.();
  unsubscribeAreaAccess = null;
  unsubscribeAreaChatRequest = null;
  if (!currentUser || area.chatEnabled !== true || activeAreaSlug !== area.slug) return;
  let access = {};
  let request = {};
  const paint = () => {
    if (activeAreaSlug !== area.slug) return;
    const button = $('areaMessages');
    const label = button.querySelector('span');
    const banned = access.chatBanned === true;
    const allowed = access.canUseChat === true && access.blocked !== true && !banned;
    const pending = request.status === 'pending';
    button.classList.toggle('is-chat-banned', banned);
    button.classList.toggle('is-chat-pending', pending);
    label.textContent = allowed
      ? tr('Messages','الرسائل')
      : pending
        ? tr('Messages request pending','طلب الرسائل قيد المراجعة')
        : tr('Request Messages','طلب الرسائل');
    button.title = banned
      ? tr('You are banned from this space’s Messages. Open Messages to request access from an administrator.','أنت محظور من رسائل هذه المساحة. افتح الرسائل لطلب الوصول من المشرف.')
      : pending
        ? tr('Your Messages access request is pending.','طلب وصولك إلى الرسائل قيد المراجعة.')
        : '';
  };
  unsubscribeAreaAccess = onSnapshot(doc(db, 'communitySpaces', area.slug, 'access', currentUser.uid), snapshot => {
    access = snapshot.data() || {};
    paint();
  }, error => console.warn('[Community] Space Messages access could not be watched.', error));
  unsubscribeAreaChatRequest = onSnapshot(doc(db, 'communitySpaces', area.slug, 'chatAccessRequests', currentUser.uid), snapshot => {
    request = snapshot.data() || {};
    paint();
  }, error => console.warn('[Community] Space Messages request could not be watched.', error));
}

async function refreshAreaConnectionCount(slug) {
  try {
    const snapshot = await getDocs(collection(db, 'communitySpaces', slug, 'connections'));
    if (activeAreaSlug === slug) $('areaConnectCount').textContent = snapshot.size.toLocaleString(isArabic() ? 'ar-IQ' : undefined);
  } catch { if (activeAreaSlug === slug) $('areaConnectCount').textContent = '0'; }
}

function closeSpaceEditor() {
  activeEditSpaceSlug = null;
  $('spaceEditStatus').textContent = '';
  if ($('spaceEditDialog').open) $('spaceEditDialog').close();
}

function syncSpaceVisibilityToggle() {
  const privateToggle = $('spaceEditIsPrivate');
  const viewOnlyToggle = $('spaceEditIsViewOnly');
  const mainToggle = $('spaceEditShowInMainThread');
  const row = mainToggle.closest('.space-setting-toggle');
  if (privateToggle.checked) viewOnlyToggle.checked = false;
  if (viewOnlyToggle.checked) privateToggle.checked = false;
  const locked = privateToggle.checked;
  if (locked) mainToggle.checked = false;
  mainToggle.disabled = locked;
  row.classList.toggle('is-disabled', locked);
  row.setAttribute('aria-disabled', String(locked));
}

function openSpaceEditor() {
  const area = activeAreaSlug ? communityAreas[activeAreaSlug] : null;
  if (!area || !currentUser || area.creatorId !== currentUser.uid) return;
  activeEditSpaceSlug = activeAreaSlug;
  editSpaceImageBase64 = area.imageURL || area.imageBase64 || '';
  editSpaceBannerBase64 = area.bannerURL || area.bannerBase64 || '';
  editSpaceMediaBusy = 0;
  $('spaceEditHandle').innerHTML = tr('Permanent address: ','العنوان الدائم: ') + '<strong>a/' + escapeHtml(activeEditSpaceSlug) + '</strong>';
  $('spaceEditName').value = area.name || activeEditSpaceSlug;
  $('spaceEditDescription').value = area.description || '';
  $('spaceEditIsPrivate').checked = Boolean(area.isPrivate);
  $('spaceEditIsViewOnly').checked = Boolean(area.isViewOnly);
  $('spaceEditShowInMainThread').checked = area.showInMainThread !== false;
  syncSpaceVisibilityToggle();
  $('spaceEditNameCount').textContent = $('spaceEditName').value.length.toLocaleString() + ' / 80';
  $('spaceEditDescriptionCount').textContent = $('spaceEditDescription').value.length.toLocaleString() + ' / 360';
  $('spaceEditImageFile').value = '';
  $('spaceEditBannerFile').value = '';
  $('spaceEditImageStatus').textContent = tr('Square image recommended','يُفضّل استخدام صورة مربعة');
  $('spaceEditBannerStatus').textContent = tr('Wide image recommended','يُفضّل استخدام صورة عريضة');
  updateSpaceMediaPreview('spaceEditImagePreview', editSpaceImageBase64, tr('No image','لا توجد صورة'));
  updateSpaceMediaPreview('spaceEditBannerPreview', editSpaceBannerBase64, tr('No banner','لا يوجد غلاف'));
  $('spaceEditStatus').textContent = '';
  $('spaceEditDialog').showModal();
  $('spaceEditName').focus();
}

async function deleteOwnedSpace() {
  const slug = activeEditSpaceSlug;
  const area = slug ? communityAreas[slug] : null;
  if (!area || !currentUser || area.creatorId !== currentUser.uid) return;
  if (!confirm(tr('Delete a/' + slug + '? The space page will be removed, but its existing posts will remain in the main community feed.','هل تريد حذف a/' + slug + '؟ ستُحذف صفحة المساحة، لكن منشوراتها الحالية ستبقى في الخلاصة الرئيسية للمجتمع.'))) return;
  const button = $('deleteOwnedSpace');
  button.disabled = true;
  try {
    await callFunction('setCommunitySpaceConnection', {operation:'delete_owned_space', spaceId:slug});
    delete communityAreas[slug];
    spaceDirectoryItems = spaceDirectoryItems.filter(item => item.slug !== slug);
    invalidateCommunitySearchIndex();
    renderCommunitySpaces();
    closeSpaceEditor();
    showToast(tr('Space deleted. Its posts remain in the main feed.','تم حذف المساحة. بقيت منشوراتها في الخلاصة الرئيسية.'));
    navigateTo('/community.html', true);
  } catch (error) {
    console.error(error);
    $('spaceEditStatus').textContent = error.message || tr('This space could not be deleted.','تعذر حذف هذه المساحة.');
  } finally {
    button.disabled = false;
  }
}

async function loadPromptOfTheWeek() {
  try {
    const settingSnapshot = await getDoc(doc(db, 'communitySettings', 'main'));
    const postId = settingSnapshot.exists() ? settingSnapshot.data().promptPostId : null;
    if (!postId) throw new Error(tr('No prompt selected','لم يتم اختيار سؤال'));
    const postSnapshot = await getDoc(doc(db, 'communityPosts', postId));
    if (!postSnapshot.exists() || postSnapshot.data().type !== 'question' || postSnapshot.data().published === false) throw new Error(tr('Selected prompt is unavailable','السؤال المختار غير متاح'));
    const post = postSnapshot.data();
    selectedPromptPostId = postId;
    $('promptTitle').textContent = post.title;
    $('promptAuthor').textContent = tr('Asked by @','سؤال من @') + (post.authorUsername || post.authorName || tr('member','عضو'));
    $('mobilePromptTitle').textContent = post.title;
    $('mobilePromptAuthor').textContent = tr('Asked by @','سؤال من @') + (post.authorUsername || post.authorName || tr('member','عضو'));
    $('promptCard').hidden = false;
    updateMobilePromptVisibility();
  } catch {
    selectedPromptPostId = null;
    $('promptCard').hidden = true;
    $('mobilePromptCard').hidden = true;
  }
}

function updateMobilePromptVisibility() {
  const params = new URLSearchParams(location.search);
  const pathRoute = getPathRoute();
  const mainFeed = !params.get('post') && !params.get('view') && !params.get('area') && !pathRoute.profile && !pathRoute.area;
  $('mobilePromptCard').hidden = !selectedPromptPostId || !mainFeed;
  const appDownloadCard = document.getElementById('aiasMobileAppCard');
  if (appDownloadCard) appDownloadCard.hidden = !mainFeed;
}

function composerUrl() {
  return activeAreaSlug ? areaUrl(activeAreaSlug) + '?view=post' : '/community.html?view=post';
}

function plainPostText(post) {
  if (post.type !== 'article') return post.content || post.summary || '';
  const parsed = new DOMParser().parseFromString(post.content || post.summary || '', 'text/html');
  return parsed.body.textContent || '';
}

function initials(name) {
  return String(name || 'AIAS').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'A';
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return tr('Just now','الآن');
  const date = timestamp.toDate();
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return tr('Just now','الآن');
  if (seconds < 3600) return isArabic() ? 'قبل ' + Math.floor(seconds / 60) + ' د' : Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return isArabic() ? 'قبل ' + Math.floor(seconds / 3600) + ' س' : Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return isArabic() ? 'قبل ' + Math.floor(seconds / 86400) + ' ي' : Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString(isArabic() ? 'ar-IQ' : undefined, {month:'short', day:'numeric', year:date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
}

function invalidateCommunitySearchIndex() {
  communitySearchIndex = null;
  communitySearchIndexLoadedAt = 0;
  invalidateSmartData('posts:', 'spaces:');
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}@/#_-]+/gu, ' ').trim();
}

function oneEditAway(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}

function searchResultScore(result, rawQuery) {
  const normalized = normalizeSearchText(rawQuery);
  const spaceOnly = normalized.startsWith('a/') || normalized.startsWith('#');
  const memberOnly = normalized.startsWith('p/') || normalized.startsWith('@');
  if (spaceOnly && result.kind !== 'space') return -1;
  if (memberOnly && result.kind !== 'member') return -1;
  const query = normalized.replace(/^(?:a\/|p\/|@|#)/, '').trim();
  if (!query) return 1;
  const terms = query.split(/\s+/).filter(Boolean);
  const handle = normalizeSearchText(result.handle);
  const title = normalizeSearchText(result.title);
  const text = normalizeSearchText(result.searchText);
  const words = text.split(/\s+/).filter(Boolean);
  let score = result.kind === 'space' ? 8 : result.kind === 'post' ? 5 : 3;
  if (handle === query) score += 240;
  else if (handle.startsWith(query)) score += 150;
  else if (handle.includes(query)) score += 95;
  if (title === query) score += 180;
  else if (title.startsWith(query)) score += 115;
  else if (title.includes(query)) score += 75;
  if (text.includes(query)) score += 55;
  let misses = 0;
  terms.forEach(term => {
    if (handle === term) score += 70;
    else if (handle.startsWith(term)) score += 48;
    else if (title.split(' ').some(word => word.startsWith(term))) score += 34;
    else if (text.includes(term)) score += 20;
    else if (term.length >= 4 && words.some(word => oneEditAway(term, word))) score += 9;
    else misses += 1;
  });
  if (misses === terms.length) return -1;
  return score - misses * 18;
}

function searchPostUrl(post) {
  return isProject(post)
    ? '/project.html?communityPost=' + encodeURIComponent(post.id)
    : '/community.html?post=' + encodeURIComponent(post.id);
}

async function loadCommunitySearchIndex(force = false) {
  const fresh = communitySearchIndex && Date.now() - communitySearchIndexLoadedAt < 45000;
  if (!force && fresh) return communitySearchIndex;
  if (communitySearchIndexPromise) return communitySearchIndexPromise;
  communitySearchIndexPromise = Promise.all([
    getReadablePosts(),
    getReadableSpaces(),
    getDocs(query(collection(db, 'publicProfiles'), limit(120)))
  ]).then(([postsSnapshot, spacesSnapshot, usersSnapshot]) => {
    const privateSpaceSlugs = new Set(spacesSnapshot.docs
      .filter(item => item.data().isPrivate === true)
      .map(item => item.id));
    const spaces = spacesSnapshot.docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(space => space.archived !== true && space.active !== false && space.id !== 'aias-assistant' && space.id !== 'aias_assistant')
      .map(space => ({
        kind:'space',
        id:space.id,
        title:space.name || 'a/' + space.id,
        handle:space.id,
        subtitle:'a/' + space.id + (space.description ? ' · ' + space.description : ''),
        searchText:[space.id, space.name, space.description, space.creatorUsername].join(' '),
        url:areaUrl(space.id),
        icon:space.symbol || initials(space.name),
        sortTime:space.createdAt?.seconds || 0
      }));
    const posts = postsSnapshot.docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.published !== false && !privateSpaceSlugs.has(post.communitySlug))
      .map(post => ({
        kind:'post',
        id:post.id,
        title:post.title || 'Community post',
        handle:post.authorUsername || '',
        subtitle:postLabel(post) + ' · ' + (post.communitySlug && post.communitySlug !== 'main' ? 'a/' + post.communitySlug : tr('Main thread','المسار الرئيسي')) + ' · @' + (post.authorUsername || post.authorName || tr('member','عضو')),
        searchText:[post.title, plainPostText(post), post.summary, post.authorName, post.authorUsername, post.communitySlug, postLabel(post), post.marketAttachment?.title, post.marketAttachment?.description, post.marketAttachment?.storeName, post.marketAttachment?.tag, post.marketAttachment?.itemType, post.portfolioAttachment?.title, post.portfolioAttachment?.description, post.portfolioAttachment?.professionalTitle, post.portfolioAttachment?.workType].join(' '),
        url:searchPostUrl(post),
        icon:isQuestion(post) ? '?' : isProject(post) ? 'P' : 'T',
        sortTime:post.createdAt?.seconds || 0
      }));
    const members = usersSnapshot.docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(member => member.username)
      .map(member => ({
        kind:'member',
        id:member.id,
        title:member.displayName || '@' + member.username,
        handle:member.username,
        isBusiness:member.isBusiness === true && member.businessStatus === 'active',
        subtitle:'p/' + member.username + (member.school ? ' · ' + member.school : member.city ? ' · ' + member.city : ''),
        searchText:[member.username, member.displayName, member.school, member.city, member.bio, member.interests].join(' '),
        url:profileUrl(member.id, member.username),
        icon:initials(member.displayName || member.username),
        photo:member.photoBase64 || member.photoURL || '',
        sortTime:member.updatedAt?.seconds || 0
      }));
    communitySearchIndex = [...spaces, ...posts, ...members];
    communitySearchIndexLoadedAt = Date.now();
    return communitySearchIndex;
  }).finally(() => { communitySearchIndexPromise = null; });
  return communitySearchIndexPromise;
}

function highlightSearchText(value, rawQuery) {
  const text = String(value || '');
  const normalizedQuery = normalizeSearchText(rawQuery);
  const candidates = [normalizedQuery, normalizedQuery.replace(/^(?:a\/|p\/|@|#)/, '')].filter(Boolean).sort((a,b) => b.length - a.length);
  const lower = text.toLowerCase();
  const match = candidates.map(needle => ({needle, index:lower.indexOf(needle)})).find(item => item.index >= 0);
  if (!match) return escapeHtml(text);
  return escapeHtml(text.slice(0, match.index)) + '<mark>' + escapeHtml(text.slice(match.index, match.index + match.needle.length)) + '</mark>' + escapeHtml(text.slice(match.index + match.needle.length));
}

function openCommunitySearch() {
  if ($('communitySearchResults')) $('communitySearchResults').hidden = false;
  if ($('communitySearch')) $('communitySearch').setAttribute('aria-expanded', 'true');
}

function closeCommunitySearch() {
  if ($('communitySearchResults')) $('communitySearchResults').hidden = true;
  if ($('communitySearch')) {
    $('communitySearch').setAttribute('aria-expanded', 'false');
    $('communitySearch').removeAttribute('aria-activedescendant');
  }
  communitySearchActiveIndex = -1;
}

function renderCommunitySearchState(content) {
  openCommunitySearch();
  $('communitySearchResults').innerHTML = '<div class="search-panel-state">' + content + '</div>';
  communitySearchActiveIndex = -1;
}

function renderCommunitySearchResults(results, query, heading) {
  const target = $('communitySearchResults');
  const groupLabels = {space:tr('Spaces','المساحات'), post:tr('Posts','المنشورات'), member:tr('Members','الأعضاء')};
  const kindLabels = {space:tr('Space','مساحة'), post:tr('Post','منشور'), member:tr('Profile','ملف')};
  const groups = ['space','post','member'].map(kind => ({kind, items:results.filter(item => item.kind === kind).slice(0, 6)})).filter(group => group.items.length);
  if (!groups.length) {
    renderCommunitySearchState('<strong>' + tr('No community results','لا توجد نتائج في المجتمع') + '</strong><p>' + tr('Try a post title, a/space-handle, or @username.','جرّب عنوان منشور أو a/معرّف-مساحة أو @اسم-مستخدم.') + '</p><div class="search-hint-row"><span>a/ ' + tr('spaces','مساحات') + '</span><span>@ ' + tr('members','أعضاء') + '</span><span>' + tr('questions','أسئلة') + '</span></div>');
    return;
  }
  let optionIndex = 0;
  const groupsMarkup = groups.map(group => '<section class="search-group" aria-label="' + groupLabels[group.kind] + '"><div class="search-group-title"><strong>' + groupLabels[group.kind] + '</strong><span>' + group.items.length + '</span></div>' + group.items.map(result => {
    const optionId = 'communitySearchOption' + optionIndex++;
    const icon = result.photo ? '<img src="' + escapeHtml(result.photo) + '" alt="">' : escapeHtml(result.icon);
    const bizBadge = result.isBusiness ? '<span class="community-biz-badge-mini search-biz-badge">✓ ' + escapeHtml(tr('Business','أعمال')) + '</span>' : '';
    return '<a id="' + optionId + '" class="search-result ' + result.kind + '" href="' + escapeHtml(result.url) + '" data-search-result role="option" aria-selected="false"><span class="search-result-icon" aria-hidden="true">' + icon + '</span><span class="search-result-copy"><strong>' + highlightSearchText(result.title, query) + bizBadge + '</strong><small>' + highlightSearchText(result.subtitle, query) + '</small></span><span class="search-result-kind">' + kindLabels[result.kind] + '</span></a>';
  }).join('') + '</section>').join('');
  target.innerHTML = '<div class="search-panel-head"><span>' + escapeHtml(heading) + '</span><span>' + results.length + (isArabic() ? ' نتيجة' : results.length === 1 ? ' match' : ' matches') + '</span></div>' + groupsMarkup;
  openCommunitySearch();
  communitySearchActiveIndex = -1;
}

async function runCommunitySearch(rawQuery) {
  const sequence = ++communitySearchSequence;
  const query = rawQuery.trim();
  renderCommunitySearchState('<span class="search-spinner" aria-hidden="true"></span><p>' + tr('Searching posts, spaces, and members…','جارٍ البحث في المنشورات والمساحات والأعضاء…') + '</p>');
  try {
    const index = await loadCommunitySearchIndex();
    if (sequence !== communitySearchSequence) return;
    if (!query) {
      const spaces = index.filter(item => item.kind === 'space').sort((a,b) => a.title.localeCompare(b.title)).slice(0, 4);
      const posts = index.filter(item => item.kind === 'post').sort((a,b) => b.sortTime - a.sortTime).slice(0, 4);
      renderCommunitySearchResults([...spaces, ...posts], '', tr('Discover community','اكتشف المجتمع'));
      return;
    }
    const ranked = index
      .map(result => ({result, score:searchResultScore(result, query)}))
      .filter(item => item.score > 0)
      .sort((a,b) => b.score - a.score || b.result.sortTime - a.result.sortTime)
      .slice(0, 30)
      .map(item => item.result);
    renderCommunitySearchResults(ranked, query, tr('Search results','نتائج البحث'));
  } catch (error) {
    console.error('[CommunitySearch] Search failed.', error);
    if (sequence === communitySearchSequence) renderCommunitySearchState('<strong>' + tr('Search is unavailable','البحث غير متاح') + '</strong><p>' + tr('Firebase could not be reached. Please try again in a moment.','تعذر الاتصال بـ Firebase. حاول مرة أخرى بعد قليل.') + '</p>');
  }
}

function moveCommunitySearchSelection(direction) {
  const options = [...$('communitySearchResults').querySelectorAll('[data-search-result]')];
  if (!options.length) return;
  communitySearchActiveIndex = (communitySearchActiveIndex + direction + options.length) % options.length;
  options.forEach((option, index) => {
    const active = index === communitySearchActiveIndex;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
  const selected = options[communitySearchActiveIndex];
  $('communitySearch').setAttribute('aria-activedescendant', selected.id);
  selected.scrollIntoView({block:'nearest'});
}

function followCommunitySearchResult(result) {
  if (!result) return;
  const destination = new URL(result.href, location.href);
  $('communitySearch').value = '';
  closeCommunitySearch();
  if (destination.pathname.endsWith('/project.html')) location.href = destination.href;
  else navigateTo(destination.href, false);
}

function avatarMarkup(name, photo, className, verified = false) {
  const safeName = escapeHtml(name || 'Community member');
  const content = photo
    ? '<img src="' + escapeHtml(photo) + '" alt="' + safeName + '">'
    : '<span>' + escapeHtml(initials(name)) + '</span>';
  const mark = verified ? '<i class="verified-avatar-mark" title="' + escapeHtml(tr('Verified account','حساب موثّق')) + '" aria-label="' + escapeHtml(tr('Verified account','حساب موثّق')) + '">✓</i>' : '';
  return '<span class="' + className + (verified ? ' is-verified' : '') + '">' + content + mark + '</span>';
}

function businessBadgeMarkup(profile, compact = false) {
  if (!profile || profile.isBusiness !== true || profile.businessStatus !== 'active') return '';
  const bizId = profile.id || profile.uid || profile.ownerUid || profile.username || '';
  if (!bizId) return '';
  if (compact) {
    return ' <a class="community-biz-badge-mini" href="portfolio.html?id=' + encodeURIComponent(bizId) + '" target="_blank" rel="noopener" title="' + escapeHtml(tr('Verified Business Portfolio','معرض أعمال وحساب موثّق')) + '" onclick="event.stopPropagation()">✓ <span>' + escapeHtml(tr('Business','أعمال')) + '</span></a>';
  }
  return '<a class="community-biz-badge" href="portfolio.html?id=' + encodeURIComponent(bizId) + '" target="_blank" rel="noopener" title="' + escapeHtml(tr('Verified Business Portfolio','معرض أعمال وحساب موثّق')) + '" onclick="event.stopPropagation()"><span>🏛️</span> <b>' + escapeHtml(tr('Verified Business','حساب أعمال موثّق')) + '</b> <i aria-hidden="true">↗</i></a>';
}


function showToast(message) {
  const toast = $('communityToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function getProfile(uid) {
  if (!uid) return {};
  if (uid === 'aias_assistant' || uid === 'ai') {
    return {
      displayName: tr('AIAS AI Assistant', 'مساعد AIAS الذكي'),
      username: 'ai',
      isAi: true,
      verified: true
    };
  }
  if (!profileCache.has(uid)) {
    const reference = uid === currentUser?.uid ? doc(db, 'users', uid) : doc(db, 'publicProfiles', uid);
    profileCache.set(uid, smartDocument('profile:' + uid, reference, 5 * 60 * 1000).then(snapshot => snapshot.exists() ? {mainThreadPostingAccess:true, ...snapshot.data()} : {}).catch(() => ({})));
  }
  return profileCache.get(uid);
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

async function checkUsernameAvailability(input, status, uid) {
  const sequence = String((Number(status.dataset.checkSequence) || 0) + 1);
  status.dataset.checkSequence = sequence;
  const username = normalizeUsername(input.value);
  if (input.value !== username) input.value = username;
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    input.setCustomValidity(tr('Use 3–24 lowercase letters, numbers, or underscores.','استخدم من 3 إلى 24 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية.'));
    status.className = 'username-check invalid';
    status.textContent = tr('Use 3–24 lowercase letters, numbers, or underscores.','استخدم من 3 إلى 24 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية.');
    return false;
  }
  status.className = 'username-check';
  status.textContent = tr('Checking p/','جارٍ التحقق من p/') + username + '…';
  try {
    const snapshot = await getDoc(doc(db, 'usernames', username));
    if (status.dataset.checkSequence !== sequence || normalizeUsername(input.value) !== username) return false;
    const available = !snapshot.exists() || snapshot.data().userId === uid;
    input.setCustomValidity(available ? '' : tr('That username is already taken.','اسم المستخدم هذا مستخدم بالفعل.'));
    status.className = 'username-check ' + (available ? 'valid' : 'invalid');
    status.textContent = available ? 'p/' + username + tr(' is available.',' متاح.') : 'p/' + username + tr(' is already taken.',' مستخدم بالفعل.');
    return available;
  } catch {
    if (status.dataset.checkSequence !== sequence) return false;
    input.setCustomValidity(tr('Username availability could not be checked.','تعذر التحقق من توفر اسم المستخدم.'));
    status.className = 'username-check invalid';
    status.textContent = tr('Could not check this username. Try again.','تعذر التحقق من اسم المستخدم. حاول مجدداً.');
    return false;
  }
}

async function claimUsername(uid, requestedUsername) {
  const username = normalizeUsername(requestedUsername);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error(tr('Use 3–24 lowercase letters, numbers, or underscores.','استخدم من 3 إلى 24 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية.'));
  }
  const usernameRef = doc(db, 'usernames', username);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(usernameRef);
    if (snapshot.exists()) {
      if (snapshot.data().userId !== uid) throw new Error(tr('That username is already taken.','اسم المستخدم هذا مستخدم بالفعل.'));
      return;
    }
    transaction.set(usernameRef, {userId:uid, username, createdAt:serverTimestamp()});
  });
  return username;
}

async function getPostMeta(post) {
  const [profile, mineSnapshot] = await Promise.all([
    getProfile(post.userId),
    currentUser ? getDoc(doc(db, 'communityPosts', post.id, 'votes', currentUser.uid)).catch(() => null) : Promise.resolve(null)
  ]);
  return {
    profile,
    score:Number(post.score) || 0,
    mine:mineSnapshot?.exists?.() ? Number(mineSnapshot.data().value) || 0 : 0,
    commentsCount:Number(post.commentsCount) || 0
  };
}

function canonicalPostUrl(post) {
  return new URL('/share/post/' + encodeURIComponent(post.id), location.origin).href;
}

function canonicalSpaceUrl(slug) {
  return new URL('/share/space/' + encodeURIComponent(slug), location.origin).href;
}

async function shareCommunityItem(data, copiedMessage, failureMessage) {
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.url);
      showToast(copiedMessage);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(failureMessage);
  }
}

function stopSpaceMessages() {
  hideAiTypingIndicator();
  unsubscribeSpaceAccess?.();
  unsubscribeSpaceAccess = null;
  unsubscribeSpaceMessages?.();
  unsubscribeSpaceMessages = null;
  unsubscribeSpaceMessageReads?.();
  unsubscribeSpaceMessageReads = null;
  unsubscribeSpaceChatPresence?.();
  unsubscribeSpaceChatPresence = null;
  if (chatPresenceTimer) window.clearInterval(chatPresenceTimer);
  chatPresenceTimer = null;
  activeChatPresence = [];
  if ($('messagesOnline')) {
    $('messagesOnline').hidden = true;
    $('messagesOnline').innerHTML = '';
  }
  if ($('messagesMuteChatBtn')) $('messagesMuteChatBtn').hidden = true;
  if ($('messagesGlobalMutedNotice')) $('messagesGlobalMutedNotice').hidden = true;
  activeMessageReply = null;
  activeSpaceMessages = [];
  liveSpaceMessages = [];
  olderSpaceMessages = [];
  activeSpaceMessageReads = [];
  activeMessagesSpace = null;
  activeReactionMessageId = '';
  activeMessageReactions.clear();
  lastSeenMessageMarked = '';
  oldestSpaceMessageCursor = null;
  loadingOlderSpaceMessages = false;
  hasOlderSpaceMessages = true;
  clearMessageImage();
  clearMessageVoice();
  for (const value of chatImageUrls.values()) {
    if (typeof value === 'string' && value.startsWith('blob:')) URL.revokeObjectURL(value);
  }
  chatImageUrls.clear();
}

async function updateChatPresence(spaceId) {
  if (!currentUser || !spaceId || spaceId === 'aias-assistant' || spaceId === 'aias_assistant' || document.visibilityState === 'hidden') return;
  try {
    await setDoc(doc(db, 'communitySpaces', spaceId, 'chatPresence', currentUser.uid), {userId:currentUser.uid, activeAt:serverTimestamp()}, {merge:true});
  } catch (error) { console.warn('[Community] Chat presence could not be updated.', error); }
}

async function renderChatPresence() {
  const host = $('messagesOnline');
  const currentSpace = activeMessagesSpace?.slug;
  const online = activeChatPresence.filter(item => item.userId && Date.now() - (spaceTimestamp(item.activeAt) * 1000) < 90 * 1000);
  if (!currentSpace || !online.length) { host.hidden = true; host.innerHTML = ''; return; }
  const profiles = await Promise.all(online.slice(0, 4).map(async item => ({item, profile:await getProfile(item.userId)})));
  if (currentSpace !== activeMessagesSpace?.slug) return;
  host.hidden = false;
  host.title = tr(online.length === 1 ? '1 member online now' : online.length + ' members online now', online.length === 1 ? 'عضو واحد متصل الآن' : online.length + ' أعضاء متصلون الآن');
  host.innerHTML = '<span class="messages-online-avatars">' + profiles.slice(0, 3).map(({item, profile}) => avatarMarkup(profile.displayName || profile.username || tr('Member','عضو'), profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true)).join('') + (online.length > 3 ? '<b>+' + (online.length - 3) + '</b>' : '') + '</span><small><i></i>' + (online.length === 1 ? tr('1 online','متصل واحد') : online.length + ' ' + tr('online','متصلون')) + '</small>';
}

async function openChatOnlineMembers() {
  const online = activeChatPresence.filter(item => item.userId && Date.now() - (spaceTimestamp(item.activeAt) * 1000) < 90 * 1000);
  const members = await Promise.all(online.map(async item => ({item, profile:await getProfile(item.userId)})));
  $('chatOnlineList').innerHTML = members.length ? members.map(({profile, item}) => {
    const name = profile.displayName || profile.username || tr('Community member','عضو في المجتمع');
    return '<a href="' + escapeHtml(profileUrl(item.userId, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small><i class="live-dot"></i> ' + tr('Online now','متصل الآن') + '</small></span></a>';
  }).join('') : '<p class="notice">' + tr('No members are online in this chat right now.','لا يوجد أعضاء متصلون في هذه الدردشة الآن.') + '</p>';
  $('chatOnlineDialog').showModal();
}

async function seenMembersForMessage(messageId) {
  const receipts = activeSpaceMessageReads.filter(receipt => receipt.lastMessageId === messageId && receipt.userId !== currentUser?.uid);
  return Promise.all(receipts.map(async receipt => ({receipt, profile:await getProfile(receipt.userId)})));
}

async function openMessageViewers(messageId) {
  const viewers = await seenMembersForMessage(messageId);
  $('messageViewersList').innerHTML = viewers.length ? viewers.map(({receipt, profile}) => {
    const name = profile.displayName || profile.username || tr('Community member','عضو في المجتمع');
    return '<a href="' + escapeHtml(profileUrl(receipt.userId, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small>' + tr('Seen','شاهد') + ' · ' + escapeHtml(formatDate(receipt.seenAt)) + '</small></span></a>';
  }).join('') : '<p class="notice">' + tr('No other members have reached this message yet.','لم يصل أعضاء آخرون إلى هذه الرسالة بعد.') + '</p>';
  $('messageViewersDialog').showModal();
}

async function openMessageReactionPicker(messageId) {
  activeReactionMessageId = messageId;
  let mine = '';
  try { const snapshot = await getDoc(doc(db, 'communitySpaces', activeMessagesSpace.slug, 'messages', messageId, 'reactions', currentUser.uid)); mine = snapshot.exists() ? snapshot.data().emoji : ''; } catch {}
  activeMessageReactions.set(messageId, mine);
  $('messagesList').querySelectorAll('[data-chat-reactors="' + CSS.escape(messageId) + '"]').forEach(chip => {
    const selected = chip.dataset.reactionEmoji === mine;
    chip.classList.toggle('selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  $('messageReactionPicker').innerHTML = CHAT_REACTION_EMOJIS.map(emoji => {
    const label = CHAT_REACTION_LABELS[emoji] || ['Reaction','تفاعل'];
    return '<button type="button" data-pick-reaction="' + escapeHtml(emoji) + '" class="' + (emoji === mine ? 'selected' : '') + '" aria-label="' + escapeHtml(tr(label[0], label[1])) + '" aria-pressed="' + String(emoji === mine) + '"><span>' + escapeHtml(emoji) + '</span><small>' + escapeHtml(tr(label[0], label[1])) + '</small></button>';
  }).join('');
  $('messageReactionHint').textContent = mine ? tr('Tap your selected emoji to remove it.','اضغط على رمزك المحدد لإزالته.') : tr('Choose the feeling that fits.','اختر التفاعل المناسب.');
  $('messageReactionDialog').showModal();
}

async function openMessageReactors(messageId, emoji) {
  const snapshot = await getDocs(collection(db, 'communitySpaces', activeMessagesSpace.slug, 'messages', messageId, 'reactions'));
  const reactions = snapshot.docs.map(item => item.data()).filter(item => !emoji || item.emoji === emoji);
  const people = await Promise.all(reactions.map(async reaction => ({reaction, profile:await getProfile(reaction.userId)})));
  people.sort((left, right) => Number(right.reaction.userId === currentUser?.uid) - Number(left.reaction.userId === currentUser?.uid));
  $('messageReactorsTitle').textContent = emoji ? emoji + ' ' + tr('Reactions','التفاعلات') : tr('Reactions','التفاعلات');
  $('messageReactorsList').innerHTML = people.length ? people.map(({reaction,profile}) => {
    const name = reaction.userId === currentUser?.uid ? tr('You','أنت') : profile.displayName || profile.username || tr('Community member','عضو في المجتمع');
    const handle = profile.username ? '@' + profile.username : tr('Chat member','عضو في الدردشة');
    return '<a href="' + escapeHtml(profileUrl(reaction.userId, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(handle) + '</small></span><b class="message-reactor-emoji" aria-label="' + escapeHtml(tr('Reaction','التفاعل')) + '">' + escapeHtml(reaction.emoji) + '</b></a>';
  }).join('') : '<p class="notice">' + tr('No reactions yet.','لا توجد تفاعلات بعد.') + '</p>';
  $('messageReactorsDialog').showModal();
}

function showMessageReactionBurst(messageId, emoji, sourceElement = null) {
  const article = $('messagesList').querySelector('[data-message-id="' + CSS.escape(messageId) + '"]');
  if (!emoji || !article) return;
  const burst = document.createElement('span');
  burst.className = 'message-reaction-burst';
  burst.textContent = emoji;
  (article.querySelector('.space-message-body') || sourceElement || article).appendChild(burst);
  window.setTimeout(() => burst.remove(), 850);
}

async function setMessageReaction(messageId, emoji, sourceElement = null) {
  if (!messageId || !activeMessagesSpace || !currentUser) return;
  const result = await callFunction('setCommunitySpaceConnection', {operation:'set_space_message_reaction', spaceId:activeMessagesSpace.slug, messageId, emoji});
  activeMessageReactions.set(messageId, result.emoji || '');
  const message = activeSpaceMessages.find(item => item.id === messageId);
  if (message) message.reactionCounts = result.reactionCounts || {};
  await repaintActiveSpaceMessages();
  showMessageReactionBurst(messageId, result.emoji, sourceElement);
  return result;
}

async function quickLoveMessage(messageId, sourceElement = null) {
  let mine = activeMessageReactions.get(messageId);
  if (!activeMessageReactions.has(messageId)) {
    try {
      const snapshot = await getDoc(doc(db, 'communitySpaces', activeMessagesSpace.slug, 'messages', messageId, 'reactions', currentUser.uid));
      mine = snapshot.exists() ? snapshot.data().emoji : '';
      activeMessageReactions.set(messageId, mine);
    } catch { mine = ''; }
  }
  if (mine === '❤️') return showMessageReactionBurst(messageId, '❤️', sourceElement);
  return setMessageReaction(messageId, '❤️', sourceElement);
}

function setMessageReply(message = null) {
  activeMessageReply = message;
  if ($('messageReplyPreview')) $('messageReplyPreview').hidden = !message;
  if ($('messageReplyName')) $('messageReplyName').textContent = message?.senderName || '';
  if ($('messageReplyText')) $('messageReplyText').textContent = message ? (message.text || (message.imagePath ? tr('Photo','صورة') : message.audioPath ? tr('Voice message','رسالة صوتية') : tr('Shared post','منشور مُشارك'))).slice(0, 180) : '';
  if (message && $('messageText')) $('messageText').focus();
}

function clearMessageVoice() {
  if (messageVoiceTimer) window.clearInterval(messageVoiceTimer);
  messageVoiceTimer = null;
  if (messageMediaRecorder?.state === 'recording') messageMediaRecorder.stop();
  messageMediaRecorder?.stream?.getTracks?.().forEach(track => track.stop());
  messageMediaRecorder = null;
  if (activeMessageVoice?.previewUrl) URL.revokeObjectURL(activeMessageVoice.previewUrl);
  activeMessageVoice = null;
  if ($('messageVoicePreview')) $('messageVoicePreview').hidden = true;
  if ($('messageVoicePreviewAudio')) $('messageVoicePreviewAudio').removeAttribute('src');
  if ($('messageVoiceStatus')) $('messageVoiceStatus').textContent = '';
  if ($('messageVoiceRecord')) {
    $('messageVoiceRecord').classList.remove('recording');
    $('messageVoiceRecord').setAttribute('aria-label', tr('Record voice message','تسجيل رسالة صوتية'));
  }
}

async function toggleMessageVoiceRecording() {
  if (messageMediaRecorder?.state === 'recording') {
    messageMediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(tr('Voice recording is not supported by this browser.','هذا المتصفح لا يدعم تسجيل الصوت.'));
  clearMessageImage();
  clearMessageVoice();
  const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}});
  const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
  const chunks = [];
  const startedAt = Date.now();
  messageMediaRecorder = recorder;
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop());
    if (messageMediaRecorder !== recorder) return;
    if (messageVoiceTimer) window.clearInterval(messageVoiceTimer);
    messageVoiceTimer = null;
    $('messageVoiceRecord').classList.remove('recording');
    const durationMs = Math.min(CHAT_AUDIO_MAX_MS, Date.now() - startedAt);
    const type = recorder.mimeType.split(';')[0] || 'audio/webm';
    const blob = new Blob(chunks, {type});
    messageMediaRecorder = null;
    if (!blob.size || blob.size > CHAT_AUDIO_MAX_BYTES || durationMs < 250) return showToast(tr('The voice recording is empty or too large.','التسجيل الصوتي فارغ أو كبير جداً.'));
    const previewUrl = URL.createObjectURL(blob);
    activeMessageVoice = {blob, previewUrl, durationMs, audioPath:'', contentType:type};
    $('messageVoicePreviewAudio').src = previewUrl;
    $('messageVoicePreview').hidden = false;
    $('messageVoiceStatus').textContent = tr('Ready to send','جاهزة للإرسال') + ' · ' + Math.ceil(durationMs / 1000) + 's';
  };
  recorder.start(500);
  $('messageVoiceRecord').classList.add('recording');
  $('messageVoiceRecord').setAttribute('aria-label', tr('Stop recording','إيقاف التسجيل'));
  messageVoiceTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    $('messageVoiceStatus').textContent = tr('Recording','جارٍ التسجيل') + ' ' + Math.ceil(elapsed / 1000) + 's';
    $('messageVoicePreview').hidden = false;
    if (elapsed >= CHAT_AUDIO_MAX_MS && recorder.state === 'recording') recorder.stop();
  }, 250);
}

function uploadMessageVoice(spaceId) {
  if (!activeMessageVoice) return Promise.resolve('');
  if (activeMessageVoice.audioPath) return Promise.resolve(activeMessageVoice.audioPath);
  const extension = {'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/aac':'aac','audio/mpeg':'mp3'}[activeMessageVoice.contentType] || 'webm';
  const fileId = (crypto.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, '');
  const audioPath = `community/space-messages/${spaceId}/${currentUser.uid}/${fileId}.${extension}`;
  const task = uploadBytesResumable(storageRef(storage, audioPath), activeMessageVoice.blob, {contentType:activeMessageVoice.contentType});
  return new Promise((resolve, reject) => task.on('state_changed', snapshot => {
    const progress = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
    $('messageVoiceStatus').textContent = tr(`Uploading ${progress}%`,`جارٍ الرفع ${progress}٪`);
  }, reject, () => { if (activeMessageVoice) activeMessageVoice.audioPath = audioPath; resolve(audioPath); }));
}

function clearMessageImage() {
  if (activeMessageImage?.previewUrl) URL.revokeObjectURL(activeMessageImage.previewUrl);
  activeMessageImage = null;
  if ($('messageImageInput')) $('messageImageInput').value = '';
  if ($('messageImagePreview')) $('messageImagePreview').hidden = true;
  if ($('messageImagePreviewImage')) $('messageImagePreviewImage').src = '';
  if ($('messageUploadStatus')) $('messageUploadStatus').textContent = '';
}

function selectMessageImage(file) {
  if (!file) return clearMessageImage();
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error(tr('Choose a JPEG, PNG, or WebP image.','اختر صورة JPEG أو PNG أو WebP.'));
  if (file.size < 1 || file.size > CHAT_IMAGE_MAX_BYTES) throw new Error(tr('Choose an image no larger than 8 MB.','اختر صورة لا يزيد حجمها عن 8 ميغابايت.'));
  clearMessageImage();
  const previewUrl = URL.createObjectURL(file);
  activeMessageImage = {file, previewUrl, imagePath:''};
  $('messageImagePreviewImage').src = previewUrl;
  $('messageImagePreview').hidden = false;
  $('messageUploadStatus').textContent = tr('Ready to send','جاهزة للإرسال');
}

function uploadMessageImage(spaceId) {
  if (!activeMessageImage) return Promise.resolve('');
  if (activeMessageImage.imagePath) return Promise.resolve(activeMessageImage.imagePath);
  const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[activeMessageImage.file.type];
  const fileId = (crypto.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, '');
  const imagePath = `community/space-messages/${spaceId}/${currentUser.uid}/${fileId}.${extension}`;
  const task = uploadBytesResumable(storageRef(storage, imagePath), activeMessageImage.file, {contentType:activeMessageImage.file.type});
  return new Promise((resolve, reject) => task.on('state_changed', snapshot => {
    const progress = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
    $('messageUploadStatus').textContent = tr(`Uploading ${progress}%`,`جارٍ الرفع ${progress}٪`);
  }, reject, () => {
    if (activeMessageImage) activeMessageImage.imagePath = imagePath;
    $('messageUploadStatus').textContent = tr('Upload complete','اكتمل الرفع');
    resolve(imagePath);
  }));
}

async function chatImageUrl(imagePath) {
  if (!imagePath) return '';
  if (!chatImageUrls.has(imagePath)) {
    const pending = getBlob(storageRef(storage, imagePath)).then(blob => {
      const url = URL.createObjectURL(blob);
      chatImageUrls.set(imagePath, url);
      return url;
    }).catch(error => {
      console.warn('[Community] Chat image could not be loaded.', error);
      return '';
    });
    chatImageUrls.set(imagePath, pending);
  }
  return chatImageUrls.get(imagePath);
}

async function sharedPostForMessage(postId) {
  if (!postId) return null;
  if (!sharedPostCache.has(postId)) {
    sharedPostCache.set(postId, getDoc(doc(db, 'communityPosts', postId)).then(async snapshot => {
      if (!snapshot.exists()) return null;
      const post = {id:snapshot.id, ...snapshot.data()};
      return canSeeSharedChatPost(post) ? loadPostImage(post) : post;
    }).catch(() => null));
  }
  return sharedPostCache.get(postId);
}

function canSeeSharedChatPost(post) {
  if (!post || post.archived === true || post.published === false) return false;
  if (blockedSpaceSlugs.has(post.communitySlug)) return false;
  const area = communityAreas[post.communitySlug];
  return !area?.isPrivate || area.creatorId === currentUser?.uid || managedSpaceSlugs.has(area.slug) || connectedSpaceSlugs.has(area.slug);
}

async function renderSpaceMessage(message, space) {
  const [profile, sharedPost, messageImage, messageAudio] = await Promise.all([getProfile(message.senderId), sharedPostForMessage(message.sharedPostId), chatImageUrl(message.imagePath), chatImageUrl(message.audioPath)]);
  const displayName = profile.displayName || message.senderName || tr('Community member','عضو في المجتمع');
  const mine = message.senderId === currentUser?.uid;
  const deleted = message.deleted === true;
  const sharedAllowed = canSeeSharedChatPost(sharedPost);
  const sharedImage = sharedAllowed ? postImageUrls(sharedPost)[0] : '';
  const sharedCard = !deleted && message.sharedPostId
    ? sharedAllowed
      ? '<button class="chat-shared-post" type="button" data-message-post="' + escapeHtml(message.sharedPostId) + '">' + (sharedImage ? '<img src="' + escapeHtml(sharedImage) + '" alt="">' : '') + '<span>' + escapeHtml(sharedPost.type === 'question' ? tr('Open question','سؤال مفتوح') : sharedPost.type === 'behance' ? tr('Project','مشروع') : tr('Post','منشور')) + '</span><strong>' + escapeHtml(sharedPost.title || tr('Community post','منشور المجتمع')) + '</strong><small>' + escapeHtml(sharedPost.authorName || tr('Community member','عضو في المجتمع')) + ' · ' + escapeHtml(sharedPost.communitySlug === 'main' ? tr('Main thread','المسار الرئيسي') : 'a/' + sharedPost.communitySlug) + '</small><b>' + tr('Open post','فتح المنشور') + ' →</b></button>'
      : '<div class="chat-shared-post restricted"><span aria-hidden="true">◐</span><strong>' + tr('Restricted post','منشور مقيّد') + '</strong><small>' + tr('Connect to the private space to view this post.','اتصل بالمساحة الخاصة لعرض هذا المنشور.') + '</small></div>'
    : '';
  const imageCard = !deleted && message.imagePath
    ? messageImage
      ? '<button class="chat-message-image" type="button" data-chat-image="' + escapeHtml(messageImage) + '"><img src="' + escapeHtml(messageImage) + '" alt="' + escapeHtml(tr('Chat photo','صورة الدردشة')) + '"></button>'
      : '<div class="chat-image-unavailable">' + tr('Image unavailable','الصورة غير متاحة') + '</div>'
    : '';
  const audioCard = !deleted && message.audioPath
    ? messageAudio
      ? '<div class="chat-message-audio"><button type="button" data-chat-audio-toggle aria-label="' + escapeHtml(tr('Play voice message','تشغيل الرسالة الصوتية')) + '"><span aria-hidden="true">▶</span></button><span class="chat-message-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><small>' + Math.max(1, Math.ceil(Number(message.audioDurationMs || 0) / 1000)) + 's</small><audio preload="metadata" src="' + escapeHtml(messageAudio) + '"></audio></div>'
      : '<div class="chat-image-unavailable">' + tr('Voice message unavailable','الرسالة الصوتية غير متاحة') + '</div>'
    : '';
  const isAiMessage = message.senderId === 'aias_assistant' || message.isAi === true;
  const aiBadge = isAiMessage ? '<span class="ai-badge-pill">AI</span>' : '';
  const reply = message.replyToId ? '<div class="chat-reply-context" data-jump-to-message="' + escapeHtml(message.replyToId) + '" role="button" tabindex="0" title="' + escapeHtml(tr('Click to jump to replied message','انقر للانتقال إلى الرسالة المردود عليها')) + '"><strong>' + escapeHtml(message.replyToSenderName || tr('Member','عضو')) + '</strong><span>' + escapeHtml(message.replyToText || tr('Message','رسالة')) + '</span></div>' : '';
  const viewers = await seenMembersForMessage(message.id);
  const seen = viewers.length ? '<button class="message-seen" type="button" data-message-viewers="' + escapeHtml(message.id) + '" title="' + escapeHtml(tr('See everyone who viewed this message','عرض كل من شاهد هذه الرسالة')) + '">' + viewers.slice(0, 2).map(({profile, receipt}) => avatarMarkup(profile.displayName || profile.username || tr('Member','عضو'), profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true)).join('') + (viewers.length > 2 ? '<b>+' + (viewers.length - 2) + '</b>' : '') + '</button>' : '';
  const messageActions = !deleted
    ? (mine ? '<button type="button" data-chat-edit="' + escapeHtml(message.id) + '">' + tr('Edit','تعديل') + '</button>' : '')
      + (mine || canManageSpace(space.slug) ? '<button type="button" data-chat-delete="' + escapeHtml(message.id) + '">' + tr('Delete','حذف') + '</button>' : '')
    : '';
  const applause = !deleted ? '<button type="button" data-chat-applause="' + escapeHtml(message.id) + '" class="chat-applause">✦ ' + Number(message.applauseCount || 0) + '</button>' : '';
  const myReaction = activeMessageReactions.get(message.id) || '';
  const reactionChips = !deleted ? Object.entries(message.reactionCounts || {}).filter(([,count]) => Number(count) > 0).map(([emoji,count]) => {
    const selected = emoji === myReaction;
    return '<button type="button" class="chat-reaction-chip' + (selected ? ' selected' : '') + '" data-chat-reactors="' + escapeHtml(message.id) + '" data-reaction-emoji="' + escapeHtml(emoji) + '" aria-label="' + escapeHtml(emoji + ' · ' + Number(count) + ' · ' + tr('See who reacted','عرض من تفاعل')) + '" aria-pressed="' + String(selected) + '"><span>' + escapeHtml(emoji) + '</span><b>' + Number(count) + '</b></button>';
  }).join('') : '';
  const content = deleted ? '<div class="space-message-deleted">' + tr('Message deleted','تم حذف الرسالة') + '</div>' : reply + (message.text ? '<div class="space-message-text">' + renderMentionedText(message.text) + (message.editedAt ? ' <em>' + tr('Edited','تم التعديل') + '</em>' : '') + '</div>' : '') + imageCard + audioCard + sharedCard;
  const reactionSurface = deleted ? '' : ' data-reaction-surface="' + escapeHtml(message.id) + '" title="' + escapeHtml(tr('Double-click to love · hold for more reactions','انقر مرتين للإعجاب · اضغط مطولاً لمزيد من التفاعلات')) + '"';
  return '<article class="space-message' + (mine ? ' mine' : '') + (deleted ? ' deleted' : '') + (isAiMessage ? ' is-ai-message' : '') + '" data-message-id="' + escapeHtml(message.id) + '"><a class="space-message-avatar" href="' + escapeHtml(profileUrl(message.senderId, profile.username || message.senderUsername)) + '">' + avatarMarkup(displayName, profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true) + '</a><div><div class="space-message-body"' + reactionSurface + '><div class="space-message-meta"><a href="' + escapeHtml(profileUrl(message.senderId, profile.username || message.senderUsername)) + '">' + escapeHtml(displayName) + '</a>' + businessBadgeMarkup(profile, true) + aiBadge + '<span>' + escapeHtml(formatDate(message.createdAt)) + '</span></div>' + content + (reactionChips ? '<div class="chat-reaction-chips">' + reactionChips + '</div>' : '') + '<div class="space-message-actions">' + applause + (!deleted ? '<button type="button" data-chat-react="' + escapeHtml(message.id) + '" aria-label="' + escapeHtml(tr('React to message','تفاعل مع الرسالة')) + '"><span aria-hidden="true">☺</span> ' + tr('React','تفاعل') + '</button><button type="button" data-chat-reply="' + escapeHtml(message.id) + '">' + tr('Reply','رد') + '</button>' : '') + messageActions + '</div></div>' + seen + '</div></article>';
}

async function paintSpaceMessages(source, space, {scrollToBottom = false, preserveScroll = false} = {}) {
  const allMessages = Array.isArray(source) ? source : source.docs.map(item => ({id:item.id, ...item.data()}));
  const messages = allMessages.filter(message => !showTopApplaudedMessages || Number(message.applauseCount || 0) > 0).sort((a,b) => showTopApplaudedMessages ? Number(b.applauseCount || 0) - Number(a.applauseCount || 0) : 0);
  const messageList = $('messagesList');
  const paintVersion = ++spaceMessagePaintVersion;
  const previousScrollTop = messageList.scrollTop;
  const previousScrollHeight = messageList.scrollHeight;
  activeSpaceMessages = allMessages;
  activeMessagesSpace = space;
  if (!messages.length) {
    messageList.innerHTML = '<div class="empty-state"><span class="empty-mark">◯</span><h3>' + tr('Start the conversation','ابدأ المحادثة') + '</h3><p>' + tr('Messages appear instantly for connected members.','تظهر الرسائل فوراً للأعضاء المتصلين.') + '</p></div>';
  } else {
    messageList.innerHTML = messages.map(message => '<article class="space-message chat-message-loading" data-message-slot="' + escapeHtml(message.id) + '"><div class="post-skeleton short"></div></article>').join('');
    if (scrollToBottom) messageList.scrollTop = messageList.scrollHeight;
    requestAnimationFrame(() => {
      if (paintVersion === spaceMessagePaintVersion && scrollToBottom) messageList.scrollTop = messageList.scrollHeight;
    });
    await Promise.all([...messages].reverse().map(async message => {
      const html = await renderSpaceMessage(message, space);
      if (paintVersion !== spaceMessagePaintVersion) return;
      const slot = messageList.querySelector('[data-message-slot="' + CSS.escape(message.id) + '"]');
      if (!slot) return;
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      slot.replaceWith(template.content.firstElementChild);
      if (scrollToBottom) messageList.scrollTop = messageList.scrollHeight;
    }));
    if (paintVersion !== spaceMessagePaintVersion) return;
  }
  $('messagesList').querySelectorAll('[data-chat-reply]').forEach(button => button.addEventListener('click', () => setMessageReply(messages.find(item => item.id === button.dataset.chatReply))));
  $('messagesList').querySelectorAll('[data-jump-to-message]').forEach(el => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      const targetId = el.dataset.jumpToMessage;
      if (!targetId) return;
      const messageList = $('messagesList');
      const targetEl = messageList.querySelector('[data-message-id="' + CSS.escape(targetId) + '"]');
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.classList.remove('chat-message-highlight');
        void targetEl.offsetWidth;
        targetEl.classList.add('chat-message-highlight');
        setTimeout(() => targetEl.classList.remove('chat-message-highlight'), 2000);
      } else {
        showToast(tr('Replied message is not in current view', 'الرسالة المردود عليها ليست في العرض الحالي'));
      }
    });
  });
  $('messagesList').querySelectorAll('[data-message-viewers]').forEach(button => button.addEventListener('click', () => openMessageViewers(button.dataset.messageViewers).catch(console.error)));
  $('messagesList').querySelectorAll('[data-chat-edit]').forEach(button => button.addEventListener('click', async () => {
    const message = messages.find(item => item.id === button.dataset.chatEdit);
    if (!message) return;
    const text = prompt(tr('Edit your message:','عدّل رسالتك:'), message.text || '')?.trim();
    if (text == null || text === message.text || (!text && !message.imagePath && !message.audioPath && !message.sharedPostId)) return;
    button.disabled = true;
    try { await callFunction('setCommunitySpaceConnection', {operation:'edit_space_message', spaceId:space.slug, messageId:message.id, text}); }
    catch (error) { console.error(error); showToast(error.message || tr('Message could not be edited.','تعذر تعديل الرسالة.')); button.disabled = false; }
  }));
  $('messagesList').querySelectorAll('[data-chat-delete]').forEach(button => button.addEventListener('click', async () => {
    const messageId = button.dataset.chatDelete;
    if (!confirm(tr('Delete this message?','حذف هذه الرسالة؟'))) return;
    button.disabled = true;
    try { await callFunction('setCommunitySpaceConnection', {operation:'delete_space_message', spaceId:space.slug, messageId}); }
    catch (error) { console.error(error); showToast(error.message || tr('Message could not be deleted.','تعذر حذف الرسالة.')); button.disabled = false; }
  }));
  $('messagesList').querySelectorAll('[data-message-post]').forEach(button => button.addEventListener('click', () => navigateTo('/community.html?post=' + encodeURIComponent(button.dataset.messagePost) + '&area=' + encodeURIComponent(space.slug) + '&return=messages', false)));
  $('messagesList').querySelectorAll('[data-chat-image]').forEach(button => button.addEventListener('click', () => openImageViewer({title:tr('Chat photo','صورة الدردشة'), imageDataUrls:[button.dataset.chatImage], chatImage:true}, 0)));
  $('messagesList').querySelectorAll('[data-chat-applause]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; try { await callFunction('setCommunitySpaceConnection', {operation:'toggle_space_message_applause', spaceId:space.slug, messageId:button.dataset.chatApplause}); } catch (error) { showToast(error.message || tr('Could not applaud this message.','تعذر التصفيق لهذه الرسالة.')); button.disabled = false; } }));
  $('messagesList').querySelectorAll('[data-chat-react]').forEach(button => button.addEventListener('click', () => openMessageReactionPicker(button.dataset.chatReact).catch(console.error)));
  $('messagesList').querySelectorAll('[data-chat-reactors]').forEach(button => button.addEventListener('click', () => openMessageReactors(button.dataset.chatReactors, button.dataset.reactionEmoji).catch(console.error)));
  $('messagesList').querySelectorAll('[data-reaction-surface]').forEach(surface => {
    const messageId = surface.dataset.reactionSurface;
    let holdTimer = null;
    let holdStart = null;
    const cancelHold = () => { if (holdTimer) window.clearTimeout(holdTimer); holdTimer = null; holdStart = null; };
    surface.addEventListener('dblclick', event => {
      if (event.target.closest('a,button,audio,input,textarea')) return;
      event.preventDefault();
      quickLoveMessage(messageId, surface).catch(error => showToast(error.message || tr('Could not add reaction.','تعذر إضافة التفاعل.')));
    });
    surface.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('a,button,audio,input,textarea')) return;
      holdStart = {x:event.clientX, y:event.clientY};
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        navigator.vibrate?.(18);
        openMessageReactionPicker(messageId).catch(console.error);
      }, 520);
    });
    surface.addEventListener('pointermove', event => {
      if (holdStart && Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 12) cancelHold();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(type => surface.addEventListener(type, cancelHold));
  });
  $('messagesList').querySelectorAll('[data-chat-audio-toggle]').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.chat-message-audio');
    const audio = card?.querySelector('audio');
    if (!audio) return;
    $('messagesList').querySelectorAll('.chat-message-audio audio').forEach(other => { if (other !== audio) other.pause(); });
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }));
  $('messagesList').querySelectorAll('.chat-message-audio audio').forEach(audio => {
    const card = audio.closest('.chat-message-audio');
    const toggle = card?.querySelector('[data-chat-audio-toggle]');
    const sync = () => { const playing = !audio.paused && !audio.ended; card?.classList.toggle('playing', playing); if (toggle) { toggle.querySelector('span').textContent = playing ? '❚❚' : '▶'; toggle.setAttribute('aria-label', tr(playing ? 'Pause voice message' : 'Play voice message', playing ? 'إيقاف الرسالة الصوتية' : 'تشغيل الرسالة الصوتية')); } };
    audio.addEventListener('play', sync); audio.addEventListener('pause', sync); audio.addEventListener('ended', sync);
  });
  requestAnimationFrame(() => {
    if (scrollToBottom) messageList.scrollTop = messageList.scrollHeight;
    else if (preserveScroll) messageList.scrollTop = previousScrollTop + Math.max(0, messageList.scrollHeight - previousScrollHeight);
  });
  const latest = messages.at(-1);
  if (latest && (latest.isAi === true || latest.senderId === 'aias_assistant')) {
    hideAiTypingIndicator();
  }
  if (latest && latest.id !== lastSeenMessageMarked && space.slug !== 'aias-assistant' && space.slug !== 'aias_assistant') {
    lastSeenMessageMarked = latest.id;
    callFunction('setCommunitySpaceConnection', {operation:'mark_space_messages_seen', spaceId:space.slug, messageId:latest.id}).catch(error => console.warn('[Community] Seen receipt could not be updated.', error));
  }
}

async function repaintActiveSpaceMessages() {
  if (!activeMessagesSpace) return;
  await paintSpaceMessages(activeSpaceMessages, activeMessagesSpace, {preserveScroll:true});
}

function combineSpaceMessagePages() {
  const unique = new Map();
  [...olderSpaceMessages, ...liveSpaceMessages].forEach(message => unique.set(message.id, message));
  return [...unique.values()];
}

async function loadOlderSpaceMessages() {
  const space = activeMessagesSpace;
  if (!space || loadingOlderSpaceMessages || !hasOlderSpaceMessages || !oldestSpaceMessageCursor) return;
  loadingOlderSpaceMessages = true;
  const list = $('messagesList');
  list.classList.add('loading-history');
  try {
    const pageQuery = query(
      collection(db, 'communitySpaces', space.slug, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(oldestSpaceMessageCursor),
      limit(30)
    );
    const snapshot = await getDocs(pageQuery);
    const page = snapshot.docs.map(item => ({id:item.id, ...item.data()})).reverse();
    oldestSpaceMessageCursor = snapshot.docs.at(-1) || oldestSpaceMessageCursor;
    hasOlderSpaceMessages = snapshot.size === 30;
    olderSpaceMessages = [...page, ...olderSpaceMessages];
    await paintSpaceMessages(combineSpaceMessagePages(), space, {preserveScroll:true});
  } catch (error) {
    console.warn('[Community] Older messages could not be loaded.', error);
  } finally {
    loadingOlderSpaceMessages = false;
    list.classList.remove('loading-history');
  }
}

async function openSpaceMessages(space) {
  stopSpaceMessages();
  showTopApplaudedMessages = false;
  $('messagesTopTab').classList.remove('active');
  $('messagesTopTab').textContent = '✦ ' + tr('Top','الأعلى');
  $('messagesSpacePath').textContent = space.slug === 'aias-assistant' ? 'ai/assistant' : 'a/' + space.slug;
  $('messagesSpaceTitle').textContent = space.name || tr('Space messages','رسائل المساحة');
  $('messagesSpaceVisual').innerHTML = space.slug === 'aias-assistant' ? '<div class="messages-space-image ai-space-avatar"><span>AI</span></div>' : spaceVisual(space, 'messages-space-image');
  $('messagesBack').href = space.slug === 'aias-assistant' ? '/community.html?view=chats' : areaUrl(space.slug);
  $('messagesGate').hidden = true;
  $('messagesPanel').hidden = true;
  if (!currentUser) {
    $('messagesGate').hidden = false;
    $('messagesGate').innerHTML = '<p class="notice">' + tr('Sign in and connect to this space to view its messages.','سجّل الدخول واتصل بهذه المساحة لعرض رسائلها.') + '</p>';
    return;
  }
  if (space.slug === 'aias-assistant') {
    $('messagesPanel').hidden = false;
    activeMessagesSpace = space;
    const muteBtn = $('messagesMuteChatBtn');
    if (muteBtn) muteBtn.hidden = true;
    $('messagesList').innerHTML = '<div class="post-skeleton short"></div>';
    const messagesQuery = query(collection(db, 'users', currentUser.uid, 'aiMessages'), orderBy('createdAt', 'desc'), limit(30));
    let firstMessagePage = true;
    unsubscribeSpaceMessages = onSnapshot(messagesQuery, snapshot => {
      const list = $('messagesList');
      const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      liveSpaceMessages = snapshot.docs.map(item => ({id:item.id, ...item.data()})).reverse();
      const liveIds = new Set(liveSpaceMessages.map(message => message.id));
      olderSpaceMessages = olderSpaceMessages.filter(message => !liveIds.has(message.id));
      if (firstMessagePage) {
        oldestSpaceMessageCursor = snapshot.docs.at(-1) || null;
        hasOlderSpaceMessages = snapshot.size === 30;
      }
      paintSpaceMessages(combineSpaceMessagePages(), space, {scrollToBottom:firstMessagePage || wasNearBottom}).catch(console.error);
      firstMessagePage = false;
    }, error => console.warn('[Community] AI Assistant messages unavailable.', error));
    return;
  }

  if (space.isDirectMessage === true || space.slug?.startsWith('dm-')) {
    const isParticipant = (Array.isArray(space.directParticipants) ? space.directParticipants : []).includes(currentUser.uid) || space.slug.includes(currentUser.uid);
    if (!isParticipant) {
      $('messagesGate').hidden = false;
      $('messagesGate').innerHTML = '<p class="notice error">' + tr('You are not a participant in this conversation.', 'لست مشاركاً في هذه المحادثة.') + '</p>';
      return;
    }
    const otherUid = (Array.isArray(space.directParticipants) ? space.directParticipants : []).find(id => id !== currentUser.uid)
      || space.slug.replace(/^dm-/, '').split('-').find(id => id !== currentUser.uid);
    if (otherUid) {
      const otherProfile = await getProfile(otherUid);
      const isBiz = otherProfile?.isBusiness === true && otherProfile?.businessStatus === 'active';
      let title = otherProfile?.displayName || otherProfile?.username || 'Member';
      if (isBiz && otherProfile?.businessName) title = otherProfile.businessName;
      $('messagesSpaceTitle').innerHTML = escapeHtml(title) + (isBiz ? ' <span class="pro-verified-badge-mini" title="Verified Practice">✓</span>' : '');
      const metaTag = isBiz ? tr('Verified Studio & Practice', 'استوديو وممارسة معتمدة') : (otherProfile?.professionalTitle || tr('Direct Professional Conversation', 'محادثة مهنية مباشرة'));
      $('messagesSpacePath').textContent = metaTag;
      $('messagesSpaceVisual').innerHTML = avatarMarkup(title, otherProfile?.photoBase64 || otherProfile?.photoURL, 'messages-space-image', isBiz);
    }
    $('messagesBack').href = '/community.html?view=chats';
    $('messagesPanel').hidden = false;
    activeMessagesSpace = space;

    const isMuted = currentMutedSpaceChats.has(space.slug);
    const muteBtn = $('messagesMuteChatBtn');
    if (muteBtn) {
      muteBtn.hidden = false;
      muteBtn.classList.toggle('is-muted', isMuted);
      $('messagesMuteIcon').textContent = isMuted ? '🔕' : '🔔';
      $('messagesMuteLabel').textContent = isMuted ? tr('Muted', 'مكتوم') : tr('Mute', 'كتم');
    }

    $('messagesList').innerHTML = '<div class="post-skeleton short"></div>';
    const messagesQuery = query(collection(db, 'communitySpaces', space.slug, 'messages'), orderBy('createdAt', 'desc'), limit(30));
    let firstMessagePage = true;
    unsubscribeSpaceMessages = onSnapshot(messagesQuery, snapshot => {
      const list = $('messagesList');
      const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      liveSpaceMessages = snapshot.docs.map(item => ({id:item.id, ...item.data()})).reverse();
      const liveIds = new Set(liveSpaceMessages.map(message => message.id));
      olderSpaceMessages = olderSpaceMessages.filter(message => !liveIds.has(message.id));
      if (firstMessagePage) {
        oldestSpaceMessageCursor = snapshot.docs.at(-1) || null;
        hasOlderSpaceMessages = snapshot.size === 30;
      }
      paintSpaceMessages(combineSpaceMessagePages(), space, {scrollToBottom:firstMessagePage || wasNearBottom}).catch(console.error);
      firstMessagePage = false;
    }, error => {
      console.warn('[Community] Direct conversation messages unavailable.', error);
      $('messagesPanel').hidden = true;
      $('messagesGate').hidden = false;
      $('messagesGate').innerHTML = '<p class="notice error">' + tr('Could not load conversation messages.','تعذر تحميل رسائل المحادثة.') + '</p>';
    });
    const readsQuery = query(collection(db, 'communitySpaces', space.slug, 'messageReads'), orderBy('seenAt', 'desc'), limit(500));
    unsubscribeSpaceMessageReads = onSnapshot(readsQuery, snapshot => {
      activeSpaceMessageReads = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
      repaintActiveSpaceMessages().catch(console.error);
    }, error => console.warn('[Community] Seen receipts unavailable.', error));
    return;
  }
  const manager = canManageSpace(space.slug);
  if (space.chatEnabled !== true) {
    $('messagesGate').hidden = false;
    $('messagesGate').innerHTML = manager
      ? '<div class="messages-enable-card"><span>◯</span><h2>' + tr('Add Messages to this space','أضف الرسائل إلى هذه المساحة') + '</h2><p>' + tr('This is permanent. Messages cannot be disabled or deleted after the channel is created.','هذا الإجراء دائم. لا يمكن تعطيل الرسائل أو حذفها بعد إنشاء القناة.') + '</p><button id="enableSpaceMessages" type="button">' + tr('Enable Messages','تفعيل الرسائل') + '</button></div>'
      : '<p class="notice">' + tr('This space does not have Messages yet.','لا تحتوي هذه المساحة على رسائل بعد.') + '</p>';
    $('enableSpaceMessages')?.addEventListener('click', async event => {
      if (!confirm(tr('Enable permanent Messages for this space? The channel cannot be removed later.','تفعيل رسائل دائمة لهذه المساحة؟ لا يمكن إزالة القناة لاحقاً.'))) return;
      event.currentTarget.disabled = true;
      try {
        await callFunction('setCommunitySpaceConnection', {operation:'enable_space_chat', spaceId:space.slug});
        communityAreas[space.slug] = {...space, chatEnabled:true};
        await openSpaceMessages(communityAreas[space.slug]);
      } catch (error) { console.error(error); showToast(error.message || tr('Messages could not be enabled.','تعذر تفعيل الرسائل.')); event.currentTarget.disabled = false; }
    });
    return;
  }
  if (!canAccessSpaceChat(space)) {
    $('messagesGate').hidden = false;
    const connected = connectedSpaceSlugs.has(space.slug);
    const [accessSnapshot, chatRequestSnapshot] = await Promise.all([
      getDoc(doc(db, 'communitySpaces', space.slug, 'access', currentUser.uid)).catch(() => null),
      getDoc(doc(db, 'communitySpaces', space.slug, 'chatAccessRequests', currentUser.uid)).catch(() => null)
    ]);
    const messageBanned = accessSnapshot?.data()?.chatBanned === true;
    const requestPending = chatRequestSnapshot?.data()?.status === 'pending';
    if (messageBanned) {
      $('messagesGate').innerHTML = '<div class="messages-enable-card"><span aria-hidden="true">!</span><h2>' + tr('Messages access removed','تمت إزالة وصول الرسائل') + '</h2><p class="notice error">' + tr('You are banned from this space’s Messages. You can ask an administrator to restore access.', 'أنت محظور من رسائل هذه المساحة. يمكنك طلب استعادة الوصول من المشرف.') + '</p><button type="button" data-request-chat-access>' + tr('Request Messages access','طلب الوصول إلى الرسائل') + '</button></div>';
      const requestButton = $('messagesGate').querySelector('[data-request-chat-access]');
      if (requestPending && requestButton) { requestButton.disabled = true; requestButton.textContent = tr('Request pending','الطلب قيد المراجعة'); }
      requestButton?.addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try {
          const result = await callFunction('setCommunitySpaceConnection', {operation:'request_space_chat_access', spaceId:space.slug});
          event.currentTarget.textContent = result.status === 'pending' ? tr('Request pending','الطلب قيد المراجعة') : tr('Messages approved','تمت الموافقة على الرسائل');
        } catch (error) {
          showToast(error.message || tr('Messages request could not be sent.','تعذر إرسال طلب الرسائل.'));
          event.currentTarget.disabled = false;
        }
      });
      return;
    }
    $('messagesGate').innerHTML = '<div class="messages-enable-card"><span aria-hidden="true">◯</span><h2>' + tr(connected ? 'Messages approval required' : 'Connect first', connected ? 'مطلوب تصريح الرسائل' : 'اتصل أولاً') + '</h2><p>' + tr(connected ? 'A space administrator must approve your Messages access.' : 'Connect to this space before requesting Messages access.', connected ? 'يجب أن يوافق مشرف المساحة على وصولك إلى الرسائل.' : 'اتصل بهذه المساحة قبل طلب الوصول إلى الرسائل.') + '</p>' + (connected ? '<button type="button" data-request-chat-access>' + tr('Request Messages access','طلب الوصول إلى الرسائل') + '</button>' : '') + '</div>';
    const normalRequestButton = $('messagesGate').querySelector('[data-request-chat-access]');
    if (requestPending && normalRequestButton) { normalRequestButton.disabled = true; normalRequestButton.textContent = tr('Request pending','الطلب قيد المراجعة'); }
    normalRequestButton?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { const result = await callFunction('setCommunitySpaceConnection', {operation:'request_space_chat_access', spaceId:space.slug}); event.currentTarget.textContent = result.status === 'approved' ? tr('Messages approved','تمت الموافقة على الرسائل') : tr('Request pending','الطلب قيد المراجعة'); }
      catch (error) { showToast(error.message || tr('Messages request could not be sent.','تعذر إرسال طلب الرسائل.')); event.currentTarget.disabled = false; }
    });
    return;
  }
  $('messagesPanel').hidden = false;
  activeMessagesSpace = space;

  // Update Mute Chat button state for this space
  const isMuted = currentMutedSpaceChats.has(space.slug);
  const muteBtn = $('messagesMuteChatBtn');
  if (muteBtn) {
    muteBtn.hidden = false;
    muteBtn.classList.toggle('is-muted', isMuted);
    $('messagesMuteIcon').textContent = isMuted ? '🔕' : '🔔';
    $('messagesMuteLabel').textContent = isMuted ? tr('Muted', 'مكتوم') : tr('Mute', 'كتم');
  }

  // Update Global Muted Notice
  const globalMutedNotice = $('messagesGlobalMutedNotice');
  if (globalMutedNotice) {
    const isGlobalOff = currentNotificationPreferences.chatMessages === false;
    globalMutedNotice.hidden = !isGlobalOff;
  }

  unsubscribeSpaceAccess = onSnapshot(doc(db, 'communitySpaces', space.slug, 'access', currentUser.uid), snapshot => {
    const access = snapshot.data() || {};
    if (snapshot.exists() && access.canUseChat === true && access.blocked !== true && access.chatBanned !== true) return;
    if (activeMessagesSpace?.slug !== space.slug) return;
    stopSpaceMessages();
    $('messagesPanel').hidden = true;
    $('messagesGate').hidden = false;
    $('messagesGate').innerHTML = '<p class="notice error">' + tr('Your Messages access was revoked by the server.','تم إلغاء وصولك إلى الرسائل من الخادم.') + '</p>';
  }, error => console.warn('[Community] Server access status unavailable.', error));
  await updateChatPresence(space.slug);
  chatPresenceTimer = window.setInterval(() => updateChatPresence(space.slug), 45 * 1000);
  const presenceQuery = query(collection(db, 'communitySpaces', space.slug, 'chatPresence'), orderBy('activeAt', 'desc'), limit(24));
  unsubscribeSpaceChatPresence = onSnapshot(presenceQuery, snapshot => {
    activeChatPresence = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    renderChatPresence().catch(error => console.warn('[Community] Chat presence could not be rendered.', error));
  }, error => console.warn('[Community] Chat presence unavailable.', error));
  $('messagesList').innerHTML = '<div class="post-skeleton short"></div>';
  const messagesQuery = query(collection(db, 'communitySpaces', space.slug, 'messages'), orderBy('createdAt', 'desc'), limit(30));
  let firstMessagePage = true;
  unsubscribeSpaceMessages = onSnapshot(messagesQuery, snapshot => {
    const list = $('messagesList');
    const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    liveSpaceMessages = snapshot.docs.map(item => ({id:item.id, ...item.data()})).reverse();
    const liveIds = new Set(liveSpaceMessages.map(message => message.id));
    olderSpaceMessages = olderSpaceMessages.filter(message => !liveIds.has(message.id));
    if (firstMessagePage) {
      oldestSpaceMessageCursor = snapshot.docs.at(-1) || null;
      hasOlderSpaceMessages = snapshot.size === 30;
    }
    paintSpaceMessages(combineSpaceMessagePages(), space, {scrollToBottom:firstMessagePage || wasNearBottom}).catch(console.error);
    firstMessagePage = false;
  }, error => {
    console.warn('[Community] Space messages unavailable.', error);
    $('messagesPanel').hidden = true;
    $('messagesGate').hidden = false;
    $('messagesGate').innerHTML = '<p class="notice error">' + tr('You cannot access these space messages. You may have been removed from the chat.','لا يمكنك الوصول إلى رسائل هذه المساحة. ربما تمت إزالتك من الدردشة.') + '</p>';
  });
  const readsQuery = query(collection(db, 'communitySpaces', space.slug, 'messageReads'), orderBy('seenAt', 'desc'), limit(500));
  unsubscribeSpaceMessageReads = onSnapshot(readsQuery, snapshot => {
    activeSpaceMessageReads = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    repaintActiveSpaceMessages().catch(console.error);
  }, error => console.warn('[Community] Seen receipts unavailable.', error));
}

function recordSpaceChatInteraction(slug) {
  if (!slug) return;
  try {
    let recents = JSON.parse(localStorage.getItem('aias_recent_space_chats') || '[]');
    recents = [slug, ...recents.filter(s => s !== slug)].slice(0, 25);
    localStorage.setItem('aias_recent_space_chats', JSON.stringify(recents));
  } catch {}
}

function getRecentSpaceChatSlugs() {
  try {
    return JSON.parse(localStorage.getItem('aias_recent_space_chats') || '[]');
  } catch {
    return [];
  }
}

async function sendSpaceMessage(spaceId, {text = '', replyToId = '', sharedPostId = '', imagePath = '', audioPath = '', audioDurationMs = 0} = {}) {
  recordSpaceChatInteraction(spaceId);
  return callFunction('setCommunitySpaceConnection', {operation:'send_space_message', spaceId, text, replyToId, sharedPostId, imagePath, audioPath, audioDurationMs});
}

let aiTypingTimer = null;

function showAiTypingIndicator() {
  hideAiTypingIndicator();
  if (!activeMessagesSpace) return;
  const list = $('messagesList');
  if (!list) return;
  const name = tr('AIAS AI Assistant', 'مساعد AIAS الذكي');
  const label = tr('AI Assistant is typing…', 'المساعد الذكي يكتب ردّاً…');
  const html = '<article class="space-message ai-typing-message" id="aiTypingIndicator"><a class="space-message-avatar"><div class="avatar ai-avatar-badge"><span>AI</span></div></a><div><div class="space-message-body"><div class="space-message-meta"><a>' + escapeHtml(name) + '</a><span class="ai-badge-pill">AI</span></div><div class="ai-typing-bubble"><span class="ai-typing-dots"><i></i><i></i><i></i></span><small>' + escapeHtml(label) + '</small></div></div></div></article>';
  list.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  aiTypingTimer = window.setTimeout(hideAiTypingIndicator, 60000);
}

function hideAiTypingIndicator() {
  if (aiTypingTimer) { window.clearTimeout(aiTypingTimer); aiTypingTimer = null; }
  $('aiTypingIndicator')?.remove();
}

function appendPendingChatMessage({text = '', imageUrl = '', audioUrl = '', audioDurationMs = 0} = {}) {
  const id = 'pending-' + (crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2));
  const name = currentProfile?.displayName || currentUser?.displayName || tr('You','أنت');
  const photo = currentProfile?.photoBase64 || currentProfile?.photoURL || currentUser?.photoURL || '';
  const media = imageUrl ? '<div class="chat-message-image pending"><img src="' + escapeHtml(imageUrl) + '" alt=""></div>' : audioUrl ? '<div class="chat-message-audio pending"><span class="chat-message-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><small>' + Math.max(1, Math.ceil(audioDurationMs / 1000)) + 's</small></div>' : '';
  $('messagesList').insertAdjacentHTML('beforeend', '<article class="space-message mine pending-message" data-pending-message="' + id + '"><a class="space-message-avatar">' + avatarMarkup(name, photo, 'avatar', currentProfile?.verified === true) + '</a><div><div class="space-message-body"><div class="space-message-meta"><a>' + escapeHtml(name) + '</a><span data-pending-status>◌ ' + tr('Sending…','جارٍ الإرسال…') + '</span></div>' + (text ? '<div class="space-message-text">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>' : '') + media + '</div></div></article>');
  requestAnimationFrame(() => { $('messagesList').scrollTop = $('messagesList').scrollHeight; });
  return id;
}

function updatePendingChatMessage(id, label, failed = false) {
  const item = $('messagesList').querySelector('[data-pending-message="' + CSS.escape(id) + '"]');
  const status = item?.querySelector('[data-pending-status]');
  if (status) status.textContent = (failed ? '!' : '◌') + ' ' + label;
  item?.classList.toggle('failed', failed);
  return item;
}

function eligibleChatSpaces() {
  const list = Object.values(communityAreas).filter(area => area.chatEnabled === true && canAccessSpaceChat(area));
  list.unshift({
    slug: 'aias-assistant',
    name: tr('AIAS AI Assistant', 'مساعد AIAS الذكي'),
    symbol: 'AI',
    chatEnabled: true,
    isPrivate: false,
    description: tr('Ask the AI assistant about architecture, projects, or community topics', 'استشر المساعد الذكي في العمارة والمشاريع ومواضيع المجتمع')
  });
  return list;
}

async function loadChatInbox() {
  chatInboxPresenceUnsubscribers.forEach(unsubscribe => unsubscribe());
  chatInboxPresenceUnsubscribers = [];
  const gate = $('chatInboxGate');
  const list = $('chatInboxList');
  if (!currentUser) {
    gate.innerHTML = '<p class="notice">' + tr('Sign in to see your space messages.','سجّل الدخول لعرض رسائل مساحاتك.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    list.innerHTML = '';
    return;
  }
  gate.innerHTML = '';
  list.innerHTML = '<div class="post-skeleton short"></div>';
  const candidates = Object.values(communityAreas).filter(area => area.chatEnabled === true && (canAccessSpaceChat(area) || connectedSpaceSlugs.has(area.slug)));
  const accessRecords = await Promise.all(candidates.map(async area => {
    const snapshot = await getDoc(doc(db, 'communitySpaces', area.slug, 'access', currentUser.uid)).catch(() => null);
    return [area.slug, snapshot?.data() || {}];
  }));
  const accessBySpace = new Map(accessRecords);
  const hasServerChatAccess = area => {
    const access = accessBySpace.get(area.slug) || {};
    return access.canUseChat === true && access.blocked !== true && access.chatBanned !== true;
  };
  const allowed = candidates
    .filter(area => hasServerChatAccess(area) || accessBySpace.get(area.slug)?.chatBanned === true)
    .sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug), currentLanguage));

  let directSpaces = [];
  try {
    const dmSnap = await getDocs(query(
      collection(db, 'communitySpaces'),
      where('isDirectMessage', '==', true),
      where('directParticipants', 'array-contains', currentUser.uid),
      limit(25)
    ));
    directSpaces = await Promise.all(dmSnap.docs.map(async d => {
      const data = d.data();
      const otherUid = (Array.isArray(data.directParticipants) ? data.directParticipants : []).find(id => id !== currentUser.uid) || d.id.replace(/^dm-/, '').split('-').find(id => id !== currentUser.uid);
      const otherProf = otherUid ? await getProfile(otherUid) : null;
      return {
        slug: d.id,
        id: d.id,
        ...data,
        otherUid,
        otherProfile: otherProf
      };
    }));
  } catch (err) {
    console.warn('[Community] DM inbox load error:', err);
  }

  const directInboxItems = directSpaces.map(dm => {
    const prof = dm.otherProfile || {};
    const isBiz = prof.isBusiness === true && prof.businessStatus === 'active';
    let name = prof.displayName || prof.username || 'Member';
    if (isBiz && prof.businessName) name = prof.businessName;
    const title = isBiz ? tr('Verified Studio & Practice', 'استوديو وممارسة معتمدة') : (prof.professionalTitle || tr('Direct Conversation', 'محادثة مباشرة'));
    const isMuted = currentMutedSpaceChats.has(dm.slug);
    const mutedIndicator = isMuted ? '<span class="chat-muted-indicator" title="' + tr('Muted', 'مكتوم') + '">🔕</span>' : '';
    const bizBadge = isBiz ? ' <span class="pro-verified-badge-mini" title="Verified Practice">✓</span>' : '';
    return '<a class="chat-inbox-item' + (isMuted ? ' is-muted' : '') + '" href="/community.html?view=messages&amp;area=' + encodeURIComponent(dm.slug) + '" data-chat-inbox-space="' + escapeHtml(dm.slug) + '" data-chat-search="' + escapeHtml((name + ' ' + title).toLowerCase()) + '">' +
      avatarMarkup(name, prof.photoBase64 || prof.photoURL, 'chat-inbox-avatar', isBiz) +
      '<span class="chat-inbox-copy"><span class="chat-inbox-title"><strong>' + escapeHtml(name) + bizBadge + '</strong>' + mutedIndicator + '<time></time></span><small data-chat-preview>' + tr('Loading conversation…','جارٍ تحميل المحادثة…') + '</small></span><span class="chat-inbox-status"><b class="chat-unread-count" hidden></b><i class="chat-inbox-dot" hidden></i></span></a>';
  }).join('');

  const aiInboxItem = '<a class="chat-inbox-item ai-assistant-inbox-item" href="/community.html?view=messages&amp;area=aias-assistant" data-chat-inbox-space="aias-assistant" data-chat-search="ai assistant ذكاء اصطناعي مساعد"><div class="chat-inbox-avatar ai-avatar-badge"><span>AI</span></div><span class="chat-inbox-copy"><span class="chat-inbox-title"><strong>' + tr('AIAS AI Assistant', 'مساعد AIAS الذكي') + '</strong><span class="ai-badge-pill">AI</span><time></time></span><small data-chat-preview>' + tr('Ask questions, analyze projects, or get design feedback…', 'اطرح أسئلة، حلل المشاريع، أو احصل على استشارات تصميمية…') + '</small></span><span class="chat-inbox-status"><i class="chat-inbox-dot" hidden></i></span></a>';

  list.innerHTML = aiInboxItem + directInboxItems + (allowed.length ? allowed.map(area => {
    const banned = accessBySpace.get(area.slug)?.chatBanned === true;
    const isMuted = currentMutedSpaceChats.has(area.slug) || currentNotificationPreferences.chatMessages === false;
    const mutedIndicator = isMuted ? '<span class="chat-muted-indicator" title="' + tr('Muted', 'مكتوم') + '">🔕</span>' : '';
    return '<a class="chat-inbox-item' + (banned ? ' chat-banned' : '') + (isMuted ? ' is-muted' : '') + '" href="/community.html?view=messages&amp;area=' + encodeURIComponent(area.slug) + '" data-chat-inbox-space="' + escapeHtml(area.slug) + '" data-chat-search="' + escapeHtml((area.name + ' ' + area.slug).toLowerCase()) + '">' + spaceVisual(area, 'chat-inbox-avatar') + '<span class="chat-inbox-copy"><span class="chat-inbox-title"><strong>' + escapeHtml(area.name || area.slug) + '</strong>' + mutedIndicator + '<time></time></span><small data-chat-preview>' + (banned ? tr('Banned from this space’s Messages','محظور من رسائل هذه المساحة') : tr('Loading conversation…','جارٍ تحميل المحادثة…')) + '</small></span><span class="chat-inbox-status">' + (banned ? '<b class="chat-banned-badge">' + tr('Banned','محظور') + '</b>' : '<span class="chat-inbox-online" hidden></span><b class="chat-unread-count" hidden></b><i class="chat-inbox-dot" hidden></i>') + '</span></a>';
  }).join('') : '');
  const readable = allowed.filter(hasServerChatAccess);
  readable.forEach(area => {
    const presenceQuery = query(collection(db, 'communitySpaces', area.slug, 'chatPresence'), orderBy('activeAt', 'desc'), limit(8));
    const unsubscribe = onSnapshot(presenceQuery, async snapshot => {
      const row = list.querySelector('[data-chat-inbox-space="' + CSS.escape(area.slug) + '"]');
      const host = row?.querySelector('.chat-inbox-online');
      if (!host) return;
      const online = snapshot.docs.map(item => item.data()).filter(item => item.userId && Date.now() - (spaceTimestamp(item.activeAt) * 1000) < 90 * 1000);
      if (!online.length) { host.hidden = true; host.innerHTML = ''; return; }
      const profiles = await Promise.all(online.slice(0, 3).map(async item => ({item, profile:await getProfile(item.userId)})));
      if (!list.contains(row)) return;
      host.hidden = false;
      host.title = tr(online.length === 1 ? '1 member online now' : online.length + ' members online now', online.length === 1 ? 'عضو واحد متصل الآن' : online.length + ' أعضاء متصلون الآن');
      host.innerHTML = profiles.map(({profile}) => avatarMarkup(profile.displayName || profile.username || tr('Member','عضو'), profile.photoBase64 || profile.photoURL, 'avatar', profile.verified === true)).join('') + (online.length > 3 ? '<b>+' + (online.length - 3) + '</b>' : '');
    }, error => console.warn('[Community] Chat inbox presence unavailable.', error));
    chatInboxPresenceUnsubscribers.push(unsubscribe);
  });
  [...readable, ...directSpaces].forEach(async area => {
    try {
      const snapshot = await getDocs(query(collection(db, 'communitySpaces', area.slug, 'messages'), orderBy('createdAt', 'desc'), limit(1)));
      const item = snapshot.docs[0];
      const row = list.querySelector('[data-chat-inbox-space="' + CSS.escape(area.slug) + '"]');
      if (!row) return;
      if (!item) { row.querySelector('[data-chat-preview]').textContent = tr('Start the conversation','ابدأ المحادثة'); return; }
      const message = item.data();
      row.querySelector('[data-chat-preview]').textContent = (message.senderId === currentUser.uid ? tr('You: ','أنت: ') : '') + (message.text || (message.audioPath ? tr('Voice message','رسالة صوتية') : message.imagePath ? tr('Photo','صورة') : tr('Shared post','منشور مُشارك'))).slice(0, 90);
      row.querySelector('time').textContent = formatDate(message.createdAt);
      const active = message.senderId !== currentUser.uid;
      row.classList.toggle('has-activity', active);
      row.querySelector('.chat-inbox-dot').hidden = !active;
      const receipt = await getDoc(doc(db, 'communitySpaces', area.slug, 'messageReads', currentUser.uid));
      const unread = message.senderId !== currentUser.uid && (!receipt.exists() || receipt.data().lastMessageId !== item.id);
      const badge = row.querySelector('.chat-unread-count');
      badge.hidden = !unread;
      if (unread) badge.textContent = '1';
    } catch (error) { console.warn('[Community] Latest chat message unavailable.', error); }
  });
  if (currentUser) {
    getDocs(query(collection(db, 'users', currentUser.uid, 'aiMessages'), orderBy('createdAt', 'desc'), limit(1)))
      .then(snapshot => {
        const item = snapshot.docs[0];
        const row = list.querySelector('[data-chat-inbox-space="aias-assistant"]');
        if (!row || !item) return;
        const message = item.data();
        row.querySelector('[data-chat-preview]').textContent = (message.senderId === currentUser.uid ? tr('You: ','أنت: ') : '') + (message.text || tr('Shared post','منشور مُشارك')).slice(0, 90);
        if (message.createdAt) row.querySelector('time').textContent = formatDate(message.createdAt);
      })
      .catch(err => console.warn('[Community] AI last message preview error:', err));
  }
}

function stopChatInboxPresence() {
  chatInboxPresenceUnsubscribers.forEach(unsubscribe => unsubscribe());
  chatInboxPresenceUnsubscribers = [];
}

function openPostShareDialog(post) {
  activeSharePost = post;
  $('postShareName').textContent = post.title;
  const searchInput = $('postShareSearch');
  if (searchInput) searchInput.value = '';

  const allSpaces = eligibleChatSpaces();
  const recentSlugs = getRecentSpaceChatSlugs();

  // Order: last interacted spaces first, followed by alphabetical
  allSpaces.sort((a, b) => {
    const idxA = recentSlugs.indexOf(a.slug);
    const idxB = recentSlugs.indexOf(b.slug);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return String(a.name || a.slug).localeCompare(String(b.name || b.slug), currentLanguage);
  });

  const renderShareSpaces = (query = '') => {
    const container = $('postShareSpaces');
    if (!container) return;
    const q = query.trim().toLowerCase();
    let displaySpaces = allSpaces;
    let isSearch = false;

    if (q) {
      isSearch = true;
      displaySpaces = allSpaces.filter(area =>
        (area.name || '').toLowerCase().includes(q) ||
        (area.slug || '').toLowerCase().includes(q) ||
        (area.description || '').toLowerCase().includes(q)
      );
    } else {
      displaySpaces = allSpaces.slice(0, 3);
    }

    if (!allSpaces.length) {
      container.innerHTML = '<p class="notice">' + tr('Connect to a space with Messages enabled to send posts there.','اتصل بمساحة مفعّلة فيها الرسائل لإرسال المنشورات إليها.') + '</p>';
      return;
    }

    if (!displaySpaces.length) {
      container.innerHTML = '<p class="notice" style="margin:14px 0; text-align:center; font-size:.78rem;">' + tr('No matching chats found.','لم يتم العثور على محادثات مطابقة.') + '</p>';
      return;
    }

    const labelHtml = !isSearch && allSpaces.length > 3
      ? '<div class="post-share-recent-label"><span>' + tr('Recent chats', 'أحدث المحادثات') + '</span></div>'
      : '';

    container.innerHTML = labelHtml + displaySpaces.map(area =>
      '<button type="button" data-share-chat="' + escapeHtml(area.slug) + '">' +
        spaceVisual(area, 'post-share-space-image') +
        '<span><strong>' + escapeHtml(area.name || area.slug) + '</strong><small>a/' + escapeHtml(area.slug) + '</small></span>' +
        '<b>→</b>' +
      '</button>'
    ).join('');

    container.querySelectorAll('[data-share-chat]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await sendSpaceMessage(button.dataset.shareChat, {sharedPostId: post.id});
        recordSpaceChatInteraction(button.dataset.shareChat);
        $('postShareDialog').close();
        showToast(tr('Post sent to space messages.','تم إرسال المنشور إلى رسائل المساحة.'));
      } catch (error) {
        console.error(error);
        showToast(error.message || tr('The post could not be sent.','تعذر إرسال المنشور.'));
        button.disabled = false;
      }
    }));
  };

  renderShareSpaces('');

  if (searchInput) {
    searchInput.oninput = (e) => renderShareSpaces(e.target.value);
  }

  $('postShareDialog').showModal();
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 80);
  }
}

function loginUrl() {
  const returnPath = location.pathname.replace(/^\/+/, '') + location.search;
  return '/login.html?next=' + encodeURIComponent(returnPath);
}

function setActiveNavigation(viewName) {
  document.querySelectorAll('[data-route]').forEach(link => {
    link.classList.toggle('active', link.dataset.route === viewName || (viewName === 'manage-profile' && link.dataset.route === 'profile') || (viewName === 'space' && link.dataset.route === 'post'));
  });
}

let currentActiveViewName = null;
const VIEW_TAB_ORDER = ['home', 'spaces', 'post', 'profile', 'manage-profile', 'chats', 'messages', 'selected'];

function showView(name) {
  const prevName = currentActiveViewName;
  currentActiveViewName = name;
  const prevIdx = prevName ? VIEW_TAB_ORDER.indexOf(prevName) : -1;
  const nextIdx = VIEW_TAB_ORDER.indexOf(name);
  const swipeClass = (prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx)
    ? (nextIdx > prevIdx ? (isArabic() ? 'swipe-in-left' : 'swipe-in-right') : (isArabic() ? 'swipe-in-right' : 'swipe-in-left'))
    : '';

  document.querySelectorAll('.view').forEach(view => {
    const isTarget = view.id === name + 'View';
    view.hidden = !isTarget;
    view.classList.remove('swipe-in-right', 'swipe-in-left');
    if (isTarget && swipeClass && window.innerWidth <= 699) {
      view.classList.add(swipeClass);
    }
  });
  setActiveNavigation(name);
}

function navigateTo(url, replace) {
  // Guard: warn about unsaved changes before SPA navigation
  if (unsavedFormId && !confirmDiscardUnsaved()) return;
  const next = new URL(url, location.href);
  history[replace ? 'replaceState' : 'pushState']({}, '', next.pathname + next.search + next.hash);
  handleRoute(true);
}

/* ─── UNSAVED CHANGES SYSTEM ─────────────────────────────────────────────── */
let unsavedFormId = null;         // which form is currently dirty
let unsavedSaveFn = null;         // function to call when Save is clicked
let unsavedDiscardFn = null;      // function to call when Discard is clicked
let _beforeUnloadHandler = null;

function markDirty(formId, label, saveFn, discardFn) {
  unsavedFormId   = formId;
  unsavedSaveFn   = saveFn   || null;
  unsavedDiscardFn = discardFn || null;
  const banner = $('unsavedBanner');
  if (!banner) return;
  const lbl = $('unsavedBannerLabel');
  if (lbl) lbl.textContent = label || (isArabic() ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes');
  banner.hidden = false;
  // Browser tab close / refresh warning
  if (!_beforeUnloadHandler) {
    _beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', _beforeUnloadHandler);
  }
}

function clearDirty() {
  unsavedFormId    = null;
  unsavedSaveFn    = null;
  unsavedDiscardFn = null;
  const banner = $('unsavedBanner');
  if (banner) banner.hidden = true;
  if (_beforeUnloadHandler) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
    _beforeUnloadHandler = null;
  }
}

function confirmDiscardUnsaved() {
  if (!unsavedFormId) return true;
  const msg = isArabic()
    ? 'لديك تغييرات غير محفوظة. هل تريد الخروج؟'
    : 'You have unsaved changes. Leave without saving?';
  if (!confirm(msg)) return false;
  if (unsavedDiscardFn) unsavedDiscardFn();
  clearDirty();
  return true;
}

// Wire banner buttons once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  $('unsavedBannerSave')?.addEventListener('click', () => {
    if (unsavedSaveFn) unsavedSaveFn();
  });
  $('unsavedBannerDiscard')?.addEventListener('click', () => {
    if (confirmDiscardUnsaved()) clearDirty();
  });
}, { once: true });

async function handleRoute(scrollToTop) {
  const sequence = ++routeSequence;
  stopSpaceMessages();
  stopChatInboxPresence();
  unsubscribeAreaAccess?.();
  unsubscribeAreaChatRequest?.();
  unsubscribeInlineComments?.();
  unsubscribeAreaAccess = null;
  unsubscribeAreaChatRequest = null;
  unsubscribeInlineComments = null;
  if (communityDataReady) await communityDataReady;
  const params = new URLSearchParams(location.search);
  const pathRoute = getPathRoute();
  const selectedPostId = params.get('post');
  const requestedView = params.get('view');
  if (requestedView === 'selected') { location.replace('/portfolios.html'); return; }
  const publicProfileRoute = pathRoute.profile || params.get('user');
  const requestedArea = pathRoute.area || params.get('area');
  activeAreaSlug = requestedArea && communityAreas[requestedArea] && !blockedSpaceSlugs.has(requestedArea) ? requestedArea : null;
  const view = publicProfileRoute || requestedView === 'profile' ? 'profile' : requestedView === 'messages' ? 'messages' : requestedView === 'chats' ? 'chats' : requestedView === 'manage-profile' ? 'manage-profile' : requestedView === 'connections' ? 'connections' : requestedView === 'manage-spaces' ? 'manage-spaces' : requestedView === 'selected' ? 'selected' : requestedView === 'spaces' ? 'spaces' : requestedView === 'post' ? 'post' : requestedView === 'space' ? 'space' : 'home';
  document.body.classList.toggle('messages-fullscreen', view === 'messages');
  document.body.classList.toggle('profile-setup-fullscreen', view === 'profile' && (requestedView === 'profile' || currentUser?.uid === publicProfileRoute) && currentProfile?.profileComplete !== true);
  const isPortfoliosPage = location.pathname.endsWith('/portfolios.html') || location.pathname.endsWith('portfolios.html') || location.pathname.endsWith('/projects.html') || location.pathname.endsWith('projects.html');
  const savedFeedMode = localStorage.getItem('communityFeedMode');
  feedMode = isPortfoliosPage ? 'projects' : (currentUser ? (params.has('feed') ? (['discover','projects'].includes(params.get('feed')) ? params.get('feed') : 'following') : (['discover','projects'].includes(savedFeedMode) ? savedFeedMode : 'following')) : (params.get('feed') === 'projects' ? 'projects' : 'discover'));
  if (!isPortfoliosPage) localStorage.setItem('communityFeedMode', feedMode);
  if (!params.has('comments')) closeCommentsUi();
  showView(view);
  updateMobilePromptVisibility();
  if (scrollToTop) window.scrollTo({top:0, behavior:'smooth'});

  if (view === 'home') {
    const restrictedArea = Boolean(activeAreaSlug && communityAreas[activeAreaSlug]?.isPrivate && !canAccessPrivateSpace(communityAreas[activeAreaSlug]));
    $('detailContext').hidden = !selectedPostId;
    const detailBack = $('detailContext').querySelector('a');
    if (detailBack) detailBack.href = selectedPostId && params.get('return') === 'messages' && activeAreaSlug ? '/community.html?view=messages&area=' + encodeURIComponent(activeAreaSlug) : '/';
    $('areaHeader').hidden = Boolean(selectedPostId) || !activeAreaSlug;
    document.querySelector('.welcome-card').hidden = Boolean(selectedPostId) || Boolean(activeAreaSlug);
    $('quickComposer').hidden = Boolean(selectedPostId) || restrictedArea;
    document.querySelector('.feed-toolbar').hidden = Boolean(selectedPostId) || restrictedArea;
    $('feedModeBar').hidden = Boolean(selectedPostId) || Boolean(activeAreaSlug);
    document.querySelectorAll('[data-feed-mode]').forEach(button => button.classList.toggle('active', button.dataset.feedMode === feedMode));
    document.querySelectorAll('[data-sort]').forEach(button => button.classList.toggle('active', button.dataset.sort === communitySort));
    document.querySelectorAll('[data-type]').forEach(button => button.classList.toggle('active', button.dataset.type === communityType));
    $('feedModeTitle').textContent = feedMode === 'discover' ? tr('Discover','اكتشف') : tr('Connections','التواصلات');
    if (activeAreaSlug) {
      const area = communityAreas[activeAreaSlug];
      renderActiveAreaHeader(area);
      document.querySelector('.feed-heading h2').textContent = isArabic() ? 'منشورات ' + area.name : area.name + ' posts';
      document.title = 'a/' + activeAreaSlug + (isArabic() ? ' — مجتمع AIAS البصرة' : ' — AIAS Basra Community');
    } else {
      $('areaManage').hidden = true;
      $('areaConnect').hidden = true;
      document.querySelector('.feed-heading h2').textContent = feedMode === 'discover' ? tr('Discover feed','خلاصة الاكتشاف') : tr('From your connections','من تواصلاتك');
      document.title = selectedPostId ? tr('Post — AIAS Basra Community','منشور — مجتمع AIAS البصرة') : tr('Community — AIAS Basra','مجتمع AIAS البصرة');
    }
    if ($('posts')) $('posts').hidden = restrictedArea;
    renderPrivateSpaceGate(activeAreaSlug && !selectedPostId ? communityAreas[activeAreaSlug] : null);
    if (!restrictedArea) {
      if (isPortfoliosPage) await loadPortfoliosHubPage();
      else await loadPosts();
    }
    if (sequence !== routeSequence) return;
    if (selectedPostId && params.get('comments') === '1') openComments(selectedPostId, false);
  } else if (view === 'chats') {
    document.title = tr('Messages — AIAS Basra Community','الرسائل — مجتمع AIAS البصرة');
    await loadChatInbox();
  } else if (view === 'messages') {
    const toUser = params.get('to') || params.get('user');
    let space = null;
    if (toUser && currentUser) {
      try {
        const res = await callFunction('openDirectConversation', { targetUid: toUser });
        if (res && res.space) {
          space = { slug: res.spaceId, ...res.space };
        }
      } catch (err) {
        console.error(err);
        $('messagesGate').hidden = false;
        $('messagesPanel').hidden = true;
        $('messagesGate').innerHTML = '<p class="notice error">' + escapeHtml(err?.message || tr('Could not open conversation.', 'تعذر فتح المحادثة.')) + '</p>';
        return;
      }
    } else if (requestedArea) {
      if (requestedArea === 'aias-assistant') {
        space = { slug:'aias-assistant', name:tr('AIAS AI Assistant','مساعد AIAS الذكي'), symbol:'AI', chatEnabled:true, isPrivate:false, active:true };
      } else if (requestedArea.startsWith('dm-')) {
        const dmSnap = await getDoc(doc(db, 'communitySpaces', requestedArea)).catch(() => null);
        if (dmSnap?.exists()) {
          space = { slug: requestedArea, ...dmSnap.data() };
        }
      } else {
        space = communityAreas[requestedArea];
      }
    }
    document.title = space ? ((space.name || tr('Direct Conversation', 'محادثة مباشرة')) + ' ' + tr('Messages','الرسائل')) : tr('Space messages','رسائل المساحة');
    if (space) {
      recordSpaceChatInteraction(space.slug);
      await openSpaceMessages(space);
    }
    else {
      $('messagesGate').hidden = false;
      $('messagesPanel').hidden = true;
      $('messagesGate').innerHTML = '<p class="notice error">' + tr('This conversation is unavailable.','هذه المحادثة غير متاحة.') + '</p>';
    }
  } else if (view === 'selected') {
    document.title = tr('Selected Projects — AIAS Basra Community','المشاريع المختارة — مجتمع AIAS البصرة');
    await loadSelectedShell();
  } else if (view === 'spaces') {
    document.title = tr('Discover Spaces — AIAS Basra Community','اكتشف المساحات — مجتمع AIAS البصرة');
    await loadSpaceDirectory();
  } else if (view === 'manage-profile') {
    document.title = tr('Manage Profile & Account — AIAS Basra Community','إدارة الملف والحساب — مجتمع AIAS البصرة');
    const tab = params.get('tab') || 'profile';
    await loadManageProfile(tab);
  } else if (view === 'profile') {
    const profileId = publicProfileRoute ? await resolveProfileId(publicProfileRoute) : currentUser?.uid || null;
    await loadProfile(profileId, Boolean(publicProfileRoute));
  } else if (view === 'connections') {
    document.title = tr('My Connections — AIAS Basra Community','تواصلاتي — مجتمع AIAS البصرة');
    await loadConnectionManager();
  } else if (view === 'manage-spaces') {
    document.title = tr('Manage My Spaces — AIAS Basra Community','إدارة مساحاتي — مجتمع AIAS البصرة');
    await loadManageSpaces();
  } else if (view === 'post') {
    const hasExternalShare = Boolean(params.get('marketKind') || params.get('marketId') || params.get('portfolioKind') || params.get('portfolioId'));
    const requestedType = hasExternalShare ? 'text' : (['text','question'].includes(params.get('type')) ? params.get('type') : $('postType').value);
    $('postType').value = requestedType;
    const requestedTypeChoice = document.querySelector('input[name="postTypeChoice"][value="' + requestedType + '"]');
    if (requestedTypeChoice) requestedTypeChoice.checked = true;
    renderPostTypeFields();
    $('postCommunity').value = activeAreaSlug ? 'a/' + activeAreaSlug : params.get('area') || 'main';
    validateCommunityHandle(true);
    renderPostGate();
    await loadComposerMarketShare(params);
    await loadComposerPortfolioShare(params);
  } else {
    renderSpaceGate();
  }
}

function renderPostActions(post) {
  const meta = post.meta || { mine: 0, score: 0, commentsCount: 0 };
  const communitySlug = communityAreas[post.communitySlug] ? post.communitySlug : 'main';
  const moderationActions = canManageSpace(communitySlug)
    ? '<div class="space-post-moderation"><button type="button" data-moderate-space-post="' + escapeHtml(post.id) + '|warn">' + tr('Warn post','تحذير المنشور') + '</button><button class="danger" type="button" data-moderate-space-post="' + escapeHtml(post.id) + '|delete">' + tr('Delete post','حذف المنشور') + '</button></div>'
    : '';
  return '<div class="post-actions">' +
    '<div class="vote-control" role="group" aria-label="' + tr('Post voting','تقييم المنشور') + '">' +
      '<button class="vote-arrow up ' + (meta.mine === 1 ? 'active' : '') + '" type="button" data-vote="1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="' + tr('Applaud this post','التصفيق لهذا المنشور') + '"><span aria-hidden="true">↑</span></button>' +
      '<b class="vote-score" data-vote-score="' + post.id + '">' + meta.score + '</b>' +
      '<button class="vote-arrow down ' + (meta.mine === -1 ? 'active' : '') + '" type="button" data-vote="-1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="' + tr('Show less like this','عرض محتوى أقل من هذا النوع') + '"><span aria-hidden="true">↓</span></button>' +
    '</div>' +
    '<button class="action-button" type="button" data-open-comments="' + post.id + '"><span class="action-icon" aria-hidden="true">◯</span><span>' + meta.commentsCount + ' ' + (isQuestion(post) ? (isArabic() ? 'إجابة' : meta.commentsCount === 1 ? 'answer' : 'answers') : (isArabic() ? 'تعليق' : meta.commentsCount === 1 ? 'comment' : 'comments')) + '</span></button>' +
    '<button class="action-button share" type="button" data-share="' + post.id + '"><span class="action-icon" aria-hidden="true">↗</span><span>' + tr('Share','مشاركة') + '</span></button>' +
    moderationActions +
  '</div>';
}

function marketAttachmentLink(attachment) {
  const kind = attachment?.kind === 'store' ? 'store' : attachment?.kind === 'item' ? 'item' : '';
  const id = String(attachment?.id || (kind === 'item' ? attachment?.itemId : attachment?.storeId) || '').trim();
  if (!kind || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return '';
  return kind === 'item'
    ? '/market.html?item=' + encodeURIComponent(id)
    : '/store.html?id=' + encodeURIComponent(id);
}

function safeMarketAttachmentImage(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, location.origin);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return url.protocol === 'https:' || localHttp || (url.origin === location.origin && url.protocol === location.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function renderMarketAttachment(attachment, composer = false) {
  const href = marketAttachmentLink(attachment);
  if (!href) return '';
  const isStore = attachment.kind === 'store';
  const title = String(attachment.title || attachment.storeName || tr('AIAS Market listing','عنصر في سوق AIAS')).trim();
  const description = String(attachment.description || '').trim();
  const image = safeMarketAttachmentImage(attachment.imageUrl) || '/static/images/branding/LOGO.png';
  const details = [
    attachment.tag,
    attachment.itemType,
    !isStore && attachment.quantity ? tr('Qty: ','الكمية: ') + attachment.quantity : '',
    !isStore && attachment.delivery ? '⚡ ' + attachment.delivery : ''
  ].filter(Boolean).slice(0, 4);
  const label = isStore ? tr('Market store','متجر في السوق') : tr('Market item','منتج في السوق');
  const action = isStore ? tr('Open store','فتح المتجر') : tr('View item','عرض المنتج');
  const cardStyle = 'display:grid;grid-template-columns:minmax(156px,32%) minmax(0,1fr);min-height:184px;overflow:hidden;margin:16px 0 8px;border:1px solid #ded4ca;border-radius:18px;color:#211a1b;background:#fffdfa;text-decoration:none;box-shadow:0 10px 26px rgba(61,17,21,.06)';
  const imageStyle = 'display:block;min-height:184px;overflow:hidden;background:#eee8df';
  const copyStyle = 'min-width:0;display:flex;flex-direction:column;align-items:flex-start;padding:17px 19px';
  return '<a class="market-echo-card market-post-attachment' + (composer ? ' composer-preview' : '') + '" data-market-echo="' + escapeHtml(attachment.kind) + '" style="' + cardStyle + '" href="' + escapeHtml(href) + '" aria-label="' + escapeHtml(action + ': ' + title) + '">' +
    '<span class="market-post-image" style="' + imageStyle + '"><img src="' + escapeHtml(image) + '" alt="" loading="lazy" style="display:block;width:100%;height:184px;object-fit:cover" onerror="this.src=\'/static/images/branding/LOGO.png\'"></span>' +
    '<span class="market-post-copy" style="' + copyStyle + '"><span class="market-post-label">AIAS MARKET · ' + escapeHtml(label) + (attachment.verified === true ? ' <b>✓ ' + tr('Verified','موثّق') + '</b>' : '') + '</span>' +
    '<strong>' + escapeHtml(title) + '</strong>' +
    (attachment.storeName && !isStore ? '<small class="market-post-store">🏬 ' + escapeHtml(attachment.storeName) + '</small>' : '') +
    (description ? '<span class="market-post-description">' + escapeHtml(description) + '</span>' : '') +
    (details.length ? '<span class="market-post-chips">' + details.map(detail => '<i>' + escapeHtml(detail) + '</i>').join('') + '</span>' : '') +
    '<span class="market-post-cta">' + action + ' <b aria-hidden="true">↗</b></span></span></a>';
}

function portfolioAttachmentLink(attachment) {
  const kind = String(attachment?.kind || '').trim();
  const id = String(attachment?.id || attachment?.workId || attachment?.opportunityId || attachment?.postId || attachment?.portfolioId || '').trim();
  if (!kind || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return '';
  if (kind === 'work') return '/portfolio-work.html?id=' + encodeURIComponent(id);
  if (kind === 'job') return '/portfolios.html?tab=jobs&id=' + encodeURIComponent(id);
  if (kind === 'internship') return '/portfolios.html?tab=internships&id=' + encodeURIComponent(id);
  if (kind === 'biz_post') return '/portfolio.html?id=' + encodeURIComponent(attachment.companyId || id);
  return '/portfolio.html?id=' + encodeURIComponent(id);
}

function renderPortfolioAttachment(attachment, composer = false) {
  const href = portfolioAttachmentLink(attachment);
  if (!href) return '';
  const kind = attachment.kind || 'portfolio';
  const isWork = kind === 'work';
  const isJob = kind === 'job';
  const isInternship = kind === 'internship';
  const isBizPost = kind === 'biz_post';
  const isBiz = attachment.isBusiness === true || isJob || isInternship || isBizPost;

  const title = String(attachment.title || tr('Professional listing','محتوى مهني')).trim();
  const description = String(attachment.description || '').trim();
  const image = safeMarketAttachmentImage(attachment.imageUrl) || '/static/images/branding/LOGO.png';
  const ownerLine = String(attachment.companyName || attachment.professionalTitle || '').trim();
  const details = [attachment.workType, ...(Array.isArray(attachment.tags) ? attachment.tags : [])].filter(Boolean).slice(0, 4);

  let label = tr('Professional portfolio', 'معرض مهني');
  let action = tr('View portfolio', 'عرض المعرض');
  if (isWork) {
    label = tr('Portfolio project', 'مشروع المعرض');
    action = tr('View project', 'عرض المشروع');
  } else if (isJob) {
    label = tr('Studio job opening', 'فرصة عمل معمارية');
    action = tr('View job & apply', 'عرض الوظيفة والتقديم');
  } else if (isInternship) {
    label = tr('Studio internship', 'تدريب معمار');
    action = tr('View internship & apply', 'عرض التدريب والتقديم');
  } else if (isBizPost) {
    label = tr('Studio announcement', 'إعلان استوديو');
    action = tr('View studio', 'عرض الاستوديو');
  }

  const cardStyle = 'display:grid;grid-template-columns:minmax(156px,32%) minmax(0,1fr);min-height:184px;overflow:hidden;margin:16px 0 8px;border:1px solid #ded4ca;border-radius:18px;color:#211a1b;background:#fffdfa;text-decoration:none;box-shadow:0 10px 26px rgba(61,17,21,.06)';
  const imageStyle = 'display:block;min-height:184px;overflow:hidden;background:#eee8df';
  const copyStyle = 'min-width:0;display:flex;flex-direction:column;align-items:flex-start;padding:17px 19px';
  return '<a class="market-echo-card market-post-attachment portfolio-post-attachment' + (composer ? ' composer-preview' : '') + '" data-portfolio-echo="' + escapeHtml(kind) + '" style="' + cardStyle + '" href="' + escapeHtml(href) + '" aria-label="' + escapeHtml(action + ': ' + title) + '">' +
    '<span class="market-post-image" style="' + imageStyle + '"><img src="' + escapeHtml(image) + '" alt="" loading="lazy" style="display:block;width:100%;height:184px;object-fit:cover" onerror="this.src=\'/static/images/branding/LOGO.png\'"></span>' +
    '<span class="market-post-copy" style="' + copyStyle + '"><span class="market-post-label">AIAS PORTFOLIOS · ' + label + (isBiz ? ' <span class="pro-verified-badge-mini" title="Verified Practice">✓</span>' : '') + '</span><strong>' + escapeHtml(title) + '</strong>' +
    (ownerLine ? '<small class="market-post-store">' + (isBiz ? '🏛️ ' : '◉ ') + escapeHtml(ownerLine) + '</small>' : '') +
    (description ? '<span class="market-post-description">' + escapeHtml(description) + '</span>' : '') +
    (details.length ? '<span class="market-post-chips">' + details.map(detail => '<i>' + escapeHtml(detail) + '</i>').join('') + '</span>' : '') +
    '<span class="market-post-cta">' + action + ' <b aria-hidden="true">↗</b></span></span></a>';
}

function renderComposerMarketShare() {
  const preview = $('marketShareComposerPreview');
  if (!preview) return;
  const attached = Boolean(composerMarketShare);
  preview.hidden = !attached;
  $('marketShareComposerCard').innerHTML = attached ? renderMarketAttachment(composerMarketShare, true) : '';
  document.querySelectorAll('input[name="postTypeChoice"]').forEach(input => {
    input.disabled = attached && input.value !== 'text';
  });
}

function clearComposerMarketShare(updateRoute = false) {
  composerMarketShare = null;
  renderComposerMarketShare();
  if (!updateRoute) return;
  const url = new URL(location.href);
  url.searchParams.delete('marketKind');
  url.searchParams.delete('marketId');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
}

async function loadComposerMarketShare(params) {
  const kind = String(params.get('marketKind') || '').trim();
  const id = String(params.get('marketId') || '').trim();
  if (!kind && !id) {
    clearComposerMarketShare(false);
    return;
  }
  clearComposerMarketShare(false);
  if (!['item','store'].includes(kind) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    $('postStatus').textContent = tr('This market share link is invalid.','رابط مشاركة السوق غير صالح.');
    return;
  }
  try {
    const source = await getDoc(doc(db, kind === 'item' ? 'marketItems' : 'marketStores', id));
    if (!source.exists() || source.data().status !== 'active') throw new Error(tr('This market listing is unavailable.','عنصر السوق هذا غير متاح.'));
    const data = source.data();
    let store = kind === 'store' ? data : null;
    let storeId = kind === 'store' ? id : String(data.storeId || '').trim();
    if (kind === 'item') {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(storeId)) throw new Error(tr('This item has no available store.','لا يوجد متجر متاح لهذا المنتج.'));
      const storeSnapshot = await getDoc(doc(db, 'marketStores', storeId));
      if (!storeSnapshot.exists() || storeSnapshot.data().status !== 'active') throw new Error(tr('This item’s store is unavailable.','متجر هذا المنتج غير متاح.'));
      store = storeSnapshot.data();
    }
    composerMarketShare = kind === 'store' ? {
      kind, id, storeId, itemId:'', title:data.name || tr('AIAS Market store','متجر في سوق AIAS'),
      description:data.bio || '', imageUrl:data.bannerImage || data.profileImage || '', storeName:data.name || '', verified:data.verified === true
    } : {
      kind, id, storeId, itemId:id, title:data.name || tr('AIAS Market item','منتج في سوق AIAS'),
      description:data.description || '', imageUrl:data.imageUrl || '', storeName:store?.name || data.storeName || '',
      tag:data.tag || '', itemType:data.type || '', quantity:data.quantity ?? tr('Unlimited','غير محدود'),
      delivery:data.deliverTime || '', verified:store?.verified === true
    };
    $('postType').value = 'text';
    const thoughtChoice = document.querySelector('input[name="postTypeChoice"][value="text"]');
    if (thoughtChoice) thoughtChoice.checked = true;
    if (!$('postTitle').value.trim()) {
      $('postTitle').value = tr('Sharing: ','مشاركة: ') + composerMarketShare.title;
      $('postTitle').dispatchEvent(new Event('input', {bubbles:true}));
    }
    renderPostTypeFields();
    renderComposerMarketShare();
  } catch (error) {
    clearComposerMarketShare(false);
    $('postStatus').textContent = error.message || tr('This market listing could not be loaded.','تعذر تحميل عنصر السوق.');
  }
}

function renderComposerPortfolioShare() {
  const preview = $('portfolioShareComposerPreview');
  if (!preview) return;
  preview.hidden = !composerPortfolioShare;
  $('portfolioShareComposerCard').innerHTML = composerPortfolioShare ? renderPortfolioAttachment(composerPortfolioShare, true) : '';
}

function clearComposerPortfolioShare(updateRoute = false) {
  composerPortfolioShare = null;
  renderComposerPortfolioShare();
  if (!updateRoute) return;
  const url = new URL(location.href);
  url.searchParams.delete('portfolioKind');
  url.searchParams.delete('portfolioId');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
}

async function loadComposerPortfolioShare(params) {
  const kind = String(params.get('portfolioKind') || '').trim();
  const id = String(params.get('portfolioId') || '').trim();
  if (!kind && !id) { clearComposerPortfolioShare(false); return; }
  clearComposerPortfolioShare(false);
  if (!['portfolio','work','job','internship','biz_post'].includes(kind) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    $('postStatus').textContent = tr('This portfolio share link is invalid.','رابط مشاركة المحتوى غير صالح.');
    return;
  }
  try {
    if (kind === 'work') {
      const snapshot = await getDoc(doc(db, 'portfolioWorks', id));
      if (!snapshot.exists() || snapshot.data().status !== 'published') throw new Error(tr('This project is not public.','هذا المشروع غير عام.'));
      const data = snapshot.data();
      composerPortfolioShare = {
        kind, id, workId: id, portfolioId: data.ownerId,
        title: data.title, description: data.summary || data.content,
        imageUrl: data.coverUrl || data.previewUrl,
        professionalTitle: data.ownerName, workType: data.workType,
        tags: data.tags || []
      };
    } else if (kind === 'job' || kind === 'internship') {
      const snapshot = await getDoc(doc(db, 'businessOpportunities', id));
      if (!snapshot.exists() || snapshot.data().status !== 'open') throw new Error(tr('This opportunity is no longer open.','هذه الفرصة لم تعد متاحة.'));
      const data = snapshot.data();
      const bizProfSnap = await getDoc(doc(db, 'businessProfiles', data.ownerUid)).catch(() => null);
      const bizProf = bizProfSnap?.exists() ? bizProfSnap.data() : {};
      composerPortfolioShare = {
        kind, id, opportunityId: id, companyId: data.ownerUid,
        title: data.title, description: data.description,
        imageUrl: bizProf.coverUrl || bizProf.logoUrl,
        companyName: bizProf.name || data.businessName,
        professionalTitle: bizProf.name || data.businessName,
        isBusiness: true,
        workType: data.employmentType || data.duration || (kind === 'job' ? 'Full-time' : 'Internship'),
        tags: [data.location, data.workplaceType, data.experience || data.compensation].filter(Boolean)
      };
    } else if (kind === 'biz_post') {
      const snapshot = await getDoc(doc(db, 'businessPosts', id));
      if (!snapshot.exists() || snapshot.data().status !== 'published') throw new Error(tr('This announcement is not public.','هذا الإعلان غير متاح.'));
      const data = snapshot.data();
      const bizProfSnap = await getDoc(doc(db, 'businessProfiles', data.ownerUid)).catch(() => null);
      const bizProf = bizProfSnap?.exists() ? bizProfSnap.data() : {};
      composerPortfolioShare = {
        kind, id, postId: id, companyId: data.ownerUid,
        title: data.title, description: data.body || data.summary,
        imageUrl: data.photoUrl || bizProf.coverUrl || bizProf.logoUrl,
        companyName: bizProf.name || data.businessName,
        professionalTitle: bizProf.name || data.businessName,
        isBusiness: true,
        workType: 'Studio Announcement',
        tags: ['Announcement', bizProf.industry || 'Architecture & Design']
      };
    } else {
      const snapshot = await getDoc(doc(db, 'portfolioProfiles', id));
      if (!snapshot.exists() || snapshot.data().status !== 'published') throw new Error(tr('This portfolio content is not public.','محتوى المعرض هذا غير عام.'));
      const data = snapshot.data();
      composerPortfolioShare = {
        kind, id, portfolioId: id, workId: '',
        title: data.displayName, description: data.tagline || data.professionalTitle,
        imageUrl: data.coverUrl || data.avatarUrl,
        professionalTitle: data.professionalTitle, workType: '',
        tags: data.skills || []
      };
    }

    $('postType').value = 'text';
    const choice = document.querySelector('input[name="postTypeChoice"][value="text"]');
    if (choice) choice.checked = true;
    if (!$('postTitle').value.trim()) $('postTitle').value = tr('Sharing: ','مشاركة: ') + composerPortfolioShare.title;
    renderPostTypeFields();
    renderComposerPortfolioShare();
  } catch (error) {
    clearComposerPortfolioShare(false);
    $('postStatus').textContent = error.message || tr('This portfolio content could not be loaded.','تعذر تحميل محتوى المعرض.');
  }
}

function renderPostCard(post, index, detail) {
  const meta = post.meta;
  const authorName = post.authorName || meta.profile.displayName || tr('Community member','عضو في المجتمع');
  const school = meta.profile.school || (isProject(post) ? tr('Project author','صاحب المشروع') : tr('Community member','عضو في المجتمع'));
  const authorProfileUrl = profileUrl(post.userId, meta.profile.username);
  const communitySlug = communityAreas[post.communitySlug] ? post.communitySlug : 'main';
  const sourceArea = communityAreas[communitySlug];
  const spaceFirst = !activeAreaSlug && communitySlug !== 'main';
  const communityContext = communitySlug === 'main'
    ? '<span class="main-thread-label">' + tr('Main thread','المسار الرئيسي') + '</span>'
    : '<a href="' + areaUrl(communitySlug) + '">a/' + escapeHtml(communitySlug) + '</a>';
  const spaceSource = spaceFirst
    ? '<a class="post-space-source" href="' + areaUrl(communitySlug) + '">' + spaceVisual(sourceArea, 'post-space-image') + '<span><small>' + tr('Posted in','نُشر في') + '</small><strong>' + escapeHtml(sourceArea.name || communitySlug) + '</strong><b>a/' + escapeHtml(communitySlug) + '</b></span><i aria-hidden="true">' + (isArabic() ? '←' : '→') + '</i></a>'
    : '<div class="post-context">' + communityContext + '<span>·</span><span>' + postLabel(post) + '</span></div>';
  const destination = isProject(post)
    ? 'project.html?communityPost=' + encodeURIComponent(post.id)
    : '/community.html?post=' + encodeURIComponent(post.id);
  const text = isProject(post) ? post.summary : plainPostText(post);
  const selected = isProject(post) && post.featured ? '<span class="selected-badge">· ' + tr('Selected','مختار') + '</span>' : '';
  const projectSpecBadge = isProject(post)
    ? '<div class="post-project-specs" style="display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 6px;">' +
        '<span class="spec-tag category" style="padding:3px 9px; border-radius:6px; background:#f4efea; color:#6b2228; font-size:.68rem; font-weight:700;">' + escapeHtml(post.category || tr('Architectural Project', 'مشروع معماري')) + '</span>' +
        (post.location ? '<span class="spec-tag location" style="padding:3px 9px; border-radius:6px; background:#f4efea; color:#4a5568; font-size:.68rem; font-weight:700;">📍 ' + escapeHtml(post.location) + '</span>' : '') +
        (post.status ? '<span class="spec-tag status" style="padding:3px 9px; border-radius:6px; background:#f4efea; color:#4a5568; font-size:.68rem; font-weight:700;">🏗 ' + escapeHtml(post.status) + '</span>' : '') +
        ((post.tools && Array.isArray(post.tools) && post.tools.length) ? post.tools.slice(0, 3).map(t => '<span class="spec-tag tool" style="padding:3px 9px; border-radius:6px; background:#faf3e6; color:#8a5d13; font-size:.68rem; font-weight:700;">🛠 ' + escapeHtml(t) + '</span>').join('') : '') +
      '</div>'
    : '';
  const projectPreview = isProject(post) && post.behanceSrc
    ? '<div class="project-preview">' + projectSpecBadge + '<iframe title="' + escapeHtml(post.title) + '" src="' + escapeHtml(post.behanceSrc) + '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><a class="project-preview-link" href="' + destination + '">' + tr('Open project page','فتح صفحة المشروع') + ' <span aria-hidden="true">↗</span></a></div>'
    : '';
  const imageUrls = post.type === 'text' ? postImageUrls(post) : [];
  const visibleImages = imageUrls.slice(0, 4);
  const imagePreview = visibleImages.length
    ? '<div class="post-image-gallery count-' + Math.min(visibleImages.length, 4) + '">' + visibleImages.map((url, imageIndex) => '<button type="button" data-open-image="' + imageIndex + '" aria-label="' + escapeHtml(tr('Open image ','فتح الصورة ') + (imageIndex + 1)) + '"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(post.title) + '" loading="lazy">' + (imageIndex === 3 && imageUrls.length > 4 ? '<span>+' + (imageUrls.length - 4) + '</span>' : '') + '</button>').join('') + '</div>'
    : '';
  const marketPreview = renderMarketAttachment(post.marketAttachment);
  const portfolioPreview = renderPortfolioAttachment(post.portfolioAttachment);
  const requestStatus = post.featureStatus === 'denied' ? tr('not selected','لم يُختر') : tr('pending','قيد المراجعة');
  const request = currentUser?.uid === post.userId && isProject(post) && !post.featured && post.featureRequest
    ? '<div class="project-request">' + tr('Selection request:','طلب اختيار:') + ' <strong>' + escapeHtml(requestStatus) + '</strong></div>'
    : '';
  const owner = currentUser?.uid === post.userId;
  const postMenu = '<div class="post-menu-wrap"><button class="post-menu-trigger" type="button" data-post-menu-toggle="' + escapeHtml(post.id) + '" aria-label="' + escapeHtml(tr('Post options','خيارات المنشور')) + '" title="' + escapeHtml(tr('Options','خيارات')) + '"><span aria-hidden="true">•••</span></button><div class="post-menu-dropdown" id="post-menu-' + escapeHtml(post.id) + '" hidden>' + (owner ? '<button class="post-menu-item" type="button" data-edit-post="' + escapeHtml(post.id) + '"><span aria-hidden="true">✏</span> ' + tr('Edit post','تعديل المنشور') + '</button><button class="post-menu-item" type="button" data-archive-post="' + escapeHtml(post.id) + '"><span aria-hidden="true">📦</span> ' + tr('Archive post','أرشفة المنشور') + '</button><button class="post-menu-item danger" type="button" data-delete-post="' + escapeHtml(post.id) + '"><span aria-hidden="true">🗑</span> ' + tr('Delete post','حذف المنشور') + '</button>' : '') + (!owner && canManageSpace(communitySlug) ? '<button class="post-menu-item" type="button" data-moderate-space-post="' + escapeHtml(post.id) + '|warn"><span aria-hidden="true">⚠️</span> ' + tr('Warn post','تحذير المنشور') + '</button><button class="post-menu-item danger" type="button" data-moderate-space-post="' + escapeHtml(post.id) + '|delete"><span aria-hidden="true">🗑</span> ' + tr('Delete post','حذف المنشور') + '</button>' : '') + '<button class="post-menu-item" type="button" data-share="' + escapeHtml(post.id) + '"><span aria-hidden="true">↗</span> ' + tr('Share link','مشاركة الرابط') + '</button></div></div>';
  const threadBadge = !detail && Number(post.subPostCount) > 0
    ? '<button type="button" class="post-thread-badge" data-toggle-inline-thread="' + escapeHtml(post.id) + '" aria-expanded="false" aria-label="' + escapeHtml(tr('Show thread entries','عرض منشورات السلسلة')) + '">↳ ' + post.subPostCount + ' ' + tr('in thread', 'في الخيط') + '</button>'
    : '';
  const inlineThread = !detail && Number(post.subPostCount) > 0
    ? '<div class="inline-thread-container" id="inline-thread-' + escapeHtml(post.id) + '" hidden></div>'
    : '';
  return [
    '<article class="post-card' + (detail ? ' detail' : '') + (isQuestion(post) ? ' question' : '') + (spaceFirst ? ' from-space' : '') + '"' + (detail ? '' : ' data-open-post="' + escapeHtml(post.id) + '" tabindex="0" role="link"') + ' style="--i:' + index + '">',
      spaceSource,
      '<div class="post-head">',
        '<a class="post-author" href="' + authorProfileUrl + '">',
          avatarMarkup(authorName, meta.profile.photoBase64 || meta.profile.photoURL, 'avatar', meta.profile.verified === true),
          '<span class="author-copy"><small class="post-byline-label">' + (spaceFirst ? tr('Shared by','نشره') : '') + '</small><strong>' + escapeHtml(authorName) + '</strong>' + businessBadgeMarkup(meta.profile, true) + '<span>' + escapeHtml(school) + ' · ' + escapeHtml(formatDate(post.createdAt)) + (post.editedAt || post.updatedAt ? ' · <em class="post-edited-label">' + tr('Edited','تم التعديل') + '</em>' : '') + selected + '</span></span>',
        '</a>',
        '<div class="post-head-actions">',
          '<span class="post-kind' + (isProject(post) ? ' project' : isQuestion(post) ? ' question' : '') + '">' + postLabel(post) + '</span>',
          postMenu,
        '</div>',
      '</div>',
      '<h2 class="post-title">' + renderMentionedTitle(post.title, destination) + '</h2>',
      text ? '<div class="post-body">' + renderMentionedText(text) + '</div>' : '',
      marketPreview,
      portfolioPreview,
      imagePreview,
      projectPreview,
      threadBadge,
      inlineThread,
      (!detail || !Number(post.subPostCount)) ? renderPostActions(post) : '',
      request,
    '</article>'
  ].join('');
}

function bindPostActions(target, posts) {
  if (Array.isArray(posts)) activePosts = posts;
  const byId = new Map(posts.map(post => [post.id, post]));
  target.querySelectorAll('[data-post-menu-toggle]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const menuId = 'post-menu-' + button.dataset.postMenuToggle;
    const dropdown = $(menuId);
    if (!dropdown) return;
    const isHidden = dropdown.hidden;
    document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
    document.querySelectorAll('.post-menu-trigger.active').forEach(el => { el.classList.remove('active'); });
    dropdown.hidden = !isHidden;
    button.classList.toggle('active', !isHidden);
  }));
  target.querySelectorAll('[data-edit-post], [data-edit-profile-post]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
    const postId = button.dataset.editPost || button.dataset.editProfilePost;
    await openPostEditor(postId);
  }));
  target.querySelectorAll('[data-archive-post], [data-archive-profile-post]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
    const postId = button.dataset.archivePost || button.dataset.archiveProfilePost;
    await archiveOwnedPost(postId);
  }));
  target.querySelectorAll('[data-delete-post], [data-delete-profile-post]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
    const postId = button.dataset.deletePost || button.dataset.deleteProfilePost;
    await deleteOwnedPost(postId);
  }));
  target.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentUser) {
      showToast(tr('Sign in to react to community posts.','سجّل الدخول للتفاعل مع منشورات المجتمع.'));
      setTimeout(() => { location.href = loginUrl(); }, 650);
      return;
    }
    const postId = button.dataset.id;
    const post = byId.get(postId);
    if (!post || button.disabled) return;
    const requested = Number(button.dataset.vote);
    const previousValue = Number(post.meta.mine) || 0;
    const previousScore = Number(post.meta.score) || 0;
    const value = previousValue === requested ? 0 : requested;
    const nextScore = previousScore + value - previousValue;
    const reactionButtons = [...target.querySelectorAll('[data-vote]')].filter(item => item.dataset.id === postId);
    const scoreTargets = [...target.querySelectorAll('[data-vote-score]')].filter(item => item.dataset.voteScore === postId);
    const paintReaction = (mine, score) => {
      reactionButtons.forEach(item => {
        const vote = Number(item.dataset.vote);
        item.dataset.current = String(mine);
        item.classList.toggle('active', vote === mine);
      });
      scoreTargets.forEach(item => { item.textContent = String(score); });
    };
    reactionButtons.forEach(item => { item.disabled = true; });
    paintReaction(value, nextScore);
    if (value === 1) {
      button.classList.remove('celebrate');
      void button.offsetWidth;
      button.classList.add('celebrate');
    }
    try {
      const saved = await callFunction('setCommunityPostVote', {postId, value});
      post.meta.mine = value;
      post.meta.score = Number(saved.score ?? nextScore);
      paintReaction(value, post.meta.score);
    } catch (error) {
      console.error(error);
      paintReaction(previousValue, previousScore);
      showToast(tr('Your reaction could not be saved.','تعذر حفظ تفاعلك.'));
    } finally {
      reactionButtons.forEach(item => { item.disabled = false; });
    }
  }));
  target.querySelectorAll('[data-open-comments]').forEach(button => button.addEventListener('click', () => {
    const params = new URLSearchParams(location.search);
    if (params.get('post') || $('inlineCommentsSection')) {
      const inlineCard = $('inlineCommentsSection');
      if (inlineCard) {
        inlineCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        inlineCard.querySelector('input, textarea')?.focus();
        return;
      }
    }
    openComments(button.dataset.openComments, true);
  }));
  target.querySelectorAll('[data-open-post]').forEach(card => {
    const open = event => {
      if (event.target.closest('a,button,input,textarea,[data-open-image]')) return;
      navigateTo('/community.html?post=' + encodeURIComponent(card.dataset.openPost), false);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
  });
  target.querySelectorAll('[data-open-image]').forEach(image => image.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const card = image.closest('[data-open-post], .post-card');
    const post = byId.get(card?.dataset.openPost) || posts.find(item => item.id === card?.querySelector('[data-open-comments]')?.dataset.openComments);
    if (post) openImageViewer(post, Number(image.dataset.openImage) || 0);
  }));
  target.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const post = byId.get(button.dataset.share);
    if (!post) return;
    openPostShareDialog(post);
  }));
  target.querySelectorAll('[data-moderate-space-post]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const [postId, action] = button.dataset.moderateSpacePost.split('|');
    const post = byId.get(postId);
    if (!post) return;
    button.disabled = true;
    try { await moderateSpacePost(post, action); }
    catch (error) { console.error(error); showToast(tr('The moderation action failed.','تعذر تنفيذ إجراء الإشراف.')); button.disabled = false; }
  }));
  target.querySelectorAll('[data-toggle-inline-thread]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const postId = button.dataset.toggleInlineThread;
    const post = byId.get(postId) || posts.find(p => p.id === postId) || (await getOrFetchPost(postId));
    const container = $('inline-thread-' + postId) || button.closest('.post-card')?.querySelector('.inline-thread-container');
    if (post && container) {
      await toggleInlineThread(postId, button, container, post);
    }
  }));
}

function renderImageViewerActions() {
  const post = activeImagePost;
  if (!post) return;
  if (post.chatImage) {
    $('imageViewerActions').innerHTML = '';
    return;
  }
  const meta = post.meta || {mine:0, score:0, commentsCount:0};
  $('imageViewerActions').innerHTML = '<button type="button" data-image-vote="1" class="' + (meta.mine === 1 ? 'active' : '') + '" aria-label="' + tr('Applaud','التصفيق') + '">↑</button><b>' + (meta.score || 0) + '</b><button type="button" data-image-vote="-1" class="' + (meta.mine === -1 ? 'active' : '') + '" aria-label="' + tr('Show less','عرض أقل') + '">↓</button><button type="button" class="image-comment-button" data-image-comments><span aria-hidden="true">◯</span><span>' + (meta.commentsCount || 0) + '</span></button>';
}

function syncImageViewer(animate = false) {
  const urls = postImageUrls(activeImagePost);
  if (!urls.length) return;
  activeImageIndex = Math.max(0, Math.min(activeImageIndex, urls.length - 1));
  const imgEl = $('imageViewerImage');
  const dotsEl = $('imageViewerDots');
  // Dot indicators
  if (dotsEl) {
    dotsEl.innerHTML = urls.map((_, i) =>
      `<button class="image-viewer-dot${i === activeImageIndex ? ' active' : ''}" type="button" aria-label="Image ${i+1}" data-dot-index="${i}"></button>`
    ).join('');
    dotsEl.querySelectorAll('[data-dot-index]').forEach(btn => {
      btn.onclick = () => { activeImageIndex = Number(btn.dataset.dotIndex); syncImageViewer(true); };
    });
  }
  $('imageViewerCount').textContent = urls.length > 1 ? (activeImageIndex + 1) + ' / ' + urls.length : '';
  $('imageViewerPrevious').hidden = urls.length < 2;
  $('imageViewerNext').hidden = urls.length < 2;
  if (animate) {
    imgEl.classList.add('is-transitioning');
    setTimeout(() => {
      imgEl.src = urls[activeImageIndex];
      imgEl.alt = (activeImagePost.title || tr('Post image','صورة المنشور')) + ' ' + (activeImageIndex + 1);
      imgEl.classList.remove('is-transitioning');
    }, 180);
  } else {
    imgEl.src = urls[activeImageIndex];
    imgEl.alt = (activeImagePost.title || tr('Post image','صورة المنشور')) + ' ' + (activeImageIndex + 1);
  }
}

function stepImageViewer(direction) {
  const urls = postImageUrls(activeImagePost);
  if (urls.length < 2) return;
  activeImageIndex = (activeImageIndex + direction + urls.length) % urls.length;
  syncImageViewer(true);
}

let _viewerSwipeStartX = 0;
let _viewerSwipeStartY = 0;

function _viewerTouchStart(e) {
  _viewerSwipeStartX = e.touches[0].clientX;
  _viewerSwipeStartY = e.touches[0].clientY;
}
function _viewerTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - _viewerSwipeStartX;
  const dy = e.changedTouches[0].clientY - _viewerSwipeStartY;
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  stepImageViewer(dx < 0 ? 1 : -1);
}

function openImageViewer(post, imageIndex = 0, parentPost = null) {
  if (!postImageUrls(post).length) return;
  activeImagePost = post;
  if (parentPost) activeImagePost.parentPost = parentPost;
  activeImageIndex = imageIndex;
  syncImageViewer(false);
  renderImageViewerActions();
  $('imageViewer').hidden = false;
  document.body.classList.add('image-viewer-open');
  // Push a history entry so the back button closes the viewer
  history.pushState({ imageViewerOpen: true }, '');
  // Swipe on mobile
  $('imageViewer').addEventListener('touchstart', _viewerTouchStart, {passive:true});
  $('imageViewer').addEventListener('touchend', _viewerTouchEnd, {passive:true});
}

function closeImageViewer() {
  activeImagePost = null;
  activeImageIndex = 0;
  $('imageViewer').hidden = true;
  $('imageViewerImage').src = '';
  $('imageViewerImage').classList.remove('is-transitioning');
  $('imageViewerCount').textContent = '';
  const dotsEl = $('imageViewerDots');
  if (dotsEl) dotsEl.innerHTML = '';
  document.body.classList.remove('image-viewer-open');
  $('imageViewer').removeEventListener('touchstart', _viewerTouchStart);
  $('imageViewer').removeEventListener('touchend', _viewerTouchEnd);
}

async function voteFromImageViewer(value) {
  const post = activeImagePost;
  if (!post) return;
  if (!currentUser) { location.href = loginUrl(); return; }
  const effectivePost = post.parentPost || post;
  const effectivePostId = effectivePost.id;
  const previous = Number(effectivePost.meta?.mine) || 0;
  const next = previous === value ? 0 : value;
  try {
    const saved = await callFunction('setCommunityPostVote', {postId:effectivePostId, value:next});
    if (effectivePost.meta) {
      effectivePost.meta.mine = next;
      effectivePost.meta.score = Number(saved.score ?? ((Number(effectivePost.meta.score) || 0) + next - previous));
    }
    document.querySelectorAll('[data-vote-score="' + effectivePostId + '"]').forEach(score => { score.textContent = String(effectivePost.meta?.score ?? saved.score); });
    renderImageViewerActions();
  } catch (error) { console.error(error); showToast(tr('Your reaction could not be saved.','تعذر حفظ تفاعلك.')); }
}

/* ═══════════ THREAD SYSTEM ══════════════════════════════════════════════ */

function renderSubPostCard(sub, authorProfile, parentPost, index = 0) {
  const authorName = sub.authorName || authorProfile?.displayName || tr('Member', 'عضو');
  const time = formatDate(sub.createdAt);
  const imageUrls = postImageUrls(sub);
  const imageHtml = imageUrls.length
    ? '<div class="post-image-gallery count-' + Math.min(imageUrls.length, 4) + '" style="margin:10px 0;">' +
        imageUrls.slice(0, 4).map((url, i) =>
          '<button type="button" data-sub-open-image="' + i + '" data-sub-id="' + escapeHtml(sub.id) + '" aria-label="' + tr('Open image ', 'فتح الصورة ') + (i + 1) + '">' +
          '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(sub.title) + '" loading="lazy">' +
          (i === 3 && imageUrls.length > 4 ? '<span>+' + (imageUrls.length - 4) + '</span>' : '') +
          '</button>').join('') + '</div>'
    : '';
  const isOwner = currentUser?.uid === sub.userId;
  const menuHtml = isOwner
    ? '<div class="post-menu-wrap sub-post-menu"><button class="post-menu-trigger" type="button" data-sub-menu-toggle="' + escapeHtml(sub.id) + '" aria-label="' + tr('Options', 'خيارات') + '"><span aria-hidden="true">•••</span></button>' +
      '<div class="post-menu-dropdown" id="sub-menu-' + escapeHtml(sub.id) + '" hidden>' +
      '<button class="post-menu-item" type="button" data-edit-subpost="' + escapeHtml(sub.id) + '"><span aria-hidden="true">✏</span> ' + tr('Edit', 'تعديل') + '</button>' +
      '<button class="post-menu-item danger" type="button" data-delete-subpost="' + escapeHtml(sub.id) + '" data-parent-id="' + escapeHtml(sub.parentPostId) + '"><span aria-hidden="true">🗑</span> ' + tr('Delete', 'حذف') + '</button>' +
      '</div></div>'
    : '';
  const summaryTitle = sub.title || (plainPostText(sub).slice(0, 55)) || (tr('Entry #', 'إضافة #') + (index + 1));
  return '<details class="sub-post-card" id="sub-' + escapeHtml(sub.id) + '" open>' +
    '<summary class="sub-post-summary">' +
      '<div class="sub-post-summary-info">' +
        '<span class="sub-post-index">#' + (index + 1) + '</span>' +
        '<span class="sub-post-summary-title">' + escapeHtml(summaryTitle) + '</span>' +
        '<span class="sub-post-time">· ' + escapeHtml(time) + '</span>' +
      '</div>' +
      '<div class="sub-post-summary-controls">' +
        menuHtml +
        '<span class="sub-post-chevron" aria-hidden="true">▾</span>' +
      '</div>' +
    '</summary>' +
    '<div class="sub-post-content-wrap">' +
      (sub.title ? '<h3 class="sub-post-title">' + escapeHtml(sub.title) + '</h3>' : '') +
      '<div class="sub-post-body">' + renderMentionedText(plainPostText(sub)) + '</div>' +
      imageHtml +
    '</div>' +
  '</details>';
}

let _threadImages = [];

function _renderThreadImagePreview(container) {
  const prev = container.querySelector('.thread-composer-image-preview');
  if (!prev) return;
  prev.innerHTML = _threadImages.map((img, i) =>
    '<article><img src="' + escapeHtml(img.dataUrl) + '" alt=""><button type="button" data-remove-thread-img="' + i + '" aria-label="remove">×</button></article>'
  ).join('');
  prev.querySelectorAll('[data-remove-thread-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      _threadImages.splice(Number(btn.dataset.removeThreadImg), 1);
      _renderThreadImagePreview(container);
    });
  });
}

function bindSubPostEvents(container, subPosts, parentPost, onCountChange) {
  container.querySelectorAll('[data-sub-open-image]').forEach(imgBtn => {
    imgBtn.addEventListener('click', () => {
      const subId = imgBtn.dataset.subId;
      const sub = subPosts.find(s => s.id === subId);
      if (sub) openImageViewer(sub, Number(imgBtn.dataset.subOpenImage), parentPost);
    });
  });

  container.querySelectorAll('[data-sub-menu-toggle]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const drop = $('sub-menu-' + btn.dataset.subMenuToggle);
      if (!drop) return;
      document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => el.hidden = true);
      drop.hidden = !drop.hidden;
    });
  });

  container.querySelectorAll('[data-edit-subpost]').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.editSubpost;
      const sub = subPosts.find(s => s.id === subId);
      if (!sub) return;
      document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
      const card = document.getElementById('sub-' + subId);
      if (!card) return;
      const contentWrap = card.querySelector('.sub-post-content-wrap');
      if (!contentWrap) return;
      card.open = true;
      const currentTitle = sub.title || '';
      const currentBody = plainPostText(sub);
      const originalContentHtml = contentWrap.innerHTML;
      contentWrap.innerHTML = '<div class="sub-post-inline-editor">' +
        '<input type="text" class="sub-edit-title" value="' + escapeHtml(currentTitle) + '" maxlength="160" placeholder="' + tr('Title (optional)…', 'العنوان (اختياري)…') + '">' +
        '<textarea class="sub-edit-content" rows="3" maxlength="10000" placeholder="' + tr('Content…', 'المحتوى…') + '">' + escapeHtml(currentBody) + '</textarea>' +
        '<div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">' +
          '<button type="button" class="sub-edit-cancel secondary-button" style="min-height:32px; padding:0 12px; font-size:.72rem;">' + tr('Cancel', 'إلغاء') + '</button>' +
          '<button type="button" class="sub-edit-save primary-button" style="min-height:32px; padding:0 14px; font-size:.72rem;">' + tr('Save changes', 'حفظ التعديلات') + '</button>' +
        '</div>' +
      '</div>';
      contentWrap.querySelector('.sub-edit-cancel').addEventListener('click', () => {
        contentWrap.innerHTML = originalContentHtml;
      });
      contentWrap.querySelector('.sub-edit-save').addEventListener('click', async () => {
        const newTitle = contentWrap.querySelector('.sub-edit-title').value.trim();
        const newContent = contentWrap.querySelector('.sub-edit-content').value.trim();
        if (!newContent && !newTitle) { showToast(tr('Add content before saving.', 'أضف محتوى قبل الحفظ.')); return; }
        const saveBtn = contentWrap.querySelector('.sub-edit-save');
        saveBtn.disabled = true;
        try {
          await setDoc(doc(db, 'communityPosts', sub.id), {
            title: newTitle, content: newContent,
            summary: newContent.slice(0, 360),
            editedAt: serverTimestamp()
          }, { merge: true });
          sub.title = newTitle;
          sub.content = newContent;
          const summaryTitle = newTitle || (newContent.slice(0, 55)) || (tr('Entry #', 'إضافة #') + 1);
          const summaryTitleEl = card.querySelector('.sub-post-summary-title');
          if (summaryTitleEl) summaryTitleEl.textContent = summaryTitle;
          const imageUrls = postImageUrls(sub);
          const imageHtml = imageUrls.length
            ? '<div class="post-image-gallery count-' + Math.min(imageUrls.length, 4) + '" style="margin:10px 0;">' +
                imageUrls.slice(0, 4).map((url, i) =>
                  '<button type="button" data-sub-open-image="' + i + '" data-sub-id="' + escapeHtml(sub.id) + '" aria-label="' + tr('Open image ', 'فتح الصورة ') + (i + 1) + '">' +
                  '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(sub.title) + '" loading="lazy">' +
                  (i === 3 && imageUrls.length > 4 ? '<span>+' + (imageUrls.length - 4) + '</span>' : '') +
                  '</button>').join('') + '</div>'
            : '';
          contentWrap.innerHTML = (newTitle ? '<h3 class="sub-post-title">' + escapeHtml(newTitle) + '</h3>' : '') +
            '<div class="sub-post-body">' + renderMentionedText(plainPostText(sub)) + '</div>' + imageHtml;
          bindSubPostEvents(card, subPosts, parentPost, onCountChange);
          showToast(tr('Thread entry updated.', 'تم تحديث الإضافة.'));
        } catch (err) {
          console.error(err);
          showToast(tr('Could not update entry.', 'تعذر تحديث الإضافة.'));
          saveBtn.disabled = false;
        }
      });
    });
  });

  container.querySelectorAll('[data-delete-subpost]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(tr('Delete this thread post?', 'هل تحذف منشور الخيط هذا؟'))) return;
      try {
        await callFunction('deleteOwnCommunityPost', { postId: btn.dataset.deleteSubpost });
        const card = document.getElementById('sub-' + btn.dataset.deleteSubpost);
        if (card) { card.style.transition = 'opacity .3s'; card.style.opacity = '0'; setTimeout(() => card.remove(), 320); }
        if (typeof onCountChange === 'function') onCountChange(btn.dataset.deleteSubpost);
        showToast(tr('Thread post deleted.', 'تم حذف منشور الخيط.'));
      } catch (err) { showToast(err.message || tr('Could not delete.', 'تعذر الحذف.')); }
    });
  });
}

async function fetchThreadSubPosts(postId, parentPost) {
  let subPosts = [];
  try {
    const q = query(
      collection(db, 'communityPosts'),
      where('parentPostId', '==', postId),
      where('archived', '==', false)
    );
    const snap = await getDocs(q);
    subPosts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn('[Thread] Direct query failed, falling back to callable:', err);
    try {
      const res = await callFunction('getCommunityThread', { postId });
      subPosts = res?.subPosts || [];
    } catch (fallbackErr) {
      console.error('[Thread] Both direct query and callable failed:', fallbackErr);
      throw fallbackErr;
    }
  }

  const hydrated = await Promise.all(
    subPosts.map(async sub => {
      let item = sub;
      try { item = await loadPostImage(sub); } catch(e) { console.warn('image load error', e); }
      return { ...item, parentPost, meta: parentPost.meta };
    })
  );

  hydrated.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime());
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime());
    return timeA - timeB;
  });

  return hydrated;
}

async function toggleInlineThread(postId, parentPost) {
  const container = document.getElementById('inline-thread-' + postId);
  if (!container) return;
  const badge = document.querySelector('[data-toggle-inline-thread="' + CSS.escape(postId) + '"]');

  if (!container.hidden) {
    container.hidden = true;
    if (badge) {
      badge.classList.remove('open');
      badge.setAttribute('aria-expanded', 'false');
      badge.innerHTML = '↳ ' + (parentPost?.subPostCount || '') + ' ' + tr('in thread', 'في الخيط');
    }
    return;
  }

  container.hidden = false;
  if (badge) {
    badge.classList.add('open');
    badge.setAttribute('aria-expanded', 'true');
    badge.innerHTML = '✕ ' + tr('Hide thread', 'إخفاء الخيط') + ' (' + (parentPost?.subPostCount || '') + ')';
  }
  container.innerHTML = '<div class="inline-thread-loading"><span class="community-splash-glow" style="width:14px;height:14px;display:inline-block;" aria-hidden="true"></span> ' + tr('Loading thread…', 'جارٍ تحميل الخيط…') + '</div>';

  try {
    const subPosts = await fetchThreadSubPosts(postId, parentPost);
    let authorProfile = {};
    try { authorProfile = (await getProfile(parentPost.userId)) || {}; } catch(e) {}
    const count = subPosts.length;

    if (count === 0) {
      container.innerHTML = '<p class="notice" style="margin:0;font-size:.76rem;">' + tr('No thread entries found.', 'لا توجد إضافات في هذا الخيط.') + '</p>';
      return;
    }

    let html = '<div class="inline-thread-header"><span>↳ ' + tr('Thread entries', 'إضافات الخيط') + ' (' + count + ')</span></div>';
    html += '<div class="thread-list">' + subPosts.map((sub, i) => renderSubPostCard(sub, authorProfile, parentPost, i)).join('') + '</div>';
    container.innerHTML = html;

    bindSubPostEvents(container, subPosts, parentPost, (deletedSubId) => {
      if (parentPost.subPostCount > 0) parentPost.subPostCount -= 1;
      if (badge) {
        if (parentPost.subPostCount <= 0) {
          badge.hidden = true;
          container.hidden = true;
        } else {
          badge.innerHTML = '✕ ' + tr('Hide thread', 'إخفاء الخيط') + ' (' + parentPost.subPostCount + ')';
        }
      }
    });
  } catch (error) {
    console.error('[InlineThread error]', error);
    container.innerHTML = '<p class="notice error" style="margin:0;font-size:.76rem;">' + tr('Could not load thread.', 'تعذر تحميل الخيط.') + '</p>';
  }
}

async function loadAndRenderThread(parentPost) {
  const threadSection = $('threadSection');
  if (!threadSection) return;
  threadSection.innerHTML = '<p class="notice" style="font-size:.78rem;">' + tr('Loading thread…', 'جارٍ تحميل الخيط…') + '</p>';
  try {
    const subPosts = await fetchThreadSubPosts(parentPost.id, parentPost);
    let authorProfile = {};
    try { authorProfile = (await getProfile(parentPost.userId)) || {}; } catch(e) {}
    const isOwner = currentUser?.uid === parentPost.userId;
    const count = subPosts.length;

    let html = '';
    if (count > 0) {
      const toggleBtn = count > 1
        ? '<button type="button" class="thread-toggle-all" id="threadToggleAll" data-state="open">' + tr('Collapse all', 'طي الكل') + '</button>'
        : '';
      html += '<div class="thread-divider"><span>↳ ' + tr('Thread', 'الخيط') + ' · ' + count + ' ' + tr(count === 1 ? 'entry' : 'entries', count === 1 ? 'إضافة' : 'إضافات') + '</span>' + toggleBtn + '</div>';
      html += '<div class="thread-list">' + subPosts.map((sub, i) => renderSubPostCard(sub, authorProfile, parentPost, i)).join('') + '</div>';
      // When sub-posts exist in thread, render actions inside a dedicated card at the end of the thread
      html += '<div class="thread-actions-card">' + renderPostActions(parentPost) + '</div>';
    }

    if (isOwner) {
      html += '<div class="thread-composer" id="threadComposer">' +
        '<div class="thread-composer-header">' +
          '<div><strong>' + tr('Add to thread', 'أضف للخيط') + '</strong><small> — ' + tr('only visible on this post page', 'مرئي فقط في صفحة هذا المنشور') + '</small></div>' +
        '</div>' +
        '<input type="text" id="subPostTitle" placeholder="' + tr('Thread post title…', 'عنوان منشور الخيط…') + '" maxlength="160">' +
        '<textarea id="subPostContent" placeholder="' + tr('Continue your thread…', 'تابع خيطك…') + '" rows="3" maxlength="10000"></textarea>' +
        '<div class="thread-composer-image-preview" id="threadImgPreview"></div>' +
        '<div class="thread-composer-footer">' +
          '<label class="thread-add-image-btn" for="threadImageFile">📷 ' + tr('Add image', 'أضف صورة') + '</label>' +
          '<input type="file" id="threadImageFile" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">' +
          '<button class="thread-submit-btn" id="threadSubmitBtn" type="button">' + tr('Add to thread ↵', 'أضف للخيط ↵') + '</button>' +
        '</div>' +
        '<p class="thread-status" id="threadStatus"></p>' +
      '</div>';
    }

    threadSection.innerHTML = html;
    bindPostActions(threadSection, [parentPost]);

    if (count > 0) {
      // Toggle all button
      $('threadToggleAll')?.addEventListener('click', () => {
        const btn = $('threadToggleAll');
        const isOpen = btn.dataset.state === 'open';
        threadSection.querySelectorAll('details.sub-post-card').forEach(d => { d.open = !isOpen; });
        btn.dataset.state = isOpen ? 'closed' : 'open';
        btn.textContent = isOpen ? tr('Expand all', 'توسيع الكل') : tr('Collapse all', 'طي الكل');
      });

      bindSubPostEvents(threadSection, subPosts, parentPost);
    }
    // Composer logic
    if (isOwner) {
      _threadImages = [];
      const imgFile = $('threadImageFile');
      const imgPreview = $('threadImgPreview');
      const statusEl = $('threadStatus');
      const submitBtn = $('threadSubmitBtn');
      if (imgFile) {
        imgFile.addEventListener('change', async () => {
          const files = [...imgFile.files];
          for (const file of files) {
            if (_threadImages.length >= 10) break;
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            _threadImages.push({ dataUrl, mimeType: file.type, id: Math.random().toString(36).slice(2) });
          }
          imgFile.value = '';
          _renderThreadImagePreview(document.getElementById('threadComposer'));
        });
      }
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const title = ($('subPostTitle')?.value || '').trim();
          const content = ($('subPostContent')?.value || '').trim();
          if (!title || !content) { statusEl.textContent = tr('Add a title and content.', 'أضف عنواناً ومحتوى.'); return; }
          submitBtn.disabled = true;
          statusEl.textContent = tr('Publishing…', 'جارٍ النشر…');
          try {
            const chunkData = await Promise.all(_threadImages.map(async img => {
              const base64 = img.dataUrl.split(',')[1] || '';
              const chunks = [];
              for (let i = 0; i < base64.length; i += 750000) chunks.push(base64.slice(i, i + 750000));
              return { mimeType: img.mimeType, chunkCount: chunks.length, dataUrl: img.dataUrl };
            }));
            const created = await callFunction('createCommunityPost', {
              type: 'text', title, content,
              communitySlug: parentPost.communitySlug || 'main',
              parentPostId: parentPost.id,
              mediaCount: _threadImages.length,
            });
            if (_threadImages.length) {
              statusEl.textContent = tr('Uploading images…', 'جارٍ رفع الصور…');
              await uploadPostImages(created.postId, _threadImages.map((img, i) => ({ ...img, chunkCount: chunkData[i].chunkCount })));
              await callFunction('finalizeCommunityPostMedia', { postId: created.postId });
            }
            _threadImages = [];
            $('subPostTitle').value = '';
            $('subPostContent').value = '';
            statusEl.textContent = '';
            clearDirty();
            showToast(tr('Added to thread!', 'تمت الإضافة للخيط!'));
            await loadAndRenderThread(parentPost);
          } catch (err) {
            console.error(err);
            statusEl.textContent = err.message || tr('Could not publish thread post.', 'تعذر نشر منشور الخيط.');
            submitBtn.disabled = false;
          }
        });
      }
      $('subPostTitle')?.addEventListener('input', () => markDirty('threadComposer', isArabic() ? 'كتابة في الخيط — تغييرات غير محفوظة' : 'Drafting thread post — unsaved changes'));
      $('subPostContent')?.addEventListener('input', () => markDirty('threadComposer', isArabic() ? 'كتابة في الخيط — تغييرات غير محفوظة' : 'Drafting thread post — unsaved changes'));
    }
  } catch (err) {
    console.error('[Thread]', err);
    threadSection.innerHTML = '<p class="notice error">' + tr('Thread could not be loaded.', 'تعذر تحميل الخيط.') + '</p>';
  }
}

async function loadPosts(preserveContent = false) {
  const target = $('posts');
  if (!target) {
    if (isProjectsPage) return loadMemberPortfoliosHub();
    return;
  }
  const paintSequence = ++postPaintSequence;
  target.setAttribute('aria-busy', 'true');
  if (!preserveContent || !target.children.length) target.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    const params = new URLSearchParams(location.search);
    // A comments sheet uses `post` only to make its URL shareable. It must not
    // turn the background feed into a single-post view when the post changes.
    const selectedPostId = params.get('comments') === '1' ? null : params.get('post');
    const feedScope = [selectedPostId || '', activeAreaSlug || '', feedMode, communityType, communitySort].join('|');
    if (feedScope !== lastFeedScope) {
      lastFeedScope = feedScope;
      feedVisibleLimit = 18;
    }
    if (!preserveContent && !selectedPostId) {
      feedRefreshCycle++;
    }
    let sourceDocs;
    if (selectedPostId) {
      const selectedSnapshot = await getDoc(doc(db, 'communityPosts', selectedPostId));
      sourceDocs = selectedSnapshot.exists() ? [selectedSnapshot] : [];
    } else {
      sourceDocs = (await getFeedPosts(activeAreaSlug)).docs;
    }
    const allPosts = sourceDocs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.archived !== true && post.published !== false && !post.isSubPost)
      .filter(canViewSpacePost);
    if ($('postStat')) $('postStat').textContent = allPosts.length;
    if ($('projectStat')) getDocs(query(collection(db, 'portfolioProfiles'), where('status', '==', 'published')))
      .then(snapshot => { if ($('projectStat')) $('projectStat').textContent = snapshot.size; })
      .catch(() => { if ($('projectStat')) $('projectStat').textContent = '0'; });

    let posts = allPosts;
    if (selectedPostId) {
      posts = posts.filter(post => post.id === selectedPostId);
    } else {
      if (activeAreaSlug) posts = posts.filter(post => post.communitySlug === activeAreaSlug);
      else {
        if (feedMode === 'following' && currentUser) posts = posts.filter(post => post.userId === currentUser.uid || connectedUserIds.has(post.userId) || connectedSpaceSlugs.has(post.communitySlug) || communityAreas[post.communitySlug]?.creatorId === currentUser.uid);
        posts = posts.filter(post => post.communitySlug === 'main' || communityAreas[post.communitySlug]?.showInMainThread !== false);
      }
      if (communityType !== 'both') {
        posts = posts.filter(post => communityType === 'text'
          ? !isProject(post) && !isQuestion(post)
          : post.type === communityType);
      }
    }
    // Hydrating a post requires its author, reactions, comments, and sometimes
    // media. Keep that work to the cards the user can actually see now.
    const availablePostCount = posts.length;
    let rankedCandidatePool = posts;
    if (!selectedPostId) {
      if (communitySort === 'smart' || (!activeAreaSlug && feedMode === 'discover')) {
        const previewCandidates = rankedCandidatePool.map(post => ({
          ...post,
          meta: { profile: {}, score: Number(post.score) || 0, mine: 0, commentsCount: Number(post.commentsCount) || 0 }
        }));
        rankedCandidatePool = rankDiscoverPosts(previewCandidates);
      } else if (communitySort === 'upvoted') {
        rankedCandidatePool.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      } else {
        rankedCandidatePool.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      }
      posts = rankedCandidatePool.slice(0, feedVisibleLimit);
    }
    if (posts.length) {
      const previewPosts = posts.map(post => ({
        ...post,
        meta:{profile:{}, score:Number(post.score) || 0, mine:0, commentsCount:Number(post.commentsCount) || 0}
      }));
      $('feedCount').textContent = selectedPostId ? '' : isArabic() ? previewPosts.length + ' \u0645\u0646\u0634\u0648\u0631' : previewPosts.length + (previewPosts.length === 1 ? ' post' : ' posts');
      target.innerHTML = previewPosts.map((post, index) => renderPostCard(post, index, Boolean(selectedPostId))).join('') + (selectedPostId ? '<div id="threadSection" class="thread-section"></div><div id="inlineCommentsSection" class="inline-comments-section"></div>' : '');
      bindPostActions(target, previewPosts);
      if (selectedPostId && previewPosts[0]) {
        loadAndRenderThread(previewPosts[0]);
        loadAndRenderInlineComments(previewPosts[0]);
      }
      if (!selectedPostId && posts.length < availablePostCount) {
        target.insertAdjacentHTML('beforeend', '<button class="secondary-button feed-load-more" type="button">' + tr('Load more posts','تحميل المزيد من المنشورات') + '</button>');
        target.querySelector('.feed-load-more').addEventListener('click', () => { feedVisibleLimit += 18; loadPosts(true); });
      }
      target.setAttribute('aria-busy', 'false');

      // Paint post text immediately. Profiles, counters, and media are filled
      // in without holding the splash screen or blocking interaction.
      Promise.all(posts.map(async post => {
        const hydrated = await loadPostImage(post);
        return {...hydrated, meta:await getPostMeta(hydrated)};
      })).then(hydratedPosts => {
        if (paintSequence !== postPaintSequence) return;
        if (communitySort === 'smart') hydratedPosts = rankDiscoverPosts(hydratedPosts);
        else hydratedPosts.sort((a, b) => communitySort === 'upvoted'
          ? b.meta.score - a.meta.score || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        target.innerHTML = hydratedPosts.map((post, index) => renderPostCard(post, index, Boolean(selectedPostId))).join('') + (selectedPostId ? '<div id="threadSection" class="thread-section"></div><div id="inlineCommentsSection" class="inline-comments-section"></div>' : '');
        if (!selectedPostId) hydratedPosts.forEach(p => sessionSeenPosts.add(p.id));
        bindPostActions(target, hydratedPosts);
        if (selectedPostId && hydratedPosts[0]) {
          loadAndRenderThread(hydratedPosts[0]);
          loadAndRenderInlineComments(hydratedPosts[0]);
        }
        if (!selectedPostId && hydratedPosts.length < availablePostCount) {
          target.insertAdjacentHTML('beforeend', '<button class="secondary-button feed-load-more" type="button">' + tr('Load more posts','تحميل المزيد من المنشورات') + '</button>');
          target.querySelector('.feed-load-more').addEventListener('click', () => { feedVisibleLimit += 18; loadPosts(true); });
        }
      }).catch(error => console.warn('[Community] Post details are still loading.', error));
      return;
    }
    posts = await Promise.all(posts.map(async post => {
      const hydrated = await loadPostImage(post);
      return {...hydrated, meta:await getPostMeta(hydrated)};
    }));
    if (communitySort === 'smart') posts = rankDiscoverPosts(posts);
    else posts.sort((a, b) => communitySort === 'upvoted'
        ? b.meta.score - a.meta.score || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (!selectedPostId) posts.forEach(p => sessionSeenPosts.add(p.id));

    $('feedCount').textContent = selectedPostId ? '' : isArabic() ? posts.length + ' منشور' : posts.length + (posts.length === 1 ? ' post' : ' posts');
    if (!posts.length) {
      const copy = selectedPostId
        ? [tr('Post unavailable','المنشور غير متاح'), tr('This post may have been removed or the link is incorrect.','ربما حُذف المنشور أو أن الرابط غير صحيح.')]
        : activeAreaSlug
            ? [tr('This space is ready','هذه المساحة جاهزة'), tr('Be the first member to post in a/','كن أول عضو ينشر في a/') + activeAreaSlug + '.']
            : feedMode === 'following' && currentUser
              ? [tr('Build your community feed','أنشئ خلاصتك المجتمعية'), tr('Connect with people or spaces, or open Discover to find conversations.','تواصل مع أشخاص أو مساحات، أو افتح الاكتشاف للعثور على حوارات.')]
              : [tr('A quiet studio — for now','الاستوديو هادئ حالياً'), tr('Be the first member to start this conversation.','كن أول عضو يبدأ هذا الحوار.')];
      const discoverAction = !selectedPostId && !activeAreaSlug && feedMode === 'following' ? '<button class="empty-discover" type="button" data-empty-discover>' + tr('Open Discover','فتح الاكتشاف') + ' <span aria-hidden="true">→</span></button>' : '';
      target.innerHTML = '<div class="empty-state"><span class="empty-mark">A</span><h3>' + copy[0] + '</h3><p>' + copy[1] + '</p>' + discoverAction + '</div>';
      target.querySelector('[data-empty-discover]')?.addEventListener('click', () => navigateTo('/community.html?feed=discover', false));
    } else {
      target.innerHTML = posts.map((post, index) => renderPostCard(post, index, Boolean(selectedPostId))).join('') + (selectedPostId ? '<div id="threadSection" class="thread-section"></div><div id="inlineCommentsSection" class="inline-comments-section"></div>' : '');
      bindPostActions(target, posts);
      if (selectedPostId && posts[0]) {
        loadAndRenderThread(posts[0]);
        loadAndRenderInlineComments(posts[0]);
      }
    }
  } catch (error) {
    console.error(error);
    const selectedPost = new URLSearchParams(location.search).get('post');
    target.innerHTML = selectedPost
      ? '<div class="connections-empty"><span>!</span><h2>' + tr('Post unavailable','المنشور غير متاح') + '</h2><p>' + tr('This post is not available to your account.','هذا المنشور غير متاح لحسابك.') + '</p></div>'
      : '<p class="notice error">' + tr('The community feed is taking a break. Please try again in a moment.','خلاصة المجتمع غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.') + '</p>';
  } finally {
    target.setAttribute('aria-busy', 'false');
  }
}

function renderThread(comment, byParent) {
  const children = byParent.get(comment.id) || [];
  const editedMarker = comment.editedAt ? '<span class="comment-edited">' + tr('Edited','تم التعديل') + '</span>' : '';
  const isAiComment = comment.userId === 'aias_assistant' || comment.isAi === true;
  const aiBadge = isAiComment ? '<span class="ai-badge-pill">AI</span>' : '';
  return [
    '<article class="comment' + (isAiComment ? ' is-ai-comment' : '') + '">',
      '<div class="comment-head"><a class="comment-author" href="' + profileUrl(comment.userId, '') + '"><strong>' + escapeHtml(comment.userName || tr('Member','عضو')) + '</strong>' + (comment.isBusiness ? businessBadgeMarkup({isBusiness:true, businessStatus:'active', username:comment.userUsername, id:comment.userId}, true) : '') + aiBadge + '</a><span class="comment-time">' + escapeHtml(formatDate(comment.createdAt)) + editedMarker + '</span></div>',
      '<div class="comment-text">' + renderMentionedText(comment.text) + '</div>',
      '<div class="comment-actions">',
        currentUser ? '<button class="comment-action" type="button" data-reply="' + comment.id + '" data-user="' + escapeHtml(comment.userId) + '" data-name="' + escapeHtml(comment.userName || tr('Member','عضو')) + '">' + tr('Reply','رد') + '</button>' : '',
        children.length ? '<button class="comment-action" type="button" data-thread="' + comment.id + '" aria-expanded="false">' + (isArabic() ? 'عرض ' + children.length + ' رد' : 'Show ' + children.length + ' ' + (children.length === 1 ? 'reply' : 'replies')) + '</button>' : '',
        currentUser?.uid === comment.userId ? '<button class="comment-action" type="button" data-edit-comment="' + comment.id + '" data-comment-text="' + escapeHtml(comment.text) + '">' + tr('Edit','تعديل') + '</button>' : '',
        currentUser?.uid === comment.userId ? '<button class="comment-action" type="button" data-delete-comment="' + comment.id + '">' + tr('Delete','حذف') + '</button>' : '',
      '</div>',
      '<div class="reply-slot"></div>',
      children.length ? '<div class="comment-children" data-children="' + comment.id + '" hidden>' + children.map(child => renderThread(child, byParent)).join('') + '</div>' : '',
    '</article>'
  ].join('');
}

async function loadAndRenderInlineComments(post) {
  const container = $('inlineCommentsSection');
  if (!container) return;
  container.innerHTML = '<div class="inline-comments-card"><p class="notice" style="font-size:.78rem;">' + tr('Loading comments…', 'جارٍ تحميل التعليقات…') + '</p></div>';
  try {
    const commentsSnapshot = await getDocs(query(collection(db, 'communityPosts', post.id, 'comments'), orderBy('createdAt', 'asc'), limit(100)));
    const comments = commentsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderInlineCommentsMarkup(container, post, comments);

    unsubscribeInlineComments?.();
    let initialInlineReady = false;
    unsubscribeInlineComments = onSnapshot(query(collection(db, 'communityPosts', post.id, 'comments'), orderBy('createdAt', 'asc'), limit(100)), snap => {
      if (!initialInlineReady) { initialInlineReady = true; return; }
      const updatedComments = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      renderInlineCommentsMarkup(container, post, updatedComments);
    });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<div class="inline-comments-card"><p class="notice error">' + tr('Comments are unavailable right now.', 'التعليقات غير متاحة حالياً.') + '</p></div>';
  }
}

function renderInlineCommentsMarkup(container, post, comments) {
  const knownIds = new Set(comments.map(comment => comment.id));
  const byParent = new Map();
  comments.forEach(comment => {
    if (!comment.parentId) {
      if (!byParent.has(null)) byParent.set(null, []);
      byParent.get(null).push(comment);
    } else if (knownIds.has(comment.parentId)) {
      if (!byParent.has(comment.parentId)) byParent.set(comment.parentId, []);
      byParent.get(comment.parentId).push(comment);
    }
  });
  byParent.forEach(items => items.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  const roots = byParent.get(null) || [];

  container.innerHTML = [
    '<section class="inline-comments-card" id="inlineCommentsCard">',
      '<div class="inline-comments-header">',
        '<h3 class="inline-comments-title">',
          '<span>' + tr('Comments', 'التعليقات') + '</span>',
          '<span class="inline-comments-count">' + comments.length + '</span>',
        '</h3>',
      '</div>',
      currentUser
        ? '<form class="comment-form inline-comment-form" data-comment="' + post.id + '">' +
            '<input class="mention-input" required maxlength="2000" autocomplete="off" aria-autocomplete="list" placeholder="' + (isQuestion(post) ? tr('Write an answer…', 'اكتب إجابة…') : tr('Add to the conversation…', 'أضف إلى الحوار…')) + '" aria-label="' + (isQuestion(post) ? tr('Write an answer', 'اكتب إجابة') : tr('Add a comment', 'أضف تعليقاً')) + '">' +
            '<button class="comment-submit">' + (isQuestion(post) ? tr('Answer', 'إجابة') : tr('Post', 'نشر')) + '</button>' +
          '</form>'
        : '<p class="notice" style="margin-bottom:16px;"><a href="' + loginUrl() + '">' + tr('Sign in', 'سجّل الدخول') + '</a> ' + tr('to join the discussion.', 'للانضمام إلى النقاش.') + '</p>',
      '<div class="inline-comments-list">',
        roots.length ? roots.map(comment => renderThread(comment, byParent)).join('') : '<div class="empty-state" style="padding:24px 0;"><span class="empty-mark">+</span><h3>' + (isQuestion(post) ? tr('Share the first answer', 'شارك أول إجابة') : tr('Start the conversation', 'ابدأ الحوار')) + '</h3><p>' + (isQuestion(post) ? tr('Offer experience, a reference, or a useful direction.', 'شارك تجربة أو مرجعاً أو اتجاهاً مفيداً.') : tr('Ask a question or leave thoughtful feedback.', 'اطرح سؤالاً أو اترك ملاحظة بنّاءة.')) + '</p></div>',
      '</div>',
    '</section>'
  ].join('');

  bindCommentActions(post.id, post, container, true);
}

async function openComments(postId, updateRoute) {
  if (updateRoute) {
    const params = new URLSearchParams(location.search);
    const addedPost = !params.has('post');
    params.set('post', postId);
    params.set('comments', '1');
    history.pushState({communityOverlay:true, addedPost}, '', '/community.html?' + params.toString());
  }
  activeCommentsPostId = postId;
  $('commentsOverlay').hidden = false;
  document.body.classList.add('comments-open');
  $('commentsSheetBody').innerHTML = '<div class="post-skeleton short"></div>';
  try {
    const [postSnapshot, commentsSnapshot] = await Promise.all([
      getDoc(doc(db, 'communityPosts', postId)),
      getDocs(query(collection(db, 'communityPosts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(100)))
    ]);
    if (!postSnapshot.exists()) throw new Error(tr('Post not found','المنشور غير موجود'));
    const post = {id:postId, ...postSnapshot.data()};
    const comments = commentsSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
    const knownIds = new Set(comments.map(comment => comment.id));
    const byParent = new Map();
    comments.forEach(comment => {
      if (!comment.parentId) {
        if (!byParent.has(null)) byParent.set(null, []);
        byParent.get(null).push(comment);
      } else if (knownIds.has(comment.parentId)) {
        if (!byParent.has(comment.parentId)) byParent.set(comment.parentId, []);
        byParent.get(comment.parentId).push(comment);
      }
    });
    byParent.forEach(items => items.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    const roots = byParent.get(null) || [];
    document.querySelector('.comments-sheet .mini-kicker').textContent = isQuestion(post) ? tr('OPEN ANSWERS','إجابات مفتوحة') : tr('DISCUSSION','النقاش');
    $('commentsSheetTitle').textContent = post.title || tr('Comments','التعليقات');
    $('commentsSheetBody').innerHTML = [
      '<div class="comments">',
        roots.length ? roots.map(comment => renderThread(comment, byParent)).join('') : '<div class="empty-state"><span class="empty-mark">+</span><h3>' + (isQuestion(post) ? tr('Share the first answer','شارك أول إجابة') : tr('Start the conversation','ابدأ الحوار')) + '</h3><p>' + (isQuestion(post) ? tr('Offer experience, a reference, or a useful direction.','شارك تجربة أو مرجعاً أو اتجاهاً مفيداً.') : tr('Ask a question or leave thoughtful feedback.','اطرح سؤالاً أو اترك ملاحظة بنّاءة.')) + '</p></div>',
        currentUser
          ? '<form class="comment-form" data-comment="' + postId + '"><input class="mention-input" required maxlength="2000" autocomplete="off" aria-autocomplete="list" placeholder="' + (isQuestion(post) ? tr('Write an answer…','اكتب إجابة…') : tr('Add to the conversation…','أضف إلى الحوار…')) + '" aria-label="' + (isQuestion(post) ? tr('Write an answer','اكتب إجابة') : tr('Add a comment','أضف تعليقاً')) + '"><button class="comment-submit">' + (isQuestion(post) ? tr('Answer','إجابة') : tr('Post','نشر')) + '</button></form>'
          : '<p class="notice"><a href="' + loginUrl() + '">' + tr('Sign in','سجّل الدخول') + '</a> ' + tr('to join the discussion.','للانضمام إلى النقاش.') + '</p>',
      '</div>'
    ].join('');
    bindCommentActions(postId, post, $('commentsSheetBody'), false);
    unsubscribeComments?.();
    let commentsReady = false;
    unsubscribeComments = onSnapshot(query(collection(db, 'communityPosts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(100)), () => {
      if (!commentsReady) { commentsReady = true; return; }
      if (activeCommentsPostId === postId) openComments(postId, false);
    });
    $('commentsOverlay').querySelector('.comments-close').focus();
  } catch (error) {
    console.error(error);
    $('commentsSheetBody').innerHTML = '<p class="notice error">' + tr('Comments are unavailable right now.','التعليقات غير متاحة حالياً.') + '</p>';
  }
}

function bindCommentActions(postId, post, target = $('commentsSheetBody'), isInline = false) {
  if (!target) return;
  target.querySelectorAll('[data-thread]').forEach(button => button.addEventListener('click', () => {
    const box = target.querySelector('[data-children="' + button.dataset.thread + '"]');
    if (!box) return;
    box.hidden = !box.hidden;
    button.setAttribute('aria-expanded', String(!box.hidden));
    button.textContent = box.hidden ? (isArabic() ? 'عرض ' + box.children.length + ' رد' : 'Show ' + box.children.length + ' ' + (box.children.length === 1 ? 'reply' : 'replies')) : tr('Hide replies','إخفاء الردود');
  }));
  target.querySelectorAll('[data-reply]').forEach(button => button.addEventListener('click', () => {
    target.querySelectorAll('.reply-slot').forEach(slot => { slot.innerHTML = ''; });
    const slot = button.closest('.comment').querySelector('.reply-slot');
    slot.innerHTML = '<form class="reply-form"><textarea class="mention-input" maxlength="2000" required autocomplete="off" aria-autocomplete="list" placeholder="' + tr('Reply to ','الرد على ') + escapeHtml(button.dataset.name) + '"></textarea><button class="comment-submit">' + tr('Reply','رد') + '</button></form>';
    slot.querySelector('textarea').focus();
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const text = slot.querySelector('textarea').value.trim();
      if (!text || !currentUser) return;
      const commentRef = await callFunction('createCommunityComment', {postId, text, parentId:button.dataset.reply});
      const mentions = await resolveMentions(text);
      await Promise.all([
        Promise.resolve(),
        sendMentionNotifications(post, {...mentions, userIds:mentions.userIds.filter(userId => userId !== button.dataset.user)}, commentRef.commentId)
      ]);
      if (isInline) await loadAndRenderInlineComments(post);
      else await openComments(postId, false);
    });
  }));
  target.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm(tr('Delete this comment permanently?','هل تريد حذف هذا التعليق نهائياً؟'))) return;
    await callFunction('deleteCommunityComment', {postId, commentId:button.dataset.deleteComment});
    if (isInline) await loadAndRenderInlineComments(post);
    else await openComments(postId, false);
  }));
  target.querySelectorAll('[data-edit-comment]').forEach(button => button.addEventListener('click', () => {
    const comment = button.closest('.comment');
    const textBox = comment.querySelector('.comment-text');
    const actions = comment.querySelector('.comment-actions');
    const originalText = button.dataset.commentText || '';
    textBox.hidden = true;
    actions.hidden = true;
    const form = document.createElement('form');
    form.className = 'comment-edit-form';
    form.innerHTML = '<textarea class="mention-input" maxlength="2000" required autocomplete="off" aria-autocomplete="list"></textarea><div class="comment-edit-actions"><button class="comment-submit" type="submit">' + tr('Save','حفظ') + '</button><button class="comment-edit-cancel" type="button">' + tr('Cancel','إلغاء') + '</button></div>';
    const textarea = form.querySelector('textarea');
    textarea.value = originalText;
    textBox.after(form);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    form.querySelector('.comment-edit-cancel').addEventListener('click', () => { form.remove(); textBox.hidden = false; actions.hidden = false; });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text || text === originalText.trim()) { form.querySelector('.comment-edit-cancel').click(); return; }
      form.querySelector('button[type="submit"]').disabled = true;
      await callFunction('updateCommunityComment', {postId, commentId:button.dataset.editComment, text});
      if (isInline) await loadAndRenderInlineComments(post);
      else await openComments(postId, false);
    });
  }));
  target.querySelectorAll('[data-comment]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = form.querySelector('input');
    if (!input.value.trim() || !currentUser) return;
    const submit = form.querySelector('button');
    submit.disabled = true;
    const text = input.value.trim();
    const commentRef = await callFunction('createCommunityComment', {postId, text, parentId:null});
    const mentions = await resolveMentions(text);
    await Promise.all([
      Promise.resolve(),
      sendMentionNotifications(post, {...mentions, userIds:mentions.userIds.filter(userId => userId !== post.userId)}, commentRef.commentId)
    ]);
    if (isInline) await loadAndRenderInlineComments(post);
    else await openComments(postId, false);
  }));
}

let isClosingComments = false;
function closeCommentsUi() {
  unsubscribeComments?.();
  unsubscribeComments = null;
  activeCommentsPostId = null;
  const overlay = $('commentsOverlay');
  if (!overlay || overlay.hidden) {
    document.body.classList.remove('comments-open');
    return;
  }
  if (isClosingComments) return;
  isClosingComments = true;
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove('closing');
    document.body.classList.remove('comments-open');
    isClosingComments = false;
  }, 220);
}

function closeComments() {
  const params = new URLSearchParams(location.search);
  if (!params.has('comments')) {
    closeCommentsUi();
    return;
  }
  params.delete('comments');
  if (history.state?.communityOverlay && history.state.addedPost) params.delete('post');
  history.replaceState({}, '', '/community.html?' + params.toString());
  closeCommentsUi();
}

let composerThreadEntries = [];

function renderComposerThreadEntries() {
  const container = $('composerThreadEntriesList');
  if (!container) return;
  container.innerHTML = composerThreadEntries.map((entry, index) =>
    '<div class="composer-thread-item" data-entry-index="' + index + '">' +
      '<div class="composer-thread-item-header">' +
        '<span>#' + (index + 1) + ' ' + tr('Thread entry', 'قسم في الخيط') + '</span>' +
        '<button type="button" class="composer-thread-item-remove" data-remove-entry="' + index + '" title="' + tr('Remove', 'إزالة') + '">✕ ' + tr('Remove', 'إزالة') + '</button>' +
      '</div>' +
      '<input type="text" class="composer-thread-entry-title" value="' + escapeHtml(entry.title) + '" placeholder="' + tr('Entry title (optional)…', 'عنوان القسم (اختياري)…') + '" maxlength="160">' +
      '<textarea class="composer-thread-entry-content" rows="2" placeholder="' + tr('Entry content…', 'محتوى القسم…') + '" maxlength="2000">' + escapeHtml(entry.content) + '</textarea>' +
      '<div class="composer-thread-item-images">' +
        entry.images.map((img, imgIdx) =>
          '<div class="composer-thread-img-thumb">' +
            '<img src="' + escapeHtml(img.dataUrl) + '" alt="">' +
            '<button type="button" data-remove-entry-img="' + index + '|' + imgIdx + '">×</button>' +
          '</div>'
        ).join('') +
        (entry.images.length < 4 ?
          '<label class="composer-thread-img-btn" for="entryImgFile_' + index + '">📷 ' + tr('Add image', 'أضف صورة') + '</label>' +
          '<input type="file" id="entryImgFile_' + index + '" accept="image/jpeg,image/png,image/webp" multiple style="display:none;" data-entry-file-index="' + index + '">'
        : '') +
      '</div>' +
    '</div>'
  ).join('');

  container.querySelectorAll('.composer-thread-entry-title').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.closest('.composer-thread-item').dataset.entryIndex);
      if (composerThreadEntries[idx]) composerThreadEntries[idx].title = input.value;
    });
  });
  container.querySelectorAll('.composer-thread-entry-content').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const idx = Number(textarea.closest('.composer-thread-item').dataset.entryIndex);
      if (composerThreadEntries[idx]) composerThreadEntries[idx].content = textarea.value;
    });
  });
  container.querySelectorAll('[data-remove-entry]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeEntry);
      composerThreadEntries.splice(idx, 1);
      renderComposerThreadEntries();
    });
  });
  container.querySelectorAll('[data-remove-entry-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [entryIdx, imgIdx] = btn.dataset.removeEntryImg.split('|').map(Number);
      if (composerThreadEntries[entryIdx]) {
        composerThreadEntries[entryIdx].images.splice(imgIdx, 1);
        renderComposerThreadEntries();
      }
    });
  });
  container.querySelectorAll('[data-entry-file-index]').forEach(input => {
    input.addEventListener('change', async () => {
      const entryIdx = Number(input.dataset.entryFileIndex);
      const entry = composerThreadEntries[entryIdx];
      if (!entry) return;
      for (const file of [...input.files]) {
        if (entry.images.length >= 4) break;
        try {
          const dataUrl = await preparePostImage(file);
          entry.images.push({ dataUrl, mimeType: file.type });
        } catch (e) {
          showToast(e.message);
        }
      }
      renderComposerThreadEntries();
    });
  });
}

$('addComposerThreadEntryBtn')?.addEventListener('click', () => {
  composerThreadEntries.push({ title: '', content: '', images: [] });
  renderComposerThreadEntries();
});

function renderPostTypeFields() {
  const question = $('postType').value === 'question';
  $('postCommunityGroup').hidden = false;
  $('postImageGroup').hidden = question;
  if ($('postThreadComposerGroup')) $('postThreadComposerGroup').hidden = question;
  $('postContent').required = question;
  document.querySelector('label[for="postContent"]').textContent = question ? tr('Add helpful context','أضف سياقاً مفيداً') : tr('Tell the community more (optional)','أخبر المجتمع بالمزيد (اختياري)');
  $('postContent').placeholder = question ? tr('What have you tried, and what kind of answer would help?','ماذا جرّبت، وما نوع الإجابة التي ستفيدك؟') : tr('Share context, a fresh perspective, or invite feedback…','شارك السياق أو منظوراً جديداً أو اطلب آراء الأعضاء…');
  $('postTitle').placeholder = question ? tr('Ask one clear, open question','اطرح سؤالاً مفتوحاً وواضحاً') : tr('Share one clear insight or idea','شارك فكرة أو رؤية واضحة');
}

async function preparePostImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(tr('Choose a JPEG, PNG, or WebP image.','اختر صورة JPEG أو PNG أو WebP.'));
  if (file.size > POST_IMAGE_MAX_BYTES) throw new Error(tr('Choose an image smaller than 10 MB.','اختر صورة أصغر من 10 ميغابايت.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(tr('This image could not be read.','تعذر قراءة هذه الصورة.')));
    reader.readAsDataURL(file);
  });
}

function imageChunkCount(dataUrl) {
  const separator = String(dataUrl || '').indexOf(',');
  const payload = separator >= 0 ? dataUrl.slice(separator + 1) : String(dataUrl || '');
  return payload ? Math.ceil(payload.length / POST_IMAGE_CHUNK_SIZE) : 0;
}

async function uploadPostImages(postId, images) {
  const paths = [];
  for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
    const image = images[imageIndex];
    const extension = {'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp'}[image.mimeType] || 'jpg';
    const path = `community/posts/${postId}/${String(imageIndex).padStart(2, '0')}.${extension}`;
    await uploadString(storageRef(storage, path), image.dataUrl, 'data_url', {contentType:image.mimeType});
    paths.push(path);
  }
  return paths;
}

async function storeCommunityImage(path, value) {
  const target = storageRef(storage, path);
  if (!value) {
    await deleteObject(target).catch(error => { if (error.code !== 'storage/object-not-found') throw error; });
    return '';
  }
  if (!String(value).startsWith('data:image/')) return value;
  const contentType = String(value).slice(5, String(value).indexOf(';'));
  await uploadString(target, value, 'data_url', {contentType});
  return getDownloadURL(target);
}

function postImageUrls(post) {
  if (Array.isArray(post?.imageDataUrls) && post.imageDataUrls.length) return post.imageDataUrls;
  return post?.imageDataUrl ? [post.imageDataUrl] : [];
}

async function cachedStorageDownloadURL(path) {
  const key = SMART_CACHE_PREFIX + 'media-url:' + path;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.url && Date.now() - Number(saved.savedAt || 0) < 7 * 24 * 60 * 60 * 1000) return saved.url;
  } catch {}
  const url = await getDownloadURL(storageRef(storage, path));
  try { localStorage.setItem(key, JSON.stringify({url, savedAt:Date.now()})); } catch {}
  return url;
}

async function protectedStorageObjectURL(path) {
  if (protectedMediaUrls.has(path)) return protectedMediaUrls.get(path);
  const pending = getBlob(storageRef(storage, path)).then(blob => {
    const url = URL.createObjectURL(blob);
    protectedMediaUrls.set(path, url);
    return url;
  }).catch(error => {
    protectedMediaUrls.delete(path);
    throw error;
  });
  protectedMediaUrls.set(path, pending);
  return pending;
}

async function loadPostImage(post) {
  if (Array.isArray(post.imagePaths) && post.imagePaths.length) {
    try {
      const loader = post.visibility === 'private' ? protectedStorageObjectURL : cachedStorageDownloadURL;
      const urls = await Promise.all(post.imagePaths.map(path => loader(path)));
      return {...post, imageDataUrls:urls, imageDataUrl:urls[0] || ''};
    } catch (error) { console.warn('[Community] Stored post media could not be loaded.', error); }
  }
  if (!post.imageChunkCount || post.imageChunkCount < 1 || postImageUrls(post).length) return post;
  try {
    const chunks = (await getDocs(collection(db, 'communityPosts', post.id, 'images'))).docs.map(item => item.data());
    if (chunks.length !== post.imageChunkCount) return post;
    const counts = Array.isArray(post.imageChunkCounts) ? post.imageChunkCounts : null;
    const mimeTypes = Array.isArray(post.imageMimeTypes) ? post.imageMimeTypes : null;
    if (counts?.length && counts.length === mimeTypes?.length) {
      const urls = counts.map((count, imageIndex) => {
        const imageChunks = chunks.filter(chunk => chunk.imageIndex === imageIndex).sort((a,b) => a.index - b.index);
        if (imageChunks.length !== count || imageChunks.some((chunk, index) => chunk.index !== index)) return '';
        return 'data:' + mimeTypes[imageIndex] + ';base64,' + imageChunks.map(chunk => chunk.data).join('');
      });
      if (urls.some(url => !url)) return post;
      return {...post, imageDataUrls:urls, imageDataUrl:urls[0] || ''};
    }
    const legacyChunks = chunks.sort((a,b) => a.index - b.index);
    if (legacyChunks.some((chunk, index) => chunk.index !== index)) return post;
    const dataUrl = 'data:' + post.imageMimeType + ';base64,' + legacyChunks.map(chunk => chunk.data).join('');
    return {...post, imageDataUrls:[dataUrl], imageDataUrl:dataUrl};
  } catch (error) { console.warn('[Community] Post image could not be loaded.', error); return post; }
}

function renderPostImageComposer() {
  const preview = $('postImagePreview');
  $('postImageCount').textContent = postImages.length + ' / ' + POST_IMAGE_MAX_COUNT;
  preview.hidden = postImages.length === 0;
  $('removePostImage').hidden = postImages.length === 0;
  preview.innerHTML = postImages.map((image, index) => '<article><img src="' + escapeHtml(image.dataUrl) + '" alt=""><span>' + (index + 1) + '</span><button type="button" data-remove-gallery-image="' + escapeHtml(image.id) + '" aria-label="' + escapeHtml(tr('Remove image ','إزالة الصورة ') + (index + 1)) + '">×</button></article>').join('');
}

function clearPostImageComposer() {
  postImages = [];
  $('postImageFile').value = '';
  renderPostImageComposer();
  $('postImageStatus').textContent = tr('Maximum 10 MB per image. You can add more images in another selection.','الحد الأقصى 10 ميغابايت لكل صورة. يمكنك إضافة صور أخرى باختيار جديد.');
}

function renderPostGate() {
  const allowed = currentUser && currentProfile?.profileComplete && currentProfile?.username;
  if (allowed) {
    $('postGate').innerHTML = currentProfile.mainThreadPostingAccess !== false ? '' : '<p class="notice warning">' + tr('You do not have main-thread posting access yet. You may publish only inside private spaces. Apply from your profile for public posting access.','ليس لديك صلاحية النشر في المسار الرئيسي بعد. يمكنك النشر داخل المساحات الخاصة فقط. قدّم طلباً من ملفك للحصول على صلاحية النشر العام.') + '</p>';
    $('postIdentity').innerHTML = tr('Posting as ','تنشر باسم ') + '<strong>@' + escapeHtml(currentProfile.username) + '</strong>';
  } else if (currentUser) {
    const action = currentProfile?.profileComplete && !currentProfile?.username ? tr('Claim a unique username on','اختر اسم مستخدم فريداً في') : tr('Complete','أكمل');
    $('postGate').innerHTML = '<p class="notice">' + action + ' <a href="' + profileUrl(currentUser.uid, currentProfile?.username) + '">' + tr('your community profile','ملفك المجتمعي') + '</a> ' + tr('before publishing.','قبل النشر.') + '</p>';
  } else {
    $('postGate').innerHTML = '<p class="notice">' + tr('You need to','يجب أن') + ' <a href="' + loginUrl() + '">' + tr('sign in','تسجّل الدخول') + '</a> ' + tr('before publishing to the community.','قبل النشر في المجتمع.') + '</p>';
  }
  if (!allowed) $('postIdentity').innerHTML = '';
  $('postFormCard').hidden = !allowed;
}

function renderSpaceGate() {
  const allowed = currentUser && currentProfile?.profileComplete && currentProfile?.username;
  if (allowed) {
    const restricted = currentProfile.mainThreadPostingAccess === false;
    $('spaceGate').innerHTML = restricted ? '<p class="notice warning">' + tr('Without main-thread posting access, you can create private spaces only.','من دون صلاحية النشر في المسار الرئيسي، يمكنك إنشاء مساحات خاصة فقط.') + '</p>' : '';
    if (restricted) {
      $('spaceIsPrivate').checked = true;
      $('spaceIsPrivate').disabled = true;
      $('spaceIsViewOnly').checked = false;
      $('spaceIsViewOnly').disabled = true;
      $('spaceShowInMainThread').checked = false;
      $('spaceShowInMainThread').disabled = true;
    } else {
      $('spaceIsPrivate').disabled = false;
      $('spaceIsViewOnly').disabled = false;
      $('spaceShowInMainThread').disabled = false;
    }
    $('spaceIdentity').innerHTML = tr('Creating as ','تنشئ باسم ') + '<strong>@' + escapeHtml(currentProfile.username) + '</strong> · ' + tr('Handles are permanent and unique.','المعرّفات دائمة وفريدة.') ;
  } else if (currentUser) {
    const action = currentProfile?.profileComplete && !currentProfile?.username ? tr('Claim a unique username on','اختر اسم مستخدم فريداً في') : tr('Complete','أكمل');
    $('spaceGate').innerHTML = '<p class="notice">' + action + ' <a href="' + profileUrl(currentUser.uid, currentProfile?.username) + '">' + tr('your community profile','ملفك المجتمعي') + '</a> ' + tr('before creating a space.','قبل إنشاء مساحة.') + '</p>';
  } else {
    $('spaceGate').innerHTML = '<p class="notice">' + tr('You need to','يجب أن') + ' <a href="' + loginUrl() + '">' + tr('sign in','تسجّل الدخول') + '</a> ' + tr('before creating a community space.','قبل إنشاء مساحة مجتمعية.') + '</p>';
  }
  $('spaceFormCard').hidden = !allowed;
}

function renderProfilePosts() {
  const target = $('profilePosts');
  if (activeProfileId && loadedProfilePostsFor !== activeProfileId) {
    target.className = profilePostFilter === 'thread' ? 'post-list profile-post-thread' : 'profile-post-grid';
    target.innerHTML = '<div class="post-skeleton short"></div>';
    return;
  }
  const allowedPosts = activeProfilePosts.filter(post => showOwnPrivateSpacePosts || !communityAreas[post.communitySlug]?.isPrivate);
  const posts = profilePostFilter === 'grid' ? allowedPosts.filter(post => postImageUrls(post).length > 0 || safeMarketAttachmentImage(post.marketAttachment?.imageUrl)) : allowedPosts;
  document.querySelectorAll('[data-profile-filter]').forEach(button => button.classList.toggle('active', button.dataset.profileFilter === profilePostFilter));
  const visibleCount = isArabic() ? posts.length.toLocaleString('ar-IQ') : posts.length.toLocaleString();
  const totalCount = isArabic() ? allowedPosts.length.toLocaleString('ar-IQ') : allowedPosts.length.toLocaleString();
  $('profilePostCount').textContent = profilePostFilter === 'thread'
    ? (isArabic() ? totalCount + ' منشوراً' : totalCount + (allowedPosts.length === 1 ? ' post' : ' posts'))
    : tr(visibleCount + ' image posts', visibleCount + ' منشوراً مصوراً');
  if (!posts.length) {
    const filtered = allowedPosts.length > 0;
    target.className = profilePostFilter === 'thread' ? 'post-list profile-post-thread' : 'profile-post-grid';
    target.innerHTML = '<div class="empty-state"><span class="empty-mark">A</span><h3>' + (filtered ? tr('No image posts yet','لا توجد منشورات مصورة بعد') : tr('No posts yet','لا توجد منشورات بعد')) + '</h3><p>' + (filtered ? tr('Switch to Thread to see all posts.','انتقل إلى المسار لرؤية كل المنشورات.') : tr('This member is still preparing their first idea.','لا يزال هذا العضو يحضّر فكرته الأولى.')) + '</p></div>';
    return;
  }
  if (profilePostFilter === 'thread') {
    target.className = 'post-list profile-post-thread';
    target.innerHTML = posts.map((post, index) => renderPostCard(post, index, false)).join('');
    bindPostActions(target, posts);
    return;
  }
  target.className = 'profile-post-grid';
  target.innerHTML = posts.map(post => {
      const href = isProject(post) ? 'project.html?communityPost=' + encodeURIComponent(post.id) : '/community.html?post=' + encodeURIComponent(post.id);
      const owner = currentUser?.uid === post.userId;
      const profileImage = postImageUrls(post)[0] || safeMarketAttachmentImage(post.marketAttachment?.imageUrl) || safeMarketAttachmentImage(post.portfolioAttachment?.imageUrl) || '';
      const media = isProject(post) && post.behanceSrc
        ? '<iframe src="' + escapeHtml(post.behanceSrc) + '" title="' + escapeHtml(post.title) + '" loading="lazy" tabindex="-1"></iframe>'
        : profileImage
          ? '<img src="' + escapeHtml(profileImage) + '" alt="' + escapeHtml(post.title) + '" loading="lazy">'
          : '<div class="profile-post-placeholder"><span>' + escapeHtml(postLabel(post)) + '</span><b>' + escapeHtml(initials(post.title)) + '</b></div>';
      return [
        '<article class="profile-post-tile' + (isProject(post) ? ' project' : '') + (profileImage ? ' has-image' : '') + '">',
          '<a class="profile-post-main" href="' + href + '">',
          '<div class="profile-post-media">' + media + '</div>',
          '<div class="profile-post-overlay"><div><span class="profile-post-kind">' + postLabel(post).toUpperCase() + '</span>' + (post.editedAt || post.updatedAt ? '<span class="profile-post-edited">' + tr('Edited','تم التعديل') + '</span>' : '') + (communityAreas[post.communitySlug]?.isPrivate ? '<span class="profile-private-post">' + tr('Private space','مساحة خاصة') + '</span>' : '') + '</div><strong class="profile-post-title">' + escapeHtml(post.title) + '</strong><span class="tile-stats"><span>✦ ' + post.meta.score + '</span><span>◯ ' + post.meta.commentsCount + '</span>' + (postImageUrls(post).length > 1 ? '<span>▧ ' + postImageUrls(post).length + '</span>' : '') + '</span></div>',
          '</a>',
          owner ? '<div class="profile-post-actions"><button type="button" data-edit-profile-post="' + escapeHtml(post.id) + '">' + tr('Edit','تعديل') + '</button><button type="button" data-archive-profile-post="' + escapeHtml(post.id) + '">' + tr('Archive','أرشفة') + '</button><button type="button" data-delete-profile-post="' + escapeHtml(post.id) + '">' + tr('Delete','حذف') + '</button></div>' : '',
        '</article>'
      ].join('');
    }).join('');
}

function closePostEditor() {
  activeEditPostId = null;
  $('postEditStatus').textContent = '';
  if ($('postEditDialog').open) $('postEditDialog').close();
}

async function getOrFetchPost(postId) {
  let post = (activeProfilePosts || []).find(item => item.id === postId) || (activePosts || []).find(item => item.id === postId) || (currentDetailedPost?.id === postId ? currentDetailedPost : null);
  if (!post && postId) {
    try {
      const snap = await getDoc(doc(db, 'communityPosts', postId));
      if (snap.exists()) post = { id: snap.id, ...snap.data() };
    } catch (e) {
      console.warn('[Community] Could not fetch post by id.', e);
    }
  }
  return post;
}

async function openPostEditor(postId) {
  const post = await getOrFetchPost(postId);
  if (!post || (currentUser?.uid !== post.userId && !isSuperAdmin())) return;
  activeEditPostId = postId;
  $('postEditId').value = postId;
  $('postEditHeading').value = post.title || '';
  $('postEditBody').value = post.content || post.summary || '';
  if ($('postEditBehance')) $('postEditBehance').value = post.behanceSrc || '';
  if ($('postEditBehanceGroup')) $('postEditBehanceGroup').hidden = !isProject(post);
  $('postEditBodyLabel').textContent = isProject(post) ? tr('Project description','وصف المشروع') : tr('Content','المحتوى');
  $('postEditStatus').textContent = '';
  $('postEditDialog').showModal();
  $('postEditHeading').focus();
}

async function archiveOwnedPost(postId) {
  const post = await getOrFetchPost(postId);
  if (!post || (currentUser?.uid !== post.userId && !isSuperAdmin())) return;
  if (!confirm(tr('Archive this post? It will be hidden from feeds and moved to your Archived posts.','هل تريد أرشفة هذا المنشور؟ سيتم إخفاؤه من الخلاصات ونقله إلى منشوراتك المؤرشفة.'))) return;
  try {
    await callFunction('archiveOwnCommunityPost', {postId});
    activeProfilePosts = (activeProfilePosts || []).filter(item => item.id !== postId);
    activePosts = (activePosts || []).filter(item => item.id !== postId);
    invalidateCommunitySearchIndex();
    if (currentActiveViewName === 'profile' || activeProfileId) await loadProfilePosts(activeProfileId || currentUser?.uid, true);
    else handleRoute(false);
    showToast(tr('Post archived.','تمت أرشفة المنشور.'));
  } catch (error) {
    console.error(error);
    showToast(error.message || tr('This post could not be archived.','تعذر أرشفة هذا المنشور.'));
  }
}

async function deleteOwnedPost(postId) {
  const post = await getOrFetchPost(postId);
  if (!post || (currentUser?.uid !== post.userId && !isSuperAdmin())) return;
  if (!confirm(tr('Delete this post permanently? This cannot be undone.','هل تريد حذف هذا المنشور نهائياً؟ لا يمكن التراجع عن ذلك.'))) return;
  try {
    await callFunction('deleteOwnCommunityPost', {postId});
    activeProfilePosts = (activeProfilePosts || []).filter(item => item.id !== postId);
    activePosts = (activePosts || []).filter(item => item.id !== postId);
    invalidateCommunitySearchIndex();
    if (currentActiveViewName === 'profile' || activeProfileId) renderProfilePosts();
    else handleRoute(false);
    showToast(tr('Post deleted.','تم حذف المنشور.'));
  } catch (error) {
    console.error(error);
    showToast(error.message || tr('This post could not be deleted.','تعذر حذف هذا المنشور.'));
  }
}

async function loadProfilePosts(uid, owner) {
  const target = $('profilePosts');
  target.innerHTML = '<div class="post-skeleton short"></div>';
  try {
    const profilePostsQuery = query(collection(db, 'communityPosts'), where('archived', '==', false), where('userId', '==', uid));
    let posts = (await smartQuery('posts:user:' + uid, profilePostsQuery)).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.archived !== true && post.published !== false && post.userId === uid && !post.isSubPost)
      .filter(post => owner || !communityAreas[post.communitySlug]?.isPrivate)
      .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    activeProfilePosts = await Promise.all(posts.map(async post => {
      const hydrated = post.type === 'text' ? await loadPostImage(post) : post;
      return {...hydrated, meta:await getPostMeta(post)};
    }));
    loadedProfilePostsFor = uid;
    renderProfilePosts();
  } catch (error) {
    console.error(error);
    activeProfilePosts = [];
    loadedProfilePostsFor = uid;
    target.innerHTML = '<p class="notice error">' + tr('Profile posts are unavailable right now.','منشورات الملف الشخصي غير متاحة حالياً.') + '</p>';
  }
}

async function loadProfile(uid, routedProfile) {
  const target = $('profileContent');
  if (!uid) {
    activeProfilePosts = [];
    loadedProfilePostsFor = null;
    target.className = '';
    target.innerHTML = routedProfile
      ? '<p class="notice error">' + tr('This profile could not be found. Check the username and try again.','تعذر العثور على هذا الملف. تحقق من اسم المستخدم وحاول مجدداً.') + '</p>'
      : '<p class="notice">' + tr('Sign in to create and view your community profile.','سجّل الدخول لإنشاء ملفك المجتمعي وعرضه.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    $('profilePosts').innerHTML = '';
    $('profilePostCount').textContent = '';
    return;
  }
  target.className = 'profile-skeleton';
  target.innerHTML = '';
  activeProfilePosts = [];
  loadedProfilePostsFor = null;
  try {
    const profile = await getProfile(uid);
    let hasPublishedPortfolio = false;
    let hasActiveBusiness = Boolean(profile.isBusiness === true && profile.businessStatus === 'active');
    try {
      const [portfolioSnapshot, bizSnapshot] = await Promise.all([
        getDoc(doc(db, 'portfolioProfiles', uid)),
        !hasActiveBusiness ? getDoc(doc(db, 'businessAccounts', uid)).catch(() => null) : Promise.resolve(null)
      ]);
      hasPublishedPortfolio = portfolioSnapshot.exists() && portfolioSnapshot.data().status === 'published';
      if (bizSnapshot && bizSnapshot.exists() && bizSnapshot.data().status === 'active') {
        hasActiveBusiness = true;
      }
    } catch (error) {
      console.warn('Could not check public portfolio or business status', error);
    }
    const owner = currentUser?.uid === uid;
    showOwnPrivateSpacePosts = false;
    $('profilePrivatePostsToggle').hidden = !owner;
    $('profilePrivatePostsToggle').classList.remove('active');
    $('profilePrivatePostsToggle').setAttribute('aria-pressed', 'false');
    activeProfileId = uid;
    profileConnectionActive = connectedUserIds.has(uid);
    let profileConnectionCount = 0;
    try { profileConnectionCount = (await getDocs(collection(db, 'users', uid, 'followers'))).size; } catch {}
    const displayName = profile.displayName || (owner ? currentUser?.displayName : '') || tr('Community member','عضو في المجتمع');
    const photo = profile.photoBase64 || profile.photoURL || (owner ? currentUser?.photoURL : '') || '';
    const banner = profile.bannerURL || profile.bannerBase64 || '';
    const locationLine = [profile.school, profile.city].filter(Boolean).join(' · ') || tr('AIAS Basra community','مجتمع AIAS البصرة');
    const interests = String(profile.interests || '').split(',').map(item => item.trim()).filter(Boolean);
    document.title = (profile.username ? 'p/' + profile.username : displayName) + tr(' — AIAS Basra Community',' — مجتمع AIAS البصرة');
    target.className = 'profile-hero';
    target.innerHTML = [
      '<div class="profile-banner-media">' + (banner ? '<img src="' + escapeHtml(banner) + '" alt="">' : '') + '</div>',
      '<div class="profile-top">',
        avatarMarkup(displayName, photo, 'profile-avatar', profile.verified === true),
        '<div class="profile-title"><h2>' + escapeHtml(displayName) + '</h2><span class="profile-handle">' + (profile.username ? '@' + escapeHtml(profile.username) : tr('No username claimed','لم يتم اختيار اسم مستخدم')) + '</span><p>' + escapeHtml(locationLine) + '</p></div>',
      '</div>',
      '<div class="profile-connection-stat"><span aria-hidden="true">◎</span><strong id="profileConnectionCount">' + profileConnectionCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + '</strong><span id="profileConnectionLabel">' + tr('connected people','أشخاص متصلون') + '</span>' + (owner ? '<a href="/community.html?view=manage-profile&tab=connections" data-route="manage-profile">' + tr('Manage','إدارة') + ' →</a>' : '') + '</div>',
      '<div style="position:static; display:flex; flex-wrap:wrap; align-items:center; gap:9px; margin-top:16px;">' +
        (owner
          ? '<a href="/community.html?view=manage-profile" data-route="manage-profile" class="primary-button" style="position:static; min-height:38px; padding:0 16px; border-radius:11px; color:#fff; background:var(--wine); font-weight:800; font-size:.8rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px;"><span>⚙ ' + tr('Manage profile & account','إدارة الملف والحساب') + '</span></a>'
          : '<button id="profileConnect" type="button" style="position:static; min-height:38px; padding:0 16px; border:1px solid var(--line); border-radius:11px; color:var(--wine); background:var(--card); cursor:pointer; font-weight:800; font-size:.8rem; box-shadow:0 4px 12px rgba(61,17,21,.07);">' + (profileConnectionActive ? '<span>✓ ' + tr('Connected','متصل') + '</span>' : '<span>' + tr('Connect','تواصل') + '</span>') + '</button>') +
        (hasPublishedPortfolio ? (
          hasActiveBusiness
            ? '<a href="portfolio.html?id=' + encodeURIComponent(uid) + '" target="_blank" rel="noopener" style="position:static; display:inline-flex; align-items:center; gap:6px; min-height:38px; padding:0 16px; border-radius:11px; background:#fbf5f2; color:var(--wine); border:1px solid #ebdcd5; text-decoration:none; font-weight:800; font-size:.8rem; box-shadow:0 4px 12px rgba(61,17,21,.07);">' +
                '<span>🏛️ ' + tr('Business Portfolio','معرض أعمال وحساب موثّق') + '</span><span class="pro-verified-badge-mini" style="font-size:0.6rem;width:15px;height:15px;">✓</span><span aria-hidden="true">→</span>' +
              '</a>'
            : '<a href="portfolio.html?id=' + encodeURIComponent(uid) + '" target="_blank" rel="noopener" style="position:static; display:inline-flex; align-items:center; gap:6px; min-height:38px; padding:0 16px; border-radius:11px; background:var(--sand-light); color:var(--wine); border:1px solid var(--line); text-decoration:none; font-weight:800; font-size:.8rem; box-shadow:0 4px 12px rgba(61,17,21,.07);">' +
                '<span>' + tr('Design Portfolio','معرض الأعمال') + '</span><span aria-hidden="true">→</span>' +
              '</a>'
        ) : '') +
      '</div>',
      owner ? (profile.mainThreadPostingAccess !== false
        ? '<section class="posting-access-card approved"><strong>' + tr('Main-thread posting approved','تمت الموافقة على النشر في المسار الرئيسي') + '</strong><p>' + tr('You can post publicly and create public spaces.','يمكنك النشر علناً وإنشاء مساحات عامة.') + '</p></section>'
        : '<section class="posting-access-card warning"><strong>' + tr('Main-thread posting access required','مطلوب تصريح للنشر في المسار الرئيسي') + '</strong><p>' + tr('You can browse and post in private spaces, but cannot post publicly or create public spaces until an admin approves you.','يمكنك التصفح والنشر في المساحات الخاصة، لكن لا يمكنك النشر علناً أو إنشاء مساحات عامة حتى يوافق أحد المشرفين.') + '</p><button id="requestMainThreadAccess" type="button"' + (profile.mainThreadAccessStatus === 'pending' ? ' disabled' : '') + '>' + (profile.mainThreadAccessStatus === 'pending' ? tr('Request pending','الطلب قيد المراجعة') : tr('Apply for access','طلب التصريح')) + '</button></section>') : '',
      '<p class="profile-bio">' + escapeHtml(profile.bio || tr('No bio added yet.','لم تُضف نبذة بعد.')) + '</p>',
      interests.length ? '<div class="interest-row">' + interests.map(item => '<span>' + escapeHtml(item) + '</span>').join('') + '</div>' : '',
      owner ? [
        '<form id="profileForm" class="profile-form"' + (profile.profileComplete === true ? ' hidden' : '') + '>',
          '<div class="profile-media-grid">',
            '<section class="profile-media-field"><span>' + tr('Profile image','صورة الملف الشخصي') + '</span><div id="profilePhotoPreview" class="profile-media-preview avatar">' + (photo ? '<img src="' + escapeHtml(photo) + '" alt="">' : tr('No image','لا توجد صورة')) + '</div><input id="profilePhotoFile" type="file" accept="image/*"><div class="profile-media-actions"><small id="profilePhotoStatus">' + tr('Square image recommended','يُفضّل استخدام صورة مربعة') + '</small><button id="removeProfilePhoto" class="profile-media-remove" type="button">' + tr('Remove','إزالة') + '</button></div></section>',
            '<section class="profile-media-field"><span>' + tr('Profile banner','غلاف الملف الشخصي') + '</span><div id="profileBannerPreview" class="profile-media-preview banner">' + (banner ? '<img src="' + escapeHtml(banner) + '" alt="">' : tr('No banner','لا يوجد غلاف')) + '</div><input id="profileBannerFile" type="file" accept="image/*"><div class="profile-media-actions"><small id="profileBannerStatus">' + tr('Wide image recommended','يُفضّل استخدام صورة عريضة') + '</small><button id="removeProfileBanner" class="profile-media-remove" type="button">' + tr('Remove','إزالة') + '</button></div></section>',
          '</div>',
          '<div class="form-grid"><div class="form-group"><label for="profileName">' + tr('Name','الاسم') + '</label><input id="profileName" required value="' + escapeHtml(displayName) + '"></div><div class="form-group"><label for="profileUsername">' + tr('Unique username','اسم مستخدم فريد') + '</label><input id="profileUsername" required minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}" value="' + escapeHtml(profile.username || '') + '" ' + (profile.username ? 'readonly' : '') + ' placeholder="your_handle"><small id="profileUsernameStatus" class="username-check ' + (profile.username ? 'valid' : '') + '">' + (profile.username ? tr('Your permanent profile address is ','عنوان ملفك الدائم هو ') + 'p/' + escapeHtml(profile.username) : tr('Availability will be checked as you type.','سيتم التحقق من التوفر أثناء الكتابة.')) + '</small></div></div>',
          '<div class="form-group"><label for="profileSchool">' + tr('School / organization','الجامعة / المؤسسة') + '</label><input id="profileSchool" required value="' + escapeHtml(profile.school || '') + '"></div>',
          '<div class="form-grid"><div class="form-group"><label for="profileCity">' + tr('City','المدينة') + '</label><input id="profileCity" required value="' + escapeHtml(profile.city || '') + '"></div><div class="form-group"><label for="profileInterests">' + tr('Interests','الاهتمامات') + '</label><input id="profileInterests" value="' + escapeHtml(profile.interests || '') + '" placeholder="' + tr('Urbanism, interiors, sketching','العمران، التصميم الداخلي، الرسم') + '"></div></div>',
          '<div class="form-group"><label for="profileBio">' + tr('Bio','نبذة') + '</label><textarea id="profileBio" required>' + escapeHtml(profile.bio || '') + '</textarea></div>',
          '<button class="primary-button" type="submit"><span>' + tr('Save profile','حفظ الملف') + '</span><b aria-hidden="true">→</b></button>',
        '</form>'
      ].join('') : ''
    ].join('');
    if (!owner) {
      $('profileConnect').addEventListener('click', async event => {
        const button = event.currentTarget;
        if (!currentUser) { location.href = loginUrl(); return; }
        button.disabled = true;
        try {
          const next = await toggleUserConnection(uid);
          profileConnectionActive = next;
          profileConnectionCount += next ? 1 : -1;
          button.classList.toggle('connected', next);
          button.querySelector('span').textContent = next ? tr('Connected','متصل') : tr('Connect','تواصل');
          $('profileConnectionCount').textContent = Math.max(0, profileConnectionCount).toLocaleString(isArabic() ? 'ar-IQ' : undefined);
          showToast(next ? tr('Connection added.','تمت إضافة التواصل.') : tr('Connection removed.','تمت إزالة التواصل.'));
        } catch (error) {
          console.error(error);
          showToast(tr('This connection could not be updated.','تعذر تحديث هذا التواصل.'));
        } finally { button.disabled = false; }
      });
    }
    if (owner) {
      const accessButton = $('requestMainThreadAccess');
      if (accessButton) accessButton.addEventListener('click', async () => {
        accessButton.disabled = true;
        try {
          await callFunction('requestMainThreadPostingAccess', {});
          profileCache.delete(uid);
          currentProfile = await getProfile(uid);
          showToast(tr('Your access request was sent to the admins.','تم إرسال طلب التصريح إلى المشرفين.'));
          await loadProfile(uid);
        } catch (error) {
          showToast(error.message || tr('The request could not be sent.','تعذر إرسال الطلب.'));
          accessButton.disabled = false;
        }
      });
      if ($('profileForm')) {
        let nextPhotoBase64 = profile.photoURL || profile.photoBase64 || '';
        let nextBannerBase64 = profile.bannerURL || profile.bannerBase64 || '';
        let profileMediaBusy = 0;
        const updateMediaPreview = (targetId, value, emptyCopy) => {
          const el = $(targetId);
          if (el) el.innerHTML = value ? '<img src="' + escapeHtml(value) + '" alt="">' : emptyCopy;
        };
        const bindMediaUpload = (inputId, statusId, previewId, kind) => {
          const input = $(inputId);
          if (!input) return;
          input.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            profileMediaBusy += 1;
            if ($(statusId)) $(statusId).textContent = tr('Preparing image…','جارٍ تجهيز الصورة…');
            try {
              const value = await prepareProfileImage(file, kind);
              if (kind === 'avatar') nextPhotoBase64 = value;
              else nextBannerBase64 = value;
              updateMediaPreview(previewId, value, '');
              if ($(statusId)) $(statusId).textContent = tr('Ready to save','جاهزة للحفظ');
            } catch (error) {
              console.error(error);
              if ($(statusId)) $(statusId).textContent = error.message || tr('Image could not be prepared.','تعذر تجهيز الصورة.');
              event.target.value = '';
            } finally {
              profileMediaBusy -= 1;
            }
          });
        };
        bindMediaUpload('profilePhotoFile', 'profilePhotoStatus', 'profilePhotoPreview', 'avatar');
        bindMediaUpload('profileBannerFile', 'profileBannerStatus', 'profileBannerPreview', 'banner');
        $('removeProfilePhoto')?.addEventListener('click', () => {
          nextPhotoBase64 = '';
          if ($('profilePhotoFile')) $('profilePhotoFile').value = '';
          updateMediaPreview('profilePhotoPreview', '', tr('No image','لا توجد صورة'));
          if ($('profilePhotoStatus')) $('profilePhotoStatus').textContent = tr('Image will be removed when saved','ستُزال الصورة عند الحفظ');
        });
        $('removeProfileBanner')?.addEventListener('click', () => {
          nextBannerBase64 = '';
          if ($('profileBannerFile')) $('profileBannerFile').value = '';
          updateMediaPreview('profileBannerPreview', '', tr('No banner','لا يوجد غلاف'));
          if ($('profileBannerStatus')) $('profileBannerStatus').textContent = tr('Banner will be removed when saved','سيُزال الغلاف عند الحفظ');
        });
        if (!profile.username && $('profileUsername')) {
          let usernameTimer;
          $('profileUsername').addEventListener('input', () => {
            clearTimeout(usernameTimer);
            usernameTimer = setTimeout(() => checkUsernameAvailability($('profileUsername'), $('profileUsernameStatus'), uid), 250);
          });
        }
        $('editProfile')?.addEventListener('click', () => {
          if ($('profileForm')) {
            $('profileForm').hidden = !$('profileForm').hidden;
            if (!$('profileForm').hidden) $('profileName')?.focus();
          }
        });
        const _profileFormDirtyHandler = () => markDirty(
          'profileForm',
          isArabic() ? 'لديك تغييرات في الملف الشخصي' : 'Editing profile — unsaved changes',
          () => $('profileForm')?.requestSubmit?.() || $('profileForm')?.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})),
          () => loadProfile(uid)
        );
        $('profileForm').addEventListener('input', _profileFormDirtyHandler, {passive:true});
        $('profileForm').addEventListener('submit', async event => {
          event.preventDefault();
          const button = event.submitter || $('profileForm').querySelector('button[type="submit"]');
          if (button) button.disabled = true;
          try {
            if (profileMediaBusy) throw new Error(tr('Wait for the images to finish preparing.','انتظر حتى يكتمل تجهيز الصور.'));
            if (!profile.username) {
              const available = await checkUsernameAvailability($('profileUsername'), $('profileUsernameStatus'), uid);
              if (!available) throw new Error(tr('Choose an available username before saving your profile.','اختر اسم مستخدم متاحاً قبل حفظ ملفك.'));
            }
            const username = profile.username || normalizeUsername($('profileUsername').value);
            const [photoURL, bannerURL] = await Promise.all([
              storeCommunityImage(`community/profiles/${uid}/avatar`, nextPhotoBase64),
              storeCommunityImage(`community/profiles/${uid}/banner`, nextBannerBase64)
            ]);
            await callFunction('setCommunitySpaceConnection', {operation:'complete_profile',
              username,
              displayName: $('profileName').value.trim(),
              school: $('profileSchool').value.trim(),
              city: $('profileCity').value.trim(),
              interests: $('profileInterests').value.trim(),
              bio: $('profileBio').value.trim(),
              photoBase64: '',
              bannerBase64: '',
              photoURL,
              bannerURL
            });
            invalidateCommunitySearchIndex();
            profileCache.delete(uid);
            currentProfile = await getProfile(uid);
            const savedPhoto = currentProfile.photoBase64 || currentProfile.photoURL || currentUser.photoURL || '';
            const savedName = currentProfile.displayName || currentUser.displayName || tr('Member','عضو');
            if ($('memberAction')) $('memberAction').innerHTML = savedPhoto ? '<img src="' + escapeHtml(savedPhoto) + '" alt="' + escapeHtml(savedName) + '">' : '<span>' + escapeHtml(initials(savedName)) + '</span>';
            if ($('quickAvatar')) $('quickAvatar').innerHTML = savedPhoto ? '<img src="' + escapeHtml(savedPhoto) + '" alt="">' : escapeHtml(initials(savedName));
            clearDirty();
            showToast(tr('Profile updated.','تم تحديث الملف الشخصي.'));
            history.replaceState({}, '', profileUrl(uid, username));
            await loadProfile(uid);
          } catch (error) {
            showToast(error.message || tr('Your profile could not be updated.','تعذر تحديث ملفك الشخصي.'));
            if (button) button.disabled = false;
          }
        });
      }
    }
    await loadProfilePosts(uid, owner);
  } catch (error) {
    console.error(error);
    target.className = '';
    target.innerHTML = '<p class="notice error">' + tr('This profile is unavailable right now.','هذا الملف الشخصي غير متاح حالياً.') + '</p>';
  }
}

// ─── Index-page only event listeners ──────────────────────────────────────────
// Skip ALL of these on portfolios.html (body has class portfolios-standalone)
if (!document.body.classList.contains('portfolios-standalone')) {

document.addEventListener('click', event => {
  if (mentionMenu && !event.target.closest('.mention-menu') && event.target !== mentionMenuInput) closeMentionMenu();
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('data-route') || link.target || link.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const destination = new URL(link.href, location.href);
  const isCommunityDestination = /^\/(a|p)\/[^/]+\/?$/.test(destination.pathname) || ['/community.html','/community'].includes(destination.pathname);
  if (destination.origin !== location.origin || !isCommunityDestination) return;
  event.preventDefault();
  navigateTo(destination.href, false);
});

document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(link.href, false);
}));

document.querySelectorAll('[data-close-comments]').forEach(button => button.addEventListener('click', closeComments));
document.addEventListener('keydown', event => {
  if (mentionMenu && event.target === mentionMenuInput) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      mentionMenuIndex = (mentionMenuIndex + (event.key === 'ArrowDown' ? 1 : -1) + mentionMenuItems.length) % mentionMenuItems.length;
      paintMentionMenu();
      return;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && mentionMenuItems.length) {
      event.preventDefault();
      chooseMention();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionMenu();
      return;
    }
  }
  const tag = document.activeElement?.tagName;
  if (event.key === 'Escape' && !$('communitySearchResults').hidden) {
    closeCommunitySearch();
    return;
  }
  if (event.key === 'Escape' && activeCommentsPostId) closeComments();
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(tag)) {
    event.preventDefault();
    $('communitySearch').focus();
  }
});
document.addEventListener('input', event => {
  if (event.target.matches('.mention-input')) openMentionMenu(event.target);
});
document.addEventListener('click', event => {
  if (event.target.matches('.mention-input')) openMentionMenu(event.target);
});
window.addEventListener('resize', positionMentionMenu);
window.addEventListener('scroll', positionMentionMenu, true);
function syncCommentKeyboardOffset() {
  const active = document.activeElement;
  const editingComment = active?.matches?.('.comment-form input, .reply-form textarea');
  const viewport = window.visualViewport;
  const offset = editingComment && viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--community-keyboard-offset', Math.round(offset) + 'px');
}
window.visualViewport?.addEventListener('resize', syncCommentKeyboardOffset);
window.visualViewport?.addEventListener('scroll', syncCommentKeyboardOffset);
document.addEventListener('focusin', event => {
  if (!event.target.matches('.comment-form input, .reply-form textarea')) return;
  syncCommentKeyboardOffset();
  setTimeout(() => {
    syncCommentKeyboardOffset();
    event.target.scrollIntoView({block:'center', behavior:'smooth'});
  }, 160);
});
document.addEventListener('focusout', event => {
  if (event.target.matches('.comment-form input, .reply-form textarea')) setTimeout(syncCommentKeyboardOffset, 120);
});
window.addEventListener('popstate', (e) => {
  // If the image viewer is open, the back button should close it
  if (activeImagePost) {
    closeImageViewer();
    return;
  }
  closeCommunitySearch();
  handleRoute(false);
});

document.querySelectorAll('.filter-pill').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.profileFilter) return;
  if (button.dataset.sort) {
    communitySort = button.dataset.sort;
    localStorage.setItem('communitySort', communitySort);
    document.querySelectorAll('[data-sort]').forEach(item => item.classList.toggle('active', item === button));
  }
  if (button.dataset.type) {
    communityType = button.dataset.type;
    localStorage.setItem('communityType', communityType);
    document.querySelectorAll('[data-type]').forEach(item => item.classList.toggle('active', item === button));
  }
  loadPosts();
}));

document.querySelectorAll('[data-profile-filter]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  profilePostFilter = button.dataset.profileFilter;
  renderProfilePosts();
  requestAnimationFrame(renderProfilePosts);
}));
$('profilePrivatePostsToggle')?.addEventListener('click', () => {
  if (currentUser?.uid !== activeProfileId) return;
  showOwnPrivateSpacePosts = !showOwnPrivateSpacePosts;
  $('profilePrivatePostsToggle')?.classList.toggle('active', showOwnPrivateSpacePosts);
  $('profilePrivatePostsToggle')?.setAttribute('aria-pressed', String(showOwnPrivateSpacePosts));
  renderProfilePosts();
});
$('spaceDirectorySearch')?.addEventListener('input', () => {
  spaceDirectoryPage = 1;
  renderSpaceDirectory();
});
$('selectedShellSearch')?.addEventListener('input', renderSelectedShell);
$('connectionsSearch')?.addEventListener('input', renderConnectionManager);
document.querySelectorAll('[data-connection-type]').forEach(button => button.addEventListener('click', () => {
  connectionDirectoryType = button.dataset.connectionType;
  if ($('connectionsSearch')) $('connectionsSearch').value = '';
  renderConnectionManager();
}));
$('connectionsList')?.addEventListener('click', async event => {
  const userButton = event.target.closest('[data-disconnect-user]');
  const spaceButton = event.target.closest('[data-disconnect-space]');
  const button = userButton || spaceButton;
  if (!button || !currentUser) return;
  button.disabled = true;
  try {
    if (userButton) await toggleUserConnection(userButton.dataset.disconnectUser);
    else {
      const result = await toggleSpaceConnection(spaceButton.dataset.disconnectSpace);
      if (result === null) { button.disabled = false; return; }
    }
    await loadConnectionManager();
    showToast(tr('Connection removed.','تمت إزالة التواصل.'));
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(tr('This connection could not be removed.','تعذرت إزالة هذا التواصل.'));
  }
});
document.querySelectorAll('[data-space-sort]').forEach(button => button.addEventListener('click', () => {
  spaceDirectorySort = button.dataset.spaceSort;
  spaceDirectoryPage = 1;
  renderSpaceDirectory();
}));
document.querySelectorAll('[data-space-filter]').forEach(button => button.addEventListener('click', () => {
  spaceDirectoryFilter = button.dataset.spaceFilter;
  spaceDirectoryPage = 1;
  renderSpaceDirectory();
}));
document.querySelectorAll('[data-space-view]').forEach(button => button.addEventListener('click', () => {
  spaceDirectoryView = button.dataset.spaceView;
  localStorage.setItem('spaceDirectoryView', spaceDirectoryView);
  renderSpaceDirectory();
}));
$('spaceDirectoryPagination')?.addEventListener('click', event => {
  const button = event.target.closest('[data-space-page]');
  if (!button || button.disabled) return;
  spaceDirectoryPage = Number(button.dataset.spacePage);
  renderSpaceDirectory();
  $('spacesView')?.scrollIntoView({behavior:'smooth', block:'start'});
});

$('profilePosts')?.addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit-profile-post]');
  const archiveButton = event.target.closest('[data-archive-profile-post]');
  const deleteButton = event.target.closest('[data-delete-profile-post]');
  if (editButton) await openPostEditor(editButton.dataset.editProfilePost);
  if (archiveButton) await archiveOwnedPost(archiveButton.dataset.archiveProfilePost);
  if (deleteButton) await deleteOwnedPost(deleteButton.dataset.deleteProfilePost);
});
$('postEditClose')?.addEventListener('click', () => { clearDirty(); closePostEditor(); });
$('postEditCancel')?.addEventListener('click', () => { clearDirty(); closePostEditor(); });
$('postEditDialog')?.addEventListener('cancel', () => { activeEditPostId = null; clearDirty(); });
$('postEditDialog')?.addEventListener('click', event => { if (event.target === $('postEditDialog')) { clearDirty(); closePostEditor(); } });
$('postEditForm')?.addEventListener('input', () => {
  markDirty('postEditForm', isArabic() ? 'تعديل المنشور — تغييرات غير محفوظة' : 'Editing post — unsaved changes',
    () => $('postEditForm').requestSubmit?.() || $('postEditForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})),
    () => { clearDirty(); closePostEditor(); }
  );
}, {passive:true});
$('postEditForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const post = activeProfilePosts.find(item => item.id === activeEditPostId);
  if (!post || currentUser?.uid !== post.userId) return closePostEditor();
  const button = event.submitter;
  const title = $('postEditHeading').value.trim();
  const content = $('postEditBody').value.trim();
  const behanceSrc = isProject(post) ? extractBehanceEmbed($('postEditBehance')?.value || '') : post.behanceSrc || '';
  if (!title) {
    $('postEditStatus').textContent = tr('Add a title before saving.','أضف عنواناً قبل الحفظ.');
    return;
  }
  if (!content && (isProject(post) || isQuestion(post))) {
    $('postEditStatus').textContent = tr('Add content before saving.','أضف محتوى قبل الحفظ.');
    return;
  }
  if (isProject(post) && !behanceSrc) {
    $('postEditStatus').textContent = tr('Paste a valid Behance embed link.','الصق رابط تضمين صالحاً من Behance.');
    return;
  }
  button.disabled = true;
  try {
    const changes = {title, content, summary:content.slice(0,360), updatedAt:serverTimestamp(), editedAt:serverTimestamp()};
    if (isProject(post)) changes.behanceSrc = behanceSrc;
    await setDoc(doc(db, 'communityPosts', post.id), changes, {merge:true});
    activeProfilePosts = activeProfilePosts.map(item => item.id === post.id ? {...item, ...changes} : item);
    invalidateCommunitySearchIndex();
    clearDirty();
    closePostEditor();
    renderProfilePosts();
    showToast(tr('Post updated.','تم تحديث المنشور.'));
  } catch (error) {
    console.error(error);
    $('postEditStatus').textContent = tr('This post could not be updated.','تعذر تحديث هذا المنشور.');
  } finally {
    button.disabled = false;
  }
});

let searchTimer;
$('communitySearch')?.addEventListener('focus', event => runCommunitySearch(event.target.value));
$('communitySearch')?.addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runCommunitySearch(event.target.value), 130);
});
$('communitySearch')?.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if ($('communitySearchResults')?.hidden) runCommunitySearch(event.currentTarget.value);
    else moveCommunitySearchSelection(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    const options = [...($('communitySearchResults')?.querySelectorAll('[data-search-result]') || [])];
    const selected = options[communitySearchActiveIndex] || options[0];
    if (selected) {
      event.preventDefault();
      followCommunitySearchResult(selected);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeCommunitySearch();
  }
});
$('communitySearchResults')?.addEventListener('mousemove', event => {
  const hovered = event.target.closest('[data-search-result]');
  if (!hovered) return;
  const options = [...($('communitySearchResults')?.querySelectorAll('[data-search-result]') || [])];
  communitySearchActiveIndex = options.indexOf(hovered);
  options.forEach((option, index) => {
    const active = index === communitySearchActiveIndex;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
});
$('communitySearchResults')?.addEventListener('click', event => {
  const result = event.target.closest('[data-search-result]');
  if (!result || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  followCommunitySearchResult(result);
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.community-search-shell')) closeCommunitySearch();
  if (!event.target.closest('.notification-shell') && $('notificationPanel')) $('notificationPanel').hidden = true;
  if (!event.target.closest('.post-menu-wrap')) {
    document.querySelectorAll('.post-menu-dropdown:not([hidden])').forEach(el => { el.hidden = true; });
    document.querySelectorAll('.post-menu-trigger.active').forEach(el => { el.classList.remove('active'); });
  }
});
$('imageViewerBackdrop')?.addEventListener('click', closeImageViewer);
$('imageViewerClose')?.addEventListener('click', closeImageViewer);
$('imageViewerPrevious')?.addEventListener('click', () => stepImageViewer(-1));
$('imageViewerNext')?.addEventListener('click', () => stepImageViewer(1));
$('imageViewerActions')?.addEventListener('click', async event => {
  const vote = event.target.closest('[data-image-vote]');
  if (vote) { await voteFromImageViewer(Number(vote.dataset.imageVote)); return; }
  if (event.target.closest('[data-image-comments]') && activeImagePost) {
    const postId = activeImagePost.parentPost?.id || activeImagePost.id;
    closeImageViewer();
    await openComments(postId, true);
  }
});
document.addEventListener('keydown', event => {
  if ($('imageViewer')?.hidden) return;
  if (event.key === 'Escape') closeImageViewer();
  if (event.key === 'ArrowLeft') stepImageViewer(isArabic() ? 1 : -1);
  if (event.key === 'ArrowRight') stepImageViewer(isArabic() ? -1 : 1);
});

$('quickComposer')?.addEventListener('click', () => navigateTo(composerUrl(), false));
$('railSpacesExpand')?.addEventListener('click', () => { railSpacesExpanded = !railSpacesExpanded; renderCommunitySpaces(); });
$('areaCreate')?.addEventListener('click', () => navigateTo(composerUrl(), false));
$('areaMessages')?.addEventListener('click', async () => {
  if (!activeAreaSlug) return;
  navigateTo('/community.html?view=messages&area=' + encodeURIComponent(activeAreaSlug), false);
});
$('areaShare')?.addEventListener('click', async () => {
  const area = activeAreaSlug ? communityAreas[activeAreaSlug] : null;
  if (!area) return;
  await shareCommunityItem(
    {title:(area.name || 'a/' + activeAreaSlug) + ' — AIAS Basra Community', text:String(area.description || tr('Join this space on AIAS Basra Community.','انضم إلى هذه المساحة في مجتمع AIAS البصرة.')).slice(0, 180), url:canonicalSpaceUrl(activeAreaSlug)},
    tr('Space link copied.','تم نسخ رابط المساحة.'),
    tr('The space link could not be shared.','تعذرت مشاركة رابط المساحة.')
  );
});
$('areaManage')?.addEventListener('click', () => {
  const area = activeAreaSlug ? communityAreas[activeAreaSlug] : null;
  if (!area || !canManageSpace(activeAreaSlug)) return;
  if (area.creatorId === currentUser?.uid) openSpaceEditor();
  else navigateTo('/community.html?view=manage-spaces', false);
});
$('messageReplyCancel')?.addEventListener('click', () => setMessageReply());
$('messageImageRemove')?.addEventListener('click', clearMessageImage);
$('messageImageInput')?.addEventListener('change', event => {
  try { clearMessageVoice(); selectMessageImage(event.target.files?.[0]); }
  catch (error) { clearMessageImage(); showToast(error.message || tr('Image could not be selected.','تعذر اختيار الصورة.')); }
});
$('messageVoiceRecord')?.addEventListener('click', () => toggleMessageVoiceRecording().catch(error => { console.error(error); clearMessageVoice(); showToast(error.message || tr('Voice recording could not start.','تعذر بدء التسجيل الصوتي.')); }));
$('messageVoiceRemove')?.addEventListener('click', clearMessageVoice);
$('messagesList')?.addEventListener('scroll', event => {
  if (event.currentTarget.scrollTop <= 80) loadOlderSpaceMessages();
}, {passive:true});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeMessagesSpace?.slug) updateChatPresence(activeMessagesSpace.slug);
});
$('chatInboxSearch')?.addEventListener('input', event => {
  const value = String(event.target.value || '').trim().toLowerCase();
  $('chatInboxList')?.querySelectorAll('[data-chat-inbox-space]').forEach(row => { row.hidden = Boolean(value && !row.dataset.chatSearch.includes(value)); });
});
$('messageForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const spaceId = new URLSearchParams(location.search).get('area');
  const text = $('messageText').value.trim();
  if (!spaceId || (!text && !activeMessageImage && !activeMessageVoice)) return;
  const button = event.submitter || $('messageForm').querySelector('button[type="submit"]');
  const pendingId = appendPendingChatMessage({text, imageUrl:activeMessageImage?.previewUrl || '', audioUrl:activeMessageVoice?.previewUrl || '', audioDurationMs:activeMessageVoice?.durationMs || 0});
  button.disabled = true;
  $('messageImageInput').disabled = true;
  $('messageVoiceRecord').disabled = true;
  try {
    if (activeMessageImage) updatePendingChatMessage(pendingId, tr('Uploading photo…','جارٍ رفع الصورة…'));
    const imagePath = await uploadMessageImage(spaceId);
    const audioDurationMs = activeMessageVoice?.durationMs || 0;
    if (activeMessageVoice) updatePendingChatMessage(pendingId, tr('Uploading voice note…','جارٍ رفع الرسالة الصوتية…'));
    const audioPath = await uploadMessageVoice(spaceId);
    updatePendingChatMessage(pendingId, tr('Sending…','جارٍ الإرسال…'));
    await sendSpaceMessage(spaceId, {text, imagePath, audioPath, audioDurationMs, replyToId:activeMessageReply?.id || ''});
    updatePendingChatMessage(pendingId, tr('Sent','تم الإرسال'));
    const isAiTriggered = spaceId === 'aias-assistant' ||
                          /(?:^|\s)@(?:ai|AI|Ai|gemini|Gemini|aias|AIAS)(?:\s|$|[،!?.])/i.test(text) ||
                          (activeMessageReply?.senderId === 'aias_assistant' || activeMessageReply?.isAi === true);
    if (isAiTriggered) {
      showAiTypingIndicator();
    }
    window.setTimeout(() => $('messagesList').querySelector('[data-pending-message="' + CSS.escape(pendingId) + '"]')?.remove(), 1800);
    $('messageText').value = '';
    clearMessageImage();
    clearMessageVoice();
    setMessageReply();
  } catch (error) { console.error(error); showToast(error.message || tr('Message could not be sent.','تعذر إرسال الرسالة.')); }
  finally { button.disabled = false; $('messageImageInput').disabled = false; $('messageVoiceRecord').disabled = false; }
});
$('postShareClose').addEventListener('click', () => $('postShareDialog').close());
$('messageViewersClose').addEventListener('click', () => $('messageViewersDialog').close());
$('messageReactionClose').addEventListener('click', () => $('messageReactionDialog').close());
$('messageReactorsClose').addEventListener('click', () => $('messageReactorsDialog').close());
$('messageReactionPicker').addEventListener('click', async event => {
  const button = event.target.closest('[data-pick-reaction]');
  if (!button || !activeReactionMessageId || !activeMessagesSpace) return;
  $('messageReactionPicker').querySelectorAll('button').forEach(item => { item.disabled = true; });
  try { await setMessageReaction(activeReactionMessageId, button.dataset.pickReaction, button); $('messageReactionDialog').close(); }
  catch (error) { $('messageReactionPicker').querySelectorAll('button').forEach(item => { item.disabled = false; }); showToast(error.message || tr('Could not add reaction.','تعذر إضافة التفاعل.')); }
});
$('messagesOnline').addEventListener('click', () => openChatOnlineMembers().catch(console.error));
$('messagesTopTab').addEventListener('click', () => { showTopApplaudedMessages = !showTopApplaudedMessages; $('messagesTopTab').classList.toggle('active', showTopApplaudedMessages); $('messagesTopTab').textContent = showTopApplaudedMessages ? '← ' + tr('All','الكل') : '✦ ' + tr('Top','الأعلى'); repaintActiveSpaceMessages().catch(console.error); });
$('messagesMuteChatBtn')?.addEventListener('click', async () => {
  if (!activeMessagesSpace || !currentUser) return;
  const spaceSlug = activeMessagesSpace.slug;
  const currentlyMuted = currentMutedSpaceChats.has(spaceSlug);
  const nextMuted = !currentlyMuted;

  if (nextMuted) currentMutedSpaceChats.add(spaceSlug);
  else currentMutedSpaceChats.delete(spaceSlug);

  const muteBtn = $('messagesMuteChatBtn');
  if (muteBtn) {
    muteBtn.classList.toggle('is-muted', nextMuted);
    $('messagesMuteIcon').textContent = nextMuted ? '🔕' : '🔔';
    $('messagesMuteLabel').textContent = nextMuted ? tr('Muted', 'مكتوم') : tr('Mute', 'كتم');
  }

  try {
    await callFunction('toggleMuteSpaceChat', { spaceId: spaceSlug, muted: nextMuted });
    if (currentProfile) {
      currentProfile.mutedSpaceChats = [...currentMutedSpaceChats];
    }
    showToast(nextMuted
      ? tr('Chat muted. You will not receive notifications for this space.', 'تم كتم المحادثة. لن تتلقى إشعارات لهذه المساحة.')
      : tr('Chat unmuted. You will receive notifications according to your preferences.', 'تم إلغاء كتم المحادثة. ستتلقى الإشعارات وفق تفضيلاتك.')
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || tr('Could not update mute state.', 'تعذر تحديث حالة الكتم.'));
  }
});
$('chatOnlineClose').addEventListener('click', () => $('chatOnlineDialog').close());
$('postShareExternal').addEventListener('click', async () => {
  const post = activeSharePost;
  if (!post) return;
  await shareCommunityItem(
    {title:post.title + ' — AIAS Basra Community', text:plainPostText(post).slice(0, 140), url:canonicalPostUrl(post)},
    tr('Post link copied.','تم نسخ رابط المنشور.'),
    tr('The post link could not be shared.','تعذرت مشاركة رابط المنشور.')
  );
});
$('manageSpacesList').addEventListener('click', async event => {
  const activeMenu = event.target.closest('.space-member-menu');
  $('manageSpacesList').querySelectorAll('.space-member-menu[open]').forEach(menu => { if (menu !== activeMenu) menu.open = false; });
  const memberTab = event.target.closest('[data-member-tab]');
  if (memberTab) {
    const [slug, tab] = memberTab.dataset.memberTab.split('|');
    $('manageSpacesList').querySelectorAll('[data-member-tab^="' + CSS.escape(slug) + '|"]').forEach(button => button.classList.toggle('active', button === memberTab));
    $('manageSpacesList').querySelectorAll('[data-member-panel^="' + CSS.escape(slug) + '|"]').forEach(panel => { panel.hidden = panel.dataset.memberPanel !== slug + '|' + tab; });
    return;
  }
  const edit = event.target.closest('[data-manage-edit]');
  const approve = event.target.closest('[data-approve-request]');
  const deny = event.target.closest('[data-deny-request]');
  const removeMember = event.target.closest('[data-remove-space-member]');
  const adminControl = event.target.closest('[data-set-space-admin]');
  const warnMember = event.target.closest('[data-warn-space-member]');
  const chatAccessControl = event.target.closest('[data-review-chat-access]');
  const blockUser = event.target.closest('[data-block-space-user]');
  const unblockUser = event.target.closest('[data-unblock-space-user]');
  if (blockUser || unblockUser) {
    const control = blockUser || unblockUser;
    const [slug, userId] = control.dataset[blockUser ? 'blockSpaceUser' : 'unblockSpaceUser'].split('|');
    control.disabled = true;
    try { if (blockUser) await blockSpaceUser(slug, userId); else await unblockSpaceUser(slug, userId); }
    catch (error) { console.error(error); showToast(error.message || tr('Space access could not be changed.','تعذر تغيير الوصول إلى المساحة.')); control.disabled = false; }
    return;
  }
  if (chatAccessControl) {
    const [slug, userId, approved, ban] = chatAccessControl.dataset.reviewChatAccess.split('|');
    chatAccessControl.disabled = true;
    try { await callFunction('setCommunitySpaceConnection', {operation:'review_space_chat_access', spaceId:slug, userId, approved:approved === '1', ban:ban === '1'}); await loadManageSpaces(); }
    catch (error) { console.error(error); showToast(error.message || tr('Messages access could not be reviewed.','تعذر مراجعة وصول الرسائل.')); chatAccessControl.disabled = false; }
    return;
  }
  if (edit) {
    activeAreaSlug = edit.dataset.manageEdit;
    openSpaceEditor();
    return;
  }
  if (removeMember) {
    const [slug, userId] = removeMember.dataset.removeSpaceMember.split('|');
    removeMember.disabled = true;
    try { await removeSpaceMember(slug, userId); }
    catch (error) { console.error(error); showToast(tr('Member access could not be removed.','تعذر إزالة وصول العضو.')); removeMember.disabled = false; }
    return;
  }
  if (adminControl) {
    const [slug, userId, enabled] = adminControl.dataset.setSpaceAdmin.split('|');
    adminControl.disabled = true;
    try { await setSpaceAdmin(slug, userId, enabled === '1'); }
    catch (error) { console.error(error); showToast(tr('The administrator could not be updated.','تعذر تحديث المشرف.')); adminControl.disabled = false; }
    return;
  }
  if (warnMember) {
    const [slug, userId] = warnMember.dataset.warnSpaceMember.split('|');
    warnMember.disabled = true;
    try { await warnSpaceMember(slug, userId); }
    catch (error) { console.error(error); showToast(tr('The warning could not be sent.','تعذر إرسال التحذير.')); }
    warnMember.disabled = false;
    return;
  }
  const control = approve || deny;
  if (!control) return;
  const [slug, userId] = control.dataset[approve ? 'approveRequest' : 'denyRequest'].split('|');
  control.disabled = true;
  try { await reviewSpaceRequest(slug, userId, Boolean(approve)); }
  catch (error) { console.error(error); showToast(tr('The request could not be updated.','تعذر تحديث الطلب.')); control.disabled = false; }
});
$('manageSpacesList').addEventListener('change', async event => {
  const toggle = event.target.closest('[data-manage-space-setting]');
  if (!toggle) return;
  const [slug, setting] = toggle.dataset.manageSpaceSetting.split('|');
  toggle.disabled = true;
  try { await updateManagedSpaceSetting(slug, setting, toggle.checked); }
  catch (error) { console.error(error); showToast(error.message || tr('The space setting could not be saved.','تعذر حفظ إعداد المساحة.')); await loadManageSpaces(); }
});
$('manageSpacesList').addEventListener('input', event => {
  const input = event.target.closest('[data-space-member-search]');
  if (!input) return;
  const slug = input.dataset.spaceMemberSearch;
  const query = String(input.value || '').trim().toLowerCase();
  const rows = [...$('manageSpacesList').querySelectorAll('#spaceMemberList-' + CSS.escape(slug) + ' [data-space-member]')];
  let visible = 0;
  rows.forEach(row => {
    const matches = !query || row.dataset.spaceMember.includes(query);
    row.hidden = !matches;
    if (matches) visible += 1;
  });
  const count = $('manageSpacesList').querySelector('[data-space-member-count="' + CSS.escape(slug) + '"]');
  if (count) count.textContent = visible + ' ' + tr(visible === 1 ? 'member' : 'members', visible === 1 ? 'عضو' : 'أعضاء');
});
$('areaConnect').addEventListener('click', async event => {
  if (!currentUser) { location.href = loginUrl(); return; }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await toggleSpaceConnection(activeAreaSlug);
    if (result === null) return;
    if (result === 'requested') {
      showToast(tr('Connection request sent to the space admin.','تم إرسال طلب الاتصال إلى مشرف المساحة.'));
      return;
    }
    activeAreaConnection = result;
    if (!activeAreaConnection) {
      await handleRoute(false);
      showToast(tr('Space connection removed.','تمت إزالة التواصل مع المساحة.'));
      return;
    }
    renderActiveAreaHeader(communityAreas[activeAreaSlug]);
    await refreshAreaConnectionCount(activeAreaSlug);
    showToast(tr('Space connection added.','تمت إضافة التواصل مع المساحة.'));
  } catch (error) {
    console.error(error);
    showToast(tr('This space connection could not be updated.','تعذر تحديث التواصل مع هذه المساحة.'));
  } finally { button.disabled = false; }
});
$('privateSpaceRequest')?.addEventListener('click', async event => {
  if (!currentUser) { location.href = loginUrl(); return; }
  const area = activeAreaSlug ? communityAreas[activeAreaSlug] : null;
  if (!area || !area.isPrivate) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await toggleSpaceConnection(activeAreaSlug);
    if (result === 'requested') {
      showToast(tr('Access request sent to the space admin.','تم إرسال طلب الوصول إلى مشرف المساحة.'));
      navigateTo('/community.html', false);
    }
  } catch (error) {
    console.error(error);
    showToast(tr('The access request could not be sent.','تعذر إرسال طلب الوصول.'));
  } finally { button.disabled = false; }
});
$('notificationBell').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showToast(notificationPermissionHelp());
  } else if (Notification.permission !== 'granted') {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await registerPushSubscription();
        showToast(tr('Browser notifications are enabled.','تم تفعيل إشعارات المتصفح.'));
      } else showToast(notificationPermissionHelp());
    } catch { showToast(notificationPermissionHelp()); }
  } else {
    try { await registerPushSubscription(); }
    catch (error) { console.warn('[Community] Push subscription could not be registered.', error); }
  }
  $('notificationPanel').hidden = !$('notificationPanel').hidden;
});
$('markNotificationsRead').addEventListener('click', async () => {
  if (!currentUser) return;
  const unread = notificationItems.filter(item => !item.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach(item => batch.set(doc(db, 'users', currentUser.uid, 'notifications', item.id), {read:true, readAt:serverTimestamp()}, {merge:true}));
  try { await batch.commit(); } catch (error) { console.error(error); showToast(tr('Notifications could not be updated.','تعذر تحديث الإشعارات.')); }
});
$('notificationList').addEventListener('click', async event => {
  const item = event.target.closest('[data-notification-id]');
  if (!item || !currentUser) return;
  try { await setDoc(doc(db, 'users', currentUser.uid, 'notifications', item.dataset.notificationId), {read:true, readAt:serverTimestamp()}, {merge:true}); } catch {}
  $('notificationPanel').hidden = true;
  navigateTo(item.dataset.notificationUrl, false);
});
$('feedModeBar').addEventListener('click', event => {
  const button = event.target.closest('[data-feed-mode]');
  if (!button) return;
  navigateTo('/community.html?feed=' + (button.dataset.feedMode === 'discover' ? 'discover' : 'following'), false);
});
$('answerPrompt').addEventListener('click', () => {
  if (selectedPromptPostId) navigateTo('/community.html?post=' + encodeURIComponent(selectedPromptPostId) + '&comments=1', false);
});
$('mobileAnswerPrompt').addEventListener('click', () => {
  if (selectedPromptPostId) navigateTo('/community.html?post=' + encodeURIComponent(selectedPromptPostId) + '&comments=1', false);
});
let postCommunityTimer;
$('postCommunity').addEventListener('focus', event => renderSpaceSuggestions(event.target.value));
$('postCommunity').addEventListener('input', event => {
  validateCommunityHandle(true);
  renderSpaceSuggestions(event.target.value);
  clearTimeout(postCommunityTimer);
  postCommunityTimer = setTimeout(() => validateCommunityHandleLive(true), 220);
});
$('postCommunity').addEventListener('blur', () => setTimeout(() => { $('spaceSuggestions').hidden = true; }, 120));
$('spaceSuggestions').addEventListener('mousedown', event => event.preventDefault());
$('spaceSuggestions').addEventListener('click', event => {
  const choice = event.target.closest('[data-space-choice]');
  if (!choice) return;
  $('postCommunity').value = choice.dataset.spaceChoice === 'main' ? 'main' : 'a/' + choice.dataset.spaceChoice;
  $('spaceSuggestions').hidden = true;
  validateCommunityHandle(true);
  $('postCommunity').focus();
});

document.querySelectorAll('input[name="postTypeChoice"]').forEach(input => input.addEventListener('change', event => {
  $('postType').value = event.target.value;
  renderPostTypeFields();
}));
$('removeMarketShare')?.addEventListener('click', () => {
  clearComposerMarketShare(true);
  $('postTitle').focus();
});
$('removePortfolioShare')?.addEventListener('click', () => {
  clearComposerPortfolioShare(true);
  $('postTitle').focus();
});
[
  ['postTitle', 'titleCount', 160],
  ['postContent', 'contentCount', 2000]
].forEach(([inputId, countId, limit]) => {
  $(inputId).addEventListener('input', event => { $(countId).textContent = event.target.value.length.toLocaleString() + ' / ' + limit.toLocaleString(); });
});
renderPostTypeFields();

$('postImageFile').addEventListener('change', async event => {
  const files = [...(event.target.files || [])].slice(0, Math.max(0, POST_IMAGE_MAX_COUNT - postImages.length));
  event.target.value = '';
  if (!files.length) {
    $('postImageStatus').textContent = postImages.length >= POST_IMAGE_MAX_COUNT ? tr('The gallery already has 6 images.','يحتوي المعرض بالفعل على 6 صور.') : '';
    return;
  }
  $('postImageStatus').textContent = tr('Preparing images…','جارٍ تجهيز الصور…');
  const errors = [];
  for (const file of files) {
    try {
      const dataUrl = await preparePostImage(file);
      const candidate = [...postImages, {id:(crypto.randomUUID?.() || Date.now() + '-' + Math.random()), dataUrl, mimeType:file.type, name:file.name, chunkCount:imageChunkCount(dataUrl)}];
      if (candidate.reduce((total, image) => total + image.chunkCount, 0) > POST_IMAGE_MAX_CHUNKS) throw new Error(tr('The gallery is too large. Remove an image or choose smaller files.','المعرض كبير جداً. أزل صورة أو اختر ملفات أصغر.'));
      postImages = candidate;
    } catch (error) { errors.push(error.message); }
  }
  renderPostImageComposer();
  $('postImageStatus').textContent = errors[0] || tr(postImages.length + (postImages.length === 1 ? ' image ready.' : ' images ready.'), postImages.length + ' صورة جاهزة.');
});
document.addEventListener('click', event => {
  if (event.target.closest('.space-member-menu')) return;
  document.querySelectorAll('.space-member-menu[open]').forEach(menu => { menu.open = false; });
});
$('postImagePreview').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-gallery-image]');
  if (!button) return;
  postImages = postImages.filter(image => image.id !== button.dataset.removeGalleryImage);
  renderPostImageComposer();
  $('postImageStatus').textContent = tr(postImages.length + (postImages.length === 1 ? ' image ready.' : ' images ready.'), postImages.length + ' صورة جاهزة.');
});
async function refreshCurrentViewData() {
  const btn = $('refreshDataButton');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('refreshing');
  try {
    renderCommunitySpaces();
    await handleRoute(false);
    showToast(tr('Data refreshed','تم تحديث البيانات'));
  } catch (error) {
    console.error('[Community] Refresh failed:', error);
    showToast(error.message || tr('Failed to refresh data','تعذر تحديث البيانات'));
  } finally {
    window.setTimeout(() => {
      btn.classList.remove('refreshing');
      btn.disabled = false;
    }, 450);
  }
}

$('refreshDataButton')?.addEventListener('click', () => refreshCurrentViewData());

$('communityLanguageToggle').addEventListener('click', () => {
  setCommunityLanguage(isArabic() ? 'en' : 'ar');
});
$('switchAccount').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await signOut(auth);
    location.href = loginUrl();
  } catch (error) {
    console.error(error);
    showToast(tr('Could not switch accounts. Please try again.','تعذر تبديل الحساب. حاول مرة أخرى.'));
    button.disabled = false;
  }
});

function openAccountSwitcher() {
  if (!currentUser) { location.href = loginUrl(); return; }
  const name = currentProfile?.displayName || currentUser.displayName || currentProfile?.username || tr('Community member','عضو في المجتمع');
  const photo = currentProfile?.photoBase64 || currentProfile?.photoURL || currentUser.photoURL || '';
  $('accountSwitchList').innerHTML = '<div class="account-switch-current">' + avatarMarkup(name, photo, 'avatar', currentProfile?.verified === true) + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(currentProfile?.username ? '@' + currentProfile.username : currentUser.email || '') + '</small></span><b>' + tr('Current','الحالي') + '</b></div>';
  $('accountSwitchDialog').showModal();
}

$('accountSwitchClose').addEventListener('click', () => $('accountSwitchDialog').close());
$('accountSwitchAdd').addEventListener('click', async () => {
  try { await signOut(auth); location.href = loginUrl(); }
  catch (error) { console.error(error); showToast(tr('Could not open account switcher.','تعذر فتح تبديل الحساب.')); }
});
let profilePressTimer = null;
const mobileProfileAction = $('mobileProfileAction');
mobileProfileAction.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  profilePressTimer = window.setTimeout(() => { profilePressTimer = null; openAccountSwitcher(); }, 520);
});
['pointerup','pointerleave','pointercancel'].forEach(type => mobileProfileAction.addEventListener(type, () => { if (profilePressTimer) window.clearTimeout(profilePressTimer); profilePressTimer = null; }));
mobileProfileAction.addEventListener('click', event => { if (!$('accountSwitchDialog').open) return; event.preventDefault(); });

let swipeStart = null;
const swipeRoutes = ['/', '/community.html?view=spaces', '/community.html?view=post', '/community.html?view=profile', '/community.html?view=chats'];
document.addEventListener('touchstart', event => {
  if (
    window.innerWidth > 699 ||
    document.body.classList.contains('messages-fullscreen') ||
    document.body.classList.contains('profile-setup-fullscreen') ||
    document.body.classList.contains('image-viewer-open') ||
    document.body.classList.contains('comments-open') ||
    !$('imageViewer')?.hidden ||
    !$('commentsOverlay')?.hidden ||
    event.target.closest('#imageViewer, .image-viewer, #commentsOverlay, .comments-sheet, dialog, input, textarea, select, button, a, [contenteditable="true"]')
  ) {
    swipeStart = null;
    return;
  }
  const touch = event.changedTouches[0];
  swipeStart = {x:touch.clientX, y:touch.clientY};
}, {passive:true});
document.addEventListener('touchend', event => {
  if (!swipeStart) return;
  if (
    document.body.classList.contains('image-viewer-open') ||
    document.body.classList.contains('comments-open') ||
    !$('imageViewer')?.hidden ||
    !$('commentsOverlay')?.hidden ||
    event.target.closest('#imageViewer, .image-viewer, #commentsOverlay, .comments-sheet, dialog')
  ) {
    swipeStart = null;
    return;
  }
  const touch = event.changedTouches[0], dx = touch.clientX - swipeStart.x, dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
  const params = new URLSearchParams(location.search);
  const current = params.get('view') === 'spaces' ? 1 : params.get('view') === 'post' ? 2 : params.get('view') === 'profile' ? 3 : params.get('view') === 'chats' ? 4 : 0;
  const rtlMultiplier = isArabic() ? -1 : 1;
  const directionStep = (dx < 0 ? 1 : -1) * rtlMultiplier;
  const next = Math.max(0, Math.min(swipeRoutes.length - 1, current + directionStep));
  if (next !== current) navigateTo(swipeRoutes[next], false);
}, {passive:true});
setCommunityLanguage(currentLanguage, false);

$('postForm').addEventListener('input', event => {
  if (event.target.matches('#postTitle, #postContent') || event.target.closest('#postThreadComposerGroup')) {
    markDirty('postForm', isArabic() ? 'كتابة منشور — تغييرات غير محفوظة' : 'Drafting post — unsaved changes', null,
      () => { $('postForm').reset(); clearPostImageComposer(); clearComposerMarketShare(true); clearComposerPortfolioShare(true); composerThreadEntries = []; renderComposerThreadEntries(); renderPostTypeFields(); clearDirty(); }
    );
  }
}, {passive: true});

$('postForm').addEventListener('submit', async event => {
  event.preventDefault();
  const type = $('postType').value === 'question' ? 'question' : 'text';
  const title = $('postTitle').value.trim();
  const content = $('postContent').value.trim();
  const galleryImages = type === 'text' ? [...postImages] : [];
  const imageChunkCounts = galleryImages.map(image => image.chunkCount);
  const imageChunkCount = imageChunkCounts.reduce((total, count) => total + count, 0);
  const imageMimeTypes = galleryImages.map(image => image.mimeType);
  $('postStatus').classList.remove('success');
  if (!content && (type === 'question' || (!title && galleryImages.length === 0 && !composerMarketShare && !composerPortfolioShare))) {
    $('postStatus').textContent = tr('Write something before publishing.','اكتب شيئاً قبل النشر.');
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const communitySlug = await validateCommunityHandleLive(true);
    if (!communitySlug) {
      $('postStatus').textContent = tr('Choose an existing community handle before publishing.','اختر معرّف مساحة موجوداً قبل النشر.');
      button.disabled = false;
      return;
    }
    const createdPost = await callFunction('createCommunityPost', {
      type,
      title,
      summary: content.slice(0, 360),
      content,
      communitySlug,
      marketKind: composerMarketShare?.kind || '',
      marketId: composerMarketShare?.id || '',
      portfolioKind: composerPortfolioShare?.kind || '',
      portfolioId: composerPortfolioShare?.id || '',
      mediaCount: galleryImages.length,
      userId: currentUser.uid,
      authorName: currentProfile.displayName || currentUser.displayName || tr('Member','عضو'),
      authorUsername: currentProfile.username,
      published: galleryImages.length === 0,
      imageChunkCount,
      imageMimeType: imageMimeTypes[0] || '',
      imageChunkCounts,
      imageMimeTypes,
      featureRequest: false,
      featureStatus: 'none',
      featured: false,
      archived: false,
      moderationStatus: 'clear'
    });
    const postId = createdPost.postId;
    if (galleryImages.length) {
      $('postStatus').textContent = tr('Uploading gallery…','جارٍ رفع المعرض…');
      await uploadPostImages(postId, galleryImages);
      await callFunction('finalizeCommunityPostMedia', {postId});
    }
    // Create any attached composer thread entries sequentially
    if (type === 'text' && composerThreadEntries.length > 0) {
      $('postStatus').textContent = tr('Creating thread entries…', 'جارٍ إنشاء أقسام الخيط…');
      for (const entry of composerThreadEntries) {
        const entryTitle = entry.title.trim();
        const entryContent = entry.content.trim();
        if (!entryTitle && !entryContent && !entry.images.length) continue;
        const entryChunkCounts = entry.images.map(image => imageChunkCount(image.dataUrl));
        const entryChunkCount = entryChunkCounts.reduce((t, c) => t + c, 0);
        const entryMimeTypes = entry.images.map(image => image.mimeType);
        const subCreated = await callFunction('createCommunityPost', {
          type: 'text',
          title: entryTitle || tr('Thread entry', 'قسم في الخيط'),
          summary: entryContent.slice(0, 360),
          content: entryContent,
          communitySlug,
          parentPostId: postId,
          mediaCount: entry.images.length,
          userId: currentUser.uid,
          authorName: currentProfile.displayName || currentUser.displayName || tr('Member','عضو'),
          authorUsername: currentProfile.username,
          published: entry.images.length === 0,
          imageChunkCount: entryChunkCount,
          imageMimeType: entryMimeTypes[0] || '',
          imageChunkCounts: entryChunkCounts,
          imageMimeTypes: entryMimeTypes,
          featureRequest: false,
          featureStatus: 'none',
          featured: false,
          archived: false,
          moderationStatus: 'clear'
        });
        if (entry.images.length > 0) {
          await uploadPostImages(subCreated.postId, entry.images);
          await callFunction('finalizeCommunityPostMedia', { postId: subCreated.postId });
        }
      }
    }
    const publishedPost = {id:postId, type, title, content, summary:content.slice(0, 360), communitySlug, marketAttachment:composerMarketShare, portfolioAttachment:composerPortfolioShare};
    const mentions = await resolveMentions(title + '\n' + content);
    await Promise.all([
      notifySpaceAdminOfPost(publishedPost),
      sendMentionNotifications(publishedPost, {...mentions, spaceSlugs:mentions.spaceSlugs.filter(slug => slug !== communitySlug)})
    ]);
    invalidateCommunitySearchIndex();
    $('postForm').reset();
    clearPostImageComposer();
    clearComposerMarketShare(true);
    clearComposerPortfolioShare(true);
    composerThreadEntries = [];
    renderComposerThreadEntries();
    clearDirty();
    $('postType').value = 'text';
    document.querySelector('input[name="postTypeChoice"][value="text"]').checked = true;
    renderPostTypeFields();
    ['postTitle','postContent'].forEach(id => $(id).dispatchEvent(new Event('input')));
    showToast(tr('Your post is live.','تم نشر منشورك.'));
    navigateTo('/community.html?post=' + encodeURIComponent(postId), false);
  } catch (error) {
    console.error(error);
    $('postStatus').textContent = error.message || tr('This post could not be published.','تعذر نشر هذا المنشور.');
  } finally {
    button.disabled = false;
  }
});

let spaceHandleTimer;
bindSpaceMediaInput('spaceImageFile', 'spaceImageStatus', 'spaceImagePreview', 'avatar', value => { newSpaceImageBase64 = value; }, delta => { newSpaceMediaBusy += delta; });
bindSpaceMediaInput('spaceBannerFile', 'spaceBannerStatus', 'spaceBannerPreview', 'banner', value => { newSpaceBannerBase64 = value; }, delta => { newSpaceMediaBusy += delta; });
$('removeSpaceImage').addEventListener('click', () => {
  newSpaceImageBase64 = '';
  $('spaceImageFile').value = '';
  updateSpaceMediaPreview('spaceImagePreview', '', tr('No image','لا توجد صورة'));
  $('spaceImageStatus').textContent = tr('Image removed','تمت إزالة الصورة');
});
$('removeSpaceBanner').addEventListener('click', () => {
  newSpaceBannerBase64 = '';
  $('spaceBannerFile').value = '';
  updateSpaceMediaPreview('spaceBannerPreview', '', tr('No banner','لا يوجد غلاف'));
  $('spaceBannerStatus').textContent = tr('Banner removed','تمت إزالة الغلاف');
});

bindSpaceMediaInput('spaceEditImageFile', 'spaceEditImageStatus', 'spaceEditImagePreview', 'avatar', value => { editSpaceImageBase64 = value; }, delta => { editSpaceMediaBusy += delta; });
bindSpaceMediaInput('spaceEditBannerFile', 'spaceEditBannerStatus', 'spaceEditBannerPreview', 'banner', value => { editSpaceBannerBase64 = value; }, delta => { editSpaceMediaBusy += delta; });
$('removeSpaceEditImage').addEventListener('click', () => {
  editSpaceImageBase64 = '';
  $('spaceEditImageFile').value = '';
  updateSpaceMediaPreview('spaceEditImagePreview', '', tr('No image','لا توجد صورة'));
  $('spaceEditImageStatus').textContent = tr('Image will be removed when saved','ستُزال الصورة عند الحفظ');
});
$('removeSpaceEditBanner').addEventListener('click', () => {
  editSpaceBannerBase64 = '';
  $('spaceEditBannerFile').value = '';
  updateSpaceMediaPreview('spaceEditBannerPreview', '', tr('No banner','لا يوجد غلاف'));
  $('spaceEditBannerStatus').textContent = tr('Banner will be removed when saved','سيُزال الغلاف عند الحفظ');
});
$('spaceEditName').addEventListener('input', event => { $('spaceEditNameCount').textContent = event.target.value.length.toLocaleString() + ' / 80'; });
$('spaceEditDescription').addEventListener('input', event => { $('spaceEditDescriptionCount').textContent = event.target.value.length.toLocaleString() + ' / 360'; });
$('spaceIsPrivate').addEventListener('change', event => { if (event.target.checked) { $('spaceIsViewOnly').checked = false; $('spaceShowInMainThread').checked = false; } });
$('spaceIsViewOnly').addEventListener('change', event => { if (event.target.checked) $('spaceIsPrivate').checked = false; });
$('spaceEditIsPrivate').addEventListener('change', syncSpaceVisibilityToggle);
$('spaceEditIsViewOnly').addEventListener('change', syncSpaceVisibilityToggle);
$('spaceEditClose').addEventListener('click', closeSpaceEditor);
$('spaceEditCancel').addEventListener('click', closeSpaceEditor);
$('spaceEditDialog').addEventListener('cancel', () => { activeEditSpaceSlug = null; });
$('spaceEditDialog').addEventListener('click', event => { if (event.target === $('spaceEditDialog')) closeSpaceEditor(); });
$('deleteOwnedSpace').addEventListener('click', deleteOwnedSpace);
$('spaceEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  const slug = activeEditSpaceSlug;
  const area = slug ? communityAreas[slug] : null;
  if (!area || !currentUser || area.creatorId !== currentUser.uid) return closeSpaceEditor();
  const button = event.submitter;
  const name = $('spaceEditName').value.trim();
  const description = $('spaceEditDescription').value.trim();
  button.disabled = true;
  $('spaceEditStatus').textContent = '';
  try {
    if (editSpaceMediaBusy) throw new Error(tr('Wait for the images to finish preparing.','انتظر حتى يكتمل تجهيز الصور.'));
    const nextPrivate = $('spaceEditIsPrivate').checked;
    const nextViewOnly = !nextPrivate && $('spaceEditIsViewOnly').checked;
    const nextMainThread = nextPrivate ? false : $('spaceEditShowInMainThread').checked;
    if (nextPrivate !== (area.isPrivate === true) || nextViewOnly !== (area.isViewOnly === true) || nextMainThread !== (area.showInMainThread !== false)) {
      const confirmation = nextPrivate
        ? tr('Make this space private? Only approved members will retain access to its posts.', 'جعل هذه المساحة خاصة؟ سيحتفظ الأعضاء الموافق عليهم فقط بالوصول إلى منشوراتها.')
        : nextViewOnly
          ? tr('Make this space view only? Members will need approval to post or use Messages.', 'جعل هذه المساحة للعرض فقط؟ سيحتاج الأعضاء إلى موافقة للنشر أو استخدام الرسائل.')
          : tr('Make this space public? Its posts may become visible in the main thread.', 'جعل هذه المساحة عامة؟ قد تصبح منشوراتها ظاهرة في المسار الرئيسي.');
      if (!confirm(confirmation)) { button.disabled = false; return; }
      await callFunction('setCommunitySpaceVisibility', {spaceId:slug, isPrivate:nextPrivate, isViewOnly:nextViewOnly, showInMainThread:nextMainThread});
    }
    const [imageURL, bannerURL] = await Promise.all([
      storeCommunityImage(`community/spaces/${slug}/avatar`, editSpaceImageBase64),
      storeCommunityImage(`community/spaces/${slug}/banner`, editSpaceBannerBase64)
    ]);
    await setDoc(doc(db, 'communitySpaces', slug), {
      name,
      description,
      symbol:initials(name),
      imageBase64:'',
      bannerBase64:'',
      imageURL,
      bannerURL,
      updatedAt:serverTimestamp()
    }, {merge:true});
    communityAreas[slug] = {...area, name, description, symbol:initials(name), imageBase64:'', bannerBase64:'', imageURL, bannerURL, isPrivate:nextPrivate, showInMainThread:nextMainThread};
    invalidateCommunitySearchIndex();
    renderCommunitySpaces();
    renderActiveAreaHeader(communityAreas[slug]);
    closeSpaceEditor();
    showToast(tr('Space updated.','تم تحديث المساحة.'));
  } catch (error) {
    console.error(error);
    $('spaceEditStatus').textContent = error.message || tr('This space could not be updated.','تعذر تحديث هذه المساحة.');
  } finally {
    button.disabled = false;
  }
});

$('spaceName').addEventListener('input', event => {
  $('spaceNameCount').textContent = event.target.value.length.toLocaleString() + ' / 80';
  if (!$('spaceHandle').dataset.manuallyEdited) {
    $('spaceHandle').value = normalizeCommunityHandle(event.target.value);
    clearTimeout(spaceHandleTimer);
    spaceHandleTimer = setTimeout(() => checkSpaceHandleAvailability($('spaceHandle'), $('spaceHandleStatus')), 250);
  }
});
$('spaceDescription').addEventListener('input', event => {
  $('spaceDescriptionCount').textContent = event.target.value.length.toLocaleString() + ' / 360';
});
$('spaceHandle').addEventListener('input', event => {
  event.target.dataset.manuallyEdited = 'true';
  clearTimeout(spaceHandleTimer);
  spaceHandleTimer = setTimeout(() => checkSpaceHandleAvailability(event.target, $('spaceHandleStatus')), 250);
});

$('spaceForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const name = $('spaceName').value.trim();
  const description = $('spaceDescription').value.trim();
  $('spaceStatus').textContent = '';
  button.disabled = true;
  try {
    if (newSpaceMediaBusy) throw new Error(tr('Wait for the images to finish preparing.','انتظر حتى يكتمل تجهيز الصور.'));
    const available = await checkSpaceHandleAvailability($('spaceHandle'), $('spaceHandleStatus'));
    if (!available) {
      $('spaceStatus').textContent = tr('Choose an available space handle before continuing.','اختر معرّف مساحة متاحاً قبل المتابعة.');
      return;
    }
    const handle = await createCommunitySpace(name, $('spaceHandle').value, description, newSpaceImageBase64, newSpaceBannerBase64, $('spaceIsPrivate').checked, $('spaceIsViewOnly').checked, $('spaceShowInMainThread').checked);
    $('spaceForm').reset();
    newSpaceImageBase64 = '';
    newSpaceBannerBase64 = '';
    updateSpaceMediaPreview('spaceImagePreview', '', tr('No image','لا توجد صورة'));
    updateSpaceMediaPreview('spaceBannerPreview', '', tr('No banner','لا يوجد غلاف'));
    $('spaceImageStatus').textContent = tr('Square image recommended','يُفضّل استخدام صورة مربعة');
    $('spaceBannerStatus').textContent = tr('Wide image recommended','يُفضّل استخدام صورة عريضة');
    delete $('spaceHandle').dataset.manuallyEdited;
    $('spaceNameCount').textContent = '0 / 80';
    $('spaceDescriptionCount').textContent = '0 / 360';
    showToast('a/' + handle + ' ' + tr('is ready. Start its first post.','جاهزة. ابدأ أول منشور فيها.'));
    navigateTo(areaUrl(handle) + '?view=post', false);
  } catch (error) {
    console.error(error);
    const msg = error.code === 'resource-exhausted' || error.message?.includes('5') || error.message?.includes('maximum')
      ? tr('You have reached the maximum limit of 5 owned spaces.','لقد وصلت إلى الحد الأقصى البالغ 5 مساحات.')
      : (error.message || tr('This space could not be created.','تعذر إنشاء هذه المساحة.'));
    $('spaceStatus').textContent = msg;
    showToast(msg);
    await checkSpaceHandleAvailability($('spaceHandle'), $('spaceHandleStatus'));
  } finally {
    button.disabled = false;
  }
});

let smartUiRefreshTimer = null;
window.addEventListener('community-smart-refresh', event => {
  window.clearTimeout(smartUiRefreshTimer);
  smartUiRefreshTimer = window.setTimeout(async () => {
    const key = String(event.detail?.key || '');
    try {
      if (key === 'spaces:active') {
        await loadCommunitySpaces();
        if (!$('homeView').hidden) await handleRoute(false);
      } else if ((key.startsWith('posts:feed') || key.startsWith('posts:space:') || key.startsWith('post-meta:')) && !$('homeView').hidden) {
        await loadPosts(true);
      } else if (key.startsWith('posts:user:') && !$('profileView').hidden && activeProfileId) {
        await loadProfilePosts(activeProfileId, currentUser?.uid === activeProfileId);
      }
    } catch (error) { console.warn('[Community] Refreshed data could not be painted.', error); }
  }, 180);
});

} // end: !portfolios-standalone guard

communityDataReady = document.body.classList.contains('portfolios-standalone') ? null : loadCommunitySpaces();
if (!document.body.classList.contains('portfolios-standalone')) loadPromptOfTheWeek();

onAuthStateChanged(auth, async user => {
  try {
  currentUser = user;
  unsubscribeCurrentProfile?.();
  unsubscribeCurrentProfile = null;
  if (user) {
    currentProfile = await getProfile(user.uid);
    if (currentProfile?.notificationPreferences) {
      currentNotificationPreferences = { ...currentNotificationPreferences, ...currentProfile.notificationPreferences };
    }
    if (Array.isArray(currentProfile?.mutedSpaceChats)) {
      currentMutedSpaceChats = new Set(currentProfile.mutedSpaceChats);
    }
    unsubscribeCurrentProfile = onSnapshot(doc(db, 'users', user.uid), snapshot => {
      if (!snapshot.exists()) return;
      currentProfile = {mainThreadPostingAccess:true, ...snapshot.data()};
      if (currentProfile.notificationPreferences) {
        currentNotificationPreferences = { ...currentNotificationPreferences, ...currentProfile.notificationPreferences };
      }
      if (Array.isArray(currentProfile.mutedSpaceChats)) {
        currentMutedSpaceChats = new Set(currentProfile.mutedSpaceChats);
      }
      profileCache.set(user.uid, Promise.resolve(currentProfile));
      if (!$('homeView').hidden) handleRoute(false).catch(error => console.warn('[Community] Updated permissions could not be painted.', error));
    });
    if (currentProfile.username) {
      try { await claimUsername(user.uid, currentProfile.username); }
      catch (error) { console.warn('[Community] Existing username index could not be repaired.', error); }
    }
    const displayName = currentProfile.displayName || user.displayName || tr('Member','عضو');
    const photo = currentProfile.photoBase64 || currentProfile.photoURL || user.photoURL || '';
    if ($('memberAction')) $('memberAction').href = profileUrl(user.uid, currentProfile.username);
    if ($('mobileProfileAvatar')) $('mobileProfileAvatar').innerHTML = avatarMarkup(currentProfile.displayName || user.displayName || currentProfile.username || '?', currentProfile.photoBase64 || currentProfile.photoURL || user.photoURL || '', 'mobile-profile-avatar', currentProfile.verified === true);
    if ($('switchAccount')) $('switchAccount').hidden = false;
    document.querySelectorAll('[data-route="profile"]').forEach(link => { link.href = profileUrl(user.uid, currentProfile.username); });
    if ($('memberAction')) $('memberAction').setAttribute('aria-label', tr('Open your community profile','افتح ملفك المجتمعي'));
    if ($('memberAction')) $('memberAction').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(displayName) + '">' : '<span>' + escapeHtml(initials(displayName)) + '</span>';
    if ($('quickAvatar')) $('quickAvatar').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="">' : escapeHtml(initials(displayName));
    if ($('topbarMemberAction')) {
      $('topbarMemberAction').href = profileUrl(user.uid, currentProfile.username);
      $('topbarMemberAction').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(displayName) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">' : escapeHtml(initials(displayName));
    }
  } else {
    for (const value of protectedMediaUrls.values()) {
      if (typeof value === 'string' && value.startsWith('blob:')) URL.revokeObjectURL(value);
    }
    protectedMediaUrls.clear();
    currentProfile = null;
    currentNotificationPreferences = {
      chatMessages: true,
      chatMentions: true,
      chatReplies: true,
      postComments: true,
      commentReplies: true,
      postMentions: true,
      postApplauses: true,
      connections: true,
      spaceRequests: true,
      pushEnabled: true
    };
    currentMutedSpaceChats.clear();
    railSpacesExpanded = false;

    // Mandatory Authentication Gate:
    // Do not allow users without an account to open the community.
    const currentPath = location.pathname.toLowerCase();
    const isAuthPage = currentPath.endsWith('login.html') || currentPath.endsWith('signup.html') || currentPath.endsWith('auth-relay.html');
    if (!isAuthPage) {
      location.replace(loginUrl());
      return;
    }

    if ($('memberAction')) $('memberAction').href = loginUrl();
    if ($('switchAccount')) $('switchAccount').hidden = true;
    if ($('mobileProfileAvatar')) $('mobileProfileAvatar').textContent = '◉';
    if ($('memberAction')) $('memberAction').setAttribute('aria-label', tr('Sign in','تسجيل الدخول'));
    if ($('memberAction')) $('memberAction').innerHTML = '<span>?</span>';
    if ($('quickAvatar')) $('quickAvatar').textContent = 'A';
  }
  const isPortfoliosPage = document.body.classList.contains('portfolios-standalone');
  if (isPortfoliosPage) {
    try {
      await loadPortfoliosHubPage();
    } catch (err) {
      console.error('[Portfolios] Page load failed.', err);
    } finally {
      dismissCommunitySplash();
    }
    return;
  }
  if (communityDataReady) await communityDataReady;
  await loadManagedSpaceSlugs();
  await loadConnections();
  renderCommunitySpaces();
  startNotificationInbox();
  renderPostGate();
  renderSpaceGate();
  await handleRoute(false);
  } catch (error) {
    console.error('[Community] Initial loading failed.', error);
  } finally {
    dismissCommunitySplash();
  }
});

async function loadPortfoliosHubPage() {
  const params = new URLSearchParams(location.search);
  const designerParam = params.get('designer') || params.get('user');

  const hubView = $('portfoliosHubView');
  const detailView = $('designerPortfolioDetailView');

  if (designerParam) {
    if (hubView) hubView.hidden = true;
    if (detailView) detailView.hidden = false;
    await renderDesignerPortfolioPage(designerParam);
  } else {
    if (detailView) detailView.hidden = true;
    if (hubView) hubView.hidden = false;
    await renderPortfoliosGalleryHub();
  }
}

async function renderDesignerPortfolioPage(designerIdOrUsername) {
  const container = $('designerProjectsGrid');
  if (!container) return;
  container.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';

  try {
    const [postsSnapshot, userDocSnap] = await Promise.all([
      getDocs(query(collection(db, 'communityPosts'), where('archived', '==', false), where('type', '==', 'behance'))).catch(() => ({docs:[]})),
      getDoc(doc(db, 'users', designerIdOrUsername)).catch(() => null)
    ]);

    let designer = userDocSnap?.exists() ? { uid: userDocSnap.id, ...userDocSnap.data() } : null;
    const projects = postsSnapshot.docs ? postsSnapshot.docs.map(d => ({id: d.id, ...d.data()})) : [];

    const designerProjects = projects.filter(p =>
      p.userId === designerIdOrUsername ||
      p.authorUsername === designerIdOrUsername ||
      (designer && p.userId === designer.uid)
    );

    if (!designer && designerProjects.length > 0) {
      designer = {
        uid: designerProjects[0].userId,
        displayName: designerProjects[0].authorName || designerIdOrUsername,
        username: designerProjects[0].authorUsername || designerIdOrUsername
      };
    }

    if (!designer) {
      container.innerHTML = '<div class="empty-state"><h3>' + tr('Designer portfolio not found', 'تعذر العثور على معرض المصمم') + '</h3></div>';
      return;
    }

    if ($('designerNameSlot')) $('designerNameSlot').textContent = designer.displayName || designer.username || 'Designer';
    if ($('designerTitleSlot')) $('designerTitleSlot').textContent = designer.school || designer.specialization || tr('Architectural Designer', 'مصمم معماري');
    if ($('designerBioSlot')) $('designerBioSlot').textContent = designer.bio || tr('Architecture & Design Community Member at AIAS Basra.', 'عضو في مجتمع العمارة والتصميم في AIAS البصرة.');
    if ($('designerAvatarSlot')) {
      $('designerAvatarSlot').innerHTML = avatarMarkup(designer.displayName || designer.username, designer.photoBase64 || designer.photoURL, 'avatar avatar-large', designer.verified === true);
    }
    if ($('designerProjectCount')) {
      $('designerProjectCount').textContent = designerProjects.length + ' ' + (designerProjects.length === 1 ? tr('project', 'مشروع') : tr('projects', 'مشاريع'));
    }
    if ($('backToCommunityProfileBtn')) {
      $('backToCommunityProfileBtn').href = profileUrl(designer.uid, designer.username);
    }

    if (!designerProjects.length) {
      container.innerHTML = '<div class="empty-state"><h3>' + tr('No projects uploaded yet', 'لا توجد مشاريع مرفوعة بعد') + '</h3><p>' + tr('This designer has not published any projects to their portfolio.', 'لم ينشر هذا المصمم أي مشاريع في معرض أعماله بعد.') + '</p></div>';
      return;
    }

    container.innerHTML = designerProjects.map(post => {
      const href = 'project.html?communityPost=' + encodeURIComponent(post.id);
      const profileImage = postImageUrls(post)[0] || '';
      const media = post.behanceSrc
        ? '<iframe src="' + escapeHtml(post.behanceSrc) + '" title="' + escapeHtml(post.title) + '" loading="lazy" tabindex="-1"></iframe>'
        : profileImage
          ? '<img src="' + escapeHtml(profileImage) + '" alt="' + escapeHtml(post.title) + '" loading="lazy">'
          : '<div class="profile-post-placeholder"><span>PROJECT</span><b>' + escapeHtml(initials(post.title)) + '</b></div>';

      return `
        <article class="profile-post-tile project has-image" style="aspect-ratio:4/3; border-radius:18px; overflow:hidden; position:relative; box-shadow:0 8px 24px rgba(0,0,0,0.06);">
          <a class="profile-post-main" href="${href}">
            <div class="profile-post-media">${media}</div>
            <div class="profile-post-overlay" style="padding:14px; background:linear-gradient(0deg, rgba(30,10,12,0.92) 0%, rgba(30,10,12,0.2) 65%, transparent 100%);">
              <div><span class="profile-post-kind" style="padding:3px 8px; border-radius:6px; background:var(--wine); color:#fff; font-size:0.6rem; font-weight:800;">${escapeHtml(post.category || 'PROJECT')}</span></div>
              <strong class="profile-post-title" style="margin-top:6px; color:#fff; font-size:0.95rem; line-height:1.3;">${escapeHtml(post.title)}</strong>
              <div style="margin-top:4px; color:rgba(255,255,255,0.8); font-size:0.7rem; font-weight:700;">📍 ${escapeHtml(post.location || 'Basra')}</div>
            </div>
          </a>
        </article>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="error">' + tr('Could not load designer portfolio.', 'تعذر تحميل معرض المصمم.') + '</p>';
  }
}

async function renderPortfoliosGalleryHub() {
  const container = $('portfoliosMainContent');
  if (!container) return;
  container.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';

  try {
    const [postsSnapshot, usersSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'communityPosts'), where('archived', '==', false), where('type', '==', 'behance'))).catch(() => ({docs:[]})),
      getDocs(query(collection(db, 'users'), limit(80))).catch(() => ({docs:[]}))
    ]);

    const projects = postsSnapshot.docs ? postsSnapshot.docs.map(d => ({id: d.id, ...d.data()})) : [];
    const membersMap = new Map();
    if (usersSnapshot.docs) {
      usersSnapshot.docs.forEach(docSnap => {
        membersMap.set(docSnap.id, {uid: docSnap.id, ...docSnap.data()});
      });
    }

    const projectsByUser = new Map();
    projects.forEach(project => {
      if (project.userId) {
        if (!projectsByUser.has(project.userId)) projectsByUser.set(project.userId, []);
        projectsByUser.get(project.userId).push(project);
      }
    });

    window.__hubData = { projects, membersMap, projectsByUser };
    bindPortfoliosPageControls();
    renderPortfoliosHubGrid();
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="error">' + tr('Could not load portfolios hub.', 'تعذر تحميل مركز المعارض.') + '</p>';
  }
}

let activeSearchTarget = 'portfolios';
let activeCategoryFilter = 'all';

function bindPortfoliosPageControls() {
  const searchInput = $('portfolioHubSearch');
  if (searchInput) {
    searchInput.oninput = () => renderPortfoliosHubGrid();
  }

  const tabPortfolios = $('searchTabPortfolios');
  const tabProjects = $('searchTabProjects');
  if (tabPortfolios && tabProjects) {
    tabPortfolios.onclick = () => {
      activeSearchTarget = 'portfolios';
      tabPortfolios.classList.add('active');
      tabProjects.classList.remove('active');
      renderPortfoliosHubGrid();
    };
    tabProjects.onclick = () => {
      activeSearchTarget = 'projects';
      tabProjects.classList.add('active');
      tabPortfolios.classList.remove('active');
      renderPortfoliosHubGrid();
    };
  }

  document.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.onclick = () => {
      activeCategoryFilter = btn.dataset.catFilter;
      document.querySelectorAll('[data-cat-filter]').forEach(b => b.classList.toggle('active', b.dataset.catFilter === activeCategoryFilter));
      renderPortfoliosHubGrid();
    };
  });
}

function renderPortfoliosHubGrid() {
  const container = $('portfoliosMainContent');
  if (!container || !window.__hubData) return;
  const { projects, membersMap, projectsByUser } = window.__hubData;
  const queryText = ($('portfolioHubSearch')?.value || '').trim().toLowerCase();

  if (activeSearchTarget === 'portfolios') {
    const memberEntries = [...projectsByUser.entries()]
      .map(([uid, memberProjects]) => {
        const member = membersMap.get(uid) || { uid, displayName: memberProjects[0]?.authorName || tr('Member', 'عضو'), username: memberProjects[0]?.authorUsername || uid };
        const filteredProjects = activeCategoryFilter === 'all'
          ? memberProjects
          : memberProjects.filter(p => p.category === activeCategoryFilter);
        return { member, projects: filteredProjects };
      })
      .filter(item => item.projects.length > 0)
      .filter(item => {
        if (!queryText) return true;
        const name = (item.member.displayName || '').toLowerCase();
        const uname = (item.member.username || '').toLowerCase();
        const school = (item.member.school || item.member.specialization || '').toLowerCase();
        return name.includes(queryText) || uname.includes(queryText) || school.includes(queryText);
      });

    if (!memberEntries.length) {
      container.innerHTML = '<div class="empty-state"><h3>' + tr('No designer portfolios found', 'لا توجد معارض مصممين مطابقة') + '</h3></div>';
      return;
    }

    container.innerHTML = '<div class="designer-portfolios-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px;">' +
      memberEntries.map(({member, projects}) => {
        const portfolioLink = 'portfolios.html?designer=' + encodeURIComponent(member.username || member.uid);
        const bio = member.bio || tr('Architecture & Design Community Member', 'عضو في مجتمع العمارة والتصميم');
        const school = member.school || member.specialization || tr('Architectural Designer', 'مصمم معماري');

        return `
          <article class="designer-card">
            <div class="designer-card-head">
              <a href="${portfolioLink}" class="designer-avatar-wrap">
                ${avatarMarkup(member.displayName || member.username, member.photoBase64 || member.photoURL, 'avatar', member.verified === true)}
                <div class="designer-name-meta">
                  <strong>${escapeHtml(member.displayName || member.username)} ${member.verified ? '✓' : ''}</strong>
                  <small>${escapeHtml(school)}</small>
                </div>
              </a>
              <a href="${portfolioLink}" class="view-designer-btn">${tr('View Portfolio →', 'عرض المعرض ←')}</a>
            </div>
            <p style="margin:0 0 14px; color:#526072; font-size:0.8rem; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(bio)}</p>
            <div class="designer-projects-tiles">
              ${projects.slice(0, 3).map(p => `
                <a href="project.html?communityPost=${encodeURIComponent(p.id)}" class="designer-project-tile">
                  ${p.behanceSrc ? `<iframe src="${escapeHtml(p.behanceSrc)}" loading="lazy" tabindex="-1"></iframe>` : `<div style="padding:6px; color:#fff; font-size:0.6rem; font-weight:800;">${escapeHtml(p.title)}</div>`}
                  <span class="tile-title">${escapeHtml(p.title)}</span>
                </a>
              `).join('')}
            </div>
          </article>
        `;
      }).join('') +
      '</div>';
  } else {
    const filteredProjects = projects
      .filter(p => activeCategoryFilter === 'all' || p.category === activeCategoryFilter)
      .filter(p => {
        if (!queryText) return true;
        const title = (p.title || '').toLowerCase();
        const author = (p.authorName || '').toLowerCase();
        const tools = Array.isArray(p.tools) ? p.tools.join(' ').toLowerCase() : '';
        return title.includes(queryText) || author.includes(queryText) || tools.includes(queryText);
      });

    if (!filteredProjects.length) {
      container.innerHTML = '<div class="empty-state"><h3>' + tr('No uploaded projects found', 'لا توجد مشاريع مرفوعة مطابقة') + '</h3></div>';
      return;
    }

    container.innerHTML = '<div class="profile-post-grid" style="grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">' +
      filteredProjects.map(post => {
        const href = 'project.html?communityPost=' + encodeURIComponent(post.id);
        const profileImage = postImageUrls(post)[0] || '';
        const media = post.behanceSrc
          ? '<iframe src="' + escapeHtml(post.behanceSrc) + '" title="' + escapeHtml(post.title) + '" loading="lazy" tabindex="-1"></iframe>'
          : profileImage
            ? '<img src="' + escapeHtml(profileImage) + '" alt="' + escapeHtml(post.title) + '" loading="lazy">'
            : '<div class="profile-post-placeholder"><span>PROJECT</span><b>' + escapeHtml(initials(post.title)) + '</b></div>';
        return `
          <article class="profile-post-tile project has-image" style="aspect-ratio:4/3; border-radius:18px; overflow:hidden; position:relative;">
            <a class="profile-post-main" href="${href}">
              <div class="profile-post-media">${media}</div>
              <div class="profile-post-overlay" style="padding:14px; background:linear-gradient(0deg, rgba(30,10,12,0.92) 0%, rgba(30,10,12,0.2) 65%, transparent 100%);">
                <div><span class="profile-post-kind" style="padding:3px 8px; border-radius:6px; background:var(--wine); color:#fff; font-size:0.6rem; font-weight:800;">${escapeHtml(post.category || 'PROJECT')}</span></div>
                <strong class="profile-post-title" style="margin-top:6px; color:#fff; font-size:0.95rem; line-height:1.3;">${escapeHtml(post.title)}</strong>
                <div style="margin-top:4px; color:rgba(255,255,255,0.8); font-size:0.7rem; font-weight:700;">${tr('By ', 'بواسطة ')}${escapeHtml(post.authorName || 'Member')}</div>
              </div>
            </a>
          </article>
        `;
      }).join('') +
      '</div>';
  }
}
