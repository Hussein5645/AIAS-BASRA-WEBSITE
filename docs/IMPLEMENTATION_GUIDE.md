# Implementation Guide - Navigation & Control Panel

## Overview
This guide explains how to implement the enhanced navigation and content control panel components on AIAS Basra website pages.

## Component Files

### CSS Files
1. `css/navigation.css` - Mega menu, search, breadcrumbs
2. `css/control-panel.css` - Filtering, sorting, view toggle

### JavaScript Files
1. `js/navigation.js` - Search, breadcrumbs, mega menu functionality
2. `js/control-panel.js` - Content filtering and view management

## Implementation Steps

### Step 1: Enhanced Navigation Header

Add to your HTML `<head>`:
```html
<link rel="stylesheet" href="css/navigation.css">
```

Add before closing `</body>`:
```html
<script src="js/navigation.js"></script>
```

### Step 2: Update Navigation HTML

Replace the existing navigation with:

```html
<nav class="navbar" id="navbar">
    <div class="container">
        <div class="nav-content">
            <!-- Logo -->
            <div class="logo">
                <img src="static/images/branding/LOGO.png" alt="AIAS Basra Logo">
                <span>AIAS Basra</span>
            </div>
            
            <!-- Mobile Menu Toggle -->
            <button class="menu-toggle" id="menuToggle">
                <span></span>
                <span></span>
                <span></span>
            </button>
            
            <!-- Main Navigation -->
            <ul class="nav-links" id="navLinks">
                <li class="nav-item"><a href="index.html">Home</a></li>
                
                <!-- Programs (Mega Menu) -->
                <li class="nav-item" data-mega-menu="programsMegaMenu">
                    <a href="#">Programs</a>
                    <div class="mega-menu" id="programsMegaMenu">
                        <div class="mega-menu-content">
                            <div class="mega-menu-section">
                                <h3>Get Involved</h3>
                                <a href="events.html" class="mega-menu-link">
                                    <div class="mega-menu-icon">📅</div>
                                    <div class="mega-menu-link-content">
                                        <div class="mega-menu-link-title">Events</div>
                                        <div class="mega-menu-link-desc">Workshops, meetings, and competitions</div>
                                    </div>
                                </a>
                                <a href="education.html" class="mega-menu-link">
                                    <div class="mega-menu-icon">🎓</div>
                                    <div class="mega-menu-link-content">
                                        <div class="mega-menu-link-title">Education</div>
                                        <div class="mega-menu-link-desc">Learning programs and courses</div>
                                    </div>
                                </a>
                                <a href="fbd.html" class="mega-menu-link">
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
                
                <!-- Resources (Mega Menu) -->
                <li class="nav-item" data-mega-menu="resourcesMegaMenu">
                    <a href="#">Resources</a>
                    <div class="mega-menu" id="resourcesMegaMenu">
                        <div class="mega-menu-content">
                            <div class="mega-menu-section">
                                <h3>Learn & Explore</h3>
                                <a href="library.html" class="mega-menu-link">
                                    <div class="mega-menu-icon">📚</div>
                                    <div class="mega-menu-link-content">
                                        <div class="mega-menu-link-title">Library</div>
                                        <div class="mega-menu-link-desc">Books, guides, and templates</div>
                                    </div>
                                </a>
                                <a href="magazine.html" class="mega-menu-link">
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
                
                <!-- About (Dropdown) -->
                <li class="nav-item">
                    <a href="#">About</a>
                    <div class="dropdown-menu">
                        <a href="about.html">About Us</a>
                        <a href="gallery.html">Gallery</a>
                    </div>
                </li>
                
                <!-- Utility Navigation -->
                <li class="header-search">
                    <button class="search-trigger" id="searchTrigger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <span>Search...</span>
                    </button>
                </li>
                
                <!-- CTA Button -->
                <li class="nav-cta">
                    <a href="signup.html" class="btn-cta">Join Us</a>
                </li>
            </ul>
        </div>
    </div>
</nav>

<!-- Search Modal -->
<div class="search-modal" id="searchModal">
    <div class="search-modal-content">
        <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
            <input 
                type="text" 
                id="siteSearchInput" 
                placeholder="Search pages, events, articles..."
                autocomplete="off"
            >
        </div>
        <div class="search-suggestions" id="searchSuggestions"></div>
    </div>
</div>
<div class="filter-overlay" id="searchOverlay"></div>
```

### Step 3: Add Breadcrumb Navigation

Add after the navbar, before main content:

```html
<div class="breadcrumb">
    <div class="container">
        <nav class="breadcrumb-nav" id="breadcrumbNav">
            <!-- Auto-generated by JavaScript -->
        </nav>
    </div>
</div>
```

### Step 4: Implement Control Panel for Content Pages

Add to HTML `<head>`:
```html
<link rel="stylesheet" href="css/control-panel.css">
```

Add before closing `</body>`:
```html
<script src="js/control-panel.js"></script>
```

Add control panel HTML before your content grid:

