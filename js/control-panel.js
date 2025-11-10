/**
 * Unified Control Panel for Content Filtering, Sorting, and View Options
 * Implements grid/list view toggle, sorting, and faceted filtering
 */

class ContentControlPanel {
    constructor(options = {}) {
        this.container = options.container || '.content-grid';
        this.items = options.items || [];
        this.currentView = options.defaultView || 'grid';
        this.currentSort = options.defaultSort || 'newest';
        this.activeFilters = {
            categories: [],
            tags: []
        };
        
        this.init();
    }
    
    init() {
        this.setupViewToggle();
        this.setupSort();
        this.setupFilters();
        this.setupSearch();
        this.render();
    }
    
    /**
     * View Toggle (Grid/List)
     */
    setupViewToggle() {
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.setView(view);
            });
        });
    }
    
    setView(view) {
        this.currentView = view;
        const container = document.querySelector(this.container);
        const viewBtns = document.querySelectorAll('.view-btn');
        
        // Update active button
        viewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Update container class
        if (view === 'list') {
            container.classList.add('list-view');
        } else {
            container.classList.remove('list-view');
        }
        
        // Save preference
        localStorage.setItem('preferredView', view);
    }
    
    /**
     * Sorting
     */
    setupSort() {
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.sortAndRender();
            });
        }
    }
    
    sortItems() {
        const sorted = [...this.items];
        
        switch(this.currentSort) {
            case 'newest':
                sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'oldest':
                sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'popular':
                sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
                break;
            case 'title':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
        }
        
        return sorted;
    }
    
    /**
     * Filtering
     */
    setupFilters() {
        // Filter button toggle
        const filterBtn = document.getElementById('filterBtn');
        const filterPanel = document.getElementById('filterPanel');
        const filterOverlay = document.getElementById('filterOverlay');
        const filterClose = document.getElementById('filterClose');
        
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.toggleFilterPanel(true);
            });
        }
        
        if (filterClose) {
            filterClose.addEventListener('click', () => {
                this.toggleFilterPanel(false);
            });
        }
        
        if (filterOverlay) {
            filterOverlay.addEventListener('click', () => {
                this.toggleFilterPanel(false);
            });
        }
        
        // Filter checkboxes
        const filterCheckboxes = document.querySelectorAll('.filter-checkbox input');
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleFilterChange(e.target);
            });
        });
        
        // Clear filters button
        const clearBtn = document.getElementById('clearFilters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }
        
        // Apply filters button (for mobile)
        const applyBtn = document.getElementById('applyFilters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.toggleFilterPanel(false);
                this.sortAndRender();
            });
        }
    }
    
    toggleFilterPanel(show) {
        const filterPanel = document.getElementById('filterPanel');
        const filterOverlay = document.getElementById('filterOverlay');
        const filterBtn = document.getElementById('filterBtn');
        
        if (show) {
            filterPanel.classList.add('active');
            filterOverlay.classList.add('active');
            filterBtn.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            filterPanel.classList.remove('active');
            filterOverlay.classList.remove('active');
            filterBtn.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    handleFilterChange(checkbox) {
        const filterType = checkbox.dataset.filterType; // 'category' or 'tag'
        const filterValue = checkbox.value;
        
        if (checkbox.checked) {
            if (filterType === 'category') {
                this.activeFilters.categories.push(filterValue);
            } else if (filterType === 'tag') {
                this.activeFilters.tags.push(filterValue);
            }
        } else {
            if (filterType === 'category') {
                this.activeFilters.categories = this.activeFilters.categories.filter(v => v !== filterValue);
            } else if (filterType === 'tag') {
                this.activeFilters.tags = this.activeFilters.tags.filter(v => v !== filterValue);
            }
        }
        
        this.updateFilterBadge();
        this.updateActiveFiltersDisplay();
        this.sortAndRender();
    }
    
    clearAllFilters() {
        this.activeFilters.categories = [];
        this.activeFilters.tags = [];
        
        // Uncheck all checkboxes
        const checkboxes = document.querySelectorAll('.filter-checkbox input');
        checkboxes.forEach(cb => cb.checked = false);
        
        this.updateFilterBadge();
        this.updateActiveFiltersDisplay();
        this.sortAndRender();
    }
    
    updateFilterBadge() {
        const filterBadge = document.getElementById('filterBadge');
        const totalFilters = this.activeFilters.categories.length + this.activeFilters.tags.length;
        
        if (filterBadge) {
            if (totalFilters > 0) {
                filterBadge.textContent = totalFilters;
                filterBadge.style.display = 'inline-block';
            } else {
                filterBadge.style.display = 'none';
            }
        }
    }
    
    updateActiveFiltersDisplay() {
        const container = document.getElementById('activeFilters');
        if (!container) return;
        
        container.innerHTML = '';
        
        const allFilters = [
            ...this.activeFilters.categories.map(v => ({ type: 'category', value: v })),
            ...this.activeFilters.tags.map(v => ({ type: 'tag', value: v }))
        ];
        
        if (allFilters.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';
        
        allFilters.forEach(filter => {
            const tag = document.createElement('div');
            tag.className = 'active-filter-tag';
            tag.innerHTML = `
                ${filter.value}
                <button onclick="controlPanel.removeFilter('${filter.type}', '${filter.value}')">×</button>
            `;
            container.appendChild(tag);
        });
    }
    
    removeFilter(type, value) {
        if (type === 'category') {
            this.activeFilters.categories = this.activeFilters.categories.filter(v => v !== value);
        } else if (type === 'tag') {
            this.activeFilters.tags = this.activeFilters.tags.filter(v => v !== value);
        }
        
        // Uncheck the corresponding checkbox
        const checkbox = document.querySelector(`.filter-checkbox input[value="${value}"]`);
        if (checkbox) checkbox.checked = false;
        
        this.updateFilterBadge();
        this.updateActiveFiltersDisplay();
        this.sortAndRender();
    }
    
    filterItems() {
        let filtered = [...this.items];
        
        // Apply category filters
        if (this.activeFilters.categories.length > 0) {
            filtered = filtered.filter(item => 
                this.activeFilters.categories.includes(item.category)
            );
        }
        
        // Apply tag filters
        if (this.activeFilters.tags.length > 0) {
            filtered = filtered.filter(item => 
                item.tags && item.tags.some(tag => this.activeFilters.tags.includes(tag))
            );
        }
        
        return filtered;
    }
    
    /**
     * Search
     */
    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value.toLowerCase();
                    this.sortAndRender();
                }, 300); // Debounce search
            });
        }
    }
    
    searchItems(items) {
        if (!this.searchQuery || this.searchQuery.trim() === '') {
            return items;
        }
        
        return items.filter(item => 
            item.title.toLowerCase().includes(this.searchQuery) ||
            (item.description && item.description.toLowerCase().includes(this.searchQuery)) ||
            (item.category && item.category.toLowerCase().includes(this.searchQuery))
        );
    }
    
    /**
     * Render
     */
    sortAndRender() {
        let items = this.filterItems();
        items = this.searchItems(items);
        items = this.sortItems();
        this.render(items);
        this.updateResultsCount(items.length);
    }
    
    updateResultsCount(count) {
        const resultsInfo = document.getElementById('resultsInfo');
        if (resultsInfo) {
            resultsInfo.innerHTML = `Showing <span class="results-count">${count}</span> of ${this.items.length} items`;
        }
    }
    
    render(items = this.items) {
        const container = document.querySelector(this.container);
        if (!container) return;
        
        // Show loading state
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        
        // Simulate async rendering
        setTimeout(() => {
            if (items.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <h3 class="empty-state-title">No items found</h3>
                        <p class="empty-state-description">Try adjusting your filters or search query</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = items.map(item => this.renderItem(item)).join('');
        }, 100);
    }
    
    renderItem(item) {
        // Override this method to customize item rendering
        return `
            <div class="content-card" data-id="${item.id}">
                <div class="content-card-image">
                    <img src="${item.image || 'placeholder.jpg'}" alt="${item.title}">
                </div>
                <div class="content-card-body">
                    <h3 class="content-card-title">${item.title}</h3>
                    <p class="content-card-description">${item.description || ''}</p>
                    <div class="content-card-meta">
                        <span class="content-card-category">${item.category}</span>
                        <span class="content-card-date">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Public API
     */
    setItems(items) {
        this.items = items;
        this.sortAndRender();
    }
    
    addItem(item) {
        this.items.push(item);
        this.sortAndRender();
    }
    
    removeItem(id) {
        this.items = this.items.filter(item => item.id !== id);
        this.sortAndRender();
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentControlPanel;
}
