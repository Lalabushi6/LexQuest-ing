// Tests for app/js/calendar.js: the month grid, collecting events, repeats, Google bodies and diffs,
// events read from Google and the .ics export. Run with: npm test
const assert = require('assert');
const C = require('../app/js/calendar.js');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

// Everything below is made up; it stands in for any course.
const subjects = { lease: { short: 'Leases', name: 'Law of Leases' }, sail: { short: 'Sailing', name: 'Sailing Law' } };

test('the month grid starts on a Monday and covers the whole month', () => {
  const weeks = C.monthGrid(2031, 1); // February 2031 starts on a Saturday
  assert.strictEqual(weeks[0][0], '2031-01-27');
  assert.ok(weeks.every(w => w.length === 7));
  assert.ok(weeks.flat().includes('2031-02-01') && weeks.flat().includes('2031-02-28'));
  assert.strictEqual(C.parse(weeks[weeks.length - 1][0]).getMonth(), 1);
  assert.strictEqual(new Date(2031, 0, 27).getDay(), 1);
});

test('own events are cleaned: bad dates, times and repeats are refused or fixed', () => {
  assert.strictEqual(C.cleanOwn({ id: 'a', title: 'x', date: '2031-02-30' }), null);
  assert.strictEqual(C.cleanOwn({ id: 'a', title: '  ', date: '2031-02-03' }), null);
  assert.strictEqual(C.cleanOwn({ title: 'no id', date: '2031-02-03' }), null);
  const e = C.cleanOwn({ id: 'a1', title: 'Moot court', date: '2031-02-03', allDay: false, start: '14:00', end: '13:00', repeat: 'weekly', until: '2031-01-01', kind: 'nonsense' });
  assert.deepStrictEqual([e.allDay, e.start, e.end, e.repeat, e.until, e.kind], [false, '14:00', '15:00', 'weekly', '', 'other']);
  assert.strictEqual(C.cleanOwn({ id: 'b', title: 'Holiday', date: '2031-02-03', start: '25:00' }).allDay, true);
});

test('collect gathers exams, the plan from today, recall checks and own events', () => {
  const plan = { days: {
    '2031-02-02': { date: '2031-02-02', items: [{ state: 'done', hours: 2, subject: 'lease', text: 'Notice' }], extra: [] },
    '2031-02-03': { date: '2031-02-03', items: [{ state: 'done', hours: 1, subject: 'lease', text: 'Notice' }, { state: 'open', hours: 1.5, subject: 'sail', text: 'Salvage' }, { state: 'dropped', hours: 1, subject: 'sail', text: 'Gone' }], extra: [{ hours: 0.75, subject: 'lease', text: 'Rent', part: 1, parts: 2 }] },
    '2031-02-04': { date: '2031-02-04', isExamDay: true, items: [{ state: 'exam', subject: 'exam', text: 'Leases final' }], extra: [] },
    '2031-02-05': { date: '2031-02-05', items: [{ state: 'done', hours: 1, subject: 'sail', text: 'Charts' }], extra: [] }
  } };
  const ev = C.collect({
    exams: [{ subject: 'lease', date: '2031-02-04', title: 'Leases final', note: '50 marks' }, { subject: 'lease', date: '2031-02-04', title: 'dup' }, { subject: 'sail', date: 'soon', title: 'bad' }],
    plan, subjects, today: '2031-02-03',
    recalls: [{ topic: 't1', title: 'Notice', subject: 'lease', date: '2031-02-06', checkpoint: 3 }, { topic: 't2', title: 'Rent', subject: 'lease', date: '2031-02-01', checkpoint: 1, overdue: true }, { topic: 't3', title: 'Old', date: '2031-02-01', checkpoint: 7 }],
    own: [{ id: 'o1', title: 'Moot court', date: '2031-02-03', allDay: false, start: '09:00', end: '10:30' }, { id: 'o2', title: '', date: '2031-02-03' }]
  });
  assert.deepStrictEqual(ev.map(e => e.key), ['plan:2031-02-03', 'recall:t2:1', 'own:o1', 'exam:lease:2031-02-04', 'plan:2031-02-05', 'recall:t1:3']);
  const day = ev.find(e => e.key === 'plan:2031-02-03');
  assert.strictEqual(day.title, '📚 Study: Leases, Sailing · ≈ 3.25 h');
  assert.strictEqual(day.label, '📚 3.25 h · Leases, Sailing');
  assert.strictEqual(day.details, '✓ 1 h · Leases — Notice\n• 1.5 h · Sailing — Salvage\n↩ 0.75 h · Leases — Rent (part 1 of 2)');
  assert.strictEqual(ev.find(e => e.key === 'plan:2031-02-05').title, '✓ Studied: Sailing · ≈ 1 h');
  // The day of a paper still lists the study around it; the paper itself is only the exam's entry.
  const paperDay = C.collect({ exams: [{ subject: 'lease', date: '2031-02-07', title: 'Leases final' }], plan: { days: { '2031-02-07': { date: '2031-02-07', isExamDay: true, items: [{ state: 'open', hours: 0.5, subject: 'lease', text: 'Morning sheet' }, { state: 'exam', subject: 'exam', text: 'Leases final' }, { state: 'open', hours: 2, subject: 'sail', text: 'Salvage' }], extra: [] } } }, subjects, today: '2031-02-03' });
  assert.deepStrictEqual(paperDay.map(e => e.key), ['exam:lease:2031-02-07', 'plan:2031-02-07']);
  assert.strictEqual(paperDay[1].title, '📚 Study: Leases, Sailing · ≈ 2.5 h');
  assert.ok(!paperDay[1].details.includes('Leases final'));
  // A block that isn't a course (due cards for every subject) is left out of the title, not the details.
  const mixed = C.collect({ plan: { days: { '2031-02-06': { date: '2031-02-06', items: [{ state: 'open', hours: 0.5, subject: 'Every subject', text: 'Due cards' }, { state: 'open', hours: 1, subject: 'sail', text: 'Charts' }], extra: [] } } }, subjects, today: '2031-02-03' })[0];
  assert.strictEqual(mixed.title, '📚 Study: Sailing · ≈ 1.5 h');
  assert.ok(mixed.details.startsWith('• 0.5 h · Every subject — Due cards'));
  assert.strictEqual(ev.find(e => e.kind === 'exam').title, '🎓 Leases final');
  assert.strictEqual(ev.find(e => e.key === 'recall:t2:1').date, '2031-02-03');
  const only = C.collect({ exams: [{ subject: 'lease', date: '2031-02-04', title: 'x' }], plan, subjects, today: '2031-02-03', include: { plan: false, recall: false } });
  assert.deepStrictEqual(only.map(e => e.kind), ['exam']);
});

