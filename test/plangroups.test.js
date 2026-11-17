// Tests for app/js/plangroups.js: grouping the adaptive plan by module and by course week.
// Run with: npm test
const assert = require('assert');
const { groupPlan, indexTopics } = require('../app/js/plangroups.js');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

// Everything below is made up; it stands in for any course.
const subjects = {
  sail: { short: 'Sailing', name: 'Sailing Law', units: [
    { title: 'Weeks 1–2 — Ships', topics: [{ id: 's-hull', week: '1–2' }, { id: 's-flag', week: '2' }] },
    { title: 'Week 10 — Salvage', topics: [{ id: 's-salvage', week: '10' }] },
    { title: 'Extras', topics: [{ id: 's-misc' }] }] },
  lease: { short: 'Leases', name: 'Law of Leases', units: [
    { title: 'Rent', topics: [{ id: 'l-rent', week: 3 }] }] }
};
const days = [{ date: '2031-02-02' }, { date: '2031-02-03' }, { date: '2031-02-04' }];
const plan = { days: {
  '2031-02-02': { items: [
    { id: 'a', topic: 's-salvage', subject: 'sail', hours: 1, state: 'done', text: 'Salvage' },
    { id: 'b', topic: 's-hull', subject: 'sail', hours: 1.5, state: 'moved', text: 'Hulls' },
    { id: 'c', subject: 'sail', hours: 0.5, state: 'open', text: 'Timed answer' }], extra: [] },
  '2031-02-03': { items: [
    { id: 'd', topic: 'l-rent', subject: 'lease', hours: 0.75, state: 'open', text: 'Rent' },
    { id: 'e', topic: 's-flag', subject: 'sail', hours: 1, state: 'dropped', text: 'Flags' },
    { id: 'f', topic: 's-misc', subject: 'sail', hours: 0.25, state: 'open', text: 'Odds and ends' },
    { id: 'g', subject: 'All subjects', hours: 0.5, state: 'open', text: 'Flashcards' }],
  extra: [{ id: 'b', pieceId: 'b#1', topic: 's-hull', subject: 'sail', hours: 0.75, done: true, part: 1, parts: 2, text: 'Hulls' }] },
  '2031-02-04': { isExamDay: true, items: [{ state: 'exam', subject: 'exam', text: 'Sailing final' },
    { id: 'h', topic: 's-flag', subject: 'sail', hours: 1, state: 'open', text: 'Flags again' }],
  extra: [{ id: 'b', pieceId: 'b#2', topic: 's-hull', subject: 'sail', hours: 0.75, done: false, part: 2, parts: 2, text: 'Hulls' }] }
} };

test('indexTopics finds each topic’s subject, module and week', () => {
  const ix = indexTopics(subjects);
  assert.deepStrictEqual(ix['s-flag'], { subject: 'sail', si: 0, ui: 0, unit: 'Weeks 1–2 — Ships', week: '2' });
  assert.strictEqual(ix['l-rent'].week, '3');
  assert.strictEqual(ix['s-misc'].week, '');
});

test('by module: groups follow the subject order, then the pack’s unit order, then other blocks', () => {
  const g = groupPlan({ days, plan, subjects, by: 'module' });
  assert.deepStrictEqual(g.map(x => `${x.subject}:${x.title}`), [
    'sail:Weeks 1–2 — Ships', 'sail:Week 10 — Salvage', 'sail:Extras', 'sail:Other blocks', 'lease:Rent', 'All subjects:Other blocks']);
  assert.strictEqual(g[0].subjectName, 'Sailing Law');
  assert.strictEqual(g[5].subjectName, 'All subjects');
});

test('by module: rows keep their dates and kinds, a day’s own blocks before its catch-up pieces; exams and dropped blocks are left out', () => {
  const ships = groupPlan({ days, plan, subjects, by: 'module' })[0];
  assert.deepStrictEqual(ships.rows.map(r => `${r.date}:${r.kind}:${r.item.id}`), ['2031-02-02:item:b', '2031-02-03:piece:b', '2031-02-04:item:h', '2031-02-04:piece:b']);
  const all = groupPlan({ days, plan, subjects, by: 'module' }).flatMap(x => x.rows.map(r => r.item.id || r.item.text));
  assert.ok(!all.includes('e') && !all.includes('Sailing final'));
});

test('hours: a moved block counts through its pieces, not twice; done hours add up', () => {
  const ships = groupPlan({ days, plan, subjects, by: 'module' })[0];
  assert.strictEqual(ships.hours, 2.5); // pieces 0.75 + 0.75, plus Flags again 1; the moved original adds nothing
  assert.strictEqual(ships.doneHours, 0.75);
  const salvage = groupPlan({ days, plan, subjects, by: 'module' })[1];
  assert.deepStrictEqual([salvage.hours, salvage.doneHours], [1, 1]);
});

test('by week: ordered by the first week number; topics with no week come after numbered weeks', () => {
  const g = groupPlan({ days, plan, subjects, by: 'week' });
  assert.deepStrictEqual(g.map(x => `${x.subject}:${x.title}`), [
    'sail:Weeks 1–2', 'sail:Week 2', 'sail:Week 10', 'sail:No week given', 'sail:Other blocks', 'lease:Week 3', 'All subjects:Other blocks']);
  assert.deepStrictEqual(g[1].rows.map(r => r.item.id), ['h']);
});

test('copes with a missing plan day, an empty plan and unknown topics', () => {
  assert.deepStrictEqual(groupPlan({ days: [{ date: '2031-03-01' }], plan, subjects, by: 'week' }), []);
  assert.deepStrictEqual(groupPlan({ days: [], plan: { days: {} }, subjects: {}, by: 'module' }), []);
  const odd = groupPlan({ days: [{ date: 'x' }], plan: { days: { x: { items: [{ id: 'z', topic: 'nope', subject: 'sail', hours: 1, state: 'open' }] } } }, subjects, by: 'module' });
  assert.deepStrictEqual(odd.map(x => `${x.subject}:${x.title}:${x.hours}`), ['sail:Other blocks:1']);
});

console.log(`\n${passed} plan-grouping tests passed`);
