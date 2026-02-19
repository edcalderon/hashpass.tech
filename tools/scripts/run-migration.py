#!/usr/bin/env python3
"""
Database Migration Script
Reads connection strings from .env and runs the migration
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
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            # Split on first =
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                # Remove quotes
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                env_vars[key] = value
    return env_vars

def resolve_ipv4(hostname):
    """Resolve hostname to IPv4 address"""
    try:
        import socket
        # Try to get IPv4 address
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM)
        if addr_info:
            return addr_info[0][4][0]
    except:
        pass
    return None

def convert_to_pooler_format(url):
    """Convert direct database URL to pooler format"""
    if '://' not in url:
        return url
    
    scheme, rest = url.split('://', 1)
    
    if '@' not in rest:
        return url
    
    parts = rest.rsplit('@', 1)
    credentials_part = parts[0]
    host_db_part = parts[1]
    
    # Extract project reference from hostname
    # Format: db.[PROJECT-REF].supabase.co
    if ':' in host_db_part:
        hostname, port_path = host_db_part.split(':', 1)
    else:
        hostname = host_db_part.split('/')[0]
        port_path = '/'.join(host_db_part.split('/')[1:])
    
    # Extract project ref from hostname like db.tgbdilebadmzqwubsijr.supabase.co
    if '.supabase.co' in hostname:
        project_ref = hostname.replace('db.', '').replace('.supabase.co', '')
        # Use pooler format: aws-0-us-east-2.pooler.supabase.com (default to us-east-2)
        # You may need to adjust the region based on your Supabase project
        pooler_host = 'aws-0-us-east-2.pooler.supabase.com'
        # Username format: postgres.[PROJECT-REF]
        pooler_username = f'postgres.{project_ref}'
        
        # Reconstruct with pooler format
        if ':' in port_path:
            pooler_host_db = f'{pooler_host}:{port_path}'
        else:
            pooler_host_db = f'{pooler_host}/{port_path}' if '/' in port_path else pooler_host
        
        # Get password from credentials
        if ':' in credentials_part:
            _, password = credentials_part.split(':', 1)
            encoded_password = urllib.parse.quote(password, safe='')
            return f"{scheme}://{pooler_username}:{encoded_password}@{pooler_host_db}"
        else:
            return f"{scheme}://{pooler_username}@{pooler_host_db}"
    
    return url

def encode_db_url(url, force_ipv4=False, use_pooler=True):
    """URL-encode the password in connection string"""
    # Convert to pooler format first (avoids IPv6 issues)
    if use_pooler:
        url = convert_to_pooler_format(url)
    
    if '://' not in url:
        return url
    
    scheme, rest = url.split('://', 1)
    
    if '@' not in rest:
        return url
    
    # Handle passwords with @ character by finding the @ before pooler hostname
    # Pattern: username:password@hostname
    # If password contains @, we need to find the @ before the hostname
    # For pooler format: ...@aws-X-region.pooler.supabase.com
    
    # Find @ before pooler hostname
    pooler_pos = -1
    if '@aws-' in rest:
        pooler_pos = rest.find('@aws-')
    elif '@pooler' in rest:
        pooler_pos = rest.find('@pooler')
    
    if pooler_pos > 0:
        # Split at the @ before pooler hostname
        credentials_part = rest[:pooler_pos]
        host_db_part = rest[pooler_pos+1:]  # Skip the @
    else:
        # Fallback to rsplit (shouldn't happen with pooler format)
        parts = rest.rsplit('@', 1)
        credentials_part = parts[0]
        host_db_part = parts[1]
    
    if ':' in credentials_part:
        username, password = credentials_part.split(':', 1)
        encoded_password = urllib.parse.quote(password, safe='')
        return f"{scheme}://{username}:{encoded_password}@{host_db_part}"
    
    return url

def main():
    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    env_file = project_root / '.env'
    
    if not env_file.exists():
        print("❌ .env file not found")
        sys.exit(1)
    
    # Parse .env
    env_vars = parse_env_file(env_file)
    
    source_db_url = env_vars.get('SOURCE_DB_URL')
    prod_db_url = env_vars.get('PROD_DB_URL')
    
    if not source_db_url:
        print("❌ SOURCE_DB_URL not found in .env")
        sys.exit(1)
    
    if not prod_db_url:
        print("❌ PROD_DB_URL not found in .env")
        sys.exit(1)
    
    # Encode URLs (assuming they're already in pooler format)
    print("🔍 Encoding connection strings...")
    # Since URLs are already in pooler format, don't convert them
    source_encoded = encode_db_url(source_db_url, force_ipv4=False, use_pooler=False)
    prod_encoded = encode_db_url(prod_db_url, force_ipv4=False, use_pooler=False)
    
    # Debug: show encoded URLs (hide password)
    if '@' in source_encoded:
        source_user_host = source_encoded.split('@')[0] + '@' + source_encoded.split('@')[1].split('/')[0]
        print(f"Source connection: {source_user_host}...")
    if '@' in prod_encoded:
        prod_user_host = prod_encoded.split('@')[0] + '@' + prod_encoded.split('@')[1].split('/')[0]
        print(f"Production connection: {prod_user_host}...")
    
    print("🔄 Starting database migration...")
    # Extract hostname for display (handle both formats)
    try:
        if '@' in source_db_url:
            source_host = source_db_url.split('@')[1].split('/')[0]
        else:
            source_host = "N/A"
        if '@' in prod_db_url:
            prod_host = prod_db_url.split('@')[1].split('/')[0]
        else:
            prod_host = "N/A"
        print(f"Source: {source_host}")
        print(f"Production: {prod_host}\n")
    except:
        print("Source: (connection string loaded)")
        print("Production: (connection string loaded)\n")
    
    # Step 1: Extract schema
    schema_file = project_root / '.temp-schema-dump.sql'
    print("📦 Extracting schema from source database...")
    
    # Try IPv4 first by adding PGHOST and using direct connection
    # Use host network to bypass Docker networking issues
    dump_cmd = [
        'docker', 'run', '--rm',
        '--network', 'host',
        '-v', f'{project_root}:/data',
        'postgres:17',
        'pg_dump', source_encoded,
        '--schema-only',
        '--no-owner',
        '--no-privileges',
        '--no-tablespaces',
        '--clean',
        '--if-exists',
        '-f', f'/data/{schema_file.name}'
    ]
    
    # Set environment to prefer IPv4
    env = os.environ.copy()
    env['PGPREFERIPV4'] = '1'
    
    result = subprocess.run(dump_cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        print(f"❌ Error extracting schema:")
        print(result.stderr)
        sys.exit(1)
    
    if not schema_file.exists() or schema_file.stat().st_size == 0:
        # Try redirecting output
        with open(schema_file, 'w') as f:
            result = subprocess.run(
                ['docker', 'run', '--rm', '--network', 'host', 'postgres:17', 'pg_dump', source_encoded,
                 '--schema-only', '--no-owner', '--no-privileges', '--no-tablespaces',
                 '--clean', '--if-exists'],
                stdout=f, stderr=subprocess.PIPE, text=True, env=env
            )
            if result.returncode != 0:
                print(f"❌ Error extracting schema:")
                print(result.stderr)
                sys.exit(1)
    
    print("✅ Schema extracted successfully\n")
    
    # Step 2: Apply schema
    print("🚀 Applying schema to production database...")
    
    apply_cmd = [
        'docker', 'run', '--rm',
        '--network', 'host',
        '-v', f'{schema_file}:/schema.sql',
        'postgres:17',
        'psql', prod_encoded, '-f', '/schema.sql', '-q'
    ]
    
    result = subprocess.run(apply_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Error applying schema:")
        print(result.stderr)
        if schema_file.exists():
            schema_file.unlink()
        sys.exit(1)
    
    print("✅ Schema applied successfully\n")
    
    # Cleanup
    if schema_file.exists():
        schema_file.unlink()
        print("🧹 Cleaned up temporary files\n")
    
    print("✅ Migration completed successfully!")
    print("\n📝 Next steps:")
    print("  1. Verify tables, functions, and triggers in production database")
    print("  2. Check RLS policies are correctly applied")
    print("  3. Test RPC functions")
    print("  4. Update application environment variables to point to production")

if __name__ == '__main__':
    main()

