'use strict';

const {applicationDefault, initializeApp} = require('firebase-admin/app');
const {FieldValue, getFirestore} = require('firebase-admin/firestore');

initializeApp({credential:applicationDefault(), projectId:process.env.GCLOUD_PROJECT || 'space-42d87'});
const db = getFirestore();

(async () => {
  const snapshot = await db.collection('users').get();
  let updated = 0;
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + 400).forEach(item => {
      if ('mainThreadPostingAccess' in item.data()) return;
      batch.update(item.ref, {
        mainThreadPostingAccess:true,
        mainThreadAccessStatus:'approved',
        mainThreadAccessGrandfatheredAt:FieldValue.serverTimestamp()
      });
      updated += 1;
    });
    await batch.commit();
  }
  console.log(`users: ${updated} of ${snapshot.size} existing records granted main-thread posting access.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
