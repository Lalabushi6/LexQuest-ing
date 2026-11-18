// Tests for app/js/revision-core.js: typed-answer matching and the Base Defence question bank.
// Run with: npm test
const assert = require('assert');
const R = require('../app/js/revision-core.js');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

test('exact, case, punctuation and "the" are ignored', () => {
  assert(R.matches('Doctrine of Salvage', ['doctrine of salvage']));
  assert(R.matches('the doctrine of salvage', ['doctrine of salvage']));
  assert(R.matches('Smith vs. Jones', ['smith v jones']));
  assert(R.matches('Café Rule', ['cafe rule']));
});
test('small typos on longer words, including swapped letters', () => {
  assert(R.matches('barnacel', ['barnacle']));
  assert(R.matches('barnalce', ['barnacle']));
  assert(R.matches('admirality jurisdiction', ['admiralty jurisdiction']));
  assert(!R.matches('hull', ['hall']));
  assert(!R.matches('keel', ['reef']));
});
test('numbers must be exact', () => {
  assert(R.matches('s. 23', ['s 23', '23']));
  assert(!R.matches('section 25', ['section 23', '23']));
  assert(!R.matches('12600', ['12500']));
  assert(R.matches('8.47%', ['8.47']));
  assert(!R.matches('8.74', ['8.47']));
  assert(!R.matches('o 7 r 10', ['o 7 r 11']));
});
test('the answer inside a slightly longer phrase counts', () => {
  assert(R.matches('salvage reward rule', ['salvage reward']));
  assert(!R.matches('salvage', ['salvage reward']));
});
test('empty or junk input never matches', () => {
  assert(!R.matches('', ['salvage']));
  assert(!R.matches('   ', ['salvage']));
  assert(R.matches('a', ['a', '1(a)']) && !R.matches('b', ['a', '1(a)']));
});
test('exactHit fires only on a full answer', () => {
  assert(R.exactHit('Barnacle', ['barnacle']));
  assert(!R.exactHit('barnac', ['barnacle']));
});
test('case aliases: full name, first party, distinctive surname; generic words skipped', () => {
  const a = R.caseAliases('Harbourmaster Quill v Union of Ports (2031)');
  assert(a.includes('harbourmaster quill v union of ports'));
  assert(a.includes('harbourmaster quill'));
  assert(a.includes('quill'));
  const b = R.caseAliases('State of Atlantis v Merrow Shipping Ltd');
  assert(b.includes('merrow shipping ltd') && b.includes('merrow'));
  assert(!b.includes('state of atlantis'));
});
test('alias sets: brackets dropped, "a / b" split, "p/e" kept whole', () => {
  const s = R.aliasSet(['Salvage (maritime)', 'tow / tug', 'p/e']);
  assert(s.includes('salvage') && s.includes('tow') && s.includes('tug') && s.includes('p/e'));
  assert(!s.includes('p') && !s.includes('e'));
});
test('answers already printed in the clue are dropped', () => {
  const a = R.dropLeaks('Clause of s. 13 on wrecks', ['13(1)', '13', 's 13', 'section 13(1)']);
  assert.deepStrictEqual(a, ['13(1)', 'section 13(1)']);
  assert.deepStrictEqual(R.dropLeaks('The hull rule', ['hull']), ['hull']); // never left empty
});

// A made-up subject using every source of questions.
const S = {
  id: 'sail', name: 'Sailing Law',
  units: [{ title: 'Week 1', topics: [{ id: 's-hull', title: 'Hulls', cases: ['sc-quill'],
    guideDeep: '### Key words\n| Key word | Meaning |\n|---|---|\n| **Barnacle clause** | A term letting the owner scrape the hull before delivery. |\n' }] }],
  cards: [
    { id: 'c1', topic: 's-hull', front: 'Who scrapes the hull?', back: 'The **owner**, under the barnacle clause.' },
    { id: 'c2', topic: 's-hull', type: 'cloze', text: 'A ship must carry {{two anchors}} in harbour.' }
  ],
  cases: { 'sc-quill': { name: 'Quill v Merrow (2031)', oneLine: 'Quill lost because the hull was never scraped.', facts: 'Quill bought a ship from Merrow.', hook: 'A quill scratching barnacles.' } },
  mcqs: [{ id: 'm1', topic: 's-hull', q: 'How many anchors in harbour?', options: ['One', 'Two', 'All of the above'], answer: 1, why: 'Harbour rule.' }]
};
const curated = [{ t: 's-hull', d: 3, q: 'Name of the term on scraping before delivery', a: ['barnacle clause'], why: 'Owner scrapes first.' }];
const bank = R.buildBank(S, curated, () => null);

