import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, query, where, limit, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
let communitySort = 'latest';
let communityType = 'both';
let activeCommentsPostId = null;
let searchTerm = '';
let toastTimer = null;
let routeSequence = 0;
let activeAreaSlug = null;
let communityAreas = {};
let communityDataReady = null;
let selectedPromptPostId = null;

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isProject = post => post.type === 'behance';
const isQuestion = post => post.type === 'question';
const postLabel = post => isProject(post) ? 'Project' : isQuestion(post) ? 'Open question' : 'Thought';

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
  return String(value || '').trim().toLowerCase().replace(/^\/?a\//, '').replace(/[^a-z0-9-]/g, '');
}

function renderCommunitySpaces() {
  const spaces = Object.entries(communityAreas).sort((a,b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
  $('railSpacesList').innerHTML = spaces.length
    ? spaces.map(([slug, area]) => '<a href="' + areaUrl(slug) + '"><i>' + escapeHtml(area.symbol || initials(area.name)) + '</i><span>a/' + escapeHtml(slug) + '</span></a>').join('')
    : '<span class="spaces-loading">No community spaces yet.</span>';
  $('sideSpacesList').innerHTML = spaces.length
    ? spaces.slice(0, 4).map(([slug, area]) => '<a href="' + areaUrl(slug) + '"><span class="space-avatar">' + escapeHtml(area.symbol || initials(area.name)) + '</span><span><strong>a/' + escapeHtml(slug) + '</strong><small>' + escapeHtml(area.description || area.name) + '</small></span><b>›</b></a>').join('')
    : '<span class="spaces-loading">Spaces created by the community team will appear here.</span>';
  $('communityHandles').innerHTML = '<option value="main">Main thread</option>' + spaces.map(([slug, area]) => '<option value="a/' + escapeHtml(slug) + '">' + escapeHtml(area.name || slug) + '</option>').join('');
  $('mobileSpacesLink').href = spaces.length ? areaUrl(spaces[0][0]) : '/community.html';
}

async function loadCommunitySpaces() {
  try {
    const snapshot = await getDocs(collection(db, 'communitySpaces'));
    communityAreas = Object.fromEntries(snapshot.docs
      .map(item => [item.id, {slug:item.id, ...item.data()}])
      .filter(([, area]) => area.active !== false));
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
  const valid = slug === 'main' || Boolean(communityAreas[slug]);
  $('postCommunity').setCustomValidity(valid ? '' : 'Choose an existing Firebase community handle.');
  if (showMessage) {
    const status = $('postCommunityStatus');
    status.className = valid ? 'valid' : 'invalid';
    status.textContent = valid
      ? (slug === 'main' ? 'Posting to the main thread.' : 'Posting to a/' + slug + ' and the main thread.')
      : 'No Firebase community exists with that handle.';
  }
  return valid ? slug : null;
}

async function loadPromptOfTheWeek() {
  try {
    const settingSnapshot = await getDoc(doc(db, 'communitySettings', 'main'));
    const postId = settingSnapshot.exists() ? settingSnapshot.data().promptPostId : null;
    if (!postId) throw new Error('No prompt selected');
    const postSnapshot = await getDoc(doc(db, 'communityPosts', postId));
    if (!postSnapshot.exists() || postSnapshot.data().type !== 'question' || postSnapshot.data().published === false) throw new Error('Selected prompt is unavailable');
    const post = postSnapshot.data();
    selectedPromptPostId = postId;
    $('promptTitle').textContent = post.title;
    $('promptAuthor').textContent = 'Asked by @' + (post.authorUsername || post.authorName || 'member');
    $('promptCard').hidden = false;
  } catch {
    selectedPromptPostId = null;
    $('promptCard').hidden = true;
  }
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
  if (!timestamp?.toDate) return 'Just now';
  const date = timestamp.toDate();
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString(undefined, {month:'short', day:'numeric', year:date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
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
  const username = normalizeUsername(input.value);
  if (input.value !== username) input.value = username;
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    input.setCustomValidity('Use 3–24 lowercase letters, numbers, or underscores.');
    status.className = 'username-check invalid';
    status.textContent = 'Use 3–24 lowercase letters, numbers, or underscores.';
    return false;
  }
  status.className = 'username-check';
  status.textContent = 'Checking p/' + username + '…';
  try {
    const snapshot = await getDoc(doc(db, 'usernames', username));
    const available = !snapshot.exists() || snapshot.data().userId === uid;
    input.setCustomValidity(available ? '' : 'That username is already taken.');
    status.className = 'username-check ' + (available ? 'valid' : 'invalid');
    status.textContent = available ? 'p/' + username + ' is available.' : 'p/' + username + ' is already taken.';
    return available;
  } catch {
    input.setCustomValidity('Username availability could not be checked.');
    status.className = 'username-check invalid';
    status.textContent = 'Could not check this username. Try again.';
    return false;
  }
}

async function claimUsername(uid, requestedUsername) {
  const username = normalizeUsername(requestedUsername);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error('Use 3–24 lowercase letters, numbers, or underscores.');
  }
  const usernameRef = doc(db, 'usernames', username);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(usernameRef);
    if (snapshot.exists()) {
      if (snapshot.data().userId !== uid) throw new Error('That username is already taken.');
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
  const view = publicProfileRoute || requestedView === 'profile' ? 'profile' : requestedView === 'post' ? 'post' : 'home';
  if (!params.has('comments')) closeCommentsUi();
  showView(view);
  if (scrollToTop) window.scrollTo({top:0, behavior:'smooth'});

  if (view === 'home') {
    $('detailContext').hidden = !selectedPostId;
    $('areaHeader').hidden = Boolean(selectedPostId) || !activeAreaSlug;
    document.querySelector('.welcome-card').hidden = Boolean(selectedPostId) || Boolean(activeAreaSlug);
    $('quickComposer').hidden = Boolean(selectedPostId);
    document.querySelector('.feed-toolbar').hidden = Boolean(selectedPostId);
    if (activeAreaSlug) {
      const area = communityAreas[activeAreaSlug];
      $('areaSymbol').textContent = area.symbol;
      $('areaPath').textContent = 'a/' + activeAreaSlug;
      $('areaTitle').textContent = area.name;
      $('areaDescription').textContent = area.description;
      document.querySelector('.feed-heading h2').textContent = area.name + ' posts';
      document.title = 'a/' + activeAreaSlug + ' — AIAS Basra Community';
    } else {
      document.querySelector('.feed-heading h2').textContent = 'Community feed';
      document.title = selectedPostId ? 'Post — AIAS Basra Community' : 'Community — AIAS Basra';
    }
    await loadPosts();
    if (sequence !== routeSequence) return;
    if (selectedPostId && params.get('comments') === '1') openComments(selectedPostId, false);
  } else if (view === 'profile') {
    const profileId = publicProfileRoute ? await resolveProfileId(publicProfileRoute) : currentUser?.uid || null;
    await loadProfile(profileId, Boolean(publicProfileRoute));
  } else {
    $('postCommunity').value = activeAreaSlug ? 'a/' + activeAreaSlug : params.get('area') || 'main';
    validateCommunityHandle(true);
    renderPostGate();
  }
}

function renderPostCard(post, index, detail) {
  const meta = post.meta;
  const authorName = post.authorName || meta.profile.displayName || 'Community member';
  const school = meta.profile.school || (isProject(post) ? 'Project author' : 'Community member');
  const authorProfileUrl = profileUrl(post.userId, meta.profile.username);
  const communitySlug = communityAreas[post.communitySlug] ? post.communitySlug : 'main';
  const communityContext = communitySlug === 'main'
    ? '<span class="main-thread-label">Main thread</span>'
    : '<a href="' + areaUrl(communitySlug) + '">a/' + escapeHtml(communitySlug) + '</a>';
  const destination = isProject(post)
    ? 'project.html?communityPost=' + encodeURIComponent(post.id)
    : 'community.html?post=' + encodeURIComponent(post.id);
  const text = isProject(post) ? post.summary : plainPostText(post);
  const selected = isProject(post) && post.featured ? '<span class="selected-badge">· Selected</span>' : '';
  const projectPreview = isProject(post) && post.behanceSrc
    ? '<div class="project-preview"><iframe title="' + escapeHtml(post.title) + '" src="' + escapeHtml(post.behanceSrc) + '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><a class="project-preview-link" href="' + destination + '">Open project <span aria-hidden="true">↗</span></a></div>'
    : '';
  const request = currentUser?.uid === post.userId && isProject(post) && !post.featured && post.featureRequest
    ? '<div class="project-request">Selection request: <strong>' + escapeHtml(post.featureStatus || 'pending') + '</strong></div>'
    : '';
  return [
    '<article class="post-card' + (detail ? ' detail' : '') + (isQuestion(post) ? ' question' : '') + '" style="--i:' + index + '">',
      '<div class="post-context">' + communityContext + '<span>·</span><span>' + postLabel(post) + '</span></div>',
      '<div class="post-head">',
        '<a class="post-author" href="' + authorProfileUrl + '">',
          avatarMarkup(authorName, meta.profile.photoURL, 'avatar'),
          '<span class="author-copy"><strong>' + escapeHtml(authorName) + '</strong><span>' + escapeHtml(school) + ' · ' + escapeHtml(formatDate(post.createdAt)) + selected + '</span></span>',
        '</a>',
        '<span class="post-kind' + (isProject(post) ? ' project' : isQuestion(post) ? ' question' : '') + '">' + postLabel(post) + '</span>',
      '</div>',
      '<h2 class="post-title"><a href="' + destination + '">' + escapeHtml(post.title) + '</a></h2>',
      '<div class="post-body">' + escapeHtml(text) + '</div>',
      projectPreview,
      '<div class="post-actions">',
        '<button class="action-button applaud ' + (meta.mine === 1 ? 'active' : '') + '" type="button" data-vote="1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="Applaud this post"><span class="action-icon" aria-hidden="true">✦</span><span>Applaud</span><b>' + meta.score + '</b></button>',
        '<button class="action-button down ' + (meta.mine === -1 ? 'active' : '') + '" type="button" data-vote="-1" data-current="' + meta.mine + '" data-id="' + post.id + '" aria-label="Show less like this"><span class="action-icon" aria-hidden="true">⌄</span></button>',
        '<button class="action-button" type="button" data-open-comments="' + post.id + '"><span class="action-icon" aria-hidden="true">◯</span><span>' + meta.commentsCount + ' ' + (isQuestion(post) ? (meta.commentsCount === 1 ? 'answer' : 'answers') : (meta.commentsCount === 1 ? 'comment' : 'comments')) + '</span></button>',
        '<button class="action-button share" type="button" data-share="' + post.id + '"><span class="action-icon" aria-hidden="true">↗</span><span>Share</span></button>',
      '</div>',
      request,
    '</article>'
  ].join('');
}

function bindPostActions(target, posts) {
  const byId = new Map(posts.map(post => [post.id, post]));
  target.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', async () => {
    if (!currentUser) {
      showToast('Sign in to react to community posts.');
      setTimeout(() => { location.href = loginUrl(); }, 650);
      return;
    }
    const requested = Number(button.dataset.vote);
    const value = Number(button.dataset.current) === requested ? 0 : requested;
    button.disabled = true;
    if (value === 1) {
      button.classList.remove('celebrate');
      void button.offsetWidth;
      button.classList.add('celebrate');
    }
    try {
      await setDoc(doc(db, 'communityPosts', button.dataset.id, 'votes', currentUser.uid), {
        userId: currentUser.uid,
        value,
        updatedAt: serverTimestamp()
      });
      await loadPosts();
    } catch (error) {
      console.error(error);
      showToast('Your reaction could not be saved.');
      button.disabled = false;
    }
  }));
  target.querySelectorAll('[data-open-comments]').forEach(button => button.addEventListener('click', () => openComments(button.dataset.openComments, true)));
  target.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const post = byId.get(button.dataset.share);
    if (!post) return;
    const shareData = {title: post.title + ' — AIAS Basra Community', text: plainPostText(post).slice(0, 140), url: canonicalPostUrl(post)};
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Post link copied.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('The post link could not be shared.');
    }
  }));
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
      .filter(post => post.published !== false);
    $('postStat').textContent = allPosts.length;
    $('projectStat').textContent = allPosts.filter(isProject).length;

    let posts = allPosts;
    if (selectedPostId) {
      posts = posts.filter(post => post.id === selectedPostId);
    } else {
      if (activeAreaSlug) posts = posts.filter(post => post.communitySlug === activeAreaSlug);
      if (communityType !== 'both') {
        posts = posts.filter(post => communityType === 'text'
          ? !isProject(post) && !isQuestion(post)
          : post.type === communityType);
      }
      if (searchTerm) {
        posts = posts.filter(post => [post.title, plainPostText(post), post.authorName].join(' ').toLowerCase().includes(searchTerm));
      }
    }
    posts = await Promise.all(posts.map(async post => ({...post, meta:await getPostMeta(post)})));
    posts.sort((a, b) => communitySort === 'upvoted'
      ? b.meta.score - a.meta.score || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    $('feedCount').textContent = selectedPostId ? '' : posts.length + (posts.length === 1 ? ' post' : ' posts');
    if (!posts.length) {
      const copy = selectedPostId
        ? ['Post unavailable', 'This post may have been removed or the link is incorrect.']
        : searchTerm
          ? ['No matches yet', 'Try another name, idea, or project keyword.']
          : activeAreaSlug
            ? ['This space is ready', 'Be the first member to post in a/' + activeAreaSlug + '.']
            : ['A quiet studio — for now', 'Be the first member to start this conversation.'];
      target.innerHTML = '<div class="empty-state"><span class="empty-mark">A</span><h3>' + copy[0] + '</h3><p>' + copy[1] + '</p></div>';
    } else {
      target.innerHTML = posts.map((post, index) => renderPostCard(post, index, Boolean(selectedPostId))).join('');
      bindPostActions(target, posts);
    }
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="notice error">The community feed is taking a break. Please try again in a moment.</p>';
  } finally {
    target.setAttribute('aria-busy', 'false');
  }
}

