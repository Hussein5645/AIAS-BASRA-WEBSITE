const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
const {getStorage} = require('firebase-admin/storage');

initializeApp();

const db = getFirestore();
const SARAY_ORIGIN = 'https://space-42d87.web.app';
const CONTENT_COLLECTIONS = {post:'communityPosts', space:'communitySpaces'};
const MODERATION_ACTIONS = new Set(['flag', 'clear_flag', 'warn', 'archive', 'restore']);
const POST_TYPES = new Set(['text', 'question', 'behance']);
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

async function publicStorageImage(path) {
  if (!path) return '';
  try {
    const file = getStorage().bucket().file(String(path));
    const [metadata] = await file.getMetadata();
    const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || '').split(',')[0].trim();
    return token ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(file.bucket.name)}/o/${encodeURIComponent(file.name)}?alt=media&token=${encodeURIComponent(token)}` : '';
  } catch (error) {
    logger.warn('Share preview image metadata could not be loaded.', {path, error:error.message});
    return '';
  }
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

async function requireCompleteProfile(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists || profile.data().profileComplete !== true || !profile.data().username) {
    throw new HttpsError('failed-precondition', 'Complete your public Community profile first.');
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
  const [space, membership] = await Promise.all([spaceRef.get(), spaceRef.collection('connections').doc(uid).get()]);
  if (!space.exists || space.data().active !== true || (space.data().creatorId !== uid && !membership.exists)) {
    throw new HttpsError('permission-denied', 'You cannot publish to this space.');
  }
  if (space.data().isPrivate !== true && !canPostMain) {
    throw new HttpsError('permission-denied', 'Main-thread posting access is required for public spaces. You may post in private spaces.');
  }
  return {...space.data(), canPostMain};
}

exports.requestMainThreadPostingAccess = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to apply.');
  const ref = db.collection('users').doc(request.auth.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().profileComplete !== true) throw new HttpsError('failed-precondition', 'Complete your profile first.');
  if (snapshot.data().mainThreadPostingAccess !== false) return {ok:true, status:'approved'};
  await ref.set({mainThreadPostingAccess:false, mainThreadAccessStatus:'pending', mainThreadAccessRequestedAt:FieldValue.serverTimestamp()}, {merge:true});
  return {ok:true, status:'pending'};
});

exports.reviewMainThreadPostingAccess = onCall(async request => {
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

exports.setCommunitySpaceVisibility = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const isPrivate = request.data?.isPrivate === true;
  const showInMainThread = !isPrivate && request.data?.showInMainThread === true;
  const spaceRef = db.collection('communitySpaces').doc(spaceId);
  const spaceSnapshot = await spaceRef.get();
  if (!spaceSnapshot.exists || spaceSnapshot.data().creatorId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the space owner can change visibility.');
  if (!isPrivate) {
    const connections = await spaceRef.collection('connections').get();
    const ids = [...new Set([request.auth.uid, ...connections.docs.map(item => item.id)])];
    const profiles = await Promise.all(ids.map(id => db.collection('users').doc(id).get()));
    const blockedUserIds = profiles.filter(item => !item.exists || item.data().mainThreadPostingAccess === false).map(item => item.id);
    if (blockedUserIds.length) throw new HttpsError('failed-precondition', `This space cannot become public while ${blockedUserIds.length} member(s) lack main-thread posting access. Keep it private or remove those members.`, {blockedUserIds});
  }
  await spaceRef.set({isPrivate, showInMainThread, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
  return {ok:true, isPrivate, showInMainThread};
});

exports.createCommunityPost = onCall(async request => {
  const profile = await requireCompleteProfile(request);
  const type = String(request.data?.type || 'text');
  if (!POST_TYPES.has(type)) throw new HttpsError('invalid-argument', 'Choose a valid post type.');
  const title = cleanText(request.data?.title, 160, 'Title');
  const content = cleanText(request.data?.content, 10000, 'Content');
  const communitySlug = type === 'behance' ? 'main' : cleanText(request.data?.communitySlug, 32, 'Space handle');
  if (!/^(main|[a-z0-9-]{3,32})$/.test(communitySlug)) throw new HttpsError('invalid-argument', 'Invalid space handle.');
  await requirePostSpaceAccess(request.auth.uid, communitySlug);
  const behanceSrc = type === 'behance' ? cleanText(request.data?.behanceSrc, 1000, 'Behance embed') : '';
  if (type === 'behance' && !/^https:\/\/(www\.)?behance\.net\/embed\/project\//.test(behanceSrc)) {
    throw new HttpsError('invalid-argument', 'Use a valid Behance project embed URL.');
  }
  const mediaCount = Math.max(0, Math.min(10, Number(request.data?.mediaCount) || 0));
  const ref = db.collection('communityPosts').doc();
  await ref.create({
    type, title, content, summary:content.slice(0, 360), behanceSrc, communitySlug,
    userId:request.auth.uid,
    authorName:profile.displayName || request.auth.token?.name || 'Member',
    authorUsername:profile.username,
    published:mediaCount === 0,
    imagePaths:[], mediaCount,
    featureRequest:false, featureStatus:'none', featured:false,
    archived:false, moderationStatus:'clear', createdAt:FieldValue.serverTimestamp()
  });
  return {ok:true, postId:ref.id, published:mediaCount === 0};
});

exports.finalizeCommunityPostMedia = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this post.');
  const expected = Math.max(0, Math.min(10, Number(snapshot.data().mediaCount) || 0));
  const [files] = await getStorage().bucket().getFiles({prefix:`community/posts/${postId}/`});
  const valid = files.filter(file => !file.name.endsWith('/') && /^image\/(jpeg|png|webp)$/.test(String(file.metadata.contentType || '')) && Number(file.metadata.size || 0) <= 10 * 1024 * 1024)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (valid.length !== expected) throw new HttpsError('failed-precondition', `Expected ${expected} uploaded images, found ${valid.length}.`);
  const imagePaths = valid.map(file => file.name);
  await ref.update({imagePaths, published:true, mediaFinalizedAt:FieldValue.serverTimestamp()});
  return {ok:true, imagePaths};
});

exports.deleteOwnCommunityPost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const postId = cleanId(request.data?.postId, 'post');
  const ref = db.collection('communityPosts').doc(postId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You do not own this post.');
  await Promise.all([
    db.recursiveDelete(ref),
    getStorage().bucket().deleteFiles({prefix:`community/posts/${postId}/`, force:true}).catch(error => logger.warn('Post media cleanup failed', {postId, error:error.message}))
  ]);
  return {ok:true};
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
  const [spaceSnapshot, adminSnapshot] = await Promise.all([
    spaceRef.get(), spaceRef.collection('admins').doc(uid).get()
  ]);
  if (!spaceSnapshot.exists) throw new HttpsError('not-found', 'This space is unavailable.');
  const space = spaceSnapshot.data();
  if (space.creatorId !== uid && !adminSnapshot.exists) {
    throw new HttpsError('permission-denied', 'Space management permission is required.');
  }
  return {spaceRef, space, owner:space.creatorId === uid};
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

async function runCommunityCompatibilityOperation(request) {
  const operation = String(request.data?.operation || '');
  if (!operation) return null;
  if (operation === 'request_main_thread_access') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to apply.');
    const ref = db.collection('users').doc(request.auth.uid);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().profileComplete !== true) throw new HttpsError('failed-precondition', 'Complete your profile first.');
    if (snapshot.data().mainThreadPostingAccess !== false) return {ok:true, status:'approved'};
    await ref.set({mainThreadPostingAccess:false, mainThreadAccessStatus:'pending', mainThreadAccessRequestedAt:FieldValue.serverTimestamp()}, {merge:true});
    return {ok:true, status:'pending'};
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
    const showInMainThread = !isPrivate && request.data?.showInMainThread === true;
    const spaceRef = db.collection('communitySpaces').doc(spaceId);
    const spaceSnapshot = await spaceRef.get();
    if (!spaceSnapshot.exists || spaceSnapshot.data().creatorId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the space owner can change visibility.');
    if (!isPrivate) {
      const connections = await spaceRef.collection('connections').get();
      const ids = [...new Set([request.auth.uid, ...connections.docs.map(item => item.id)])];
      const profiles = await Promise.all(ids.map(id => db.collection('users').doc(id).get()));
      const blockedUserIds = profiles.filter(item => !item.exists || item.data().mainThreadPostingAccess === false).map(item => item.id);
      if (blockedUserIds.length) throw new HttpsError('failed-precondition', `This space cannot become public while ${blockedUserIds.length} member(s) lack main-thread posting access. Keep it private or remove those members.`, {blockedUserIds});
    }
    await spaceRef.set({isPrivate, showInMainThread, updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    return {ok:true, isPrivate, showInMainThread};
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

exports.setCommunitySpaceConnection = onCall(async request => {
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
    if (space.creatorId === userId) return {ok:true, status:'owner'};
    if (space.isPrivate === true) {
      const membership = await memberRef.get();
      if (membership.exists) return {ok:true, status:'connected'};
      await requestRef.set({userId, spaceSlug:spaceId, status:'pending', requestedAt:FieldValue.serverTimestamp()});
      return {ok:true, status:'requested'};
    }
    const record = {userId, spaceSlug:spaceId, createdAt:FieldValue.serverTimestamp()};
    const batch = db.batch();
    batch.set(memberRef, record);
    batch.set(userSpaceRef, record);
    await batch.commit();
    return {ok:true, status:'connected'};
  }

  const deletedPosts = await deleteUserPostsInSpace(userId, spaceId);
  const batch = db.batch();
  batch.delete(memberRef);
  batch.delete(userSpaceRef);
  batch.delete(requestRef);
  await batch.commit();
  return {ok:true, status:'disconnected', deletedPosts};
});

exports.removeCommunitySpaceMember = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage spaces.');
  const spaceId = cleanId(request.data?.spaceId, 'space');
  const userId = cleanId(request.data?.userId, 'user');
  const {spaceRef, space} = await requireSpaceManager(request.auth.uid, spaceId);
  if (userId === space.creatorId) throw new HttpsError('failed-precondition', 'The space owner cannot be removed.');
  const deletedPosts = await deleteUserPostsInSpace(userId, spaceId);
  const batch = db.batch();
  batch.delete(spaceRef.collection('connections').doc(userId));
  batch.delete(db.collection('users').doc(userId).collection('connectedSpaces').doc(spaceId));
  batch.set(spaceRef.collection('connectionRequests').doc(userId), {
    userId, spaceSlug:spaceId, status:'removed', reviewedAt:FieldValue.serverTimestamp(), reviewedBy:request.auth.uid
  }, {merge:true});
  await batch.commit();
  await notifySpaceModeration({recipientId:userId, actorId:request.auth.uid, spaceId, type:'space_member_removed', reason:'Access removed by a space administrator.', title:space.name});
  return {ok:true, deletedPosts};
});

exports.setCommunitySpaceAdmin = onCall(async request => {
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
  if (enabled) await adminRef.set({userId, addedBy:request.auth.uid, createdAt:FieldValue.serverTimestamp()});
  else await adminRef.delete();
  return {ok:true, enabled};
});

// Callable endpoints must accept browser preflight publicly; authorization is enforced below.
exports.moderateCommunitySpacePost = onCall({invoker:'public'}, async request => {
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

exports.warnCommunitySpaceMember = onCall({invoker:'public'}, async request => {
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

async function requireCommunityAdmin(request) {
  if (!request.auth?.uid || !request.auth.token?.email) throw new HttpsError('unauthenticated', 'Sign in as an administrator.');
  const email = String(request.auth.token.email).trim().toLowerCase();
  const [adminsDoc, rolesDoc, assignmentsDoc] = await Promise.all([
    db.doc('config/admins').get(), db.doc('config/roles').get(), db.doc('config/userRoles').get()
  ]);
  const legacy = Array.isArray(adminsDoc.data()?.admins) && adminsDoc.data().admins.map(item => String(item).toLowerCase()).includes(email);
  const assignments = assignmentsDoc.data()?.assignments || {};
  const roleId = assignments[email];
  const permissions = rolesDoc.data()?.roles?.[roleId]?.permissions || [];
  if (!legacy && roleId !== 'super_admin' && !permissions.includes('*') && !permissions.includes('manage_community')) {
    throw new HttpsError('permission-denied', 'Community management permission is required.');
  }
  return {uid:request.auth.uid, email};
}

exports.backfillCommunitySchema = onCall(async request => {
  await requireCommunityAdmin(request);
  const specifications = [
    ['communityPosts', {archived:false, moderationStatus:'clear', published:true, featured:false, featureRequest:false, featureStatus:'none'}],
    ['communitySpaces', {archived:false, moderationStatus:'clear', active:true, isPrivate:false, showInMainThread:true}]
  ];
  const results = {};
  for (const [collectionName, defaults] of specifications) {
    const snapshot = await db.collection(collectionName).get();
    let updated = 0;
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = db.batch();
      let writes = 0;
      snapshot.docs.slice(offset, offset + 400).forEach(item => {
        const data = item.data();
        const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in data)));
        if (Object.keys(missing).length) { batch.update(item.ref, missing); updated += 1; writes += 1; }
      });
      if (writes) await batch.commit();
    }
    results[collectionName] = {documents:snapshot.size, updated};
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
  return {cascadeId, restoredPostCount:cascadePosts.length};
}

exports.moderateCommunityContent = onCall(async request => {
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

exports.permanentlyDeleteCommunityContent = onCall(async request => {
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

exports.repostUnavailableSpacePost = onCall(async request => {
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

exports.communityShare = onRequest(async (request, response) => {
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
          description = shareText(post.summary || post.content) || `A post shared by ${shareText(post.authorName, 70) || 'a community member'}.`;
          image = await publicStorageImage(Array.isArray(post.imagePaths) ? post.imagePaths[0] : '');
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
  if (['space_connection', 'space_request', 'space_member_warned', 'space_member_removed'].includes(notification.type)) return SARAY_ORIGIN + '/a/' + encodeURIComponent(notification.detailId || '');
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
    reply:'replied to your comment',
    applause:'applauded your post',
    space_post_warned:'warned your space post',
    space_post_deleted:'deleted your space post',
    space_member_warned:'sent you a space warning',
    space_member_removed:'removed you from a space',
    main_thread_access_granted:'approved your main-thread posting access',
    main_thread_access_denied:'did not approve your main-thread posting access'
  }[notification.type] || 'commented on your post';
  return actor + ' ' + action + (notification.postTitle ? ' · ' + notification.postTitle : '');
}

exports.sendCommunityPush = onDocumentCreated('users/{userId}/notifications/{notificationId}', async event => {
  const notification = event.data?.data();
  const userId = event.params.userId;
  if (!notification || notification.recipientId !== userId) return;

  const tokenSnapshot = await getFirestore().collection('users').doc(userId).collection('fcmTokens').get();
  const tokenDocs = tokenSnapshot.docs.filter(item => typeof item.data().token === 'string' && item.data().token);
  const fidDocs = tokenSnapshot.docs.filter(item => typeof item.data().fid === 'string' && item.data().fid);
  if (!tokenDocs.length && !fidDocs.length) return;

  const body = notificationBody(notification);
  const response = await getMessaging().sendEachForMulticast({
    ...(tokenDocs.length ? {tokens:tokenDocs.map(item => item.data().token)} : {}),
    ...(fidDocs.length ? {fids:fidDocs.map(item => item.data().fid)} : {}),
    data:{
      notificationId:event.params.notificationId,
      title:'AIAS Basra Community',
      body,
      url:destinationFor(notification),
      recipientId:userId,
      type:String(notification.type || ''),
      postId:String(notification.postId || ''),
      detailId:String(notification.detailId || ''),
      actorId:String(notification.actorId || '')
    },
    notification:{title:'AIAS Basra Community', body},
    android:{
      priority:'high', ttl:86400000,
      notification:{channelId:'community_activity', icon:'ic_community_notification', color:'#661F22', sound:'default'}
    },
    webpush:{headers:{TTL:'86400'}}
  });

  const targetDocs = tokenDocs.concat(fidDocs);
  const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/installation-id-not-registered']);
  const removals = response.responses.map((result, index) => result.success || !invalidCodes.has(result.error?.code) ? null : targetDocs[index].ref.delete()).filter(Boolean);
  if (removals.length) await Promise.all(removals);
  logger.info('Community push processed.', {userId, sent:response.successCount, failed:response.failureCount});
});
