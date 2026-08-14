import {after, before, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where, writeBatch} from 'firebase/firestore';

let environment;
const projectId = 'space-42d87-moderation-tests';
const firestorePort = Number(String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':').pop());
const activePost = {userId:'owner', type:'text', title:'Active', summary:'Active', content:'Active post', behanceSrc:'', communitySlug:'main', visibility:'public', authorName:'Owner', authorUsername:'owner', published:true, featured:false, featureRequest:false, featureStatus:'none', archived:false, moderationStatus:'clear', imageChunkCount:0, imageMimeType:'', imageChunkCounts:[], imageMimeTypes:[]};

before(async () => {
  environment = await initializeTestEnvironment({projectId, firestore:{rules:await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host:'127.0.0.1', port:firestorePort}});
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

test('active-content queries satisfy visibility and publication rules', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(collection(db, 'communityPosts'), where('archived', '==', false), where('published', '==', true), where('moderationStatus', '==', 'clear'), where('visibility', '==', 'public'))));
});

test('owners can read eligible cascade archives but not moderation-flagged archives', async () => {
  const db = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertSucceeds(getDoc(doc(db, 'communityPosts', 'eligible')));
  await assertFails(getDoc(doc(db, 'communityPosts', 'flagged')));
});

test('moderation state and audit history are callable-backend-only', async () => {
  const ownerDb = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertFails(setDoc(doc(ownerDb, 'communityPosts', 'active'), {archived:true, archiveCause:'moderation'}, {merge:true}));
  await assertFails(setDoc(doc(ownerDb, 'communityModerationAudit', 'bad'), {moderatorId:'owner', moderatorEmail:'owner@example.com', action:'archive', contentType:'post', contentId:'active', reason:'bad', createdAt:serverTimestamp()}));

  const adminDb = environment.authenticatedContext('moderator', {email:'moderator@example.com'}).firestore();
  await assertFails(setDoc(doc(adminDb, 'communityPosts', 'active'), {archived:true, archiveCause:'moderation', archiveReason:'Policy review'}, {merge:true}));
  await assertFails(setDoc(doc(adminDb, 'communityModerationAudit', 'good'), {moderatorId:'moderator', moderatorEmail:'moderator@example.com', action:'archive', contentType:'post', contentId:'active', reason:'Policy review', cascadeId:null, details:{}, createdAt:serverTimestamp()}));
});

test('community managers cannot mutate space access fields directly', async () => {
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'communitySpaces', 'managed-space'), {name:'Managed', description:'Managed space', symbol:'MS', creatorId:'owner', creatorUsername:'owner', active:true, archived:false, chatEnabled:false, imageBase64:'', bannerBase64:'', imageURL:'', bannerURL:''}));
  const adminDb = environment.authenticatedContext('moderator', {email:'moderator@example.com'}).firestore();
  await assertFails(setDoc(doc(adminDb, 'communitySpaces', 'managed-space'), {active:false, archived:true, chatEnabled:true, creatorId:'moderator'}, {merge:true}));
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

test('even super administrators must change role assignments through the callable backend', async () => {
  const adminDb = environment.authenticatedContext('moderator', {email:'moderator@example.com'}).firestore();
  await assertFails(setDoc(doc(adminDb, 'config', 'userRoles'), {assignments:{'attacker@example.com':'super_admin'}}, {merge:true}));
});

test('space creation is callable-only even for otherwise eligible users', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'restricted'), {email:'restricted@example.com', username:'restricted', profileComplete:true, mainThreadPostingAccess:false, mainThreadAccessStatus:'not_requested'});
    await setDoc(doc(db, 'usernames', 'restricted'), {userId:'restricted'});
  });
  const db = environment.authenticatedContext('restricted', {email:'restricted@example.com'}).firestore();
  const base = {name:'Private studio', description:'A private testing space.', symbol:'PS', creatorId:'restricted', creatorUsername:'restricted', active:true, archived:false, moderationStatus:'clear', imageBase64:'', bannerBase64:'', imageURL:'', bannerURL:'', showInMainThread:false, createdAt:serverTimestamp()};
  await assertFails(setDoc(doc(db, 'communitySpaces', 'private-studio'), {...base, isPrivate:true}));
  await assertFails(setDoc(doc(db, 'communitySpaces', 'public-studio'), {...base, isPrivate:false}));
});

