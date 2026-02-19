#!/usr/bin/env node
/**
 * Apply migration directly using Supabase Management API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Required: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function applyMigration() {
  console.log('🔄 Applying migration via Supabase Management API...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250201000004_enhance_get_speaker_available_slots_check_requester_conflicts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded\n');
    
    // Extract project ref from URL
    // Format: https://[project-ref].supabase.co
    const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (!urlMatch) {
      throw new Error('Could not extract project ref from Supabase URL');
    }
    const projectRef = urlMatch[1];
    
    console.log(`📤 Project ref: ${projectRef}`);
    console.log('Executing SQL...\n');
    
    // Use Supabase Management API
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
    
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: migrationSQL,
      }),
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ Migration applied successfully!\n');
      console.log('Response:', responseText);
      console.log('\n📊 Function updated:');
      console.log('   - get_speaker_available_slots now supports p_requester_id');
      console.log('   - Checks for requester conflicts');
      console.log('   - Filters out requester meetings and blocked slots\n');
    } else {
      console.error('❌ Migration failed:', response.status, response.statusText);
      console.error('Response:', responseText);
      
      // If Management API doesn't work, provide manual instructions
      if (response.status === 401 || response.status === 403) {
        console.log('\n⚠️  Management API authentication failed.');
        console.log('Please apply manually via Supabase Dashboard:\n');
        console.log(`https://supabase.com/dashboard/project/${projectRef}/sql\n`);
        console.log('SQL to execute:\n');
        console.log('─'.repeat(80));
        console.log(migrationSQL);
        console.log('─'.repeat(80));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please apply the migration manually via Supabase Dashboard SQL Editor\n');
  }
}

applyMigration();


