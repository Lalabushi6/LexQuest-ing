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

console.log(`\n${passed} revision tests passed`);
