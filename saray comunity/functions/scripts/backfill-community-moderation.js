'use strict';

const {applicationDefault, initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

initializeApp({credential:applicationDefault(), projectId:process.env.GCLOUD_PROJECT || 'space-42d87'});
const db = getFirestore();

async function backfill(collectionName, defaults) {
  const snapshot = await db.collection(collectionName).get();
  let updated = 0;
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + 400).forEach(item => {
      const data = item.data();
      const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in data)));
      if (Object.keys(missing).length) { batch.update(item.ref, missing); updated += 1; }
    });
    await batch.commit();
  }
  console.log(`${collectionName}: ${updated} of ${snapshot.size} records updated.`);
}

(async () => {
  await backfill('communityPosts', {archived:false, moderationStatus:'clear'});
  await backfill('communitySpaces', {archived:false, moderationStatus:'clear'});
  console.log('Community moderation backfill complete.');
})().catch(error => { console.error(error); process.exitCode = 1; });
