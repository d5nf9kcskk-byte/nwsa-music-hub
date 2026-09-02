#!/usr/bin/env bash
# Week packet — stage 1 of the weekly review (docs/weekly-review.md).
#
# Deterministic and free: everything a script can establish about the week is
# printed here ONCE so no model spends turns re-deriving it. Every later stage
# reads packet/packet.md first.
#
# Never fails the job. Each probe is best-effort and reports what it saw; a
# missing tool or a dead endpoint is itself a finding, not a crash.
#
# Env:  REVIEW_DAYS (8)   how far back the review range reaches
#       REVIEW_DIR  (_review)  checkout of the caller repo (previous metrics,
#                              open findings, and last week's critic focus)
#       OUT         (packet)   output directory
#       GH_TOKEN               lets `gh run list` read CI conclusions
set -u
DAYS="${REVIEW_DAYS:-8}"
REVIEW_DIR="${REVIEW_DIR:-_review}"
OUT="${OUT:-packet}"
mkdir -p "$OUT"
P="$OUT/packet.md"
: > "$P"
say() { printf '%s\n' "$@" >> "$P"; }
fence() { say '```'; cat >> "$P"; say '```' ''; }

# ── Range & rotation ─────────────────────────────────────────────────────────
BASE=$(git rev-list -1 --before="$DAYS days ago" HEAD 2>/dev/null || true)
RANGE="${BASE:+$BASE..}HEAD"
COUNT=$(git rev-list --count "$RANGE" 2>/dev/null || echo 0)
HEAD_SHA=$(git rev-parse --short HEAD)
TODAY=$(date -u +%F)
WEEK=$(date -u +%V)
IDX=$((10#$WEEK % 5))
AREAS=(
  "firestore.rules, storage.rules, src/director/hooks, src/public/hooks (rules vs. the queries that must agree with them)"
  "functions/, scripts/, .github/workflows (Cloud Functions, feeds, seeds, migrations, deploy pipelines)"
  "src/public and src/shared (the student/parent site and the modules both sides share)"
  "src/director (the director screens: schedule, attendance, sign-ups, juries, lessons, personnel)"
  "src/pwa.ts, vite.config.ts, public/, docs/, CLAUDE.md (PWA, build, and whether the docs still describe the code)"
)
echo "$RANGE" > "$OUT/range.txt"
export REVIEW_RANGE="$RANGE"

HUB_REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]##; s#\.git$##')
OWNER=${HUB_REPO%%/*}
NAME=${HUB_REPO#*/}
SITE="https://${OWNER}.github.io/${NAME}"
# fs + JSON.parse, not require(): an extension-less file is parsed as JavaScript by require.
PROJECT=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(".firebaserc","utf8")).projects.default)}catch{console.log("")}' 2>/dev/null)
FN="https://us-central1-${PROJECT}.cloudfunctions.net"

say "# Week packet — $TODAY" ""
say "- Repo: $HUB_REPO at $HEAD_SHA"
say "- Review range: \`$RANGE\` — $COUNT commits in the last $DAYS days"
say "- Deep-dive area this week (ISO week $WEEK mod 5 = $IDX): ${AREAS[$IDX]}"
say "- Site: $SITE — Functions: $FN" ""

if [ -f "$REVIEW_DIR/reviews/focus.md" ]; then
  say "## Extra focus carried from last week's critic" ""
  cat "$REVIEW_DIR/reviews/focus.md" >> "$P"
  say ""
fi

# ── Commits ──────────────────────────────────────────────────────────────────
say "## Commits in range" ""
if [ "$COUNT" -gt 0 ]; then
  git log --format='- %h %ad %s' --date=short "$RANGE" >> "$P"
else
  say "(no commits on main in the last $DAYS days — review the deep-dive area and carried items)"
fi
say ""
say "## Files changed (top 120 by lines changed; added/removed)" ""
git diff --numstat "$RANGE" 2>/dev/null | awk '{ printf "%6d %6d  %s\n", $1, $2, $3 }' | sort -rn | head -n 120 | fence
say "- Files changed in range: $(git diff --name-only "$RANGE" 2>/dev/null | wc -l | tr -d ' ')" ""

