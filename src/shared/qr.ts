/**
 * Self-contained QR code generator (#5) — no dependencies.
 *
 * Byte mode, error-correction level M, versions 1–10 chosen automatically
 * (up to 213 UTF-8 bytes — plenty for our URLs). The algorithm follows the
 * ISO/IEC 18004 spec directly (Reed–Solomon over GF(2^8)/0x11D, BCH format
 * and version bits, mask selection by penalty score); the structure mirrors
 * well-known public reference implementations.
 *
 * Public API:
 *   qrEncode(text)                → { size, get(x, y) } module matrix
 *   qrToSvgPath(text, moduleSize) → SVG <path d="…"> data for the dark modules
 *   renderQrSvg(text, opts?)      → complete standalone <svg> markup string
 */

/* ── GF(2^8) arithmetic, primitive polynomial 0x11D ──────────────────── */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Reed–Solomon generator polynomial of the given degree.
 *  Coefficients highest-power first, leading 1 omitted. */
function rsGenerator(degree: number): Uint8Array {
  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1; // start with the monomial x^0
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return poly;
}

/** Remainder of data ⋅ x^degree divided by the generator polynomial. */
function rsRemainder(data: Uint8Array, gen: Uint8Array): Uint8Array {
  const result = new Uint8Array(gen.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < gen.length; i++) result[i] ^= gfMul(gen[i], factor);
  }
  return result;
}

/* ── Version tables, EC level M only (versions 1–10) ─────────────────── */

/** Per version: [ecCodewordsPerBlock, [numBlocks, dataCodewordsPerBlock][]] */
const BLOCKS_M: [number, [number, number][]][] = [
  [10, [[1, 16]]],           // v1  — 16 data codewords
  [16, [[1, 28]]],           // v2  — 28
  [26, [[1, 44]]],           // v3  — 44
  [18, [[2, 32]]],           // v4  — 64
  [24, [[2, 43]]],           // v5  — 86
  [16, [[4, 27]]],           // v6  — 108
  [18, [[4, 31]]],           // v7  — 124
  [22, [[2, 38], [2, 39]]],  // v8  — 154
  [22, [[3, 36], [2, 37]]],  // v9  — 182
  [26, [[4, 43], [1, 44]]],  // v10 — 216
];

/** Alignment pattern center coordinates per version. */
const ALIGN: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function dataCodewords(version: number): number {
  const [, groups] = BLOCKS_M[version - 1];
  return groups.reduce((n, [count, len]) => n + count * len, 0);
}

/* ── Bit buffer ──────────────────────────────────────────────────────── */

class BitBuf {
  bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/* ── Codeword assembly ───────────────────────────────────────────────── */

function buildCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacityBits = dataCodewords(version) * 8;
  const buf = new BitBuf();
  buf.push(0b0100, 4);                              // byte mode
  buf.push(bytes.length, version <= 9 ? 8 : 16);    // character count
  for (const b of bytes) buf.push(b, 8);
  // Terminator + pad to byte boundary
  buf.push(0, Math.min(4, capacityBits - buf.bits.length));
  buf.push(0, (8 - (buf.bits.length % 8)) % 8);
  // Alternating pad codewords
  for (let pad = 0xec; buf.bits.length < capacityBits; pad ^= 0xec ^ 0x11) buf.push(pad, 8);

  const data = new Uint8Array(capacityBits / 8);
  buf.bits.forEach((bit, i) => { data[i >>> 3] |= bit << (7 - (i & 7)); });

  // Split into blocks, compute ECC, interleave
  const [ecLen, groups] = BLOCKS_M[version - 1];
  const gen = rsGenerator(ecLen);
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
  let off = 0;
  for (const [count, dlen] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(off, off + dlen);
      off += dlen;
      blocks.push({ data: d, ecc: rsRemainder(d, gen) });
    }
  }
  const out: number[] = [];
  const maxLen = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxLen; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of blocks) out.push(b.ecc[i]);
  }
  return new Uint8Array(out);
}

/* ── Matrix construction ─────────────────────────────────────────────── */

export interface QrMatrix {
  size: number;
  /** true = dark module. x = column, y = row, 0-indexed from top-left. */
  get(x: number, y: number): boolean;
}