test('space messages are readable only by connected, unblocked members', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'chat-space'), {creatorId:'owner', active:true, archived:false, isPrivate:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'connections', 'member'), {userId:'member', createdAt:serverTimestamp()});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'access', 'member'), {userId:'member', canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'connections', 'banned'), {userId:'banned', createdAt:serverTimestamp()});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'blocks', 'banned'), {userId:'banned'});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'access', 'banned'), {userId:'banned', canUseChat:false, blocked:true, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'messages', 'one'), {senderId:'owner', text:'Welcome', createdAt:serverTimestamp()});
  });
  const memberDb = environment.authenticatedContext('member').firestore();
  const outsiderDb = environment.authenticatedContext('outsider').firestore();
  const bannedDb = environment.authenticatedContext('banned').firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'communitySpaces', 'chat-space', 'messages', 'one')));
  await assertFails(getDoc(doc(outsiderDb, 'communitySpaces', 'chat-space', 'messages', 'one')));
  await assertFails(getDoc(doc(bannedDb, 'communitySpaces', 'chat-space', 'messages', 'one')));
});

test('blocked users cannot read a public space post or its messages', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'blocked-space'), {creatorId:'owner', active:true, archived:false, isPrivate:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'blocked-space', 'connections', 'blocked'), {userId:'blocked', chatAccessApproved:true});
    await setDoc(doc(db, 'communitySpaces', 'blocked-space', 'blocks', 'blocked'), {userId:'blocked', reason:'Space policy'});
    await setDoc(doc(db, 'communitySpaces', 'blocked-space', 'access', 'blocked'), {userId:'blocked', canReadPosts:false, canUseChat:false, blocked:true, chatBanned:false});
    await setDoc(doc(db, 'users', 'blocked', 'blockedSpaces', 'blocked-space'), {spaceSlug:'blocked-space'});
    await setDoc(doc(db, 'communityPosts', 'blocked-post'), {...activePost, communitySlug:'blocked-space'});
    await setDoc(doc(db, 'communitySpaces', 'blocked-space', 'messages', 'one'), {senderId:'owner', text:'Hidden'});
  });
  const blockedDb = environment.authenticatedContext('blocked').firestore();
  const viewerDb = environment.authenticatedContext('viewer').firestore();
  await assertFails(getDoc(doc(blockedDb, 'communityPosts', 'blocked-post')));
  await assertFails(getDoc(doc(blockedDb, 'communitySpaces', 'blocked-space', 'messages', 'one')));
  await assertSucceeds(getDoc(doc(blockedDb, 'communitySpaces', 'blocked-space', 'blocks', 'blocked')));
  await assertSucceeds(getDoc(doc(blockedDb, 'users', 'blocked', 'blockedSpaces', 'blocked-space')));
  await assertSucceeds(getDoc(doc(viewerDb, 'communityPosts', 'blocked-post')));
});

test('a blocked author cannot keep editing a space post from an already-open page', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'revoked-editor'), {creatorId:'owner', active:true, archived:false, isPrivate:false});
    await setDoc(doc(db, 'communitySpaces', 'revoked-editor', 'access', 'member'), {userId:'member', member:false, canReadPosts:false, blocked:true});
    await setDoc(doc(db, 'communityPosts', 'revoked-edit-post'), {...activePost, userId:'member', communitySlug:'revoked-editor'});
  });
  const db = environment.authenticatedContext('member').firestore();
  await assertFails(setDoc(doc(db, 'communityPosts', 'revoked-edit-post'), {title:'Edited after revocation'}, {merge:true}));
});

