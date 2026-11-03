// Tests for app/js/planner.js against a made-up timetable, plus a check of the example pack. Run with: npm test
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const SRC = require('path').join(__dirname, '..') + '/';
global.window = {};
vm.runInThisContext(fs.readFileSync(SRC + 'app/js/planner.js', 'utf8'));
const replan = window.LQ.replan;

/* Three subjects, a midterm on day 4, then a run of class days and three end-terms. */
const days = [];
const day = (date, phase, hours, items) => days.push({ date, phase, hours, items: items.map((it, i) => ({ id: `${date}-${i}`, ...it })) });
const at = n => `2030-01-${String(n).padStart(2, '0')}`;
const rev = { subject: 'alpha', text: 'Due-card review (all subjects)', hours: 0.5 };
const exam = text => ({ subject: 'exam', text });
const study = (subject, topic, hours) => ({ subject, topic, hours, text: `Study ${topic}` });

day(at(1), 'Midterm sprint', '3 h', [study('alpha', 'a-intro', 1), study('alpha', 'a-rules', 1.5)]);
day(at(2), 'Midterm sprint', '3 h', [rev, study('alpha', 'a-cases', 1), study('alpha', 'a-more', 1.5)]);
day(at(3), 'Midterm sprint', '3–4 h', [rev, study('alpha', 'a-burden', 1), study('alpha', 'a-docs', 0.75), { subject: 'alpha', text: 'Timed mock', hours: 1.5 }]);
day(at(4), 'Midterm sprint', 'exam', [{ subject: 'alpha', text: 'Morning: last-hour sheet. Nothing new.', hours: 0.5 }, exam('Alpha midterm')]);
const order = ['beta', 'gamma', 'alpha'];
for (let n = 5; n <= 20; n++) { const sub = order[n % 3]; day(at(n), 'Class days', '3 h', [rev, study(sub, `${sub[0]}-t${n}`, 2)]); }
day(at(21), 'End-terms', '2–3 h', [rev]);
day(at(22), 'End-terms', 'exam', [exam('Beta end-term')]);
day(at(23), 'End-terms', '3 h', [rev]);
day(at(24), 'End-terms', '3 h', [rev]);
day(at(25), 'End-terms', 'exam', [exam('Alpha end-term')]);
day(at(26), 'End-terms', '3 h', [rev]);
day(at(27), 'End-terms', '3 h', [rev]);
day(at(28), 'End-terms', 'exam', [exam('Gamma end-term')]);

const exams = [{ subject: 'alpha', date: at(4) }, { subject: 'beta', date: at(22) }, { subject: 'alpha', date: at(25) }, { subject: 'gamma', date: at(28) }];
// First letter sets the tier, so a subject's topics sort predictably: alpha 1, beta 2, gamma 3.
const tierOf = id => ({ a: 1, b: 2, g: 3 }[id[0]]);
const nextExamOn = today => sub => { const e = exams.filter(x => x.subject === sub && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]; return e ? e.date : null; };
const run = (today, o = {}) => replan({ days, today, nextExam: nextExamOn(today), tierOf, ...o });
const allPieces = r => Object.values(r.days).flatMap(d => d.extra.map(p => ({ ...p, date: d.date })));
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('ok  ', name); };

t('nothing skipped on day one: plan unchanged', () => {
  const r = run(at(1));
  assert.strictEqual(r.moved.length, 0); assert.strictEqual(allPieces(r).length, 0);
});