# ── CI ───────────────────────────────────────────────────────────────────────
say "## CI — runs that did not succeed in the last $DAYS days (all workflows)" ""
SINCE=$(date -u -d "$DAYS days ago" +%F 2>/dev/null || date -u -v-"${DAYS}"d +%F)
if command -v gh >/dev/null 2>&1; then
  RUNS=$(gh run list -R "$HUB_REPO" --limit 300 --created ">=$SINCE" \
           --json workflowName,conclusion,createdAt,url,event 2>/dev/null || echo '[]')
  TOTAL=$(printf '%s' "$RUNS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(0)}})')
  printf '%s' "$RUNS" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let runs=[];try{runs=JSON.parse(s)}catch{}
      const bad=runs.filter(r=>r.conclusion&&!["success","skipped"].includes(r.conclusion));
      if(!runs.length){console.log("(could not list runs — no gh token, or the API refused)");return}
      if(!bad.length){console.log("None — "+runs.length+" runs, all green.");return}
      for(const r of bad)console.log(`- ${r.createdAt} ${r.workflowName} (${r.event}): **${r.conclusion}** ${r.url}`)
      console.log("",`(${bad.length} of ${runs.length} runs)`)
    })' >> "$P"
else
  say "(gh not installed)"
fi
say ""

# ── Live probes ──────────────────────────────────────────────────────────────
say "## Live probes" ""
probe() { # url label expected
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null) || code="000 (no response)"
  if [ "$code" = "$3" ]; then say "- ✓ $2: HTTP $code"; else say "- ⚠ $2: HTTP $code (expected $3)"; fi
}
probe "$SITE/" "Public site" 200
probe "$SITE/feeds/index.json" "feeds/index.json" 200
probe "$SITE/sw.js" "Service worker" 200
probe "$SITE/manifest.json" "Web manifest" 200
probe "$FN/lessonsFeed/not-a-real-token.ics" "lessonsFeed with a bad token (must 404, never 200/500)" 404
probe "$FN/appointmentsFeed/not-a-real-token.ics" "appointmentsFeed with a bad token (must 404)" 404
probe "$FN/concertCheckin" "concertCheckin GET (405 = alive, POST-only)" 405
VEVENTS=$(curl -s --max-time 20 "$SITE/feeds/all.ics" 2>/dev/null | grep -c BEGIN:VEVENT || echo 0)
say "- all.ics VEVENT count: $VEVENTS" ""

# ── Build, lint, types, audit ────────────────────────────────────────────────
say "## Build, lint, types, audit" ""
prev() { node -e 'try{const m=require(process.argv[1]);const v=process.argv[2].split(".").reduce((o,k)=>o&&o[k],m);console.log(v==null?"":v)}catch{console.log("")}' "$REVIEW_DIR/reviews/metrics.json" "$1" 2>/dev/null; }

