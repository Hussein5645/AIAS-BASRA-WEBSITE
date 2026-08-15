'use strict';

const path = require('path');
const admin = require('firebase-admin');

const cliRoot = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(cliRoot, 'auth.js'));
const defaultCredentials = require(path.join(cliRoot, 'defaultCredentials.js'));

const targetEmail = (process.argv[2] || '').trim().toLowerCase();
if (!targetEmail || !targetEmail.includes('@')) {
  console.error('Usage: node scripts/add-admin.js <user-email>');
  process.exit(1);
}

(async () => {
  const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login not found. Run firebase login first.');
  const credentialPath = await defaultCredentials.getCredentialPathAsync(account);
  try {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
    process.env.GCLOUD_PROJECT ||= 'space-42d87';

    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'space-42d87' });
    }
    const db = admin.firestore();
    const docRef = db.doc('config/admins');
    const docSnap = await docRef.get();

    let adminsList = Array.isArray(docSnap.data()?.admins) ? docSnap.data().admins : [];
    adminsList = adminsList.map(item => String(item).trim().toLowerCase());

    if (!adminsList.includes(targetEmail)) {
      adminsList.push(targetEmail);
      await docRef.set({ admins: adminsList }, { merge: true });
      console.log(`\n✅ Successfully added ${targetEmail} as a Super Admin in Firestore!\n`);
    } else {
      console.log(`\nℹ️ ${targetEmail} is already registered as an Admin.\n`);
    }

    console.log('Current Admin List:', adminsList);
  } finally {
    defaultCredentials.clearCredentials(account);
  }
})().catch(error => {
  console.error('❌ Failed to add admin:', error);
  process.exitCode = 1;
});
