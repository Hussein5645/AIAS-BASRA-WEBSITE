import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, query, where, limit, orderBy, onSnapshot, writeBatch, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const config = {
  apiKey: 'AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ',
  authDomain: 'aias-bsr.firebaseapp.com',
  projectId: 'aias-bsr',
  storageBucket: 'aias-bsr.firebasestorage.app',
  messagingSenderId: '78055223814',
  appId: '1:78055223814:web:99460402c2b1fcd5ae8987'
};

let app;
try { app = getApp(); } catch { app = initializeApp(config); }
const auth = getAuth(app);
const db = getFirestore(app);
const profileCache = new Map();
let currentUser = null;
let currentProfile = null;
let communitySort = ['latest','smart','upvoted'].includes(localStorage.getItem('communitySort')) ? localStorage.getItem('communitySort') : 'latest';
let communityType = ['both','text','question','behance'].includes(localStorage.getItem('communityType')) ? localStorage.getItem('communityType') : 'both';
let activeCommentsPostId = null;
let toastTimer = null;
let routeSequence = 0;
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
let profilePostFilter = 'all';
let showOwnPrivateSpacePosts = false;
let activeProfilePosts = [];
let activeEditPostId = null;
let spaceDirectorySort = 'popular';
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
let activeProfileId = null;
let profileConnectionActive = false;
let activeAreaConnection = false;
let unsubscribeNotifications = null;
let notificationItems = [];
let connectionDirectoryType = 'people';
let connectionPeopleItems = [];
let connectionSpaceItems = [];
let activeImagePost = null;
let postImageDataUrl = '';
let postImageMimeType = '';
const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const POST_IMAGE_CHUNK_SIZE = 700000;

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let currentLanguage = localStorage.getItem('language') === 'ar' ? 'ar' : 'en';
const isArabic = () => currentLanguage === 'ar';
const tr = (english, arabic) => isArabic() ? arabic : english;

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

function notificationKey(type, postId, actorId, detailId = '') {
  return [type, postId, actorId, detailId].filter(Boolean).join('_');
}

async function sendNotification(recipientId, type, post, detailId = '', eventId = detailId) {
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

function notificationCopy(item) {
  if (item.type === 'connection') return tr(' connected with you',' تواصل معك');
  if (item.type === 'space_connection') return tr(' connected with your space',' تواصل مع مساحتك');
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
        : item.type === 'space_connection'
          ? areaUrl(item.detailId)
          : '/community.html?post=' + encodeURIComponent(item.postId) + '&comments=1';
      const symbol = item.type === 'connection' ? '◎' : item.type === 'space_connection' ? '#' : item.type === 'reply' ? '↩' : item.type === 'applause' ? '✦' : '◯';
      return '<button class="notification-item' + (item.read ? '' : ' unread') + '" type="button" data-notification-id="' + escapeHtml(item.id) + '" data-notification-url="' + escapeHtml(targetUrl) + '"><span class="notification-symbol" aria-hidden="true">' + symbol + '</span><span><strong>' + escapeHtml(item.actorName || tr('Member','عضو')) + notificationCopy(item) + '</strong><small>' + escapeHtml(item.postTitle || tr('Community post','منشور المجتمع')) + ' · ' + escapeHtml(formatDate(item.createdAt)) + '</small></span><i aria-hidden="true"></i></button>';
    }).join('')
    : '<p class="notification-empty">' + tr('No notifications yet.','لا توجد إشعارات بعد.') + '</p>';
}

function stopNotificationInbox() {
  unsubscribeNotifications?.();
  unsubscribeNotifications = null;
  notificationItems = [];
  $('notificationBell').hidden = true;
  $('notificationPanel').hidden = true;
  renderNotifications();
}

