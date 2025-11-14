#!/usr/bin/env node

// Test script to verify avatar loading
const http = require('http');

// Simple URL generation functions (copied from string-utils)
function toUrlSafe(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function speakerNameToFilename(name) {
  return toUrlSafe(name);
}

function getLocalOptimizedAvatarUrl(name) {
  if (!name) return null;
  
  const filename = speakerNameToFilename(name);
  let localPath = `/assets/speakers/avatars/foto-${filename}.png`;
  
  // For web, we need to include the origin
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    localPath = `${origin}${localPath}`;
  } else {
    // For testing, assume localhost:8081
    localPath = `http://localhost:8081${localPath}`;
  }
  
  return localPath;
}

function getSpeakerAvatarUrl(name) {
  const filename = speakerNameToFilename(name);
  const s3Key = `speakers/avatars/foto-${filename}.png`;
  return `https://hashpass-assets.s3.us-east-2.amazonaws.com/${s3Key}`;
}

// Test speakers
const testSpeakers = [
  'Alberto Naudon',
  'Alvaro Castro', 
  'Ana Garces',
  'Camila Ortegon',
  'Nonexistent Speaker' // Should fallback to initials
];

console.log('🧪 Testing avatar URL generation...\n');

testSpeakers.forEach(speaker => {
  const localUrl = getLocalOptimizedAvatarUrl(speaker);
  const s3Url = getSpeakerAvatarUrl(speaker);
  
  console.log(`👤 ${speaker}:`);
  console.log(`   Local: ${localUrl || 'null'}`);
  console.log(`   S3: ${s3Url}`);
  console.log('');
});

// Test if local URLs are accessible (server needs to be running)
console.log('🌐 Testing local URL accessibility (localhost:8081)...');

testSpeakers.slice(0, 3).forEach(speaker => {
  const localUrl = getLocalOptimizedAvatarUrl(speaker);
  if (localUrl) {
    const url = new URL(localUrl);
    const options = {
      hostname: 'localhost',
      port: 8081,
      path: url.pathname,
      method: 'HEAD'
    };
    
    const req = http.request(options, (res) => {
      console.log(`   ✅ ${speaker}: ${res.statusCode} ${res.statusMessage}`);
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ ${speaker}: ${err.message}`);
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      console.log(`   ⏰ ${speaker}: Timeout`);
    });
    
    req.end();
  }
});

console.log('\n📝 To test manually:');
console.log('1. Start dev server: npm run dev');
console.log('2. Open http://localhost:8081/events/bsl2025/speakers/calendar');
console.log('3. Check browser console for avatar loading logs');
console.log('4. Compare with http://localhost:8081/events/bsl2025/speakers/[id]');
