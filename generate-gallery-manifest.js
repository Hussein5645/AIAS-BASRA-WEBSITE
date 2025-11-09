#!/usr/bin/env node

/**
 * Gallery Manifest Generator
 * 
 * This script scans the gallery folders and generates a JSON manifest
 * containing all image files. This eliminates the need to guess filenames
 * and prevents 404 errors.
 */

const fs = require('fs');
const path = require('path');

// Supported image extensions (case-insensitive)
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'];

/**
 * Check if a file is an image based on its extension
 */
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
}

/**
 * Scan a gallery folder and return all image files
 */
function scanGalleryFolder(folderPath) {
    try {
        const files = fs.readdirSync(folderPath);
        return files
            .filter(file => {
                const filePath = path.join(folderPath, file);
                const stats = fs.statSync(filePath);
                return stats.isFile() && isImageFile(file);
            })
            .sort(); // Sort alphabetically
    } catch (error) {
        console.error(`Error scanning folder ${folderPath}:`, error.message);
        return [];
    }
}

/**
 * Generate the complete gallery manifest
 */
function generateManifest() {
    const galleryDir = path.join(__dirname, 'gallery');
    const manifest = {};

    try {
        // Check if gallery directory exists
        if (!fs.existsSync(galleryDir)) {
            console.error('Gallery directory not found!');
            return manifest;
        }

        // Read all subdirectories in the gallery folder
        const folders = fs.readdirSync(galleryDir);

        folders.forEach(folder => {
            const folderPath = path.join(galleryDir, folder);
            const stats = fs.statSync(folderPath);

            // Only process directories
            if (stats.isDirectory()) {
                const images = scanGalleryFolder(folderPath);
                if (images.length > 0) {
                    manifest[folder] = images;
                    console.log(`Found ${images.length} images in gallery/${folder}`);
                }
            }
        });

        return manifest;
    } catch (error) {
        console.error('Error generating manifest:', error.message);
        return manifest;
    }
}

/**
 * Main function
 */
function main() {
    console.log('Generating gallery manifest...\n');

    const manifest = generateManifest();
    const manifestPath = path.join(__dirname, 'gallery-manifest.json');

    // Write the manifest to a JSON file
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nManifest generated successfully!`);
    console.log(`File: ${manifestPath}`);
    console.log(`Total galleries: ${Object.keys(manifest).length}`);
    console.log(`\nManifest contents:`);
    console.log(JSON.stringify(manifest, null, 2));
}

// Run the script
main();
