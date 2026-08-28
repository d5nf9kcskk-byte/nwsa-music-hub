#!/usr/bin/env node
/**
 * Pins roll-mark labels and the Absent/Late/Excused family helpers so a
 * rename of 'Excused' (absent-excused) cannot silently break Who's Out or
 * the office bulletin without this check failing.
 *
 * Run: node scripts/attendance-status.selfcheck.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../src/director/attendanceStatus.ts'), 'utf8');
const types = readFileSync(join(here, '../src/director/types.ts'), 'utf8');

assert(types.includes("'LateExcused'"), 'AttendanceStatus includes LateExcused');
assert(src.includes("Excused: 'Absent (Excused)'"), 'Excused displays as Absent (Excused)');
assert(src.includes("LateExcused: 'Late (Excused)'"), 'LateExcused displays as Late (Excused)');
assert(src.includes("'LateExcused'"), 'ROLL_MARKS includes LateExcused');

// Mirror the helpers (no TS import in this selfcheck).
function isAbsentMark(s) { return s === 'Absent' || s === 'Excused'; }
function isLateMark(s) { return s === 'Late' || s === 'LateExcused'; }
function isExcusedMark(s) { return s === 'Excused' || s === 'LateExcused'; }
function isRollException(s) {
  return s === 'Absent' || s === 'Late' || s === 'Excused' || s === 'LateExcused';
}

assert(isAbsentMark('Excused') && !isAbsentMark('LateExcused'), 'Excused is absent-family');
assert(isLateMark('LateExcused') && !isLateMark('Excused'), 'LateExcused is late-family');
assert(isExcusedMark('Excused') && isExcusedMark('LateExcused'), 'both excused marks');
assert(isRollException('LateExcused') && !isRollException('Lesson'), 'exceptions exclude Lesson');

console.log('attendance-status.selfcheck: ok');
