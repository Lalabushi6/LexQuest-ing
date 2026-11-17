// Tests for the topic quick quiz in app/js/retention.js: questions built from a topic's case cards and
// Key words table, sized to how much the notes hold. Run with: npm test
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const SRC = require('path').join(__dirname, '..') + '/';
global.window = {};
vm.runInThisContext(fs.readFileSync(SRC + 'app/js/retention.js', 'utf8'));
const R = window.LQ.retention;
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

// A made-up subject about gardening law; it stands in for any course.
const table = rows => `### Key words\n| Key word | What it means |\n|---|---|\n${rows.map(([a, b]) => `| **${a}** | ${b} |`).join('\n')}\n\n### The detail\n`;
const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const subject = {
  id: 'garden',
  units: [{ topics: [
    { id: 'g-hedge', title: 'Hedges', cases: ['hc-ash', 'hc-birch', 'hc-cedar'],
      guide: `Start here.\n\n${table([['Boundary hedge', 'A hedge on the line between two plots.'], ['Overhang', 'Branches that cross into the next plot.'], ['Abatement', 'Cutting back an overhang yourself.'], ['Light / air', 'The right not to have light or air blocked.'], ['Notice', 'A written warning before cutting.']])}${words(1400)}` },
    { id: 'g-pond', title: 'Ponds', cases: ['hc-dale'],
      guide: `${table([['Seepage', 'Water escaping into the next plot.'], ['Stocking', 'Putting fish in a pond.']])}${words(300)}` },
    { id: 'g-empty', title: 'Empty', guide: 'Nothing here.' }
  ] }],
  cases: {
    'hc-ash': { name: 'Ash v Rowan', cite: '(1901) 1 GL 1', oneLine: 'A neighbour may cut an overhang back to the boundary.', facts: 'Ash’s oak overhung Rowan’s lawn. Rowan cut it back and kept the branches.' },
    'hc-birch': { name: 'Birch v Elm', oneLine: 'Light can be protected by long use.', facts: 'Elm planted a hedge that darkened Birch’s window.' },
    'hc-cedar': { name: 'Re Cedar', oneLine: 'Notice is needed before cutting a shared hedge.' },
    'hc-dale': { name: 'Dale v Fen', oneLine: 'A pond owner is liable for seepage.' },
    'hc-oak': { name: 'Oak v Pine', oneLine: 'Roots are treated like branches.' }
  },
  mcqs: [{ id: 'gq-1', topic: 'g-hedge', q: 'Who may cut an overhang?', options: ['Anyone', 'The neighbour', 'The council', 'No one'], answer: 1, why: 'Abatement.' }]
};
const [hedge, pond, empty] = subject.units[0].topics;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('reads the Key words table, bold removed, and stops at the next heading', () => {
  const rows = R.keyWordRows(hedge.guide);
  assert.deepStrictEqual(rows.map(r => r.term), ['Boundary hedge', 'Overhang', 'Abatement', 'Light / air', 'Notice']);
  assert.strictEqual(rows[1].meaning, 'Branches that cross into the next plot.');
  assert.deepStrictEqual(R.keyWordRows('no table'), []);
  const linked = R.keyWordRows('### Key terms\n| Term | Meaning |\n|---|---|\n| **Lease** | See [[c:x|X v Y]] for it |\n');
  assert.strictEqual(linked[0].meaning, 'See [[c:x|X v Y]] for it', 'a | inside a link does not split the cell');
});

test('the quiz grows with the notes: about one question per 100 words, 6 to 20', () => {
  assert.strictEqual(R.quizSize(words(300)), 6);
  assert.strictEqual(R.quizSize(words(1400)), 14);
  assert.strictEqual(R.quizSize(words(5000)), 20);
});

test('a topic quiz keeps the written questions and adds ones built from its cases and key words', () => {
  const q = R.topicQuiz(subject, hedge, { rnd });
  assert.strictEqual(q[0].id, 'gq-1');
  const made = q.filter(x => x.generated);
  // 3 case holdings + 2 facts + 5 terms + 5 meanings = 15 available; the guide's ~1,460 words ask for 15.
  assert.strictEqual(R.quizSize(hedge.guide), 15);
  assert.strictEqual(made.length, 15);
  assert.strictEqual(R.topicQuiz(subject, hedge, { rnd, size: 9 }).filter(x => x.generated).length, 9, 'a smaller size takes fewer');
  assert.ok(made.every(x => x.options.length === 4 && x.options[x.answer] && new Set(x.options).size === 4), 'four distinct options with the answer among them');
  assert.ok(made.every(x => x.topic === 'g-hedge'));
  assert.strictEqual(new Set(made.map(x => x.id)).size, made.length, 'ids are unique');
  const kinds = new Set(made.map(x => x.id.split(':')[2]));
  for (const k of ['case', 'kw', 'facts', 'mean']) assert.ok(kinds.has(k), 'has ' + k);
});

test('a short quiz still mixes cases and key words before anything else', () => {
  const q = R.topicQuiz(subject, hedge, { rnd, size: 4 }).filter(x => x.generated);
  assert.deepStrictEqual(q.map(x => x.id.split(':')[2]).sort(), ['case', 'case', 'kw', 'kw']);
});

test('the answer is hidden in the question', () => {
  const q = R.topicQuiz(subject, hedge, { rnd, size: 30 });
  const facts = q.find(x => x.id === 'gen:g-hedge:facts:hc-ash');
  assert.ok(!/Ash|Rowan/.test(facts.q) && /___/.test(facts.q), facts.q);
  const light = q.find(x => x.id === 'gen:g-hedge:kw:light-air');
  assert.ok(!/\blight\b|\bair\b/i.test(light.q), light.q);
  assert.strictEqual(light.options[light.answer], 'Light / air');
});

test('wrong options come from the same topic first, then the rest of the subject', () => {
  const q = R.topicQuiz(subject, pond, { rnd, size: 30 });
  const c = q.find(x => x.id === 'gen:g-pond:case:hc-dale');
  assert.strictEqual(c.options[c.answer], 'Dale v Fen');
  assert.ok(c.options.every(o => ['Dale v Fen', 'Ash v Rowan', 'Birch v Elm', 'Re Cedar', 'Oak v Pine'].includes(o)));
  const kw = q.find(x => x.id === 'gen:g-pond:kw:seepage');
  assert.ok(kw.options.includes('Stocking'), 'the other term in its own table');
  assert.strictEqual(R.quizSize(pond.guide), 6);
});

test('a topic with no cases or key words gets only its written questions', () => {
  assert.deepStrictEqual(R.topicQuiz(subject, empty, { rnd }), []);
  assert.deepStrictEqual(R.topicQuiz({ ...subject, cases: {} }, { id: 'x', guide: '' }, { rnd }), []);
});

console.log(`${passed} tests passed`);
