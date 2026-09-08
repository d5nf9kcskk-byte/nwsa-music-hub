#!/usr/bin/env node
/**
 * Pins the playing-exam grade row's video element (#exam-rubric).
 *
 * Neither promise here has a runtime handle — they are JSX attributes — and
 * both fail SILENTLY in opposite directions, which is why they are checked as
 * source text rather than trusted to review:
 *
 *   1. ONE <video> in the file. The player belongs to the OPEN row only. A
 *      player per row would start pulling a roster of 500 MB playing-exam
 *      videos because a page rendered.
 *   2. preload="metadata", explicitly. Dropping the attribute lets the
 *      browser choose (Chrome's default is effectively "auto"), which fetches
 *      the file nobody asked for. Setting it to "none" leaves the element at
 *      readyState 0 with duration NaN, so the player is a dead black
 *      rectangle reading 0:00 with no total time and no first frame — it
 *      reads as "not playable" and the grader goes back to opening the link,
 *      which is the entire thing this screen replaced. That shipped on
 *      2026-09-08 and was reported the same day.
 *
 * Lives in scripts/ rather than beside the module: it reads a file, and
 * tsconfig.app.json carries no node types, so a `node:fs` import under src/
 * fails `tsc -b` and takes the build with it.
 */
import { readFileSync } from 'node:fs';

const FILE = new URL('../src/director/assignments/GradeRow.tsx', import.meta.url);

function assert(cond, msg) {
  if (!cond) {
    console.error(`grade-video self-check FAILED: ${msg}`);
    process.exit(1);
  }
}

const src = readFileSync(FILE, 'utf8');
// The comments talk ABOUT the element; strip them before counting the real one.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '');

const players = code.match(/<video\b/g) ?? [];
assert(players.length === 1,
  `expected exactly ONE <video> in GradeRow.tsx, found ${players.length} — the player belongs to the open row alone`);

assert(/preload="metadata"/.test(code),
  'the grade row video must set preload="metadata" — "none" renders as unplayable, and omitting it lets the browser pull the whole file');
assert(!/preload="(none|auto)"/.test(code),
  'preload must be neither "none" (looks broken) nor "auto" (downloads a 500 MB exam)');

console.log('grade-video self-check OK');
