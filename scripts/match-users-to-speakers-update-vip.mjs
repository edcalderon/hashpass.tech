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

// Get user display name from metadata
function getUserDisplayName(user) {
  return user.user_metadata?.full_name || 
         user.user_metadata?.name || 
         user.raw_user_meta_data?.full_name ||
         user.raw_user_meta_data?.name ||
         user.email?.split('@')[0] ||
         null;
}

async function linkUserToSpeakerAndUpdateToVIP(userId, speakerId, speakerName, userName) {
  try {
    console.log(`\n🔧 Processing: "${speakerName}" <-> "${userName}" (${userId})...`);

    // Step 1: Link user to speaker record
    console.log('📋 Step 1: Linking user to speaker record...');
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

    // Step 2: Update/Create VIP pass
    console.log('\n📋 Step 2: Checking/updating VIP pass...');
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
        const { error: manualError } = await supabase
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
          });
        
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

    // Step 3: Add speaker role
    console.log('\n📋 Step 3: Checking/adding speaker role...');
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
    
    return true;
  } catch (error) {
    console.error(`💥 Error processing user ${userId}:`, error);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Matching existing users to speakers and updating to VIP...\n');
    
    // Get all speakers (focus on those without user_id)
    console.log('📋 Fetching speakers...');
    const { data: speakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id, name, user_id')
      .order('name');
    
    if (speakersError) {
      console.error('❌ Error fetching speakers:', speakersError);
      process.exit(1);
    }
    
    console.log(`✅ Found ${speakers.length} speakers`);
    
    // Filter speakers that need matching (no user_id)
    const speakersNeedingMatch = speakers.filter(s => !s.user_id);
    console.log(`📋 ${speakersNeedingMatch.length} speakers need user matching\n`);
    
    // Get all users
    console.log('📋 Fetching users...');
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      process.exit(1);
    }
    
    // Filter users with names
    const users = usersData.users.filter(u => {
      const name = getUserDisplayName(u);
      return name && name !== u.email && !u.email?.includes('@wallet.'); // Filter out wallet users
    });
    
    console.log(`✅ Found ${users.length} users with names\n`);
    
    // Match users to speakers
    console.log('📋 Matching users to speakers by name...\n');
    const matches = [];
    
    for (const speaker of speakersNeedingMatch) {
      const speakerName = speaker.name;
      let bestMatch = null;
      let bestMatchUser = null;
      
      for (const user of users) {
        const userName = getUserDisplayName(user);
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
      }
    }
    
    console.log(`✅ Found ${matches.length} matches\n`);
    console.log('='.repeat(60));
    
    if (matches.length === 0) {
      console.log('ℹ️  No new matches found. All speakers may already be linked or no matching users exist.');
      return;
    }
    
    // Process matches
    let successCount = 0;
    let failCount = 0;
    
    for (const match of matches) {
      const { speaker, user } = match;
      const userName = getUserDisplayName(user);
      
      console.log(`\n🎯 Match: "${speaker.name}" <-> "${userName}" (${user.email})`);
      
      const success = await linkUserToSpeakerAndUpdateToVIP(
        user.id, 
        speaker.id, 
        speaker.name,
        userName
      );
      
      if (success) {
        successCount++;
        console.log(`✅ Successfully updated ${userName}`);
      } else {
        failCount++;
        console.error(`❌ Failed to update ${userName}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total matches found: ${matches.length}`);
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();















