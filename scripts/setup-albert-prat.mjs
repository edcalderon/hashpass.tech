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

const email = 'albert.p@emei-group.ad';
const speakerName = 'Albert Prat';

async function main() {
  try {
    console.log(`🚀 Setting up ${email} as Speaker and VIP...\n`);

    // Step 1: Find user
    console.log('📋 Step 1: Finding user...');
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error fetching users:', userError);
      process.exit(1);
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.email} (${user.id})\n`);

    // Step 2: Find speaker "Albert Prat"
    console.log('📋 Step 2: Finding speaker "Albert Prat"...');
    const { data: speakers, error: speakerError } = await supabase
      .from('bsl_speakers')
      .select('*')
      .ilike('name', speakerName)
      .limit(5);
    
    if (speakerError) {
      console.error('❌ Error fetching speakers:', speakerError);
      process.exit(1);
    }
    
    if (!speakers || speakers.length === 0) {
      console.error(`❌ Speaker "${speakerName}" not found`);
      process.exit(1);
    }
    
    // Use the first matching speaker
    const speaker = speakers[0];
    console.log(`✅ Found speaker: ${speaker.name} (${speaker.id})\n`);

    // Step 3: Assign speaker role
    console.log('📋 Step 3: Assigning speaker role...');
    const { data: existingSpeakerRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'speaker')
      .maybeSingle();
    
    if (!existingSpeakerRole) {
      const { data: speakerRole, error: speakerRoleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'speaker'
        })
        .select()
        .single();
      
      if (speakerRoleError) {
        console.error('❌ Error adding speaker role:', speakerRoleError);
        process.exit(1);
      }
      console.log('✅ Speaker role assigned');
    } else {
      console.log('✅ Speaker role already exists');
    }

    // Step 4: Link user to speaker in bsl_speakers
    console.log('\n📋 Step 4: Linking user to speaker record...');
    
    const { data: updatedSpeaker, error: updateSpeakerError } = await supabase
      .from('bsl_speakers')
      .update({
        user_id: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', speaker.id)
      .select()
      .single();
    
    if (updateSpeakerError) {
      console.error('❌ Error updating speaker:', updateSpeakerError);
      process.exit(1);
    }
    
    console.log('✅ Speaker record linked to user');
    console.log(`   Speaker ID: ${updatedSpeaker.id}`);
    console.log(`   User ID: ${updatedSpeaker.user_id}\n`);

    // Step 5: Create or update VIP pass
    console.log('📋 Step 5: Creating/updating VIP pass...');
    
    // Check if pass already exists
    const { data: existingPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_id', 'bsl2025')
      .maybeSingle();
    
    // Get VIP limits using the function
    const { data: vipLimits, error: limitsError } = await supabase
      .rpc('get_pass_type_limits', { p_pass_type: 'vip' });
    
    let maxRequests = 20;
    let maxBoost = 500.00;
    
    if (!limitsError && vipLimits && vipLimits.length > 0) {
      maxRequests = vipLimits[0].max_requests || 20;
      maxBoost = parseFloat(vipLimits[0].max_boost) || 500.00;
    }
    
    const passData = {
      user_id: user.id,
      event_id: 'bsl2025',
      pass_type: 'vip',
      status: 'active',
      pass_number: existingPass?.pass_number || `BSL2025-VIP-${Date.now()}`,
      max_meeting_requests: maxRequests,
      used_meeting_requests: existingPass?.used_meeting_requests || 0,
      max_boost_amount: maxBoost,
      used_boost_amount: existingPass?.used_boost_amount || 0,
      access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
      special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
      updated_at: new Date().toISOString()
    };
    
    if (existingPass) {
      // Update existing pass to VIP
      const { data: updatedPass, error: updatePassError } = await supabase
        .from('passes')
        .update(passData)
        .eq('id', existingPass.id)
        .select()
        .single();
      
      if (updatePassError) {
        console.error('❌ Error updating pass:', updatePassError);
        process.exit(1);
      }
      console.log('✅ VIP pass updated');
      console.log(`   Pass ID: ${updatedPass.id}`);
      console.log(`   Pass Number: ${updatedPass.pass_number}`);
      console.log(`   Max Requests: ${updatedPass.max_meeting_requests}`);
      console.log(`   Max Boost: $${updatedPass.max_boost_amount}`);
    } else {
      // Create new VIP pass
      const { data: newPass, error: insertPassError } = await supabase
        .from('passes')
        .insert({
          ...passData,
          id: `pass-${user.id}-${Date.now()}`,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insertPassError) {
        console.error('❌ Error creating pass:', insertPassError);
        process.exit(1);
      }
      console.log('✅ VIP pass created');
      console.log(`   Pass ID: ${newPass.id}`);
      console.log(`   Pass Number: ${newPass.pass_number}`);
      console.log(`   Max Requests: ${newPass.max_meeting_requests}`);
      console.log(`   Max Boost: $${newPass.max_boost_amount}`);
    }

    // Step 6: Update pass_request_limits for VIP
    console.log('\n📋 Step 6: Updating pass request limits...');
    const { data: currentPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_id', 'bsl2025')
      .single();
    
    if (currentPass) {
      const { data: existingLimits } = await supabase
        .from('pass_request_limits')
        .select('*')
        .eq('pass_id', currentPass.id)
        .maybeSingle();
      
      if (existingLimits) {
        const { error: updateLimitsError } = await supabase
          .from('pass_request_limits')
          .update({
            daily_requests_sent: 0,
            daily_requests_date: new Date().toISOString().split('T')[0],
            weekly_requests_sent: 0,
            weekly_requests_week: new Date().toISOString().split('T')[0],
            monthly_requests_sent: 0,
            monthly_requests_month: new Date().toISOString().split('T')[0]
          })
          .eq('pass_id', currentPass.id);
        
        if (updateLimitsError) {
          console.warn('⚠️  Error updating limits:', updateLimitsError.message);
        } else {
          console.log('✅ Pass request limits updated');
        }
      } else {
        const { error: insertLimitsError } = await supabase
          .from('pass_request_limits')
          .insert({
            pass_id: currentPass.id,
            user_id: user.id,
            daily_requests_sent: 0,
            daily_requests_date: new Date().toISOString().split('T')[0],
            weekly_requests_sent: 0,
            weekly_requests_week: new Date().toISOString().split('T')[0],
            monthly_requests_sent: 0,
            monthly_requests_month: new Date().toISOString().split('T')[0]
          });
        
        if (insertLimitsError) {
          console.warn('⚠️  Error creating limits:', insertLimitsError.message);
        } else {
          console.log('✅ Pass request limits created');
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`User: ${user.email}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Role: speaker`);
    console.log(`Speaker: ${speaker.name} - ${speaker.title || 'N/A'}`);
    console.log(`Company: ${speaker.company || 'N/A'}`);
    console.log(`Pass Type: VIP`);
    console.log(`Pass Number: ${currentPass?.pass_number || 'N/A'}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

