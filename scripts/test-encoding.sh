#!/bin/bash

# Test encoding function
encode_db_url() {
    local url="$1"
    url="${url#\"}"
    url="${url%\"}"
    python3 - "$url" <<'PYTHON_SCRIPT'
import urllib.parse
import sys

url = sys.argv[1]

if '://' not in url:
    print(url)
    sys.exit(0)

scheme, rest = url.split('://', 1)

if '@' not in rest:
    print(url)
    sys.exit(0)

parts = rest.rsplit('@', 1)
credentials_part = parts[0]
host_db_part = parts[1]

if ':' in credentials_part:
    username, password = credentials_part.split(':', 1)
    encoded_password = urllib.parse.quote(password, safe='')
    new_url = f"{scheme}://{username}:{encoded_password}@{host_db_part}"
    print(new_url)
else:
    print(url)
PYTHON_SCRIPT
}

# Test with actual connection string
SOURCE_DB_URL="postgresql://postgres:zH_%@x5cAPcHX}G@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres"

echo "Original: $SOURCE_DB_URL"
ENCODED=$(encode_db_url "$SOURCE_DB_URL")
echo "Encoded: $ENCODED"