LINT_OUT=$(npm run lint --silent 2>&1 || true)
LINT_LINE=$(printf '%s\n' "$LINT_OUT" | grep -oE '[0-9]+ problems? \([0-9]+ errors?, [0-9]+ warnings?\)' | tail -1)
LINT_P=$(printf '%s' "$LINT_LINE" | grep -oE '^[0-9]+' || echo 0)
LINT_E=$(printf '%s' "$LINT_LINE" | grep -oE '[0-9]+ error' | grep -oE '[0-9]+' || echo 0)
LINT_W=$(printf '%s' "$LINT_LINE" | grep -oE '[0-9]+ warning' | grep -oE '[0-9]+' || echo 0)
: "${LINT_P:=0}"; : "${LINT_E:=0}"; : "${LINT_W:=0}"
PREV_LINT=$(prev lint.problems)
say "- Lint (\`npm run lint\`, NOT in CI): ${LINT_P} problems (${LINT_E} errors, ${LINT_W} warnings)${PREV_LINT:+ — last week: $PREV_LINT}"
# New lint problems in files touched this week are the signal; the backlog is noise.
CHANGED=$(git diff --name-only "$RANGE" 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
if [ -n "$CHANGED" ]; then
  say "  Lint problems in files changed this week:"
  printf '%s\n' "$LINT_OUT" | node -e '
    const changed=new Set(process.argv.slice(1));let s="";
    process.stdin.on("data",d=>s+=d).on("end",()=>{
      let file=null,out=[];for(const line of s.split("\n")){
        const m=line.match(/^(\/\S+?\.tsx?)(?::\d+:\d+)?$/);if(m){file=m[1].replace(/^.*?\/(src|scripts|functions)\//,"$1/");continue}
        if(file&&changed.has(file)&&/^\s+\d+:\d+\s+(error|warning)/.test(line))out.push("  - "+file+" "+line.trim().replace(/\s{2,}/g," "))
      }
      console.log(out.length?out.slice(0,25).join("\n")+(out.length>25?"\n  - …"+(out.length-25)+" more":""):"  (none)")
    })' $CHANGED >> "$P"
fi
say ""

TSC_OUT=$(npx tsc -b 2>&1 || true)
TSC_E=$(printf '%s\n' "$TSC_OUT" | grep -c 'error TS' || true)
say "- Type check (\`tsc -b\`): ${TSC_E} errors"
[ "$TSC_E" -gt 0 ] && printf '%s\n' "$TSC_OUT" | grep 'error TS' | head -20 | fence

# Determinism contract (CLAUDE.md → PWA): unchanged source → byte-identical sw.js.
B1=$(npm run build --silent 2>&1 || true)
H1=$(printf '%s\n' "$B1" | grep -oE '\[sw-precache\].*' | tail -1)
B2=$(npm run build --silent 2>&1 || true)
H2=$(printf '%s\n' "$B2" | grep -oE '\[sw-precache\].*' | tail -1)
if [ -z "$H1" ]; then
  say "- ⚠ Build: no \`[sw-precache]\` line — build failed or the log contract changed:"
  printf '%s\n' "$B1" | tail -25 | fence
elif [ "$H1" = "$H2" ]; then
  say "- ✓ Build ×2: sw.js hash stable (\`$H1\`)"
else
  say "- ⚠ Build ×2: sw.js hash CHANGED between two builds of the same source — the determinism contract is broken:" "  1: $H1" "  2: $H2"
fi
ASYO=$(grep -rli asyo dist 2>/dev/null | head -5 || true)
if [ -n "$ASYO" ]; then say "- ⚠ White-label leak: 'asyo' appears in the NWSA dist:" && printf '%s\n' "$ASYO" | fence; else say "- ✓ No demo-org strings in dist"; fi
SWHASH=$(printf '%s' "$H1" | grep -oE '[0-9a-f]{6,}' | tail -1)
PREV_SW=$(prev build.swHash)
[ -n "$PREV_SW" ] && [ "$SWHASH" = "$PREV_SW" ] && say "- Note: sw.js hash unchanged since last week's review (no shipped change to the app shell)"
say ""

AUDIT=$(npm audit --omit=dev --json 2>/dev/null || true)
AUD_SUMMARY=$(printf '%s' "$AUDIT" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);const v=j.metadata.vulnerabilities;
      const list=Object.entries(j.vulnerabilities||{}).map(([k,x])=>`  - ${k}: ${x.severity}${x.fixAvailable?" (fix available)":""}`).slice(0,15).join("\n");
      console.log(`${v.total} (critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low})`+(list?"\n"+list:""))}
    catch{console.log("(npm audit produced no JSON)")}})')
AUD_TOTAL=$(printf '%s' "$AUD_SUMMARY" | head -1 | grep -oE '^[0-9]+' || echo 0)
PREV_AUD=$(prev audit.total)
say "- npm audit (prod deps): ${AUD_SUMMARY}${PREV_AUD:+ — last week: $PREV_AUD}" ""
say "- npm outdated (majors are the ones to think about):"
npm outdated 2>/dev/null | head -25 | fence

# ── Drift (deterministic) ────────────────────────────────────────────────────
node scripts/weekly-review/drift.mjs >> "$P" 2>&1 || say "(drift.mjs crashed — that is itself a finding)" ""

# ── Carried state ────────────────────────────────────────────────────────────
if [ -f "$REVIEW_DIR/reviews/open.json" ]; then
  say "## Open findings carried from previous weeks (verify each against today's code)" ""
  node -e 'try{const o=require(process.argv[1]);if(!o.length)console.log("(none — nothing is carried; either this is the first week or every earlier item was closed. This is normal, not a pipeline fault.)");for(const f of o)console.log(`- ${f.id} [${f.category}/${f.severity}] ${f.title} — ${f.file}${f.line?":"+f.line:""} (first seen ${f.first_seen})`)}catch{console.log("(open.json unreadable — report this in Health)")}' "$REVIEW_DIR/reviews/open.json" >> "$P"
  say ""
fi

# ── Metrics for next week's deltas ───────────────────────────────────────────
node -e '
  const [date,lp,le,lw,tsc,aud,vev,sw]=process.argv.slice(1);
  console.log(JSON.stringify({date,lint:{problems:+lp,errors:+le,warnings:+lw},tsc:{errors:+tsc},audit:{total:+aud},feeds:{vevents:+vev},build:{swHash:sw}},null,2))
' "$TODAY" "$LINT_P" "$LINT_E" "$LINT_W" "$TSC_E" "$AUD_TOTAL" "$VEVENTS" "$SWHASH" > "$OUT/metrics.json"

echo "packet: $(wc -c < "$P") bytes → $P"
exit 0
