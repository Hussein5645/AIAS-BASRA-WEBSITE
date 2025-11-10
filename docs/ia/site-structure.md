# Site Structure & Sitemap

## Information Architecture Principles

### 1. Shallow Hierarchy
Keep navigation depth to maximum 3 levels to ensure users can reach any content within 3 clicks.

### 2. Clear Parent-Child Relationships
Group related content under logical parent categories based on user mental models.

### 3. Balanced Navigation
Distribute content evenly across categories to avoid overwhelming single sections.

## Proposed Site Structure

```
AIAS Basra Website
│
├── Home (index.html)
│   └── Landing page with hero, mission, and quick links
│
├── Programs (Mega Menu)
│   ├── Events (events.html)
│   │   ├── Upcoming Events
│   │   ├── Past Events
│   │   └── Event Registration
│   │
│   ├── Education (education.html)
│   │   ├── Workshops
│   │   ├── Courses
│   │   └── Learning Paths
│   │
│   └── Freedom By Design (fbd.html)
│       ├── About FBD
│       ├── Current Projects
│       └── Get Involved
│
├── Resources (Mega Menu)
│   ├── Library (library.html)
│   │   ├── Books
│   │   ├── Guides
│   │   ├── Templates
│   │   └── Research Papers
│   │
│   └── Magazine (magazine.html)
│       ├── Latest Articles
│       ├── Featured Content
│       └── Article Categories
│
├── About (Dropdown/Standard)
│   ├── About Us (about.html)
│   │   ├── Our Story
│   │   ├── Mission & Values
│   │   └── Leadership Team
│   │
│   └── Gallery (gallery.html)
│       └── Event Photos
│
├── Join Us (CTA Button)
│   └── Links to signup.html or contact form
│
└── Utility Navigation (Header Right)
    ├── Search
    ├── Login (login.html)
    └── Dashboard (admin-dashboard.html) [if authenticated]
```

## Navigation Hierarchy Levels

### Level 1: Primary Navigation (Main Menu)
5-7 top-level items ordered by user priority:
1. **Home** - Entry point
2. **Programs** - Core engagement (Events, Education, FBD)
3. **Resources** - Learning materials (Library, Magazine)
4. **About** - Information (About Us, Gallery)
5. **Join Us** - Primary CTA button

### Level 2: Secondary Navigation (Mega Menus & Dropdowns)
Sub-items under Programs and Resources:
- Programs: 3 sub-items (Events, Education, FBD)
- Resources: 2 sub-items (Library, Magazine)
- About: 2 sub-items (About Us, Gallery)

### Level 3: Tertiary Navigation (On-Page & Breadcrumbs)
- Breadcrumb trail: Home > Programs > Events
- In-page navigation: Jump links, filters, tabs
- Related content links

## Content Categorization

### By User Goal

**Discover & Learn About AIAS**
- Home
- About Us
- Gallery

**Participate & Engage**
- Events (workshops, meetings, competitions)
- Freedom By Design (community projects)
- Education (learning programs)

**Access Resources**
- Library (downloadable materials)
- Magazine (articles, news)

**Take Action**
- Join Us (primary CTA)
- Event Registration
- Contact

### By Content Freshness

**Static Content** (rarely changes)
- About Us
- Mission/Values

**Regular Updates** (weekly/monthly)
- Events
- Magazine Articles
- Education Programs

**Dynamic Content** (user-generated)
- Gallery
- Admin Dashboard

## Sitemap Visual

```
┌─────────────────────────────────────────────────────┐
│                    AIAS Basra                        │
│               [SEARCH] [LOGIN] [JOIN US]             │
└─────────────────────────────────────────────────────┘
        │
┌───────┴───────┬──────────┬──────────┬──────────┐
│               │          │          │          │
Home        Programs   Resources    About    Join Us
│               │          │          │        [CTA]
│               │          │          │
│           ┌───┴───┬───────┤      ┌──┴──┐
│           │       │       │      │     │
│        Events  Edu  FBD  Lib  Mag About Gallery
│
└─── Hero
     Mission
     Quick Links
     Footer
```

## Breadcrumb Examples

```
Home

Home > Programs > Events

Home > Programs > Events > Annual Design Competition 2025

Home > Resources > Library

Home > Resources > Library > Architecture Books

Home > About > Gallery
```

## URL Structure

### Clean, Semantic URLs
- Home: `/` or `/index.html`
- Programs: `/programs/` (not implemented yet, but structure allows)
  - `/events.html`
  - `/education.html`
  - `/fbd.html`
- Resources:
  - `/library.html`
  - `/magazine.html`
- About:
  - `/about.html`
  - `/gallery.html`

### Future Optimization
Consider restructuring to:
- `/programs/events/`
- `/programs/education/`
- `/resources/library/`
- `/about/team/`

This creates clearer hierarchy in URLs that matches navigation structure.

## Design Principles Applied

### Miller's Law (7±2 Rule)
Limit top-level navigation to 5-7 items to avoid cognitive overload.

### Fitts's Law
Place most important actions (Join Us CTA) where they're easily clickable.

### Hick's Law
Reduce decision time by organizing content into clear, logical groups.

### Progressive Disclosure
Use mega menus to reveal subcategories without cluttering main navigation.

## Implementation Notes

### Current State
- Flat structure: All pages at root level
- Navigation: 6 primary links + 3 auth buttons
- No mega menus or dropdowns

### Proposed Changes
1. Reorganize into Programs/Resources/About groups
2. Implement mega menus for Programs and Resources
3. Add breadcrumb navigation on all sub-pages
4. Move authentication to utility area
5. Promote "Join Us" as prominent CTA button

### Migration Path
Phase 1: Update navigation HTML/CSS
Phase 2: Add mega menu functionality
Phase 3: Implement breadcrumbs
Phase 4: Add search functionality
Phase 5: Consider folder restructuring (optional)
