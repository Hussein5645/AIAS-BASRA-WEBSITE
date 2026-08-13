// Main-site moderation client. This file is intentionally self-contained so the
// admin dashboard does not depend on assets from the separately hosted Community app.
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const COLLECTIONS = {post:'communityPosts', space:'communitySpaces'};
const MAX_BATCH_WRITES = 400;

function sanitizeReason(value, required = true) {
  const reason = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (required && reason.length < 3) throw new Error('Enter a moderation reason of at least 3 characters.');
  return reason;
}

function moderator(user) {
  if (!user?.uid || !user?.email) throw new Error('Sign in as an administrator.');
  return {uid:user.uid, email:user.email.trim().toLowerCase()};
}

function auditData(actor, action, contentType, contentId, reason, cascadeId = null, details = {}) {
  return {moderatorId:actor.uid, moderatorEmail:actor.email, action, contentType, contentId, reason, cascadeId, details, createdAt:serverTimestamp()};
}

function notificationData(ownerId, actor, type, contentType, contentId, title, reason, eligibleToRepost = false) {
  return {recipientId:ownerId, actorId:actor.uid, actorName:'AIAS Basra moderation', actorUsername:'aias-basra', type, moderationAction:type, contentType, postId:contentType === 'post' ? contentId : '', detailId:contentType === 'space' ? contentId : '', postTitle:String(title || '').slice(0, 160), reason, eligibleToRepost, read:false, createdAt:serverTimestamp()};
}

async function commitChunks(db, operations) {
  for (let offset = 0; offset < operations.length; offset += MAX_BATCH_WRITES) {
    const batch = writeBatch(db);
    operations.slice(offset, offset + MAX_BATCH_WRITES).forEach(operation => operation(batch));
    await batch.commit();
  }
}

function notifyOperation(db, actor, content, contentType, contentId, type, reason, eligible = false) {
  const ownerId = content.userId || content.creatorId;
  if (!ownerId) return null;
  const ref = doc(collection(db, 'users', ownerId, 'notifications'));
  return batch => batch.set(ref, notificationData(ownerId, actor, type, contentType, contentId, content.title || content.name, reason, eligible));
}