test('new connected members remain outside messages until chat access is approved', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'approval-chat'), {creatorId:'owner', active:true, archived:false, isPrivate:false, isViewOnly:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'approval-chat', 'connections', 'waiting'), {userId:'waiting', chatAccessApproved:false});
    await setDoc(doc(db, 'communitySpaces', 'approval-chat', 'connections', 'approved'), {userId:'approved', chatAccessApproved:true});
    await setDoc(doc(db, 'communitySpaces', 'approval-chat', 'access', 'waiting'), {userId:'waiting', canUseChat:false, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'approval-chat', 'access', 'approved'), {userId:'approved', canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'approval-chat', 'messages', 'one'), {senderId:'owner', text:'Members only'});
  });
  const waitingDb = environment.authenticatedContext('waiting').firestore();
  const approvedDb = environment.authenticatedContext('approved').firestore();
  const newcomerDb = environment.authenticatedContext('newcomer').firestore();
  await assertFails(getDoc(doc(waitingDb, 'communitySpaces', 'approval-chat', 'messages', 'one')));
  await assertSucceeds(getDoc(doc(approvedDb, 'communitySpaces', 'approval-chat', 'messages', 'one')));
  await assertFails(setDoc(doc(newcomerDb, 'communitySpaces', 'approval-chat', 'connections', 'newcomer'), {userId:'newcomer', spaceSlug:'approval-chat', chatAccessApproved:true, createdAt:serverTimestamp()}));
});

test('view-only spaces are public to read and engage with while connection requires approval', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'view-only'), {creatorId:'owner', active:true, archived:false, isPrivate:false, isViewOnly:true, showInMainThread:true});
    await setDoc(doc(db, 'communityPosts', 'view-only-post'), {...activePost, communitySlug:'view-only'});
  });
  const viewerDb = environment.authenticatedContext('viewer').firestore();
  await assertSucceeds(getDoc(doc(viewerDb, 'communityPosts', 'view-only-post')));
  await assertFails(setDoc(doc(viewerDb, 'communityPosts', 'view-only-post', 'votes', 'viewer'), {userId:'viewer', value:1}));
  await assertFails(setDoc(doc(viewerDb, 'communityPosts', 'view-only-post', 'comments', 'one'), {userId:'viewer', text:'Bypass attempt', parentId:null}));
  await assertFails(setDoc(doc(viewerDb, 'communitySpaces', 'view-only', 'connections', 'viewer'), {userId:'viewer', spaceSlug:'view-only', createdAt:serverTimestamp()}));
});

test('private-space posts are readable only by owners and connected members', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'private-room'), {creatorId:'owner', active:true, archived:false, isPrivate:true});
    await setDoc(doc(db, 'communitySpaces', 'private-room', 'connections', 'member'), {userId:'member'});
    await setDoc(doc(db, 'communitySpaces', 'private-room', 'access', 'member'), {userId:'member', canReadPosts:true, blocked:false});
    await setDoc(doc(db, 'communityPosts', 'private-post'), {...activePost, communitySlug:'private-room', visibility:'private'});
  });
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'communityPosts', 'private-post')));
  await assertFails(getDoc(doc(environment.authenticatedContext('outsider').firestore(), 'communityPosts', 'private-post')));
  await assertSucceeds(getDoc(doc(environment.authenticatedContext('member').firestore(), 'communityPosts', 'private-post')));
});

test('account email is private while public profile remains public', async () => {
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'publicProfiles', 'owner'), {username:'owner', displayName:'Owner'}));
  const publicDb = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(publicDb, 'users', 'owner')));
  await assertSucceeds(getDoc(doc(publicDb, 'publicProfiles', 'owner')));
});

