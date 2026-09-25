#!/usr/bin/env bash
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
"$wallet_pg_bin/pg_ctl" -D "$wallet_pg_dir/data" -l "$wallet_pg_dir/server.log" -o "-k $wallet_pg_dir -p 55497 -c listen_addresses=''" start >/dev/null
psql -h "$wallet_pg_dir" -p 55497 -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/packages/wallet/test/db/enrollment.sql" > "$wallet_pg_dir/test.log" 2>&1 || { cat "$wallet_pg_dir/test.log"; exit 1; }
psql -h "$wallet_pg_dir" -p 55497 -d postgres -v ON_ERROR_STOP=1 -c "INSERT INTO public.\"user\" VALUES ('00000000-0000-4000-8000-000000000004');" >/dev/null
# Two sessions race for the same untouched enrollment; exactly one must win.
for operation in 21 22; do
  (
    if psql -h "$wallet_pg_dir" -p 55497 -d postgres -v ON_ERROR_STOP=1 -c "SET ROLE service_role; BEGIN; SELECT public.reserve_user_wallet('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000$operation', 'testnet'); SELECT pg_sleep(0.2); COMMIT;" > "$wallet_pg_dir/race-$operation.log" 2>&1; then
      touch "$wallet_pg_dir/won-$operation"
    fi
  ) &
done
wait
winner_count=$(find "$wallet_pg_dir" -name 'won-*' | wc -l)
[ "$winner_count" -eq 1 ] || { echo 'Concurrent enrollment test failed'; exit 1; }
echo 'Verified enrollment backfill, signup trigger, access boundary, idempotency, no replacement, and concurrent reservation'
