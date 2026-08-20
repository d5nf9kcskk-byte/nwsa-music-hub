import fs from 'fs';
import crypto from 'crypto';
const src = fs.readFileSync(process.argv[2], 'utf8');
const start = src.indexOf("piece('rp26-holberg-suite', {");
const objStart = src.indexOf('{', start);
let d = 0, end = -1;
for (let i = objStart; i < src.length; i++) { const c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = i; break; } } }
const CAM='camerata-string-orchestra';const obj = eval('(' + src.slice(objStart, end + 1) + ')');
const canon = o => Array.isArray(o) ? o.map(canon)
  : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => (a[k] = canon(o[k]), a), {})
  : o;
const c = canon(obj);
const json = JSON.stringify(c);
console.log('SHA ' + crypto.createHash('sha256').update(json).digest('hex').slice(0, 16));
for (const k of Object.keys(c).sort()) {
  const v = c[k];
  const desc = Array.isArray(v) ? 'arr[' + v.length + ']' : typeof v === 'string' ? 'str(' + v.length + ')' : String(v);
  console.log(k + ' = ' + desc);
}
console.log('PARTS ' + c.partsLinks.map(p => p.instrument + '>' + p.url.split('/d/')[1].split('/')[0]).join(' '));