test('space messages and chat bans cannot be written directly by clients', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'chat-space'), {creatorId:'owner', active:true, archived:false, isPrivate:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'chat-space', 'connections', 'member'), {userId:'member', createdAt:serverTimestamp()});
  });
  const memberDb = environment.authenticatedContext('member').firestore();
  const ownerDb = environment.authenticatedContext('owner').firestore();
  await assertFails(setDoc(doc(memberDb, 'communitySpaces', 'chat-space', 'messages', 'client-write'), {senderId:'member', text:'Bypass'}));
  await assertFails(setDoc(doc(ownerDb, 'communitySpaces', 'chat-space', 'chatBans', 'member'), {userId:'member'}));
});

test('seen receipts are visible only to chat members and backend-write-only', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'receipt-space'), {creatorId:'owner', active:true, archived:false, isPrivate:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'receipt-space', 'connections', 'member'), {userId:'member'});
    await setDoc(doc(db, 'communitySpaces', 'receipt-space', 'access', 'owner'), {userId:'owner', canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'receipt-space', 'access', 'member'), {userId:'member', canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'receipt-space', 'messageReads', 'member'), {userId:'member', lastMessageId:'one', seenAt:serverTimestamp()});
  });
  const ownerDb = environment.authenticatedContext('owner').firestore();
  const memberDb = environment.authenticatedContext('member').firestore();
  const outsiderDb = environment.authenticatedContext('outsider').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'communitySpaces', 'receipt-space', 'messageReads', 'member')));
  await assertSucceeds(getDoc(doc(memberDb, 'communitySpaces', 'receipt-space', 'messageReads', 'member')));
  await assertFails(getDoc(doc(outsiderDb, 'communitySpaces', 'receipt-space', 'messageReads', 'member')));
  await assertFails(setDoc(doc(memberDb, 'communitySpaces', 'receipt-space', 'messageReads', 'member'), {lastMessageId:'forged'}, {merge:true}));
});

test('chat bans and archived spaces revoke message access through the server-owned access record', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat'), {creatorId:'owner', active:true, archived:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat', 'access', 'banned'), {userId:'banned', canUseChat:false, blocked:false, chatBanned:true});
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat', 'access', 'archived-member'), {userId:'archived-member', canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat', 'messages', 'one'), {senderId:'owner', text:'Protected'});
  });
  await assertFails(getDoc(doc(environment.authenticatedContext('banned').firestore(), 'communitySpaces', 'revoked-chat', 'messages', 'one')));
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat'), {active:false, archived:true}, {merge:true});
    await setDoc(doc(db, 'communitySpaces', 'revoked-chat', 'access', 'archived-member'), {canUseChat:false}, {merge:true});
  });
  await assertFails(getDoc(doc(environment.authenticatedContext('archived-member').firestore(), 'communitySpaces', 'revoked-chat', 'messages', 'one')));
});

test('clients cannot forge canonical space access or membership decisions', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'secure-space'), {creatorId:'owner', active:true, archived:false, isPrivate:true});
  });
  const attackerDb = environment.authenticatedContext('attacker').firestore();
  const ownerDb = environment.authenticatedContext('owner').firestore();
  await assertFails(setDoc(doc(attackerDb, 'communitySpaces', 'secure-space', 'access', 'attacker'), {canReadPosts:true, canUseChat:true}));
  await assertFails(setDoc(doc(attackerDb, 'communitySpaces', 'secure-space', 'connections', 'attacker'), {userId:'attacker', spaceSlug:'secure-space', createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(ownerDb, 'communitySpaces', 'secure-space', 'connectionRequests', 'attacker'), {status:'approved'}, {merge:true}));
});

test('users cannot mark their own profile complete directly', async () => {
  const db = environment.authenticatedContext('owner', {email:'owner@example.com'}).firestore();
  await assertFails(setDoc(doc(db, 'users', 'owner'), {profileComplete:false}, {merge:true}));
  const newcomerDb = environment.authenticatedContext('profile-attacker', {email:'profile@example.com'}).firestore();
  await assertFails(setDoc(doc(newcomerDb, 'users', 'profile-attacker'), {email:'profile@example.com', profileComplete:true, mainThreadPostingAccess:false, mainThreadAccessStatus:'not_requested'}));
});
