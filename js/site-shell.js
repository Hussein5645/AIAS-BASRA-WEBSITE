(function () {
    const SEARCH_DATA = [
        { title: 'Home', url: 'index.html', type: 'page', description: 'Welcome to AIAS Basra Chapter' },
        { title: 'Events', url: 'events.html', type: 'page', description: 'Upcoming and past chapter events' },
        { title: 'Freedom By Design', url: 'fbd.html', type: 'page', description: 'Community service design projects' },
        { title: 'Library', url: 'library.html', type: 'page', description: 'Resource repository and downloads' },
        { title: '3D Models', url: '3d-models.html', type: 'page', description: 'Browse and preview uploaded 3D models' },
        { title: 'Magazine', url: 'magazine.html', type: 'page', description: 'Articles and publications' },
        { title: 'About Us', url: 'about.html', type: 'page', description: 'Learn about AIAS Basra Chapter' },
        { title: 'Gallery', url: 'gallery.html', type: 'page', description: 'Photo gallery of chapter activities' }
    ];

    function getCurrentFile() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop();
        return filename || 'index.html';
    }

    function ensureNavigationStyles() {
        if (!document.querySelector('link[href="css/navigation.css"]')) {
            const navStyles = document.createElement('link');
            navStyles.rel = 'stylesheet';
            navStyles.href = 'css/navigation.css';
            document.head.appendChild(navStyles);
        }

        if (!document.querySelector('link[href="css/mobile-optimized.css"]')) {
            const mobileStyles = document.createElement('link');
            mobileStyles.rel = 'stylesheet';
            mobileStyles.href = 'css/mobile-optimized.css';
            document.head.appendChild(mobileStyles);
        }
    }

    function ensureFallbackBaseStyles() {
        if (document.querySelector('link[href="css/style.css"]')) {
            return;
        }

        if (document.getElementById('site-shell-fallback-styles')) {
            return;
        }

        const fallbackStyles = document.createElement('style');
        fallbackStyles.id = 'site-shell-fallback-styles';
        fallbackStyles.textContent = `
            :root {
                --primary-color: #661F22;
                --secondary-color: #F0DAA1;
                --accent-color: #764ba2;
                --text-primary: #1a202c;
                --text-secondary: #4a5568;
                --text-light: #718096;
                --white: #ffffff;
                --light-bg: #f8fafc;
                --gradient-1: linear-gradient(135deg, #661F22 0%, #764ba2 100%);
            }

            .navbar {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                z-index: 1000;
                background: rgba(255, 255, 255, 0.98);
                border-bottom: 1px solid #e2e8f0;
                backdrop-filter: blur(10px);
            }

            .site-shell-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 1.5rem;
            }

            .nav-content {
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 70px;
            }

            .logo {
                display: flex;
                align-items: center;
                gap: 0.65rem;
                font-weight: 700;
                color: var(--primary-color);
            }

            .logo img {
                width: 40px;
                height: 40px;
                object-fit: contain;
            }

            .menu-toggle {
                display: none;
                background: none;
                border: none;
                cursor: pointer;
            }

            .menu-toggle span {
                display: block;
                width: 22px;
                height: 2px;
                margin: 4px 0;
                background: var(--primary-color);
            }

            .nav-links {
                display: flex;
                list-style: none;
                align-items: center;
                gap: 0.4rem;
                margin: 0;
                padding: 0;
            }

            body.site-shell-offset {
                padding-top: 78px;
            }

            @media (max-width: 768px) {
                .menu-toggle {
                    display: block;
                }

                .nav-links {
                    display: none;
                    position: absolute;
                    top: 70px;
                    left: 0;
                    right: 0;
                    background: #fff;
                    border-top: 1px solid #e2e8f0;
                    flex-direction: column;
                    align-items: stretch;
                    padding: 1rem;
                    gap: 0.5rem;
                }

                .nav-links.active {
                    display: flex;
                }
            }
        `;

        document.head.appendChild(fallbackStyles);
    }

    function buildNavbarMarkup() {
        return `
            <div class="site-shell-container">
                <div class="nav-content">
                    <div class="logo">
                        <img src="static/images/branding/LOGO.png" alt="AIAS Basra Logo">
                        <span>AIAS Basra</span>
                    </div>
                    <button class="menu-toggle" id="menuToggle">
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                    <ul class="nav-links" id="navLinks">
                        <li class="nav-item"><a href="index.html" class="shell-link-home">Home</a></li>

                        <li class="nav-item">
                            <a href="#" data-mega-menu="programsMegaMenu" class="shell-link-programs">Programs</a>
                            <div class="mega-menu" id="programsMegaMenu">
                                <div class="mega-menu-content">
                                    <div class="mega-menu-section">
                                        <h3>Get Involved</h3>
                                        <a href="events.html" class="mega-menu-link shell-link-events">
                                            <div class="mega-menu-icon">📅</div>
                                            <div class="mega-menu-link-content">
                                                <div class="mega-menu-link-title">Events</div>
                                                <div class="mega-menu-link-desc">Workshops, meetings, and competitions</div>
                                            </div>
                                        </a>
                                        <a href="fbd.html" class="mega-menu-link shell-link-fbd">
                                            <div class="mega-menu-icon">🏗️</div>
                                            <div class="mega-menu-link-content">
                                                <div class="mega-menu-link-title">Freedom By Design</div>
                                                <div class="mega-menu-link-desc">Community service projects</div>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </li>

                        <li class="nav-item">
                            <a href="#" data-mega-menu="resourcesMegaMenu" class="shell-link-resources">Resources</a>
                            <div class="mega-menu" id="resourcesMegaMenu">
                                <div class="mega-menu-content">
                                    <div class="mega-menu-section">
                                        <h3>Learn & Explore</h3>
                                        <a href="library.html" class="mega-menu-link shell-link-library">
                                            <div class="mega-menu-icon">📚</div>
                                            <div class="mega-menu-link-content">
                                                <div class="mega-menu-link-title">Library</div>
                                                <div class="mega-menu-link-desc">Books, guides, and templates</div>
                                            </div>
                                        </a>
                                        <a href="3d-models.html" class="mega-menu-link shell-link-models3d">
                                            <div class="mega-menu-icon">🧊</div>
                                            <div class="mega-menu-link-content">
                                                <div class="mega-menu-link-title">3D Models</div>
                                                <div class="mega-menu-link-desc">Preview and open chapter model viewer files</div>
                                            </div>
                                        </a>
                                        <a href="magazine.html" class="mega-menu-link shell-link-magazine">
                                            <div class="mega-menu-icon">📰</div>
                                            <div class="mega-menu-link-content">
                                                <div class="mega-menu-link-title">Magazine</div>
                                                <div class="mega-menu-link-desc">Articles and publications</div>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </li>

                        <li class="nav-item">
                            <a href="#" class="shell-link-about">About</a>
                            <div class="dropdown-menu">
                                <a href="about.html" class="shell-link-about-page">About Us</a>
                            </div>
                        </li>

                        <li class="header-search">
                            <button class="search-trigger" id="searchTrigger" type="button">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <path d="m21 21-4.35-4.35"></path>
                                </svg>
                                <span>Search...</span>
                            </button>
                        </li>

                        <li>
                            <button class="language-toggle" id="languageToggle" type="button" aria-label="Change language">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                </svg>
                                <span id="currentLang">EN</span>
                            </button>
                        </li>

                        <li id="dashboardBtn" style="display: none;">
                            <a href="admin-dashboard.html" class="nav-btn nav-btn-signup" data-en="Dashboard" data-ar="لوحة التحكم">Dashboard</a>
                        </li>
                        <li id="loginBtn">
                            <a href="login.html" class="nav-btn nav-btn-login" data-en="Login" data-ar="تسجيل الدخول">Login</a>
                        </li>
                        <li id="userProfile" style="display: none; align-items: center; gap: 10px;">
                            <span id="userName" style="color: #667eea; font-weight: 600;" data-en="User" data-ar="المستخدم">User</span>
                            <a href="#" id="logoutBtn" class="nav-btn nav-btn-login" data-en="Logout" data-ar="تسجيل الخروج">Logout</a>
                        </li>

                    </ul>
                </div>
            </div>
        `;
    }

    function ensureSearchModal() {
        if (document.getElementById('searchModal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'search-modal';
        modal.id = 'searchModal';
        modal.innerHTML = `
            <div class="search-modal-content">
                <div class="search-input-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                        type="text"
                        id="siteSearchInput"
                        placeholder="Search pages, events, articles..."
                        autocomplete="off"
                    >
                </div>
                <div class="search-suggestions" id="searchSuggestions">
                    <div style="padding: 2rem; text-align: center; color: var(--text-light);">Type to search...</div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    function setupMobileMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const navLinks = document.getElementById('navLinks');

        if (!menuToggle || !navLinks) {
            return;
        }

        menuToggle.addEventListener('click', function () {
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });

        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.classList.remove('menu-open');
            });
        });

        document.addEventListener('click', function (event) {
            if (window.innerWidth > 768) {
                return;
            }

            const clickedInsideNav = event.target.closest('.nav-content');
            if (navLinks.classList.contains('active') && !clickedInsideNav) {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.classList.remove('menu-open');
                document.querySelectorAll('.nav-item.open').forEach(function (item) {
                    item.classList.remove('open');
                });
            }
        });
    }

    function setupMegaMenu() {
        const megaMenuTriggers = document.querySelectorAll('[data-mega-menu]');

        megaMenuTriggers.forEach(function (trigger) {
            const menuId = trigger.getAttribute('data-mega-menu');
            const menu = document.getElementById(menuId);

            if (!menu) {
                return;
            }

            if (window.innerWidth > 768) {
                trigger.addEventListener('mouseenter', function () {
                    menu.style.opacity = '1';
                    menu.style.visibility = 'visible';
                });

                trigger.addEventListener('mouseleave', function () {
                    menu.style.opacity = '0';
                    menu.style.visibility = 'hidden';
                });

                menu.addEventListener('mouseenter', function () {
                    menu.style.opacity = '1';
                    menu.style.visibility = 'visible';
                });

                menu.addEventListener('mouseleave', function () {
                    menu.style.opacity = '0';
                    menu.style.visibility = 'hidden';
                });
            } else {
                trigger.addEventListener('click', function (event) {
                    event.preventDefault();
                    const parentItem = trigger.closest('.nav-item');
                    if (!parentItem) {
                        return;
                    }

                    const isOpen = parentItem.classList.contains('open');
                    document.querySelectorAll('.nav-item.open').forEach(function (item) {
                        item.classList.remove('open');
                    });

                    if (!isOpen) {
                        parentItem.classList.add('open');
                    }
                });
            }
        });
    }

    function highlightMatch(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    function searchData(query) {
        const lowerQuery = query.toLowerCase();
        return SEARCH_DATA.filter(function (item) {
            return item.title.toLowerCase().includes(lowerQuery) ||
                item.description.toLowerCase().includes(lowerQuery) ||
                item.type.toLowerCase().includes(lowerQuery);
        }).slice(0, 8);
    }

    function setupSearch() {
        const searchTrigger = document.getElementById('searchTrigger');
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('siteSearchInput');
        const suggestions = document.getElementById('searchSuggestions');

        if (!searchTrigger || !searchModal || !searchInput || !suggestions) {
            return;
        }

        const openSearch = function () {
            searchModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            setTimeout(function () {
                searchInput.focus();
            }, 100);
        };

        const closeSearch = function () {
            searchModal.classList.remove('active');
            document.body.style.overflow = '';
        };

        searchTrigger.addEventListener('click', openSearch);

        searchModal.addEventListener('click', function (event) {
            if (event.target === searchModal) {
                closeSearch();
            }
        });

        searchInput.addEventListener('input', function (event) {
            const query = event.target.value.trim();

            if (query.length < 2) {
                suggestions.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-light);">Type to search...</div>';
                return;
            }

            const results = searchData(query);
            if (!results.length) {
                suggestions.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-light);">No results found</div>';
                return;
            }

            suggestions.innerHTML = results.map(function (result) {
                return `
                    <a href="${result.url}" class="search-suggestion">
                        <div class="search-suggestion-title">${highlightMatch(result.title, query)}</div>
                        <div class="search-suggestion-meta">${result.type} • ${result.description}</div>
                    </a>
                `;
            }).join('');
        });

        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeSearch();
            }
        });

        document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                openSearch();
            }

            if (event.key === 'Escape' && searchModal.classList.contains('active')) {
                closeSearch();
            }
        });
    }

    function markActiveLinks() {
        const currentFile = getCurrentFile();
        const setActive = function (selector) {
            const element = document.querySelector(selector);
            if (element) {
                element.classList.add('active');
            }
        };

        if (currentFile === 'index.html') {
            setActive('.shell-link-home');
            return;
        }

        if (currentFile === 'events.html') {
            setActive('.shell-link-programs');
            setActive('.shell-link-events');
            return;
        }

        if (currentFile === 'fbd.html') {
            setActive('.shell-link-programs');
            setActive('.shell-link-fbd');
            return;
        }

        if (currentFile === 'library.html') {
            setActive('.shell-link-resources');
            setActive('.shell-link-library');
            return;
        }

        if (currentFile === '3d-models.html') {
            setActive('.shell-link-resources');
            setActive('.shell-link-models3d');
            return;
        }

        if (currentFile === 'magazine.html' || currentFile === 'articles.html') {
            setActive('.shell-link-resources');
            setActive('.shell-link-magazine');
            return;
        }

        if (currentFile === 'about.html') {
            setActive('.shell-link-about');
            setActive('.shell-link-about-page');
            return;
        }

        if (currentFile === 'gallery.html') {
            setActive('.shell-link-about');
        }
    }

    function initSiteShell() {
        let navbar = document.getElementById('navbar');

        if (!navbar) {
            navbar = document.createElement('nav');
            navbar.className = 'navbar';
            navbar.id = 'navbar';
            document.body.insertBefore(navbar, document.body.firstChild);
            document.body.classList.add('site-shell-offset');
        }

        ensureFallbackBaseStyles();
        ensureNavigationStyles();
        navbar.innerHTML = buildNavbarMarkup();
        ensureSearchModal();
        setupMobileMenu();
        setupMegaMenu();
        setupSearch();
        markActiveLinks();
        window.dispatchEvent(new CustomEvent('aias-site-shell-ready'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSiteShell);
    } else {
        initSiteShell();
    }
})();
