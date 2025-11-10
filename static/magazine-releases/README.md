# Magazine Releases Folder

This folder contains PDF files for AIAS Basra magazine releases.

## Quick Start

### To add a new magazine release:

1. **Add your PDF file** to this folder
   - Example: `issue-01-january-2025.pdf`

2. **Update `manifest.json`** with the release info:
   ```json
   {
     "releases": [
       {
         "title": "AIAS Basra Magazine - Issue 01",
         "date": "January 2025",
         "url": "static/magazine-releases/issue-01-january-2025.pdf",
         "filename": "issue-01-january-2025.pdf"
       }
     ]
   }
   ```

3. **That's it!** The website will automatically display your release with:
   - View option (opens PDF in page)
   - Download option

## Files in this folder:

- `manifest.json` - Main configuration file (edit this to add releases)
- `manifest.example.json` - Example showing the correct format
- `README.md` - This file
- `USAGE_GUIDE.md` - Detailed documentation
- `*.pdf` - Your PDF magazine files

## Empty State

If the folder is empty or `manifest.json` has no releases, the website shows:
**"No Releases Yet - Check back soon for our magazine releases!"**

## For More Information

See `USAGE_GUIDE.md` for detailed instructions and troubleshooting.