function startNotificationInbox() {
  unsubscribeNotifications?.();
  if (!currentUser) return stopNotificationInbox();
  $('notificationBell').hidden = false;
  const inboxQuery = query(collection(db, 'users', currentUser.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(40));
  unsubscribeNotifications = onSnapshot(inboxQuery, snapshot => {
    notificationItems = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
    renderNotifications();
  }, error => {
    console.warn('[Community] Notifications unavailable.', error);
    $('notificationList').innerHTML = '<p class="notification-empty">' + tr('Notifications are unavailable right now.','الإشعارات غير متاحة حالياً.') + '</p>';
  });
}

async function loadConnections() {
  connectedUserIds = new Set();
  connectedSpaceSlugs = new Set();
  if (!currentUser) return;
  try {
    const [people, spaces] = await Promise.all([
      getDocs(collection(db, 'users', currentUser.uid, 'connections')),
      getDocs(collection(db, 'users', currentUser.uid, 'connectedSpaces'))
    ]);
    connectedUserIds = new Set(people.docs.map(item => item.id));
    connectedSpaceSlugs = new Set(spaces.docs.map(item => item.id).filter(slug => communityAreas[slug]));
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
    ? '<article class="connection-card"><a href="' + escapeHtml(profileUrl(item.uid, item.username)) + '">' + avatarMarkup(item.displayName, item.photo, 'connection-card-avatar') + '<span class="connection-card-copy"><strong>' + escapeHtml(item.displayName) + '</strong><small>' + escapeHtml(item.username ? '@' + item.username : tr('Community member','عضو في المجتمع')) + '</small><p>' + escapeHtml(item.bio || [item.school, item.city].filter(Boolean).join(' · ') || tr('AIAS Basra community','مجتمع AIAS البصرة')) + '</p></span></a><button type="button" data-disconnect-user="' + escapeHtml(item.uid) + '"><span>' + tr('Disconnect','إلغاء التواصل') + '</span><b aria-hidden="true">×</b></button></article>'
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
  if (space.isPrivate && !connectedSpaceSlugs.has(slug) && space.creatorId !== currentUser.uid) {
    const requestRef = doc(db, 'communitySpaces', slug, 'connectionRequests', currentUser.uid);
    const existing = await getDoc(requestRef);
    if (!existing.exists() || existing.data().status !== 'pending') {
      await setDoc(requestRef, {userId:currentUser.uid, spaceSlug:slug, status:'pending', requestedAt:serverTimestamp()});
    }
    return 'requested';
  }
  const next = !connectedSpaceSlugs.has(slug);
  if (!next) {
    const postsSnapshot = await getDocs(query(collection(db, 'communityPosts'), where('userId', '==', currentUser.uid)));
    const spacePosts = postsSnapshot.docs.filter(item => item.data().communitySlug === slug);
    const warning = tr(
      'Disconnect from a/' + slug + '? All of your posts in this space (' + spacePosts.length.toLocaleString() + ') will be permanently deleted. This cannot be undone.',
      'هل تريد إلغاء الاتصال من a/' + slug + '؟ سيتم حذف جميع منشوراتك في هذه المساحة (' + spacePosts.length.toLocaleString('ar-IQ') + ') نهائياً. لا يمكن التراجع عن ذلك.'
    );
    if (!confirm(warning)) return null;
    for (let index = 0; index < spacePosts.length; index += 450) {
      const deleteBatch = writeBatch(db);
      spacePosts.slice(index, index + 450).forEach(item => deleteBatch.delete(item.ref));
      await deleteBatch.commit();
    }
  }
  const batch = writeBatch(db);
  const connectionRef = doc(db, 'users', currentUser.uid, 'connectedSpaces', slug);
  const memberRef = doc(db, 'communitySpaces', slug, 'connections', currentUser.uid);
  if (next) {
    const record = {userId:currentUser.uid, spaceSlug:slug, createdAt:serverTimestamp()};
    batch.set(connectionRef, record);
    batch.set(memberRef, record);
  } else {
    batch.delete(connectionRef);
    batch.delete(memberRef);
  }
  await batch.commit();
  if (next) connectedSpaceSlugs.add(slug); else connectedSpaceSlugs.delete(slug);
  renderCommunitySpaces();
  if (!next) invalidateCommunitySearchIndex();
  await updateConnectionNotification(space.creatorId, 'space_connection', slug, space.name || 'a/' + slug, next);
  return next;
}

function discoverScore(post) {
  const created = post.createdAt?.seconds || 0;
  const ageHours = Math.max(0, Date.now() / 1000 - created) / 3600;
  const freshness = 72 / (1 + ageHours / 18);
  const applause = Math.log2(Math.max(0, post.meta.score) + 1) * 17;
  const conversation = Math.log2(post.meta.commentsCount + 1) * 14;
  const quality = post.featured ? 18 : 0;
  const invitation = isQuestion(post) ? 6 : 0;
  const relevance = connectedUserIds.has(post.userId) || connectedSpaceSlugs.has(post.communitySlug) ? 4 : 0;
  return freshness + applause + conversation + quality + invitation + relevance;
}

function rankDiscoverPosts(posts) {
  const pool = posts.map(post => ({...post, discoverScore:discoverScore(post)})).sort((a,b) => b.discoverScore - a.discoverScore);
  const result = [];
  const authorCounts = new Map();
  while (pool.length) {
    const lastAuthor = result.at(-1)?.userId;
    let index = pool.findIndex(post => post.userId !== lastAuthor && (authorCounts.get(post.userId) || 0) < 2);
    if (index < 0) index = pool.findIndex(post => post.userId !== lastAuthor);
    if (index < 0) index = 0;
    const [post] = pool.splice(index, 1);
    authorCounts.set(post.userId, (authorCounts.get(post.userId) || 0) + 1);
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
    const userSnapshot = await getDoc(doc(db, 'users', routeValue));
    if (userSnapshot.exists()) return routeValue;
    const legacySnapshot = await getDocs(query(collection(db, 'users'), where('username', '==', normalized), limit(1)));
    return legacySnapshot.empty ? null : legacySnapshot.docs[0].id;
  } catch { return null; }
}

function normalizeCommunityHandle(value) {
  return String(value || '').trim().toLowerCase().replace(/^\/?a\//, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function spaceVisual(area, className, tag = 'span') {
  const image = area?.imageBase64 || '';
  return '<' + tag + ' class="' + className + '">' + (image
    ? '<img src="' + escapeHtml(image) + '" alt="">'
    : escapeHtml(area?.symbol || initials(area?.name || 'A'))) + '</' + tag + '>';
}

function canPostToSpace(slug) {
  if (slug === 'main') return true;
  const area = communityAreas[slug];
  return Boolean(currentUser && area && (area.creatorId === currentUser.uid || connectedSpaceSlugs.has(slug)));
}

function canAccessPrivateSpace(area) {
  return !area?.isPrivate || area.creatorId === currentUser?.uid || connectedSpaceSlugs.has(area.slug);
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
  return !area?.isPrivate || area.creatorId === currentUser?.uid || connectedSpaceSlugs.has(post.communitySlug) || post.userId === currentUser?.uid;
}

function renderCommunitySpaces() {
  const spaces = Object.entries(communityAreas).sort((a,b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
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
    .sort((a,b) => spaceDirectorySort === 'new'
      ? b.createdAt - a.createdAt || a.name.localeCompare(b.name)
      : b.postCount - a.postCount || b.lastActivity - a.lastActivity || a.name.localeCompare(b.name));
  document.querySelectorAll('[data-space-sort]').forEach(button => button.classList.toggle('active', button.dataset.spaceSort === spaceDirectorySort));
  $('spaceDirectoryCount').textContent = isArabic()
    ? items.length.toLocaleString('ar-IQ') + ' ' + (items.length === 1 ? 'مساحة' : 'مساحات')
    : items.length + (items.length === 1 ? ' space' : ' spaces');
  if (!items.length) {
    $('spaceDirectoryGrid').innerHTML = '<div class="space-directory-empty"><span>A</span><h2>' + tr('No spaces found','لم يتم العثور على مساحات') + '</h2><p>' + tr('Try another search or create a new member space.','جرّب بحثاً آخر أو أنشئ مساحة جديدة للأعضاء.') + '</p><a href="community.html?view=space">' + tr('Create a space','إنشاء مساحة') + ' <b aria-hidden="true">+</b></a></div>';
    return;
  }
  $('spaceDirectoryGrid').innerHTML = items.map((item,index) => {
    const newSpace = item.createdAt && Date.now() / 1000 - item.createdAt < 60 * 60 * 24 * 30;
    const badge = spaceDirectorySort === 'new' && newSpace ? tr('New','جديدة') : item.postCount > 0 ? tr('Active','نشطة') : tr('Open','مفتوحة');
    const accessStatus = item.isPrivate ? tr('Private','خاصة') : tr('Public','عامة');
    const feedStatus = item.isPrivate || item.showInMainThread === false ? tr('Space only','المساحة فقط') : tr('Main thread','المسار الرئيسي');
    return '<a class="space-directory-card" href="' + areaUrl(item.slug) + '" style="--space-index:' + index + ';' + (item.bannerBase64 ? '--space-banner:url(&quot;' + escapeHtml(item.bannerBase64) + '&quot;)' : '') + '"><div class="space-directory-card-head">' + spaceVisual(item, 'space-directory-symbol') + '<span class="space-directory-badge">' + badge + '</span></div><span class="mini-kicker">a/' + escapeHtml(item.slug) + '</span><h2>' + escapeHtml(item.name) + '</h2><p>' + escapeHtml(item.description || tr('A member space for community conversation.','مساحة للأعضاء وحوارات المجتمع.')) + '</p><div class="space-card-statuses"><span class="' + (item.isPrivate ? 'private' : 'public') + '">' + accessStatus + '</span><span class="' + (item.isPrivate || item.showInMainThread === false ? 'space-only' : 'main-thread') + '">' + feedStatus + '</span></div><footer><span>' + (isArabic() ? item.postCount.toLocaleString('ar-IQ') : item.postCount.toLocaleString()) + ' ' + tr(item.postCount === 1 ? 'post' : 'posts','منشور') + '</span><b aria-hidden="true">' + (isArabic() ? '←' : '→') + '</b></footer></a>';
  }).join('');
}

async function loadSpaceDirectory() {
  $('spaceDirectoryGrid').innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    const postsSnapshot = await getDocs(collection(db, 'communityPosts'));
    const stats = new Map();
    postsSnapshot.docs.forEach(item => {
      const post = item.data();
      if (post.published === false || !post.communitySlug || post.communitySlug === 'main') return;
      const current = stats.get(post.communitySlug) || {postCount:0,lastActivity:0};
      current.postCount += 1;
      current.lastActivity = Math.max(current.lastActivity, spaceTimestamp(post.createdAt));
      stats.set(post.communitySlug, current);
    });
    popularSpaceStats = stats;
    spaceDirectoryItems = Object.entries(communityAreas).map(([slug,area]) => ({
      slug,
      name:area.name || slug,
      description:area.description || '',
      symbol:area.symbol || initials(area.name || slug),
      imageBase64:area.imageBase64 || '',
      bannerBase64:area.bannerBase64 || '',
      creatorUsername:area.creatorUsername || '',
      isPrivate:Boolean(area.isPrivate),
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
    selectedShellProjects = (await getDocs(collection(db, 'communityPosts'))).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(project => project.type === 'behance' && project.featured === true && project.published !== false)
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
    const snapshot = await getDocs(collection(db, 'communitySpaces'));
    communityAreas = Object.fromEntries(snapshot.docs
      .map(item => [item.id, {slug:item.id, ...item.data()}])
      .filter(([, area]) => area.active !== false));
    try {
      const postsSnapshot = await getDocs(collection(db, 'communityPosts'));
      popularSpaceStats = new Map();
      postsSnapshot.docs.forEach(item => {
        const post = item.data();
        if (post.published === false || !post.communitySlug || post.communitySlug === 'main') return;
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
    const snapshot = await getDoc(doc(db, 'communitySpaces', handle));
    if (sequence !== spaceAvailabilitySequence || normalizeCommunityHandle(input.value) !== handle) return false;
    const available = !snapshot.exists();
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

async function createCommunitySpace(name, requestedHandle, description, imageBase64 = '', bannerBase64 = '', isPrivate = false, showInMainThread = true) {
  const handle = normalizeCommunityHandle(requestedHandle);
  if (!/^[a-z0-9-]{3,32}$/.test(handle) || handle === 'main') throw new Error(tr('Choose a valid, non-reserved space handle.','اختر معرّف مساحة صالحاً وغير محجوز.'));
  const spaceRef = doc(db, 'communitySpaces', handle);
  const record = {
    name,
    description,
    symbol: initials(name),
    active: true,
    creatorId: currentUser.uid,
    creatorUsername: currentProfile.username,
    imageBase64,
    bannerBase64,
    isPrivate:Boolean(isPrivate),
    showInMainThread: isPrivate ? false : Boolean(showInMainThread),
    createdAt: serverTimestamp()
  };
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(spaceRef);
    if (snapshot.exists()) throw new Error(tr('That space handle was just taken. Choose another one.','تم حجز معرّف المساحة للتو. اختر معرّفاً آخر.'));
    transaction.set(spaceRef, record);
  });
  invalidateCommunitySearchIndex();
  communityAreas[handle] = {...record, slug:handle};
  renderCommunitySpaces();
  return handle;
}

async function loadManageSpaces() {
  if (!currentUser) {
    $('manageSpacesList').innerHTML = '';
    $('manageSpacesGate').innerHTML = '<p class="notice">' + tr('Sign in to manage your spaces.','سجّل الدخول لإدارة مساحاتك.') + ' <a href="' + loginUrl() + '">' + tr('Sign in','تسجيل الدخول') + '</a></p>';
    return;
  }
  $('manageSpacesGate').innerHTML = '';
  const spaces = Object.entries(communityAreas).filter(([, area]) => area.creatorId === currentUser.uid);
  if (!spaces.length) {
    $('manageSpacesList').innerHTML = '<div class="connections-empty"><span>#</span><h2>' + tr('No spaces yet','لا توجد مساحات بعد') + '</h2><p>' + tr('Create a space to control its membership and visibility.','أنشئ مساحة للتحكم بعضويتها وظهور منشوراتها.') + '</p><a href="community.html?view=space">' + tr('Create a space','إنشاء مساحة') + ' →</a></div>';
    return;
  }
  $('manageSpacesList').innerHTML = '<div class="manage-spaces-grid">' + (await Promise.all(spaces.map(async ([slug, area]) => {
    let requests = [];
    let members = [];
    try {
      const [requestSnapshot, memberSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'communitySpaces', slug, 'connectionRequests'), where('status', '==', 'pending'))),
        getDocs(collection(db, 'communitySpaces', slug, 'connections'))
      ]);
      requests = requestSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
      members = memberSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
    } catch (error) { console.warn('[Community] Space membership unavailable.', error); }
    const requestRows = requests.length ? '<div class="space-request-list">' + (await Promise.all(requests.map(async request => { const profile = await getProfile(request.userId); return '<div><span>' + escapeHtml(profile.displayName || profile.username || tr('Member','عضو')) + '</span><button type="button" data-approve-request="' + escapeHtml(slug) + '|' + escapeHtml(request.userId) + '">' + tr('Approve','موافقة') + '</button><button type="button" data-deny-request="' + escapeHtml(slug) + '|' + escapeHtml(request.userId) + '">' + tr('Deny','رفض') + '</button></div>'; }))).join('') + '</div>' : '<p class="space-request-empty">' + tr('No pending requests.','لا توجد طلبات معلقة.') + '</p>';
    const memberRows = members.length ? '<div class="space-member-list">' + (await Promise.all(members.map(async member => { const profile = await getProfile(member.userId); const name = profile.displayName || profile.username || tr('Member','عضو'); return '<article><a href="' + escapeHtml(profileUrl(member.userId, profile.username)) + '">' + avatarMarkup(name, profile.photoBase64 || profile.photoURL, 'space-member-avatar') + '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(profile.username ? '@' + profile.username : tr('Space member','عضو في المساحة')) + '</small></span></a><button type="button" data-remove-space-member="' + escapeHtml(slug) + '|' + escapeHtml(member.userId) + '">' + tr('Remove access','إزالة الوصول') + '</button></article>'; }))).join('') + '</div>' : '<p class="space-request-empty">' + tr('No connected members yet.','لا يوجد أعضاء متصلون بعد.') + '</p>';
    const settingToggles = '<div class="manage-space-toggles">'
      + '<label class="space-setting-toggle compact"><span class="space-setting-icon" aria-hidden="true">◐</span><span class="space-setting-copy"><strong>' + tr('Private space','مساحة خاصة') + '</strong><small>' + tr('Require approval to connect','تتطلب الموافقة للاتصال') + '</small></span><span class="toggle-control"><input type="checkbox" data-manage-space-setting="' + escapeHtml(slug) + '|isPrivate"' + (area.isPrivate ? ' checked' : '') + '><i aria-hidden="true"></i></span></label>'
      + '<label class="space-setting-toggle compact' + (area.isPrivate ? ' is-disabled' : '') + '"><span class="space-setting-icon" aria-hidden="true">⌁</span><span class="space-setting-copy"><strong>' + tr('Main-thread posts','منشورات المسار الرئيسي') + '</strong><small>' + tr('Show posts outside this space','إظهار المنشورات خارج المساحة') + '</small></span><span class="toggle-control"><input type="checkbox" data-manage-space-setting="' + escapeHtml(slug) + '|showInMainThread"' + (area.showInMainThread !== false && !area.isPrivate ? ' checked' : '') + (area.isPrivate ? ' disabled' : '') + '><i aria-hidden="true"></i></span></label></div>';
    return '<article class="manage-space-card"><div><span class="mini-kicker">a/' + escapeHtml(slug) + '</span><h2>' + escapeHtml(area.name || slug) + '</h2><p>' + escapeHtml(area.description || '') + '</p></div>' + settingToggles + '<button type="button" data-manage-edit="' + escapeHtml(slug) + '">' + tr('Edit name, description & media','تعديل الاسم والوصف والوسائط') + '</button><section><strong>' + tr('Membership requests','طلبات العضوية') + ' (' + requests.length + ')</strong>' + requestRows + '</section><section><strong>' + tr('Space members','أعضاء المساحة') + ' (' + members.length + ')</strong>' + memberRows + '</section></article>';
  }))).join('') + '</div>';
}

async function reviewSpaceRequest(slug, userId, approved) {
  const area = communityAreas[slug];
  if (!area || area.creatorId !== currentUser?.uid) return;
  const batch = writeBatch(db);
  batch.set(doc(db, 'communitySpaces', slug, 'connectionRequests', userId), {status:approved ? 'approved' : 'denied', reviewedAt:serverTimestamp(), reviewedBy:currentUser.uid}, {merge:true});
  if (approved) {
    const record = {userId, spaceSlug:slug, createdAt:serverTimestamp()};
    batch.set(doc(db, 'communitySpaces', slug, 'connections', userId), record);
    batch.set(doc(db, 'users', userId, 'connectedSpaces', slug), record);
  }
  await batch.commit();
  await loadManageSpaces();
  showToast(approved ? tr('Request approved.','تمت الموافقة على الطلب.') : tr('Request denied.','تم رفض الطلب.'));
}

async function removeSpaceMember(slug, userId) {
  const area = communityAreas[slug];
  if (!area || area.creatorId !== currentUser?.uid || !userId) return;
  if (!confirm(tr('Remove this member from a/' + slug + '? They will lose access immediately.','إزالة هذا العضو من a/' + slug + '؟ سيفقد الوصول فوراً.'))) return;
  const requestRef = doc(db, 'communitySpaces', slug, 'connectionRequests', userId);
  const requestSnapshot = await getDoc(requestRef);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'communitySpaces', slug, 'connections', userId));
  batch.delete(doc(db, 'users', userId, 'connectedSpaces', slug));
  if (requestSnapshot.exists()) batch.set(requestRef, {status:'removed', reviewedAt:serverTimestamp(), reviewedBy:currentUser.uid}, {merge:true});
  await batch.commit();
  await loadManageSpaces();
  showToast(tr('Member access removed.','تمت إزالة وصول العضو.'));
}

async function updateManagedSpaceSetting(slug, setting, enabled) {
  const area = communityAreas[slug];
  if (!area || area.creatorId !== currentUser?.uid || !['isPrivate', 'showInMainThread'].includes(setting)) return;
  const changes = setting === 'isPrivate'
    ? {isPrivate:enabled, showInMainThread:enabled ? false : area.showInMainThread !== false, updatedAt:serverTimestamp()}
    : {showInMainThread:enabled, updatedAt:serverTimestamp()};
  await setDoc(doc(db, 'communitySpaces', slug), changes, {merge:true});
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
  $('areaSymbol').innerHTML = area.imageBase64
    ? '<img src="' + escapeHtml(area.imageBase64) + '" alt="">'
    : escapeHtml(area.symbol || initials(area.name));
  $('areaBanner').innerHTML = area.bannerBase64 ? '<img src="' + escapeHtml(area.bannerBase64) + '" alt="">' : '';
  $('areaHeader').classList.toggle('has-banner', Boolean(area.bannerBase64));
  $('areaPath').textContent = 'a/' + activeAreaSlug;
  $('areaTitle').textContent = area.name;
  $('areaDescription').textContent = area.description;
  const owner = currentUser && area.creatorId === currentUser.uid;
  $('areaManage').hidden = !owner;
  $('areaConnect').hidden = Boolean(owner);
  activeAreaConnection = connectedSpaceSlugs.has(activeAreaSlug);
  $('areaConnect').classList.toggle('connected', activeAreaConnection);
  $('areaConnect').querySelector('span').textContent = activeAreaConnection ? tr('Connected','متصل') : (area.isPrivate ? tr('Request to connect','طلب اتصال') : tr('Connect','تواصل'));
  const canPost = Boolean(owner || activeAreaConnection);
  $('areaCreate').disabled = !canPost;
  $('areaCreate').title = canPost ? '' : tr('Connect to this space before posting.','اتصل بهذه المساحة قبل النشر.');
  refreshAreaConnectionCount(activeAreaSlug);
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
  const mainToggle = $('spaceEditShowInMainThread');
  const row = mainToggle.closest('.space-setting-toggle');
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
  editSpaceImageBase64 = area.imageBase64 || '';
  editSpaceBannerBase64 = area.bannerBase64 || '';
  editSpaceMediaBusy = 0;
  $('spaceEditHandle').innerHTML = tr('Permanent address: ','العنوان الدائم: ') + '<strong>a/' + escapeHtml(activeEditSpaceSlug) + '</strong>';
  $('spaceEditName').value = area.name || activeEditSpaceSlug;
  $('spaceEditDescription').value = area.description || '';
  $('spaceEditIsPrivate').checked = Boolean(area.isPrivate);
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
    await deleteDoc(doc(db, 'communitySpaces', slug));
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
    getDocs(collection(db, 'communityPosts')),
    getDocs(collection(db, 'communitySpaces')),
    getDocs(collection(db, 'users'))
  ]).then(([postsSnapshot, spacesSnapshot, usersSnapshot]) => {
    const spaces = spacesSnapshot.docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(space => space.active !== false)
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
      .filter(post => post.published !== false)
      .map(post => ({
        kind:'post',
        id:post.id,
        title:post.title || 'Community post',
        handle:post.authorUsername || '',
        subtitle:postLabel(post) + ' · ' + (post.communitySlug && post.communitySlug !== 'main' ? 'a/' + post.communitySlug : tr('Main thread','المسار الرئيسي')) + ' · @' + (post.authorUsername || post.authorName || tr('member','عضو')),
        searchText:[post.title, plainPostText(post), post.summary, post.authorName, post.authorUsername, post.communitySlug, postLabel(post)].join(' '),
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
  $('communitySearchResults').hidden = false;
  $('communitySearch').setAttribute('aria-expanded', 'true');
}

function closeCommunitySearch() {
  $('communitySearchResults').hidden = true;
  $('communitySearch').setAttribute('aria-expanded', 'false');
  $('communitySearch').removeAttribute('aria-activedescendant');
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
    return '<a id="' + optionId + '" class="search-result ' + result.kind + '" href="' + escapeHtml(result.url) + '" data-search-result role="option" aria-selected="false"><span class="search-result-icon" aria-hidden="true">' + icon + '</span><span class="search-result-copy"><strong>' + highlightSearchText(result.title, query) + '</strong><small>' + highlightSearchText(result.subtitle, query) + '</small></span><span class="search-result-kind">' + kindLabels[result.kind] + '</span></a>';
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

function avatarMarkup(name, photo, className) {
  const safeName = escapeHtml(name || 'Community member');
  const content = photo
    ? '<img src="' + escapeHtml(photo) + '" alt="' + safeName + '">'
    : '<span>' + escapeHtml(initials(name)) + '</span>';
  return '<span class="' + className + '">' + content + '</span>';
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
  if (!profileCache.has(uid)) {
    profileCache.set(uid, getDoc(doc(db, 'users', uid)).then(snapshot => snapshot.exists() ? snapshot.data() : {}).catch(() => ({})));
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
  const [profile, votesSnapshot, commentsSnapshot] = await Promise.all([
    getProfile(post.userId),
    getDocs(collection(db, 'communityPosts', post.id, 'votes')),
    getDocs(collection(db, 'communityPosts', post.id, 'comments'))
  ]);
  return {
    profile,
    score: votesSnapshot.docs.reduce((total, item) => total + (Number(item.data().value) || 0), 0),
    mine: votesSnapshot.docs.find(item => item.id === currentUser?.uid)?.data().value || 0,
    commentsCount: commentsSnapshot.size
  };
}

function canonicalPostUrl(post) {
  const path = isProject(post)
    ? '/project.html?communityPost=' + encodeURIComponent(post.id)
    : '/community.html?post=' + encodeURIComponent(post.id);
  return new URL(path, location.origin).href;
}

function loginUrl() {
  const returnPath = location.pathname.replace(/^\/+/, '') + location.search;
  return '/login.html?next=' + encodeURIComponent(returnPath);
}

function setActiveNavigation(viewName) {
  document.querySelectorAll('[data-route]').forEach(link => {
    link.classList.toggle('active', link.dataset.route === viewName);
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== name + 'View'; });
  setActiveNavigation(name);
}

function navigateTo(url, replace) {
  const next = new URL(url, location.href);
  history[replace ? 'replaceState' : 'pushState']({}, '', next.pathname + next.search + next.hash);
  handleRoute(true);
}

async function handleRoute(scrollToTop) {
  const sequence = ++routeSequence;
  if (communityDataReady) await communityDataReady;
  const params = new URLSearchParams(location.search);
  const pathRoute = getPathRoute();
  const selectedPostId = params.get('post');
  const requestedView = params.get('view');
  const publicProfileRoute = pathRoute.profile || params.get('user');
  const requestedArea = pathRoute.area || params.get('area');
  activeAreaSlug = requestedArea && communityAreas[requestedArea] ? requestedArea : null;
  const view = publicProfileRoute || requestedView === 'profile' ? 'profile' : requestedView === 'connections' ? 'connections' : requestedView === 'manage-spaces' ? 'manage-spaces' : requestedView === 'selected' ? 'selected' : requestedView === 'spaces' ? 'spaces' : requestedView === 'post' ? 'post' : requestedView === 'space' ? 'space' : 'home';
  const savedFeedMode = localStorage.getItem('communityFeedMode');
  feedMode = currentUser ? (params.has('feed') ? (params.get('feed') === 'discover' ? 'discover' : 'following') : (savedFeedMode === 'discover' ? 'discover' : 'following')) : 'discover';
  localStorage.setItem('communityFeedMode', feedMode);
  if (!params.has('comments')) closeCommentsUi();
  showView(view);
  updateMobilePromptVisibility();
  if (scrollToTop) window.scrollTo({top:0, behavior:'smooth'});

  if (view === 'home') {
    const restrictedArea = Boolean(activeAreaSlug && communityAreas[activeAreaSlug]?.isPrivate && !canAccessPrivateSpace(communityAreas[activeAreaSlug]));
    $('detailContext').hidden = !selectedPostId;
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
    $('posts').hidden = restrictedArea;
    renderPrivateSpaceGate(activeAreaSlug && !selectedPostId ? communityAreas[activeAreaSlug] : null);
    if (!restrictedArea) await loadPosts();
    if (sequence !== routeSequence) return;
    if (selectedPostId && params.get('comments') === '1') openComments(selectedPostId, false);
  } else if (view === 'selected') {
    document.title = tr('Selected Projects — AIAS Basra Community','المشاريع المختارة — مجتمع AIAS البصرة');
    await loadSelectedShell();
  } else if (view === 'spaces') {
    document.title = tr('Discover Spaces — AIAS Basra Community','اكتشف المساحات — مجتمع AIAS البصرة');
    await loadSpaceDirectory();
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
    const requestedType = ['text','question','behance'].includes(params.get('type')) ? params.get('type') : $('postType').value;
    $('postType').value = requestedType;
    const requestedTypeChoice = document.querySelector('input[name="postTypeChoice"][value="' + requestedType + '"]');
    if (requestedTypeChoice) requestedTypeChoice.checked = true;
    renderPostTypeFields();
    $('postCommunity').value = activeAreaSlug ? 'a/' + activeAreaSlug : params.get('area') || 'main';
    validateCommunityHandle(true);
    renderPostGate();
  } else {
    renderSpaceGate();
  }
}

function renderPostCard(post, index, detail) {
  const meta = post.meta;
  const authorName = post.authorName || meta.profile.displayName || tr('Community member','عضو في المجتمع');
  const school = meta.profile.school || (isProject(post) ? tr('Project author','صاحب المشروع') : tr('Community member','عضو في المجتمع'));
  const authorProfileUrl = profileUrl(post.userId, meta.profile.username);
  const communitySlug = communityAreas[post.communitySlug] ? post.communitySlug : 'main';
  const communityContext = communitySlug === 'main'
    ? '<span class="main-thread-label">' + tr('Main thread','المسار الرئيسي') + '</span>'
    : '<a href="' + areaUrl(communitySlug) + '">a/' + escapeHtml(communitySlug) + '</a>';
  const destination = isProject(post)
    ? 'project.html?communityPost=' + encodeURIComponent(post.id)
    : 'community.html?post=' + encodeURIComponent(post.id);
  const text = isProject(post) ? post.summary : plainPostText(post);
  const selected = isProject(post) && post.featured ? '<span class="selected-badge">· ' + tr('Selected','مختار') + '</span>' : '';
  const projectPreview = isProject(post) && post.behanceSrc
    ? '<div class="project-preview"><iframe title="' + escapeHtml(post.title) + '" src="' + escapeHtml(post.behanceSrc) + '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><a class="project-preview-link" href="' + destination + '">' + tr('Open project','فتح المشروع') + ' <span aria-hidden="true">↗</span></a></div>'
    : '';
  const imagePreview = post.type === 'text' && post.imageDataUrl
    ? '<figure class="post-image"><img src="' + escapeHtml(post.imageDataUrl) + '" alt="' + escapeHtml(post.title) + '" loading="lazy"></figure>'
    : '';
  const requestStatus = post.featureStatus === 'denied' ? tr('not selected','لم يُختر') : tr('pending','قيد المراجعة');
  const request = currentUser?.uid === post.userId && isProject(post) && !post.featured && post.featureRequest
    ? '<div class="project-request">' + tr('Selection request:','طلب اختيار:') + ' <strong>' + escapeHtml(requestStatus) + '</strong></div>'
    : '';
  return [
    '<article class="post-card' + (detail ? ' detail' : '') + (isQuestion(post) ? ' question' : '') + '"' + (detail ? '' : ' data-open-post="' + escapeHtml(post.id) + '" tabindex="0" role="link"') + ' style="--i:' + index + '">',
      '<div class="post-context">' + communityContext + '<span>·</span><span>' + postLabel(post) + '</span></div>',
      '<div class="post-head">',
        '<a class="post-author" href="' + authorProfileUrl + '">',
          avatarMarkup(authorName, meta.profile.photoBase64 || meta.profile.photoURL, 'avatar'),
          '<span class="author-copy"><strong>' + escapeHtml(authorName) + '</strong><span>' + escapeHtml(school) + ' · ' + escapeHtml(formatDate(post.createdAt)) + selected + '</span></span>',
        '</a>',
        '<span class="post-kind' + (isProject(post) ? ' project' : isQuestion(post) ? ' question' : '') + '">' + postLabel(post) + '</span>',
      '</div>',
      '<h2 class="post-title"><a href="' + destination + '">' + escapeHtml(post.title) + '</a></h2>',
      '<div class="post-body">' + escapeHtml(text) + '</div>',
      imagePreview,
      projectPreview,
      '<div class="post-actions">',
        '<div class="vote-control" role="group" aria-label="' + tr('Post voting','تقييم المنشور') + '">',
          '<button class="vote-arrow up ' + (meta.mine === 1 ? 'active' : '') + '" type="button" data-vote="1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="' + tr('Applaud this post','التصفيق لهذا المنشور') + '"><span aria-hidden="true">↑</span></button>',
          '<b class="vote-score" data-vote-score="' + post.id + '">' + meta.score + '</b>',
          '<button class="vote-arrow down ' + (meta.mine === -1 ? 'active' : '') + '" type="button" data-vote="-1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="' + tr('Show less like this','عرض محتوى أقل من هذا النوع') + '"><span aria-hidden="true">↓</span></button>',
        '</div>',
        '<button class="action-button" type="button" data-open-comments="' + post.id + '"><span class="action-icon" aria-hidden="true">◯</span><span>' + meta.commentsCount + ' ' + (isQuestion(post) ? (isArabic() ? 'إجابة' : meta.commentsCount === 1 ? 'answer' : 'answers') : (isArabic() ? 'تعليق' : meta.commentsCount === 1 ? 'comment' : 'comments')) + '</span></button>',
        '<button class="action-button share" type="button" data-share="' + post.id + '"><span class="action-icon" aria-hidden="true">↗</span><span>' + tr('Share','مشاركة') + '</span></button>',
      '</div>',
      request,
    '</article>'
  ].join('');
}

function bindPostActions(target, posts) {
  const byId = new Map(posts.map(post => [post.id, post]));
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
      await setDoc(doc(db, 'communityPosts', postId, 'votes', currentUser.uid), {
        userId: currentUser.uid,
        value,
        updatedAt: serverTimestamp()
      });
      if (value === 1) await sendNotification(post.userId, 'applause', post);
      else if (previousValue === 1) await removeNotification(post.userId, 'applause', post.id);
      post.meta.mine = value;
      post.meta.score = nextScore;
    } catch (error) {
      console.error(error);
      paintReaction(previousValue, previousScore);
      showToast(tr('Your reaction could not be saved.','تعذر حفظ تفاعلك.'));
    } finally {
      reactionButtons.forEach(item => { item.disabled = false; });
    }
  }));
  target.querySelectorAll('[data-open-comments]').forEach(button => button.addEventListener('click', () => openComments(button.dataset.openComments, true)));
  target.querySelectorAll('[data-open-post]').forEach(card => {
    const open = event => {
      if (event.target.closest('a,button,input,textarea,[data-open-image]')) return;
      navigateTo('/community.html?post=' + encodeURIComponent(card.dataset.openPost), false);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
  });
  target.querySelectorAll('.post-image img').forEach(image => image.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const card = image.closest('[data-open-post], .post-card');
    const post = byId.get(card?.dataset.openPost) || posts.find(item => item.id === card?.querySelector('[data-open-comments]')?.dataset.openComments);
    if (post) openImageViewer(post);
  }));
  target.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const post = byId.get(button.dataset.share);
    if (!post) return;
    const shareData = {title: post.title + ' — AIAS Basra Community', text: plainPostText(post).slice(0, 140), url: canonicalPostUrl(post)};
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        showToast(tr('Post link copied.','تم نسخ رابط المنشور.'));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(tr('The post link could not be shared.','تعذرت مشاركة رابط المنشور.'));
    }
  }));
}

function renderImageViewerActions() {
  const post = activeImagePost;
  if (!post) return;
  const meta = post.meta || {mine:0, score:0, commentsCount:0};
  $('imageViewerActions').innerHTML = '<button type="button" data-image-vote="1" class="' + (meta.mine === 1 ? 'active' : '') + '" aria-label="' + tr('Applaud','التصفيق') + '">↑</button><b>' + (meta.score || 0) + '</b><button type="button" data-image-vote="-1" class="' + (meta.mine === -1 ? 'active' : '') + '" aria-label="' + tr('Show less','عرض أقل') + '">↓</button><button type="button" class="image-comment-button" data-image-comments><span aria-hidden="true">◯</span><span>' + (meta.commentsCount || 0) + '</span></button>';
}

function openImageViewer(post) {
  if (!post?.imageDataUrl) return;
  activeImagePost = post;
  $('imageViewerImage').src = post.imageDataUrl;
  $('imageViewerImage').alt = post.title || tr('Post image','صورة المنشور');
  renderImageViewerActions();
  $('imageViewer').hidden = false;
  document.body.classList.add('image-viewer-open');
}

function closeImageViewer() {
  activeImagePost = null;
  $('imageViewer').hidden = true;
  $('imageViewerImage').src = '';
  document.body.classList.remove('image-viewer-open');
}

async function voteFromImageViewer(value) {
  const post = activeImagePost;
  if (!post) return;
  if (!currentUser) { location.href = loginUrl(); return; }
  const previous = Number(post.meta.mine) || 0;
  const next = previous === value ? 0 : value;
  try {
    await setDoc(doc(db, 'communityPosts', post.id, 'votes', currentUser.uid), {userId:currentUser.uid, value:next, updatedAt:serverTimestamp()});
    if (next === 1) await sendNotification(post.userId, 'applause', post);
    else if (previous === 1) await removeNotification(post.userId, 'applause', post.id);
    post.meta.mine = next;
    post.meta.score = (Number(post.meta.score) || 0) + next - previous;
    document.querySelectorAll('[data-vote-score="' + post.id + '"]').forEach(score => { score.textContent = String(post.meta.score); });
    renderImageViewerActions();
  } catch (error) { console.error(error); showToast(tr('Your reaction could not be saved.','تعذر حفظ تفاعلك.')); }
}

async function loadPosts() {
  const target = $('posts');
  target.setAttribute('aria-busy', 'true');
  target.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton short"></div>';
  try {
    const params = new URLSearchParams(location.search);
    const selectedPostId = params.get('post');
    const allPosts = (await getDocs(collection(db, 'communityPosts'))).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.published !== false)
      .filter(canViewSpacePost);
    $('postStat').textContent = allPosts.length;
    $('projectStat').textContent = allPosts.filter(isProject).length;

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
    posts = await Promise.all(posts.map(async post => {
      const hydrated = await loadPostImage(post);
      return {...hydrated, meta:await getPostMeta(hydrated)};
    }));
    if (communitySort === 'smart') posts = rankDiscoverPosts(posts);
    else posts.sort((a, b) => communitySort === 'upvoted'
        ? b.meta.score - a.meta.score || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

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
      target.innerHTML = posts.map((post, index) => renderPostCard(post, index, Boolean(selectedPostId))).join('');
      bindPostActions(target, posts);
    }
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="notice error">' + tr('The community feed is taking a break. Please try again in a moment.','خلاصة المجتمع غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.') + '</p>';
  } finally {
    target.setAttribute('aria-busy', 'false');
  }
}

function renderThread(comment, byParent) {
  const children = byParent.get(comment.id) || [];
  return [
    '<article class="comment">',
      '<div class="comment-head"><strong>' + escapeHtml(comment.userName || tr('Member','عضو')) + '</strong><span class="comment-time">' + escapeHtml(formatDate(comment.createdAt)) + '</span></div>',
      '<div class="comment-text">' + escapeHtml(comment.text) + '</div>',
      '<div class="comment-actions">',
        currentUser ? '<button class="comment-action" type="button" data-reply="' + comment.id + '" data-user="' + escapeHtml(comment.userId) + '" data-name="' + escapeHtml(comment.userName || tr('Member','عضو')) + '">' + tr('Reply','رد') + '</button>' : '',
        children.length ? '<button class="comment-action" type="button" data-thread="' + comment.id + '" aria-expanded="false">' + (isArabic() ? 'عرض ' + children.length + ' رد' : 'Show ' + children.length + ' ' + (children.length === 1 ? 'reply' : 'replies')) + '</button>' : '',
        currentUser?.uid === comment.userId ? '<button class="comment-action" type="button" data-delete-comment="' + comment.id + '">' + tr('Delete','حذف') + '</button>' : '',
      '</div>',
      '<div class="reply-slot"></div>',
      children.length ? '<div class="comment-children" data-children="' + comment.id + '" hidden>' + children.map(child => renderThread(child, byParent)).join('') + '</div>' : '',
    '</article>'
  ].join('');
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
      getDocs(collection(db, 'communityPosts', postId, 'comments'))
    ]);
    if (!postSnapshot.exists()) throw new Error(tr('Post not found','المنشور غير موجود'));
    const post = {id:postId, ...postSnapshot.data()};
    const comments = commentsSnapshot.docs.map(item => ({id:item.id, ...item.data()}));
    const knownIds = new Set(comments.map(comment => comment.id));
    const byParent = new Map();
    comments.forEach(comment => {
      const parent = knownIds.has(comment.parentId) ? comment.parentId : null;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(comment);
    });
    byParent.forEach(items => items.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    const roots = byParent.get(null) || [];
    document.querySelector('.comments-sheet .mini-kicker').textContent = isQuestion(post) ? tr('OPEN ANSWERS','إجابات مفتوحة') : tr('DISCUSSION','النقاش');
    $('commentsSheetTitle').textContent = post.title || tr('Comments','التعليقات');
    $('commentsSheetBody').innerHTML = [
      '<div class="comments">',
        roots.length ? roots.map(comment => renderThread(comment, byParent)).join('') : '<div class="empty-state"><span class="empty-mark">+</span><h3>' + (isQuestion(post) ? tr('Share the first answer','شارك أول إجابة') : tr('Start the conversation','ابدأ الحوار')) + '</h3><p>' + (isQuestion(post) ? tr('Offer experience, a reference, or a useful direction.','شارك تجربة أو مرجعاً أو اتجاهاً مفيداً.') : tr('Ask a question or leave thoughtful feedback.','اطرح سؤالاً أو اترك ملاحظة بنّاءة.')) + '</p></div>',
        currentUser
          ? '<form class="comment-form" data-comment="' + postId + '"><input required maxlength="2000" placeholder="' + (isQuestion(post) ? tr('Write an answer…','اكتب إجابة…') : tr('Add to the conversation…','أضف إلى الحوار…')) + '" aria-label="' + (isQuestion(post) ? tr('Write an answer','اكتب إجابة') : tr('Add a comment','أضف تعليقاً')) + '"><button class="comment-submit">' + (isQuestion(post) ? tr('Answer','إجابة') : tr('Post','نشر')) + '</button></form>'
          : '<p class="notice"><a href="' + loginUrl() + '">' + tr('Sign in','سجّل الدخول') + '</a> ' + tr('to join the discussion.','للانضمام إلى النقاش.') + '</p>',
      '</div>'
    ].join('');
    bindCommentActions(postId, post);
    $('commentsOverlay').querySelector('.comments-close').focus();
  } catch (error) {
    console.error(error);
    $('commentsSheetBody').innerHTML = '<p class="notice error">' + tr('Comments are unavailable right now.','التعليقات غير متاحة حالياً.') + '</p>';
  }
}

function bindCommentActions(postId, post) {
  const target = $('commentsSheetBody');
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
    slot.innerHTML = '<form class="reply-form"><textarea maxlength="2000" required placeholder="' + tr('Reply to ','الرد على ') + escapeHtml(button.dataset.name) + '"></textarea><button class="comment-submit">' + tr('Reply','رد') + '</button></form>';
    slot.querySelector('textarea').focus();
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const text = slot.querySelector('textarea').value.trim();
      if (!text || !currentUser) return;
      const commentRef = await addDoc(collection(db, 'communityPosts', postId, 'comments'), {
        userId: currentUser.uid,
        userName: currentProfile?.displayName || currentUser.displayName || tr('Member','عضو'),
        text,
        parentId: button.dataset.reply,
        createdAt: serverTimestamp()
      });
      await sendNotification(button.dataset.user, 'reply', post, button.dataset.reply, commentRef.id);
      await openComments(postId, false);
    });
  }));
  target.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
    await deleteDoc(doc(db, 'communityPosts', postId, 'comments', button.dataset.deleteComment));
    await openComments(postId, false);
  }));
  target.querySelectorAll('[data-comment]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = form.querySelector('input');
    if (!input.value.trim() || !currentUser) return;
    const submit = form.querySelector('button');
    submit.disabled = true;
    const commentRef = await addDoc(collection(db, 'communityPosts', postId, 'comments'), {
      userId: currentUser.uid,
      userName: currentProfile?.displayName || currentUser.displayName || tr('Member','عضو'),
      text: input.value.trim(),
      parentId: null,
      createdAt: serverTimestamp()
    });
    await sendNotification(post.userId, 'comment', post, commentRef.id);
    await openComments(postId, false);
  }));
}

