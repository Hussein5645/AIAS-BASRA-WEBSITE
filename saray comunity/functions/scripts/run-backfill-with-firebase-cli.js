'use strict';

const path = require('path');

const cliRoot = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(cliRoot, 'auth.js'));
const defaultCredentials = require(path.join(cliRoot, 'defaultCredentials.js'));

(async () => {
  const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI login not found. Run firebase login first.');
  const credentialPath = await defaultCredentials.getCredentialPathAsync(account);
  try {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
    process.env.GCLOUD_PROJECT ||= 'space-42d87';
    const {run} = require('./backfill-realtime-data.js');
    await run();
  } finally {
    defaultCredentials.clearCredentials(account);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
