// Authentication check for protected pages with Firebase integration
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { clearAccessSession, getAdminAccess, persistAccessSession } from "./rbac.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAvPMOgz1w7SFylBY8cmn9nf9GQvn-IRNI",
    authDomain: "space-42d87.firebaseapp.com",
    projectId: "space-42d87",
    storageBucket: "space-42d87.firebasestorage.app",
    messagingSenderId: "658382934950",
    appId: "1:658382934950:web:c61b6fa237b203e6bf7567",
    measurementId: "G-Q7Y482TMEY"
};

// Initialize Firebase (with error handling for multiple initializations)
let app;
try {
    app = getApp();
} catch (error) {
    app = initializeApp(firebaseConfig);
}
const auth = getAuth(app);
const db = getFirestore(app);

function hasFirebaseSession() {
    try {
        return Object.keys(localStorage).some((key) => key.startsWith('firebase:authUser:'));
    } catch (error) {
        return false;
    }
}

function setElementVisibility(element, visible, displayWhenVisible) {
    if (!element) return;

    if (!visible) {
        element.style.display = 'none';
        return;
    }

    if (displayWhenVisible) {
        element.style.display = displayWhenVisible;
        return;
    }

    if (element.tagName === 'LI') {
        element.style.display = 'list-item';
    } else if (element.tagName === 'A') {
        element.style.display = 'inline-block';
    } else {
        element.style.display = 'block';
    }
}

function updateNavigationAuthUI() {
    const isAuthenticated =
        localStorage.getItem('aias_authenticated') === 'true' ||
        sessionStorage.getItem('aias_authenticated') === 'true' ||
        hasFirebaseSession();
    const isAdmin = localStorage.getItem('aias_is_admin') === 'true';
    const userName = localStorage.getItem('aias_user_name');
    const userEmail = localStorage.getItem('aias_user_email');

    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const userProfile = document.getElementById('userProfile');
    const userNameElement = document.getElementById('userName');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const hasUserProfileNav = !!userProfile;

    if (isAuthenticated) {
        setElementVisibility(loginBtn, false);
        setElementVisibility(signupBtn, false);
        setElementVisibility(userProfile, true, 'flex');
        setElementVisibility(dashboardBtn, isAdmin);
        if (!hasUserProfileNav) {
            setElementVisibility(logoutBtn, true);
        }

        if (userNameElement) {
            const displayName = userName || userEmail || 'User';
            userNameElement.textContent = displayName;
            const logoutTrigger = logoutBtn?.matches('a') ? logoutBtn : logoutBtn?.querySelector('a');
            if (logoutTrigger) logoutTrigger.dataset.userName = displayName;
        }
    } else {
        setElementVisibility(loginBtn, true);
        setElementVisibility(signupBtn, true);
        setElementVisibility(userProfile, false);
        setElementVisibility(dashboardBtn, false);
        if (!hasUserProfileNav) {
            setElementVisibility(logoutBtn, false);
        }
    }
}

function clearLocalAuthState(clearSession = false) {
    localStorage.removeItem('aias_authenticated');
    localStorage.removeItem('aias_user_email');
    localStorage.removeItem('aias_user_name');
    localStorage.removeItem('aias_user_picture');
    clearAccessSession();
    localStorage.removeItem('aias_user_uid');
    localStorage.removeItem('aias_visitor_mode');
    if (clearSession) {
        sessionStorage.removeItem('aias_authenticated');
    }
}

function bindLogoutHandler() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    const logoutTrigger = logoutBtn.matches('a') ? logoutBtn : (logoutBtn.querySelector('a') || logoutBtn);
    if (!logoutTrigger || logoutTrigger.dataset.authBound === 'true') return;

    logoutTrigger.dataset.authBound = 'true';
    logoutTrigger.addEventListener('click', async (event) => {
        event.preventDefault();

        try {
            const { signOut } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
            await signOut(auth);
        } catch (error) {
            console.error('Firebase sign-out failed, continuing with local cleanup:', error);
        }

        clearLocalAuthState(true);
        window.dispatchEvent(new CustomEvent('aias-auth-state-updated'));
        window.location.href = '/';
    });
}

function syncAuthUI() {
    bindLogoutHandler();
    updateNavigationAuthUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAuthUI);
} else {
    syncAuthUI();
}

window.addEventListener('aias-auth-state-updated', syncAuthUI);

(function() {
    const LOGIN_PAGE = 'login.html';
    const ADMIN_PAGE = 'admin-dashboard.html';
    
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop();
    
    function notifyAuthStateUpdated() {
        window.dispatchEvent(new CustomEvent('aias-auth-state-updated'));
    }
    
    // Check Firebase authentication state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let access;
            try { access = await getAdminAccess(db, user.email || ''); }
            catch (error) { console.error('Error checking admin access:', error); access = { allowed:false, isSuperAdmin:false, permissions:[] }; }

            // User is signed in with Firebase
            localStorage.setItem('aias_authenticated', 'true');
            localStorage.setItem('aias_user_email', user.email);
            localStorage.setItem('aias_user_name', user.displayName || '');
            localStorage.setItem('aias_user_picture', user.photoURL || '');
            localStorage.setItem('aias_user_uid', user.uid);
            persistAccessSession(access);
            localStorage.setItem('aias_visitor_mode', 'false');
            notifyAuthStateUpdated();
            syncAuthUI();
            
            // Protect admin page for admin users only
            if (currentPage === ADMIN_PAGE && !access.allowed) {
                window.location.href = '/';
            }
        } else {
            // Keep local auth markers in sync when Firebase user is signed out
            clearLocalAuthState();
            notifyAuthStateUpdated();
            syncAuthUI();

            // Protect admin page for signed-out users
            if (currentPage === ADMIN_PAGE) {
                window.location.href = LOGIN_PAGE;
            }
        }
    });
    
})();
