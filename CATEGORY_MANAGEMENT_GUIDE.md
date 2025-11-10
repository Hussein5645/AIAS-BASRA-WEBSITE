# Category Management Guide

## Overview
All category definitions for the AIAS Basra website are now centrally managed in `data/data.json` with **full Arabic translation support**. This guide explains how to use and maintain the bilingual category system.

## Category Configuration Location
**File:** `data/data.json`

```json
{
  "categories": {
    "magazine": [
      { "en": "Design", "ar": "التصميم" },
      ...
    ],
    "library": {
      "basic": [
        { "value": "file", "label": { "en": "File", "ar": "ملف" } },
        ...
      ],
      "enhanced": [
        { "en": "Books", "ar": "كتب" },
        ...
      ]
    },
    "events": [
      { "en": "Workshop", "ar": "ورشة عمل" },
      ...
    ]
  }
}
```

## Available Category Types

### 1. Magazine Categories
Used for article categorization on magazine pages.

**Current Categories:**
- Design / التصميم
- Sustainability / الاستدامة
- Technology / التكنولوجيا
- History / التاريخ
- Inspiration / الإلهام
- Community / المجتمع

**Structure:**
```json
{ "en": "English Name", "ar": "الاسم العربي" }
```

**Usage in Code:**
```javascript
import categoriesLoader from './js/categories-loader.js';
const categories = await categoriesLoader.getMagazineCategories();
// Returns: [{ en: "Design", ar: "التصميم" }, ...]
```

### 2. Library Categories (Basic)
Used for library resource filtering on the main library page.

**Current Categories:**
- File / ملف (value: "file")
- Lecture / محاضرة (value: "lecture")

**Structure:**
```json
{ "value": "unique-id", "label": { "en": "English", "ar": "العربية" } }
```

**Usage in Code:**
```javascript
const categories = await categoriesLoader.getLibraryCategoriesBasic();
// Returns: [{ value: "file", label: { en: "File", ar: "ملف" } }, ...]
```

### 3. Library Categories (Enhanced)
Used for advanced library filtering on library-enhanced page.

**Current Categories:**
- Books / كتب
- Guides / أدلة
- Templates / قوالب
- Research / أبحاث

**Structure:**
```json
{ "en": "English Name", "ar": "الاسم العربي" }
```

**Usage in Code:**
```javascript
const categories = await categoriesLoader.getLibraryCategoriesEnhanced();
```

### 4. Event Types
Used for event categorization throughout the site.

**Current Types:**
- Workshop / ورشة عمل
- Lecture / محاضرة
- Social / اجتماعي

**Structure:**
```json
{ "en": "English Type", "ar": "النوع العربي" }
```

**Usage in Code:**
```javascript
const eventTypes = await categoriesLoader.getEventTypes();
```

## How to Add a New Category

### Example: Adding a new Event Type

1. **Edit data/data.json:**
```json
{
  "categories": {
    "events": [
      { "en": "Workshop", "ar": "ورشة عمل" },
      { "en": "Lecture", "ar": "محاضرة" },
      { "en": "Social", "ar": "اجتماعي" },
      { "en": "Competition", "ar": "مسابقة" }  // NEW CATEGORY
    ]
  }
}
```

2. **No code changes needed!** The category will automatically appear:
   - In admin dashboard dropdowns (in current language)
   - In event filtering UI
   - With proper Arabic translations when language is switched

3. **Clear cache** (optional): Categories are cached in memory. To force immediate update:
```javascript
categoriesLoader.clearCache();
```

## Translation System Integration

### How Categories Display in Different Languages

The system automatically detects the current language from `localStorage.getItem('language')` and displays categories accordingly:

**English (lang = 'en'):**
- Dropdown shows: "Workshop", "Lecture", "Social"

**Arabic (lang = 'ar'):**
- Dropdown shows: "ورشة عمل", "محاضرة", "اجتماعي"

### Handling in Admin Dashboard

The admin dashboard automatically re-populates category dropdowns when language changes:

```javascript
// In admin-dashboard.html
async function populateCategoryDropdowns() {
  const currentLang = localStorage.getItem('language') || 'en';
  
  // Display categories in current language
  eventTypes.map(type => {
    const value = type.en;  // Always use English for value
    const label = currentLang === 'ar' ? type.ar : type.en;
    return `<option value="${value}">${label}</option>`;
  });
}
```

### Data Storage

**Important:** Category values are always stored in English in the database, regardless of UI language. This ensures:
- Database consistency
- Proper filtering and queries
- Language-independent data storage

## How to Add a New Category Type

If you need a completely new category type (e.g., "projects"), follow these steps:

### 1. Add to data/data.json
```json
{
  "categories": {
    "magazine": [...],
    "library": {...},
    "events": [...],
    "projects": [
      { "en": "Residential", "ar": "سكني" },
      { "en": "Commercial", "ar": "تجاري" },
      { "en": "Public", "ar": "عام" }
    ]
  }
}
```

### 2. Add method to js/categories-loader.js
```javascript
/**
 * Get project categories
 */
async getProjectCategories() {
    const categories = await this.loadCategories();
    return categories.projects || this.getDefaultCategories().projects;
}
```

