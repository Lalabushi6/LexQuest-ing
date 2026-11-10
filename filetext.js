// Reading course files for the Course Builder: a PDF goes to Claude as a document; Word (.docx),
// PowerPoint (.pptx), HTML and plain text go as extracted text. No Electron in here, so it can be tested.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_PDF_PAGES = 600;
const PDF = ['.pdf'];
const TEXT = ['.txt', '.md', '.csv', '.html', '.htm'];
const ZIPPED = ['.docx', '.pptx'];
const SUPPORTED = [...PDF, ...TEXT, ...ZIPPED];

// Minimal ZIP reader for .docx/.pptx (no ZIP64, which Office documents of this size never need).
function zipEntries(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a valid Office file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.test(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : raw });
  }
  return out;
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function officeText(buf, ext) {
  if (ext === '.docx') {
    const [doc] = zipEntries(buf, /^word\/document\.xml$/);
    if (!doc) throw new Error('no document text inside');
    return tidy(decode(doc.data.toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')));
  }
  const slides = zipEntries(buf, /^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => parseInt(a.name.match(/(\d+)\.xml$/)[1], 10) - parseInt(b.name.match(/(\d+)\.xml$/)[1], 10));
  return tidy(slides.map((s, i) => `--- Slide ${i + 1} ---\n` + decode(s.data.toString('utf8').replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, ''))).join('\n\n'));
}

const htmlText = s => tidy(decode(s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n'));

// Pages are counted from the PDF's page objects; compressed object streams can hide them, so this
// returns null when it can't tell, and the API's own limit then decides.
function pdfPages(buf) {
  const n = (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  return n || null;
}

function describe(abs) {
  const ext = path.extname(abs).toLowerCase();
  const info = { name: path.basename(abs), ext, size: fs.statSync(abs).size, pages: null };
  if (ext === '.pdf') info.pages = pdfPages(fs.readFileSync(abs));
  return info;
}

// What goes to Claude for one file, and roughly how many bytes it adds to the request.
function toBlock(abs) {
  const ext = path.extname(abs).toLowerCase(), name = path.basename(abs);
  const buf = fs.readFileSync(abs);
  if (ext === '.pdf') {
    if (buf.subarray(0, 1024).toString('latin1').indexOf('%PDF') < 0) throw new Error(`${name} isn’t really a PDF`);
    const pages = pdfPages(buf);
    if (pages && pages > MAX_PDF_PAGES) throw new Error(`${name} has about ${pages} pages; Claude reads up to ${MAX_PDF_PAGES} per file. Split it, or leave it out.`);
    return { block: { type: 'document', title: name, source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, bytes: Math.ceil(buf.length * 4 / 3) };
  }
  let text;
  if (ZIPPED.includes(ext)) text = officeText(buf, ext);
  else if (ext === '.html' || ext === '.htm') text = htmlText(buf.toString('utf8'));
  else if (TEXT.includes(ext)) text = buf.toString('utf8');
  else throw new Error(`${name}: only PDF, Word (.docx), PowerPoint (.pptx) and text files can be read`);
  if (!text.trim()) throw new Error(`${name} has no readable text (it may be a scan)`);
  return { block: { type: 'document', title: name, source: { type: 'text', media_type: 'text/plain', data: text } }, bytes: Buffer.byteLength(text) };
}

module.exports = { SUPPORTED, MAX_PDF_PAGES, zipEntries, officeText, htmlText, pdfPages, describe, toBlock };
