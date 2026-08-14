const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
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

exports.syncCommunityPublicProfile = onDocumentWritten('users/{userId}', async event => {
  const userId = event.params.userId;
  const after = event.data?.after;
  const target = db.collection('publicProfiles').doc(userId);
  if (!after?.exists) return target.delete().catch(() => {});
  return target.set(publicProfileFields(after.data()), {merge:false});
});

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

exports.createCommunityPost = onCall(async request => {
  const profile = await requireCompleteProfile(request);
  const type = String(request.data?.type || 'text');
  if (!POST_TYPES.has(type)) throw new HttpsError('invalid-argument', 'Choose a valid post type.');
  const title = cleanText(request.data?.title, 160, 'Title');
  const content = cleanText(request.data?.content, 10000, 'Content');
  const communitySlug = type === 'behance' ? 'main' : cleanText(request.data?.communitySlug, 32, 'Space handle');
  if (!/^(main|[a-z0-9-]{3,32})$/.test(communitySlug)) throw new HttpsError('invalid-argument', 'Invalid space handle.');
  const spaceAccess = await requirePostSpaceAccess(request.auth.uid, communitySlug);
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
    visibility:postVisibilityForSpace(communitySlug, spaceAccess),
    imagePaths:[], mediaCount,
    score:0, upvoteCount:0, downvoteCount:0, commentsCount:0,
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

exports.setCommunityPostVote = onCall(async request => {
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
    const actor = await db.collection('users').doc(request.auth.uid).get();
    const profile = actor.data() || {};
    await db.collection('users').doc(post.userId).collection('notifications').doc(`applause_${postId}_${request.auth.uid}`).set({
      recipientId:post.userId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 100),
      actorUsername:String(profile.username || '').slice(0, 24), type:'applause', postId, postTitle:String(post.title || '').slice(0, 160),
      detailId:'', read:false, createdAt:FieldValue.serverTimestamp()
    });
  } else if (post.userId && post.userId !== request.auth.uid) {
    await db.collection('users').doc(post.userId).collection('notifications').doc(`applause_${postId}_${request.auth.uid}`).delete().catch(() => {});
  }
  return {ok:true, ...result};
});

exports.createCommunityComment = onCall(async request => {
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
    await db.collection('users').doc(recipientId).collection('notifications').doc(`${parentId ? 'reply' : 'comment'}_${postId}_${commentRef.id}`).set({
      recipientId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 100),
      actorUsername:String(profile.username || '').slice(0, 24), type:parentId ? 'reply' : 'comment', postId,
      postTitle:String(post.title || '').slice(0, 160), detailId:parentId || commentRef.id, sourceId:commentRef.id,
      read:false, createdAt:FieldValue.serverTimestamp()
    });
  }
  return {ok:true, commentId:commentRef.id};
});

exports.updateCommunityComment = onCall(async request => {
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

exports.deleteCommunityComment = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete comments.');
  const postId = cleanId(request.data?.postId, 'post');
  const commentId = cleanId(request.data?.commentId, 'comment');
  const {postRef, post} = await requireReadablePost(request.auth.uid, postId);
  const commentRef = postRef.collection('comments').doc(commentId);
  const comment = await commentRef.get();
  if (!comment.exists) return {ok:true};
  if (comment.data().userId !== request.auth.uid && post.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You cannot delete this comment.');
  const batch = db.batch();
  batch.delete(commentRef);
  batch.update(postRef, {commentsCount:FieldValue.increment(-1), lastActivityAt:FieldValue.serverTimestamp()});
  await batch.commit();
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
  const [spaceSnapshot, memberSnapshot, adminSnapshot, blockSnapshot, chatBanSnapshot] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection('connections').doc(uid).get(),
    spaceRef.collection('admins').doc(uid).get(),
    spaceRef.collection('blocks').doc(uid).get(),
    spaceRef.collection('chatBans').doc(uid).get()
  ]);
  if (!spaceSnapshot.exists || spaceSnapshot.data().active !== true || spaceSnapshot.data().archived === true) throw new HttpsError('not-found', 'This space is unavailable.');
  if (blockSnapshot.exists) throw new HttpsError('permission-denied', 'This space is not available to your account.');
  if (chatBanSnapshot.exists) throw new HttpsError('permission-denied', 'Your Messages access has been removed by a space administrator.');
  const space = spaceSnapshot.data();
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
    await Promise.all([...recipients].map(recipientId => db.collection('users').doc(recipientId).collection('notifications').doc(`space_message_${messageRef.id}`).set({
      recipientId, actorId:request.auth.uid, actorName:String(profile.displayName || profile.username || 'Community member').slice(0, 80), actorUsername:String(profile.username || ''),
      type:'space_message', postId:sharedPostId, postTitle:text.slice(0, 120) || (imagePath ? 'Sent a photo' : audioPath ? 'Sent a voice message' : 'Shared a post'), detailId:spaceId,
      read:false, createdAt:FieldValue.serverTimestamp()
    })));
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
  const allowed = /^(view|manage)_(community|events|articles|library|models3d|fbd)$/;
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

exports.getCommunityAdminAccess = onCall(async request => {
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

exports.manageCommunityRoleConfiguration = onCall(async request => {
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

exports.backfillCommunitySchema = onCall(async request => {
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
