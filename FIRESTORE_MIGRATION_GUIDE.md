# Firestore Migration Guide

This guide explains how to migrate content from JSON files to Firebase Firestore.

## ⚠️ Important Note

**This migration has already been completed in the codebase.** The website now uses Firestore instead of JSON files. To activate this:

1. **Deploy Firestore Security Rules** (see Step 1 below)
2. **Run the Migration Tool** to transfer existing data (see Step 2 below)
3. **Verify Everything Works** (see Step 3 below)
4. The old JSON files have already been removed from the repository

## Overview

The website has been updated to use Firebase Firestore instead of local JSON files for content management. This provides several benefits:
- Real-time updates across all users
- Better scalability and performance
- Integrated security rules
- No need for GitHub API tokens
- Easier content management for admins

## What Changed

### Before Migration
- Content was stored in `data/data.json`
- Admin list was stored in `data/admin.json`
- Admin dashboard used GitHub API to update files
- Required GitHub Personal Access Token

### After Migration
- Content is stored in Firestore collections and documents
- Admin list is stored in Firestore `config/admins` document
- Admin dashboard directly updates Firestore
- Uses Firebase Authentication (no tokens needed)

## Firestore Structure

The data is organized in Firestore as follows:

```
Firestore Database
├── config/
│   └── admins (document)
│       └── admins: ["email1@example.com", "email2@example.com"]
│
├── content/
│   ├── home (document)
│   │   ├── hero: { title, subtitle }
│   │   └── mission: { title, subtitle, cards }
│   │
│   ├── magazine (document)
│   │   ├── featuredArticle: { ... }
│   │   ├── articles: [ ... ]
│   │   └── releases: [ ... ]
│   │
│   ├── education (document)
│   │   ├── weeklyWorkshop: { ... }
│   │   ├── courses: [ ... ]
│   │   └── fbd: { ... }
│   │
│   └── about (document)
│       ├── story: { paragraphs }
│       ├── values: [ ... ]
│       ├── founders: [ ... ]
│       └── team: [ ... ]
│
├── events/ (collection)
│   ├── {eventId1} (document)
│   ├── {eventId2} (document)
│   └── ...
│
└── library/ (collection)
    ├── {itemId1} (document)
    ├── {itemId2} (document)
    └── ...
```

## Migration Steps

### Step 1: Deploy Firestore Security Rules

The security rules are defined in `firestore.rules`. Deploy them using Firebase CLI:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy security rules
firebase deploy --only firestore:rules
```

Or manually copy the rules from `firestore.rules` to the Firebase Console:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `aias-bsr`
3. Go to Firestore Database > Rules
4. Copy and paste the rules from `firestore.rules`
5. Click "Publish"

### Step 2: Run the Migration Tool

1. Login as an admin user on the website
2. Navigate to: `https://your-domain.com/migrate-to-firestore.html`
3. Click "Start Migration"
4. Wait for the migration to complete
5. Verify the data in Firebase Console

The migration tool will:
- Read all content from `data/data.json`
- Read admin list from `data/admin.json`
- Create all necessary Firestore collections and documents
- Display progress and any errors

### Step 3: Verify the Migration

1. Check Firebase Console to ensure all data is present
2. Test all pages on the website:
   - Home page (`index.html`)
   - Events page (`events.html`)
   - Magazine page (`magazine.html`)
   - Library page (`library.html`)
   - Education page (`education.html`)
   - About page (`about.html`)
   - FBD page (`fbd.html`)
3. Test admin dashboard functionality:
   - Login as admin
   - Try adding a new event
   - Try adding a magazine article
   - Try adding a library resource
   - Try updating education content

### Step 4: Clean Up (After Verification)

Once you've verified everything works correctly, you can remove the old files:

```bash
# Remove old JSON files
rm data/data.json
rm data/admin.json

# Remove GitHub API integration (no longer needed)
rm js/github-api.js

# Remove migration tool (one-time use)
rm migrate-to-firestore.html

# Optional: Remove the data directory if it's now empty
rmdir data
```

## Security Rules Explained

The Firestore security rules ensure:

1. **Public Read Access**: All users can read content (events, library, education, etc.)
2. **Admin Write Access**: Only authenticated admins can write/update content
3. **User Profiles**: Users can only read/write their own profile data
4. **Admin List**: Admin list is readable by all but only writable by admins

## Troubleshooting

### Migration Fails

If the migration fails:
1. Check that you're logged in as an admin
2. Verify Firebase Authentication is working
3. Check browser console for error messages
4. Ensure Firestore is enabled in Firebase Console
5. Verify security rules are deployed

### Data Not Loading

If data doesn't load on the website:
1. Open browser console and check for errors
2. Verify Firestore security rules allow public read access
3. Check that data exists in Firebase Console
4. Clear browser cache and reload

### Admin Can't Update Content

If admin dashboard can't update content:
1. Verify user email is in the `config/admins` document
2. Check that user is authenticated (logged in)
3. Verify security rules allow admin write access
4. Check browser console for permission errors

## Rollback (Emergency)

If you need to rollback to the JSON-based system:

1. Keep backups of `data/data.json` and `data/admin.json`
2. Restore the old versions of:
   - `js/data-loader.js`
   - `js/auth.js`
   - `admin-dashboard.html`
   - All HTML files (to remove module type from script tags)
3. Remove Firestore-related files:
   - `js/firestore-api.js`
   - `firestore.rules`
   - `firebase.json`

## Support

For issues or questions:
- Check Firebase Console for Firestore logs
- Review browser console for JavaScript errors
- Contact: basrah@aias.org

## Benefits of Firestore Migration

1. **No GitHub Tokens**: Admins no longer need GitHub Personal Access Tokens
2. **Real-time Updates**: Content updates are instant across all users
3. **Better Performance**: Firestore caching improves page load times
4. **Scalability**: Handles more users and content efficiently
5. **Security**: Fine-grained access control through security rules
6. **Reliability**: Built-in backup and disaster recovery
7. **Easier Management**: Simple UI in Firebase Console for viewing/editing data
