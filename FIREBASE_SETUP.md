# Firebase Setup Guide for AIAS-BSR Website

This document explains how to set up and configure Firebase Authentication for the AIAS Basra website.

## Firebase Project Details

- **Project name**: AIAS-BSR
- **Project ID**: aias-bsr
- **Project number**: 78055223814
- **Parent org/folder in GCP**: aias.org
- **Web API Key**: AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ

## Authentication Method

The website uses **Google Sign-in** as the sole authentication method through Firebase Authentication.

## Firebase Configuration

The Firebase configuration is already set up in the following files:
- `js/firebase-config.js` - Configuration file
- `login.html` - Login page with Google Sign-in
- `signup.html` - Signup page with Google Sign-in
- `admin-dashboard.html` - Admin dashboard with Firebase auth check
- `js/auth.js` - Authentication state management

## Admin Access Control

Admin access is controlled through Firestore in the `config/admins` document, which contains a list of admin email addresses.

To add or remove admin users:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `aias-bsr`
3. Go to Firestore Database
4. Navigate to `config` collection → `admins` document
5. Edit the `admins` array field to add or remove email addresses
6. Click "Update"

The document structure:
```
config/admins
  └── admins: ["mklkoklpp@gmail.com", "basrah@aias.org"]
```

## User Flow

### Regular Users
1. Click "Sign in with Google" or "Sign up with Google"
2. Authenticate with their Google account
3. Upon successful authentication, user data is stored in Firebase Firestore
4. Users are redirected to the home page

### Admin Users
1. Same authentication process as regular users
2. After authentication, the system checks if the user's email is in the admin list
3. Admin users are redirected to the admin dashboard
4. Non-admin users are redirected to the home page

## Firebase Services Used

### 1. Firebase Authentication
- Provider: Google Sign-in
- All users authenticate through their Google accounts
- No email/password authentication is available

### 2. Firebase Firestore
Firestore stores both user data and all website content:

**User Data:**
```javascript
users/{uid}/
  - email: string
  - displayName: string
  - photoURL: string
  - createdAt: ISO timestamp
  - lastLogin: ISO timestamp
```

**Website Content:**
```javascript
config/
  └── admins (admin email list)

content/
  ├── home (home page content)
  ├── magazine (magazine articles and releases)
  ├── education (education content)
  └── about (about page content)

events/{eventId}/ (event documents)

library/{itemId}/ (library resource documents)
```

## Setting Up Firebase (For Developers)

### Prerequisites
```bash
npm install -g firebase-tools
```

### Login to Firebase
```bash
firebase login
```

### Initialize Firebase (if needed)
```bash
firebase init
```

Select:
- Authentication
- Firestore

### Enable Google Sign-in Provider

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the project: `aias-bsr`
3. Go to Authentication > Sign-in method
4. Enable "Google" as a sign-in provider
5. Configure the OAuth consent screen if needed

### Firestore Rules

The Firestore security rules are defined in `firestore.rules`. These rules ensure:
- Public read access to all content
- Admin-only write access to content
- Users can only read/write their own profile data

See `firestore.rules` for the complete rule set.

### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

## Testing Locally

1. Start a local web server:
```bash
python3 -m http.server 8080
# or
npx http-server
```

2. Navigate to `http://localhost:8080/login.html`
3. Click "Sign in with Google"
4. Authenticate with a Google account
5. Verify you're redirected appropriately based on admin status

## Production Deployment

The website is deployed as a static site. Firebase configuration is embedded in the HTML files, so no additional Firebase hosting setup is required unless you want to use Firebase Hosting.

### Optional: Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

## Troubleshooting

### Pop-up Blocked
If the Google Sign-in popup is blocked:
- Allow pop-ups in your browser for the site
- Try again

### Authentication Fails
- Check that the Firebase API key is correct
- Verify Google Sign-in is enabled in Firebase Console
- Check browser console for detailed error messages

### Admin Access Denied
- Verify the user's email is in Firestore `config/admins` document
- Email addresses are case-insensitive
- Make sure the admin list is accessible in Firestore

## Security Notes

1. **API Key**: The Firebase API key is public and safe to expose in client-side code
2. **Security Rules**: Firestore security rules control access to data
3. **Admin Check**: Admin access is verified both client-side and should be verified server-side for sensitive operations
4. **HTTPS**: Always use HTTPS in production to protect authentication tokens

## Support

For issues or questions, contact the AIAS Basra Chapter team.
