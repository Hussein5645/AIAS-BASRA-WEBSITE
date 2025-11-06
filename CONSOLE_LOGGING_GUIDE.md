# Firebase Content Display - Console Logging Guide

## Overview
This guide explains the comprehensive console logging that has been added to help debug Firebase data fetching and content rendering issues.

## What Was Added

### 1. Data Loader Logging (`js/data-loader.js`)
The data loader now logs detailed information about all data fetched from Firebase:

**Events:**
- Total number of events loaded
- Sample event data for the first event
- Full details of all events when fetched

**Library:**
- Total number of library items loaded
- Sample library item data
- Full details of all library items when fetched

**Magazine:**
- Total number of articles loaded
- Featured article information
- Details of all articles
- Sample article data

**Education:**
- Number of courses loaded
- Weekly workshop information
- Number of FBD events
- Full course and workshop details

**About & Home:**
- Whether the pages exist in Firestore
- Brief indication of data presence

### 2. Page-Specific Logging

#### Events Page (`events.html`)
Console logs include:
- Container element validation (confirms DOM elements exist)
- Number of events loaded from Data Loader
- Detailed information for each event:
  - ID, title, time, location, seats, description preview
- Rendering confirmation with count of items added to DOM
- Warning for events with invalid dates

#### Library Page (`library.html`)
Console logs include:
- Container element validation
- Number of library items loaded
- Detailed information for each library item:
  - ID, name, type, tags, description preview
- Rendering confirmation with count of items added to DOM

#### Magazine Page (`magazine.html`)
Console logs include:
- Number of articles loaded
- Featured article information
- List of all articles with their details

#### Education Page (`education.html`)
Console logs include:
- Number of courses loaded
- Number of FBD events
- Weekly workshop details
- List of all courses

#### FBD Page (`fbd.html`)
Console logs include:
- Number of FBD events loaded
- Page title and about text preview
- Detailed information for each FBD event

## How to Use the Console Logs

### Step 1: Open Browser Console
1. Open your website in a browser (Chrome, Firefox, Edge, etc.)
2. Press `F12` or right-click and select "Inspect"
3. Click on the "Console" tab

### Step 2: Load a Page
Navigate to any page (e.g., events.html, library.html, etc.)

### Step 3: Check the Console Output
Look for messages prefixed with:
- `[Data Loader]` - Messages from the data fetching layer
- `[Events]`, `[Library]`, `[Magazine]`, `[Education]`, `[FBD]` - Messages from specific pages

### Step 4: Identify Issues

#### If Firebase is not connecting:
You'll see error messages like:
```
[Data Loader] ✗ Error fetching data: <error message>
[Data Loader] Error details: { code: ..., message: ..., name: ... }
```

#### If containers are not found:
You'll see error messages like:
```
[Events] Error: Grid container not found!
[Events] Error: Timeline container not found!
```

#### If data is empty:
You'll see messages like:
```
[Events] No events found or events array is empty
[Data Loader] ✓ Loaded 0 events from Firestore
```

#### If data is fetched but not rendered:
Check for:
```
[Events] ✓ Loaded X events from Data Loader
[Events] ✓ Events array has data, proceeding to render...
[Events] ✓ Rendered events to DOM: { gridItemsCount: X, timelineItemsCount: Y }
```
If you see the data loaded but not the rendering confirmation, there might be an issue in the rendering loop.

#### If dates are invalid:
You'll see warnings like:
```
[Events] Skipping event with invalid date: <event title>
```

## Common Issues and Solutions

### Issue 1: Firebase Connection Blocked
**Symptoms:** Errors like `ERR_BLOCKED_BY_CLIENT` or `Failed to load Firebase SDK`
**Solution:** 
- Check if your ad blocker or privacy extension is blocking Firebase
- Ensure you have internet connectivity
- Verify Firebase configuration is correct

### Issue 2: No Data in Firestore
**Symptoms:** `Loaded 0 events/items` messages
**Solution:**
- Use the admin dashboard to add content
- Check that data is stored in the correct Firestore collections
- Verify Firestore security rules allow reading

### Issue 3: Data Loaded But Not Displayed
**Symptoms:** Console shows data loaded but page is empty
**Solution:**
- Check for JavaScript errors in console
- Verify DOM container elements exist
- Check rendering loop for errors

### Issue 4: Invalid Date Format
**Symptoms:** Events/items skipped due to invalid dates
**Solution:**
- Ensure dates are in ISO 8601 format (e.g., "2025-11-15T14:00:00Z")
- Use the admin dashboard to edit and fix date formats

## Debug Mode

For even more detailed logging, you can enable DEBUG mode by:
1. Adding `?debug=true` to the URL (e.g., `events.html?debug=true`)
2. Or running this in the console: `localStorage.setItem('debug', 'true')`

Debug mode provides:
- Full data objects in console
- Console tables for better data visualization
- Additional diagnostic information

To disable debug mode:
```javascript
localStorage.removeItem('debug')
```

## Example Console Output

Here's what you should see for a successful page load:

```
[Data Loader] Initializing Firebase app...
[Data Loader] Created new Firebase app
[Data Loader] Firebase initialized successfully
[Events] Loading events using Data Loader...
[Events] Container elements found: { gridContainer: true, timelineContainer: true }
[Data Loader] ✓ Loaded 5 events from Firestore
[Data Loader] Sample event: { id: "...", title: "Workshop Title", ... }
[Events] ✓ Loaded 5 events from Data Loader
[Events] Fetched events details:
  Event 1: { id: "...", title: "...", time: "...", location: "...", seats: 50 }
  Event 2: { id: "...", title: "...", time: "...", location: "...", seats: 30 }
  ...
[Events] ✓ Events array has data, proceeding to render...
[Events] ✓ Rendered events to DOM: { gridItemsCount: 5, timelineItemsCount: 3 }
```

## Need More Help?

If the console logs don't help you identify the issue:
1. Take a screenshot of the console output
2. Note which page you're on
3. Describe what you expected to see vs. what you actually see
4. Share this information with the development team
