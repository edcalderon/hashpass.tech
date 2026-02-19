#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables:');
  console.error('- EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log('🌱 Starting agenda seeding...');
  
  // First, ensure the event exists
  console.log('📅 Creating/updating BSL 2025 event...');
  const { error: eventError } = await supabase
    .from('events')
    .upsert({
      id: 'bsl2025',
      name: 'BSL 2025',
      domain: 'bsl2025.hashpass.tech',
      event_type: 'hashpass',
      features: ['speakers', 'agenda', 'matchmaking'],
      branding: {
        primaryColor: '#007AFF',
        secondaryColor: '#170961'
      }
    });

  if (eventError) {
    console.error('❌ Error creating event:', eventError);
    process.exit(1);
  }
  console.log('✅ Event created/updated successfully');

  // Load agenda data
  const agendaFile = path.resolve(__dirname, 'output', 'scraped-agenda.json');
  console.log('📄 Loading agenda from:', agendaFile);
  
  if (!fs.existsSync(agendaFile)) {
    console.error('❌ Agenda file not found:', agendaFile);
    process.exit(1);
  }

  const raw = fs.readFileSync(agendaFile, 'utf-8');
  const agendaItems = JSON.parse(raw);
  
  console.log(`📋 Found ${agendaItems.length} agenda items`);

  // Clear existing agenda for this event
  console.log('🗑️ Clearing existing agenda...');
  const { error: deleteError } = await supabase
    .from('event_agenda')
    .delete()
    .eq('event_id', 'bsl2025');

  if (deleteError) {
    console.error('❌ Error clearing existing agenda:', deleteError);
    process.exit(1);
  }
  console.log('✅ Existing agenda cleared');

  // Insert agenda items
  console.log('📝 Inserting agenda items...');
  let successCount = 0;
  let errorCount = 0;

  for (const item of agendaItems) {
    // Clean up the data
    const cleanItem = {
      id: item.id,
      event_id: item.event_id,
      time: item.time,
      title: item.title,
      description: item.description || null,
      speakers: item.speakers || null,
      type: item.type,
      location: item.location || null,
      day: item.day || null
    };

    const { error } = await supabase
      .from('event_agenda')
      .insert(cleanItem);

    if (error) {
      console.error(`❌ Error inserting ${item.id}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Inserted: ${item.title} (${item.time})`);
      successCount++;
    }
  }

  console.log('\n📊 Seeding Summary:');
  console.log(`✅ Successfully inserted: ${successCount} items`);
  console.log(`❌ Errors: ${errorCount} items`);
  console.log(`📋 Total processed: ${agendaItems.length} items`);

  // Verify the data
  console.log('\n🔍 Verifying data...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('event_agenda')
    .select('id, day, title, time')
    .eq('event_id', 'bsl2025')
    .order('time', { ascending: true });

  if (verifyError) {
    console.error('❌ Verification error:', verifyError);
  } else {
    console.log(`✅ Verification successful: ${verifyData.length} items in database`);
    
    // Show distribution by day
    const dayDistribution = {};
    verifyData.forEach(item => {
      const day = item.day || 'No day';
      dayDistribution[day] = (dayDistribution[day] || 0) + 1;
    });
    
    console.log('\n📅 Distribution by day:');
    Object.entries(dayDistribution).forEach(([day, count]) => {
      console.log(`  ${day}: ${count} items`);
    });
  }
}

main().catch((e) => { 
  console.error('💥 Fatal error:', e); 
  process.exit(1); 
});
