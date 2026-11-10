// Tests for app/js/retention.js: answer scoring, free recall, weak spots, drills and the recall schedule. Run with: npm test
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const SRC = require('path').join(__dirname, '..') + '/';
global.window = {};
vm.runInThisContext(fs.readFileSync(SRC + 'app/js/retention.js', 'utf8'));
const R = window.LQ.retention;
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

// The sample cards below are made up; they stand in for any course.
test('key terms drop stop-words and markup, keep numbers and stem word forms', () => {
  const t = R.keyTerms('**Leases** under [[s:act/21|s. 21]] need *written* notice (1950)');
  assert.ok(t.includes('leas'), t.join());
  assert.ok(t.includes('written'));
  assert.ok(t.includes('1950'));
  assert.ok(t.includes('21'));
  assert.ok(!t.includes('under') && !t.includes('the'));
  assert.deepStrictEqual(R.keyTerms('lease'), R.keyTerms('Leases'));
  assert.deepStrictEqual(R.keyTerms('leased'), R.keyTerms('lease'));
  assert.deepStrictEqual(R.keyTerms('witnesses'), R.keyTerms('witness'));
  assert.deepStrictEqual(R.keyTerms('objected'), R.keyTerms('objection'));
});

test('coverage scores the share of key terms present', () => {
  const c = R.coverage('the tenant must give written notice', 'Tenants must give written notice before leaving');
  assert.deepStrictEqual(c.hit.sort(), ['give', 'notice', 'tenants', 'written']);
  assert.deepStrictEqual(c.miss, ['leaving']);
  assert.strictEqual(c.total, 5);
  assert.strictEqual(c.score, 0.8);
  assert.strictEqual(R.coverage('', 'anything').score, 0);
  assert.strictEqual(R.coverage('words', '').total, 0);
});

test('coverage counts only the first twelve key terms of a long answer', () => {
  const long = 'alpha bravo charlie delta foxtrot hotel india juliet kilo lima mike november oscar papa quebec';
  assert.strictEqual(R.coverage('alpha', long).total, 12);
});

test('suggested grades follow the coverage bands', () => {
  assert.deepStrictEqual([0, 0.3, 0.6, 0.9].map(R.suggestGrade), [1, 2, 3, 4]);
});

test('cloze cards expose their blanks as the answer', () => {
  const p = R.cardPoint({ id: 'x', type: 'cloze', text: 'An oral lease of land is {{void}} and cannot be enforced even {{by agreement}}.' });
  assert.strictEqual(p.answer, 'void · by agreement');
  assert.ok(p.prompt.includes('[ … ]') && !p.prompt.includes('{{'));
});

test('free recall marks points recalled when enough key terms appear', () => {
  const cards = [
    { id: 'a', front: 'Rule one?', back: 'A lease longer than a year must be registered in writing' },
    { id: 'b', front: 'Rule two?', back: 'A tenant has no duty to repair structural defects' },
    { id: 'c', front: 'Rule three?', back: 'Notice expires after thirty days without reply' },
    { id: 'd', type: 'cloze', text: 'Rule four: a licence is {{revocable}} at will.' }
  ];
  const r = R.scoreRecall('A lease over a year must be registered and in writing. The tenant has no duty of structural repair. A licence is revocable.', cards);
  const got = Object.fromEntries(r.points.map(p => [p.id, p.recalled]));
  assert.deepStrictEqual(got, { a: true, b: true, c: false, d: true });
  assert.strictEqual(r.total, 4);
  assert.strictEqual(r.pct, 75);
  assert.strictEqual(R.scoreRecall('nothing relevant here at all', cards).recalled, 0);
});

test('weak cards rank lapses and low ease, and skip unseen or easy cards', () => {
  const cards = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const states = { a: { seen: 5, lapses: 3, ef: 1.6 }, b: { seen: 4, lapses: 1, ef: 2.3 }, c: { seen: 6, lapses: 0, ef: 2.6 } };
  const w = R.weakCards(cards, states);
  assert.deepStrictEqual(w.map(x => x.card.id), ['a', 'b']);
  assert.ok(w[0].weight > w[1].weight);
});

test('weak questions are those under two-thirds right, worst first', () => {
  const qs = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }];
  const rec = { q1: { ok: 0, n: 2 }, q2: { ok: 2, n: 3 }, q3: { ok: 1, n: 3 }, q4: { ok: 3, n: 3 } };
  assert.deepStrictEqual(R.weakQuestions(qs, rec).map(x => x.q.id), ['q1', 'q3']);
});

// A fixed sequence so the shuffles are repeatable.
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('case drill asks for the right name among four from the same subject', () => {
  const subject = { id: 's', cases: {} };
  for (let i = 1; i <= 6; i++) subject.cases[`k${i}`] = { name: `Case ${i}`, cite: `(${2000 + i})`, oneLine: `Holding number ${i}` };
  const qs = R.caseQuestions(subject, 5, seeded());
  assert.strictEqual(qs.length, 5);
  for (const q of qs) {
    assert.strictEqual(q.options.length, 4);
    assert.strictEqual(new Set(q.options).size, 4);
    const n = q.q.match(/Holding number (\d)/)[1];
    assert.strictEqual(q.options[q.answer], `Case ${n}`);
    assert.ok(q.id.startsWith('case:s:'));
  }
  assert.deepStrictEqual(R.caseQuestions({ id: 't', cases: { a: subject.cases.k1, b: subject.cases.k2 } }), []);
});

test('interleaving spreads topics and respects the limit', () => {
  const qs = [];
  for (const t of ['x', 'y', 'z']) for (let i = 0; i < 4; i++) qs.push({ id: `${t}${i}`, topic: t });
  const out = R.interleave(qs, 9, seeded(3));
  assert.strictEqual(out.length, 9);
  for (let i = 1; i < out.length; i++) assert.notStrictEqual(out[i].topic, out[i - 1].topic, 'same topic twice in a row');
  assert.strictEqual(R.interleave(qs, 50, seeded()).length, 12);
});

test('spaced recall is due at days 1, 3, 7 and 14 unless already done after the checkpoint', () => {
  const DAY = 86400000, now = Date.UTC(2030, 0, 20);
  const topics = {
    fresh: { steps: { learn: now - 0.5 * DAY } },        // learnt today: not due
    one: { steps: { learn: now - 1.2 * DAY } },          // day-1 check due
    four: { steps: { write: now - 4 * DAY } },           // day-3 check due (written counts as learnt)
    done: { steps: { learn: now - 8 * DAY } },           // day-7 check, already recalled after day 7
    old: { steps: { learn: now - 30 * DAY } },           // day-14 check due
    none: { steps: { prime: now - 9 * DAY } }            // never learnt: not due
  };
  const log = { done: [{ t: now - 0.5 * DAY, pct: 70 }], old: [{ t: now - 20 * DAY, pct: 40 }] };
  const due = R.recallDue(topics, log, now);
  assert.deepStrictEqual(due.map(x => [x.id, x.checkpoint]), [['old', 14], ['four', 3], ['one', 1]]);
});

console.log(`\n${passed} retention tests passed`);
