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

const email = 'rodrigo@sainz.cl';
const speakerData = {
  name: 'Rodrigo Sainz',
  title: 'Founder & CEO',
  company: 'Blockchain Summit Latam',
  bio: 'Founder & CEO of Blockchain Summit Latam, leading the premier blockchain event in Latin America.',
  tags: ['blockchain', 'leadership', 'entrepreneurship', 'event-management'],
  availability: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' }
  }
};

async function main() {
  try {
    console.log('🚀 Setting up Rodrigo Sainz as Speaker, Admin, and VIP...\n');

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

    // Step 2: Assign admin role
    console.log('📋 Step 2: Assigning admin role...');
    const { data: existingAdminRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    
    if (!existingAdminRole) {
      const { data: adminRole, error: adminError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'admin'
        })
        .select()
        .single();
      
      if (adminError) {
        console.error('❌ Error adding admin role:', adminError);
        process.exit(1);
      }
      console.log('✅ Admin role assigned');
    } else {
      console.log('✅ Admin role already exists');
    }

    // Step 3: Assign speaker role
    console.log('\n📋 Step 3: Assigning speaker role...');
    const { data: existingSpeakerRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'speaker')
      .maybeSingle();
    
    if (!existingSpeakerRole) {
      const { data: speakerRole, error: speakerError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'speaker'
        })
        .select()
        .single();
      
      if (speakerError) {
        console.error('❌ Error adding speaker role:', speakerError);
        process.exit(1);
      }
      console.log('✅ Speaker role assigned');
    } else {
      console.log('✅ Speaker role already exists');
    }

    // Step 4: Create or update speaker in bsl_speakers
    console.log('\n📋 Step 4: Creating/updating speaker record...');
    const speakerId = `rodrigo-sainz-${user.id.substring(0, 8)}`;
    
    // Check if speaker already exists
    const { data: existingSpeaker } = await supabase
      .from('bsl_speakers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    const speakerRecord = {
      id: existingSpeaker?.id || speakerId,
      name: speakerData.name,
      title: speakerData.title,
      company: speakerData.company,
      bio: speakerData.bio,
      tags: speakerData.tags,
      availability: speakerData.availability,
      user_id: user.id,
      updated_at: new Date().toISOString()
    };
    
    if (existingSpeaker) {
      // Update existing speaker
      const { data: updatedSpeaker, error: updateError } = await supabase
        .from('bsl_speakers')
        .update(speakerRecord)
        .eq('id', existingSpeaker.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('❌ Error updating speaker:', updateError);
        process.exit(1);
      }
      console.log('✅ Speaker record updated');
      console.log(`   Speaker ID: ${updatedSpeaker.id}`);
    } else {
      // Create new speaker
      const { data: newSpeaker, error: insertError } = await supabase
        .from('bsl_speakers')
        .insert({
          ...speakerRecord,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ Error creating speaker:', insertError);
        process.exit(1);
      }
      console.log('✅ Speaker record created');
      console.log(`   Speaker ID: ${newSpeaker.id}`);
    }

    // Step 5: Create or update VIP pass
    console.log('\n📋 Step 5: Creating/updating VIP pass...');
    
    // Check if pass already exists
    const { data: existingPass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_id', 'bsl2025')
      .maybeSingle();
    
    const passData = {
      user_id: user.id,
      event_id: 'bsl2025',
      pass_type: 'vip',
      status: 'active',
      pass_number: existingPass?.pass_number || `BSL2025-VIP-${Date.now()}`,
      max_meeting_requests: 20, // VIP gets more requests
      used_meeting_requests: existingPass?.used_meeting_requests || 0,
      max_boost_amount: 500.00, // VIP gets more boost
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
            remaining_meeting_requests: 20,
            remaining_boost_amount: 500.00,
            last_reset_at: new Date().toISOString()
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
            pass_id: currentPass.id,
            user_id: user.id,
            remaining_meeting_requests: 20,
            remaining_boost_amount: 500.00,
            last_reset_at: new Date().toISOString()
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
    console.log(`Roles: admin, speaker`);
    console.log(`Speaker: ${speakerData.name} - ${speakerData.title}`);
    console.log(`Company: ${speakerData.company}`);
    console.log(`Pass Type: VIP`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

