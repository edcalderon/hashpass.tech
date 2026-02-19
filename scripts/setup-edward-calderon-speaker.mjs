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

const email = 'ecalderon@unal.edu.co';
const speakerData = {
  name: 'Edward Calderon',
  title: 'Tech Lead & Blockchain Expert',
  company: 'HashPass',
  bio: 'Edward Calderon is a technology leader and blockchain expert with extensive experience in developing innovative solutions. He specializes in blockchain technology, smart contracts, and decentralized applications.',
  tags: ['blockchain', 'technology', 'leadership', 'innovation'],
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
    console.log('🚀 Setting up Edward Calderon as Speaker...\n');

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

    // Step 2: Assign speaker role
    console.log('📋 Step 2: Assigning speaker role...');
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

    // Step 3: Create or update speaker in bsl_speakers
    console.log('\n📋 Step 3: Creating/updating speaker record...');
    const speakerId = `edward-calderon-${user.id.substring(0, 8)}`;
    
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
      imageurl: existingSpeaker?.imageurl || 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-edward-calderon.png',
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

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`User: ${user.email}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Role: speaker`);
    console.log(`Speaker: ${speakerData.name} - ${speakerData.title}`);
    console.log(`Company: ${speakerData.company}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

