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

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🔧 Running Notification Archive Migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../supabase/migrations/20250122000000_add_notification_archive_fields.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration SQL loaded from:', migrationPath);
    
    // Check if columns already exist
    console.log('\n🔍 Checking if archive columns already exist...');
    
    // Try to select is_archived column to check if it exists
    const { error: checkError } = await supabase
      .from('notifications')
      .select('is_archived')
      .limit(1);
    
    if (!checkError) {
      console.log('⚠️  Archive columns may already exist!');
      console.log('ℹ️  Migration may have already been applied.');
    } else {
      console.log('✅ Archive columns do not exist, proceeding with migration...');
    }
    
    // Execute migration using Supabase REST API
    // We'll use rpc if available, otherwise we need to use the management API
    console.log('\n📝 Executing migration SQL...');
    
    // Split SQL into executable statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => {
        const trimmed = stmt.trim();
        return trimmed.length > 0 && 
               !trimmed.startsWith('--') && 
               !trimmed.startsWith('DO $$') &&
               trimmed !== 'END $$';
      });
    
    // For DO blocks, we need to handle them specially
    const doBlocks = migrationSQL.match(/DO \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/g) || [];
    
    console.log(`📋 Found ${statements.length} statements and ${doBlocks.length} DO blocks to execute`);
    
    // Execute DO blocks first (they handle the column existence checks)
    for (let i = 0; i < doBlocks.length; i++) {
      const block = doBlocks[i];
      console.log(`\n🔧 Executing DO block ${i + 1}/${doBlocks.length}...`);
      
      try {
        // Use the REST API to execute SQL
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ sql_query: block })
        });
        
        if (!response.ok) {
          // Try alternative method - direct SQL execution
          console.log('⚠️  RPC method not available, trying alternative approach...');
        }
      } catch (e) {
        console.log('⚠️  DO block execution note:', e.message);
      }
    }
    
    // Execute regular statements
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.trim().length === 0) continue;
      
      console.log(`\n🔧 Executing statement ${i + 1}/${statements.length}...`);
      console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
      
      try {
        // Try using Supabase management API or direct SQL
        // For now, we'll provide instructions since direct SQL execution via REST is limited
        console.log('⚠️  Direct SQL execution via REST API is limited.');
      } catch (e) {
        console.log('⚠️  Statement execution note:', e.message);
      }
    }
    
    console.log('\n📋 Migration execution summary:');
    console.log('─'.repeat(60));
    console.log('⚠️  Direct SQL execution via Supabase REST API is limited.');
    console.log('📋 Please run this migration using one of the following methods:\n');
    
    console.log('Option 1: Supabase Dashboard (Recommended)');
    console.log('  1. Go to your Supabase project dashboard');
    console.log('  2. Navigate to SQL Editor');
    console.log(`  3. Copy and paste the contents of: ${migrationPath}`);
    console.log('  4. Click "Run" to execute\n');
    
    console.log('Option 2: Supabase CLI');
    console.log('  supabase db push\n');
    console.log('  Or if linked:');
    console.log('  supabase migration up\n');
    
    console.log('Option 3: psql (if you have direct database access)');
    const dbUrl = supabaseUrl.replace('https://', 'postgresql://postgres:[PASSWORD]@db.').replace('.supabase.co', '.supabase.co:5432/postgres');
    console.log(`  psql "${dbUrl}" -f ${migrationPath}\n`);
    
    console.log('📄 Migration file location:');
    console.log(`   ${migrationPath}\n`);
    
    // Show the migration SQL
    console.log('📋 Migration SQL:');
    console.log('─'.repeat(60));
    console.log(migrationSQL);
    console.log('─'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

runMigration();

