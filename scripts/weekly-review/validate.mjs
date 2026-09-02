// Shape check for a lens/verify findings file. Prints GitHub `::warning::`
// annotations so a malformed file is visible in the run without failing it —
// the verify and report prompts already cope with a missing or bad file.
// Usage: node scripts/weekly-review/validate.mjs findings/security.json
import { readFileSync, existsSync } from 'node:fs';

const path = process.argv[2];
const warn = (m) => console.log(`::warning file=${path}::${m}`);
if (!path || !existsSync(path)) { warn('findings file missing'); process.exit(0); }
let j;
try { j = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { warn(`not valid JSON: ${e.message}`); process.exit(0); }

const CATS = ['broken', 'security', 'drift', 'ux', 'implement', 'remove', 'rework', 'health'];
const SEV = ['high', 'medium', 'low'];
const EFF = ['S', 'M', 'L'];
let problems = 0;
if (typeof j.lens !== 'string') { warn('missing "lens"'); problems++; }
if (!j.reviewed || typeof j.reviewed.notes !== 'string') { warn('missing "reviewed.notes"'); problems++; }
if (!Array.isArray(j.findings)) { warn('"findings" is not an array'); process.exit(0); }
j.findings.forEach((f, i) => {
  for (const k of ['id', 'category', 'severity', 'title', 'file', 'evidence', 'impact', 'fix', 'effort']) {
    if (typeof f[k] !== 'string' || !f[k]) { warn(`findings[${i}] missing "${k}"`); problems++; }
  }
  if (f.category && !CATS.includes(f.category)) { warn(`findings[${i}] bad category "${f.category}"`); problems++; }
  if (f.severity && !SEV.includes(f.severity)) { warn(`findings[${i}] bad severity "${f.severity}"`); problems++; }
  if (f.effort && !EFF.includes(f.effort)) { warn(`findings[${i}] bad effort "${f.effort}"`); problems++; }
  if (f.verdict && !['confirmed', 'refuted', 'unclear'].includes(f.verdict)) { warn(`findings[${i}] bad verdict "${f.verdict}"`); problems++; }
});
console.log(`${path}: ${j.findings.length} findings, ${problems} shape problems`);
