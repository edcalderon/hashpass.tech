#!/usr/bin/env node

/**
 * Bulk upload script for speaker avatars to Cloudinary
 * Uploads all avatar images from assets/speakers/avatars/ to Cloudinary
 */

const fs = require('fs');
const path = require('path');

// Since we're in Node.js environment, we need to polyfill FormData and fetch
const FormData = require('form-data');
const fetch = require('node-fetch').default || require('node-fetch');

// Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dfwjkpsma';
// Try common unsigned presets or use a basic one
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'unsigned';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

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
 * Uploads a single image to Cloudinary with fallback presets
 * @param {string} filePath - Local file path
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Upload result
 */
async function uploadImage(filePath, publicId) {
  // Common unsigned presets to try in order
  const presetsToTry = [
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    'speaker_avatars',
    'unsigned',
    'default'
  ].filter(Boolean);

  for (const preset of presetsToTry) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const formData = new FormData();
      formData.append('file', fileBuffer, path.basename(filePath));
      formData.append('upload_preset', preset);
      formData.append('public_id', publicId);
      formData.append('folder', 'speakers/avatars');
      formData.append('tags', 'speaker,avatar,bsl2025');

      console.log(`Trying preset "${preset}" for ${path.basename(filePath)} as ${publicId}...`);

      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`✗ Preset "${preset}" failed: ${response.statusText} (${response.status}) - ${errorText}`);
        continue; // Try next preset
      }

      const result = await response.json();
      console.log(`✓ Uploaded ${publicId} using preset "${preset}" - ${result.secure_url}`);
      return { ...result, preset_used: preset };
    } catch (error) {
      console.log(`✗ Preset "${preset}" error: ${error.message}`);
      continue; // Try next preset
    }
  }

  throw new Error(`All upload presets failed for ${publicId}`);
}

/**
 * Main upload function
 */
async function bulkUploadAvatars() {
  try {
    console.log('Starting bulk upload of speaker avatars to Cloudinary...\n');

    // Check if avatars directory exists
    if (!fs.existsSync(AVATARS_DIR)) {
      throw new Error(`Avatars directory not found: ${AVATARS_DIR}`);
    }

    // Get all PNG files in the avatars directory
    const files = fs.readdirSync(AVATARS_DIR).filter(file => 
      file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
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
      await new Promise(resolve => setTimeout(resolve, 500));
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
