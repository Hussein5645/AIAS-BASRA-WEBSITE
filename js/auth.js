// Authentication check for protected pages
(function() {
    const SESSION_KEY = 'aias_authenticated';
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
    
    // Check if user is authenticated (now using localStorage for persistent login)
    if (localStorage.getItem(SESSION_KEY) !== 'true') {
        // Redirect to password page first (legacy behavior)
        const legacyAuth = sessionStorage.getItem('aias_authenticated');
        if (!legacyAuth) {
            window.location.href = PASSWORD_PAGE;
        }
    }
    
    // If on admin page, verify admin status
    if (currentPage === ADMIN_PAGE) {
        const isAdmin = localStorage.getItem('aias_is_admin') === 'true';
        if (!isAdmin) {
            alert('Access denied. Admin privileges required.');
            window.location.href = 'index.html';
        }
    }
})();