### 3. Update default categories
```javascript
getDefaultCategories() {
    return {
        magazine: [...],
        library: {...},
        events: [...],
        projects: [
          { en: 'Residential', ar: 'سكني' },
          { en: 'Commercial', ar: 'تجاري' },
          { en: 'Public', ar: 'عام' }
        ]
    };
}
```

## Pages Using Categories

| Page | Category Type | Language Support | Purpose |
|------|---------------|------------------|---------|
| magazine.html | Magazine Categories | ✅ Full | Article categorization |
| admin-dashboard.html | All Types | ✅ Full | Form dropdowns for content management |
| library.html | Library Basic | ✅ Full | Resource filtering |
| library-enhanced.html | Library Enhanced | ✅ Full | Advanced resource filtering |
| events.html* | Event Types | ✅ Full | Event categorization (via Firestore) |

*Events.html loads from Firestore but event types are validated against JSON config in admin dashboard.

## Backward Compatibility

The system maintains backward compatibility with the old string-based format:

**Old Format (still supported):**
```json
"events": ["Workshop", "Lecture", "Social"]
```

**New Format (recommended):**
```json
"events": [
  { "en": "Workshop", "ar": "ورشة عمل" },
  { "en": "Lecture", "ar": "محاضرة" },
  { "en": "Social", "ar": "اجتماعي" }
]
```

The code automatically detects and handles both formats.

## Caching Behavior

The categories loader implements automatic caching:
- **Cache Duration:** Categories are cached in memory until page reload
- **Cache Invalidation:** Manual via `categoriesLoader.clearCache()`
- **Fallback:** If JSON fails to load, defaults are used

## Troubleshooting

### Categories Not Updating
**Problem:** Made changes to data.json but not seeing updates

**Solutions:**
1. Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
2. Clear browser cache
3. Check browser console for errors
4. Verify JSON syntax is valid: `python3 -m json.tool data/data.json`

### Categories Not Translating
**Problem:** Categories still show in English when language is Arabic

**Solutions:**
1. Verify data.json has both `en` and `ar` properties for each category
2. Check that `localStorage.getItem('language')` returns 'ar'
3. Ensure language toggle is working (check console for errors)
4. For admin dashboard, verify that language toggle event listener re-populates dropdowns

### JSON Syntax Errors
**Problem:** Categories not loading at all

**Solutions:**
1. Validate JSON syntax: `python3 -m json.tool data/data.json`
2. Check browser console for parsing errors
3. Ensure all quotes are properly closed
4. Check for trailing commas (not allowed in JSON)
5. Verify all Arabic text is properly encoded in UTF-8

### Categories Not Appearing in Dropdown
**Problem:** Admin dashboard dropdowns are empty

**Solutions:**
1. Check that `populateCategoryDropdowns()` is being called
2. Verify the dropdown element IDs match those in the code
3. Check browser console for JavaScript errors
4. Ensure categories-loader.js is properly imported

## Best Practices

1. **Always provide both English and Arabic** for every category
2. **Use meaningful category names** that are clear to users in both languages
3. **Keep categories organized** and limited in number
4. **Test in both languages** after adding categories
5. **Validate JSON** before committing changes
6. **Document custom categories** if adding new types
7. **Maintain consistent naming** (capitalization, spacing)
8. **Use English values for database storage** to ensure consistency

## API Reference

### CategoriesLoader Class

#### Methods
- `loadCategories()` - Loads all categories from JSON
- `getMagazineCategories()` - Returns magazine category array with {en, ar}
- `getLibraryCategoriesBasic()` - Returns basic library category objects with {value, label: {en, ar}}
- `getLibraryCategoriesEnhanced()` - Returns enhanced library category array with {en, ar}
- `getEventTypes()` - Returns event type array with {en, ar}
- `clearCache()` - Clears the cached categories

#### Properties
- `cache` - Cached categories object
- `dataPath` - Path to data.json file

## Examples

### Example 1: Using Categories in Admin Dashboard
```javascript
// In admin-dashboard.html
async function populateCategoryDropdowns() {
  const currentLang = localStorage.getItem('language') || 'en';
  const eventTypes = await categoriesLoader.getEventTypes();
  
  const select = document.getElementById('eventType');
  select.innerHTML = eventTypes.map(type => {
    const value = type.en;
    const label = currentLang === 'ar' ? type.ar : type.en;
    return `<option value="${value}">${label}</option>`;
  }).join('');
}
```

### Example 2: Using Categories in Library Filter
```javascript
// In library.html
async function populateCategoryFilters() {
  const currentLang = localStorage.getItem('language') || 'en';
  const categories = await categoriesLoader.getLibraryCategoriesBasic();
  
  const filterHTML = categories.map(cat => {
    const labelEn = cat.label.en;
    const labelAr = cat.label.ar;
    const displayLabel = currentLang === 'ar' ? labelAr : labelEn;
    return `<button data-category="${cat.value}" 
                    data-en="${labelEn}" 
                    data-ar="${labelAr}">
              ${displayLabel}
            </button>`;
  }).join('');
  
  container.innerHTML = filterHTML;
}
```

## Support
For questions or issues with category management:
1. Check browser console for errors
2. Validate JSON syntax
3. Review this guide
4. Check the implementation in working pages
5. Verify both English and Arabic translations are provided

---

**Last Updated:** 2025-11-10  
**Version:** 2.0 (Added Arabic translation support)
