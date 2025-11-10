# Category Management Guide

## Overview
All category definitions for the AIAS Basra website are now centrally managed in `data/data.json`. This guide explains how to use and maintain the category system.

## Category Configuration Location
**File:** `data/data.json`

```json
{
  "categories": {
    "magazine": [...],
    "library": {
      "basic": [...],
      "enhanced": [...]
    },
    "events": [...]
  }
}
```

## Available Category Types

### 1. Magazine Categories
Used for article categorization on magazine pages.

**Current Categories:**
- Design
- Sustainability
- Technology
- History
- Inspiration
- Community

**Usage in Code:**
```javascript
import categoriesLoader from './js/categories-loader.js';
const categories = await categoriesLoader.getMagazineCategories();
```

### 2. Library Categories (Basic)
Used for library resource filtering on the main library page.

**Current Categories:**
- File (value: "file", label: "File")
- Lecture (value: "lecture", label: "Lecture")

**Usage in Code:**
```javascript
const categories = await categoriesLoader.getLibraryCategoriesBasic();
// Returns: [{ value: "file", label: "File" }, { value: "lecture", label: "Lecture" }]
```

### 3. Library Categories (Enhanced)
Used for advanced library filtering on library-enhanced page.

**Current Categories:**
- Books
- Guides
- Templates
- Research

**Usage in Code:**
```javascript
const categories = await categoriesLoader.getLibraryCategoriesEnhanced();
```

### 4. Event Types
Used for event categorization throughout the site.

**Current Types:**
- Workshop
- Lecture
- Social

**Usage in Code:**
```javascript
const eventTypes = await categoriesLoader.getEventTypes();
```

## How to Add a New Category

### Example: Adding a new Magazine Category

1. **Edit data/data.json:**
```json
{
  "categories": {
    "magazine": [
      "Design",
      "Sustainability",
      "Technology",
      "History",
      "Inspiration",
      "Community",
      "Innovation"  // NEW CATEGORY
    ]
  }
}
```

2. **No code changes needed!** The category will automatically appear on all pages that use magazine categories.

3. **Clear cache** (optional): Categories are cached for 5 minutes. To force immediate update:
```javascript
categoriesLoader.clearCache();
```

## How to Add a New Category Type

If you need a completely new category type (e.g., "workshops"), follow these steps:

### 1. Add to data/data.json
```json
{
  "categories": {
    "magazine": [...],
    "library": {...},
    "events": [...],
    "workshops": ["Beginner", "Intermediate", "Advanced"]  // NEW TYPE
  }
}
```

### 2. Add method to js/categories-loader.js
```javascript
/**
 * Get workshop categories
 */
async getWorkshopCategories() {
    const categories = await this.loadCategories();
    return categories.workshops || this.getDefaultCategories().workshops;
}
```

### 3. Update default categories
```javascript
getDefaultCategories() {
    return {
        magazine: [...],
        library: {...},
        events: [...],
        workshops: ["Beginner", "Intermediate", "Advanced"]  // FALLBACK
    };
}
```

## Pages Using Categories

| Page | Category Type | Purpose |
|------|---------------|---------|
| magazine.html | Magazine Categories | Article categorization |
| admin-dashboard.html | All Types | Form dropdowns for content management |
| library.html | Library Basic | Resource filtering |
| library-enhanced.html | Library Enhanced | Advanced resource filtering |
| events.html* | Event Types | Event categorization (via Firestore) |

*Events.html loads from Firestore but event types are validated against JSON config in admin dashboard.

## Caching Behavior

The categories loader implements automatic caching:
- **Cache Duration:** Categories are cached in memory
- **Cache Invalidation:** Manual via `categoriesLoader.clearCache()`
- **Fallback:** If JSON fails to load, defaults are used

## Troubleshooting

### Categories Not Updating
**Problem:** Made changes to data.json but not seeing updates

**Solutions:**
1. Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
2. Clear browser cache
3. Check browser console for errors
4. Verify JSON syntax is valid

### JSON Syntax Errors
**Problem:** Categories not loading at all

**Solutions:**
1. Validate JSON syntax using online validator or `python3 -m json.tool data/data.json`
2. Check browser console for parsing errors
3. Ensure all quotes are properly closed
4. Check for trailing commas (not allowed in JSON)

### Categories Not Appearing in Dropdown
**Problem:** Admin dashboard dropdowns are empty

**Solutions:**
1. Check that `populateCategoryDropdowns()` is being called
2. Verify the dropdown element IDs match those in the code
3. Check browser console for JavaScript errors

## Best Practices

1. **Always validate JSON** before committing changes
2. **Use meaningful category names** that are clear to users
3. **Keep categories organized** and limited in number
4. **Test on all affected pages** after adding categories
5. **Document custom categories** if adding new types
6. **Maintain consistent naming** (capitalization, spacing)

## API Reference

### CategoriesLoader Class

#### Methods
- `loadCategories()` - Loads all categories from JSON
- `getMagazineCategories()` - Returns magazine category array
- `getLibraryCategoriesBasic()` - Returns basic library category objects
- `getLibraryCategoriesEnhanced()` - Returns enhanced library category array
- `getEventTypes()` - Returns event type array
- `clearCache()` - Clears the cached categories

#### Properties
- `cache` - Cached categories object
- `dataPath` - Path to data.json file

## Examples

### Example 1: Using Categories in a New Page
```html
<script type="module">
    import categoriesLoader from './js/categories-loader.js';
    
    async function loadData() {
        const categories = await categoriesLoader.getMagazineCategories();
        console.log('Categories:', categories);
        
        // Render categories as buttons
        const container = document.getElementById('categories');
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.textContent = cat;
            container.appendChild(btn);
        });
    }
    
    loadData();
</script>
```

### Example 2: Non-Module Script (like library-enhanced.html)
```html
<script>
    async function loadCategories() {
        const response = await fetch('data/data.json');
        const data = await response.json();
        const categories = data.categories.library.enhanced;
        
        // Use categories...
        console.log(categories);
    }
    
    loadCategories();
</script>
```

## Support
For questions or issues with category management:
1. Check browser console for errors
2. Validate JSON syntax
3. Review this guide
4. Check the implementation in working pages

---

**Last Updated:** 2025-11-10
**Version:** 1.0
