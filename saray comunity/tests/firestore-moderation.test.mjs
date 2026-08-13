import {after, before, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where, writeBatch} from 'firebase/firestore';

let environment;
const projectId = 'space-42d87-moderation-tests';
const activePost = {userId:'owner', type:'text', title:'Active', summary:'Active', content:'Active post', behanceSrc:'', communitySlug:'main', authorName:'Owner', authorUsername:'owner', published:true, featured:false, featureRequest:false, featureStatus:'none', archived:false, moderationStatus:'clear', imageChunkCount:0, imageMimeType:'', imageChunkCounts:[], imageMimeTypes:[]};

before(async () => {
  environment = await initializeTestEnvironment({projectId, firestore:{rules:await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host:'127.0.0.1', port:8085}});
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'config', 'admins'), {admins:['moderator@example.com']});
    await setDoc(doc(db, 'config', 'roles'), {roles:{}});
    await setDoc(doc(db, 'config', 'userRoles'), {assignments:{}});
    await setDoc(doc(db, 'users', 'owner'), {email:'owner@example.com', username:'owner', profileComplete:true});
    await setDoc(doc(db, 'usernames', 'owner'), {userId:'owner'});
    await setDoc(doc(db, 'communityPosts', 'active'), activePost);
    await setDoc(doc(db, 'communityPosts', 'eligible'), {...activePost, title:'Eligible', archived:true, archiveCause:'space_cascade', moderationStatus:'clear'});
    await setDoc(doc(db, 'communityPosts', 'flagged'), {...activePost, title:'Flagged', archived:true, archiveCause:'space_cascade', moderationStatus:'flagged'});
  });
});
after(async () => environment?.cleanup());

test('public users can read active content but not archived originals', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'communityPosts', 'active')));
  await assertFails(getDoc(doc(db, 'communityPosts', 'eligible')));
});

test('active-content queries satisfy archived-content rules', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(collection(db, 'communityPosts'), where('archived', '==', false))));
});

test('owners can read eligible cascade archives but not moderation-flagged archives', async () => {
  const db = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertSucceeds(getDoc(doc(db, 'communityPosts', 'eligible')));
  await assertFails(getDoc(doc(db, 'communityPosts', 'flagged')));
});

test('only community moderators can change moderation state and append audit history', async () => {
  const ownerDb = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertFails(setDoc(doc(ownerDb, 'communityPosts', 'active'), {archived:true, archiveCause:'moderation'}, {merge:true}));
  await assertFails(setDoc(doc(ownerDb, 'communityModerationAudit', 'bad'), {moderatorId:'owner', moderatorEmail:'owner@example.com', action:'archive', contentType:'post', contentId:'active', reason:'bad', createdAt:serverTimestamp()}));

  const adminDb = environment.authenticatedContext('moderator', {email:'moderator@example.com'}).firestore();
  await assertSucceeds(setDoc(doc(adminDb, 'communityPosts', 'active'), {archived:true, archiveCause:'moderation', archiveReason:'Policy review'}, {merge:true}));
  await assertSucceeds(setDoc(doc(adminDb, 'communityModerationAudit', 'good'), {moderatorId:'moderator', moderatorEmail:'moderator@example.com', action:'archive', contentType:'post', contentId:'active', reason:'Policy review', cascadeId:null, details:{}, createdAt:serverTimestamp()}));
});

test('permanent deletion is denied to clients and reserved for the backend', async () => {
  const adminDb = environment.authenticatedContext('moderator', {email:'moderator@example.com'}).firestore();
  await assertFails(deleteDoc(doc(adminDb, 'communityPosts', 'eligible')));
  const batch = writeBatch(adminDb);
  batch.set(doc(adminDb, 'communityModerationTombstones', 'post', 'items', 'eligible'), {contentType:'post', contentId:'eligible', ownerId:'owner', moderatorId:'moderator', moderatorEmail:'moderator@example.com', reason:'Confirmed permanent deletion', permanentlyDeletedAt:serverTimestamp(), restorable:false});
  batch.delete(doc(adminDb, 'communityPosts', 'eligible'));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(adminDb, 'communityPosts', 'eligible'))).exists(), true);
});

test('client-side repost creation is denied and reserved for the backend', async () => {
  const db = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  const sourceRef = doc(db, 'communityPosts', 'eligible');
  const repostRef = doc(db, 'communityPosts', 'repost');
  await assertFails(runTransaction(db, async transaction => {
    await transaction.get(sourceRef);
    transaction.set(repostRef, {...activePost, userId:'owner', title:'Reposted', repostedFromPostId:'eligible', repostedFromUnavailableSpace:'old-space', createdAt:serverTimestamp()});
    transaction.update(sourceRef, {repostedPostId:'repost', repostedAt:serverTimestamp()});
  }));
  assert.equal((await getDoc(sourceRef)).data().repostedPostId, undefined);
});

test('users cannot grant themselves main-thread posting access', async () => {
  const ownerDb = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertFails(setDoc(doc(ownerDb, 'users', 'owner'), {mainThreadPostingAccess:true, mainThreadAccessStatus:'approved'}, {merge:true}));
  const newcomerDb = environment.authenticatedContext('newcomer', {email:'new@example.com'}).firestore();
  await assertFails(setDoc(doc(newcomerDb, 'users', 'newcomer'), {email:'new@example.com', mainThreadPostingAccess:true, mainThreadAccessStatus:'approved'}));
  await assertSucceeds(setDoc(doc(newcomerDb, 'users', 'newcomer'), {email:'new@example.com', mainThreadPostingAccess:false, mainThreadAccessStatus:'not_requested'}));
});

test('restricted users can create private spaces but not public spaces', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'restricted'), {email:'restricted@example.com', username:'restricted', profileComplete:true, mainThreadPostingAccess:false, mainThreadAccessStatus:'not_requested'});
    await setDoc(doc(db, 'usernames', 'restricted'), {userId:'restricted'});
  });
  const db = environment.authenticatedContext('restricted', {email:'restricted@example.com'}).firestore();
  const base = {name:'Private studio', description:'A private testing space.', symbol:'PS', creatorId:'restricted', creatorUsername:'restricted', active:true, archived:false, moderationStatus:'clear', imageBase64:'', bannerBase64:'', imageURL:'', bannerURL:'', showInMainThread:false, createdAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(db, 'communitySpaces', 'private-studio'), {...base, isPrivate:true}));
  await assertFails(setDoc(doc(db, 'communitySpaces', 'public-studio'), {...base, isPrivate:false}));
});
