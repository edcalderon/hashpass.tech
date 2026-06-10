#!/usr/bin/env python3
"""Test source database connection"""

from pathlib import Path
import urllib.parse
import subprocess
import sys

def parse_env_file(env_path):
    env_vars = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                env_vars[key] = value
    return env_vars

def encode_db_url(url):
    if '://' not in url:
        return url
    scheme, rest = url.split('://', 1)
    if '@' not in rest:
        return url
    
    pooler_pos = rest.find('@aws-')
    if pooler_pos > 0:
        credentials = rest[:pooler_pos]
        host_db = rest[pooler_pos+1:]
        if ':' in credentials:
            username, password = credentials.split(':', 1)
            encoded_pass = urllib.parse.quote(password, safe='')
            return f"{scheme}://{username}:{encoded_pass}@{host_db}"
    
    return url

env_file = Path('.env')
env_vars = parse_env_file(env_file)
source_url = env_vars.get('SOURCE_DB_URL')

if not source_url:
    print("❌ SOURCE_DB_URL not found")
    sys.exit(1)

encoded = encode_db_url(source_url)
print(f"🔍 Testing source connection...")
print(f"URL: {encoded.split('@')[0]}@...")

result = subprocess.run(
    ['docker', 'run', '--rm', '--network', 'host', 'postgres:17',
     'psql', encoded, '-c', 'SELECT version();'],
    capture_output=True, text=True, timeout=30
)

if result.returncode == 0:
    print("✅ Connection successful!")
    print(result.stdout)
else:
    print("❌ Connection failed:")
    print(result.stderr)


