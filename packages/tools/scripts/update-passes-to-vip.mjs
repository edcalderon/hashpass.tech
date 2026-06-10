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

const emails = ['ecalderon@unal.edu.co', 'rodrigo@sainz.cl'];

async function updatePassToVIP(email) {
  try {
    console.log(`\n🔧 Processing ${email}...`);

    // Find user
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      return;
    }
    
    console.log(`✅ Found user: ${user.email} (${user.id})`);

    // Check current pass
    const { data: currentPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_id', 'bsl2025')
      .maybeSingle();
    
    if (!currentPass) {
      console.log('⚠️  No pass found, creating VIP pass...');
      
      // Create new VIP pass
      const passId = `pass-${user.id}-${Date.now()}`;
      const passNumber = `BSL2025-VIP-${Date.now()}`;
      
      const { data: newPass, error: createError } = await supabase
        .from('passes')
        .insert({
          id: passId,
          user_id: user.id,
          event_id: 'bsl2025',
          pass_type: 'vip',
          status: 'active',
          pass_number: passNumber,
          max_meeting_requests: 20,
          used_meeting_requests: 0,
          max_boost_amount: 500.00,
          used_boost_amount: 0,
          access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
          special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Error creating VIP pass:', createError);
        return;
      }
      
      console.log('✅ VIP pass created');
      console.log(`   Pass ID: ${newPass.id}`);
      console.log(`   Pass Number: ${newPass.pass_number}`);
      
      // Create pass_request_limits
      const { error: limitsError } = await supabase
        .from('pass_request_limits')
        .insert({
          pass_id: newPass.id,
          user_id: user.id,
          remaining_meeting_requests: 20,
          remaining_boost_amount: 500.00
        });
      
      if (limitsError) {
        console.warn('⚠️  Error creating limits:', limitsError.message);
      } else {
        console.log('✅ Pass request limits created');
      }
      
    } else {
      console.log(`📋 Current pass type: ${currentPass.pass_type}`);
      
      if (currentPass.pass_type === 'vip') {
        console.log('✅ Already has VIP pass');
        return;
      }
      
      console.log('🔄 Updating pass to VIP...');
      
      // Update pass to VIP
      const { data: updatedPass, error: updateError } = await supabase
        .from('passes')
        .update({
          pass_type: 'vip',
          status: 'active',
          pass_number: currentPass.pass_number?.includes('VIP') ? currentPass.pass_number : `BSL2025-VIP-${Date.now()}`,
          max_meeting_requests: 20,
          max_boost_amount: 500.00,
          access_features: ['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
          special_perks: ['concierge_service', 'exclusive_lounge', 'premium_swag'],
          updated_at: new Date().toISOString()
        })
        .eq('id', currentPass.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('❌ Error updating pass:', updateError);
        return;
      }
      
      console.log('✅ Pass updated to VIP');
      console.log(`   Pass ID: ${updatedPass.id}`);
      console.log(`   Pass Number: ${updatedPass.pass_number}`);
      
      // Update or create pass_request_limits
      const { data: existingLimits } = await supabase
        .from('pass_request_limits')
        .select('*')
        .eq('pass_id', updatedPass.id)
        .maybeSingle();
      
      if (existingLimits) {
        const { error: updateLimitsError } = await supabase
          .from('pass_request_limits')
          .update({
            remaining_meeting_requests: 20,
            remaining_boost_amount: 500.00
          })
          .eq('id', existingLimits.id);
        
        if (updateLimitsError) {
          console.warn('⚠️  Error updating limits:', updateLimitsError.message);
        } else {
          console.log('✅ Pass request limits updated');
        }
      } else {
        const { error: insertLimitsError } = await supabase
          .from('pass_request_limits')
          .insert({
            pass_id: updatedPass.id,
            user_id: user.id,
            remaining_meeting_requests: 20,
            remaining_boost_amount: 500.00
          });
        
        if (insertLimitsError) {
          console.warn('⚠️  Error creating limits:', insertLimitsError.message);
        } else {
          console.log('✅ Pass request limits created');
        }
      }
    }
    
  } catch (error) {
    console.error(`💥 Error processing ${email}:`, error);
  }
}

async function main() {
  try {
    console.log('🚀 Updating passes to VIP for both users...\n');
    
    for (const email of emails) {
      await updatePassToVIP(email);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ VERIFICATION');
    console.log('='.repeat(60));
    
    // Verify both users
    const { data: users } = await supabase.auth.admin.listUsers();
    
    for (const email of emails) {
      const user = users.users.find(u => u.email === email);
      if (user) {
        const { data: pass } = await supabase
          .from('passes')
          .select('*')
          .eq('user_id', user.id)
          .eq('event_id', 'bsl2025')
          .single();
        
        console.log(`\n📧 ${email}:`);
        console.log(`   Pass Type: ${pass?.pass_type || 'Not found'}`);
        console.log(`   Pass Status: ${pass?.status || 'N/A'}`);
        console.log(`   Pass Number: ${pass?.pass_number || 'N/A'}`);
      }
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