function renderThread(comment, byParent) {
  const children = byParent.get(comment.id) || [];
  return [
    '<article class="comment">',
      '<div class="comment-head"><strong>' + escapeHtml(comment.userName || 'Member') + '</strong><span class="comment-time">' + escapeHtml(formatDate(comment.createdAt)) + '</span></div>',
      '<div class="comment-text">' + escapeHtml(comment.text) + '</div>',
      '<div class="comment-actions">',
        currentUser ? '<button class="comment-action" type="button" data-reply="' + comment.id + '" data-name="' + escapeHtml(comment.userName || 'Member') + '">Reply</button>' : '',
        children.length ? '<button class="comment-action" type="button" data-thread="' + comment.id + '" aria-expanded="false">Show ' + children.length + ' ' + (children.length === 1 ? 'reply' : 'replies') + '</button>' : '',
        currentUser?.uid === comment.userId ? '<button class="comment-action" type="button" data-delete-comment="' + comment.id + '">Delete</button>' : '',
      '</div>',
      '<div class="reply-slot"></div>',
      children.length ? '<div class="comment-children" data-children="' + comment.id + '" hidden>' + children.map(child => renderThread(child, byParent)).join('') + '</div>' : '',
    '</article>'
  ].join('');
}

async function openComments(postId, updateRoute) {
  if (updateRoute) {
    const params = new URLSearchParams(location.search);
    params.set('post', postId);
    params.set('comments', '1');
    history.pushState({communityOverlay:true}, '', '/community.html?' + params.toString());
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
    if (!postSnapshot.exists()) throw new Error('Post not found');
    const post = postSnapshot.data();
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
    document.querySelector('.comments-sheet .mini-kicker').textContent = isQuestion(post) ? 'OPEN ANSWERS' : 'DISCUSSION';
    $('commentsSheetTitle').textContent = post.title || 'Comments';
    $('commentsSheetBody').innerHTML = [
      '<div class="comments">',
        roots.length ? roots.map(comment => renderThread(comment, byParent)).join('') : '<div class="empty-state"><span class="empty-mark">+</span><h3>' + (isQuestion(post) ? 'Share the first answer' : 'Start the conversation') + '</h3><p>' + (isQuestion(post) ? 'Offer experience, a reference, or a useful direction.' : 'Ask a question or leave thoughtful feedback.') + '</p></div>',
        currentUser
          ? '<form class="comment-form" data-comment="' + postId + '"><input required maxlength="2000" placeholder="' + (isQuestion(post) ? 'Write an answer…' : 'Add to the conversation…') + '" aria-label="' + (isQuestion(post) ? 'Write an answer' : 'Add a comment') + '"><button class="comment-submit">' + (isQuestion(post) ? 'Answer' : 'Post') + '</button></form>'
          : '<p class="notice"><a href="' + loginUrl() + '">Sign in</a> to join the discussion.</p>',
      '</div>'
    ].join('');
    bindCommentActions(postId);
    $('commentsOverlay').querySelector('.comments-close').focus();
  } catch (error) {
    console.error(error);
    $('commentsSheetBody').innerHTML = '<p class="notice error">Comments are unavailable right now.</p>';
  }
}

