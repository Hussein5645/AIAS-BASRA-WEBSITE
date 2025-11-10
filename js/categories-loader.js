// Categories Loader - Load category definitions from data.json
// This ensures all categories are centrally managed in JSON configuration

class CategoriesLoader {
    constructor() {
        this.cache = null;
        this.dataPath = 'data/data.json';
    }

    /**
     * Load categories from data.json
     */
    async loadCategories() {
        if (this.cache) {
            console.log('[Categories] Returning cached categories');
            return this.cache;
        }

        try {
            console.log('[Categories] Loading categories from', this.dataPath);
            const response = await fetch(this.dataPath);
            
            if (!response.ok) {
                throw new Error(`Failed to load categories: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.categories) {
                console.warn('[Categories] No categories found in data.json, using defaults');
                this.cache = this.getDefaultCategories();
            } else {
                this.cache = data.categories;
                console.log('[Categories] ✓ Categories loaded successfully');
            }
            
            return this.cache;
        } catch (error) {
            console.error('[Categories] ✗ Error loading categories:', error);
            console.warn('[Categories] Falling back to default categories');
            this.cache = this.getDefaultCategories();
            return this.cache;
        }
    }

    /**
     * Get default categories as fallback
     */
    getDefaultCategories() {
        return {
            magazine: [
                { en: 'Design', ar: 'التصميم' },
                { en: 'Sustainability', ar: 'الاستدامة' },
                { en: 'Technology', ar: 'التكنولوجيا' },
                { en: 'History', ar: 'التاريخ' },
                { en: 'Inspiration', ar: 'الإلهام' },
                { en: 'Community', ar: 'المجتمع' }
            ],
            library: {
                basic: [
                    { value: 'file', label: { en: 'File', ar: 'ملف' } },
                    { value: 'lecture', label: { en: 'Lecture', ar: 'محاضرة' } }
                ],
                enhanced: [
                    { en: 'Books', ar: 'كتب' },
                    { en: 'Guides', ar: 'أدلة' },
                    { en: 'Templates', ar: 'قوالب' },
                    { en: 'Research', ar: 'أبحاث' }
                ]
            },
            events: [
                { en: 'Workshop', ar: 'ورشة عمل' },
                { en: 'Lecture', ar: 'محاضرة' },
                { en: 'Social', ar: 'اجتماعي' }
            ]
        };
    }

    /**
     * Get magazine categories
     */
    async getMagazineCategories() {
        const categories = await this.loadCategories();
        return categories.magazine || this.getDefaultCategories().magazine;
    }

    /**
     * Get library categories (basic)
     */
    async getLibraryCategoriesBasic() {
        const categories = await this.loadCategories();
        return categories.library?.basic || this.getDefaultCategories().library.basic;
    }

    /**
     * Get library categories (enhanced)
     */
    async getLibraryCategoriesEnhanced() {
        const categories = await this.loadCategories();
        return categories.library?.enhanced || this.getDefaultCategories().library.enhanced;
    }

    /**
     * Get event types
     */
    async getEventTypes() {
        const categories = await this.loadCategories();
        return categories.events || this.getDefaultCategories().events;
    }

    /**
     * Clear cache (useful for development/testing)
     */
    clearCache() {
        this.cache = null;
        console.log('[Categories] Cache cleared');
    }
}

// Export singleton instance
const categoriesLoader = new CategoriesLoader();
export default categoriesLoader;

// Also export class for creating new instances if needed
export { CategoriesLoader };
