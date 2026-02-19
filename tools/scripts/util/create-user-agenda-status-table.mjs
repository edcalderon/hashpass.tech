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

async function main() {
  console.log('🔧 Creating user_agenda_status table...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../supabase/migrations/20251031050000_create_user_agenda_status.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded from:', migrationPath);
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    
    // First, check if table already exists
    console.log('🔍 Checking if table already exists...');
    const { data: existingTable, error: checkError } = await supabase
      .from('user_agenda_status')
      .select('id')
      .limit(1);
    
    if (!checkError && existingTable !== null) {
      console.log('✅ Table user_agenda_status already exists!');
      console.log('ℹ️  Skipping migration. If you need to recreate it, drop the table first.');
      return;
    }
    
    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 means table doesn't exist, which is expected
      console.log('⚠️  Table check returned:', checkError.message);
    }
    
    console.log('📋 Table does not exist. Creating it...\n');
    
    // Execute each statement using raw SQL via REST API
    // Note: We'll need to use the Supabase REST API directly since RPC might not be available
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length === 0) continue;
      
      console.log(`🔧 Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${statement.substring(0, 100)}${statement.length > 100 ? '...' : ''}`);
      
      try {
        // Use the REST API to execute SQL
        // Note: This requires the exec_sql function or we need to use Supabase CLI
        // For now, we'll try a different approach - execute via psql or provide instructions
        
        // Since we can't execute DDL via REST API directly, we'll provide instructions
        console.log('   ⚠️  Cannot execute DDL via REST API. Please run this SQL manually.');
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log('\n📋 SQL Migration Instructions:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Please run the following SQL in your Supabase SQL Editor:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(migrationSQL);
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('\n✅ After running the SQL, the table will be created and ready to use.');
    console.log('🔗 Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new');
    
    // Verify table creation (will fail until SQL is run)
    console.log('\n🔍 Verifying table creation...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('user_agenda_status')
      .select('id')
      .limit(1);
    
    if (verifyError) {
      if (verifyError.code === 'PGRST116') {
        console.log('⚠️  Table not found. Please run the SQL above in Supabase SQL Editor.');
      } else {
        console.log('⚠️  Verification error:', verifyError.message);
      }
    } else {
      console.log('✅ Table created successfully!');
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main().catch((e) => { 
  console.error('💥 Fatal error:', e); 
  process.exit(1); 
});

