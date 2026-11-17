// Tests for app/js/palaceplan.js: drawing a memory palace as a floor plan. Run with: npm test
const assert = require('assert');
const { planSvg, layout } = require('../app/js/palaceplan.js');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

// Everything below is made up; it stands in for any palace.
const palace = { name: 'The Boathouse', rooms: [
  { name: 'Slipway', icon: '⛵', loci: [{ id: 'b1', spot: 'Winch' }, { id: 'b2', spot: 'Rope <coil> & "hook"' }] },
  { name: 'Sail loft', icon: '🇳🇴', loci: [{ id: 'b3', spot: 'Mast', mark: '🪵' }] },
  { name: 'A very long room name that will not fit on one line at all', loci: [{ id: 'b4', spot: 'Bench' }, { id: 'b5', spot: 'Lamp' }, { id: 'b6', spot: 'Hook' }, { id: 'b7', spot: 'Chest' }] }
] };

test('layout: rooms snake so each room touches the next; rows fit their fullest room', () => {
  const L = layout([2, 1, 2, 7, 1]);
  assert.strictEqual(L.cols, 3);
  const [a, b, c, d, e] = L.cells;
  assert.ok(a.y === b.y && b.x > a.x && c.x > b.x, 'row 1 runs left to right');
  assert.ok(d.x === c.x && d.y > c.y, 'the turn goes straight down');
  assert.ok(e.y === d.y && e.x < d.x, 'row 2 runs right to left');
  assert.strictEqual(L.empty.length, 1);
  assert.ok(d.h > a.h, 'a row with seven loci is taller than one with two');
});

test('planSvg draws every room and a numbered marker per locus, in walking order', () => {
  const svg = planSvg(palace);
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  for (let n = 1; n <= 7; n++) assert.ok(svg.includes(`>${n}</text>`), `marker ${n}`);
  assert.ok(svg.includes('SLIPWAY') && svg.includes('SAIL LOFT'));
  assert.ok(svg.includes('START') && svg.includes('stroke-dasharray="9 7"'), 'a start and a dashed route');
  assert.ok(svg.includes('🪵'), 'a locus mark is drawn when given');
});

test('text is escaped, flags become a plain flag, and long names are cut to two lines', () => {
  const svg = planSvg(palace);
  assert.ok(svg.includes('Rope &lt;coil&gt;') || svg.includes('Rope &lt;coil…'), 'spot names are escaped');
  assert.ok(!/<coil>/.test(svg) && !svg.includes('🇳🇴') && svg.includes('🚩'));
  const nameLines = (svg.match(/font-size="15" font-weight="800"[^>]*>([^<]*)</g) || []).length;
  assert.strictEqual(nameLines, 4, 'one line, one line, two lines');
});

test('recalled and missed loci are coloured; an empty palace draws nothing', () => {
  const svg = planSvg(palace, { walks: { b1: { ok: true }, b2: { ok: false } } });
  assert.ok(svg.includes('#2f9e5b') && svg.includes('#c8463d'));
  assert.strictEqual(planSvg({ rooms: [] }), '');
  assert.strictEqual(planSvg(null), '');
});

console.log(`\n${passed} floor-plan tests passed`);
