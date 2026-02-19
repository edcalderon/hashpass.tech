#!/usr/bin/env python3
"""
Test connection to production database
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
    
    if ':' in host_db_part:
        hostname, port_path = host_db_part.split(':', 1)
    else:
        hostname = host_db_part.split('/')[0]
        port_path = '/'.join(host_db_part.split('/')[1:])
    
    if '.supabase.co' in hostname:
        project_ref = hostname.replace('db.', '').replace('.supabase.co', '')
        pooler_host = 'aws-0-us-east-2.pooler.supabase.com'
        pooler_username = f'postgres.{project_ref}'
        
        if ':' in port_path:
            pooler_host_db = f'{pooler_host}:{port_path}'
        else:
            pooler_host_db = f'{pooler_host}/{port_path}' if '/' in port_path else pooler_host
        
        if ':' in credentials_part:
            _, password = credentials_part.split(':', 1)
            encoded_password = urllib.parse.quote(password, safe='')
            return f"{scheme}://{pooler_username}:{encoded_password}@{pooler_host_db}"
        else:
            return f"{scheme}://{pooler_username}@{pooler_host_db}"
    
    return url

def encode_db_url(url):
    """URL-encode the password in connection string (assumes pooler format)"""
    if '://' not in url:
        return url
    
    scheme, rest = url.split('://', 1)
    
    if '@' not in rest:
        return url
    
    parts = rest.rsplit('@', 1)
    credentials_part = parts[0]
    host_db_part = parts[1]
    
    if ':' in credentials_part:
        username, password = credentials_part.split(':', 1)
        encoded_password = urllib.parse.quote(password, safe='')
        return f"{scheme}://{username}:{encoded_password}@{host_db_part}"
    
    return url

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    env_file = project_root / '.env'
    
    if not env_file.exists():
        print("❌ .env file not found")
        sys.exit(1)
    
    env_vars = parse_env_file(env_file)
    prod_db_url = env_vars.get('PROD_DB_URL')
    
    if not prod_db_url:
        print("❌ PROD_DB_URL not found in .env")
        sys.exit(1)
    
    prod_encoded = encode_db_url(prod_db_url)
    
    # Extract hostname for display
    if '@' in prod_db_url:
        host = prod_db_url.split('@')[1].split('/')[0]
    else:
        host = "N/A"
    
    print(f"🔍 Testing connection to production database...")
    print(f"Host: {host}\n")
    
    # Test connection using psql
    test_cmd = [
        'docker', 'run', '--rm',
        '--network', 'host',
        'postgres:17',
        'psql', prod_encoded, '-c', 'SELECT version();'
    ]
    
    print("Running: psql -c 'SELECT version();'")
    result = subprocess.run(test_cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ Connection successful!")
        print("\nPostgreSQL version:")
        print(result.stdout)
    else:
        print("❌ Connection failed:")
        print(result.stderr)
        if result.stdout:
            print("\nOutput:")
            print(result.stdout)
        sys.exit(1)

if __name__ == '__main__':
    main()

