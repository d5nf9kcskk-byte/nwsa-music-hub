#!/usr/bin/env bash
# Stage epilogue for every Claude job in the weekly review:
#   - records cost / turns / duration / permission denials (<out>/<name>.cost.json)
#   - keeps the full transcript for debugging (<out>/<name>.transcript.json;
#     the caller repo is private, so this is safe to upload)
#   - rescues the deliverable if the model printed it as its final message
#     instead of writing the file (the first live run lost every lens this way)
# Usage: finish.sh <stage-label> <execution-file> <out-dir> <name> [expected-file]
set -u
STAGE="$1"; FILE="${2:-}"; OUT="$3"; NAME="$4"; EXPECTED="${5:-}"
mkdir -p "$OUT"
if [ -n "$FILE" ] && [ -f "$FILE" ]; then
  cp "$FILE" "$OUT/$NAME.transcript.json"
  node - "$STAGE" "$FILE" "$OUT/$NAME.cost.json" "$EXPECTED" <<'EOF'
const fs = require("fs");
const path = require("path");
const [stage, file, costOut, expected] = process.argv.slice(2);
let j = {};
try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.log(`::warning::${stage}: execution file is not JSON: ${e.message}`); }
const msgs = Array.isArray(j) ? j : [j];
const r = msgs.find((m) => m && m.type === "result") || {};
const denials = (r.permission_denials || []).map((d) => {
  const i = d.tool_input || {};
  return `${d.tool_name}${i.file_path ? " " + i.file_path : i.command ? " " + i.command : ""}`;
});
fs.writeFileSync(costOut, JSON.stringify({ stage, cost_usd: r.total_cost_usd ?? null, turns: r.num_turns ?? null, ms: r.duration_ms ?? null, is_error: r.is_error ?? null, denials }) + "\n");
if (denials.length) console.log(`::warning::${stage}: ${denials.length} permission denial(s): ${denials.join(" | ").slice(0, 600)}`);
if (expected && !fs.existsSync(expected) && typeof r.result === "string" && r.result.trim()) {
  let text = r.result;
  if (expected.endsWith(".json")) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b < a) { console.log(`::warning::${stage}: ${expected} missing and the final message holds no JSON`); process.exit(0); }
    text = text.slice(a, b + 1);
    try { JSON.parse(text); } catch (e) { console.log(`::warning::${stage}: ${expected} missing and the final message's JSON is unparsable: ${e.message}`); process.exit(0); }
  }
  fs.mkdirSync(path.dirname(expected), { recursive: true });
  fs.writeFileSync(expected, text.endsWith("\n") ? text : text + "\n");
  console.log(`::notice::${stage}: ${expected} was not written by the model; harvested it from the final message.`);
}
EOF
else
  echo "{\"stage\":\"$STAGE\",\"cost_usd\":null,\"note\":\"no execution file\"}" > "$OUT/$NAME.cost.json"
fi
cat "$OUT/$NAME.cost.json"
