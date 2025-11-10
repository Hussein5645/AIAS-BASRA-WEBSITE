# User Research - Card Sorting Methodology

## What is Card Sorting?

Card sorting is a user research method that helps understand how users naturally group and categorize content. This reveals users' mental models and informs the information architecture design.

## Card Sorting Process for AIAS Basra Website

### Step 1: Prepare the Cards
Create cards representing each piece of content/page on the website:

**Content Cards:**
- Home
- Events
- Workshops
- Education Programs
- Magazine/Blog
- Library Resources
- About Us
- Team
- Contact
- Freedom By Design
- Gallery
- Student Projects
- Architecture News
- Design Tools
- Study Materials

### Step 2: Select Participants
**Target Users:**
- Architecture students (primary users)
- Faculty advisors (secondary users)
- Alumni (tertiary users)
- Prospective members

**Sample Size:** 15-20 participants for reliable patterns

### Step 3: Conduct Card Sorting Sessions

#### Open Card Sort (Recommended First)
Users create their own category names and group cards:
1. Give participants all content cards
2. Ask them to group related items together
3. Have them name each group
4. Note any cards they find confusing or would remove

**Questions to Ask:**
- "Which items would you group together?"
- "What would you call this group?"
- "Where would you expect to find [specific content]?"
- "Are any items unclear or confusing?"

#### Closed Card Sort (Validation)
Users organize cards into pre-defined categories:
1. Provide category labels: Programs, Resources, About, Community
2. Ask participants to place cards in appropriate categories
3. Note any hesitation or disagreement

### Step 4: Analyze Results

#### Look for Patterns:
- **Agreement Matrix**: How often items are grouped together
- **Common Category Names**: What users call groups
- **Outliers**: Items that don't fit anywhere
- **Conflicts**: Items placed in multiple categories

#### Tools for Analysis:
- **Manual**: Spreadsheet tracking co-occurrences
- **Digital**: OptimalSort, UserZoom, Miro
- **Statistical**: Dendrogram cluster analysis

### Step 5: Expected Findings

Based on AIAS website content, likely categories:

**Category 1: "Get Involved" / "Programs"**
- Events
- Workshops
- Freedom By Design
- Education Programs
- Student Projects

**Category 2: "Resources" / "Learning"**
- Library
- Study Materials
- Design Tools
- Magazine/Blog
- Architecture News

**Category 3: "About" / "Who We Are"**
- About Us
- Team
- Contact
- Gallery

**Category 4: "News & Updates"**
- Magazine/Blog
- Events
- Architecture News

### Step 6: Apply Findings to IA

#### Primary Navigation Structure (5-8 items):
1. **Home**
2. **Programs** (Events, Education, Freedom By Design)
3. **Resources** (Library, Magazine)
4. **About** (About Us, Team, Gallery)
5. **Contact** (CTA Button)

#### Information Hierarchy:
```
AIAS Basra
├── Home
├── Programs (Mega Menu)
│   ├── Events
│   ├── Education
│   └── Freedom By Design
├── Resources (Mega Menu)
│   ├── Library
│   ├── Magazine/Blog
│   └── Design Tools
├── About (Dropdown)
│   ├── About Us
│   ├── Team
│   └── Gallery
└── Join Us (CTA Button)
```

## Remote Card Sorting Tools

For online research:
- **OptimalSort** by Optimal Workshop
- **UserZoom Card Sort**
- **Miro** (collaborative whiteboard)
- **Google Forms** + Spreadsheet (DIY approach)

## Best Practices

1. **Keep it Short**: 30-45 minute sessions
2. **Use Real Content**: Actual page titles and descriptions
3. **Test with Target Users**: Not just stakeholders
4. **Run Pilot Test**: Validate instructions first
5. **Combine Methods**: Use both open and closed sorts
6. **Think Aloud**: Encourage participants to explain their thinking

## Validation Checklist

After card sorting:
- [ ] Do categories make sense to majority of users?
- [ ] Can users predict where content will be?
- [ ] Are category labels clear and jargon-free?
- [ ] Is the hierarchy shallow (max 3 levels deep)?
- [ ] Are frequently accessed items easily reachable?
- [ ] Does the structure support future growth?

## Next Steps

1. Conduct card sorting with 15-20 users
2. Analyze results for common patterns
3. Create draft sitemap based on findings
4. Validate with stakeholders
5. Prototype navigation structure
6. Test with users before implementation
