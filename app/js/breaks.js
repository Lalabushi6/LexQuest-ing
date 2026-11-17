// Custom breaks: when the student takes a break the plan didn't have, every clock time after it in the
// day's timed blocks moves later, and the long breaks still to come shrink (to a floor) to win the time back.
// A block is "timed" when its text starts with a clock time ("1:00 am · 2 pomodoros …"); other blocks are untouched.
// No DOM or app state in here, so it can be tested on its own (test/breaks.test.js).
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const LQ = root.LQ = root.LQ || {};

  const HEAD = /^(\d{1,2}):(\d\d)\s?(am|pm)\b/i;
  const TOKEN = /(?<![\d:.])(\d{1,2}):(\d\d)(?:\s?(am|pm)\b)?(?![\d])/gi;
  const SPAN = /long break (\d{1,2}:\d\d(?:\s?(?:am|pm))?)\s?[–-]\s?(\d{1,2}:\d\d(?:\s?(?:am|pm))?)/gi;

  const base = (h, m, ap) => { let H = h % 12; if (ap && ap.toLowerCase() === 'pm') H += 12; return H * 60 + m; };
  // A time in the text as minutes from the day's midnight. One without am/pm is the first reading that
  // falls at or after the block's start (allowing ten minutes' slack), so "1:30" in a 1:00 am block is 1:30 am.
  function readTime(h, m, ap, start) {
    const c = base(h, m, ap);
    const cands = ap ? [c, c + 1440] : [c, c + 720, c + 1440];
    if (start == null) return c;
    return cands.find(x => x >= start - 10) ?? cands[cands.length - 1];
  }
  function fmt(min, withAp) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440, H = Math.floor(m / 60);
    return `${((H + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}${withAp ? (H < 12 ? ' am' : ' pm') : ''}`;
  }
  const headStart = text => { const m = String(text || '').match(HEAD); return m ? base(+m[1], +m[2], m[3]) : null; };
  const parseT = (s, start) => { const m = s.match(/(\d{1,2}):(\d\d)\s?(am|pm)?/i); return readTime(+m[1], +m[2], m[3], start); };

  // Where each break falls and how much later it makes everything after it. A break that starts inside a
  // long break the plan already has only delays the plan by the part that runs past that long break's end.
  function build(items, breaks, opts = {}) {
    const minLong = opts.minLong != null ? opts.minLong : 5, absorb = opts.absorb !== false;
    const timed = items.filter(it => it && headStart(it.text) != null);
    const spans = [];
    for (const it of timed) { const st = headStart(it.text); for (const m of String(it.text).matchAll(SPAN)) spans.push({ a: parseT(m[1], st), b: parseT(m[2], st) }); }
    spans.sort((x, y) => x.a - y.a);
    const delays = [];
    for (const br of breaks || []) {
      const inside = spans.find(s => br.start >= s.a && br.start < s.b);
      if (inside) { const d = Math.max(0, br.start + br.min - inside.b); if (d) delays.push({ at: inside.b, d }); }
      else if (br.min > 0) delays.push({ at: br.start, d: br.min });
    }
    // Later long breaks give back what they can, in order.
    for (const s of spans) {
      const before = delays.filter(x => x.at <= s.a).reduce((a, x) => a + x.d, 0) - spans.filter(o => o !== s && o.b <= s.a).reduce((a, o) => a + (o.shrink || 0), 0);
      s.shrink = absorb ? Math.max(0, Math.min(before, s.b - s.a - minLong)) : 0;
    }
    const offset = t => delays.filter(x => x.at <= t).reduce((a, x) => a + x.d, 0) - spans.filter(s => s.b <= t).reduce((a, s) => a + s.shrink, 0);
    return { timed, spans, delays, offset };
  }

  // The day's blocks with their clock times moved, and what that does to the day's finish.
  // items: the day's plan items in order. breaks: [{ start: minutes from that day's midnight, min }].
  // opts.breakMin is the short break that ends each block's last pomodoro (so a block of 1 h ends at +55).
  function shiftDay(items, breaks, opts = {}) {
    const short = opts.breakMin != null ? opts.breakMin : 5;
    const { timed, spans, delays, offset } = build(items, breaks, opts);
    const out = items.map(it => {
      const st = it ? headStart(it.text) : null;
      if (st == null || !delays.length) return it;
      const text = String(it.text).replace(TOKEN, (all, h, m, ap) => {
        const t = readTime(+h, +m, ap, st);
        const nt = t + offset(t);
        return nt === t ? all : fmt(nt, !!ap);
      });
      const by = offset(st);
      return text === it.text ? it : { ...it, text, shiftedBy: by };
    });
    // The planned finish: the latest block end or time named in a block.
    let finish = null;
    for (const it of timed) {
      const st = headStart(it.text);
      let end = st + Math.max(0, (it.hours || 0) * 60 - short);
      for (const m of String(it.text).matchAll(TOKEN)) end = Math.max(end, readTime(+m[1], +m[2], m[3], st));
      finish = finish == null ? end : Math.max(finish, end);
    }
    const newFinish = finish == null ? null : finish + offset(finish);
    let deadline = null;
    const exam = items.find(it => it && it.subject === 'exam');
    if (exam) { const m = String(exam.text).match(/(\d{1,2})(?::(\d\d))?\s?(am|pm)\b/i); if (m) deadline = base(+m[1], +(m[2] || 0), m[3]); }
    return {
      items: out,
      delayed: delays.reduce((a, x) => a + x.d, 0),
      absorbed: spans.filter(s => s.shrink).map(s => ({ from: s.a + offset(s.a), was: s.b - s.a, now: s.b - s.a - s.shrink, saved: s.shrink })),
      finish, newFinish, late: finish == null ? 0 : newFinish - finish,
      deadline, spare: deadline != null && newFinish != null ? deadline - newFinish : null
    };
  }

  // A break's start as minutes from the given day's midnight (the plan's after-midnight blocks sit on the new day).
  function minutesInto(dateKey, ts) {
    const [y, mo, d] = dateKey.split('-').map(Number);
    return Math.round((ts - new Date(y, mo - 1, d).getTime()) / 60000);
  }

  LQ.breaks = { shiftDay, minutesInto, fmt, headStart };
  if (typeof module !== 'undefined') module.exports = LQ.breaks;
})();
