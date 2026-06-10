#!/usr/bin/env node
/**
 * Restore agenda from original scraped-agenda.json file
 */

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
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  try {
    console.log('🔄 Reverting agenda changes...\n');
    
    // Load original agenda file
    const agendaFile = path.resolve(__dirname, '..', 'output', 'scraped-agenda.json');
    console.log(`📄 Loading original agenda from: ${agendaFile}`);
    
    if (!fs.existsSync(agendaFile)) {
      console.error('❌ Original agenda file not found:', agendaFile);
      process.exit(1);
    }

    const raw = fs.readFileSync(agendaFile, 'utf-8');
    const agendaItems = JSON.parse(raw);
    
    console.log(`✅ Loaded ${agendaItems.length} agenda items\n`);

    // Clear existing agenda
    console.log('🗑️  Clearing existing agenda...');
    const { error: deleteError } = await supabase
      .from('event_agenda')
      .delete()
      .eq('event_id', 'bsl2025');

    if (deleteError) {
      throw deleteError;
    }
    console.log('✅ Existing agenda cleared\n');

    // Insert original agenda items
    console.log('📝 Restoring original agenda items...');
    const { data, error } = await supabase
      .from('event_agenda')
      .insert(agendaItems);

    if (error) {
      throw error;
    }

    console.log(`✅ Restored ${agendaItems.length} agenda items to database\n`);
    
    // Verify
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, title, speakers')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      console.log(`✅ Verification successful: ${verifyData.length} items in database`);
      const itemsWithSpeakers = verifyData.filter(item => item.speakers && item.speakers.length > 0).length;
      console.log(`   Items with speakers: ${itemsWithSpeakers}`);
    }
    
    console.log('\n✅ Agenda reverted successfully!');
    
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

main();