test('weekly events repeat until their end date, and byDay places each repeat', () => {
  const [w] = C.collect({ own: [{ id: 'w', title: 'Seminar', date: '2031-01-06', allDay: false, start: '10:00', repeat: 'weekly', until: '2031-02-03' }], today: '2031-01-01' });
  assert.deepStrictEqual(C.datesOf(w, '2031-01-20', '2031-03-01'), ['2031-01-20', '2031-01-27', '2031-02-03']);
  const days = C.byDay([w], '2031-01-01', '2031-01-31');
  assert.deepStrictEqual(Object.keys(days).sort(), ['2031-01-06', '2031-01-13', '2031-01-20', '2031-01-27']);
  assert.ok(days['2031-01-13'][0].occurrence && !days['2031-01-06'][0].occurrence);
  const open = { ...w, until: '' };
  assert.strictEqual(C.datesOf(open, '2031-01-01', '2033-01-01').length, 53);
});

test('Google bodies: all-day and timed events, repeats, colours and a stable fingerprint', () => {
  const ev = C.collect({ own: [{ id: 'w', title: 'Seminar', date: '2031-01-06', allDay: false, start: '10:00', end: '11:00', repeat: 'weekly', until: '2031-02-03' }], exams: [{ subject: 'lease', date: '2031-02-04', title: 'Leases final' }], today: '2031-01-01' });
  const exam = C.googleBody(ev.find(e => e.kind === 'exam'), 'Asia/Kolkata');
  assert.deepStrictEqual([exam.start, exam.end, exam.colorId, exam.transparency], [{ date: '2031-02-04' }, { date: '2031-02-05' }, '11', 'transparent']);
  const own = C.googleBody(ev.find(e => e.kind === 'own'), 'Asia/Kolkata');
  assert.deepStrictEqual(own.start, { dateTime: '2031-01-06T10:00:00', timeZone: 'Asia/Kolkata' });
  assert.ok(/^RRULE:FREQ=WEEKLY;UNTIL=\d{8}T\d{6}Z$/.test(own.recurrence[0]), own.recurrence[0]);
  assert.strictEqual(own.colorId, undefined);
  assert.strictEqual(own.extendedProperties.private.lqKey, 'own:w');
  assert.strictEqual(C.googleBody(ev.find(e => e.kind === 'own'), 'Asia/Kolkata').extendedProperties.private.lqHash, own.extendedProperties.private.lqHash);
  assert.notStrictEqual(C.googleBody({ ...ev.find(e => e.kind === 'own'), title: 'Other' }, 'Asia/Kolkata').extendedProperties.private.lqHash, own.extendedProperties.private.lqHash);
});

