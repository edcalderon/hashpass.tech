#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function createAdminUser(email) {
  console.log(`🔧 Setting up admin role for: ${email}\n`);
  
  try {
    // Step 1: Create user_roles table if it doesn't exist
    console.log('📋 Step 1: Checking/creating user_roles table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.user_roles (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, role)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
      
      ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
      
      -- Drop existing policies if they exist
      DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
      DROP POLICY IF EXISTS "Service role can manage all roles" ON public.user_roles;
      
      -- Users can view their own roles
      CREATE POLICY "Users can view their own roles" ON public.user_roles
        FOR SELECT USING (user_id = auth.uid());
      
      -- Service role can manage all roles (for admin operations)
      CREATE POLICY "Service role can manage all roles" ON public.user_roles
        FOR ALL USING (auth.role() = 'service_role');
    `;
    
    // Execute via RPC if available, otherwise use direct SQL execution
    // For now, we'll use a workaround - check if table exists first
    const { data: tableCheck, error: tableError } = await supabase
      .from('user_roles')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.code === '42P01') {
      // Table doesn't exist, we need to create it
      console.log('⚠️  user_roles table does not exist.');
      console.log('📋 Please run this SQL in your Supabase SQL Editor to create the table:');
      console.log('\n' + '─'.repeat(60));
      console.log(createTableSQL);
      console.log('─'.repeat(60) + '\n');
      console.log('After creating the table, run this script again.');
      return;
    }
    
    console.log('✅ user_roles table exists\n');
    
    // Step 2: Find user by email
    console.log(`📋 Step 2: Finding user with email: ${email}...`);
    
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error fetching users:', userError);
      process.exit(1);
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      console.log('\nAvailable users:');
      users.users.slice(0, 10).forEach(u => {
        console.log(`  - ${u.email} (${u.id})`);
      });
      if (users.users.length > 10) {
        console.log(`  ... and ${users.users.length - 10} more`);
      }
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.email} (${user.id})\n`);
    
    // Step 3: Check if user already has admin role
    console.log('📋 Step 3: Checking existing roles...');
    
    const { data: existingRole, error: roleCheckError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    
    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
      console.error('❌ Error checking roles:', roleCheckError);
      process.exit(1);
    }
    
    if (existingRole) {
      console.log('✅ User already has admin role');
      console.log(`   Role ID: ${existingRole.id}`);
      console.log(`   Created: ${existingRole.created_at}`);
      return;
    }
    
    // Step 4: Add admin role
    console.log('📋 Step 4: Adding admin role...');
    
    const { data: newRole, error: insertError } = await supabase
      .from('user_roles')
      .insert({
        user_id: user.id,
        role: 'admin'
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Error adding admin role:', insertError);
      
      // If unique constraint violation, try to get existing role
      if (insertError.code === '23505') {
        console.log('⚠️  Role already exists (unique constraint)');
        const { data: existing } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .single();
        
        if (existing) {
          console.log('✅ Admin role already assigned');
          return;
        }
      }
      
      process.exit(1);
    }
    
    console.log('✅ Admin role added successfully!');
    console.log(`   Role ID: ${newRole.id}`);
    console.log(`   User: ${user.email}`);
    console.log(`   Role: admin`);
    
    // Step 5: Verify
    console.log('\n📋 Step 5: Verifying admin role...');
    
    const { data: verifyRole, error: verifyError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    
    if (verifyError || !verifyRole) {
      console.error('❌ Verification failed:', verifyError);
      process.exit(1);
    }
    
    console.log('✅ Verification successful!');
    console.log(`\n🎉 ${email} is now a superAdmin!`);
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Get email and role from command line arguments
const email = process.argv[2];
const role = process.argv[3] || 'admin'; // Default to 'admin', options: superAdmin, admin, moderator

if (!email) {
  console.error('❌ Please provide an email address');
  console.log('Usage: node create-admin-user.mjs <email> [role]');
  console.log('Roles: superAdmin, admin, moderator');
  console.log('Example: node create-admin-user.mjs user@example.com superAdmin');
  process.exit(1);
}

// Validate role
const validRoles = ['superAdmin', 'admin', 'moderator'];
if (!validRoles.includes(role)) {
  console.error(`❌ Invalid role: ${role}`);
  console.log(`Valid roles: ${validRoles.join(', ')}`);
  process.exit(1);
}

async function assignRole(email, role) {
  console.log(`🔧 Assigning ${role} role to: ${email}\n`);
  
  try {
    // Find user by email
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
    
    // Check if role already exists
    const { data: existingRole, error: roleCheckError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', role)
      .maybeSingle();
    
    if (existingRole) {
      console.log(`✅ User already has ${role} role`);
      return;
    }
    
    // Add role
    const { data: newRole, error: insertError } = await supabase
      .from('user_roles')
      .insert({
        user_id: user.id,
        role: role
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Error adding role:', insertError);
      process.exit(1);
    }
    
    console.log(`✅ ${role} role assigned successfully!`);
    console.log(`   Role ID: ${newRole.id}`);
    console.log(`   User: ${user.email}`);
    console.log(`   Role: ${role}`);
    
    // Show all roles for this user
    const { data: allRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .in('role', validRoles);
    
    if (allRoles && allRoles.length > 0) {
      console.log(`\n📋 All admin roles for ${email}:`);
      allRoles.forEach(r => {
        console.log(`   - ${r.role}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

assignRole(email, role).catch((e) => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});

