// Groups the adaptive plan by module or by course week, for the Timetable page's "By module" and
// "By week" views. A module is a unit of a subject's pack; a week is the topic's `week` field. Blocks
// with no topic (timed answers, revision, the morning sheet) go under "Other blocks" for their subject.
// No DOM or app state in here, so it can be tested on its own (test/plangroups.test.js).
'use strict';
(function () {
  const OTHER = 2e9, NO_WEEK = 1e9;
  const firstNumber = w => { const m = String(w).match(/\d+/); return m ? Number(m[0]) : NO_WEEK - 1; };
  const round = n => Math.round(n * 100) / 100;

  // topic id -> where it sits in its subject's pack
  function indexTopics(subjects) {
    const out = {};
    Object.keys(subjects || {}).forEach((sid, si) => (subjects[sid].units || []).forEach((u, ui) => (u.topics || []).forEach(t => {
      out[t.id] = { subject: sid, si, ui, unit: u.title || `Unit ${ui + 1}`, week: t.week == null ? '' : String(t.week).trim() };
    })));
    return out;
  }

  // days     the timetable days in date order ({ date })
  // plan     the adaptive plan (planner.js), whose days are { date: { items, extra } }
  // subjects the loaded subjects, in the order the app shows them
  // by       'module' or 'week'
  // Returns groups in order: { key, subject, subjectName, title, rows: [{ date, kind, item }], hours, doneHours }.
  // kind is 'item' (a block on its own day) or 'piece' (a slice of a skipped block placed on a later day).
  function groupPlan({ days, plan, subjects, by }) {
    const where = indexTopics(subjects), order = Object.keys(subjects || {});
    const groups = new Map();
    const add = (date, kind, item) => {
      const w = item.topic && where[item.topic];
      const sid = w ? w.subject : item.subject;
      const si = w ? w.si : (order.includes(sid) ? order.indexOf(sid) : order.length);
      let key, title, rank, sub = '';
      if (!w) { key = 'other'; title = 'Other blocks'; rank = OTHER; }
      else if (by === 'week') { key = 'w:' + w.week; title = !w.week ? 'No week given' : /\d\s*[–-]\s*\d/.test(w.week) ? `Weeks ${w.week}` : `Week ${w.week}`; rank = w.week ? firstNumber(w.week) : NO_WEEK; sub = w.week; }
      else { key = 'u:' + w.ui; title = w.unit; rank = w.ui; }
      const id = `${sid}|${key}`;
      if (!groups.has(id)) {
        const s = (subjects || {})[sid];
        groups.set(id, { key: id, subject: sid, subjectName: s ? (s.name || s.short || sid) : sid, title, si, rank, sub, rows: [], hours: 0, doneHours: 0 });
      }
      const g = groups.get(id);
      g.rows.push({ date, kind, item });
      // A moved block's hours are counted where its pieces landed, so they aren't counted twice.
      const hours = kind === 'piece' || item.state !== 'moved' ? Number(item.hours) || 0 : 0;
      const done = kind === 'piece' ? !!item.done : item.state === 'done';
      g.hours = round(g.hours + hours);
      if (done) g.doneHours = round(g.doneHours + hours);
    };
    for (const d of days || []) {
      const dp = plan && plan.days ? plan.days[d.date] : null;
      if (!dp) continue;
      for (const it of dp.items || []) if (it.state !== 'exam' && it.state !== 'dropped' && it.subject !== 'exam') add(d.date, 'item', it);
      for (const p of dp.extra || []) add(d.date, 'piece', p);
    }
    return [...groups.values()]
      .sort((a, b) => a.si - b.si || a.rank - b.rank || a.sub.localeCompare(b.sub))
      .map(({ si, rank, sub, ...g }) => g);
  }

  const api = { groupPlan, indexTopics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.LQ = window.LQ || {}; window.LQ.groupPlan = groupPlan; }
})();
