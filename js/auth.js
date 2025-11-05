// Authentication check for protected pages with Firebase integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ",
    authDomain: "aias-bsr.firebaseapp.com",
    projectId: "aias-bsr",
    storageBucket: "aias-bsr.firebasestorage.app",
    messagingSenderId: "78055223814",
    appId: "1:78055223814:web:99460402c2b1fcd5ae8987",
    measurementId: "G-6W50T4HXDV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

(function() {
    const PASSWORD_PAGE = 'password.html';
    const LOGIN_PAGE = 'login.html';
    const SIGNUP_PAGE = 'signup.html';
    const ADMIN_PAGE = 'admin-dashboard.html';
    
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop();
    
    // Don't check authentication on these pages
    const publicPages = [PASSWORD_PAGE, LOGIN_PAGE, SIGNUP_PAGE];
    if (publicPages.includes(currentPage)) {
        return;
    }
    
    // Check Firebase authentication state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in with Firebase
            localStorage.setItem('aias_authenticated', 'true');
            localStorage.setItem('aias_user_email', user.email);
            localStorage.setItem('aias_user_name', user.displayName || '');
            localStorage.setItem('aias_user_picture', user.photoURL || '');
            localStorage.setItem('aias_user_uid', user.uid);
            
            // Check admin status if on admin page
            if (currentPage === ADMIN_PAGE) {
                const isAdmin = await checkIfAdmin(user.email);
                localStorage.setItem('aias_is_admin', isAdmin.toString());
                
                if (!isAdmin) {
                    alert('Access denied. Admin privileges required.');
                    window.location.href = 'index.html';
                }
            }
        } else {
            // No Firebase user, check legacy authentication
            const legacyAuth = localStorage.getItem('aias_authenticated');
            const sessionAuth = sessionStorage.getItem('aias_authenticated');
            
            if (legacyAuth !== 'true' && sessionAuth !== 'true') {
                // Not authenticated, redirect to password page (legacy) or login
                window.location.href = PASSWORD_PAGE;
            }
        }
    });
    
    async function checkIfAdmin(email) {
        try {
            // Import Firestore functions
            const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const db = getFirestore(app);
            
            // Fetch admin list from Firestore
            const adminDoc = await getDoc(doc(db, 'config', 'admins'));
            if (adminDoc.exists()) {
                const data = adminDoc.data();
                return data.admins && data.admins.includes(email.toLowerCase());
            }
            return false;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }
})();