test('bank draws on hand-written questions, key words, cards, cases and MCQs', () => {
  const by = src => bank.filter(x => x.src === src).length;
  assert.strictEqual(by('core'), 1);
  assert.strictEqual(by('kw'), 1);
  assert.strictEqual(by('card'), 2);
  assert.strictEqual(by('case'), 3);
  assert.strictEqual(by('mcq'), 1);
});
test('every item is well formed and its shown answer is accepted', () => {
  for (const it of bank) {
    assert(it.id && it.q && it.a.length && it.show, JSON.stringify(it));
    assert(R.matches(it.show, it.a), 'shown answer not accepted: ' + it.show);
    assert([1, 2, 3].includes(it.d));
  }
  assert.strictEqual(new Set(bank.map(x => x.id)).size, bank.length);
});
test('case clues hide the case name', () => {
  for (const it of bank.filter(x => x.src === 'case')) {
    assert(!/quill|merrow/i.test(it.q), it.q);
    assert(R.matches('quill', it.a));
  }
});
test('duplicate clues are dropped', () => {
  const twice = R.buildBank(S, curated.concat(curated), () => null);
  assert.strictEqual(twice.filter(x => x.src === 'core').length, 1);
});

// The quick games, on a bigger made-up bank.
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const bigCurated = Array.from({ length: 16 }, (_, k) => ({ t: k % 2 ? 's-hull' : 's-sail', d: 2, q: `Clue number ${k} about knot ${String.fromCharCode(65 + k)}`, a: [`answer ${String.fromCharCode(97 + k)}${k}`], why: 'Because.' }));
const big = R.buildBank(S, bigCurated, () => null);

test('Lightning Judge: about half decoys, and a decoy is never an accepted answer', () => {
  const rounds = R.judgeRounds(big, 200, seeded(7));
  assert(rounds.length > 0 && rounds.length <= big.length);
  const many = []; for (let s = 1; s <= 20; s++) many.push(...R.judgeRounds(big, 10, seeded(s)));
  const decoys = many.filter(r => !r.truth);
  assert(decoys.length > many.length * 0.3 && decoys.length < many.length * 0.7, `decoys ${decoys.length}/${many.length}`);
  for (const r of many) {
    if (r.truth) assert.strictEqual(r.shown, r.it.show);
    else assert(!R.matches(r.shown, r.it.a), `decoy accepted: ${r.shown}`);
  }
  assert.deepStrictEqual(R.judgeRounds(big.slice(0, 2), 5), []); // too few to play
});
test('Match Pairs: six distinct answers, shuffled, each pair present once', () => {
  const b = R.pairBoard(big, 6, seeded(3));
  assert.strictEqual(b.pairs.length, 6);
  assert.strictEqual(new Set(b.pairs.map(x => R.norm(x.show))).size, 6);
  assert.deepStrictEqual(new Set(b.answers), new Set(b.pairs));
  assert.strictEqual(R.pairBoard(big.slice(0, 2), 6), null);
});
test('Fill the Gap: one bold term blanked per line, from lists and tables', () => {
  const sections = [{ id: 'x', title: 'Hulls', topic: 's-hull', md: '### Hulls\n- The **barnacle clause** lets the owner scrape the hull first.\n| Term | Meaning |\n|---|---|\n| **Keel** | The spine along the bottom of the ship. |\n- **and** is too short to ask about but this line is long enough.\nA paragraph with **bold** is skipped.' }];
  const g = R.gapLines(sections, R.plainWith(() => null));
  assert.strictEqual(g.length, 2, JSON.stringify(g));
  assert(g[0].text.includes('_____') && !/barnacle clause/i.test(g[0].text) && g[0].show === 'barnacle clause');
  assert(g[1].text.startsWith('_____ — The spine') && R.matches('keel', g[1].a));
  assert.strictEqual(g[0].t, 's-hull');
});

console.log(`\n${passed} revision tests passed`);
