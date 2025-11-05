# Deployment Instructions for Firestore Migration

## Quick Start

The website has been migrated to use Firebase Firestore for content management. Follow these steps to complete the deployment:

### Step 1: Deploy Firestore Security Rules (Required)

**Option A: Using Firebase CLI (Recommended)**
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy rules
firebase deploy --only firestore:rules
```

**Option B: Manual deployment via Firebase Console**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `aias-bsr`
3. Navigate to: Firestore Database → Rules
4. Copy the contents of `firestore.rules` from the repository
5. Paste into the Rules editor
6. Click "Publish"

### Step 2: Migrate Existing Data (Required)

1. Deploy the website with the new code
2. Login as an admin user
3. Navigate to: `https://your-domain.com/migrate-to-firestore.html`
4. Click "Start Migration"
5. Wait for completion
6. Verify data in Firebase Console

**Important:** You only need to run the migration once. The tool will transfer all data from the old JSON files to Firestore.

### Step 3: Verify Everything Works

Test these pages to ensure they load correctly:
- ✅ Home page: `index.html`
- ✅ Events: `events.html`
- ✅ Magazine: `magazine.html`
- ✅ Library: `library.html`
- ✅ Education: `education.html`
- ✅ About: `about.html`
- ✅ FBD: `fbd.html`

Test admin functionality:
- ✅ Login as admin
- ✅ Add a new event
- ✅ Add a magazine article
- ✅ Add a library resource
- ✅ Update education content

## What Changed

### Files Removed
- ❌ `data/data.json` - Content now in Firestore
- ❌ `data/admin.json` - Admin list now in Firestore
- ❌ `js/github-api.js` - Replaced with `js/firestore-api.js`
- ❌ `data/` directory - No longer needed

### Files Added
- ✅ `firestore.rules` - Firestore security rules
- ✅ `firebase.json` - Firebase configuration
- ✅ `js/firestore-api.js` - Firestore integration
- ✅ `migrate-to-firestore.html` - One-time migration tool
- ✅ `FIRESTORE_MIGRATION_GUIDE.md` - Detailed migration guide
- ✅ `DEPLOYMENT_INSTRUCTIONS.md` - This file

### Files Modified
- 🔄 `js/data-loader.js` - Now fetches from Firestore
- 🔄 `js/auth.js` - Admin check uses Firestore
- 🔄 `admin-dashboard.html` - Uses FirestoreAPI instead of GitHubAPI
- 🔄 All HTML files - Load data-loader.js as a module
- 🔄 `FIREBASE_SETUP.md` - Updated for Firestore

## Benefits of This Migration

1. **No GitHub Tokens Required** - Admins no longer need GitHub Personal Access Tokens
2. **Real-time Updates** - Content changes are instant across all users
3. **Better Performance** - Firestore caching improves page load times
4. **Enhanced Security** - Fine-grained access control via security rules
5. **Easier Management** - Simple UI in Firebase Console for viewing/editing data
6. **Better Scalability** - Handles more users and content efficiently

## Firestore Data Structure

```
Firestore Database
├── config/
│   └── admins
│       └── admins: ["email1@example.com", "email2@example.com"]
│
├── content/
│   ├── home (home page content)
│   ├── magazine (magazine articles)
│   ├── education (education content)
│   └── about (about page content)
│
├── events/ (collection)
│   └── {eventId} (documents)
│
└── library/ (collection)
    └── {itemId} (documents)
```

## Managing Content After Migration

### Adding/Removing Admins
1. Go to Firebase Console → Firestore Database
2. Navigate to `config` → `admins`
3. Edit the `admins` array
4. Click "Update"

### Managing Content
Use the admin dashboard at: `https://your-domain.com/admin-dashboard.html`

All changes are saved directly to Firestore - no GitHub commits needed!

## Troubleshooting

### Migration Fails
- Ensure you're logged in as an admin
- Check browser console for errors
- Verify Firestore is enabled in Firebase Console
- Ensure security rules are deployed

### Pages Don't Load Content
- Verify security rules allow public read access
- Check Firestore has the migrated data
- Clear browser cache and reload
- Check browser console for errors

### Admin Can't Update Content
- Verify email is in `config/admins` document
- Ensure user is authenticated (logged in)
- Check security rules allow admin write access
- Review browser console for permission errors

## Support

For detailed information, see:
- `FIRESTORE_MIGRATION_GUIDE.md` - Complete migration guide
- `FIREBASE_SETUP.md` - Firebase setup and configuration
- `firestore.rules` - Security rules documentation

For issues, contact: basrah@aias.org

## Next Steps After Deployment

1. ✅ Monitor Firebase Console for any errors
2. ✅ Test all functionality thoroughly
3. ✅ Remove `migrate-to-firestore.html` once migration is confirmed
4. ✅ Update any external documentation referencing JSON files
5. ✅ Train admins on the new Firestore-based system

---

**Deployed successfully?** Delete this file and `migrate-to-firestore.html` to keep the repository clean! 🎉
