#!/usr/bin/env bash
# Single-PIN model against a real database: one verifier per account, no surface can
# register a second PIN, change requires the current one, and recovery still ends with
# exactly one verifier. V128 + V138 applied from scratch.
set -euo pipefail
repo_root=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
wallet_pg_bin=$(pg_config --bindir)
wallet_pg_dir=$(mktemp -d /tmp/hashpass-wallet-db.XXXXXX)
cleanup() {
  "$wallet_pg_bin/pg_ctl" -D "$wallet_pg_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$wallet_pg_dir"
}
trap cleanup EXIT
"$wallet_pg_bin/initdb" -D "$wallet_pg_dir/data" -A trust --no-locale > "$wallet_pg_dir/init.log" 2>&1
"$wallet_pg_bin/pg_ctl" -D "$wallet_pg_dir/data" -l "$wallet_pg_dir/server.log" -o "-k $wallet_pg_dir -p 55498 -c listen_addresses=''" start >/dev/null
psql -h "$wallet_pg_dir" -p 55498 -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/packages/wallet/test/db/pin.sql" > "$wallet_pg_dir/test.log" 2>&1 || { cat "$wallet_pg_dir/test.log"; exit 1; }
echo 'Verified single-PIN model: one verifier per account, no second PIN from any surface, change needs the current PIN, recovery ends with one verifier'
