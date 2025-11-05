// Authentication check for protected pages
(function() {
    const SESSION_KEY = 'aias_authenticated';
    const PASSWORD_PAGE = 'password.html';
    
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop();
    
    // Don't check authentication on password page itself
    if (currentPage === PASSWORD_PAGE) {
        return;
    }
    
    // Check if user is authenticated
    if (sessionStorage.getItem(SESSION_KEY) !== 'true') {
        // Redirect to password page
        window.location.href = PASSWORD_PAGE;
    }
})();
