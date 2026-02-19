#!/usr/bin/env node

/**
 * Test script to verify Cloudinary URL generation works correctly
 */

const { getSpeakerCloudinaryAvatarUrl } = require('./lib/cloudinary');

const testSpeakers = [
  'Alberto Naudon',
  'Ana Garces', 
  'Alvaro Castro',
  '0xj4an'
];

console.log('Testing Cloudinary URL generation:\n');

testSpeakers.forEach(speaker => {
  const url = getSpeakerCloudinaryAvatarUrl(speaker, 100);
  console.log(`${speaker}:`);
  console.log(`  ${url}\n`);
});

console.log('All URLs should follow the pattern:');
console.log('https://res.cloudinary.com/dfwjkpsma/image/upload/c_fill,w_100,h_100,g_face,f_auto,q_auto:best,dpr_auto/speakers/avatars/speakers/avatars/foto-[speaker-name]');
