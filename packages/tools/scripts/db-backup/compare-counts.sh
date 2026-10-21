#!/usr/bin/env bash
# Compare "table|count" files: expected (taken from the source at backup time)
# vs actual (taken from the restored copy). The source keeps taking writes while
# the dump runs, so a small drift is allowed; a missing table or a big gap fails.
# Usage: compare-counts.sh expected.txt actual.txt
set -euo pipefail
expected="$1"; actual="$2"
fail=0; checked=0
while IFS='|' read -r table want; do
  [ -n "$table" ] || continue
  got=$(grep -m1 "^${table}|" "$actual" | cut -d'|' -f2 || true)
  checked=$((checked + 1))
  if [ -z "$got" ]; then echo "MISSING  $table (expected $want)"; fail=1; continue; fi
  diff=$((got > want ? got - want : want - got))
  allowed=$(( want / 50 > 5 ? want / 50 : 5 ))   # 2% or 5 rows, whichever is larger
  if [ "$diff" -gt "$allowed" ]; then echo "MISMATCH $table expected=$want restored=$got"; fail=1; fi
done < "$expected"
echo "compared $checked tables"
[ "$checked" -gt 0 ] || { echo "no tables compared"; exit 1; }
exit "$fail"