```html
<section class="content-section">
    <div class="container">
        <!-- Control Panel -->
        <div class="control-panel">
            <div class="control-panel-top">
                <div class="control-panel-left">
                    <!-- View Toggle -->
                    <div class="view-toggle">
                        <button class="view-btn active" data-view="grid">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="7" height="7"/>
                                <rect x="14" y="3" width="7" height="7"/>
                                <rect x="3" y="14" width="7" height="7"/>
                                <rect x="14" y="14" width="7" height="7"/>
                            </svg>
                            <span>Grid</span>
                        </button>
                        <button class="view-btn" data-view="list">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="8" y1="6" x2="21" y2="6"/>
                                <line x1="8" y1="12" x2="21" y2="12"/>
                                <line x1="8" y1="18" x2="21" y2="18"/>
                                <line x1="3" y1="6" x2="3.01" y2="6"/>
                                <line x1="3" y1="12" x2="3.01" y2="12"/>
                                <line x1="3" y1="18" x2="3.01" y2="18"/>
                            </svg>
                            <span>List</span>
                        </button>
                    </div>
                    
                    <!-- Sort Dropdown -->
                    <div class="sort-dropdown">
                        <label class="sort-label" for="sortSelect">Sort by:</label>
                        <select id="sortSelect" class="sort-select">
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="popular">Most Popular</option>
                            <option value="title">Title (A-Z)</option>
                        </select>
                    </div>
                </div>
                
                <div class="control-panel-right">
                    <!-- Filter Button -->
                    <button class="filter-btn" id="filterBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                        </svg>
                        Filters
                        <span class="filter-badge" id="filterBadge" style="display: none;">0</span>
                    </button>
                </div>
            </div>
            
            <!-- Active Filters -->
            <div class="active-filters" id="activeFilters" style="display: none;"></div>
        </div>
        
        <!-- Results Info -->
        <div class="results-info" id="resultsInfo">
            Loading...
        </div>
        
        <!-- Content Grid -->
        <div class="content-grid" id="contentGrid">
            <!-- Items will be rendered here by JavaScript -->
        </div>
    </div>
</section>

<!-- Filter Panel (Sidebar) -->
<div class="filter-overlay" id="filterOverlay"></div>
<div class="filter-panel" id="filterPanel">
    <div class="filter-panel-header">
        <h3 class="filter-panel-title">Filter Content</h3>
        <button class="filter-close" id="filterClose">&times;</button>
    </div>
    
    <div class="filter-panel-content">
        <!-- Categories -->
        <div class="filter-group">
            <div class="filter-group-title">Categories</div>
            <div class="filter-option">
                <label class="filter-checkbox">
                    <input type="checkbox" data-filter-type="category" value="Books">
                    <span class="checkmark"></span>
                </label>
                <span class="filter-label">Books</span>
                <span class="filter-count">(12)</span>
            </div>
            <div class="filter-option">
                <label class="filter-checkbox">
                    <input type="checkbox" data-filter-type="category" value="Guides">
                    <span class="checkmark"></span>
                </label>
                <span class="filter-label">Guides</span>
                <span class="filter-count">(8)</span>
            </div>
            <!-- Add more categories -->
        </div>
        
        <!-- Tags -->
        <div class="filter-group">
            <div class="filter-group-title">Tags</div>
            <div class="filter-option">
                <label class="filter-checkbox">
                    <input type="checkbox" data-filter-type="tag" value="Design">
                    <span class="checkmark"></span>
                </label>
                <span class="filter-label">Design</span>
                <span class="filter-count">(15)</span>
            </div>
            <!-- Add more tags -->
        </div>
    </div>
    
    <div class="filter-panel-footer">
        <button class="btn-clear-filters" id="clearFilters">Clear All</button>
        <button class="btn-apply-filters" id="applyFilters">Apply</button>
    </div>
</div>
```

### Step 5: Initialize Control Panel with JavaScript

Add custom initialization script:

```html
<script>
    // Initialize control panel with your data
    const controlPanel = new ContentControlPanel({
        container: '#contentGrid',
        defaultView: 'grid',
        defaultSort: 'newest'
    });
    
    // Set items (example - replace with your actual data)
    const items = [
        {
            id: 1,
            title: 'Architecture Design Basics',
            description: 'Essential guide for beginners',
            category: 'Books',
            tags: ['Design', 'Education'],
            date: '2024-01-15',
            image: 'path/to/image.jpg',
            views: 150
        },
        // Add more items...
    ];
    
    controlPanel.setItems(items);
    
    // Optionally override the render method for custom card design
    controlPanel.renderItem = function(item) {
        return `
            <div class="content-card">
                <div class="content-card-image" style="background-image: url('${item.image}')"></div>
                <div class="content-card-body">
                    <h3>${item.title}</h3>
                    <p>${item.description}</p>
                    <span class="category-badge">${item.category}</span>
                </div>
            </div>
        `;
    };
</script>
```

## Usage Examples

### Library Page
- Grid/List view toggle for resources
- Filter by category (Books, Guides, Templates, Research)
- Sort by newest/popular

### Magazine Page
- Grid/List view for articles
- Filter by tags and categories
- Search articles by title/content

### Events Page
- Grid/List view for events
- Filter by status (Upcoming, Past, Registered)
- Sort by date

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Fallbacks for older browsers included
- Mobile-responsive design

## Accessibility Features

- Keyboard navigation support (Tab, Enter, Escape)
- ARIA labels for screen readers
- Focus management for modals
- Semantic HTML structure

## Performance Considerations

- Debounced search input (300ms)
- Lazy loading for images in grid
- CSS transitions optimized for 60fps
- Minimal JavaScript dependencies
