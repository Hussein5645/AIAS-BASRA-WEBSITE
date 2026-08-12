const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const CONTENT_COLLECTIONS = {post:'communityPosts', space:'communitySpaces'};
const MODERATION_ACTIONS = new Set(['flag', 'clear_flag', 'warn', 'archive', 'restore']);

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
  return {ok:true, restorable:false};
});

exports.repostUnavailableSpacePost = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to repost your content.');
  const postId = cleanId(request.data?.postId, 'post');
  const sourceRef = db.collection('communityPosts').doc(postId);
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'The archived post no longer exists.');
    const post = snapshot.data();
    if (post.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only repost your own archived posts.');
    if (post.archived !== true || post.archiveCause !== 'space_cascade') throw new HttpsError('failed-precondition', 'This post is not eligible for reposting.');
    if (post.moderationStatus === 'flagged') throw new HttpsError('failed-precondition', 'Flagged content cannot be reposted until an administrator clears it.');
    if (post.repostedPostId) throw new HttpsError('already-exists', 'This archived post has already been reposted.');
    const newRef = db.collection('communityPosts').doc();
    const copy = {...post};
    ['archived', 'archiveReason', 'archiveCause', 'archiveCascadeId', 'archivedAt', 'archivedBy', 'moderationStatus', 'moderationReason', 'moderationUpdatedAt', 'moderationUpdatedBy', 'flaggedAt', 'flaggedBy', 'repostedPostId', 'repostedAt'].forEach(key => delete copy[key]);
    Object.assign(copy, {communitySlug:'main', published:true, featured:false, featureRequest:false, featureStatus:'none', repostedFromPostId:postId, repostedFromUnavailableSpace:post.communitySlug || '', createdAt:FieldValue.serverTimestamp()});
    transaction.create(newRef, copy);
    transaction.update(sourceRef, {repostedPostId:newRef.id, repostedAt:FieldValue.serverTimestamp()});
    return {postId:newRef.id};
  });
  return {ok:true, ...result};
});

function destinationFor(notification) {
  if (String(notification.type || '').startsWith('moderation_')) {
    if (notification.eligibleToRepost) return '/community-archived.html';
    return notification.contentType === 'space' ? '/community.html' : '/community.html?post=' + encodeURIComponent(notification.postId || '');
  }
  if (notification.type === 'connection') return '/community.html?view=profile&user=' + encodeURIComponent(notification.actorId || '');
  if (notification.type === 'space_connection' || notification.type === 'space_request') return '/a/' + encodeURIComponent(notification.detailId || '');
  return '/community.html?post=' + encodeURIComponent(notification.postId || '') + '&comments=1';
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
    applause:'applauded your post'
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

  const response = await getMessaging().sendEachForMulticast({
    ...(tokenDocs.length ? {tokens:tokenDocs.map(item => item.data().token)} : {}),
    ...(fidDocs.length ? {fids:fidDocs.map(item => item.data().fid)} : {}),
    data:{
      notificationId:event.params.notificationId,
      title:'AIAS Basra Community',
      body:notificationBody(notification),
      url:destinationFor(notification),
      recipientId:userId,
      type:String(notification.type || ''),
      postId:String(notification.postId || ''),
      detailId:String(notification.detailId || ''),
      actorId:String(notification.actorId || '')
    },
    android:{priority:'high', ttl:86400000},
    webpush:{headers:{TTL:'86400'}}
  });

  const targetDocs = tokenDocs.concat(fidDocs);
  const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/installation-id-not-registered']);
  const removals = response.responses.map((result, index) => result.success || !invalidCodes.has(result.error?.code) ? null : targetDocs[index].ref.delete()).filter(Boolean);
  if (removals.length) await Promise.all(removals);
  logger.info('Community push processed.', {userId, sent:response.successCount, failed:response.failureCount});
});
