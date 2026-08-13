import {initializeApp, getApp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {getFunctions, httpsCallable} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import {getStorage} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

export const firebaseConfig = Object.freeze({
  apiKey:'AIzaSyAvPMOgz1w7SFylBY8cmn9nf9GQvn-IRNI',
  authDomain:'space-42d87.firebaseapp.com',
  projectId:'space-42d87',
  storageBucket:'space-42d87.firebasestorage.app',
  messagingSenderId:'658382934950',
  appId:'1:658382934950:web:c61b6fa237b203e6bf7567',
  measurementId:'G-Q7Y482TMEY'
});

let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }

export {app};
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
const communityCompatibilityOperations = Object.freeze({
  requestMainThreadPostingAccess:'request_main_thread_access',
  reviewMainThreadPostingAccess:'review_main_thread_access',
  setCommunitySpaceVisibility:'set_space_visibility',
  moderateCommunitySpacePost:'moderate_space_post',
  warnCommunitySpaceMember:'warn_space_member'
});
export const callFunction = (name, data = {}) => {
  const operation = communityCompatibilityOperations[name];
  return httpsCallable(functions, operation ? 'setCommunitySpaceConnection' : name)(operation ? {...data, operation} : data).then(result => result.data);
};
