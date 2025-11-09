# Gallery Manifest Generator

## Overview

The gallery uses a manifest-based approach to load images efficiently without causing 404 errors. Instead of trying to guess image filenames, the system reads from a pre-generated JSON manifest that lists all available images.

## How It Works

1. **Manifest File**: `gallery-manifest.json` contains a mapping of gallery folders to their image files
2. **Gallery Script**: The `gallery.html` page fetches this manifest and displays images from the specified folder
3. **Generator Script**: `generate-gallery-manifest.js` scans the gallery folders and creates/updates the manifest

## Adding New Images

When you add new images to a gallery folder:

1. Place your images in the appropriate gallery folder (e.g., `/gallery/1/`, `/gallery/2/`)
2. Run the manifest generator:
   ```bash
   node generate-gallery-manifest.js
   ```
3. Commit both the new images and the updated `gallery-manifest.json` file

## Supported Image Formats

The following image formats are supported (case-insensitive):
- JPG / JPEG
- PNG
- WEBP
- GIF
- SVG
- BMP

## Creating a New Gallery

1. Create a new folder in `/gallery/` with a number (e.g., `/gallery/3/`)
2. Add your images to this folder
3. Run the manifest generator:
   ```bash
   node generate-gallery-manifest.js
   ```
4. Access the gallery at `gallery.html#3`

## Example Manifest Structure

```json
{
  "1": [
    "IMG_9611.JPG",
    "IMG_9635.JPG",
    "IMG_9653.JPG"
  ],
  "2": [
    "MARY.png"
  ]
}
```

## Benefits

- ✅ No 404 errors from guessing filenames
- ✅ Faster page load (no need to check if files exist)
- ✅ Supports any filename (not limited to specific patterns)
- ✅ Works with any supported image format
- ✅ Easy to maintain and update

## Troubleshooting

**Q: Gallery shows "No images found"**
- A: Make sure you've run the manifest generator after adding images
- A: Check that the gallery folder number matches the URL hash (e.g., `gallery.html#1` for `/gallery/1/`)

**Q: New images don't appear**
- A: Run `node generate-gallery-manifest.js` to update the manifest
- A: Clear your browser cache and reload the page

**Q: How do I check the current manifest?**
- A: View the `gallery-manifest.json` file or visit `/gallery-manifest.json` on the live site
