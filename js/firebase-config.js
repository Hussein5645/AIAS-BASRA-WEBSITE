// Firebase Configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ",
  authDomain: "aias-bsr.firebaseapp.com",
  projectId: "aias-bsr",
  storageBucket: "aias-bsr.firebasestorage.app",
  messagingSenderId: "78055223814",
  appId: "1:78055223814:web:99460402c2b1fcd5ae8987",
  measurementId: "G-6W50T4HXDV"
};

// Log Firebase configuration (without sensitive data)
console.log('[Firebase Config] Initializing with:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
