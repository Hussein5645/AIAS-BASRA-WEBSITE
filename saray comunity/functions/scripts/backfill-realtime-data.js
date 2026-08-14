'use strict';

const {applicationDefault, initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');

initializeApp({credential:applicationDefault(), projectId:process.env.GCLOUD_PROJECT || 'space-42d87', storageBucket:process.env.FIREBASE_STORAGE_BUCKET || 'space-42d87.firebasestorage.app'});
const db = getFirestore();

function stageAccess(batch, spaceRef, space, userId, state) {
  const manager = state.manager === true, member = state.member === true, blocked = state.blocked === true, chatBanned = state.chatBanned === true;
  const chatApproved = manager || state.chatApproved === true;
  const active = space.active === true && space.archived !== true;
  const ref = spaceRef.collection('access').doc(userId);
  if (!manager && !member && !blocked && !chatBanned) return batch.delete(ref);
  batch.set(ref, {
    userId, spaceId:spaceRef.id, manager, member, blocked, chatBanned, chatApproved,
    canReadPosts:active && !blocked && (space.isPrivate !== true || manager || member),
    canUseChat:active && space.chatEnabled === true && !blocked && !chatBanned && (manager || (member && chatApproved)),
    updatedAt:FieldValue.serverTimestamp()
  });
}

async function revokeTokens(prefix) {
  const [files] = await getStorage().bucket().getFiles({prefix});
  for (let offset = 0; offset < files.length; offset += 50) {
    await Promise.all(files.slice(offset, offset + 50).filter(file => !file.name.endsWith('/')).map(async file => {
      const [metadata] = await file.getMetadata();
      await file.setMetadata({metadata:{...(metadata.metadata || {}), firebaseStorageDownloadTokens:''}});
    }));
  }
  return files.filter(file => !file.name.endsWith('/')).length;
}

function publicProfile(profile = {}) {
  return {
    username:String(profile.username || '').slice(0, 24), displayName:String(profile.displayName || 'Community member').slice(0, 100),
    school:String(profile.school || '').slice(0, 160), city:String(profile.city || '').slice(0, 120),
    bio:String(profile.bio || '').slice(0, 1000), interests:String(profile.interests || '').slice(0, 500),
    photoURL:String(profile.photoURL || '').slice(0, 2000), bannerURL:String(profile.bannerURL || '').slice(0, 2000),
    profileComplete:profile.profileComplete === true, verified:profile.verified === true,
    updatedAt:FieldValue.serverTimestamp()
  };
}

async function run() {
  const [spacesSnapshot, postsSnapshot, usersSnapshot] = await Promise.all([
    db.collection('communitySpaces').get(), db.collection('communityPosts').get(), db.collection('users').get()
  ]);
  const spaces = new Map(spacesSnapshot.docs.map(item => [item.id, item.data()]));
  let accessCount = 0, protectedChatFiles = 0, protectedPrivateFiles = 0;
  for (const spaceDoc of spacesSnapshot.docs) {
    const space = {active:true, archived:false, isPrivate:false, ...spaceDoc.data()};
    const [members, admins, blocks, chatBans, existing] = await Promise.all([
      spaceDoc.ref.collection('connections').get(), spaceDoc.ref.collection('admins').get(),
      spaceDoc.ref.collection('blocks').get(), spaceDoc.ref.collection('chatBans').get(), spaceDoc.ref.collection('access').get()
    ]);
    const memberMap = new Map(members.docs.map(item => [item.id, item.data()]));
    const adminIds = new Set(admins.docs.map(item => item.id));
    const blockedIds = new Set(blocks.docs.map(item => item.id));
    const bannedIds = new Set(chatBans.docs.map(item => item.id));
    const ids = new Set([space.creatorId, ...memberMap.keys(), ...adminIds, ...blockedIds, ...bannedIds, ...existing.docs.map(item => item.id)].filter(Boolean));
    for (const group of [...ids].reduce((rows, id, index) => { const groupIndex = Math.floor(index / 400); (rows[groupIndex] ||= []).push(id); return rows; }, [])) {
      const batch = db.batch();
      group.forEach(userId => stageAccess(batch, spaceDoc.ref, space, userId, {
        manager:space.creatorId === userId || adminIds.has(userId), member:space.creatorId === userId || memberMap.has(userId),
        blocked:blockedIds.has(userId), chatBanned:bannedIds.has(userId),
        chatApproved:space.creatorId === userId || adminIds.has(userId) || (memberMap.has(userId) && memberMap.get(userId).chatAccessApproved !== false)
      }));
      await batch.commit();
    }
    accessCount += ids.size;
    protectedChatFiles += await revokeTokens(`community/space-messages/${spaceDoc.id}/`);
  }
  let postCount = 0;
  for (const postDoc of postsSnapshot.docs) {
    const post = postDoc.data();
    const [votes, comments] = await Promise.all([postDoc.ref.collection('votes').get(), postDoc.ref.collection('comments').get()]);
    const values = votes.docs.map(item => Number(item.data().value || 0));
    const space = spaces.get(String(post.communitySlug || 'main')) || {};
    const visibility = post.communitySlug !== 'main' && space.isPrivate === true ? 'private' : 'public';
    if (visibility === 'private') protectedPrivateFiles += await revokeTokens(`community/posts/${postDoc.id}/`);
    await postDoc.ref.set({
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
    postCount += 1;
  }
  for (let offset = 0; offset < usersSnapshot.docs.length; offset += 400) {
    const batch = db.batch();
    usersSnapshot.docs.slice(offset, offset + 400).forEach(item => batch.set(db.collection('publicProfiles').doc(item.id), publicProfile(item.data())));
    await batch.commit();
  }
  console.log(`Realtime data backfill complete: ${postCount} posts, ${usersSnapshot.size} public profiles, ${accessCount} access grants, ${protectedChatFiles} chat files, and ${protectedPrivateFiles} private post files.`);
}

module.exports = {run};
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