function closeCommentsUi() {
  activeCommentsPostId = null;
  $('commentsOverlay').hidden = true;
  document.body.classList.remove('comments-open');
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

function renderPostTypeFields() {
  const question = $('postType').value === 'question';
  const project = $('postType').value === 'behance';
  $('postCommunityGroup').hidden = project;
  $('projectFields').hidden = !project;
  $('postBehanceEmbed').required = project;
  $('postImageGroup').hidden = question || project;
  $('postContent').required = true;
  document.querySelector('label[for="postContent"]').textContent = project ? tr('Describe your project','صف مشروعك') : question ? tr('Add helpful context','أضف سياقاً مفيداً') : tr('Tell the community more','أخبر المجتمع بالمزيد');
  $('postContent').placeholder = project ? tr('Explain the idea, process, and feedback you would like.','اشرح الفكرة وعملية التصميم والملاحظات التي ترغب بها.') : question ? tr('What have you tried, and what kind of answer would help?','ماذا جرّبت، وما نوع الإجابة التي ستفيدك؟') : tr('Share context, a fresh perspective, or invite feedback…','شارك السياق أو منظوراً جديداً أو اطلب آراء الأعضاء…');
  $('postTitle').placeholder = project ? tr('Give your project a clear title','امنح مشروعك عنواناً واضحاً') : question ? tr('Ask one clear, open question','اطرح سؤالاً مفتوحاً وواضحاً') : tr('Share one clear insight or idea','شارك فكرة أو رؤية واضحة');
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

async function savePostImageChunks(postId, dataUrl) {
  if (!dataUrl) return 0;
  const separator = dataUrl.indexOf(',');
  const payload = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
  const chunks = Array.from({length:Math.ceil(payload.length / POST_IMAGE_CHUNK_SIZE)}, (_, index) => payload.slice(index * POST_IMAGE_CHUNK_SIZE, (index + 1) * POST_IMAGE_CHUNK_SIZE));
  for (let index = 0; index < chunks.length; index += 1) {
    await setDoc(doc(db, 'communityPosts', postId, 'images', String(index).padStart(3, '0')), {index, data:chunks[index], createdAt:serverTimestamp()});
  }
  return chunks.length;
}

async function loadPostImage(post) {
  if (!post.imageChunkCount || post.imageChunkCount < 1 || post.imageDataUrl) return post;
  try {
    const chunks = (await getDocs(collection(db, 'communityPosts', post.id, 'images'))).docs.map(item => item.data()).sort((a,b) => a.index - b.index);
    if (chunks.length !== post.imageChunkCount || chunks.some((chunk, index) => chunk.index !== index)) return post;
    const payload = chunks.map(chunk => chunk.data).join('');
    return {...post, imageDataUrl:'data:' + post.imageMimeType + ';base64,' + payload};
  } catch (error) { console.warn('[Community] Post image could not be loaded.', error); return post; }
}

function renderPostGate() {
  const allowed = currentUser && currentProfile?.profileComplete && currentProfile?.username;
  if (allowed) {
    $('postGate').innerHTML = '';
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
    $('spaceGate').innerHTML = '';
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
  const allowedPosts = activeProfilePosts.filter(post => showOwnPrivateSpacePosts || !communityAreas[post.communitySlug]?.isPrivate);
  const posts = profilePostFilter === 'all' ? allowedPosts : allowedPosts.filter(post => post.type === profilePostFilter);
  document.querySelectorAll('[data-profile-filter]').forEach(button => button.classList.toggle('active', button.dataset.profileFilter === profilePostFilter));
  const visibleCount = isArabic() ? posts.length.toLocaleString('ar-IQ') : posts.length.toLocaleString();
  const totalCount = isArabic() ? allowedPosts.length.toLocaleString('ar-IQ') : allowedPosts.length.toLocaleString();
  $('profilePostCount').textContent = profilePostFilter === 'all'
    ? (isArabic() ? totalCount + ' منشوراً' : totalCount + (allowedPosts.length === 1 ? ' post' : ' posts'))
    : tr(visibleCount + ' of ' + totalCount, visibleCount + ' من ' + totalCount);
  if (!posts.length) {
    const filtered = allowedPosts.length > 0;
    target.innerHTML = '<div class="empty-state"><span class="empty-mark">A</span><h3>' + (filtered ? tr('Nothing in this filter','لا يوجد محتوى في هذا التصنيف') : tr('No posts yet','لا توجد منشورات بعد')) + '</h3><p>' + (filtered ? tr('Try another profile filter.','جرّب تصنيفاً آخر للملف.') : tr('This member is still preparing their first idea.','لا يزال هذا العضو يحضّر فكرته الأولى.')) + '</p></div>';
    return;
  }
  target.innerHTML = posts.map(post => {
      const href = isProject(post) ? 'project.html?communityPost=' + encodeURIComponent(post.id) : 'community.html?post=' + encodeURIComponent(post.id);
      const owner = currentUser?.uid === post.userId;
      return [
        '<article class="profile-post-tile' + (isProject(post) ? ' project' : '') + '">',
          '<a class="profile-post-main" href="' + href + '">',
          '<div class="profile-post-content"><span class="profile-post-kind">' + postLabel(post).toUpperCase() + '</span>' + (communityAreas[post.communitySlug]?.isPrivate ? '<span class="profile-private-post">' + tr('Private space','مساحة خاصة') + '</span>' : '') + '<strong class="profile-post-title">' + escapeHtml(post.title) + '</strong><p>' + escapeHtml(isProject(post) ? post.summary : plainPostText(post)) + '</p></div>',
          '<span class="tile-stats"><span>✦ ' + post.meta.score + '</span><span>◯ ' + post.meta.commentsCount + '</span></span>',
          '</a>',
          owner ? '<div class="profile-post-actions"><button type="button" data-edit-profile-post="' + escapeHtml(post.id) + '">' + tr('Edit','تعديل') + '</button><button type="button" data-delete-profile-post="' + escapeHtml(post.id) + '">' + tr('Delete','حذف') + '</button></div>' : '',
        '</article>'
      ].join('');
    }).join('');
}

function closePostEditor() {
  activeEditPostId = null;
  $('postEditStatus').textContent = '';
  if ($('postEditDialog').open) $('postEditDialog').close();
}

function openPostEditor(postId) {
  const post = activeProfilePosts.find(item => item.id === postId);
  if (!post || currentUser?.uid !== post.userId) return;
  activeEditPostId = postId;
  $('postEditId').value = postId;
  $('postEditHeading').value = post.title || '';
  $('postEditBody').value = post.content || post.summary || '';
  $('postEditBehance').value = post.behanceSrc || '';
  $('postEditBehanceGroup').hidden = !isProject(post);
  $('postEditBodyLabel').textContent = isProject(post) ? tr('Project description','وصف المشروع') : tr('Content','المحتوى');
  $('postEditStatus').textContent = '';
  $('postEditDialog').showModal();
  $('postEditHeading').focus();
}

async function deleteOwnedPost(postId) {
  const post = activeProfilePosts.find(item => item.id === postId);
  if (!post || currentUser?.uid !== post.userId) return;
  if (!confirm(tr('Delete this post permanently? This cannot be undone.','هل تريد حذف هذا المنشور نهائياً؟ لا يمكن التراجع عن ذلك.'))) return;
  try {
    const [votes, comments] = await Promise.all([
      getDocs(collection(db, 'communityPosts', postId, 'votes')),
      getDocs(collection(db, 'communityPosts', postId, 'comments'))
    ]);
    await Promise.all([
      ...votes.docs.map(item => deleteDoc(item.ref)),
      ...comments.docs.map(item => deleteDoc(item.ref))
    ]);
    await deleteDoc(doc(db, 'communityPosts', postId));
    activeProfilePosts = activeProfilePosts.filter(item => item.id !== postId);
    invalidateCommunitySearchIndex();
    renderProfilePosts();
    showToast(tr('Post deleted.','تم حذف المنشور.'));
  } catch (error) {
    console.error(error);
    showToast(tr('This post could not be deleted.','تعذر حذف هذا المنشور.'));
  }
}

async function loadProfilePosts(uid, owner) {
  const target = $('profilePosts');
  target.innerHTML = '<div class="post-skeleton short"></div>';
  try {
    let posts = (await getDocs(collection(db, 'communityPosts'))).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.published !== false && post.userId === uid)
      .filter(post => owner || !communityAreas[post.communitySlug]?.isPrivate)
      .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    activeProfilePosts = await Promise.all(posts.map(async post => ({...post, meta:await getPostMeta(post)})));
    renderProfilePosts();
  } catch (error) {
    console.error(error);
    activeProfilePosts = [];
    target.innerHTML = '<p class="notice error">' + tr('Profile posts are unavailable right now.','منشورات الملف الشخصي غير متاحة حالياً.') + '</p>';
  }
}

async function loadProfile(uid, routedProfile) {
  const target = $('profileContent');
  if (!uid) {
    activeProfilePosts = [];
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
  try {
    const profile = await getProfile(uid);
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
    const banner = profile.bannerBase64 || '';
    const locationLine = [profile.school, profile.city].filter(Boolean).join(' · ') || tr('AIAS Basra community','مجتمع AIAS البصرة');
    const interests = String(profile.interests || '').split(',').map(item => item.trim()).filter(Boolean);
    document.title = (profile.username ? 'p/' + profile.username : displayName) + tr(' — AIAS Basra Community',' — مجتمع AIAS البصرة');
    target.className = 'profile-hero';
    target.innerHTML = [
      '<div class="profile-banner-media">' + (banner ? '<img src="' + escapeHtml(banner) + '" alt="">' : '') + '</div>',
      '<div class="profile-top">',
        avatarMarkup(displayName, photo, 'profile-avatar'),
        '<div class="profile-title"><h2>' + escapeHtml(displayName) + '</h2><span class="profile-handle">' + (profile.username ? '@' + escapeHtml(profile.username) : tr('No username claimed','لم يتم اختيار اسم مستخدم')) + '</span><p>' + escapeHtml(locationLine) + '</p></div>',
        owner ? '<button id="editProfile" class="edit-profile-button" type="button">' + tr('Edit profile','تعديل الملف') + '</button>' : '<button id="profileConnect" class="edit-profile-button connect-button ' + (profileConnectionActive ? 'connected' : '') + '" type="button"><span>' + (profileConnectionActive ? tr('Connected','متصل') : tr('Connect','تواصل')) + '</span></button>',
      '</div>',
      '<div class="profile-connection-stat"><span aria-hidden="true">◎</span><strong id="profileConnectionCount">' + profileConnectionCount.toLocaleString(isArabic() ? 'ar-IQ' : undefined) + '</strong><span id="profileConnectionLabel">' + tr('connected people','أشخاص متصلون') + '</span>' + (owner ? '<a href="/community.html?view=connections">' + tr('Manage','إدارة') + ' →</a>' : '') + '</div>',
      '<p class="profile-bio">' + escapeHtml(profile.bio || tr('No bio added yet.','لم تُضف نبذة بعد.')) + '</p>',
      interests.length ? '<div class="interest-row">' + interests.map(item => '<span>' + escapeHtml(item) + '</span>').join('') + '</div>' : '',
      owner ? [
        '<form id="profileForm" class="profile-form" hidden>',
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
      let nextPhotoBase64 = profile.photoBase64 || '';
      let nextBannerBase64 = profile.bannerBase64 || '';
      let profileMediaBusy = 0;
      const updateMediaPreview = (targetId, value, emptyCopy) => {
        $(targetId).innerHTML = value ? '<img src="' + escapeHtml(value) + '" alt="">' : emptyCopy;
      };
      const bindMediaUpload = (inputId, statusId, previewId, kind) => {
        $(inputId).addEventListener('change', async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          profileMediaBusy += 1;
          $(statusId).textContent = tr('Preparing image…','جارٍ تجهيز الصورة…');
          try {
            const value = await prepareProfileImage(file, kind);
            if (kind === 'avatar') nextPhotoBase64 = value;
            else nextBannerBase64 = value;
            updateMediaPreview(previewId, value, '');
            $(statusId).textContent = tr('Ready to save','جاهزة للحفظ');
          } catch (error) {
            console.error(error);
            $(statusId).textContent = error.message || tr('Image could not be prepared.','تعذر تجهيز الصورة.');
            event.target.value = '';
          } finally {
            profileMediaBusy -= 1;
          }
        });
      };
      bindMediaUpload('profilePhotoFile', 'profilePhotoStatus', 'profilePhotoPreview', 'avatar');
      bindMediaUpload('profileBannerFile', 'profileBannerStatus', 'profileBannerPreview', 'banner');
      $('removeProfilePhoto').addEventListener('click', () => {
        nextPhotoBase64 = '';
        $('profilePhotoFile').value = '';
        updateMediaPreview('profilePhotoPreview', '', tr('No image','لا توجد صورة'));
        $('profilePhotoStatus').textContent = tr('Image will be removed when saved','ستُزال الصورة عند الحفظ');
      });
      $('removeProfileBanner').addEventListener('click', () => {
        nextBannerBase64 = '';
        $('profileBannerFile').value = '';
        updateMediaPreview('profileBannerPreview', '', tr('No banner','لا يوجد غلاف'));
        $('profileBannerStatus').textContent = tr('Banner will be removed when saved','سيُزال الغلاف عند الحفظ');
      });
      if (!profile.username) {
        let usernameTimer;
        $('profileUsername').addEventListener('input', () => {
          clearTimeout(usernameTimer);
          usernameTimer = setTimeout(() => checkUsernameAvailability($('profileUsername'), $('profileUsernameStatus'), uid), 250);
        });
      }
      $('editProfile').addEventListener('click', () => {
        $('profileForm').hidden = !$('profileForm').hidden;
        if (!$('profileForm').hidden) $('profileName').focus();
      });
      $('profileForm').addEventListener('submit', async event => {
        event.preventDefault();
        const button = event.submitter;
        button.disabled = true;
        try {
          if (profileMediaBusy) throw new Error(tr('Wait for the images to finish preparing.','انتظر حتى يكتمل تجهيز الصور.'));
          if (!profile.username) {
            const available = await checkUsernameAvailability($('profileUsername'), $('profileUsernameStatus'), uid);
            if (!available) throw new Error(tr('Choose an available username before saving your profile.','اختر اسم مستخدم متاحاً قبل حفظ ملفك.'));
          }
          const username = profile.username || await claimUsername(uid, $('profileUsername').value);
          await setDoc(doc(db, 'users', uid), {
            username,
            displayName: $('profileName').value.trim(),
            school: $('profileSchool').value.trim(),
            city: $('profileCity').value.trim(),
            interests: $('profileInterests').value.trim(),
            bio: $('profileBio').value.trim(),
            photoBase64: nextPhotoBase64,
            bannerBase64: nextBannerBase64,
            profileComplete: true,
            updatedAt: serverTimestamp()
          }, {merge:true});
          invalidateCommunitySearchIndex();
          profileCache.delete(uid);
          currentProfile = await getProfile(uid);
          const savedPhoto = currentProfile.photoBase64 || currentProfile.photoURL || currentUser.photoURL || '';
          const savedName = currentProfile.displayName || currentUser.displayName || tr('Member','عضو');
          $('memberAction').innerHTML = savedPhoto ? '<img src="' + escapeHtml(savedPhoto) + '" alt="' + escapeHtml(savedName) + '">' : '<span>' + escapeHtml(initials(savedName)) + '</span>';
          $('quickAvatar').innerHTML = savedPhoto ? '<img src="' + escapeHtml(savedPhoto) + '" alt="">' : escapeHtml(initials(savedName));
          showToast(tr('Profile updated.','تم تحديث الملف الشخصي.'));
          history.replaceState({}, '', profileUrl(uid, username));
          await loadProfile(uid);
        } catch (error) {
          showToast(error.message || tr('Your profile could not be updated.','تعذر تحديث ملفك الشخصي.'));
          button.disabled = false;
        }
      });
    }
    await loadProfilePosts(uid, owner);
  } catch (error) {
    console.error(error);
    target.className = '';
    target.innerHTML = '<p class="notice error">' + tr('This profile is unavailable right now.','هذا الملف الشخصي غير متاح حالياً.') + '</p>';
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('data-route') || link.target || link.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const destination = new URL(link.href, location.href);
  const isCommunityDestination = /^\/(a|p)\/[^/]+\/?$/.test(destination.pathname) || destination.pathname === '/community.html';
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
window.addEventListener('popstate', () => { closeCommunitySearch(); handleRoute(false); });

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

document.querySelectorAll('[data-profile-filter]').forEach(button => button.addEventListener('click', () => {
  profilePostFilter = button.dataset.profileFilter;
  renderProfilePosts();
}));
$('profilePrivatePostsToggle').addEventListener('click', () => {
  if (currentUser?.uid !== activeProfileId) return;
  showOwnPrivateSpacePosts = !showOwnPrivateSpacePosts;
  $('profilePrivatePostsToggle').classList.toggle('active', showOwnPrivateSpacePosts);
  $('profilePrivatePostsToggle').setAttribute('aria-pressed', String(showOwnPrivateSpacePosts));
  renderProfilePosts();
});
$('spaceDirectorySearch').addEventListener('input', renderSpaceDirectory);
$('selectedShellSearch').addEventListener('input', renderSelectedShell);
$('connectionsSearch').addEventListener('input', renderConnectionManager);
document.querySelectorAll('[data-connection-type]').forEach(button => button.addEventListener('click', () => {
  connectionDirectoryType = button.dataset.connectionType;
  $('connectionsSearch').value = '';
  renderConnectionManager();
}));
$('connectionsList').addEventListener('click', async event => {
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
  renderSpaceDirectory();
}));

$('profilePosts').addEventListener('click', event => {
  const editButton = event.target.closest('[data-edit-profile-post]');
  const deleteButton = event.target.closest('[data-delete-profile-post]');
  if (editButton) openPostEditor(editButton.dataset.editProfilePost);
  if (deleteButton) deleteOwnedPost(deleteButton.dataset.deleteProfilePost);
});
$('postEditClose').addEventListener('click', closePostEditor);
$('postEditCancel').addEventListener('click', closePostEditor);
$('postEditDialog').addEventListener('cancel', () => { activeEditPostId = null; });
$('postEditDialog').addEventListener('click', event => { if (event.target === $('postEditDialog')) closePostEditor(); });
$('postEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  const post = activeProfilePosts.find(item => item.id === activeEditPostId);
  if (!post || currentUser?.uid !== post.userId) return closePostEditor();
  const button = event.submitter;
  const title = $('postEditHeading').value.trim();
  const content = $('postEditBody').value.trim();
  const behanceSrc = isProject(post) ? extractBehanceEmbed($('postEditBehance').value) : post.behanceSrc || '';
  if (!title || !content) {
    $('postEditStatus').textContent = tr('Add a title and content before saving.','أضف عنواناً ومحتوى قبل الحفظ.');
    return;
  }
  if (isProject(post) && !behanceSrc) {
    $('postEditStatus').textContent = tr('Paste a valid Behance embed link.','الصق رابط تضمين صالحاً من Behance.');
    return;
  }
  button.disabled = true;
  try {
    const changes = {title, content, summary:content.slice(0,360), updatedAt:serverTimestamp()};
    if (isProject(post)) changes.behanceSrc = behanceSrc;
    await setDoc(doc(db, 'communityPosts', post.id), changes, {merge:true});
    activeProfilePosts = activeProfilePosts.map(item => item.id === post.id ? {...item, ...changes} : item);
    invalidateCommunitySearchIndex();
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
$('communitySearch').addEventListener('focus', event => runCommunitySearch(event.target.value));
$('communitySearch').addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runCommunitySearch(event.target.value), 130);
});
$('communitySearch').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if ($('communitySearchResults').hidden) runCommunitySearch(event.currentTarget.value);
    else moveCommunitySearchSelection(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    const options = [...$('communitySearchResults').querySelectorAll('[data-search-result]')];
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
$('communitySearchResults').addEventListener('mousemove', event => {
  const hovered = event.target.closest('[data-search-result]');
  if (!hovered) return;
  const options = [...$('communitySearchResults').querySelectorAll('[data-search-result]')];
  communitySearchActiveIndex = options.indexOf(hovered);
  options.forEach((option, index) => {
    const active = index === communitySearchActiveIndex;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
});
$('communitySearchResults').addEventListener('click', event => {
  const result = event.target.closest('[data-search-result]');
  if (!result || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  followCommunitySearchResult(result);
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.community-search-shell')) closeCommunitySearch();
  if (!event.target.closest('.notification-shell')) $('notificationPanel').hidden = true;
});
$('imageViewerBackdrop').addEventListener('click', closeImageViewer);
$('imageViewerClose').addEventListener('click', closeImageViewer);
$('imageViewerActions').addEventListener('click', async event => {
  const vote = event.target.closest('[data-image-vote]');
  if (vote) { await voteFromImageViewer(Number(vote.dataset.imageVote)); return; }
  if (event.target.closest('[data-image-comments]') && activeImagePost) {
    const postId = activeImagePost.id;
    closeImageViewer();
    await openComments(postId, true);
  }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('imageViewer').hidden) closeImageViewer(); });

$('quickComposer').addEventListener('click', () => navigateTo(composerUrl(), false));
$('railSpacesExpand').addEventListener('click', () => { railSpacesExpanded = !railSpacesExpanded; renderCommunitySpaces(); });
$('areaCreate').addEventListener('click', () => navigateTo(composerUrl(), false));
$('areaManage').addEventListener('click', openSpaceEditor);
$('manageSpacesList').addEventListener('click', async event => {
  const edit = event.target.closest('[data-manage-edit]');
  const approve = event.target.closest('[data-approve-request]');
  const deny = event.target.closest('[data-deny-request]');
  const removeMember = event.target.closest('[data-remove-space-member]');
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
  catch (error) { console.error(error); showToast(tr('The space setting could not be saved.','تعذر حفظ إعداد المساحة.')); await loadManageSpaces(); }
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
    renderActiveAreaHeader(communityAreas[activeAreaSlug]);
    await refreshAreaConnectionCount(activeAreaSlug);
    if (!activeAreaConnection) await loadPosts();
    showToast(activeAreaConnection ? tr('Space connection added.','تمت إضافة التواصل مع المساحة.') : tr('Space connection removed.','تمت إزالة التواصل مع المساحة.'));
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
$('notificationBell').addEventListener('click', () => { $('notificationPanel').hidden = !$('notificationPanel').hidden; });
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
  navigateTo(button.dataset.feedMode === 'discover' ? '/community.html?feed=discover' : '/community.html', false);
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
[
  ['postTitle', 'titleCount', 160],
  ['postContent', 'contentCount', 2000]
].forEach(([inputId, countId, limit]) => {
  $(inputId).addEventListener('input', event => { $(countId).textContent = event.target.value.length.toLocaleString() + ' / ' + limit.toLocaleString(); });
});
renderPostTypeFields();

$('postImageFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('postImageStatus').textContent = tr('Preparing image…','جارٍ تجهيز الصورة…');
  try {
    postImageDataUrl = await preparePostImage(file);
    postImageMimeType = file.type;
    $('postImagePreview').innerHTML = '<img src="' + escapeHtml(postImageDataUrl) + '" alt="">';
    $('postImagePreview').hidden = false;
    $('removePostImage').hidden = false;
    $('postImageStatus').textContent = tr('Image ready to publish.','الصورة جاهزة للنشر.');
  } catch (error) {
    event.target.value = '';
    postImageDataUrl = '';
    postImageMimeType = '';
    $('postImageStatus').textContent = error.message;
  }
});
$('removePostImage').addEventListener('click', () => {
  postImageDataUrl = '';
  postImageMimeType = '';
  $('postImageFile').value = '';
  $('postImagePreview').innerHTML = '';
  $('postImagePreview').hidden = true;
  $('removePostImage').hidden = true;
  $('postImageStatus').textContent = tr('Images are saved securely in chunks. Maximum file size: 10 MB.','تُحفظ الصور بأجزاء آمنة. الحد الأقصى لحجم الملف: 10 ميغابايت.');
});

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
setCommunityLanguage(currentLanguage, false);

$('postForm').addEventListener('submit', async event => {
  event.preventDefault();
  const type = ['question','behance'].includes($('postType').value) ? $('postType').value : 'text';
  const title = $('postTitle').value.trim();
  const content = $('postContent').value.trim();
  const behanceSrc = type === 'behance' ? extractBehanceEmbed($('postBehanceEmbed').value) : '';
  const imageDataUrl = type === 'text' ? postImageDataUrl : '';
  const imageChunkCount = imageDataUrl ? Math.ceil((imageDataUrl.slice(imageDataUrl.indexOf(',') + 1).length) / POST_IMAGE_CHUNK_SIZE) : 0;
  $('postStatus').classList.remove('success');
  if (!content) {
    $('postStatus').textContent = tr('Write something before publishing.','اكتب شيئاً قبل النشر.');
    return;
  }
  if (type === 'behance' && !behanceSrc) {
    $('postStatus').textContent = tr('Paste a valid Behance embed link before publishing.','الصق رابط تضمين صالحاً من Behance قبل النشر.');
    $('postBehanceEmbed').focus();
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const communitySlug = type === 'behance' ? 'main' : await validateCommunityHandleLive(true);
    if (!communitySlug) {
      $('postStatus').textContent = tr('Choose an existing community handle before publishing.','اختر معرّف مساحة موجوداً قبل النشر.');
      button.disabled = false;
      return;
    }
    const postRef = await addDoc(collection(db, 'communityPosts'), {
      type,
      title,
      summary: content.slice(0, 360),
      content,
      behanceSrc,
      communitySlug,
      userId: currentUser.uid,
      authorName: currentProfile.displayName || currentUser.displayName || tr('Member','عضو'),
      authorUsername: currentProfile.username,
      published: !imageDataUrl,
      imageChunkCount,
      imageMimeType: imageDataUrl ? postImageMimeType : '',
      featureRequest: false,
      featureStatus: 'none',
      featured: false,
      createdAt: serverTimestamp()
    });
    if (imageDataUrl) {
      $('postStatus').textContent = tr('Uploading image…','جارٍ رفع الصورة…');
      await savePostImageChunks(postRef.id, imageDataUrl);
      await setDoc(postRef, {published:true}, {merge:true});
    }
    invalidateCommunitySearchIndex();
    $('postForm').reset();
    postImageDataUrl = '';
    postImageMimeType = '';
    $('postImagePreview').innerHTML = '';
    $('postImagePreview').hidden = true;
    $('removePostImage').hidden = true;
    $('postImageStatus').textContent = tr('Images are saved securely in chunks. Maximum file size: 10 MB.','تُحفظ الصور بأجزاء آمنة. الحد الأقصى لحجم الملف: 10 ميغابايت.');
    $('postType').value = 'text';
    document.querySelector('input[name="postTypeChoice"][value="text"]').checked = true;
    renderPostTypeFields();
    ['postTitle','postContent'].forEach(id => $(id).dispatchEvent(new Event('input')));
    showToast(tr('Your post is live.','تم نشر منشورك.'));
    if (type === 'behance') location.href = '/project.html?communityPost=' + encodeURIComponent(postRef.id);
    else navigateTo('/community.html?post=' + encodeURIComponent(postRef.id), false);
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
$('spaceIsPrivate').addEventListener('change', event => { if (event.target.checked) $('spaceShowInMainThread').checked = false; });
$('spaceEditIsPrivate').addEventListener('change', syncSpaceVisibilityToggle);
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
    await setDoc(doc(db, 'communitySpaces', slug), {
      name,
      description,
      symbol:initials(name),
      imageBase64:editSpaceImageBase64,
      bannerBase64:editSpaceBannerBase64,
      isPrivate:$('spaceEditIsPrivate').checked,
      showInMainThread:$('spaceEditIsPrivate').checked ? false : $('spaceEditShowInMainThread').checked,
      updatedAt:serverTimestamp()
    }, {merge:true});
    communityAreas[slug] = {...area, name, description, symbol:initials(name), imageBase64:editSpaceImageBase64, bannerBase64:editSpaceBannerBase64, isPrivate:$('spaceEditIsPrivate').checked, showInMainThread:$('spaceEditIsPrivate').checked ? false : $('spaceEditShowInMainThread').checked};
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
    const handle = await createCommunitySpace(name, $('spaceHandle').value, description, newSpaceImageBase64, newSpaceBannerBase64, $('spaceIsPrivate').checked, $('spaceShowInMainThread').checked);
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
    $('spaceStatus').textContent = error.message || tr('This space could not be created.','تعذر إنشاء هذه المساحة.');
    await checkSpaceHandleAvailability($('spaceHandle'), $('spaceHandleStatus'));
  } finally {
    button.disabled = false;
  }
});

communityDataReady = loadCommunitySpaces();
loadPromptOfTheWeek();

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    currentProfile = await getProfile(user.uid);
    if (currentProfile.username) {
      try { await claimUsername(user.uid, currentProfile.username); }
      catch (error) { console.warn('[Community] Existing username index could not be repaired.', error); }
    }
    const displayName = currentProfile.displayName || user.displayName || tr('Member','عضو');
    const photo = currentProfile.photoBase64 || currentProfile.photoURL || user.photoURL || '';
    $('memberAction').href = profileUrl(user.uid, currentProfile.username);
    $('switchAccount').hidden = false;
    document.querySelectorAll('[data-route="profile"]').forEach(link => { link.href = profileUrl(user.uid, currentProfile.username); });
    $('memberAction').setAttribute('aria-label', tr('Open your community profile','افتح ملفك المجتمعي'));
    $('memberAction').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(displayName) + '">' : '<span>' + escapeHtml(initials(displayName)) + '</span>';
    $('quickAvatar').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="">' : escapeHtml(initials(displayName));
  } else {
    currentProfile = null;
    railSpacesExpanded = false;
    $('memberAction').href = loginUrl();
    $('switchAccount').hidden = true;
    $('memberAction').setAttribute('aria-label', tr('Sign in','تسجيل الدخول'));
    $('memberAction').innerHTML = '<span>?</span>';
    $('quickAvatar').textContent = 'A';
  }
  if (communityDataReady) await communityDataReady;
  await loadConnections();
  renderCommunitySpaces();
  startNotificationInbox();
  renderPostGate();
  renderSpaceGate();
  handleRoute(false);
});