function bindCommentActions(postId) {
  const target = $('commentsSheetBody');
  target.querySelectorAll('[data-thread]').forEach(button => button.addEventListener('click', () => {
    const box = target.querySelector('[data-children="' + button.dataset.thread + '"]');
    if (!box) return;
    box.hidden = !box.hidden;
    button.setAttribute('aria-expanded', String(!box.hidden));
    button.textContent = box.hidden ? 'Show ' + box.children.length + ' ' + (box.children.length === 1 ? 'reply' : 'replies') : 'Hide replies';
  }));
  target.querySelectorAll('[data-reply]').forEach(button => button.addEventListener('click', () => {
    target.querySelectorAll('.reply-slot').forEach(slot => { slot.innerHTML = ''; });
    const slot = button.closest('.comment').querySelector('.reply-slot');
    slot.innerHTML = '<form class="reply-form"><textarea maxlength="2000" required placeholder="Reply to ' + escapeHtml(button.dataset.name) + '"></textarea><button class="comment-submit">Reply</button></form>';
    slot.querySelector('textarea').focus();
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const text = slot.querySelector('textarea').value.trim();
      if (!text || !currentUser) return;
      await addDoc(collection(db, 'communityPosts', postId, 'comments'), {
        userId: currentUser.uid,
        userName: currentProfile?.displayName || currentUser.displayName || 'Member',
        text,
        parentId: button.dataset.reply,
        createdAt: serverTimestamp()
      });
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
    await addDoc(collection(db, 'communityPosts', postId, 'comments'), {
      userId: currentUser.uid,
      userName: currentProfile?.displayName || currentUser.displayName || 'Member',
      text: input.value.trim(),
      parentId: null,
      createdAt: serverTimestamp()
    });
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
  if (history.state?.communityOverlay) {
    history.back();
  } else {
    params.delete('comments');
    history.replaceState({}, '', '/community.html?' + params.toString());
    closeCommentsUi();
  }
}

function renderPostTypeFields() {
  const type = $('postType').value;
  const project = type === 'behance';
  const question = type === 'question';
  $('textFields').hidden = project;
  $('projectFields').hidden = !project;
  $('postContent').required = !project;
  $('postSummary').required = project;
  $('behanceEmbed').required = project;
  document.querySelector('label[for="postContent"]').textContent = question ? 'Add helpful context' : 'Tell the community more';
  $('postContent').placeholder = question ? 'What have you tried, and what kind of answer would help?' : 'Share context, a fresh perspective, or invite feedback…';
  $('postTitle').placeholder = question ? 'Ask one clear, open question' : 'A question, insight, or project name';
  if (!project) $('featureRequest').checked = false;
}

function renderPostGate() {
  const allowed = currentUser && currentProfile?.profileComplete && currentProfile?.username;
  if (allowed) {
    $('postGate').innerHTML = '';
    $('postIdentity').innerHTML = 'Posting as <strong>@' + escapeHtml(currentProfile.username) + '</strong>';
  } else if (currentUser) {
    const action = currentProfile?.profileComplete && !currentProfile?.username ? 'Claim a unique username on' : 'Complete';
    $('postGate').innerHTML = '<p class="notice">' + action + ' your <a href="' + profileUrl(currentUser.uid, currentProfile?.username) + '">community profile</a> before publishing.</p>';
  } else {
    $('postGate').innerHTML = '<p class="notice">You need to <a href="' + loginUrl() + '">sign in</a> before publishing to the community.</p>';
  }
  if (!allowed) $('postIdentity').innerHTML = '';
  $('postFormCard').hidden = !allowed;
}

async function loadProfilePosts(uid) {
  const target = $('profilePosts');
  target.innerHTML = '<div class="post-skeleton short"></div>';
  try {
    let posts = (await getDocs(collection(db, 'communityPosts'))).docs
      .map(item => ({id:item.id, ...item.data()}))
      .filter(post => post.published !== false && post.userId === uid)
      .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    posts = await Promise.all(posts.map(async post => ({...post, meta:await getPostMeta(post)})));
    $('profilePostCount').textContent = posts.length + (posts.length === 1 ? ' post' : ' posts');
    if (!posts.length) {
      target.innerHTML = '<div class="empty-state"><span class="empty-mark">A</span><h3>No posts yet</h3><p>This member is still preparing their first idea.</p></div>';
      return;
    }
    target.innerHTML = posts.map(post => {
      const href = isProject(post) ? 'project.html?communityPost=' + encodeURIComponent(post.id) : 'community.html?post=' + encodeURIComponent(post.id);
      return [
        '<a class="profile-post-tile' + (isProject(post) ? ' project' : '') + '" href="' + href + '">',
          '<div><small>' + postLabel(post).toUpperCase() + '</small><strong>' + escapeHtml(post.title) + '</strong><p>' + escapeHtml(isProject(post) ? post.summary : plainPostText(post)) + '</p></div>',
          '<span class="tile-stats"><span>✦ ' + post.meta.score + '</span><span>◯ ' + post.meta.commentsCount + '</span></span>',
        '</a>'
      ].join('');
    }).join('');
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="notice error">Profile posts are unavailable right now.</p>';
  }
}

async function loadProfile(uid, routedProfile) {
  const target = $('profileContent');
  if (!uid) {
    target.className = '';
    target.innerHTML = routedProfile
      ? '<p class="notice error">This profile could not be found. Check the username and try again.</p>'
      : '<p class="notice">Sign in to create and view your community profile. <a href="' + loginUrl() + '">Sign in</a></p>';
    $('profilePosts').innerHTML = '';
    $('profilePostCount').textContent = '';
    return;
  }
  target.className = 'profile-skeleton';
  target.innerHTML = '';
  try {
    const profile = await getProfile(uid);
    const owner = currentUser?.uid === uid;
    const displayName = profile.displayName || (owner ? currentUser?.displayName : '') || 'Community member';
    const photo = profile.photoURL || (owner ? currentUser?.photoURL : '') || '';
    const locationLine = [profile.school, profile.city].filter(Boolean).join(' · ') || 'AIAS Basra community';
    const interests = String(profile.interests || '').split(',').map(item => item.trim()).filter(Boolean);
    document.title = (profile.username ? 'p/' + profile.username : displayName) + ' — AIAS Basra Community';
    target.className = 'profile-hero';
    target.innerHTML = [
      '<div class="profile-top">',
        avatarMarkup(displayName, photo, 'profile-avatar'),
        '<div class="profile-title"><h2>' + escapeHtml(displayName) + '</h2><span class="profile-handle">' + (profile.username ? '@' + escapeHtml(profile.username) : 'No username claimed') + '</span><p>' + escapeHtml(locationLine) + '</p></div>',
        owner ? '<button id="editProfile" class="edit-profile-button" type="button">Edit profile</button>' : '',
      '</div>',
      '<p class="profile-bio">' + escapeHtml(profile.bio || 'No bio added yet.') + '</p>',
      interests.length ? '<div class="interest-row">' + interests.map(item => '<span>' + escapeHtml(item) + '</span>').join('') + '</div>' : '',
      owner ? [
        '<form id="profileForm" class="profile-form" hidden>',
          '<div class="form-grid"><div class="form-group"><label for="profileName">Name</label><input id="profileName" required value="' + escapeHtml(displayName) + '"></div><div class="form-group"><label for="profileUsername">Unique username</label><input id="profileUsername" required minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}" value="' + escapeHtml(profile.username || '') + '" ' + (profile.username ? 'readonly' : '') + ' placeholder="your_handle"><small id="profileUsernameStatus" class="username-check ' + (profile.username ? 'valid' : '') + '">' + (profile.username ? 'Your permanent profile address is p/' + escapeHtml(profile.username) : 'Availability will be checked as you type.') + '</small></div></div>',
          '<div class="form-group"><label for="profileSchool">School / organization</label><input id="profileSchool" required value="' + escapeHtml(profile.school || '') + '"></div>',
          '<div class="form-grid"><div class="form-group"><label for="profileCity">City</label><input id="profileCity" required value="' + escapeHtml(profile.city || '') + '"></div><div class="form-group"><label for="profileInterests">Interests</label><input id="profileInterests" value="' + escapeHtml(profile.interests || '') + '" placeholder="Urbanism, interiors, sketching"></div></div>',
          '<div class="form-group"><label for="profileBio">Bio</label><textarea id="profileBio" required>' + escapeHtml(profile.bio || '') + '</textarea></div>',
          '<button class="primary-button" type="submit"><span>Save profile</span><b aria-hidden="true">→</b></button>',
        '</form>'
      ].join('') : ''
    ].join('');
    if (owner) {
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
          const username = profile.username || await claimUsername(uid, $('profileUsername').value);
          await setDoc(doc(db, 'users', uid), {
            username,
            displayName: $('profileName').value.trim(),
            school: $('profileSchool').value.trim(),
            city: $('profileCity').value.trim(),
            interests: $('profileInterests').value.trim(),
            bio: $('profileBio').value.trim(),
            profileComplete: true,
            updatedAt: serverTimestamp()
          }, {merge:true});
          profileCache.delete(uid);
          currentProfile = await getProfile(uid);
          showToast('Profile updated.');
          history.replaceState({}, '', profileUrl(uid, username));
          await loadProfile(uid);
        } catch (error) {
          showToast(error.message || 'Your profile could not be updated.');
          button.disabled = false;
        }
      });
    }
    await loadProfilePosts(uid);
  } catch (error) {
    console.error(error);
    target.className = '';
    target.innerHTML = '<p class="notice error">This profile is unavailable right now.</p>';
  }
}

