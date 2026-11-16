// Small self-contained QR code generator (byte mode, error correction level M, versions 1-10 = up to ~210 characters).
// Used for the "scan to open the live scores" code on the TV screen.
const EC = { // version: [EC codewords per block, [[blocks, data codewords per block], ...]]
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]]
}
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] }
const EXP = new Array(512), LOG = new Array(256)
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const r = new Array(g.length + 1).fill(0); g.forEach((c, j) => { r[j] ^= c; r[j + 1] ^= mul(c, EXP[i]) }); g = r } return g }
function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); data.forEach(d => { const f = d ^ r.shift(); r.push(0); if (f) g.slice(1).forEach((c, i) => { r[i] ^= mul(c, f) }) }); return r }

function codewords(bytes) {
  let v = 1
  const cap = k => EC[k][1].reduce((s, [n, d]) => s + n * d, 0)
  while (v <= 10 && bytes.length + (v < 10 ? 2 : 3) > cap(v)) v++
  if (v > 10) throw new Error('Text too long for QR')
  const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8))
  const total = cap(v) * 8
  for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let p = 0; data.length < cap(v); p++) data.push(p % 2 ? 0x11 : 0xec)
  const [ecLen, groups] = EC[v], blocks = []; let o = 0
  groups.forEach(([n, d]) => { for (let i = 0; i < n; i++) { const b = data.slice(o, o + d); o += d; blocks.push({ d: b, e: rsRem(b, ecLen) }) } })
  const out = [], maxD = Math.max(...blocks.map(b => b.d.length))
  for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]) })
  for (let i = 0; i < ecLen; i++) blocks.forEach(b => out.push(b.e[i]))
  return { v, out }
}

export function qrMatrix(text) {
  const { v, out } = codewords(Array.from(new TextEncoder().encode(text)))
  const size = 17 + 4 * v, M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { M[y][x] = dark; F[y][x] = true } }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); fn(cx + dx, cy + dy, d !== 2 && d !== 4) } }
  for (let i = 0; i < size; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0) }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  const pos = ALIGN[v], last = pos.length - 1
  pos.forEach((a, i) => pos.forEach((b, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fn(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))
  const formatBits = mask => { // level M = 0
    const data = (0 << 3) | mask; let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) fn(8, i, bit(i))
    fn(8, 7, bit(6)); fn(8, 8, bit(7)); fn(7, 8, bit(8))
    for (let i = 9; i < 15; i++) fn(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) fn(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) fn(8, size - 15 + i, bit(i))
    fn(8, size - 8, true)
  }
  formatBits(0) // reserve the format area before placing data
  if (v >= 7) {
    let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (v << 12) | rem
    for (let i = 0; i < 18; i++) { const d = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3); fn(a, b, d); fn(b, a, d) }
  }
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
      if (!F[y][x] && k < out.length * 8) { M[y][x] = ((out[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0; k++ }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0]
  const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x] }
  const run = line => { let p = 0, c = 1; for (let i = 1; i <= line.length; i++) { if (i < line.length && line[i] === line[i - 1]) c++; else { if (c >= 5) p += c - 2; c = 1 } } return p }
  const pat = line => { const s = line.map(b => +b).join(''); let p = 0; for (const q of ['10111010000', '00001011101']) { let i = -1; while ((i = s.indexOf(q, i + 1)) >= 0) p += 40 } return p }
  const penalty = () => {
    let p = 0
    for (let i = 0; i < size; i++) { const row = M[i], col = M.map(r => r[i]); p += run(row) + run(col) + pat(row) + pat(col) }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) p += 3
    const dark = M.flat().filter(Boolean).length
    return p + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10
  }
  let best = 0, bp = Infinity
  for (let m = 0; m < 8; m++) { apply(m); formatBits(m); const p = penalty(); if (p < bp) { bp = p; best = m } apply(m) }
  apply(best); formatBits(best)
  return M
}