const NOW = at(5);
const r = run(NOW, { topicPct: id => ({ 'a-intro': 100, 'a-rules': 71 }[id] || 0) });
t('a finished topic not carried; part-done topic shrinks', () => {
  assert(!r.moved.some(b => b.topic === 'a-intro'));
  const rules = r.moved.find(b => b.topic === 'a-rules');
  assert.strictEqual(rules.left, 0.5); // 1.5 h x 29% left, rounded up to a quarter
});
t('only topic blocks carry: reviews, mocks and exam-morning stay on their day', () => {
  for (const b of r.moved) assert(b.topic, 'carried a non-topic block: ' + b.text);
  assert(!r.moved.some(b => /Due-card|Timed mock|Morning/.test(b.text)));
});
t('every moved hour is placed or reported', () => {
  const placed = allPieces(r).filter(p => !p.done).reduce((a, p) => a + p.hours, 0);
  assert.strictEqual(placed + r.unplacedHours, r.movedHours);
});
t('nothing lands on or after the subject’s next exam, or before today', () => {
  for (const p of allPieces(r)) { assert(p.date >= NOW); assert(p.date < nextExamOn(NOW)(p.subject), `${p.subject} piece on ${p.date}`); }
});
t('no catch-up on any exam day', () => { for (const d of Object.values(r.days)) if (d.isExamDay) assert.strictEqual(d.extra.length, 0, d.date); });
t('no day goes past budget + stretch', () => { for (const d of Object.values(r.days)) if (d.date >= NOW) assert(d.load <= d.budget + 2 + 1e-9, `${d.date}: ${d.load} over ${d.budget}+2`); });
t('pieces are sensible sizes, and large blocks really split', () => {
  for (const p of allPieces(r)) assert(p.hours >= 0.25 && p.hours % 0.25 === 0, `${p.pieceId}: ${p.hours}`);
  const big = run(at(10));
  assert(allPieces(big).some(p => p.parts > 1), 'expected a split block');
  for (const p of allPieces(big)) assert(p.part >= 1 && p.part <= p.parts);
});
t('topics stay together: a block under 1.5 h is not chopped up while there is room', () => {
  for (const b of r.moved) if (b.left <= 1.5) assert.strictEqual(allPieces(r).filter(p => p.id === b.id).length, 1, b.topic + ' was split');
  const tight = allPieces(run(at(10))), slivers = tight.filter(p => p.hours < 0.5);
  assert(slivers.length <= tight.length / 5, `${slivers.length} of ${tight.length} pieces are slivers under pressure`);
});
t('load is spread, not dumped on one day', () => {
  const perDay = {}; for (const p of allPieces(run(at(10)))) perDay[p.date] = (perDay[p.date] || 0) + p.hours;
  assert(Object.keys(perDay).length >= 3, 'used only ' + Object.keys(perDay).length + ' days');
});
t('“Move to later” takes a future block off its day and only puts it after that day', () => {
  const id = `${at(9)}-1`;
  const r2 = run(NOW, { status: { [id]: 'later' } });
  assert.strictEqual(r2.days[at(9)].items.find(i => i.id === id).state, 'moved');
  const ps = allPieces(r2).filter(p => p.id === id);
  assert(ps.length); for (const p of ps) assert(p.date > at(9), p.date);
});
t('moving today’s block sends it to tomorrow or later', () => {
  const id = `${NOW}-1`;
  const ps = allPieces(run(NOW, { status: { [id]: 'later' } })).filter(p => p.id === id);
  assert(ps.length); for (const p of ps) assert(p.date > NOW);
});
t('ticking a piece shrinks what is left and keeps it visible as done', () => {
  const id = `${at(3)}-1`; const r1 = run(NOW);
  const first = allPieces(r1).find(p => p.id === id); assert(first);
  const r2 = run(NOW, { pieces: { [first.pieceId]: first.hours } });
  const before = r1.moved.find(b => b.id === id).left, after = r2.moved.find(b => b.id === id);
  assert.strictEqual(after ? after.left : 0, before - first.hours);
  assert(r2.days[first.date].extra.some(p => p.pieceId === first.pieceId && p.done));
});
t('finishing all of a block’s pieces clears it', () => {
  const id = `${at(3)}-2`;
  const r2 = run(NOW, { pieces: { [`${id}@${NOW}`]: 0.75 } });
  assert(!r2.moved.some(b => b.id === id));
  assert.strictEqual(r2.days[at(3)].items.find(i => i.id === id).state, 'done');
});
t('done and dropped blocks stay out of the catch-up', () => {
  const a = `${at(3)}-1`, b = `${at(3)}-2`;
  const r2 = run(NOW, { status: { [a]: 'done', [b]: 'dropped' } });
  assert(!r2.moved.some(x => x.id === a || x.id === b));
  assert(r2.dropped.some(x => x.id === b));
});
t('more stretch fits more; no stretch never exceeds budget', () => {
  const late = at(18);
  const tight = run(late, { extraHours: 0 }), wide = run(late, { extraHours: 4 });
  assert(tight.unplacedHours >= wide.unplacedHours);
  for (const d of Object.values(tight.days)) if (d.date >= late) assert(d.load <= d.budget + 1e-9);
});
t('too much too late is reported, not silently lost', () => {
  const rr = run(at(20));
  const placed = allPieces(rr).filter(p => !p.done).reduce((a, p) => a + p.hours, 0);
  assert(rr.unplaced.length > 0); assert.strictEqual(placed + rr.unplacedHours, rr.movedHours);
});
t('nearer exam and higher tier are placed first', () => {
  const rr = run(at(20));
  for (let i = 1; i < rr.moved.length; i++) { const a = rr.moved[i - 1], b = rr.moved[i]; assert((a.deadline || '9') <= (b.deadline || '9')); if (a.deadline === b.deadline) assert(a.tier <= b.tier); }
});
t('exam over: block expires rather than being scheduled', () => {
  const rr = run(at(30));
  assert(rr.moved.length > 0 && rr.expired.length === rr.moved.length); assert.strictEqual(allPieces(rr).length, 0);
});
t('deterministic: same input, same plan', () => { assert.deepStrictEqual(run(at(7)), run(at(7))); });

/* The example pack is what people copy, so everything in it has to point at something real. */
t('the example pack is consistent', () => {
  window.LQ_DATA = { subjects: {} };
  vm.runInThisContext(fs.readFileSync(SRC + 'examples/example-pack.js', 'utf8'));
  const D = window.LQ_DATA, s = Object.values(D.subjects)[0];
  const topics = new Set(s.units.flatMap(u => u.topics.map(x => x.id)));
  const known = (id, where) => assert(topics.has(id), `${where} points at unknown topic ${id}`);
  for (const d of D.timetable) for (const i of d.items) if (i.topic) known(i.topic, 'timetable');
  for (const c of s.cards) known(c.topic, 'card ' + c.id);
  for (const q of s.mcqs) { known(q.topic, 'quiz ' + q.id); assert(q.options[q.answer], 'quiz answer out of range: ' + q.id); }
  for (const p of D.palaces) for (const room of p.rooms) for (const l of room.loci) known(l.topic, 'palace ' + l.id);
  for (const q of D.pastQuestions) for (const id of q.topics) known(id, 'question ' + q.id);
  for (const e of D.exams) assert(D.subjects[e.subject], 'exam for unknown subject ' + e.subject);
  const text = JSON.stringify(s);
  for (const [, id] of text.matchAll(/\[\[c:([\w-]+)/g)) assert(s.cases[id], 'unknown case ' + id);
  for (const [, act, n] of text.matchAll(/\[\[s:(\w+)\/([\w.-]+)/g)) assert(D.actText[act][n], `unknown section ${act}/${n}`);
});

console.log(`\n${passed} tests passed\n`);