document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(link.href, false);
}));

document.querySelectorAll('[data-close-comments]').forEach(button => button.addEventListener('click', closeComments));
document.addEventListener('keydown', event => {
  const tag = document.activeElement?.tagName;
  if (event.key === 'Escape' && activeCommentsPostId) closeComments();
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(tag)) {
    event.preventDefault();
    $('communitySearch').focus();
  }
});
window.addEventListener('popstate', () => handleRoute(false));

document.querySelectorAll('.filter-pill').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.sort) {
    communitySort = button.dataset.sort;
    document.querySelectorAll('[data-sort]').forEach(item => item.classList.toggle('active', item === button));
  }
  if (button.dataset.type) {
    communityType = button.dataset.type;
    document.querySelectorAll('[data-type]').forEach(item => item.classList.toggle('active', item === button));
  }
  loadPosts();
}));

let searchTimer;
$('communitySearch').addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (new URLSearchParams(location.search).get('post')) navigateTo('/community.html', true);
    else loadPosts();
  }, 180);
});

$('quickComposer').addEventListener('click', () => navigateTo(composerUrl(), false));
$('areaCreate').addEventListener('click', () => navigateTo(composerUrl(), false));
$('answerPrompt').addEventListener('click', () => {
  if (selectedPromptPostId) navigateTo('/community.html?post=' + encodeURIComponent(selectedPromptPostId) + '&comments=1', false);
});
$('postCommunity').addEventListener('input', () => validateCommunityHandle(true));

