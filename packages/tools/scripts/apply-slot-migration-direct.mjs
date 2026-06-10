#!/usr/bin/env node
/**
 * Apply the get_speaker_available_slots migration directly via Supabase REST API
 * This uses the Management API to execute SQL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

async function applyMigration() {
  console.log('🔄 Applying get_speaker_available_slots function migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    
    // Extract project ref from URL
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      // Try alternative URL format
      const altMatch = supabaseUrl.match(/https?:\/\/.*\/([^\/]+)/)?.[1];
      if (altMatch) {
        console.log(`Using project ref: ${altMatch}`);
      } else {
        throw new Error('Could not extract project ref from Supabase URL: ' + supabaseUrl);
      }
    }

    console.log('📤 Executing migration via Supabase Management API...\n');
    
    // Use Supabase Management API
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef || 'unknown'}/database/query`;
    
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

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Function updated successfully!\n');
      console.log('📊 Migration complete:');
      console.log('   - get_speaker_available_slots now supports p_requester_id parameter');
      console.log('   - Function checks for requester conflicts');
      console.log('   - Slots are filtered to exclude requester meetings and blocked slots\n');
      return;
    }

    const errorText = await response.text();
    console.log('⚠️  Management API returned:', response.status, response.statusText);
    console.log('Response:', errorText);
    console.log('\n📝 Please apply manually via Supabase Dashboard SQL Editor\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please apply the migration manually:\n');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Copy SQL from: supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    console.log('3. Execute the SQL\n');
  }
}

applyMigration();


