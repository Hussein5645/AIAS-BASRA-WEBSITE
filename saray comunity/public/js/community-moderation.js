import {callFunction} from './firebase-client.js';

const COLLECTIONS = {post:'communityPosts', space:'communitySpaces'};

export function sanitizeModerationReason(value, required = true) {
  const reason = String(value || '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (required && reason.length < 3) throw new Error('Enter a moderation reason of at least 3 characters.');
  return reason;
}

function moderator(user) {
  if (!user?.uid || !user?.email) throw new Error('Sign in as an administrator.');
  return {uid:user.uid, email:user.email.trim().toLowerCase()};
}

export async function moderateCommunityContent(db, user, {action, contentType, contentId, reason}) {
  moderator(user);
  const cleanReason = sanitizeModerationReason(reason, action !== 'clear_flag');
  if (!COLLECTIONS[contentType] || !['flag', 'clear_flag', 'warn', 'archive', 'restore'].includes(action)) throw new Error('Invalid moderation action.');
  return callFunction('moderateCommunityContent', {action, contentType, contentId, reason:cleanReason});
}

export async function permanentlyDeleteCommunityContent(db, user, {contentType, contentId, reason}) {
  moderator(user);
  const cleanReason = sanitizeModerationReason(reason);
  if (!COLLECTIONS[contentType]) throw new Error('Invalid content type.');
  return callFunction('permanentlyDeleteCommunityContent', {contentType, contentId, reason:cleanReason});
}

export async function repostUnavailableSpacePost(db, user, postId) {
  if (!user?.uid) throw new Error('Sign in to repost your content.');
  return callFunction('repostUnavailableSpacePost', {postId});
}
