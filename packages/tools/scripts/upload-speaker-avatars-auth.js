#!/usr/bin/env node

/**
 * Bulk upload script for speaker avatars to Cloudinary using authenticated SDK
 * Uploads all avatar images from assets/speakers/avatars/ to Cloudinary
 */

const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary from environment
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || 'cloudinary://922669241128932:ZQiHZwQzJrScX63zjIW63iKs8R0@dfwjkpsma';
cloudinary.config(CLOUDINARY_URL);

// Local paths
const AVATARS_DIR = path.join(__dirname, '../assets/speakers/avatars');
const OUTPUT_FILE = path.join(__dirname, '../scripts/output/speaker-images-cloudinary.json');

/**
 * Converts filename to speaker name (inverse of speakerNameToFilename)
 * @param {string} filename - The filename without extension
 * @returns {string} - Speaker name
 */
function filenameToSpeakerName(filename) {
  // Remove 'foto-' prefix if present
  let name = filename.replace(/^foto-/, '');
  
  // Convert URL-safe filename back to speaker name
  return name
    .replace(/-/g, ' ') // Replace hyphens with spaces
    .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
}

/**
 * Uploads a single image to Cloudinary using authenticated SDK
 * @param {string} filePath - Local file path
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Upload result
 */
async function uploadImage(filePath, publicId) {
  try {
    console.log(`Uploading ${path.basename(filePath)} as ${publicId}...`);

    const result = await cloudinary.uploader.upload(filePath, {
      public_id: publicId,
      folder: 'speakers/avatars',
      tags: ['speaker', 'avatar', 'bsl2025'],
      resource_type: 'image',
      format: 'webp', // Convert to WebP for better performance
      quality: 'auto:good',
      fetch_format: 'auto',
    });

    console.log(`✓ Uploaded ${publicId} - ${result.secure_url}`);
    return result;
  } catch (error) {
    console.error(`✗ Failed to upload ${publicId}:`, error.message);
    throw error;
  }
}

/**
 * Main upload function
 */
async function bulkUploadAvatars() {
  try {
    console.log('Starting bulk upload of speaker avatars to Cloudinary...\n');
    console.log(`Using Cloudinary cloud: ${cloudinary.config().cloud_name}\n`);

    // Check if avatars directory exists
    if (!fs.existsSync(AVATARS_DIR)) {
      throw new Error(`Avatars directory not found: ${AVATARS_DIR}`);
    }

    // Get all image files in the avatars directory
    const files = fs.readdirSync(AVATARS_DIR).filter(file => 
      file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.webp')
    );

    if (files.length === 0) {
      console.log('No avatar images found in the directory.');
      return;
    }

    console.log(`Found ${files.length} avatar images to upload.\n`);

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const uploadResults = [];
    let successCount = 0;
    let failCount = 0;

    // Upload each file
    for (const file of files) {
      const filePath = path.join(AVATARS_DIR, file);
      const filenameWithoutExt = path.parse(file).name;
      const speakerName = filenameToSpeakerName(filenameWithoutExt);
      const publicId = `speakers/avatars/${filenameWithoutExt}`;

      try {
        const result = await uploadImage(filePath, publicId);
        
        uploadResults.push({
          filename: file,
          speakerName: speakerName,
          publicId: publicId,
          cloudinaryUrl: result.secure_url,
          originalUrl: result.secure_url,
          localPath: `/assets/speakers/avatars/${file}`,
          uploadResult: result
        });
        
        successCount++;
      } catch (error) {
        console.error(`Failed to upload ${file}:`, error.message);
        uploadResults.push({
          filename: file,
          speakerName: speakerName,
          publicId: publicId,
          error: error.message,
          localPath: `/assets/speakers/avatars/${file}`
        });
        failCount++;
      }

      // Add small delay between uploads to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save results to JSON file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uploadResults, null, 2));

    console.log(`\n=== Upload Summary ===`);
    console.log(`Total files: ${files.length}`);
    console.log(`Successful uploads: ${successCount}`);
    console.log(`Failed uploads: ${failCount}`);
    console.log(`Results saved to: ${OUTPUT_FILE}`);

    if (failCount > 0) {
      console.log(`\nFailed uploads:`);
      uploadResults.filter(r => r.error).forEach(r => {
        console.log(`- ${r.filename}: ${r.error}`);
      });
    }

    // Also create a simple mapping file for easy lookup
    const mappingFile = path.join(__dirname, '../scripts/output/speaker-cloudinary-mapping.json');
    const mapping = {};
    uploadResults.filter(r => !r.error).forEach(r => {
      mapping[r.speakerName.toLowerCase()] = r.cloudinaryUrl;
    });
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
    console.log(`Speaker name to URL mapping saved to: ${mappingFile}`);

  } catch (error) {
    console.error('Bulk upload failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  bulkUploadAvatars();
}

module.exports = { bulkUploadAvatars, filenameToSpeakerName };
