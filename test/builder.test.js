// Tests for the Course Builder's pure parts: app/js/course-format.js and filetext.js. Run with: npm test
const fs = require('fs'), vm = require('vm'), assert = require('assert'), zlib = require('zlib'), os = require('os'), path = require('path');
const SRC = path.join(__dirname, '..') + '/';
global.window = {};
vm.runInThisContext(fs.readFileSync(SRC + 'app/js/course-format.js', 'utf8'));
const F = window.LQ_COURSE;
const T = require(SRC + 'filetext.js');

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

/* ---------- a made-up course ---------- */
const base = F.newCourse({ name: 'Law of Torts', short: 'Torts', icon: '🩹', semester: 6, folder: 'Torts\\', examDate: '2031-04-20', weekOneStarts: '2031-01-05', manual: { rel: 'Torts/Manual.pdf', name: 'Manual.pdf' } });
const syllabus = {
  blurb: 'Negligence, nuisance and defamation.',
  about: '#### Assessment\n  - Midterm 30%\n* End-term 50%\n<b>Open book</b> [see](https://example.com)',
  units: [
    { title: 'Week 1 — Introduction', topics: [{ title: 'What is a tort?', week: '1', tier: 2, readings: [{ title: 'Winfield ch 1', kind: 'reading', tier: 1 }], questions: ['Is tort law about compensation or deterrence?'] }] },
    { title: 'Weeks 2–3 — Negligence', topics: [{ title: 'Duty of care', week: '2–3', tier: 1, readings: [{ title: 'Donoghue v Stevenson [1932] AC 562', kind: 'case', tier: 1 }, { title: 'Caparo v Dickman (1990)', kind: 'case', tier: 7 }], sections: ['none'] }] },
    { title: 'Empty unit', topics: [] }
  ],
  exams: [{ title: 'Midterm', date: '2031-02-20' }, { title: 'Bad', date: 'soon' }],
  instructorItems: ['Week 9 cases to be assigned']
};
const files = [
  { rel: 'Torts/Readings/Winfield - Tort ch 1.pdf', name: 'Winfield - Tort ch 1.pdf' },
  { rel: 'Torts/Cases/Donoghue v Stevenson (1932).pdf', name: 'Donoghue v Stevenson (1932).pdf' },
  { rel: 'Torts/Cases/Caparo Industries v Dickman (1990).pdf', name: 'Caparo Industries v Dickman (1990).pdf' },
  { rel: 'Torts/Cases/Caparo Industries v Dickman (1990) - copy notes.pdf', name: 'Caparo copy notes.pdf' }
];

test('a new course gets a clean id, folder and exam', () => {
  assert.strictEqual(base.id, 'torts');
  assert.strictEqual(base.folder, 'Torts');
  assert.strictEqual(base.format, 'lexquest-course');
  assert.deepStrictEqual(base.exams.map(e => e.date), ['2031-04-20']);
});

