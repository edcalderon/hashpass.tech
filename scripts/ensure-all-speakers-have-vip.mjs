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

async function ensureSpeakerHasVIP(userId, speakerName) {
  try {
    console.log(`\n🔧 Processing ${speakerName} (${userId})...`);

    // Step 1: Check/Update VIP pass
    const { data: currentPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', 'bsl2025')
      .maybeSingle();
    
    if (!currentPass) {
      console.log('⚠️  No pass found, creating VIP pass...');
      
      const { data: passId, error: createError } = await supabase
        .rpc('create_default_pass', {
          p_user_id: userId,
          p_pass_type: 'vip'
        });
      
      if (createError) {
        console.error('❌ Error creating VIP pass:', createError);
        // Try manual creation as fallback
        const { data: limitsData } = await supabase
          .rpc('get_pass_type_limits', { p_pass_type: 'vip' });
        
        const maxRequests = limitsData?.max_requests || 20;
        const maxBoost = limitsData?.max_boost || 500.00;
        
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
        console.log('✅ VIP pass created');
      }
    } else {
      if (currentPass.pass_type === 'vip') {
        console.log('✅ Already has VIP pass');
      } else {
        console.log(`🔄 Updating pass from ${currentPass.pass_type} to VIP...`);
        
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

    // Step 2: Ensure speaker role exists
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
    console.error(`💥 Error processing ${speakerName}:`, error);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Ensuring all speakers have VIP passes...\n');
    
    // Get all speakers with user_id
    const { data: speakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id, name, user_id')
      .not('user_id', 'is', null)
      .order('name');
    
    if (speakersError) {
      console.error('❌ Error fetching speakers:', speakersError);
      process.exit(1);
    }
    
    console.log(`✅ Found ${speakers.length} speakers with user_id\n`);
    console.log('='.repeat(60));
    
    let successCount = 0;
    let failCount = 0;
    let updatedCount = 0;
    
    for (const speaker of speakers) {
      const success = await ensureSpeakerHasVIP(speaker.user_id, speaker.name);
      
      if (success) {
        successCount++;
        // Check if we actually updated something
        const { data: pass } = await supabase
          .from('passes')
          .select('pass_type')
          .eq('user_id', speaker.user_id)
          .eq('event_id', 'bsl2025')
          .maybeSingle();
        
        if (pass && pass.pass_type === 'vip') {
          // Already had VIP or just created/updated
        }
      } else {
        failCount++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total speakers checked: ${speakers.length}`);
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('='.repeat(60));
    
    // Final verification
    console.log('\n🔍 Final verification...');
    const { data: finalCheck } = await supabase
      .from('bsl_speakers')
      .select(`
        id,
        name,
        user_id,
        passes!inner(pass_type, status)
      `)
      .not('user_id', 'is', null)
      .eq('passes.event_id', 'bsl2025');
    
    const vipCount = finalCheck?.filter(s => s.passes?.[0]?.pass_type === 'vip').length || 0;
    const nonVipCount = speakers.length - vipCount;
    
    console.log(`✅ Speakers with VIP passes: ${vipCount}`);
    if (nonVipCount > 0) {
      console.log(`⚠️  Speakers without VIP passes: ${nonVipCount}`);
    } else {
      console.log('✅ All speakers have VIP passes!');
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();















