import {after, before, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, setDoc} from 'firebase/firestore';
import {getBytes, ref, uploadBytes} from 'firebase/storage';

let environment;
// Storage-to-Firestore rule lookups are resolved through the emulator hub's
// configured project, so this cross-service suite intentionally uses it.
const projectId = 'space-42d87';
const firestorePort = Number(String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':').pop());
const storagePort = Number(String(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':').pop());

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore:{rules:await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host:'127.0.0.1', port:firestorePort},
    storage:{rules:await readFile(new URL('../storage.rules', import.meta.url), 'utf8'), host:'127.0.0.1', port:storagePort}
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'secure-chat'), {creatorId:'owner', active:true, archived:false, chatEnabled:true});
    await setDoc(doc(db, 'communitySpaces', 'secure-chat', 'access', 'member'), {userId:'member', member:true, canReadPosts:true, canUseChat:true, blocked:false, chatBanned:false});
    await setDoc(doc(db, 'communitySpaces', 'secure-chat', 'access', 'banned'), {userId:'banned', canUseChat:false, blocked:false, chatBanned:true});
    await setDoc(doc(db, 'communitySpaces', 'secure-chat', 'access', 'blocked'), {userId:'blocked', canUseChat:false, blocked:true, chatBanned:false});
    await setDoc(doc(db, 'communityPosts', 'private-post'), {userId:'owner', communitySlug:'secure-chat', visibility:'private', published:true, archived:false, moderationStatus:'clear'});
    await setDoc(doc(db, 'communityPosts', 'space-draft'), {userId:'member', communitySlug:'secure-chat', visibility:'public', published:false, archived:false, moderationStatus:'clear'});
    await uploadBytes(ref(context.storage(), 'community/space-messages/secure-chat/member/serverseed01.jpg'), new Uint8Array([1,2,3]), {contentType:'image/jpeg'});
    await uploadBytes(ref(context.storage(), 'community/posts/private-post/00.jpg'), new Uint8Array([7,8,9]), {contentType:'image/jpeg'});
  });
});

after(async () => environment?.cleanup());

test('ordinary approved members can read chat media through one canonical access lookup', async () => {
  const storage = environment.authenticatedContext('member').storage();
  await assertSucceeds(getBytes(ref(storage, 'community/space-messages/secure-chat/member/serverseed01.jpg')));
});

test('chat-banned, blocked, and unauthenticated users cannot read chat media', async () => {
  const path = 'community/space-messages/secure-chat/member/serverseed01.jpg';
  await assertFails(getBytes(ref(environment.authenticatedContext('banned').storage(), path)));
  await assertFails(getBytes(ref(environment.authenticatedContext('blocked').storage(), path)));
  await assertFails(getBytes(ref(environment.unauthenticatedContext().storage(), path)));
});

test('only the approved user can upload into their own chat-media path', async () => {
  const bytes = new Uint8Array([4,5,6]);
  await assertSucceeds(uploadBytes(ref(environment.authenticatedContext('member').storage(), 'community/space-messages/secure-chat/member/memberupload01.jpg'), bytes, {contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(environment.authenticatedContext('member').storage(), 'community/space-messages/secure-chat/other/memberupload01.jpg'), bytes, {contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(environment.authenticatedContext('banned').storage(), 'community/space-messages/secure-chat/banned/bannedupload01.jpg'), bytes, {contentType:'image/jpeg'}));
});

test('server-side archive revocation immediately denies media access', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'communitySpaces', 'secure-chat'), {active:false, archived:true}, {merge:true});
    await setDoc(doc(db, 'communitySpaces', 'secure-chat', 'access', 'member'), {canUseChat:false}, {merge:true});
  });
  await assertFails(getBytes(ref(environment.authenticatedContext('member').storage(), 'community/space-messages/secure-chat/member/serverseed01.jpg')));
});

test('private post media follows the same canonical server grant', async () => {
  const path = 'community/posts/private-post/00.jpg';
  const memberStorage = environment.authenticatedContext('member').storage();
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'communitySpaces', 'secure-chat', 'access', 'member'), {canReadPosts:true}, {merge:true}));
  await assertSucceeds(getBytes(ref(memberStorage, path)));
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'communitySpaces', 'secure-chat', 'access', 'member'), {canReadPosts:false}, {merge:true}));
  await assertFails(getBytes(ref(memberStorage, path)));
});

test('removing server-owned space access immediately stops an open draft upload', async () => {
  const path = 'community/posts/space-draft/00.jpg';
  const bytes = new Uint8Array([10,11,12]);
  const memberStorage = environment.authenticatedContext('member').storage();
  await assertSucceeds(uploadBytes(ref(memberStorage, path), bytes, {contentType:'image/jpeg'}));
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'communitySpaces', 'secure-chat', 'access', 'member'), {member:false, canReadPosts:false}, {merge:true}));
  await assertFails(uploadBytes(ref(memberStorage, path), bytes, {contentType:'image/jpeg'}));
});
