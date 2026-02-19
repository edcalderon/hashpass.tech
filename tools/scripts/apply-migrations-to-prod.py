#!/usr/bin/env python3
"""
Apply all migration files from supabase/migrations/ to production database
"""

import os
import subprocess
import urllib.parse
import sys
from pathlib import Path

def parse_env_file(env_path):
    """Parse .env file and extract variables"""
    env_vars = {}
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                env_vars[key] = value
    return env_vars

def encode_db_url(url):
    """URL-encode the password in connection string"""
    if '://' not in url:
        return url
    
    scheme, rest = url.split('://', 1)
    
    if '@' not in rest:
        return url
    
    # Find @ before pooler hostname
    pooler_pos = rest.find('@aws-')
    if pooler_pos > 0:
        credentials = rest[:pooler_pos]
        host_db = rest[pooler_pos+1:]
        if ':' in credentials:
            username, password = credentials.split(':', 1)
            encoded_password = urllib.parse.quote(password, safe='')
            return f"{scheme}://{username}:{encoded_password}@{host_db}"
    
    return url

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    env_file = project_root / '.env'
    migrations_dir = project_root / 'supabase' / 'migrations'
    
    if not env_file.exists():
        print("❌ .env file not found")
        sys.exit(1)
    
    if not migrations_dir.exists():
        print("❌ supabase/migrations directory not found")
        sys.exit(1)
    
    # Parse .env
    env_vars = parse_env_file(env_file)
    prod_db_url = env_vars.get('PROD_DB_URL')
    
    if not prod_db_url:
        print("❌ PROD_DB_URL not found in .env")
        sys.exit(1)
    
    # Encode URL
    prod_encoded = encode_db_url(prod_db_url)
    
    # Get all migration files sorted by name
    migration_files = sorted(migrations_dir.glob('*.sql'))
    
    if not migration_files:
        print("❌ No migration files found in supabase/migrations/")
        sys.exit(1)
    
    print(f"🔄 Applying {len(migration_files)} migration files to production database...")
    print(f"Production: {prod_db_url.split('@')[1].split('/')[0] if '@' in prod_db_url else 'N/A'}\n")
    
    # Apply each migration file
    for i, migration_file in enumerate(migration_files, 1):
        print(f"[{i}/{len(migration_files)}] Applying {migration_file.name}...")
        
        apply_cmd = [
            'docker', 'run', '--rm',
            '--network', 'host',
            '-v', f'{migration_file}:/migration.sql',
            'postgres:17',
            'psql', prod_encoded, '-f', '/migration.sql', '-q'
        ]
        
        result = subprocess.run(apply_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ Error applying {migration_file.name}:")
            print(result.stderr)
            if result.stdout:
                print("\nOutput:", result.stdout)
            print("\n⚠️  Migration stopped. Previous migrations may have been applied.")
            sys.exit(1)
        else:
            print(f"✅ {migration_file.name} applied successfully")
    
    print(f"\n✅ All {len(migration_files)} migrations applied successfully!")
    print("\n📝 Next steps:")
    print("  1. Verify tables, functions, and triggers in production database")
    print("  2. Check RLS policies are correctly applied")
    print("  3. Test RPC functions")
    print("  4. Update application environment variables to point to production")

if __name__ == '__main__':
    main()


