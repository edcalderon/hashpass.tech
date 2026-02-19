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
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function runMigration() {
  console.log('🔧 Running QR System Migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../supabase/migrations/20250120000000_create_qr_system.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration SQL loaded from:', migrationPath);
    
    // For Supabase, we need to execute SQL directly
    // Since we're using the service role key, we can use the REST API with rpc
    // However, the best approach is to split the SQL and execute via psql or Supabase CLI
    // For now, let's try using the REST API to check if tables exist first
    
    console.log('\n🔍 Checking if QR system tables already exist...');
    
    // Check if qr_codes table exists
    const { data: qrCodesCheck, error: qrCodesError } = await supabase
      .from('qr_codes')
      .select('id')
      .limit(1);
    
    if (!qrCodesError && qrCodesCheck !== null) {
      console.log('⚠️  QR system tables already exist!');
      console.log('ℹ️  Migration may have already been applied.');
      console.log('\n📋 To verify, checking table structure...');
      
      // Try to check for specific columns
      const { data: sampleData, error: sampleError } = await supabase
        .from('qr_codes')
        .select('token, qr_type, status, expires_at')
        .limit(1);
      
      if (!sampleError) {
        console.log('✅ QR system appears to be set up correctly.');
        console.log('ℹ️  If you need to re-run the migration, please drop the tables first.');
        return;
      }
    }
    
    console.log('\n📝 Migration SQL contains:');
    console.log('  - qr_codes table');
    console.log('  - qr_scan_logs table');
    console.log('  - Database functions for QR management');
    console.log('  - RLS policies');
    
    console.log('\n⚠️  Direct SQL execution via Supabase client is limited.');
    console.log('📋 Please run this migration using one of the following methods:\n');
    
    console.log('Option 1: Supabase Dashboard');
    console.log('  1. Go to your Supabase project dashboard');
    console.log('  2. Navigate to SQL Editor');
    console.log(`  3. Copy and paste the contents of: ${migrationPath}`);
    console.log('  4. Click "Run" to execute\n');
    
    console.log('Option 2: Supabase CLI');
    console.log('  supabase db push\n');
    
    console.log('Option 3: psql (if you have direct database access)');
    console.log(`  psql "${supabaseUrl.replace('https://', 'postgresql://').replace('.supabase.co', '.supabase.co:5432')}" -f ${migrationPath}\n`);
    
    console.log('📄 Migration file location:');
    console.log(`   ${migrationPath}\n`);
    
    // Show a preview of the migration
    console.log('📋 Migration Preview (first 500 chars):');
    console.log('─'.repeat(60));
    console.log(migrationSQL.substring(0, 500) + '...\n');
    
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

runMigration().catch((e) => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});

