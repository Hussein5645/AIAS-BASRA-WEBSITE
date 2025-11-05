# GitHub Integration Setup Guide

This guide explains how to enable direct repository updates from the admin dashboard.

## Overview

The admin dashboard can now write content directly to the GitHub repository using the GitHub API. This eliminates the need to manually copy and paste JSON content.

## Features

- **Direct Repository Updates**: Add events, articles, library resources, and education content that are automatically committed to the repository
- **Automatic Commits**: Each content addition creates a descriptive commit in the repository
- **Fallback Mode**: If no token is configured, the system falls back to showing JSON for manual updates
- **Secure Token Storage**: GitHub Personal Access Token is stored in browser's localStorage

## Setup Instructions

### Step 1: Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "AIAS Dashboard")
4. Set expiration as needed (or "No expiration" for continuous access)
5. Select the **`repo`** scope (full control of private repositories)
6. Click "Generate token" at the bottom
7. **Important**: Copy the token immediately - you won't be able to see it again!

### Step 2: Configure the Token in Dashboard

1. Log in to the admin dashboard as an admin user
2. Navigate to the **⚙️ Settings** tab
3. Paste your GitHub token in the "GitHub Personal Access Token" field
4. Click "Save Token"
5. Click "Test Connection" to verify the token works correctly

### Step 3: Start Adding Content

Once the token is configured:

1. Navigate to any content tab (Events, Magazine Articles, Library Resources, or Education Content)
2. Fill in the form with your content
3. Click the submit button
4. The content will be automatically committed to the repository!

## How It Works

### GitHub API Integration

The system uses the GitHub Contents API to:
1. Fetch the current `data/data.json` file
2. Parse and update the JSON with new content
3. Commit the changes back to the repository

### File Structure

- **`js/github-api.js`**: Contains the `GitHubAPI` class with methods for repository operations
- **`admin-dashboard.html`**: Updated with GitHub integration and Settings tab
- **All HTML pages**: Include dashboard button that's visible only to admin users

### Security Considerations

⚠️ **Important Security Notes**:

- The GitHub token is stored in browser's localStorage (client-side)
- Never commit your token to the repository
- Keep your token secure and don't share it with others
- Consider using tokens with limited expiration
- Only admin users (listed in `data/admin.json`) can access the dashboard

## Troubleshooting

### "Failed to add content" Error

**Possible causes**:
1. Token is invalid or expired
2. Token doesn't have `repo` scope
3. Network issues
4. Repository permissions

**Solution**: 
- Generate a new token with proper permissions
- Click "Test Connection" in Settings to verify

### "No token configured" Message

**Cause**: GitHub token hasn't been saved yet

**Solution**: Follow Step 2 to configure the token

### Content Not Appearing on Website

**Cause**: Changes are committed but not deployed

**Solution**: 
- If using GitHub Pages, changes should appear within a few minutes
- Check the repository's Actions/Pages deployment status

## Admin Access

To be recognized as an admin:
1. Your email must be listed in `data/admin.json`
2. You must be logged in to the website
3. The "Dashboard" button will appear in the navigation bar

## Technical Details

### API Endpoints Used

- `GET /repos/{owner}/{repo}/contents/{path}` - Fetch file content
- `PUT /repos/{owner}/{repo}/contents/{path}` - Update file content

### Repository Information

- Owner: `Hussein5645`
- Repository: `AIAS-BASRA-WEBSITE`
- Branch: `main`
- File Updated: `data/data.json`

### Supported Operations

- **Add Event**: Adds a new event to the events array
- **Add Article**: Adds a new article to magazine.articles array
- **Add Library Resource**: Adds a new resource to library array
- **Update Education**: Updates education.weeklyWorkshop object

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your admin status in `data/admin.json`
3. Test the connection using the "Test Connection" button
4. Ensure your token has the correct permissions

## Future Enhancements

Possible improvements for future versions:
- Edit and delete existing content
- Bulk operations
- Content preview before committing
- Automated backups
- Multi-file updates
- Image upload support
