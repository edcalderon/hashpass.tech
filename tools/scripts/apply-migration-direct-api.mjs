#!/usr/bin/env node
/**
 * Apply migration directly using Supabase Management API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to get from environment
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgbdilebadmzqwubsijr.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.log('Please provide SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function applyMigration() {
  console.log('🔄 Applying migration via Supabase Management API...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    
    // Extract project ref
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || 'tgbdilebadmzqwubsijr';
    
    console.log(`📤 Project: ${projectRef}`);
    console.log('Executing SQL via Management API...\n');
    
    // Use Supabase Management API
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
    
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        query: migrationSQL,
      }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    
    if (response.ok) {
      console.log('✅ Migration applied successfully!\n');
      console.log('Response:', JSON.stringify(responseData, null, 2));
      console.log('\n📊 Function updated:');
      console.log('   - get_speaker_available_slots now supports p_requester_id');
      console.log('   - Checks for requester conflicts');
      console.log('   - Filters out requester meetings and blocked slots\n');
    } else {
      console.error('❌ Migration failed:', response.status, response.statusText);
      console.error('Response:', responseText);
      
      // Provide manual instructions
      console.log('\n📝 Please apply manually via Supabase Dashboard:');
      console.log(`https://supabase.com/dashboard/project/${projectRef}/sql\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please apply the migration manually via Supabase Dashboard SQL Editor\n');
  }
}

applyMigration();


