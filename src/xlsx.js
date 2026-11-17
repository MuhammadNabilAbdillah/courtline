// Tiny .xlsx writer (no dependencies): builds a real Excel workbook with several sheets, a bold header row and sensible column widths.
const enc = new TextEncoder()
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]

function zip(files) { // stored (uncompressed) zip
  const parts = [], central = []; let off = 0
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.text), c = crc(data), n = data.length
    const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)])
    parts.push(head, name, data)
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name)
    off += head.length + name.length + n
  })
  const size = central.reduce((s, p) => s + p.length, 0)
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(off), ...u16(0)])
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const col = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s }
const safeName = (n, i) => esc(String(n || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))

// sheets: [{ name, rows: [[cell, ...], ...] }]  (first row is treated as the header). Cells are strings or numbers.
export function makeXlsx(sheets) {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  const sheetXml = s => {
    const w = []; s.rows.forEach(r => r.forEach((v, c) => { w[c] = Math.max(w[c] || 8, Math.min(48, String(v ?? '').length + 2)) }))
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, c) => {
      const ref = col(c) + (ri + 1), st = ri === 0 ? ' s="1"' : ''
      if (v === null || v === undefined || v === '') return ''
      return typeof v === 'number' ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    }).join('') + '</row>').join('')
    return X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData></worksheet>`
  }
  const files = [
    { name: '[Content_Types].xml', text: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', text: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${safeName(s.name, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }))
  ]
  return zip(files)
}

// ---------- Pembaca .xlsx (tanpa library): membaca sheet pertama menjadi array of array ----------
const dec = new TextDecoder()
async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let e = u8.length - 22
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--
  if (e < 0) throw new Error('Bukan file Excel (.xlsx) yang valid')
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const ent = {}
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('File Excel rusak')
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true)
    ent[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lho }
    p += 46 + nl + el + cl
  }
  return async name => {
    const f = ent[name]; if (!f) return null
    const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true), raw = u8.subarray(start, start + f.csize)
    return dec.decode(f.method === 0 ? raw : await inflate(raw))
  }
}
const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, k) => k[0] === '#' ? String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k.toLowerCase()]))
const texts = x => { let o = '', m; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((m = re.exec(x))) o += m[1]; return unesc(o) }
const colNo = ref => { let n = 0; for (const ch of /^[A-Z]+/i.exec(ref)[0].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }

export async function readXlsx(buf) {
  const get = await unzip(buf)
  const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels')
  if (!wb || !rels) throw new Error('Bukan file Excel (.xlsx) yang valid. Simpan sebagai "Excel Workbook (.xlsx)".')
  const rid = (/<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) || [])[1]
  let target = null
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) if (m[0].includes(`Id="${rid}"`)) target = (/Target="([^"]+)"/.exec(m[0]) || [])[1]
  if (!target) target = 'worksheets/sheet1.xml'
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')
  const sheet = await get(path); if (!sheet) throw new Error('Sheet pertama tidak ditemukan')
  const ss = await get('xl/sharedStrings.xml'), shared = ss ? [...ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) : []
  const rows = []
  for (const r of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = +((/\br="(\d+)"/.exec(r[1]) || [])[1] || rows.length + 1) - 1, cells = []
    for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = c[1], ref = (/\br="([A-Z]+\d+)"/i.exec(at) || [])[1], t = (/\bt="(\w+)"/.exec(at) || [])[1], body = c[2] || ''
      if (!ref) continue
      const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1]
      let val = ''
      if (t === 's') val = shared[+v] ?? ''
      else if (t === 'inlineStr') val = texts(body)
      else if (v !== undefined) val = unesc(v)
      cells[colNo(ref)] = String(val).trim()
    }
    rows[rn] = Array.from(cells, x => x ?? '')
  }
  return Array.from(rows, r => r || [])
}

// Template Excel untuk impor tim (sheet "Tim" dibaca; sheet "Petunjuk" hanya penjelasan)
export function teamTemplate() {
  return makeXlsx([
    { name: 'Tim', rows: [['Pemain 1', 'Pemain 2', 'Nama Tim (opsional)', 'Grup (A/B/C)'], ['Andi', 'Budi', 'Tim Elang', 'A'], ['Candra', 'Dewi', 'Tim Rajawali', 'A'], ['Eko', 'Fajar', '', 'B']] },
    { name: 'Petunjuk', rows: [['Petunjuk pengisian'], ['1. Isi sheet "Tim": satu tim per baris. Hapus 3 baris contoh sebelum mengisi.'], ['2. Pemain 1 dan Pemain 2 wajib diisi.'], ['3. Nama Tim boleh dikosongkan (otomatis "Pemain 1 x Pemain 2").'], ['4. Grup berisi satu huruf (A, B, C...). Boleh dikosongkan, nanti bisa diacak lewat tombol Acak grup.'], ['5. Simpan sebagai .xlsx lalu unggah di halaman Tim.']] }
  ])
}
