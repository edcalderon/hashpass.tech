#!/usr/bin/env node

/**
 * Legacy compatibility notice.
 *
 * Cloudinary is deprecated for new speaker/profile media. Active speaker
 * resolution uses the stored S3/CDN URL and then an S3-backed fallback.
 */

console.log('Speaker media delivery policy\n');
console.log('✅ Canonical: bsl_speakers.imageurl -> S3/CloudFront CDN');
console.log('✅ Fallback: event-scoped S3 avatar URL');
console.log('⚠️ Cloudinary: read-only compatibility for existing legacy URLs');
console.log('🚫 Do not create new Cloudinary uploads or guessed Cloudinary URLs.');