class Matrix {
  version: number;
  size: number;
  modules: Uint8Array;
  isFunction: Uint8Array;

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = new Uint8Array(this.size * this.size);
    this.isFunction = new Uint8Array(this.size * this.size);
  }

  get(x: number, y: number): boolean { return this.modules[y * this.size + x] === 1; }
  private setFn(x: number, y: number, dark: boolean) {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    this.isFunction[y * this.size + x] = 1;
  }

  drawFunctionPatterns() {
    const n = this.size;
    // Timing patterns
    for (let i = 0; i < n; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    // Finder patterns (with separators)
    this.drawFinder(3, 3);
    this.drawFinder(n - 4, 3);
    this.drawFinder(3, n - 4);
    // Alignment patterns (skip the three corners covered by finders)
    const pos = ALIGN[this.version - 1];
    const last = pos.length - 1;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        this.drawAlignment(pos[i], pos[j]);
      }
    }
    this.drawFormatBits(0); // reserve the format areas (real bits drawn after masking)
    this.drawVersionBits();
  }

  private drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /** 15 format bits: EC level M (0b00) + mask, BCH(15,5), XOR 0x5412. */
  drawFormatBits(mask: number) {
    const data = (0b00 << 3) | mask; // EC level M
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    const n = this.size;
    // First copy (around the top-left finder)
    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(i));
    this.setFn(8, 7, bit(6));
    this.setFn(8, 8, bit(7));
    this.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(i));
    // Second copy (split between the other two finders)
    for (let i = 0; i < 8; i++) this.setFn(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFn(8, n - 15 + i, bit(i));
    this.setFn(8, n - 8, true); // dark module
  }

  /** 18 version bits (versions ≥ 7): 6-bit version + BCH(18,6). */
  private drawVersionBits() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, dark);
      this.setFn(b, a, dark);
    }
  }

  /** Zigzag placement of the interleaved codewords. */
  drawCodewords(data: Uint8Array) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - vert : vert;
          const idx = y * n + x;
          if (!this.isFunction[idx] && i < data.length * 8) {
            this.modules[idx] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
          // Remainder bits stay 0 (light)
        }
      }
    }
  }

  applyMask(mask: number) {
    const n = this.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        const idx = y * n + x;
        if (!this.isFunction[idx] && invert) this.modules[idx] ^= 1;
      }
    }
  }

  /** Standard four-rule penalty score used to pick the best mask. */
  penalty(): number {
    const n = this.size;
    const at = (x: number, y: number) => this.modules[y * n + x];
    let score = 0;
    // Rule 1: runs of ≥5 same-colored modules in a row/column
    for (let axis = 0; axis < 2; axis++) {
      for (let a = 0; a < n; a++) {
        let run = 1;
        let prev = axis === 0 ? at(0, a) : at(a, 0);
        for (let b = 1; b < n; b++) {
          const cur = axis === 0 ? at(b, a) : at(a, b);
          if (cur === prev) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else { prev = cur; run = 1; }
        }
      }
    }
    // Rule 2: 2×2 blocks of the same color
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = at(x, y);
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
      }
    }
    // Rule 3: finder-like pattern 1011101 with 0000 on either side
    const P1 = 0b10111010000, P2 = 0b00001011101; // 11-module windows
    for (let axis = 0; axis < 2; axis++) {
      for (let a = 0; a < n; a++) {
        let window = 0;
        for (let b = 0; b < n; b++) {
          window = ((window << 1) | (axis === 0 ? at(b, a) : at(a, b))) & 0x7ff;
          if (b >= 10 && (window === P1 || window === P2)) score += 40;
        }
      }
    }
    // Rule 4: dark-module proportion
    let dark = 0;
    for (let i = 0; i < this.modules.length; i++) dark += this.modules[i];
    const total = n * n;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

/* ── Public API ──────────────────────────────────────────────────────── */

/** Encode text (UTF-8, byte mode, EC level M). Throws if it needs > version 10. */
export function qrEncode(text: string, forcedMask?: number): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const capacityBits = dataCodewords(v) * 8;
    const headerBits = 4 + (v <= 9 ? 8 : 16);
    if (headerBits + bytes.length * 8 <= capacityBits) { version = v; break; }
  }
  if (version === 0) throw new Error(`qrEncode: text too long (${bytes.length} bytes > 213)`);

  const codewords = buildCodewords(bytes, version);
  const m = new Matrix(version);
  m.drawFunctionPatterns();
  m.drawCodewords(codewords);

  let bestMask = forcedMask ?? -1;
  if (bestMask < 0) {
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      m.applyMask(mask);
      m.drawFormatBits(mask);
      const score = m.penalty();
      if (score < bestScore) { bestScore = score; bestMask = mask; }
      m.applyMask(mask); // undo (XOR mask is its own inverse)
    }
  }
  m.applyMask(bestMask);
  m.drawFormatBits(bestMask);
  return m;
}

/** SVG path data ("M…h1v1h-1z" per dark module) at the given module size.
 *  Coordinates start at 0,0 — add your own quiet zone when placing it. */
export function qrToSvgPath(text: string, moduleSize = 1): string {
  const m = qrEncode(text);
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.get(x, y)) parts.push(`M${x * moduleSize},${y * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
    }
  }
  return parts.join('');
}

/**
 * Complete standalone <svg> markup with a white background and the standard
 * 4-module quiet zone. Scales to its container (viewBox only, no fixed size).
 */
export function renderQrSvg(
  text: string,
  opts?: { margin?: number; dark?: string; light?: string; className?: string },
): string {
  const m = qrEncode(text);
  const margin = opts?.margin ?? 4;
  const dim = m.size + margin * 2;
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.get(x, y)) parts.push(`M${x + margin},${y + margin}h1v1h-1z`);
    }
  }
  const cls = opts?.className ? ` class="${opts.className}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${cls} ` +
    `role="img" aria-label="QR code" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${opts?.light ?? '#fff'}"/>` +
    `<path d="${parts.join('')}" fill="${opts?.dark ?? '#000'}"/></svg>`
  );
}
