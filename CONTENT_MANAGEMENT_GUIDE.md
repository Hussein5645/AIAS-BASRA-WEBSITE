# AIAS Basra Website - Content Management Guide

## Overview

The AIAS Basra website uses a hybrid content management approach, combining static content stored in the repository with dynamic content stored in Firebase Firestore.

## Content Architecture

### Static Content (Repository-based)
Static content is stored directly in the repository and doesn't change frequently. This includes:

- **About Page** (`about.html`)
  - Chapter story and history
  - Core values
  - Team member profiles (stored in `content/founders/`)

- **Magazine Releases** (PDF files)
  - Located in repository as PDF files
  - Links maintained in Firestore

- **All Page Titles and Subtitles**
  - Hardcoded in HTML files
  - Supports multilingual (EN/AR)

### Dynamic Content (Firestore-based)
Dynamic content is stored in Firebase Firestore and can be updated through the admin dashboard:

- **Events** (`events` collection)
  - Workshop details
  - Lecture information
  - Social events
  - Registration information

- **Weekly Workshop Details** (`content/education` document)
  - Week title
  - Lecturer name
  - Workshop description

- **Magazine Articles** (`content/magazine` document)
  - Article title
  - Author
  - Publication date
  - Summary and full content

- **Library Resources** (`library` collection)
  - Resource name
  - Type (Book, Tutorial, Software)
  - Tags
  - Description
  - External links

## Firebase Firestore Structure

```
aias-bsr (project)
├── events/ (collection)
│   └── {eventId} (document)
│       ├── title
│       ├── time
│       ├── location
│       ├── eventType
│       ├── seatsAvailable
│       ├── image
│       └── description
│
├── library/ (collection)
│   └── {resourceId} (document)
│       ├── name
│       ├── type
│       ├── tags
│       ├── image
│       ├── description
│       └── link
│
└── content/ (collection)
    ├── home (document)
    │   ├── hero
    │   └── mission
    │
    ├── magazine (document)
    │   ├── featuredArticle
    │   ├── articles[]
    │   └── releases[]
    │
    ├── education (document)
    │   ├── weeklyWorkshop
    │   ├── courses[]
    │   └── fbd
    │
    └── about (document)
        ├── story
        ├── values[]
        ├── founders[]
        └── team[]
```

## Admin Dashboard Features

The admin dashboard (`admin-dashboard.html`) provides a comprehensive interface for managing dynamic content:

### User Management
- View all registered users
- Verify user accounts
- Delete users
- User authentication via Firebase Auth

### Event Management
- Add new events with form
- View list of existing events
- Delete events
- Automatic Firestore synchronization

### Magazine Article Management
- Add new articles
- View list of existing articles
- Delete articles
- Manage article metadata (title, author, date, summary, content)

### Library Resource Management
- Add new resources
- View list of existing resources
- Delete resources
- Manage resource metadata (name, type, tags, description, link)

### Education Content Management
- Update weekly workshop details
- Edit lecturer information
- Modify workshop descriptions

## Firebase Connection Logging

The system includes comprehensive logging for debugging and monitoring:

### Configuration Logging
```javascript
[Firebase Config] Initializing with:
  - projectId: aias-bsr
  - authDomain: aias-bsr.firebaseapp.com
  - storageBucket: aias-bsr.firebasestorage.app
```

### Data Loader Logging
```javascript
[Data Loader] Fetching fresh data from Firestore...
[Data Loader] Fetching home content...
[Data Loader] ✓ Home content loaded
[Data Loader] Fetching events...
[Data Loader] ✓ Loaded 6 events
[Data Loader] ✓ All data loaded and cached successfully
```

### Firestore API Logging
```javascript
[Firestore API] getAllContent() called
[Firestore API] Reading home content...
[Firestore API] ✓ Home content retrieved
[Firestore API] addEvent() called with: {...}
[Firestore API] ✓ Event added successfully with ID: evt-123456
[Firestore API] deleteEvent() called for ID: evt-123456
[Firestore API] ✓ Event evt-123456 deleted successfully
```

### Error Logging
All errors include detailed information:
```javascript
[Firestore API] ✗ Error in getAllContent: Permission denied
[Firestore API] Error details: {
  code: "permission-denied",
  message: "Missing or insufficient permissions",
  name: "FirebaseError"
}
```

## Security Rules

Firestore security rules ensure proper access control:

- **Public Read Access**: All content is publicly readable
- **Admin Write Access**: Only verified admins can write/update/delete content
- **User Profile Access**: Users can only read/write their own profile data

## Development Workflow

### Adding New Dynamic Content Type

1. **Define Firestore Structure**
   - Add new collection or document in Firestore
   - Update security rules if needed

2. **Update firestore-api.js**
   - Add CRUD methods (add, get, update, delete)
   - Include comprehensive logging

3. **Update data-loader.js**
   - Add data fetching method
   - Add to cached data structure

4. **Update admin-dashboard.html**
   - Add new tab in navigation
   - Create form for adding/editing
   - Create list view for existing items
   - Add event handlers

5. **Update Display Pages**
   - Modify HTML pages to load and display data
   - Add loading states and error handling

### Testing Changes

1. **Test in Admin Dashboard**
   - Add new content
   - Verify it appears in the list
   - Delete content
   - Check browser console for logs

2. **Test on Public Pages**
   - Verify content appears correctly
   - Check for loading states
   - Verify error handling

3. **Check Firebase Console**
   - Verify data structure
   - Check security rules
   - Monitor usage

## Troubleshooting

### Content Not Appearing

1. Check browser console for errors
2. Verify Firestore connection logs
3. Check Firebase security rules
4. Verify data structure in Firestore console

### Permission Denied Errors

1. Verify user is logged in
2. Check if user email is in admin list (`config/admins`)
3. Review Firestore security rules
4. Check Firebase Authentication status

### Logging Not Appearing

1. Open browser developer console (F12)
2. Check Console tab
3. Filter by `[Firebase`, `[Data Loader]`, or `[Firestore API]`
4. Enable verbose logging if needed

## Best Practices

1. **Always use the admin dashboard** for content updates
2. **Monitor console logs** when testing changes
3. **Backup important content** before making bulk changes
4. **Test locally first** before deploying to production
5. **Keep static content in repository** for version control
6. **Use Firestore for dynamic content** that changes frequently

## Support

For issues or questions:
- Check console logs for detailed error messages
- Review this guide and Firebase documentation
- Contact the development team

---

Last Updated: 2025-11-05
