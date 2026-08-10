(function () {
    const SEARCH_DATA = [
        { title: 'Home', titleAr: 'الرئيسية', url: 'index.html', type: 'Page', typeAr: 'صفحة', description: 'Welcome to AIAS Basra Chapter', descriptionAr: 'مرحباً بكم في فرع AIAS البصرة', keywords: 'aias basra welcome' },
        { title: 'Events', titleAr: 'الفعاليات', url: 'events.html', type: 'Page', typeAr: 'صفحة', description: 'Upcoming and past chapter events', descriptionAr: 'الفعاليات القادمة والسابقة', keywords: 'workshop lecture activity calendar' },
        { title: 'Freedom By Design', titleAr: 'الحرية من خلال التصميم', url: 'fbd.html', type: 'Page', typeAr: 'صفحة', description: 'Community service design projects', descriptionAr: 'مشاريع التصميم وخدمة المجتمع', keywords: 'community projects service fbd' },
        { title: 'Library', titleAr: 'المكتبة', url: 'library.html', type: 'Page', typeAr: 'صفحة', description: 'Resource repository and downloads', descriptionAr: 'مصادر وملفات للقراءة والتحميل', keywords: 'resources books documents downloads' },
        { title: '3D Models', titleAr: 'النماذج ثلاثية الأبعاد', url: '3d-models.html', type: 'Page', typeAr: 'صفحة', description: 'Browse and preview uploaded 3D models', descriptionAr: 'تصفح واعرض النماذج ثلاثية الأبعاد', keywords: '3d glb model viewer architecture' },
        { title: 'Magazine', titleAr: 'المجلة', url: 'magazine.html', type: 'Page', typeAr: 'صفحة', description: 'Articles and publications', descriptionAr: 'المقالات والمنشورات', keywords: 'articles publications magazine news' },
        { title: 'About Us', titleAr: 'من نحن', url: 'about.html', type: 'Page', typeAr: 'صفحة', description: 'Learn about AIAS Basra Chapter', descriptionAr: 'تعرف على فرع AIAS البصرة', keywords: 'mission vision values team chapter' },
        { title: 'Gallery', titleAr: 'المعرض', url: 'gallery.html', type: 'Page', typeAr: 'صفحة', description: 'Photo gallery of chapter activities', descriptionAr: 'صور أنشطة وفعاليات الفرع', keywords: 'photos images pictures activities' },
        { title: 'Articles', titleAr: 'المقالات', url: 'articles.html', type: 'Page', typeAr: 'صفحة', description: 'Read full articles and join the discussion', descriptionAr: 'اقرأ المقالات كاملة وشارك في النقاش', keywords: 'article comments vote upvote downvote' }
    ];
    let dynamicSearchData = [];
    SEARCH_DATA.push(
        { title: 'Community', titleAr: 'Community', url: 'community.html', type: 'Page', typeAr: 'Page', description: 'Text posts, profiles, discussions and project submissions', descriptionAr: 'Text posts, profiles, discussions and project submissions', keywords: 'community posts profile discussion behance projects' },
        { title: 'Selected Projects', titleAr: 'Selected Projects', url: 'community-projects.html', type: 'Page', typeAr: 'Page', description: 'Selected community design work', descriptionAr: 'Selected community design work', keywords: 'community selected projects behance' }
    );

    function getSearchLanguage() {
        return localStorage.getItem('language') === 'ar' ? 'ar' : 'en';
    }

    function normalizeSearchText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }

    function escapeHTML(value) {
        return String(value || '').replace(/[&<>'"]/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
        });
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getCurrentFile() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop();
        return filename || 'index.html';
    }

    function applyShellLanguage(lang) {
        const language = lang === 'ar' ? 'ar' : 'en';
        localStorage.setItem('language', language);
        document.documentElement.lang = language;
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.body.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
        const currentLang = document.getElementById('currentLang');
        if (currentLang) currentLang.textContent = language === 'ar' ? 'AR' : 'EN';

        document.querySelectorAll('[data-en][data-ar]').forEach(element => {
            const value = element.getAttribute(`data-${language}`);
            if (!value) return;
            if (element.matches('input, textarea')) element.placeholder = value;
            else if (element.children.length === 0) element.textContent = value;
            else {
                const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
                if (textNode) textNode.textContent = value;
            }
        });
    }

    function setupShellLanguage() {
        // main.js owns the shared toggle when it is present. Standalone pages
        // such as the model listing still receive the same language behavior.
        if (typeof window.setLanguage === 'function') {
            window.setLanguage(localStorage.getItem('language') || 'en');
            return;
        }
        window.setLanguage = applyShellLanguage;
        window.applyTranslations = () => applyShellLanguage(localStorage.getItem('language') || 'en');
        applyShellLanguage(localStorage.getItem('language') || 'en');
        const toggle = document.getElementById('languageToggle');
        if (toggle && toggle.dataset.langBound !== 'true') {
            toggle.dataset.langBound = 'true';
            toggle.addEventListener('click', () => {
                const next = (localStorage.getItem('language') || 'en') === 'ar' ? 'en' : 'ar';
                applyShellLanguage(next);
            });
        }
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
                    <button class="menu-toggle" id="menuToggle" type="button" aria-label="Open navigation menu" aria-controls="navLinks" aria-expanded="false">
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                    <ul class="nav-links" id="navLinks">
                        <li class="nav-item"><a href="#" data-mega-menu="communityMegaMenu" class="shell-link-community" data-en="Community" data-ar="Community">Community</a><div class="mega-menu" id="communityMegaMenu"><div class="mega-menu-content"><div class="mega-menu-section"><h3>Community</h3><a href="community.html" class="mega-menu-link"><div class="mega-menu-icon">Discuss</div><div class="mega-menu-link-content"><div class="mega-menu-link-title">Community Home</div><div class="mega-menu-link-desc">Write text posts and join discussions</div></div></a><a href="community-projects.html" class="mega-menu-link"><div class="mega-menu-icon">Projects</div><div class="mega-menu-link-content"><div class="mega-menu-link-title">Selected Projects</div><div class="mega-menu-link-desc">Curated Behance work from members</div></div></a><a href="magazine.html" class="mega-menu-link"><div class="mega-menu-icon">Read</div><div class="mega-menu-link-content"><div class="mega-menu-link-title">AIAS Magazine</div><div class="mega-menu-link-desc">Read chapter articles and publications</div></div></a></div></div></div></li>
                        <li class="nav-item"><a href="index.html" class="shell-link-home" data-en="Home" data-ar="الرئيسية">Home</a></li>

                        <li class="nav-item">
                            <a href="#" data-mega-menu="programsMegaMenu" class="shell-link-programs" data-en="Programs" data-ar="البرامج">Programs</a>
                            <div class="mega-menu" id="programsMegaMenu">
                                <div class="mega-menu-content">
                                    <div class="mega-menu-section">
                                        <h3 data-en="Get Involved" data-ar="شارك معنا">Get Involved</h3>
                                        <a href="events.html" class="mega-menu-link shell-link-events">
                                            <div class="mega-menu-icon">📅</div>
                                            <div class="mega-menu-link-content">
                                            <div class="mega-menu-link-title" data-en="Events" data-ar="الفعاليات">Events</div>
                                            <div class="mega-menu-link-desc" data-en="Workshops, meetings, and competitions" data-ar="ورش العمل والاجتماعات والمسابقات">Workshops, meetings, and competitions</div>
                                            </div>
                                        </a>
                                        <a href="fbd.html" class="mega-menu-link shell-link-fbd">
                                            <div class="mega-menu-icon">🏗️</div>
                                            <div class="mega-menu-link-content">
                                            <div class="mega-menu-link-title" data-en="Freedom By Design" data-ar="الحرية بالتصميم">Freedom By Design</div>
                                            <div class="mega-menu-link-desc" data-en="Community service projects" data-ar="مشاريع خدمة المجتمع">Community service projects</div>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </li>

                        <li class="nav-item">
                            <a href="#" data-mega-menu="resourcesMegaMenu" class="shell-link-resources" data-en="Resources" data-ar="الموارد">Resources</a>
                            <div class="mega-menu" id="resourcesMegaMenu">
                                <div class="mega-menu-content">
                                    <div class="mega-menu-section">
                                        <h3 data-en="Learn & Explore" data-ar="تعلّم واستكشف">Learn & Explore</h3>
                                        <a href="library.html" class="mega-menu-link shell-link-library">
                                            <div class="mega-menu-icon">📚</div>
                                            <div class="mega-menu-link-content">
                                            <div class="mega-menu-link-title" data-en="Library" data-ar="المكتبة">Library</div>
                                            <div class="mega-menu-link-desc" data-en="Books, guides, and templates" data-ar="كتب وأدلة وقوالب">Books, guides, and templates</div>
                                            </div>
                                        </a>
                                        <a href="3d-models.html" class="mega-menu-link shell-link-models3d">
                                            <div class="mega-menu-icon">🧊</div>
                                            <div class="mega-menu-link-content">
                                            <div class="mega-menu-link-title" data-en="3D Models" data-ar="نماذج ثلاثية الأبعاد">3D Models</div>
                                            <div class="mega-menu-link-desc" data-en="Preview and open chapter model viewer files" data-ar="عاين ملفات النماذج وافتحها في العارض">Preview and open chapter model viewer files</div>
                                            </div>
                                        </a>
                                        <a href="magazine.html" class="mega-menu-link shell-link-magazine">
                                            <div class="mega-menu-icon">📰</div>
                                            <div class="mega-menu-link-content">
                                            <div class="mega-menu-link-title" data-en="Magazine" data-ar="المجلة">Magazine</div>
                                            <div class="mega-menu-link-desc" data-en="Articles and publications" data-ar="المقالات والمنشورات">Articles and publications</div>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </li>

                        <li class="nav-item">
                            <a href="#" class="shell-link-about" data-en="About" data-ar="من نحن">About</a>
                            <div class="dropdown-menu">
                                <a href="about.html" class="shell-link-about-page" data-en="About Us" data-ar="من نحن">About Us</a>
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
            <div class="search-modal-content" role="dialog" aria-modal="true" aria-labelledby="siteSearchTitle">
                <div class="search-modal-header">
                    <div>
                        <p class="search-eyebrow" data-en="SITE SEARCH" data-ar="بحث الموقع">SITE SEARCH</p>
                        <h2 id="siteSearchTitle" data-en="Find something quickly" data-ar="ابحث بسرعة">Find something quickly</h2>
                    </div>
                    <button class="search-close" id="searchClose" type="button" aria-label="Close search">×</button>
                </div>
                <div class="search-input-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                        type="text"
                        id="siteSearchInput"
                        placeholder="Search pages, events, articles..."
                        data-en="Search pages, events, articles..."
                        data-ar="ابحث في الصفحات والفعاليات والمقالات..."
                        autocomplete="off"
                        aria-label="Search the website"
                    >
                    <button class="search-clear" id="searchClear" type="button" aria-label="Clear search" hidden>×</button>
                </div>
                <div class="search-suggestions" id="searchSuggestions">
                    <div class="search-empty-state" data-en="Start typing to search pages, articles, events, and resources." data-ar="ابدأ بالكتابة للبحث في الصفحات والمقالات والفعاليات والمصادر.">Start typing to search pages, articles, events, and resources.</div>
                </div>
                <div class="search-footer"><span id="searchResultCount"></span><span data-en="↑ ↓ to move · Enter to open · Esc to close" data-ar="↑ ↓ للتنقل · Enter للفتح · Esc للإغلاق">↑ ↓ to move · Enter to open · Esc to close</span></div>
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

        const setMenuState = function (open) {
            menuToggle.classList.toggle('active', open);
            navLinks.classList.toggle('active', open);
            menuToggle.setAttribute('aria-expanded', String(open));
            menuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
            document.body.classList.toggle('menu-open', open);
        };

        menuToggle.addEventListener('click', function () {
            setMenuState(!navLinks.classList.contains('active'));
        });

        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                // Mega-menu triggers open a submenu; they should not close the drawer.
                if (link.hasAttribute('data-mega-menu') || link.getAttribute('href') === '#') return;
                setMenuState(false);
            });
        });

        document.addEventListener('click', function (event) {
            if (window.innerWidth > 768) {
                return;
            }

            const clickedInsideNav = event.target.closest('.nav-content');
            if (navLinks.classList.contains('active') && !clickedInsideNav) {
                setMenuState(false);
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && navLinks.classList.contains('active')) setMenuState(false);
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) {
                setMenuState(false);
                document.querySelectorAll('.nav-item.open').forEach(function (item) {
                    item.classList.remove('open');
                });
            }
        });
    }

    function setupMegaMenu() {
        const megaMenuTriggers = document.querySelectorAll('[data-mega-menu], .shell-link-about');

        megaMenuTriggers.forEach(function (trigger) {
            const menuId = trigger.getAttribute('data-mega-menu');
            const menu = (menuId && document.getElementById(menuId)) || trigger.parentElement.querySelector('.mega-menu, .dropdown-menu');

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
        let safeText = escapeHTML(text);
        const terms = String(query).trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
        terms.forEach(function (term) {
            if (term.length < 2) return;
            safeText = safeText.replace(new RegExp(`(${escapeRegExp(escapeHTML(term))})`, 'giu'), '<strong>$1</strong>');
        });
        return safeText;
    }

    function searchData(query) {
        const language = getSearchLanguage();
        const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
        const data = SEARCH_DATA.concat(dynamicSearchData);
        return data.map(function (item) {
            const title = language === 'ar' ? (item.titleAr || item.title) : item.title;
            const description = language === 'ar' ? (item.descriptionAr || item.description) : item.description;
            const searchable = normalizeSearchText([item.title, item.titleAr, item.description, item.descriptionAr, item.keywords, item.type, item.typeAr].join(' '));
            const titleSearch = normalizeSearchText([item.title, item.titleAr].join(' '));
            if (!terms.every(term => searchable.includes(term))) return null;

            let score = 0;
            terms.forEach(function (term) {
                if (titleSearch === term) score += 100;
                else if (titleSearch.startsWith(term)) score += 60;
                else if (titleSearch.includes(term)) score += 35;
                else score += 10;
            });
            return { ...item, displayTitle: title, displayDescription: description, displayType: language === 'ar' ? (item.typeAr || item.type) : item.type, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score || a.displayTitle.localeCompare(b.displayTitle)).slice(0, 12);
    }

    async function loadDynamicSearchData() {
        try {
            const moduleUrl = new URL('js/data-loader.js', document.baseURI).href;
            const dataLoaderModule = await import(moduleUrl);
            const result = await dataLoaderModule.default.fetchData();
            if (!result.success) return;

            const content = result.data || {};
            const toText = value => Array.isArray(value) ? value.map(toText).join(' ') : (value && typeof value === 'object' ? Object.values(value).map(toText).join(' ') : String(value || ''));
            const makeItems = function (items, config) {
                return (Array.isArray(items) ? items : []).map(function (item) {
                    const title = item[config.title] || item.name || item.title || item.code || 'Untitled';
                    const searchableFields = Object.entries(item)
                        .filter(([key]) => !/(image|base64|chunk|filedata)/i.test(key))
                        .map(([, value]) => toText(value))
                        .filter(Boolean)
                        .join(' ');
                    const description = [searchableFields, item.description, item.about, item.location, item.type, item.category, item.tags].map(toText).filter(Boolean).join(' ');
                    return {
                        title: String(title),
                        titleAr: String(item.titleAr || item.nameAr || title),
                        description: description || config.description,
                        descriptionAr: String(item.descriptionAr || description || config.description),
                        type: config.type,
                        typeAr: config.typeAr,
                        keywords: [config.keywords, description].join(' '),
                        url: config.url(item)
                    };
                });
            };

            dynamicSearchData = [
                ...makeItems(content.events, { title: 'title', type: 'Event', typeAr: 'فعالية', description: 'Chapter event', keywords: 'event workshop activity', url: () => 'events.html' }),
                ...makeItems(content.library, { title: 'title', type: 'Resource', typeAr: 'مصدر', description: 'Library resource', keywords: 'library resource book guide', url: () => 'library.html' }),
                ...makeItems(content.magazine?.articles, { title: 'title', type: 'Article', typeAr: 'مقال', description: 'Article and publication', keywords: 'article publication magazine', url: item => `articles.html?id=${encodeURIComponent(item.id || '')}` }),
                ...makeItems(content.education?.fbd?.events, { title: 'title', type: 'FBD Event', typeAr: 'فعالية FBD', description: 'Freedom By Design project', keywords: 'fbd community project', url: () => 'fbd.html' }),
                ...makeItems(content.models3d, { title: 'name', type: '3D Model', typeAr: 'نموذج ثلاثي الأبعاد', description: 'Uploaded 3D model', keywords: '3d glb model viewer', url: () => '3d-models.html' })
            ];
            document.dispatchEvent(new CustomEvent('aias-search-index-ready', { detail: { count: dynamicSearchData.length } }));
        } catch (error) {
            console.warn('[Site Search] Dynamic Firestore index unavailable; using page index.', error);
        }
    }

    function setupSearch() {
        const searchTrigger = document.getElementById('searchTrigger');
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('siteSearchInput');
        const suggestions = document.getElementById('searchSuggestions');
        const searchClose = document.getElementById('searchClose');
        const searchClear = document.getElementById('searchClear');
        const resultCount = document.getElementById('searchResultCount');
        let selectedResult = -1;

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
            selectedResult = -1;
        };

        const renderSearch = function (query) {
            const language = getSearchLanguage();
            const emptyText = language === 'ar' ? 'ابدأ بالكتابة للبحث في الصفحات والمقالات والفعاليات والمصادر.' : 'Start typing to search pages, articles, events, and resources.';
            const noResultsText = language === 'ar' ? 'لم يتم العثور على نتائج. جرّب كلمات أخرى.' : 'No results found. Try different keywords.';
            searchClear.hidden = !query;
            selectedResult = -1;

            if (query.length < 2) {
                suggestions.innerHTML = `<div class="search-empty-state">${emptyText}</div>`;
                resultCount.textContent = '';
                return;
            }

            const results = searchData(query);
            resultCount.textContent = results.length ? `${results.length} ${language === 'ar' ? 'نتيجة' : (results.length === 1 ? 'result' : 'results')}` : '';
            if (!results.length) {
                suggestions.innerHTML = `<div class="search-empty-state">${noResultsText}</div>`;
                return;
            }

            suggestions.innerHTML = results.map(function (result, index) {
                return `<a href="${escapeHTML(result.url)}" class="search-suggestion" data-search-index="${index}">
                    <div class="search-suggestion-title">${highlightMatch(result.displayTitle, query)}</div>
                    <div class="search-suggestion-meta"><span class="search-result-type">${escapeHTML(result.displayType)}</span></div>
                </a>`;
            }).join('');
        };

        searchTrigger.addEventListener('click', openSearch);
        if (searchClose) searchClose.addEventListener('click', closeSearch);
        if (searchClear) searchClear.addEventListener('click', function () {
            searchInput.value = '';
            renderSearch('');
            searchInput.focus();
        });

        searchModal.addEventListener('click', function (event) {
            if (event.target === searchModal) {
                closeSearch();
            }
        });

        searchInput.addEventListener('input', function (event) {
            const query = event.target.value.trim();
            renderSearch(query);
            return;

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
            const resultLinks = Array.from(suggestions.querySelectorAll('.search-suggestion'));
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!resultLinks.length) return;
                selectedResult = event.key === 'ArrowDown'
                    ? (selectedResult + 1) % resultLinks.length
                    : (selectedResult - 1 + resultLinks.length) % resultLinks.length;
                resultLinks.forEach((link, index) => link.classList.toggle('is-selected', index === selectedResult));
                resultLinks[selectedResult].scrollIntoView({ block: 'nearest' });
                return;
            }
            if (event.key === 'Enter' && selectedResult >= 0 && resultLinks[selectedResult]) {
                event.preventDefault();
                resultLinks[selectedResult].click();
                return;
            }
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

        loadDynamicSearchData();
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

        if (currentFile === 'community.html' || currentFile === 'community-projects.html') {
            setActive('.shell-link-community');
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
        setupShellLanguage();
        window.dispatchEvent(new CustomEvent('aias-site-shell-ready'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSiteShell);
    } else {
        initSiteShell();
    }
})();