document.querySelectorAll('input[name="postTypeChoice"]').forEach(input => input.addEventListener('change', event => {
  $('postType').value = event.target.value;
  renderPostTypeFields();
}));
[
  ['postTitle', 'titleCount', 160],
  ['postContent', 'contentCount', 2000],
  ['postSummary', 'summaryCount', 360]
].forEach(([inputId, countId, limit]) => {
  $(inputId).addEventListener('input', event => { $(countId).textContent = event.target.value.length.toLocaleString() + ' / ' + limit.toLocaleString(); });
});
renderPostTypeFields();

$('postForm').addEventListener('submit', async event => {
  event.preventDefault();
  const type = $('postType').value;
  const title = $('postTitle').value.trim();
  const content = $('postContent').value.trim();
  const summary = $('postSummary').value.trim();
  $('postStatus').classList.remove('success');
  let behanceSrc = '';
  if (type !== 'behance' && !content) {
    $('postStatus').textContent = 'Write something before publishing.';
    return;
  }
  if (type === 'behance') {
    const parsed = new DOMParser().parseFromString($('behanceEmbed').value.trim(), 'text/html');
    behanceSrc = parsed.querySelector('iframe')?.getAttribute('src') || '';
    if (!/^https:\/\/(www\.)?behance\.net\/embed\/project\//i.test(behanceSrc)) {
      $('postStatus').textContent = 'Paste a valid Behance project iframe.';
      return;
    }
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const featureRequest = type === 'behance' && $('featureRequest').checked;
    const communitySlug = validateCommunityHandle(true);
    if (!communitySlug) {
      $('postStatus').textContent = 'Choose an existing community handle before publishing.';
      button.disabled = false;
      return;
    }
    const postRef = await addDoc(collection(db, 'communityPosts'), {
      type,
      title,
      summary: type === 'behance' ? summary : content.slice(0, 360),
      content: type === 'behance' ? '' : content,
      behanceSrc,
      communitySlug,
      userId: currentUser.uid,
      authorName: currentProfile.displayName || currentUser.displayName || 'Member',
      authorUsername: currentProfile.username,
      published: true,
      featureRequest,
      featureStatus: featureRequest ? 'pending' : 'none',
      featured: false,
      createdAt: serverTimestamp()
    });
    $('postForm').reset();
    $('postType').value = 'text';
    renderPostTypeFields();
    ['postTitle','postContent','postSummary'].forEach(id => $(id).dispatchEvent(new Event('input')));
    showToast('Your post is live.');
    navigateTo('/community.html?post=' + encodeURIComponent(postRef.id), false);
  } catch (error) {
    console.error(error);
    $('postStatus').textContent = error.message || 'This post could not be published.';
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
    const displayName = currentProfile.displayName || user.displayName || 'Member';
    const photo = currentProfile.photoURL || user.photoURL || '';
    $('memberAction').href = profileUrl(user.uid, currentProfile.username);
    document.querySelectorAll('[data-route="profile"]').forEach(link => { link.href = profileUrl(user.uid, currentProfile.username); });
    $('memberAction').setAttribute('aria-label', 'Open your community profile');
    $('memberAction').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(displayName) + '">' : '<span>' + escapeHtml(initials(displayName)) + '</span>';
    $('quickAvatar').innerHTML = photo ? '<img src="' + escapeHtml(photo) + '" alt="">' : escapeHtml(initials(displayName));
  } else {
    currentProfile = null;
    $('memberAction').href = loginUrl();
    $('memberAction').setAttribute('aria-label', 'Sign in');
    $('memberAction').innerHTML = '<span>?</span>';
    $('quickAvatar').textContent = 'A';
  }
  renderPostGate();
  handleRoute(false);
});
