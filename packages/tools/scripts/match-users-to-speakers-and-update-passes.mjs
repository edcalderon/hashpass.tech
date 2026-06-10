#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Normalize name for comparison (remove accents, lowercase, trim)
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

// Check if two names match (fuzzy matching)
function namesMatch(name1, name2) {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // Check if one contains the other (for partial matches)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    // Only consider it a match if both are substantial (at least 5 chars)
    if (normalized1.length >= 5 && normalized2.length >= 5) {
      return true;
    }
  }
  
  // Check first name and last name match
  const parts1 = normalized1.split(' ').filter(p => p.length > 0);
  const parts2 = normalized2.split(' ').filter(p => p.length > 0);
  
  if (parts1.length >= 2 && parts2.length >= 2) {
    const first1 = parts1[0];
    const last1 = parts1[parts1.length - 1];
    const first2 = parts2[0];
    const last2 = parts2[parts2.length - 1];
    
    // First and last name match
    if (first1 === first2 && last1 === last2) {
      return true;
    }
    
    // First name match with substantial last names (at least 3 chars)
    if (first1 === first2 && last1.length >= 3 && last2.length >= 3) {
      // Check if last names are similar (one contains the other)
      if (last1.includes(last2) || last2.includes(last1)) {
        return true;
      }
    }
    
    // Last name match with substantial first names (at least 3 chars)
    if (last1 === last2 && first1.length >= 3 && first2.length >= 3) {
      // Check if first names are similar (one contains the other)
      if (first1.includes(first2) || first2.includes(first1)) {
        return true;
      }
    }
  }
  
  return false;
}

