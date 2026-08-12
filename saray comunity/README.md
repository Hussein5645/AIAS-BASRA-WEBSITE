# Saray Community deployment

This folder is the only Firebase Hosting source for project `space-42d87`.
The main AIAS Basra website remains hosted separately at `https://www.aiasbsr.com`,
but both sites use the same Firebase project.

Run Firebase commands from this directory:

```powershell
npm install
npm --prefix functions install
npm test
npm run test:rules
npm run deploy
```

`hosting.public` is fixed to `public`, so a Firebase deployment cannot publish the
main website repository by accident.

## Phase 1 data migration

`npm run migrate:public-data` copies the publicly readable Firestore documents
from the former project while preserving document IDs and Firestore value types.
It deliberately excludes notification tokens and protected moderation/admin
records. The script requires a current destination-project OAuth access token in
the temporary `FIREBASE_ACCESS_TOKEN` environment variable and never stores that
token in the repository.

The former project's Firebase Authentication users must be exported by an
account that has `firebaseauth.users.get` access and imported into `space-42d87`
with their original UIDs. This is required to preserve ownership of migrated
posts, spaces, profiles, usernames, comments, and votes. Google sign-in is
enabled in `space-42d87`, but do not treat newly created replacement UIDs as an
Auth migration.

The first deployment configured a seven-day cleanup policy for second-generation
Functions container artifacts in `us-central1`.
