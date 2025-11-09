# Static Images Directory

This directory contains all static images that are stored directly in the Git repository. These images are part of the website's source code and can be easily updated by replacing the files in this folder.

## 📁 Folder Structure

```
static/images/
├── branding/          # Logo and brand-related assets
│   └── LOGO.png      # Main AIAS Basra logo
├── team/             # Team member and founder photos
│   ├── farah.png
│   ├── haider.png
│   ├── hussein.png
│   ├── montader.png
│   ├── mustafa.png
│   ├── mustafa2.png
│   ├── roh.png
│   └── sara.png
└── README.md         # This file
```

## 🎯 Purpose

This directory serves as the central location for all **static images** that are:
- Part of the website's core design and branding
- Team member photos and founder images
- Other site assets that don't change frequently
- Managed through Git version control

## 🔄 How to Update Images

### Replacing Existing Images

1. **Locate the image** you want to replace in the appropriate subfolder
2. **Prepare your new image** with the exact same filename
3. **Replace the file** in the repository
4. **Commit and push** your changes to Git

```bash
# Example: Updating the logo
cp /path/to/new/logo.png static/images/branding/LOGO.png
git add static/images/branding/LOGO.png
git commit -m "Update AIAS Basra logo"
git push
```

### Adding New Images

1. **Choose the appropriate subfolder** based on the image type
2. **Use a descriptive filename** (lowercase, hyphens for spaces)
3. **Add the image** to the folder
4. **Update HTML/CSS files** to reference the new image
5. **Commit and push** your changes

```bash
# Example: Adding a new team member photo
cp /path/to/new-member.png static/images/team/new-member.png
git add static/images/team/new-member.png
# Don't forget to update the HTML files that display team members
git commit -m "Add new team member photo"
git push
```

## 📏 Image Guidelines and Best Practices

### Logo Images (`branding/`)
- **Format**: PNG with transparent background preferred
- **Recommended Size**: 500px width or larger (will be scaled down as needed)
- **File Size**: Keep under 1MB for optimal loading
- **Naming**: Use descriptive names like `LOGO.png`, `logo-white.png`, etc.

### Team Photos (`team/`)
- **Format**: PNG or JPG
- **Recommended Size**: 800x800px or larger (square aspect ratio)
- **File Size**: Optimize to 500KB or less per image
- **Naming**: Use team member's first name in lowercase (e.g., `hussein.png`, `farah.png`)
- **Quality**: High resolution professional headshots work best

### General Guidelines
- ✅ Use web-optimized images (compressed but high quality)
- ✅ Maintain consistent aspect ratios within each category
- ✅ Use descriptive, lowercase filenames with hyphens for spaces
- ✅ Test images across different screen sizes (desktop, tablet, mobile)
- ❌ Avoid spaces or special characters in filenames
- ❌ Don't upload extremely large files (>5MB)
- ❌ Don't use proprietary formats (use PNG, JPG, SVG, or GIF)

## 🔐 Static vs. Dynamic Content

### Static Content (This Directory)
**Stored in Git repository** and referenced directly in HTML files:
- Logo and branding assets
- Team member photos
- Core UI elements
- Images that change infrequently

**How to identify**: Look for direct file paths in HTML like:
```html
<img src="static/images/branding/LOGO.png" alt="Logo">
<img src="static/images/team/hussein.png" alt="Hussein">
```

### Dynamic Content (Firestore/Firebase Storage)
**Stored in Firebase** and loaded dynamically via JavaScript:
- Event images uploaded by admins
- Magazine article images
- User-generated content
- Frequently changing content

**How to identify**: Images loaded through JavaScript with Firestore queries

**⚠️ Important**: This directory is **ONLY** for static images. Do not modify any Firestore or Firebase Storage code when working with these images.

## 📝 After Updating Images

After replacing or adding images, make sure to:
1. ✅ Test the website locally to ensure images display correctly
2. ✅ Check all pages that use the updated images
3. ✅ Verify images load on different devices and browsers
4. ✅ Commit your changes with a clear commit message
5. ✅ Push to the repository to deploy changes

## 🛠️ Troubleshooting

### Image Not Displaying
- Check the file path in HTML matches the actual location
- Ensure filename matches exactly (case-sensitive)
- Verify the image file is not corrupted
- Clear browser cache and refresh

### Image Too Large
- Use image optimization tools (TinyPNG, ImageOptim, etc.)
- Resize images to appropriate dimensions before uploading
- Convert to appropriate format (PNG for logos, JPG for photos)

### Need Help?
Contact the AIAS Basra web development team for assistance with image management or technical issues.

---

**Last Updated**: November 2024  
**Maintained By**: AIAS Basra Chapter Web Team
