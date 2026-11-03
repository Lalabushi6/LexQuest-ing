// Adaptive timetable: works out what today's plan looks like given what has actually been done.
// A topic block that was skipped (its day passed, or "Move to later" was pressed) is split into pieces
// and spread over the days before that subject's next exam, least-loaded days first, most urgent exam
// and highest-priority topic first. Nothing is stored: the plan is recomputed from progress on every
// view, so it heals itself. No DOM or app state in here, so it can be tested on its own.
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const LQ = root.LQ = root.LQ || {};
  const STEP = 0.25, MIN_PIECE = 0.75, MAX_PIECE = 1.5;
  const floorStep = h => Math.floor(h / STEP + 1e-9) * STEP;
  const ceilStep = h => Math.ceil(h / STEP - 1e-9) * STEP;
  // "2–3 h" -> 3, "6 h" -> 6, "exam" -> 0: a day is planned around the top of its range.
  const budgetOf = label => { const n = String(label || '').match(/\d+(\.\d+)?/g); return n ? Number(n[n.length - 1]) : 0; };

  /*
   * days        the timetable: [{ date, hours, items: [{ id, subject, text, topic, hours }] }]
   * today       'YYYY-MM-DD'
   * status      block id -> 'done' | 'later' | 'dropped'
   * pieces      'blockId@date' -> hours ticked off
   * topicPct    topic id -> percent of its steps finished
   * nextExam    subject id -> date of its next exam, or null
   * tierOf      topic id -> 1 (must know) .. 3
   * extraHours  how far a day may stretch past its budget to fit catch-up work
   */
  LQ.replan = function replan({ days, today, status = {}, pieces = {}, topicPct = () => 0, nextExam = () => null, tierOf = () => 2, extraHours = 2 }) {
    const doneHours = {}, donePieces = {};
    for (const [pieceId, hours] of Object.entries(pieces)) {
      const at = pieceId.lastIndexOf('@');
      const id = pieceId.slice(0, at), date = pieceId.slice(at + 1);
      doneHours[id] = (doneHours[id] || 0) + hours;
      (donePieces[date] = donePieces[date] || []).push({ pieceId, id, hours });
    }

    const out = { days: {}, moved: [], unplaced: [], expired: [], dropped: [] };
    const carry = [];
    const byId = {};

    for (const d of days) {
      const isExamDay = d.items.some(i => i.subject === 'exam');
      const day = out.days[d.date] = { date: d.date, phase: d.phase, label: d.hours, isExamDay, items: [], extra: [], budget: budgetOf(d.hours), load: 0 };
      for (const it of d.items) {
        byId[it.id] = { ...it, date: d.date };
        const st = status[it.id], pct = it.topic ? topicPct(it.topic) : 0;
        let state;
        if (it.subject === 'exam') state = 'exam';
        else if (st === 'done' || pct >= 100) state = 'done';
        else if (st === 'dropped') state = 'dropped';
        else if (st === 'later' || (d.date < today && it.topic)) state = 'moved';
        else if (d.date < today) state = 'missed'; // review and revision slots belong to their day
        else state = 'open';
        day.items.push({ ...it, state, date: d.date });

        if (state === 'dropped') out.dropped.push({ ...it, date: d.date });
        if (state === 'moved') {
          // Steps already finished in the topic, and pieces already ticked, shrink what is left.
          const left = ceilStep(it.hours * (1 - pct / 100) - (doneHours[it.id] || 0));
          if (left <= 0) { day.items[day.items.length - 1].state = 'done'; continue; }
          carry.push({
            id: it.id, subject: it.subject, text: it.text, topic: it.topic, hours: it.hours, left, fromDate: d.date,
            tier: tierOf(it.topic) || 2, deadline: nextExam(it.subject),
            earliest: d.date < today ? today : null // set below for blocks moved from today or later
          });
        }
        if (state === 'open' || state === 'exam' || (state === 'done' && d.date === today)) day.load += it.hours || 0;
      }
      if (d.date >= today) day.budget = Math.max(day.budget, day.load);
    }
    for (const [date, list] of Object.entries(donePieces)) {
      const day = out.days[date];
      if (!day) continue;
      for (const p of list) {
        const b = byId[p.id] || {};
        day.extra.push({ pieceId: p.pieceId, id: p.id, subject: b.subject, text: b.text, topic: b.topic, hours: p.hours, fromDate: b.date, done: true });
        if (date >= today) day.load += p.hours;
      }
    }

    const future = Object.values(out.days).filter(d => d.date >= today && !d.isExamDay).sort((a, b) => a.date.localeCompare(b.date));
    const roomOf = (d, stretch) => d.budget + (stretch ? extraHours : 0) - d.load;
    carry.sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9') || a.tier - b.tier || a.fromDate.localeCompare(b.fromDate));

    for (const block of carry) {
      out.moved.push(block);
      if (!block.deadline) { out.expired.push(block); continue; }
      const earliest = block.earliest || block.fromDate;
      const usable = future.filter(d => (block.earliest ? d.date >= earliest : d.date > earliest) && d.date < block.deadline);
      let left = block.left;
      while (left > 1e-6) {
        // Aim for a whole sitting, without leaving a sliver too small to be worth sitting down for.
        let piece = Math.min(left, MAX_PIECE);
        if (left - piece > 1e-6 && left - piece < MIN_PIECE) piece = Math.max(MIN_PIECE, left - MIN_PIECE);
        // Keeping a topic together matters more than squeezing it into every spare half hour, so a day
        // only needs room for a real piece. Take the day that ends up least overloaded for its size.
        const open = usable.filter(d => floorStep(roomOf(d, true)) >= Math.min(MIN_PIECE, left));
        if (!open.length) break;
        const whole = open.filter(d => floorStep(roomOf(d, true)) >= piece);
        const strain = d => (d.load + Math.min(piece, floorStep(roomOf(d, true)))) / Math.max(d.budget, 1);
        const day = (whole.length ? whole : open).reduce((top, d) => (strain(d) < strain(top) - 1e-9 ? d : top));
        piece = Math.min(piece, floorStep(roomOf(day, true)));
        const pieceId = `${block.id}@${day.date}`;
        const existing = day.extra.find(p => p.pieceId === pieceId && !p.done);
        if (existing) existing.hours += piece;
        else day.extra.push({ pieceId, id: block.id, subject: block.subject, text: block.text, topic: block.topic, hours: piece, fromDate: block.fromDate, tier: block.tier });
        day.load += piece;
        left -= piece;
      }
      if (left > 1e-6) out.unplaced.push({ ...block, left });
    }

    // Number the pieces of a split block, counting the ones already ticked.
    const counts = {};
    const ordered = Object.values(out.days).sort((a, b) => a.date.localeCompare(b.date));
    for (const d of ordered) for (const p of d.extra) counts[p.id] = (counts[p.id] || 0) + 1;
    const seen = {};
    for (const d of ordered) for (const p of d.extra) { seen[p.id] = (seen[p.id] || 0) + 1; p.part = seen[p.id]; p.parts = counts[p.id]; }

    out.movedHours = carry.reduce((a, b) => a + b.left, 0);
    out.unplacedHours = out.unplaced.reduce((a, b) => a + b.left, 0);
    return out;
  };
})();