async function archiveSpace(db, actor, spaceRef, spaceId, space, reason) {
  if (space.archived === true) throw new Error('This space is already archived.');
  const cascadeId = `space_${spaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const posts = (await getDocs(query(collection(db, 'communityPosts'), where('communitySlug', '==', spaceId))))
    .docs.filter(item => item.data()?.archived !== true);
  const operations = [
    batch => batch.update(spaceRef, {active:false, archived:true, archiveReason:reason, archiveCause:'moderation', archiveCascadeId:cascadeId, archivedAt:serverTimestamp(), archivedBy:actor.email}),
    batch => batch.set(doc(collection(db, 'communityModerationAudit')), auditData(actor, 'archive', 'space', spaceId, reason, cascadeId, {cascadedPostCount:posts.length}))
  ];
  const spaceNotice = notifyOperation(db, actor, space, 'space', spaceId, 'moderation_archived', reason);
  if (spaceNotice) operations.push(spaceNotice);
  posts.forEach(postDoc => {
    const post = postDoc.data();
    operations.push(batch => batch.update(postDoc.ref, {archived:true, moderationStatus:post.moderationStatus || 'clear', archiveReason:reason, archiveCause:'space_cascade', archiveCascadeId:cascadeId, archivedAt:serverTimestamp(), archivedBy:actor.email}));
    operations.push(batch => batch.set(doc(collection(db, 'communityModerationAudit')), auditData(actor, 'archive', 'post', postDoc.id, reason, cascadeId, {sourceSpaceId:spaceId})));
    const notice = notifyOperation(db, actor, post, 'post', postDoc.id, 'moderation_archived', reason, post.moderationStatus !== 'flagged');
    if (notice) operations.push(notice);
  });
  await commitChunks(db, operations);
  return {ok:true, cascadeId, cascadedPostCount:posts.length};
}

async function restoreSpace(db, actor, spaceRef, spaceId, space, reason) {
  if (space.archived !== true) throw new Error('This space is not archived.');
  const cascadeId = space.archiveCascadeId || '';
  const posts = cascadeId
    ? (await getDocs(query(collection(db, 'communityPosts'), where('archiveCascadeId', '==', cascadeId))))
      .docs.filter(item => {
        const post = item.data();
        return post?.archived === true && post?.archiveCause === 'space_cascade' && post?.archiveCascadeId === cascadeId;
      })
    : [];
  const operations = [
    batch => batch.update(spaceRef, {active:true, archived:false, archiveReason:null, archiveCause:null, archiveCascadeId:null, archivedAt:null, archivedBy:null, restoredAt:serverTimestamp(), restoredBy:actor.email, restoreReason:reason}),
    batch => batch.set(doc(collection(db, 'communityModerationAudit')), auditData(actor, 'restore', 'space', spaceId, reason, cascadeId, {restoredPostCount:posts.length}))
  ];
  const spaceNotice = notifyOperation(db, actor, space, 'space', spaceId, 'moderation_restored', reason);
  if (spaceNotice) operations.push(spaceNotice);
  posts.forEach(postDoc => {
    const post = postDoc.data();
    operations.push(batch => batch.update(postDoc.ref, {archived:false, archiveReason:null, archiveCause:null, archiveCascadeId:null, archivedAt:null, archivedBy:null, restoredAt:serverTimestamp(), restoredBy:actor.email, restoreReason:reason}));
    operations.push(batch => batch.set(doc(collection(db, 'communityModerationAudit')), auditData(actor, 'restore', 'post', postDoc.id, reason, cascadeId, {sourceSpaceId:spaceId})));
    const notice = notifyOperation(db, actor, post, 'post', postDoc.id, 'moderation_restored', reason);
    if (notice) operations.push(notice);
  });
  await commitChunks(db, operations);
  return {ok:true, cascadeId, restoredPostCount:posts.length};
}

export async function moderateCommunityContent(db, user, {action, contentType, contentId, reason}) {
  const actor = moderator(user);
  const cleanReason = sanitizeReason(reason, action !== 'clear_flag');
  const collectionName = COLLECTIONS[contentType];
  if (!collectionName || !['flag', 'clear_flag', 'warn', 'archive', 'restore'].includes(action)) throw new Error('Invalid moderation action.');
  const contentRef = doc(db, collectionName, contentId);
  const snapshot = await getDoc(contentRef);
  if (!snapshot.exists()) throw new Error('The requested content no longer exists.');
  const content = snapshot.data();
  if (contentType === 'space' && action === 'archive') return archiveSpace(db, actor, contentRef, contentId, content, cleanReason);
  if (contentType === 'space' && action === 'restore') return restoreSpace(db, actor, contentRef, contentId, content, cleanReason);
  if (action === 'archive' && content.archived === true) throw new Error('This content is already archived.');
  if (action === 'restore' && content.archived !== true) throw new Error('This content is not archived.');

  const fields = {moderationUpdatedAt:serverTimestamp(), moderationUpdatedBy:actor.email};
  if (action === 'flag') Object.assign(fields, {moderationStatus:'flagged', moderationReason:cleanReason, flaggedAt:serverTimestamp(), flaggedBy:actor.email});
  if (action === 'clear_flag') Object.assign(fields, {moderationStatus:'clear', moderationReason:cleanReason, flagClearedAt:serverTimestamp(), flagClearedBy:actor.email});
  if (action === 'warn') Object.assign(fields, {warningReason:cleanReason, warnedAt:serverTimestamp(), warnedBy:actor.email});
  if (action === 'archive') Object.assign(fields, {archived:true, archiveReason:cleanReason, archiveCause:'moderation', archiveCascadeId:null, archivedAt:serverTimestamp(), archivedBy:actor.email});
  if (action === 'restore') Object.assign(fields, {archived:false, archiveReason:null, archiveCause:null, archiveCascadeId:null, archivedAt:null, archivedBy:null, restoredAt:serverTimestamp(), restoredBy:actor.email, restoreReason:cleanReason});
  const type = {flag:'moderation_flagged', clear_flag:'moderation_cleared', warn:'moderation_warned', archive:'moderation_archived', restore:'moderation_restored'}[action];
  const operations = [
    batch => batch.update(contentRef, fields),
    batch => batch.set(doc(collection(db, 'communityModerationAudit')), auditData(actor, action, contentType, contentId, cleanReason))
  ];
  const notification = notifyOperation(db, actor, content, contentType, contentId, type, cleanReason);
  if (notification) operations.push(notification);
  await commitChunks(db, operations);
  return {ok:true};
}
