#!/usr/bin/env node
/**
 * Remove duplicate speakers from database
 * Keeps the most complete record (has title, company, user_id, or most recent)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function calculateCompletenessScore(speaker) {
  let score = 0;
  
  // Higher score = more complete
  if (speaker.title && speaker.title.trim()) score += 10;
  if (speaker.company && speaker.company.trim()) score += 10;
  if (speaker.bio && speaker.bio.trim()) score += 5;
  if (speaker.imageurl && speaker.imageurl.trim()) score += 5;
  if (speaker.linkedin && speaker.linkedin.trim()) score += 3;
  if (speaker.twitter && speaker.twitter.trim()) score += 3;
  if (speaker.user_id) score += 20; // User_id is very important
  if (speaker.tags && speaker.tags.length > 0) score += 2;
  if (speaker.availability && Object.keys(speaker.availability).length > 0) score += 2;
  
  // Prefer more recent updates
  if (speaker.updated_at) {
    const daysSinceUpdate = (Date.now() - new Date(speaker.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 10 - daysSinceUpdate); // Up to 10 points for recency
  }
  
  return score;
}

async function main() {
  console.log('🔍 Finding duplicate speakers...\n');
  
  // Get all speakers
  const { data: allSpeakers, error: fetchError } = await supabase
    .from('bsl_speakers')
    .select('*')
    .order('name');
  
  if (fetchError) {
    console.error('❌ Error fetching speakers:', fetchError);
    process.exit(1);
  }
  
  console.log(`📊 Total speakers in database: ${allSpeakers.length}\n`);
  
  // Group by normalized name (case-insensitive)
  const groupedByName = {};
  for (const speaker of allSpeakers) {
    const normalizedName = speaker.name.toLowerCase().trim();
    if (!groupedByName[normalizedName]) {
      groupedByName[normalizedName] = [];
    }
    groupedByName[normalizedName].push(speaker);
  }
  
  // Find duplicates
  const duplicates = {};
  for (const [name, speakers] of Object.entries(groupedByName)) {
    if (speakers.length > 1) {
      duplicates[name] = speakers;
    }
  }
  
  const duplicateCount = Object.keys(duplicates).length;
  const totalDuplicates = Object.values(duplicates).reduce((sum, group) => sum + group.length, 0);
  
  if (duplicateCount === 0) {
    console.log('✅ No duplicates found!');
    return;
  }
  
  console.log(`⚠️  Found ${duplicateCount} duplicate groups (${totalDuplicates} total records)\n`);
  
  // Show duplicates
  console.log('Duplicate speakers:');
  for (const [name, speakers] of Object.entries(duplicates)) {
    console.log(`\n   ${speakers[0].name} (${speakers.length} copies):`);
    speakers.forEach((s, idx) => {
      const score = calculateCompletenessScore(s);
      console.log(`      ${idx + 1}. ID: ${s.id}`);
      console.log(`         Title: ${s.title || 'N/A'}`);
      console.log(`         Company: ${s.company || 'N/A'}`);
      console.log(`         User ID: ${s.user_id || 'N/A'}`);
      console.log(`         Updated: ${s.updated_at || 'N/A'}`);
      console.log(`         Completeness Score: ${score}`);
    });
  }
  
  console.log('\n🔄 Removing duplicates...\n');
  
  let kept = 0;
  let removed = 0;
  const idsToRemove = [];
  
  for (const [name, speakers] of Object.entries(duplicates)) {
    // Calculate completeness score for each duplicate
    const scored = speakers.map(s => ({
      speaker: s,
      score: calculateCompletenessScore(s)
    }));
    
    // Sort by score (highest first), then by updated_at (most recent first)
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const aDate = a.speaker.updated_at ? new Date(a.speaker.updated_at).getTime() : 0;
      const bDate = b.speaker.updated_at ? new Date(b.speaker.updated_at).getTime() : 0;
      return bDate - aDate;
    });
    
    // Keep the first one (highest score/most recent)
    const toKeep = scored[0].speaker;
    const toRemove = scored.slice(1).map(s => s.speaker);
    
    console.log(`✅ Keeping: ${toKeep.name} (ID: ${toKeep.id}, Score: ${scored[0].score})`);
    kept++;
    
    for (const speaker of toRemove) {
      console.log(`   🗑️  Removing: ID ${speaker.id} (Score: ${scored.find(s => s.speaker.id === speaker.id)?.score || 0})`);
      idsToRemove.push(speaker.id);
      removed++;
    }
  }
  
  if (idsToRemove.length === 0) {
    console.log('\n✅ No duplicates to remove!');
    return;
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Keeping: ${kept} records`);
  console.log(`   🗑️  Removing: ${removed} duplicate records\n`);
  
  // Check for foreign key constraints before deleting
  console.log('🔍 Checking for foreign key constraints...\n');
  
  // Check meeting_requests table
  const { data: meetingRequests, error: mrError } = await supabase
    .from('meeting_requests')
    .select('speaker_id')
    .in('speaker_id', idsToRemove.map(id => id.toString()));
  
  if (!mrError && meetingRequests && meetingRequests.length > 0) {
    console.log(`⚠️  Warning: ${meetingRequests.length} meeting_requests reference speakers to be deleted`);
    console.log('   These will need to be handled separately\n');
  }
  
  // Delete duplicates
  console.log('🗑️  Deleting duplicate speakers...\n');
  
  // Delete in batches to avoid issues
  const batchSize = 50;
  let deleted = 0;
  let failed = 0;
  
  for (let i = 0; i < idsToRemove.length; i += batchSize) {
    const batch = idsToRemove.slice(i, i + batchSize);
    
    const { error: deleteError } = await supabase
      .from('bsl_speakers')
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error(`❌ Error deleting batch:`, deleteError);
      failed += batch.length;
    } else {
      deleted += batch.length;
      console.log(`✅ Deleted ${batch.length} duplicates (${deleted}/${idsToRemove.length})`);
    }
  }
  
  console.log('\n📊 Final Summary:');
  console.log(`   ✅ Kept: ${kept} records`);
  console.log(`   🗑️  Deleted: ${deleted} duplicates`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed} deletions`);
  }
  
  // Verify final count
  const { data: finalSpeakers, error: finalError } = await supabase
    .from('bsl_speakers')
    .select('id');
  
  if (!finalError) {
    console.log(`\n✅ Final speaker count: ${finalSpeakers.length}`);
    
    // Check for remaining duplicates
    const { data: remainingDuplicates } = await supabase
      .rpc('check_duplicate_speakers');
    
    if (remainingDuplicates && remainingDuplicates.length === 0) {
      console.log('✅ No duplicates remaining!');
    }
  }
}

main().catch(console.error);

