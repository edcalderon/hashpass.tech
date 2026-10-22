#!/usr/bin/env bash
# Applies V128 to a throwaway Postgres (unix socket only, no network) and runs
# the access-boundary, validation, lockout and concurrency checks.
set -euo pipefail
repo_root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=$(pg_config --bindir)
pg_dir=$(mktemp -d /tmp/hashpass-user-pin-db.XXXXXX)
port=55498
cleanup() {
  "$pg_bin/pg_ctl" -D "$pg_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$pg_dir"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$pg_dir/data" -A trust --no-locale > "$pg_dir/init.log" 2>&1
"$pg_bin/pg_ctl" -D "$pg_dir/data" -l "$pg_dir/server.log" -o "-k $pg_dir -p $port -c listen_addresses=''" start >/dev/null
psql_run() { psql -h "$pg_dir" -p "$port" -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_run -f "$repo_root/db/tests/user_setup_pin.sql" > "$pg_dir/test.log" 2>&1 || { cat "$pg_dir/test.log"; exit 1; }

# Concurrency. The sql file deleted its user, so create fresh ones.
psql_run -q -c "INSERT INTO public.\"user\" VALUES ('00000000-0000-4000-8000-000000000010'), ('00000000-0000-4000-8000-000000000011');" >/dev/null

# 1. Two concurrent first-time PIN sets: exactly one wins, the other needs the current PIN.
for who in a b; do
  (
    verifier=$(printf '%064d' 0 | tr 0 "${who}")
    if psql_run -q -c "SET ROLE service_role; BEGIN; SELECT public.set_user_pin('00000000-0000-4000-8000-000000000010', '$verifier'); SELECT pg_sleep(0.2); COMMIT;" > "$pg_dir/set-$who.log" 2>&1; then
      touch "$pg_dir/set-ok-$who"
    fi
  ) &
done
wait
[ "$(find "$pg_dir" -name 'set-ok-*' | wc -l)" -eq 1 ] || { echo 'Concurrent first PIN set: expected exactly one winner'; cat "$pg_dir"/set-*.log; exit 1; }

# 2. Parallel wrong guesses cannot outrun the lockout: of 20 simultaneous misses,
#    exactly 5 are counted (row lock serialises them), the 5th locks the PIN, and
#    the other 15 are refused without being evaluated. No lost updates, no extra tries.
psql_run -q -c "SET ROLE service_role; SELECT public.set_user_pin('00000000-0000-4000-8000-000000000011', '$(printf '%064d' 0 | tr 0 d)');" >/dev/null
wrong=$(printf '%064d' 0 | tr 0 e)
for i in $(seq 1 20); do
  psql_run -q -c "SET ROLE service_role; SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000011', '$wrong');" > "$pg_dir/guess-$i.log" 2>&1 &
done
wait
attempts=$(psql_run -At -c "SELECT failed_attempts FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000011';")
[ "$attempts" -eq 5 ] || { echo "Guess accounting broken: counter is $attempts, expected exactly 5"; exit 1; }
refused=$(grep -l '"remainingAttempts": 0' "$pg_dir"/guess-*.log | wc -l)
[ "$refused" -ge 15 ] || { echo "Expected at least 15 refused guesses, saw $refused"; exit 1; }
locked=$(psql_run -At -c "SELECT locked_until > now() FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000011';")
[ "$locked" = "t" ] || { echo 'PIN not locked after 20 parallel wrong guesses'; exit 1; }

echo 'Verified V128: access boundary, unreadable verifier, validation, versioned consent, lockout escalation, concurrent set and concurrent guessing'
