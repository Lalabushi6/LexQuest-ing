// Tests for app/js/breaks.js: a custom break moves the day's clock times and later long breaks win time back.
// Run with: npm test
const assert = require('assert');
const B = require('../app/js/breaks.js');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };
const at = s => { const [, h, m, ap] = s.match(/(\d+):(\d\d)\s?(am|pm)/); return (+h % 12 + (ap === 'pm' ? 12 : 0)) * 60 + +m; };

// A made-up night of study; the topics stand in for any course.
const night = () => [
  { id: 'a', subject: 's', text: '1:00 am · 1 pomodoro · Topic A', hours: 0.5 },
  { id: 'b', subject: 's', text: '1:30 am · 2 pomodoros (1:30 and 2:00) · Topic B. Long break 2:25–2:40', hours: 1 },
  { id: 'c', subject: 's', text: '2:40 am · 3 pomodoros (2:40, 3:10, 3:40) · Topic C. Long break 4:05–4:20: eat', hours: 1.5 },
  { id: 'd', subject: 's', text: '4:20 am · 2 pomodoros (4:20 and 4:50) · Topic D. Stop at 5:15', hours: 1 },
  { id: 'n', subject: 's', text: 'Untimed block: flashcards', hours: 0.5 },
  { subject: 'exam', text: 'PAPER · 7 am' }
];

test('no breaks: nothing moves', () => {
  const r = B.shiftDay(night(), []);
  assert.deepStrictEqual(r.items.map(i => i.text), night().map(i => i.text));
  assert.strictEqual(r.finish, at('5:15 am'));
  assert.strictEqual(r.late, 0);
  assert.strictEqual(r.deadline, at('7:00 am'));
});

test('a 20-minute break moves later times, then the next long breaks win it back', () => {
  const r = B.shiftDay(night(), [{ start: at('1:10 am'), min: 20 }]);
  const [a, b, c, d, n] = r.items.map(i => i.text);
  assert.strictEqual(a, night()[0].text, 'a block started before the break keeps its start');
  // +20 until the first long break, which shrinks from 15 to 5 (saves 10); +10 until the next, which saves the rest.
  assert.strictEqual(b, '1:50 am · 2 pomodoros (1:50 and 2:20) · Topic B. Long break 2:45–2:50');
  assert.strictEqual(c, '2:50 am · 3 pomodoros (2:50, 3:20, 3:50) · Topic C. Long break 4:15–4:20: eat');
  assert.strictEqual(d, night()[3].text, 'back on the plan by 4:20');
  assert.strictEqual(n, 'Untimed block: flashcards');
  assert.strictEqual(r.late, 0);
  assert.deepStrictEqual(r.absorbed.map(x => [x.was, x.now]), [[15, 5], [15, 5]]);
});

test('a break too long to absorb makes the day finish late, and says by how much', () => {
  const r = B.shiftDay(night(), [{ start: at('1:10 am'), min: 45 }]);
  assert.strictEqual(r.late, 25);
  assert.strictEqual(B.fmt(r.newFinish, true), '5:40 am');
  assert.strictEqual(r.spare, at('7:00 am') - at('5:40 am'));
  assert.ok(r.items[3].text.startsWith('4:45 am · 2 pomodoros (4:45 and 5:15)') && r.items[3].text.endsWith('Stop at 5:40'), r.items[3].text);
  assert.strictEqual(r.items[3].shiftedBy, 25);
});

test('turning absorption off moves everything by the whole break', () => {
  const r = B.shiftDay(night(), [{ start: at('1:10 am'), min: 20 }], { absorb: false });
  assert.strictEqual(r.late, 20);
  assert.ok(r.items[3].text.startsWith('4:40 am'));
});

test('a break taken inside a long break only delays by the overrun', () => {
  const r = B.shiftDay(night(), [{ start: at('2:30 am'), min: 20 }]); // the plan's long break ends 2:40; this ends 2:50
  assert.ok(r.items[2].text.startsWith('2:50 am · 3 pomodoros (2:50, 3:20, 3:50)'), r.items[2].text);
  assert.strictEqual(r.items[1].text, '1:30 am · 2 pomodoros (1:30 and 2:00) · Topic B. Long break 2:25–2:50', 'its long break now runs to 2:50');
  assert.strictEqual(r.late, 0, 'the next long break absorbs the 10 minutes');
  const short = B.shiftDay(night(), [{ start: at('2:28 am'), min: 10 }]);
  assert.deepStrictEqual(short.items.map(i => i.text), night().map(i => i.text), 'a break that ends inside the long break moves nothing');
});

test('two breaks add up', () => {
  const r = B.shiftDay(night(), [{ start: at('1:10 am'), min: 10 }, { start: at('3:20 am'), min: 30 }]);
  // First: +10, the 2:25 long break gives 10 back. Second: +30 from 3:20, the 4:05 long break gives 10; 20 late.
  assert.ok(r.items[2].text.startsWith('2:40 am · 3 pomodoros (2:40, 3:10, 4:10)'), r.items[2].text);
  assert.strictEqual(r.late, 20);
});

test('times without am/pm read from the block start, across noon and midnight', () => {
  const r = B.shiftDay([{ id: 'x', text: '11:30 am · 2 pomodoros (11:30 and 12:00) · X. Stop at 12:25', hours: 1 }], [{ start: at('11:00 am'), min: 15 }]);
  assert.strictEqual(r.items[0].text, '11:45 am · 2 pomodoros (11:45 and 12:15) · X. Stop at 12:40');
  const late = B.shiftDay([{ id: 'y', text: '11:40 pm · 1 pomodoro · Y', hours: 0.5 }], [{ start: at('11:30 pm'), min: 30 }]);
  assert.strictEqual(late.items[0].text, '12:10 am · 1 pomodoro · Y');
});

test('a break start is counted from the plan day’s midnight', () => {
  const ts = new Date(2026, 0, 2, 1, 42).getTime();
  assert.strictEqual(B.minutesInto('2026-01-02', ts), 102);
  assert.strictEqual(B.minutesInto('2026-01-01', ts), 1440 + 102);
});

console.log(`${passed} break tests passed`);
