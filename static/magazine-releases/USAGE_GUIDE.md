# Magazine Releases Management Guide

## Overview
This guide explains how to add and manage magazine releases on the AIAS Basra website.

## Quick Start

### Option 1: Using manifest.json (Recommended)

1. Add your PDF file to the `static/magazine-releases/` folder
2. Update `manifest.json` to include the new release:

```json
{
  "releases": [
    {
      "title": "AIAS Basra Magazine - Issue 01",
      "date": "January 2025",
      "url": "static/magazine-releases/issue-01-january-2025.pdf",
      "filename": "issue-01-january-2025.pdf",
      "description": "Optional description"
    }
  ]
}
```

3. The website will automatically display your release!

### Option 2: Automatic Detection

If you don't want to use manifest.json, you can simply add PDF files with these common names:
- `issue-01.pdf`, `issue-02.pdf`, etc.
- `volume-1-issue-1.pdf`
- `spring-2025.pdf`, `fall-2024.pdf`, etc.

The system will automatically detect and display them.

## File Naming Best Practices

- Use lowercase letters
- Use hyphens instead of spaces
- Include issue number and date
- Keep it descriptive

**Good examples:**
- `issue-01-january-2025.pdf`
- `volume-1-issue-1-spring-2025.pdf`
- `special-edition-architecture-week-2025.pdf`

**Bad examples:**
- `Magazine Issue 1.pdf` (has spaces)
- `ISSUE1.pdf` (not descriptive)
- `mag.pdf` (too vague)

## Features

### View Options
Each magazine release provides two viewing options:

1. **View**: Opens the PDF in an embedded viewer within the page
2. **Download**: Downloads the PDF to the user's device

### Mobile Support
The magazine viewer is fully responsive and works on:
- Desktop browsers
- Tablets
- Mobile phones

### Browser Compatibility
The PDF viewer works with:
- Chrome/Edge (built-in PDF viewer)
- Firefox (built-in PDF viewer)
- Safari (built-in PDF viewer)
- Most modern browsers

## Empty State

If no PDF files are found, the page displays:
"No Releases Yet - Check back soon for our magazine releases!"

This ensures a good user experience even when content is not yet available.

## Troubleshooting

### My PDF doesn't appear
1. Check that the file is in `static/magazine-releases/`
2. Verify the filename matches the manifest.json entry
3. Ensure the file path in manifest.json is correct
4. Check browser console for errors

### PDF viewer shows blank
1. Ensure the PDF file is valid and not corrupted
2. Try opening the PDF directly by visiting its URL
3. Check that your server is serving PDF files correctly

### Example manifest.json
See `manifest.example.json` for a complete working example.

## Advanced: Adding Metadata

You can add additional metadata to your releases in manifest.json:

```json
{
  "releases": [
    {
      "title": "AIAS Basra Magazine - Issue 01",
      "date": "January 2025",
      "url": "static/magazine-releases/issue-01-january-2025.pdf",
      "filename": "issue-01-january-2025.pdf",
      "description": "Our inaugural issue",
      "coverImage": "static/images/covers/issue-01-cover.jpg",
      "pageCount": 32,
      "fileSize": "5.2 MB"
    }
  ]
}
```

Note: Currently, only `title`, `date`, `url`, and `filename` are used by the website.

## Support

For questions or issues, contact the web development team or check the main README.md file.