async function updateUserToVIPAndSpeaker(userId, speakerId, speakerName) {
  try {
    console.log(`\n🔧 Processing user ${userId} (${speakerName})...`);

    // Step 1: Update/Create VIP pass
    console.log('📋 Step 1: Checking/updating VIP pass...');
    const { data: currentPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', 'bsl2025')
      .maybeSingle();
    
    if (!currentPass) {
      console.log('⚠️  No pass found, creating VIP pass...');
      
      // Get limits for VIP pass type
      const { data: limitsData, error: limitsError } = await supabase
        .rpc('get_pass_type_limits', { p_pass_type: 'vip' });
      
      if (limitsError) {
        console.warn('⚠️  Error getting VIP limits, using defaults:', limitsError.message);
      }
      
      const maxRequests = limitsData?.max_requests || 20;
      const maxBoost = limitsData?.max_boost || 500.00;
      
      // Create new VIP pass using the function
      const { data: passId, error: createError } = await supabase
        .rpc('create_default_pass', {
          p_user_id: userId,
          p_pass_type: 'vip'
        });
      
      if (createError) {
        console.error('❌ Error creating VIP pass:', createError);
        // Try manual creation as fallback
        const manualPassId = `pass-${userId}-${Date.now()}`;
        const { data: newPass, error: manualError } = await supabase
          .from('passes')
          .insert({
            id: manualPassId,
            user_id: userId,
            event_id: 'bsl2025',
            pass_type: 'vip',
            status: 'active',
            pass_number: `BSL2025-VIP-${Date.now()}`,
            max_meeting_requests: maxRequests,
            max_boost_amount: maxBoost,
            access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
            special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (manualError) {
          console.error('❌ Error creating VIP pass manually:', manualError);
          return false;
        }
        
        console.log('✅ VIP pass created manually');
      } else {
        // Update the created pass to VIP if it wasn't already
        if (passId) {
          const { error: updateError } = await supabase
            .from('passes')
            .update({
              pass_type: 'vip',
              access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
              special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
              updated_at: new Date().toISOString()
            })
            .eq('id', passId);
          
          if (updateError) {
            console.warn('⚠️  Error updating pass to VIP:', updateError.message);
          } else {
            console.log('✅ VIP pass created/updated');
          }
        }
      }
    } else {
      console.log(`📋 Current pass type: ${currentPass.pass_type}`);
      
      if (currentPass.pass_type === 'vip') {
        console.log('✅ Already has VIP pass');
      } else {
        console.log('🔄 Updating pass to VIP...');
        
        const { error: updateError } = await supabase
          .from('passes')
          .update({
            pass_type: 'vip',
            status: 'active',
            access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
            special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
            updated_at: new Date().toISOString()
          })
          .eq('id', currentPass.id);
        
        if (updateError) {
          console.error('❌ Error updating pass:', updateError);
          return false;
        }
        
        console.log('✅ Pass updated to VIP');
      }
    }

    // Step 2: Add speaker role
    console.log('\n📋 Step 2: Checking/adding speaker role...');
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'speaker')
      .maybeSingle();
    
    if (!existingRole) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'speaker'
        });
      
      if (roleError) {
        console.error('❌ Error adding speaker role:', roleError);
        return false;
      }
      console.log('✅ Speaker role added');
    } else {
      console.log('✅ Speaker role already exists');
    }

    // Step 3: Link user to speaker in bsl_speakers
    console.log('\n📋 Step 3: Linking user to speaker record...');
    const { error: linkError } = await supabase
      .from('bsl_speakers')
      .update({
        user_id: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', speakerId);
    
    if (linkError) {
      console.error('❌ Error linking user to speaker:', linkError);
      return false;
    }
    
    console.log('✅ User linked to speaker record');
    
    return true;
  } catch (error) {
    console.error(`💥 Error processing user ${userId}:`, error);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Matching users to speakers and updating passes...\n');
    
    // Get all speakers
    console.log('📋 Fetching speakers...');
    const { data: speakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id, name, user_id')
      .order('name');
    
    if (speakersError) {
      console.error('❌ Error fetching speakers:', speakersError);
      process.exit(1);
    }
    
    console.log(`✅ Found ${speakers.length} speakers\n`);
    
    // Get all users
    console.log('📋 Fetching users...');
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      process.exit(1);
    }
    
    const users = usersData.users.filter(u => {
      const name = u.user_metadata?.name || u.user_metadata?.full_name || u.email;
      return name && name !== u.email; // Filter out users without proper names
    });
    
    console.log(`✅ Found ${users.length} users with names\n`);
    
    // First, check speakers that already have user_id to ensure they have VIP and speaker role
    console.log('📋 Checking speakers with existing user_id...\n');
    const existingLinks = [];
    for (const speaker of speakers) {
      if (speaker.user_id) {
        existingLinks.push({
          speaker: speaker,
          user: usersData.users.find(u => u.id === speaker.user_id)
        });
      }
    }
    
    if (existingLinks.length > 0) {
      console.log(`📋 Found ${existingLinks.length} speakers with existing user_id. Verifying VIP and speaker role...\n`);
      for (const link of existingLinks) {
        if (link.user) {
          const userName = link.user.user_metadata?.name || link.user.user_metadata?.full_name || link.user.email;
          console.log(`\n🔍 Verifying: "${link.speaker.name}" <-> "${userName}" (${link.user.email})`);
          const success = await updateUserToVIPAndSpeaker(link.user.id, link.speaker.id, link.speaker.name);
          if (success) {
            console.log(`✅ Verified and updated ${userName}`);
          }
        }
      }
      console.log('\n' + '='.repeat(60) + '\n');
    }
    
    // Now check ALL existing users to see if they match any speaker name
    console.log('📋 Checking all existing users for speaker name matches...\n');
    const userMatches = [];
    const processedUserIds = new Set();
    
    for (const user of users) {
      const userName = user.user_metadata?.name || user.user_metadata?.full_name;
      if (!userName) continue;
      
      // Check if this user matches any speaker name
      for (const speaker of speakers) {
        const speakerName = speaker.name;
        
        if (namesMatch(speakerName, userName)) {
          // Check if this user is already linked to this speaker
          if (speaker.user_id === user.id) {
            // Already linked, but we'll still verify VIP/speaker status
            userMatches.push({
              speaker: speaker,
              user: user,
              alreadyLinked: true
            });
          } else if (!speaker.user_id) {
            // Speaker has no user_id, this is a new match
            userMatches.push({
              speaker: speaker,
              user: user,
              alreadyLinked: false
            });
          } else {
            // Speaker has a different user_id, but this user also matches
            // We'll still update this user to VIP/speaker status
            userMatches.push({
              speaker: speaker,
              user: user,
              alreadyLinked: false,
              note: `Speaker already linked to different user (${speaker.user_id})`
            });
          }
          processedUserIds.add(user.id);
          break; // Use first match per user
        }
      }
    }
    
    console.log(`✅ Found ${userMatches.length} user-to-speaker matches\n`);
    console.log('='.repeat(60));
    
    // Process user matches
    let userSuccessCount = 0;
    let userFailCount = 0;
    
    for (const match of userMatches) {
      const { speaker, user, alreadyLinked, note } = match;
      const userName = user.user_metadata?.name || user.user_metadata?.full_name || user.email;
      
      if (note) {
        console.log(`\n⚠️  Match (${note}): "${speaker.name}" <-> "${userName}" (${user.email})`);
      } else if (alreadyLinked) {
        console.log(`\n🔍 Re-checking: "${speaker.name}" <-> "${userName}" (${user.email})`);
      } else {
        console.log(`\n🎯 New Match: "${speaker.name}" <-> "${userName}" (${user.email})`);
      }
      
      const success = await updateUserToVIPAndSpeaker(user.id, speaker.id, speaker.name);
      
      if (success) {
        userSuccessCount++;
        console.log(`✅ Successfully updated ${userName}`);
      } else {
        userFailCount++;
        console.error(`❌ Failed to update ${userName}`);
      }
    }
    
    // Also find new matches for speakers without user_id (backward compatibility)
    console.log('\n' + '='.repeat(60));
    console.log('📋 Checking for speakers without user_id that need matching...\n');
    const matches = [];
    
    for (const speaker of speakers) {
      if (speaker.user_id) {
        continue; // Skip already linked speakers
      }
      
      const speakerName = speaker.name;
      let bestMatch = null;
      let bestMatchUser = null;
      
      for (const user of users) {
        // Skip if we already processed this user
        if (processedUserIds.has(user.id)) continue;
        
        const userName = user.user_metadata?.name || user.user_metadata?.full_name;
        if (!userName) continue;
        
        if (namesMatch(speakerName, userName)) {
          bestMatch = speaker;
          bestMatchUser = user;
          break; // Use first exact match
        }
      }
      
      if (bestMatch && bestMatchUser) {
        matches.push({
          speaker: bestMatch,
          user: bestMatchUser
        });
        processedUserIds.add(bestMatchUser.id);
      }
    }
    
    console.log(`✅ Found ${matches.length} additional matches\n`);
    console.log('='.repeat(60));
    
    // Process additional matches
    let additionalSuccessCount = 0;
    let additionalFailCount = 0;
    
    for (const match of matches) {
      const { speaker, user } = match;
      const userName = user.user_metadata?.name || user.user_metadata?.full_name || user.email;
      
      console.log(`\n🎯 Additional Match: "${speaker.name}" <-> "${userName}" (${user.email})`);
      
      const success = await updateUserToVIPAndSpeaker(user.id, speaker.id, speaker.name);
      
      if (success) {
        additionalSuccessCount++;
        console.log(`✅ Successfully updated ${userName}`);
      } else {
        additionalFailCount++;
        console.error(`❌ Failed to update ${userName}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total user-to-speaker matches: ${userMatches.length}`);
    console.log(`✅ Successfully updated: ${userSuccessCount}`);
    console.log(`❌ Failed: ${userFailCount}`);
    console.log(`\nAdditional speaker matches: ${matches.length}`);
    console.log(`✅ Successfully updated: ${additionalSuccessCount}`);
    console.log(`❌ Failed: ${additionalFailCount}`);
    console.log(`\n📊 TOTAL: ${userSuccessCount + additionalSuccessCount} successful, ${userFailCount + additionalFailCount} failed`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

