// Calendar logic: the events LexQuest shows (exams, the study plan, spaced-recall checks, the person's
// own events and ones read from Google), the month grid, the .ics export, and what to change in Google
// so its "LexQuest" calendar matches. No DOM or app state in here, so the page and the main process
// (gcal.js) share it, and it can be tested on its own (test/calendar.test.js).
'use strict';
(function () {
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const KINDS = ['class', 'deadline', 'study', 'other'];
  const isDate = k => DATE.test(k || '') && keyOf(parse(k)) === k;
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  const plusHour = t => { const [h, m] = t.split(':').map(Number); return h >= 23 ? '23:59' : `${pad(h + 1)}:${pad(m)}`; };

  // Weeks of the month view, Monday first, each seven date keys padded with the neighbouring months.
  function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    let k = addDays(keyOf(first), -((first.getDay() + 6) % 7));
    const weeks = [];
    do {
      const week = [];
      for (let i = 0; i < 7; i++) { week.push(k); k = addDays(k, 1); }
      weeks.push(week);
    } while (parse(k).getMonth() === month);
    return weeks;
  }

  // One of the person's own events, made safe to store and send: a title, a date, a time or all day,
  // and an optional weekly repeat. Returns null when it can't be an event.
  function cleanOwn(ev) {
    if (!ev || typeof ev !== 'object') return null;
    const title = str(ev.title, 120), date = str(ev.date, 10);
    if (!title || !isDate(date)) return null;
    const out = { id: str(ev.id, 40).replace(/[^\w-]/g, '') || null, title, date, allDay: true, start: '', end: '', note: str(ev.note, 2000), kind: KINDS.includes(ev.kind) ? ev.kind : 'other', repeat: '', until: '' };
    if (!out.id) return null;
    if (!ev.allDay && TIME.test(ev.start || '')) {
      out.allDay = false; out.start = ev.start;
      out.end = TIME.test(ev.end || '') && ev.end > ev.start ? ev.end : plusHour(ev.start);
    }
    if (ev.repeat === 'weekly') { out.repeat = 'weekly'; out.until = isDate(ev.until) && ev.until >= date ? ev.until : ''; }
    return out;
  }

  // Everything LexQuest puts on the calendar, one entry per event (a weekly event is one entry):
  //   exams     [{ subject, date, title, note, time?, end? }]
  //   plan      the adaptive plan (planner.js), whose days are { date: { items, extra, isExamDay } }
  //   subjects  id -> { short, name }
  //   own       the person's own events
  //   recalls   [{ topic, title, subject, date, checkpoint, overdue? }]
  //   today     'YYYY-MM-DD': the plan and recall checks are only ever shown from today on
  //   include   { exams, plan, own, recall } (all true unless false)
  // Each comes back as { key, kind, date, allDay, start, end, title, details, repeat, until, subject }.
  function collect({ exams = [], plan = null, subjects = {}, own = [], recalls = [], today, include = {} }) {
    const on = k => include[k] !== false;
    const short = id => (subjects[id] && (subjects[id].short || subjects[id].name)) || id;
    const out = [];
    if (on('exams')) {
      const seen = new Set();
      for (const e of exams) {
        if (!e || !isDate(e.date)) continue;
        const key = `exam:${str(e.subject, 40) || 'x'}:${e.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const timed = TIME.test(e.time || '');
        out.push({ key, kind: 'exam', date: e.date, allDay: !timed, start: timed ? e.time : '', end: timed ? (TIME.test(e.end || '') && e.end > e.time ? e.end : plusHour(plusHour(plusHour(e.time)))) : '', title: `🎓 ${str(e.title, 120) || `${short(e.subject)} exam`}`, details: str(e.note, 500), subject: e.subject || '', repeat: '', until: '' });
      }
    }
    if (on('plan') && plan && plan.days) {
      for (const d of Object.values(plan.days)) {
        if (!d || !isDate(d.date) || d.date < today) continue;
        // On the day of a paper the paper itself is the exam's entry; the study around it is listed here.
        const rows = [];
        for (const it of d.items || []) {
          if (it.state !== 'open' && it.state !== 'done') continue;
          rows.push({ done: it.state === 'done', hours: it.hours || 0, subject: it.subject, text: it.text });
        }
        for (const p of d.extra || []) rows.push({ done: !!p.done, hours: p.hours || 0, subject: p.subject, text: `${p.text}${p.parts > 1 ? ` (part ${p.part} of ${p.parts})` : ''}`, moved: true });
        if (!rows.length) continue;
        const hours = Math.round(rows.reduce((a, r) => a + r.hours, 0) * 100) / 100;
        // Name the courses only; a block like "due cards, all subjects" stays in the details.
        const courses = rows.filter(r => subjects[r.subject]);
        const names = [...new Set((courses.length ? courses : rows).map(r => short(r.subject)).filter(Boolean))];
        const allDone = rows.every(r => r.done);
        out.push({
          key: `plan:${d.date}`, kind: 'plan', date: d.date, allDay: true, start: '', end: '', repeat: '', until: '', subject: '',
          title: `${allDone ? '✓ Studied' : '📚 Study'}: ${names.join(', ')}${hours ? ` · ≈ ${hours} h` : ''}`,
          label: `${allDone ? '✓' : '📚'} ${hours ? `${hours} h · ` : ''}${names.join(', ')}`, // the month view's short form
          details: rows.map(r => `${r.done ? '✓' : r.moved ? '↩' : '•'} ${r.hours ? `${r.hours} h · ` : ''}${short(r.subject)} — ${str(r.text, 200)}`).join('\n')
        });
      }
    }
    if (on('recall')) {
      for (const r of recalls) {
        const date = r.overdue ? today : r.date;
        if (!r || !isDate(date) || date < today) continue;
        out.push({ key: `recall:${str(r.topic, 60)}:${r.checkpoint}`, kind: 'recall', date, allDay: true, start: '', end: '', repeat: '', until: '', subject: r.subject || '', title: `🧠 Recall: ${str(r.title, 120)}`, details: `Closed-book recall, ${r.checkpoint} day${r.checkpoint === 1 ? '' : 's'} after you learnt it${r.overdue ? ' (overdue)' : ''}. Open Drills → Free recall in LexQuest.` });
      }
    }
    if (on('own')) {
      for (const raw of own) {
        const e = cleanOwn(raw);
        if (e) out.push({ key: `own:${e.id}`, kind: 'own', date: e.date, allDay: e.allDay, start: e.start, end: e.end, title: e.title, details: e.note, repeat: e.repeat, until: e.until, subject: '', ownKind: e.kind, id: e.id });
      }
    }
    return out.sort(byWhen);
  }

  function byWhen(a, b) {
    return a.date.localeCompare(b.date) || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title);
  }

  // The dates an event falls on between from and to (weekly repeats expanded, a year at most).
  function datesOf(ev, from, to) {
    if (ev.repeat !== 'weekly') return ev.date >= from && ev.date <= to ? [ev.date] : [];
    const until = ev.until || addDays(ev.date, 364);
    const out = [];
    let k = ev.date;
    if (k < from) k = addDays(k, Math.floor((parse(from) - parse(k)) / (7 * 86400000)) * 7);
    for (; k <= until && k <= to; k = addDays(k, 7)) if (k >= from) out.push(k);
    return out;
  }

  // Events by day for the month view: date -> [event], each repeat as its own entry.
  function byDay(events, from, to) {
    const days = {};
    for (const ev of events) for (const date of datesOf(ev, from, to)) (days[date] = days[date] || []).push(date === ev.date ? ev : { ...ev, date, occurrence: true });
    for (const k of Object.keys(days)) days[k].sort(byWhen);
    return days;
  }

  // Events read from Google, made into the same shape. Timed events use this computer's clock; an
  // event over several days is shown on each of them.
  function fromGoogle(items, calendar = {}) {
    const out = [];
    for (const e of items || []) {
      if (!e || e.status === 'cancelled' || !e.start) continue;
      const base = { kind: 'google', title: str(e.summary, 200) || '(No title)', details: str(e.location, 300), calendar: str(calendar.summary, 120), color: /^#[0-9a-f]{6}$/i.test(calendar.color || '') ? calendar.color : '', link: /^https:\/\/www\.google\.com\/calendar\//.test(e.htmlLink || '') ? e.htmlLink : '', repeat: '', until: '' };
      if (e.start.date) {
        const last = e.end && isDate(e.end.date) ? addDays(e.end.date, -1) : e.start.date;
        for (let k = e.start.date, n = 0; k <= last && n < 62; k = addDays(k, 1), n++) out.push({ ...base, key: `g:${e.id}@${k}`, date: k, allDay: true, start: '', end: '' });
      } else if (e.start.dateTime) {
        const s = new Date(e.start.dateTime), en = new Date((e.end && e.end.dateTime) || e.start.dateTime);
        if (isNaN(s)) continue;
        const first = keyOf(s), last = keyOf(new Date(Math.max(+s, +en - 1)));
        for (let k = first, n = 0; k <= last && n < 62; k = addDays(k, 1), n++) {
          out.push({ ...base, key: `g:${e.id}@${k}`, date: k, allDay: k !== first && k !== last, start: k === first ? hhmm(s) : '00:00', end: k === last ? hhmm(en) : '23:59' });
        }
      }
    }
    return out.sort(byWhen);
  }

  /* ---------- Google ---------- */
  const COLOR = { exam: '11', plan: '9', recall: '3', own: '' }; // tomato, blueberry, grape, the calendar's own colour

  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  // The UNTIL of a weekly rule: the end of that day, in UTC for a timed event as the standard asks.
  function untilStamp(ev) {
    const [y, m, d] = ev.until.split('-').map(Number);
    if (ev.allDay) return `${y}${pad(m)}${pad(d)}`;
    return new Date(y, m - 1, d, 23, 59, 59).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  }

  // A Google Calendar event resource for one of LexQuest's events. The private properties mark it as
  // LexQuest's and carry a fingerprint, so a sync only rewrites what has changed.
  function googleBody(ev, timeZone) {
    const body = { summary: ev.title, description: ev.details || '' };
    if (ev.allDay || !ev.start) { body.start = { date: ev.date }; body.end = { date: addDays(ev.date, 1) }; }
    else { body.start = { dateTime: `${ev.date}T${ev.start}:00`, timeZone }; body.end = { dateTime: `${ev.date}T${ev.end || plusHour(ev.start)}:00`, timeZone }; }
    if (ev.repeat === 'weekly') body.recurrence = [`RRULE:FREQ=WEEKLY${ev.until ? `;UNTIL=${untilStamp(ev)}` : ''}`];
    if (COLOR[ev.kind]) body.colorId = COLOR[ev.kind];
    body.transparency = ev.kind === 'own' ? 'opaque' : 'transparent'; // study plans don't mark you busy
    body.extendedProperties = { private: { lqApp: 'lexquest', lqKey: ev.key, lqHash: fnv(JSON.stringify(body)) } };
    return body;
  }

  const startDay = e => (e.start && (e.start.date || String(e.start.dateTime || '').slice(0, 10))) || '';

  // What to change in Google: `existing` is what its LexQuest calendar holds, `desired` the bodies
  // wanted. Only events LexQuest made are touched. A missing exam, plan day or recall check is removed
  // only from today on, so past days stay as a record; the person's own events always mirror the app.
  function diff(desired, existing, today) {
    const want = new Map(desired.map(b => [b.extendedProperties.private.lqKey, b]));
    const out = { insert: [], update: [], remove: [] };
    const seen = new Set();
    for (const e of existing || []) {
      const p = (e.extendedProperties && e.extendedProperties.private) || {};
      if (p.lqApp !== 'lexquest' || !p.lqKey) continue;
      if (seen.has(p.lqKey)) { out.remove.push(e.id); continue; } // a duplicate from an interrupted sync
      seen.add(p.lqKey);
      const b = want.get(p.lqKey);
      if (!b) { if (p.lqKey.startsWith('own:') || e.recurrence || startDay(e) >= today) out.remove.push(e.id); continue; }
      if (p.lqHash !== b.extendedProperties.private.lqHash) out.update.push({ id: e.id, body: b });
    }
    for (const [k, b] of want) if (!seen.has(k)) out.insert.push(b);
    return out;
  }

  /* ---------- .ics ---------- */
  const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDay = k => k.replace(/-/g, '');
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = s => (enc ? enc.encode(s).length : unescape(encodeURIComponent(s)).length);
  // Lines longer than 75 bytes are folded, never splitting a character.
  function fold(line) {
    const parts = [];
    let cur = '', size = 0;
    for (const ch of line) {
      const b = bytes(ch);
      if (size + b > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; size = 0; }
      cur += ch; size += b;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  }

  // An iCalendar file of LexQuest's events, for Google Calendar (Settings → Import), Outlook or a phone.
  // Timed events use local ("floating") time, so they keep their clock time wherever it is opened.
  function toICS(events, { now = new Date(), name = 'LexQuest' } = {}) {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LexQuest//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(name)}`];
    for (const ev of events) {
      lines.push('BEGIN:VEVENT', `UID:${ev.key.replace(/[^\w:.-]/g, '-')}@lexquest`, `DTSTAMP:${stamp}`);
      if (ev.allDay || !ev.start) lines.push(`DTSTART;VALUE=DATE:${icsDay(ev.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(ev.date, 1))}`);
      else lines.push(`DTSTART:${icsDay(ev.date)}T${ev.start.replace(':', '')}00`, `DTEND:${icsDay(ev.date)}T${(ev.end || plusHour(ev.start)).replace(':', '')}00`);
      if (ev.repeat === 'weekly') lines.push(`RRULE:FREQ=WEEKLY${ev.until ? `;UNTIL=${icsDay(ev.until)}${ev.allDay ? '' : 'T235959'}` : ''}`);
      lines.push(`SUMMARY:${icsText(ev.title)}`);
      if (ev.details) lines.push(`DESCRIPTION:${icsText(ev.details)}`);
      if (ev.kind !== 'own') lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  const api = { monthGrid, cleanOwn, collect, datesOf, byDay, fromGoogle, googleBody, diff, toICS, addDays, keyOf, parse, isDate, KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.LQ = window.LQ || {}; window.LQ.calendar = api; }
})();
