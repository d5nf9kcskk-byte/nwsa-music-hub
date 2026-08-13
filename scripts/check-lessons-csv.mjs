/** Tiny assert: lessons CSV keeps Grade column for Dean tracking. Run: node scripts/check-lessons-csv.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/director/lessons/lessonsCsv.ts'), 'utf8');
const need = ["'Grade'", "'Teacher email'", "'Pull-out override ID'", "'Student ID'"];
for (const n of need) {
  if (!src.includes(n)) {
    console.error(`lessonsCsv missing column ${n}`);
    process.exit(1);
  }
}
console.log('ok: lessons CSV columns present');
