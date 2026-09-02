#!/usr/bin/env bash
# Pull cost/turns/duration out of claude-code-action's execution file so the
# report's Stats section can print what each stage actually spent.
# Usage: cost.sh <stage-name> <execution-file> <out.json>
set -u
STAGE="$1"; FILE="${2:-}"; OUT="$3"
mkdir -p "$(dirname "$OUT")"
if [ -n "$FILE" ] && [ -f "$FILE" ]; then
  node -e '
    const [stage,file]=process.argv.slice(1);
    let j=JSON.parse(require("fs").readFileSync(file,"utf8"));
    if(Array.isArray(j)) j=j.find(m=>m&&m.type==="result")||{};
    console.log(JSON.stringify({stage,cost_usd:j.total_cost_usd??null,turns:j.num_turns??null,ms:j.duration_ms??null,is_error:j.is_error??null}))
  ' "$STAGE" "$FILE" > "$OUT" 2>/dev/null || echo "{\"stage\":\"$STAGE\",\"cost_usd\":null,\"note\":\"could not parse execution file\"}" > "$OUT"
else
  echo "{\"stage\":\"$STAGE\",\"cost_usd\":null,\"note\":\"no execution file\"}" > "$OUT"
fi
cat "$OUT"
