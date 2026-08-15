# AIAS Basra Android — Firebase setup

## Registered Android identity

- Firebase project: `space-42d87`
- Android package / application ID: `com.aiasbsr.community`
- Firebase Android app ID: `1:658382934950:android:134cf25e3c61733cbf7567`
- Community website: `https://space-42d87.web.app`
- Config file location: `androidApp/google-services.json`

The package name is case-sensitive and must remain exactly the same in Firebase and `androidApp/build.gradle.kts`.

## Debug signing fingerprints

- SHA-1: `CB:0A:1F:5A:92:B2:62:56:31:A3:A0:7B:86:E5:34:75:20:B5:95:74`
- SHA-256: `2B:8A:6C:47:CD:F3:4D:D2:AB:CE:7E:7F:8D:01:9D:09:63:21:29:1E:49:5A:41:D8:D5:16:46:44:A2:D8:65:BD`

These are development fingerprints from `C:\Users\bnnbl\.android\debug.keystore`. A release keystore and Google Play App Signing will have different fingerprints; add those to Firebase before publishing.

## Firebase Console steps

1. Open Firebase Console and select `space-42d87`.
2. Open **Project settings → General → Your apps**.
3. Select the Android app with package `com.aiasbsr.community`.
4. Under **SHA certificate fingerprints**, add both debug SHA values above.
5. Download a fresh `google-services.json` after changing the fingerprints and replace `androidApp/google-services.json`.
6. Open **Build → Authentication → Sign-in method** and enable **Email/Password**.
7. Open **Build → Firestore Database** and confirm it is the same database used by the website.
8. Deploy the Saray Community backend rules from its website project folder when rule changes are ready:

   ```powershell
   firebase deploy --only firestore:rules,storage,functions
   ```

## Build and verify

From the `AIASBasrah` project root:

```powershell
.\gradlew.bat :androidApp:signingReport
.\gradlew.bat :androidApp:lintDebug :androidApp:assembleDebug
```

The debug APK is generated at:

`androidApp/build/outputs/apk/debug/androidApp-debug.apk`

## Verified Community links

The Android manifest accepts legacy Community links on `www.aiasbsr.com` and current links on `space-42d87.web.app`. For Android to mark current links as verified, host this file at:

`https://space-42d87.web.app/.well-known/assetlinks.json`

Use the release or Google Play App Signing SHA-256 in production:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aiasbsr.community",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_RELEASE_OR_PLAY_SHA_256"
      ]
    }
  }
]
```