let course;
test('the syllabus is cleaned: ids, tiers, markdown, empty units, bad dates', () => {
  course = F.normalizeSyllabus(syllabus, base);
  assert.strictEqual(course.units.length, 2, 'the empty unit is dropped');
  const [t1, t2] = course.units.flatMap(u => u.topics);
  assert.strictEqual(t1.id, 'torts-t1'); assert.strictEqual(t2.id, 'torts-t2');
  assert.strictEqual(t2.readings[1].tier, 2, 'an impossible tier falls back to 2');
  assert.ok(!/####|<b>|\]\(/.test(course.about), 'unsupported markdown is converted');
  assert.ok(/^### Assessment/m.test(course.about) && /^- Midterm/m.test(course.about) && /^- End-term/m.test(course.about));
  assert.deepStrictEqual(course.exams.map(e => e.date), ['2031-04-20', '2031-02-20']);
  assert.strictEqual(base.units.length, 0, 'the original is not changed');
});

test('a manual with no weeks is an error, not an empty course', () => {
  assert.throws(() => F.normalizeSyllabus({ units: [] }, base), /No weeks/);
});

test('replies are read even with code fences, chatter and trailing commas', () => {
  assert.deepStrictEqual(F.extractJson('Here you go:\n```json\n{"a": [1, 2,], "b": {"c": 1,},}\n```'), { a: [1, 2], b: { c: 1 } });
  assert.throws(() => F.extractJson('no json here'), /no JSON/);
  assert.throws(() => F.extractJson('{"a": nope}'), /isn’t valid JSON/);
});

test('readings are matched to files only when the match is clear', () => {
  const m = F.matchFiles('Donoghue v Stevenson [1932] AC 562', files);
  assert.strictEqual(m[0].rel, 'Torts/Cases/Donoghue v Stevenson (1932).pdf');
  const n = F.autoMatch(course, files);
  const [t1, t2] = course.units.flatMap(u => u.topics);
  assert.strictEqual(t1.readings[0].file, 'Torts/Readings/Winfield - Tort ch 1.pdf');
  assert.strictEqual(t2.readings[0].file, 'Torts/Cases/Donoghue v Stevenson (1932).pdf');
  assert.strictEqual(t2.readings[1].file, '', 'two near-identical Caparo files: left for the person to choose');
  assert.strictEqual(n, 2);
});

let notes;
test('notes are checked: bad quiz questions, empty cards and junk are dropped', () => {
  notes = F.normalizeNotes({
    gist: 'Duty, breach, damage.', guide: '### Duty\n  - Neighbour principle: [[c:donoghue]]\n```\ncode\n```', prime: ['Who is my neighbour?'],
    cases: [{ key: 'donoghue', name: 'Donoghue v Stevenson', cite: '[1932] AC 562', oneLine: 'Neighbour principle.' }, { key: 'donoghue', name: 'Donoghue (again)' }, { name: '' }],
    cards: [{ front: 'Who is my neighbour?', back: 'Persons closely and directly affected.' }, { front: 'No back' }, { cloze: 'Duty, {{breach}}, damage.' }, { cloze: 'no blank' }],
    mcqs: [
      { q: 'Snail case?', options: ['Donoghue', 'Caparo', 'Anns', 'Hedley'], answer: 0, why: 'Ginger beer.' },
      { q: 'Out of range', options: ['a', 'b'], answer: 2 },
      { q: 'Duplicates', options: ['a', 'a'], answer: 0 },
      { q: 'One option', options: ['a'], answer: 0 }],
    loci: [{ spot: 'Door', image: 'A snail in a bottle', meaning: 'Donoghue' }, { spot: 'Bed' }],
    council: { contrarian: 'Too vague.', nonsense: 'x' }
  }, { model: 'claude-opus-5-5', sources: ['Donoghue.pdf'] });
  assert.strictEqual(notes.cards.length, 2);
  assert.strictEqual(notes.cards[1].type, 'cloze');
  assert.strictEqual(notes.mcqs.length, 1);
  assert.strictEqual(notes.loci.length, 1);
  assert.deepStrictEqual(notes.cases.map(c => c.key), ['donoghue', 'donoghuex']);
  assert.deepStrictEqual(Object.keys(notes.council), ['contrarian']);
  assert.ok(!/```|^\s+-/m.test(notes.guide));
  assert.throws(() => F.normalizeNotes({ gist: 'only a gist' }), /no notes or flashcards/);
});

test('a built course becomes a subject the app can use', () => {
  const c = JSON.parse(JSON.stringify(course));
  c.units[1].topics[0].notes = notes;
  const { subject, exams, palaces } = F.toData(c);
  assert.strictEqual(subject.contentLevel, 'partial');
  assert.strictEqual(subject.semester, 6);
  const t2 = subject.units[1].topics[0];
  assert.ok(t2.guide.includes('[[c:torts-donoghue]]'), 'case links point at the course’s own case ids');
  assert.deepStrictEqual(t2.cases, ['torts-donoghue', 'torts-donoghuex']);
  assert.ok(subject.cases['torts-donoghue'].file.endsWith('Donoghue v Stevenson (1932).pdf'), 'a case card picks up its judgment');
  const t1 = subject.units[0].topics[0];
  assert.ok(/What the manual sets/.test(t1.guide) && t1.prime[0].startsWith('Is tort law'), 'a topic without notes shows the manual’s list and questions');
  assert.strictEqual(subject.cards.length, 2);
  assert.ok(subject.cards.every(x => x.topic === 'torts-t2' && x.id.startsWith('torts-t2-')));
  assert.strictEqual(new Set(subject.cards.map(x => x.id)).size, 2);
  assert.strictEqual(subject.mcqs[0].answer, 0);
  assert.strictEqual(palaces.length, 1); assert.strictEqual(palaces[0].rooms[0].loci[0].topic, 'torts-t2');
  assert.ok(/the last hour/.test(subject.lastHour));
  assert.deepStrictEqual(exams.map(e => e.subject), ['torts', 'torts']);
});

test('card ids stay the same when a topic is rebuilt with the same cards', () => {
  const c = JSON.parse(JSON.stringify(course));
  c.units[1].topics[0].notes = notes;
  const a = F.toData(c).subject.cards.map(x => x.id);
  c.units[1].topics[0].notes = { ...notes, cards: notes.cards.slice().reverse() };
  const b = F.toData(c).subject.cards.map(x => x.id);
  assert.deepStrictEqual(a.slice().sort(), b.slice().sort());
});

test('applying: a pack’s id wins, broken files are reported, others load', () => {
  const D = { subjects: { torts: { id: 'torts' } } };
  const report = F.apply(D, [{ file: 'torts.json', course }, { file: 'bad.json', error: 'Couldn’t read bad.json' }, { file: 'x.json', course: { ...course, id: 'contract', name: 'Contract' } }]);
  assert.ok(/already uses/.test(report[0].error));
  assert.ok(report[1].error);
  assert.ok(!report[2].error && D.subjects.contract && D.subjects.contract.units.length === 2);
});

test('weeks: which week it is, and the first week of a range', () => {
  assert.strictEqual(F.currentWeek(course, '2031-01-04'), 0);
  assert.strictEqual(F.currentWeek(course, '2031-01-05'), 1);
  assert.strictEqual(F.currentWeek(course, '2031-01-18'), 2);
  assert.strictEqual(F.currentWeek({ weekOneStarts: '' }, '2031-01-18'), null);
  assert.strictEqual(F.firstWeek('Weeks 7 and 8'), 7);
});

/* ---------- reading Office, HTML and PDF files ---------- */
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text, deflate] of entries) {
    const raw = Buffer.from(text, 'utf8'), data = deflate ? zlib.deflateRawSync(raw) : raw, n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('Word documents: paragraphs, tabs and entities', () => {
  const docx = zip([['[Content_Types].xml', '<x/>', false], ['word/document.xml', '<w:body><w:p><w:r><w:t>Week 1 &amp; 2</w:t></w:r></w:p><w:p><w:r><w:t>Readings</w:t><w:tab/><w:t>Winfield</w:t></w:r></w:p></w:body>', true]]);
  assert.strictEqual(T.officeText(docx, '.docx'), 'Week 1 & 2\nReadings\tWinfield');
});

test('PowerPoint: slides in number order, not file order', () => {
  const pptx = zip([['ppt/slides/slide10.xml', '<a:p><a:t>Ten</a:t></a:p>', true], ['ppt/slides/slide2.xml', '<a:p><a:t>Two</a:t></a:p>', false], ['ppt/slides/slide1.xml', '<a:p><a:t>One</a:t></a:p>', true]]);
  const text = T.officeText(pptx, '.pptx');
  assert.ok(text.indexOf('One') < text.indexOf('Two') && text.indexOf('Two') < text.indexOf('Ten'), text);
});

test('HTML loses scripts and tags; a broken Office file is an error', () => {
  assert.strictEqual(T.htmlText('<style>x{}</style><p>Rule</p><script>alert(1)</script><p>Case &lt;1&gt;</p>'), 'Rule\nCase <1>');
  assert.throws(() => T.officeText(Buffer.from('not a zip at all, definitely not'), '.docx'), /not a valid Office file/);
});

test('PDFs: pages are counted, fakes and over-long files are refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lq-test-'));
  const ok = path.join(dir, 'ok.pdf'), fake = path.join(dir, 'fake.pdf'), long = path.join(dir, 'long.pdf');
  fs.writeFileSync(ok, '%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] >>\n2 0 obj << /Type /Page >>\n3 0 obj << /Type/Page >>\n%%EOF');
  fs.writeFileSync(fake, '<html>Sign in</html>');
  fs.writeFileSync(long, '%PDF-1.4\n' + '<< /Type /Page >>\n'.repeat(T.MAX_PDF_PAGES + 1));
  assert.strictEqual(T.describe(ok).pages, 2);
  assert.strictEqual(T.toBlock(ok).block.source.media_type, 'application/pdf');
  assert.throws(() => T.toBlock(fake), /isn’t really a PDF/);
  assert.throws(() => T.toBlock(long), /pages/);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} tests passed`);
