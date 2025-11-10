/**
 * Enhanced Navigation Components
 * Mega menu, search, and breadcrumb functionality
 */

// ========================================
// SEARCH FUNCTIONALITY
// ========================================

class SiteSearch {
    constructor() {
        this.searchData = [];
        this.init();
    }
    
    init() {
        this.setupSearchModal();
        this.loadSearchData();
    }
    
    setupSearchModal() {
        const searchTrigger = document.getElementById('searchTrigger');
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('siteSearchInput');
        
        if (searchTrigger) {
            searchTrigger.addEventListener('click', () => {
                this.openSearch();
            });
        }
        
        if (searchModal) {
            searchModal.addEventListener('click', (e) => {
                if (e.target === searchModal) {
                    this.closeSearch();
                }
            });
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeSearch();
                }
            });
        }
        
        // Keyboard shortcut: Ctrl+K or Cmd+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openSearch();
            }
        });
    }
    
    openSearch() {
        const searchModal = document.getElementById('searchModal');
        const searchInput = document.getElementById('siteSearchInput');
        
        if (searchModal) {
            searchModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }
    
    closeSearch() {
        const searchModal = document.getElementById('searchModal');
        
        if (searchModal) {
            searchModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    async loadSearchData() {
        // Build search index from existing pages
        this.searchData = [
            { title: 'Home', url: 'index.html', type: 'page', description: 'Welcome to AIAS Basra Chapter' },
            { title: 'Events', url: 'events.html', type: 'page', description: 'Upcoming and past chapter events' },
            { title: 'Education', url: 'education.html', type: 'page', description: 'Educational programs and workshops' },
            { title: 'Freedom By Design', url: 'fbd.html', type: 'page', description: 'Community service design projects' },
            { title: 'Library', url: 'library.html', type: 'page', description: 'Resource repository and downloads' },
            { title: 'Magazine', url: 'magazine.html', type: 'page', description: 'Articles and publications' },
            { title: 'About Us', url: 'about.html', type: 'page', description: 'Learn about AIAS Basra Chapter' },
            { title: 'Gallery', url: 'gallery.html', type: 'page', description: 'Photo gallery of chapter activities' }
        ];
        
        // In a real implementation, this would fetch from Firestore or a search index
    }
    
    handleSearch(query) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer) return;
        
        if (!query || query.trim().length < 2) {
            suggestionsContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-light);">Type to search...</div>';
            return;
        }
        
        const results = this.search(query);
        
        if (results.length === 0) {
            suggestionsContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-light);">No results found</div>';
            return;
        }
        
        suggestionsContainer.innerHTML = results.map(result => `
            <a href="${result.url}" class="search-suggestion">
                <div class="search-suggestion-title">${this.highlightMatch(result.title, query)}</div>
                <div class="search-suggestion-meta">${result.type} • ${result.description}</div>
            </a>
        `).join('');
    }
    
    search(query) {
        const lowerQuery = query.toLowerCase();
        
        return this.searchData.filter(item => {
            return item.title.toLowerCase().includes(lowerQuery) ||
                   item.description.toLowerCase().includes(lowerQuery) ||
                   item.type.toLowerCase().includes(lowerQuery);
        }).slice(0, 8); // Limit to 8 results
    }
    
    highlightMatch(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }
}

// ========================================
// BREADCRUMB NAVIGATION
// ========================================

class BreadcrumbNav {
    constructor() {
        this.init();
    }
    
    init() {
        this.generateBreadcrumbs();
    }
    
    generateBreadcrumbs() {
        const breadcrumbNav = document.getElementById('breadcrumbNav');
        if (!breadcrumbNav) return;
        
        const path = window.location.pathname;
        const breadcrumbs = this.parsePath(path);
        
        breadcrumbNav.innerHTML = breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return `
                <div class="breadcrumb-item">
                    ${!isLast && index > 0 ? '<span class="breadcrumb-separator">›</span>' : ''}
                    <a href="${crumb.url}">${crumb.label}</a>
                </div>
            `;
        }).join('');
    }
    
    parsePath(path) {
        const breadcrumbs = [
            { label: 'Home', url: 'index.html' }
        ];
        
        // Map of page names to their parent categories
        const pageMap = {
            'events.html': { label: 'Events', parent: 'Programs' },
            'education.html': { label: 'Education', parent: 'Programs' },
            'fbd.html': { label: 'Freedom By Design', parent: 'Programs' },
            'library.html': { label: 'Library', parent: 'Resources' },
            'magazine.html': { label: 'Magazine', parent: 'Resources' },
            'articles.html': { label: 'Article', parent: 'Magazine' },
            'about.html': { label: 'About Us', parent: null },
            'gallery.html': { label: 'Gallery', parent: 'About' }
        };
        
        const filename = path.split('/').pop();
        const pageInfo = pageMap[filename];
        
        if (pageInfo) {
            if (pageInfo.parent) {
                breadcrumbs.push({
                    label: pageInfo.parent,
                    url: '#'
                });
            }
            breadcrumbs.push({
                label: pageInfo.label,
                url: filename
            });
        }
        
        return breadcrumbs;
    }
}

// ========================================
// MEGA MENU FUNCTIONALITY
// ========================================

class MegaMenu {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupMegaMenus();
        this.setupMobileMenu();
    }
    
    setupMegaMenus() {
        const megaMenuTriggers = document.querySelectorAll('[data-mega-menu]');
        
        megaMenuTriggers.forEach(trigger => {
            const menuId = trigger.dataset.megaMenu;
            const menu = document.getElementById(menuId);
            
            if (menu) {
                // Desktop: hover behavior
                if (window.innerWidth > 768) {
                    trigger.addEventListener('mouseenter', () => {
                        this.showMegaMenu(menu);
                    });
                    
                    trigger.addEventListener('mouseleave', () => {
                        this.hideMegaMenu(menu);
                    });
                    
                    menu.addEventListener('mouseenter', () => {
                        this.showMegaMenu(menu);
                    });
                    
                    menu.addEventListener('mouseleave', () => {
                        this.hideMegaMenu(menu);
                    });
                } else {
                    // Mobile: click behavior
                    trigger.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.toggleMegaMenu(menu);
                    });
                }
            }
        });
    }
    
    showMegaMenu(menu) {
        menu.style.opacity = '1';
        menu.style.visibility = 'visible';
    }
    
    hideMegaMenu(menu) {
        menu.style.opacity = '0';
        menu.style.visibility = 'hidden';
    }
    
    toggleMegaMenu(menu) {
        const isVisible = menu.style.visibility === 'visible';
        
        if (isVisible) {
            this.hideMegaMenu(menu);
        } else {
            // Hide all other mega menus first
            document.querySelectorAll('.mega-menu').forEach(m => {
                if (m !== menu) this.hideMegaMenu(m);
            });
            this.showMegaMenu(menu);
        }
    }
    
    setupMobileMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const navLinks = document.getElementById('navLinks');
        
        if (menuToggle && navLinks) {
            menuToggle.addEventListener('click', () => {
                menuToggle.classList.toggle('active');
                navLinks.classList.toggle('active');
                document.body.classList.toggle('menu-open');
            });
        }
    }
}

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize search
    window.siteSearch = new SiteSearch();
    
    // Initialize breadcrumbs
    if (document.getElementById('breadcrumbNav')) {
        window.breadcrumbNav = new BreadcrumbNav();
    }
    
    // Initialize mega menus
    window.megaMenu = new MegaMenu();
});