test('diff inserts, updates and removes only what changed, and leaves past days and others alone', () => {
  const body = (key, date, title = key) => C.googleBody({ key, kind: key.split(':')[0], date, allDay: true, title }, 'UTC');
  const asGoogle = (b, id) => ({ id, ...JSON.parse(JSON.stringify(b)) });
  const existing = [
    asGoogle(body('exam:a:2031-02-10', '2031-02-10'), 'e1'),                 // unchanged
    asGoogle(body('plan:2031-02-05', '2031-02-05', 'old title'), 'e2'),      // changed
    asGoogle(body('plan:2031-02-06', '2031-02-06'), 'e3'),                   // no longer planned
    asGoogle(body('plan:2031-02-01', '2031-02-01'), 'e4'),                   // past: kept
    asGoogle(body('own:gone', '2031-01-20'), 'e5'),                          // deleted in the app: removed even though past
    asGoogle(body('exam:a:2031-02-10', '2031-02-10'), 'e6'),                 // duplicate
    { id: 'e7', summary: 'Added by hand in Google', start: { date: '2031-02-07' } } // not LexQuest's
  ];
  const desired = [body('exam:a:2031-02-10', '2031-02-10'), body('plan:2031-02-05', '2031-02-05'), body('own:new', '2031-02-08')];
  const d = C.diff(desired, existing, '2031-02-03');
  assert.deepStrictEqual(d.insert.map(b => b.extendedProperties.private.lqKey), ['own:new']);
  assert.deepStrictEqual(d.update.map(u => u.id), ['e2']);
  assert.deepStrictEqual(d.remove.sort(), ['e3', 'e5', 'e6']);
});

test('events read from Google: all-day spans, timed events and cancelled ones', () => {
  const items = [
    { id: 'g1', summary: 'Trip', start: { date: '2031-03-01' }, end: { date: '2031-03-04' } },
    { id: 'g2', summary: 'Dentist', start: { dateTime: new Date(2031, 2, 5, 15, 30).toISOString() }, end: { dateTime: new Date(2031, 2, 5, 16, 15).toISOString() }, htmlLink: 'https://www.google.com/calendar/event?eid=x' },
    { id: 'g3', status: 'cancelled', start: { date: '2031-03-02' } },
    { id: 'g4', start: { dateTime: new Date(2031, 2, 6, 22, 0).toISOString() }, end: { dateTime: new Date(2031, 2, 7, 1, 0).toISOString() }, htmlLink: 'javascript:alert(1)' }
  ];
  const ev = C.fromGoogle(items, { summary: 'Personal', color: '#33b679' });
  assert.deepStrictEqual(ev.map(e => [e.date, e.title, e.start, e.end]), [
    ['2031-03-01', 'Trip', '', ''], ['2031-03-02', 'Trip', '', ''], ['2031-03-03', 'Trip', '', ''],
    ['2031-03-05', 'Dentist', '15:30', '16:15'], ['2031-03-06', '(No title)', '22:00', '23:59'], ['2031-03-07', '(No title)', '00:00', '01:00']
  ]);
  assert.ok(ev.every(e => e.calendar === 'Personal' && e.color === '#33b679'));
  assert.strictEqual(ev.find(e => e.title === '(No title)').link, '');
});

test('the .ics file escapes text, folds long lines and writes repeats', () => {
  const ev = C.collect({ own: [{ id: 'w', title: 'Seminar; room 4, east', date: '2031-01-06', allDay: false, start: '10:00', end: '11:00', repeat: 'weekly', until: '2031-02-03', note: 'Bring: notes\nand ' + 'a very long reading list '.repeat(6) }], exams: [{ subject: 'lease', date: '2031-02-04', title: 'Leases final ✓' }], today: '2031-01-01' });
  const ics = C.toICS(ev, { now: new Date(Date.UTC(2031, 0, 1)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:Seminar\\; room 4\\, east'));
  assert.ok(ics.includes('DTSTART:20310106T100000') && ics.includes('RRULE:FREQ=WEEKLY;UNTIL=20310203T235959'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20310204') && ics.includes('DTEND;VALUE=DATE:20310205'));
  assert.ok(ics.includes('DTSTAMP:20310101T000000Z'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  assert.ok(ics.includes('\r\n '), 'long description folded');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:Bring: notes\\nand a very long reading list'));
});

console.log(`\n${passed} calendar tests passed`);
