// Learning views: Today, Subjects, Subject, Topic (7-step flow), case/section pop-ups, My Notes, Bare Acts.
'use strict';
(function () {
  const { $, $$, esc, todayKey, daysBetween, fmtDate, wordCount } = LQ.h;
  const D = window.LQ_DATA;
  LQ.views = LQ.views || {};

  /* ---------- Today ---------- */
  LQ.views.home = function home() {
    const s = LQ.state, today = todayKey(), d = LQ.day();
    const exams = (D.exams || []).filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const next = exams[0];
    const adaptive = LQ.plan(), plan = adaptive.days[today];
    const planItems = plan ? plan.items.filter(i => i.state !== 'moved' && i.state !== 'dropped') : [];
    const quests = LQ.quests();
    const due = LQ.dueCards().length;
    const li = LQ.levelInfo();
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const last = s.lastTopic ? LQ.findTopic(s.lastTopic.sid, s.lastTopic.tid) : null;
    const parked = s.parking.filter(p => !p.done).length;
    const urgent = next && daysBetween(today, next.date) <= 1;
    return `<div class="page">
      <div class="hero">
        <div class="row between">
          <div>
            <h1>${hello}${s.settings.name ? ', ' + esc(s.settings.name) : ''} 👋</h1>
            <p class="muted">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(li.rank)} · Level ${li.lvl}</p>
          </div>
          ${next ? `<div style="text-align:right"><div class="stat">${daysBetween(today, next.date) === 0 ? 'Today' : daysBetween(today, next.date) + ' days'}</div><div class="stat-label">to ${esc(next.title)} (${fmtDate(next.date)})</div></div>` : ''}
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="sprint">▶ Start a sprint</button>
          <button class="btn" data-go="#/review">🃏 Flashcards · ${due} due · ${LQ.newCards().length} new</button>
          <button class="btn" data-go="#/palace">🏛️ Walk the palace</button>
          <button class="btn" data-go="#/mock">⏱️ Mock exam</button>
          ${urgent ? `<button class="btn warn" data-act="panic">🚨 Last-hour sheet</button>` : ''}
        </div>
      </div>

      ${LQ.noCourses()}
      <div class="grid g4">
        <div class="card"><div class="stat">${d.sprints}/${s.settings.dailyGoal}</div><div class="stat-label">sprints today</div><div class="progress" style="margin-top:8px"><i style="width:${Math.min(100, d.sprints / s.settings.dailyGoal * 100)}%"></i></div></div>
        <div class="card"><div class="stat">${due}</div><div class="stat-label">cards due now</div></div>
        <div class="card"><div class="stat">${d.xp}</div><div class="stat-label">XP today</div></div>
        <div class="card"><div class="stat">🔥 ${s.streak.current || 0}</div><div class="stat-label">day streak (best ${s.streak.best || 0})</div></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <div class="row between"><h2>📋 Today's plan</h2><a href="#/timetable" class="muted">Full timetable →</a></div>
          ${adaptive.moved.length ? `<div class="callout ${adaptive.unplaced.length ? 'warn' : 'tip'}">🔄 ${adaptive.moved.length} skipped ${adaptive.moved.length === 1 ? 'block' : 'blocks'} (${adaptive.movedHours} h) spread over the days before ${adaptive.moved.length === 1 ? 'its exam' : 'their exams'}.${adaptive.unplaced.length ? ` <strong>${adaptive.unplacedHours} h won’t fit.</strong>` : ''} <a href="#/timetable">See the new plan</a></div>` : ''}
          ${planItems.length || (plan && plan.extra.length) ? `<p class="muted">${esc(plan.phase || '')} · about ${plan.load} h today</p><div>${planItems.map(it => taskRow(it)).join('')}${plan.extra.map(pieceRow).join('')}</div>` : `<p class="muted">No planned blocks today. Review your due cards and walk the palace — that's the best use of a free day.</p>`}
        </div>
        <div class="card">
          <h2>🎯 Daily quests</h2>
          <div class="list">${quests.map(q => `<div class="item ${q.done ? 'done' : ''}"><span>${q.done ? '✅' : '⬜'}</span><span class="grow">${esc(q.label)}<div class="progress" style="margin-top:6px"><i style="width:${q.progress / q.goal * 100}%"></i></div></span><span class="chip">+${q.xp} XP</span></div>`).join('')}</div>
          ${last ? `<hr><p class="muted">Pick up where you left off:</p><div class="item click" data-go="#/topic/${last.s.id}/${last.t.id}"><span>📖</span><span class="grow"><strong>${esc(last.t.title)}</strong><br><small>${esc(last.s.short)} · ${LQ.topicPct(last.t.id)}% done</small></span><span>→</span></div>` : ''}
          ${parked ? `<hr><div class="item click" data-act="park"><span>🅿️</span><span class="grow">${parked} parked thought${parked > 1 ? 's' : ''} waiting for you</span></div>` : ''}
        </div>
      </div>

      <div class="section-title"><h2>🗓️ Exam countdown</h2></div>
      <div class="grid g4">${exams.slice(0, 8).map(e => {
        const left = daysBetween(today, e.date);
        const m = LQ.mastery({ subject: e.subject });
        return `<div class="card click" data-go="#/subject/${e.subject}"><div class="row between"><strong>${esc(e.title)}</strong><span class="chip ${left <= 3 ? 't1' : left <= 7 ? 't2' : ''}">${left === 0 ? 'today' : left + 'd'}</span></div><small class="muted">${fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</small><div class="progress" style="margin-top:10px"><i style="width:${m}%"></i></div><small class="muted">${m}% card mastery</small></div>`;
      }).join('')}</div>
    </div>`;
  };

  const shortOf = id => (D.subjects[id] ? D.subjects[id].short : id);
  const topicLink = it => (it.topic ? ` <a href="#/topic/${it.subject}/${it.topic}">open</a>` : '');

  // A block on its own day. Its state comes from the adaptive plan.
  function taskRow(it) {
    const done = it.state === 'done', moved = it.state === 'moved';
    const later = LQ.state.timetable[it.id] === 'later';
    return `<div class="task-row"><label class="task ${done ? 'done' : ''} ${moved ? 'moved' : ''}"><input type="checkbox" data-task="${it.id}" ${done ? 'checked' : ''}><span>${it.hours ? `<span class="chip">${it.hours}h</span> ` : ''}<strong>${esc(shortOf(it.subject))}</strong> — ${esc(it.text)}${topicLink(it)}${moved ? ' <small class="muted">↪ moved to later days</small>' : ''}</span></label>
      ${it.state === 'open' && it.topic ? `<button class="task-act" data-later="${it.id}" title="Can't do this today? Spread it over later days">⏭ Later</button>` : ''}
      ${later ? `<button class="task-act" data-back="${it.id}" title="Put this back on its original day">↩ Back</button>` : ''}</div>`;
  }
  LQ.taskRow = taskRow;

  // A slice of a skipped block, placed on a later day by the planner.
  function pieceRow(p) {
    return `<div class="task-row"><label class="task ${p.done ? 'done' : ''}"><input type="checkbox" data-piece="${esc(p.pieceId)}" data-hours="${p.hours}" ${p.done ? 'checked' : ''}><span><span class="chip">${p.hours}h</span> <span class="chip t2">↩ ${esc(fmtDate(p.fromDate))}${p.parts > 1 ? ` · part ${p.part} of ${p.parts}` : ''}</span> <strong>${esc(shortOf(p.subject))}</strong> — ${esc(p.text)}${topicLink(p)}</span></label>
      ${p.done ? '' : `<button class="task-act" data-drop="${p.id}" title="Stop scheduling this block">✕ Let go</button>`}</div>`;
  }
  LQ.pieceRow = pieceRow;

  // Ticks and moves on the Today and Timetable pages; the plan is recomputed straight after each one.
  LQ.wirePlan = function wirePlan() {
    const setStatus = (id, value) => { LQ.state.timetable[id] = value; LQ.save(); LQ.rerender(); };
    $$('[data-task]').forEach(cb => cb.onchange = () => {
      if (cb.checked) LQ.addXP(10, 'Plan block done');
      setStatus(cb.dataset.task, cb.checked ? 'done' : '');
    });
    $$('[data-piece]').forEach(cb => cb.onchange = () => {
      if (cb.checked) { LQ.state.planPieces[cb.dataset.piece] = Number(cb.dataset.hours); LQ.addXP(10, 'Catch-up block done'); }
      else delete LQ.state.planPieces[cb.dataset.piece];
      LQ.save(); LQ.rerender();
    });
    $$('[data-later]').forEach(b => b.onclick = () => { LQ.toast('Moved. The plan has been re-split around it.'); setStatus(b.dataset.later, 'later'); });
    $$('[data-back]').forEach(b => b.onclick = () => setStatus(b.dataset.back, ''));
    $$('[data-drop]').forEach(b => b.onclick = () => { LQ.toast('Let go. You can restore it on the Timetable page.'); setStatus(b.dataset.drop, 'dropped'); });
    $$('[data-restore]').forEach(b => b.onclick = () => setStatus(b.dataset.restore, ''));
  };

  LQ.after = LQ.after || {};
  LQ.after.home = () => LQ.wirePlan();

  /* ---------- Subjects ---------- */
  LQ.views.subjects = function subjects() {
    const today = todayKey();
    return `<div class="page"><div class="row between"><h1>📚 Subjects</h1>${Object.values(D.subjects).some(x => x.lastHour) ? '<button class="btn" data-act="sheets-pdf">📄 All cheatsheets as PDF</button>' : ''}</div>${LQ.noCourses()}<p class="muted">Priority tiers: <span class="chip t1">Tier 1</span> master it · <span class="chip t2">Tier 2</span> know it well · <span class="chip t3">Tier 3</span> one argument card.</p>
      <div class="grid g3">${Object.values(D.subjects).map(s => {
        const exam = (D.exams || []).filter(e => e.subject === s.id && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
        const topics = LQ.allTopics(s.id);
        const done = topics.filter(x => LQ.topicPct(x.t.id) === 100).length;
        const m = LQ.mastery({ subject: s.id });
        return `<div class="card click" data-go="#/subject/${s.id}">
          <div class="row between"><span style="font-size:2em">${s.icon}</span>${exam ? `<span class="chip ${daysBetween(today, exam.date) <= 3 ? 't1' : ''}">${esc(exam.title.replace(s.short, '').trim() || 'Exam')} in ${daysBetween(today, exam.date)}d</span>` : ''}</div>
          <h3>${esc(s.name)}</h3>
          <p class="muted" style="font-size:.9em">${esc(s.blurb || '')}</p>
          <div class="row between"><small>${done}/${topics.length} topics done</small><small>${m}% mastery</small></div>
          <div class="progress" style="margin-top:6px"><i style="width:${topics.length ? done / topics.length * 100 : 0}%"></i></div>
          <div style="margin-top:10px">${s.contentLevel === 'full' ? '<span class="chip ok">Full study pack</span>' : s.contentLevel === 'partial' ? '<span class="chip t2">Partial pack</span>' : `<span class="chip">Syllabus + readings · pack due ${esc(s.packDue || 'soon')}</span>`}</div>
        </div>`;
      }).join('')}</div></div>`;
  };

  /* ---------- Subject ---------- */
  LQ.views.subject = function subject(p) {
    const s = D.subjects[p.id];
    if (!s) return `<div class="page empty">Subject not found.</div>`;
    const tab = p.tab || 'topics';
    const today = todayKey();
    const exams = (D.exams || []).filter(e => e.subject === s.id).sort((a, b) => a.date.localeCompare(b.date));
    const readings = s.units.flatMap(u => u.topics.flatMap(t => (t.readings || []).map(r => ({ ...r, unit: u.title, topic: t.title, topicId: t.id }))));
    // Courses without case law show their last-hour sheet in the case-bank slot, under their own label.
    const formulas = !Object.keys(s.cases || {}).length && s.caseTab && s.lastHour;
    const tabs = [['topics', 'Units & topics'], ['readings', `Readings (${readings.length})`], ['cases', formulas ? s.caseTab : `Case bank (${Object.keys(s.cases || {}).length})`], ['about', 'Exam & manual']];
    let body = '';
    if (tab === 'topics') {
      body = s.units.map(u => `<div class="section-title"><h2>${esc(u.title)}</h2>${u.midterm ? '<span class="chip t1">Midterm</span>' : ''}</div>
        <div class="list">${u.topics.map(t => {
          const pct = LQ.topicPct(t.id);
          const cards = (s.cards || []).filter(c => c.topic === t.id).length;
          return `<div class="item click" data-go="#/topic/${s.id}/${t.id}">
            <div class="ring" style="--p:${pct};width:48px;height:48px;font-size:.75em">${pct}%</div>
            <div class="grow"><strong>${esc(t.title)}</strong><br><small class="muted">${esc(t.subtitle || '')}${cards ? ` · ${cards} cards` : ''}${t.week ? ` · Week ${esc(t.week)}` : ''}</small></div>
            ${t.tier ? `<span class="chip t${t.tier}">Tier ${t.tier}</span>` : ''}${t.midterm ? '<span class="chip t1">Midterm</span>' : ''}${t.guide ? '<span class="chip ok">Guide</span>' : ''}
          </div>`;
        }).join('')}</div>`).join('');
    } else if (tab === 'readings') {
      body = `<p class="muted">Green = in your folder. Red = still missing.</p>
        <table class="t"><thead><tr><th>Reading</th><th>Topic</th><th>Tier</th><th>Status</th><th></th></tr></thead><tbody>
        ${readings.map(r => readingRow(r)).join('')}</tbody></table>`;
    } else if (tab === 'cases' && formulas) {
      body = `<div class="card prose">${LQ.md(s.lastHour)}</div>`;
    } else if (tab === 'cases') {
      const cases = Object.entries(s.cases || {});
      body = cases.length ? `<div class="grid g2">${cases.map(([id, c]) => `<div class="card click case-card" data-case="${id}"><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.cite || '')}</small><p style="margin-top:8px">${esc(c.oneLine || '')}</p></div>`).join('')}</div>`
        : `<div class="empty">The case bank for ${esc(s.short)} arrives with its study pack. Until then, use the Readings tab to open each judgment.</div>`;
    } else {
      body = `<div class="card prose">${LQ.md(s.about || '')}</div>
        <div class="section-title"><h2>Exams</h2></div>
        <div class="list">${exams.map(e => `<div class="item"><span>🗓️</span><span class="grow"><strong>${esc(e.title)}</strong> — ${fmtDate(e.date)}${e.note ? ` · ${esc(e.note)}` : ''}</span><span class="chip">${e.date >= today ? daysBetween(today, e.date) + ' days' : 'done'}</span></div>`).join('')}</div>`;
    }
    return `<div class="page">
      <div class="hero"><div class="row between"><div><h1>${s.icon} ${esc(s.name)}</h1><p class="muted">${esc(s.blurb || '')}</p></div>
        <div class="row">${s.lastHour ? `<button class="btn" data-sheet="${s.id}">📄 Cheatsheet</button>` : ''}<button class="btn" data-go="#/review?subject=${s.id}">🃏 Cards</button><button class="btn" data-go="#/papers?subject=${s.id}">📝 Past papers</button></div></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-go="#/subject/${s.id}?tab=${k}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
  };

  function readingRow(r) {
    const f = r.file;
    const st = f ? LQ.fileCache[f] : undefined;
    const status = !f ? '<span class="chip no">Not in folder yet</span>' : st === true ? '<span class="chip ok">In folder</span>' : st === false ? '<span class="chip no">Missing</span>' : '<span class="chip">Checking…</span>';
    return `<tr><td>${r.kind === 'case' ? '⚖️' : r.kind === 'act' ? '📜' : '📄'} ${esc(r.title)}</td><td><a href="#/topic/${r.subjectId || ''}${r.topicId ? '' : ''}" data-topicid="${r.topicId}">${esc(r.topic)}</a></td><td>${r.tier ? `<span class="chip t${r.tier}">${r.tier}</span>` : ''}</td><td>${status}</td><td>${f ? `<button class="btn small" data-open="${esc(f)}">Open</button>` : ''}</td></tr>`;
  }
  LQ.readingRow = readingRow;

  LQ.after.subject = async function (p) {
    const s = D.subjects[p.id];
    if (!s) return;
    $$('a[data-topicid]').forEach(a => a.setAttribute('href', `#/topic/${s.id}/${a.dataset.topicid}`));
    if ((p.tab || 'topics') === 'readings') {
      const files = s.units.flatMap(u => u.topics.flatMap(t => (t.readings || []).map(r => r.file))).filter(Boolean);
      const unknown = files.filter(f => !(f in LQ.fileCache));
      if (unknown.length) { await LQ.checkFiles(files); LQ.rerender(); }
    }
  };

  /* ---------- Topic: the 7-step flow ---------- */
  LQ.views.topic = function topic(p) {
    const found = LQ.findTopic(p.sid, p.tid);
    if (!found) return `<div class="page empty">Topic not found.</div>`;
    const { s, u, t } = found;
    LQ.state.lastTopic = { sid: s.id, tid: t.id };
    const ts = LQ.topicState(t.id);
    const step = p.step || firstOpenStep(t.id);
    const pct = LQ.topicPct(t.id);
    return `<div class="page">
      <div class="row between" style="margin-bottom:6px"><a href="#/subject/${s.id}" class="muted">← ${esc(s.short)} · ${esc(u.title)}</a><span class="muted">${pct}% complete</span></div>
      <h1>${esc(t.title)}</h1>
      <div class="row" style="margin-bottom:14px">${t.tier ? `<span class="chip t${t.tier}">Tier ${t.tier}</span>` : ''}${t.midterm ? '<span class="chip t1">On the midterm</span>' : ''}${(t.sections || []).map(x => `<span class="chip click sec-link" data-sec="${x}">${esc(LQ.secLabel(LQ.fullSec(x)))}</span>`).join('')}</div>
      <div class="tabs">${LQ.STEPS.map(st => `<button class="${step === st.id ? 'active' : ''}" data-go="#/topic/${s.id}/${t.id}?step=${st.id}">${st.icon} ${st.label} ${ts.steps[st.id] ? '<span class="done">✓</span>' : ''}</button>`).join('')}</div>
      <div id="stepBody">${renderStep(step, s, u, t)}</div>
      <div class="step-bar" id="stepBar"></div>
    </div>`;
  };

  function firstOpenStep(tid) {
    const ts = LQ.topicState(tid);
    const s = LQ.STEPS.find(x => !ts.steps[x.id]);
    return s ? s.id : 'recall';
  }

  /* The bar that stays on screen at the bottom of every topic step. Next completes the step, except
     Write and Recall: those are earned by doing the work, so there it only skips ahead until they are. */
  const STEP_DONE = { prime: "I'm primed", learn: 'Done reading', council: 'I can argue all five', palace: 'Placed and walked', test: 'Tested' };
  function nextPlace(step, s, t) {
    const next = LQ.STEPS[LQ.STEPS.findIndex(x => x.id === step) + 1];
    if (next) return { label: `${next.icon} ${next.label}`, hash: `#/topic/${s.id}/${t.id}?step=${next.id}` };
    const topics = LQ.allTopics(s.id).map(x => x.t);
    const nt = topics[topics.findIndex(x => x.id === t.id) + 1];
    return nt ? { label: `next topic: ${nt.title}`, hash: `#/topic/${s.id}/${nt.id}` } : { label: `back to ${s.short}`, hash: `#/subject/${s.id}` };
  }
  function stepBar(step, s, t) {
    const i = LQ.STEPS.findIndex(x => x.id === step), prev = LQ.STEPS[i - 1];
    const done = !!LQ.topicState(t.id).steps[step], place = nextPlace(step, s, t);
    const lead = done ? 'Next' : STEP_DONE[step] || 'Skip for now';
    const primary = done || STEP_DONE[step];
    return `${prev ? `<button class="btn small ghost" data-go="#/topic/${s.id}/${t.id}?step=${prev.id}">← ${prev.label}</button>` : ''}
      <small class="muted">Step ${i + 1} of ${LQ.STEPS.length}</small>
      <button class="btn ${primary ? 'primary' : ''} step-next" id="stepNext" title="Press N">${esc(lead)}: ${esc(place.label)} → <kbd>N</kbd></button>`;
  }

  function renderStep(step, s, u, t) {
    const done = LQ.topicState(t.id).steps[step];
    switch (step) {
      case 'prime':
        return `<div class="read">
          <div class="card"><h2>🎯 Prime your brain (2 minutes)</h2>
          <p class="muted">Try to answer these <em>before</em> you study. Guessing wrong first makes the right answer stick far better.</p>
          <ol>${(t.prime || ['What do you already know about this topic?', 'What do you think the exam will ask about it?']).map(q => `<li>${LQ.md(q).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>
          ${t.gist ? `<div class="callout tip"><strong>The 30-second gist:</strong> ${LQ.md(t.gist).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}
          ${t.examFocus ? `<div class="callout exam"><strong>How it's examined:</strong> ${LQ.md(t.examFocus).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}
          </div></div>`;
      case 'learn': {
        const cases = (t.cases || []).map(id => s.cases && s.cases[id] ? caseCard(id, s.cases[id]) : '').join('');
        const readings = (t.readings || []);
        return `<div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;gap:20px">
          <div class="read">
            ${t.guide ? `<div class="card prose">${LQ.md(t.guide)}</div>` : `<div class="card"><h2>📖 Study from the readings</h2><p>The detailed study pack for this topic isn't in yet. For now: open each reading on the right, skim the headnote first, then the key paragraphs, and build your notes in the <strong>Write</strong> step. Make a card for every case (name → one-line ratio).</p></div>`}
            ${cases ? `<div class="section-title"><h2>⚖️ Cases</h2></div><div class="stack">${cases}</div>` : ''}
          </div>
          <div class="stack">
            ${(t.sections || []).length ? `<div class="card tight"><h3>📜 Bare act</h3>${t.sections.map(x => `<div class="item click sec-link" data-sec="${x}" style="margin-bottom:6px"><span>${esc(LQ.secLabel(x))}</span><span class="grow muted" style="font-size:.85em">${esc(sectionTitle(x))}</span></div>`).join('')}</div>` : ''}
            ${readings.length ? `<div class="card tight"><h3>📂 Readings</h3>${readings.map(r => `<div class="item" style="margin-bottom:6px"><span class="grow" style="font-size:.88em">${esc(r.title)} ${r.tier ? `<span class="chip t${r.tier}">${r.tier}</span>` : ''}</span>${r.file ? `<button class="btn small" data-open="${esc(r.file)}">Open</button>` : '<span class="chip no">missing</span>'}</div>`).join('')}</div>` : ''}
            ${(t.mnemonics || []).length ? `<div class="card tight"><h3>🧠 Memory hooks</h3>${t.mnemonics.map(m => `<div class="hook">${LQ.md(m).replace(/^<p>|<\/p>$/g, '')}</div>`).join('')}</div>` : ''}
          </div>
        </div>`;
      }
      case 'write': {
        const n = LQ.state.notes[t.id] || { cues: '', notes: '', summary: '' };
        const min = LQ.state.settings.notesMinWords;
        const w = wordCount(n.summary);
        return `<div>
          <div class="card" style="margin-bottom:14px"><h2>✍️ Write it in your own words (Cornell notes)</h2>
          <p class="muted">Close the guide first. Left column: questions/cues. Right: your notes. Bottom: a summary of at least <strong>${min} words</strong> — the app won't unlock the model summary until you've written it. Writing from memory is what makes this stick.</p></div>
          <div class="cornell">
            <div class="cues"><label class="field"><span>Cues — questions, section numbers, case names</span><textarea id="nCues" placeholder="${esc((t.prime || []).slice(0, 3).map(q => q.replace(/\[\[|\]\]|s:|c:/g, '')).join('\n'))}">${esc(n.cues)}</textarea></label></div>
            <div class="notes"><label class="field"><span>Notes — rule → case → exception → example</span><textarea id="nNotes" placeholder="Rule:\nCase:\nException:\nExample:">${esc(n.notes)}</textarea></label></div>
            <div class="summary"><label class="field"><span>Summary — explain it to a friend who missed class</span><textarea id="nSummary" style="min-height:120px">${esc(n.summary)}</textarea></label>
              <div class="row between"><span class="wordcount ${w >= min ? 'ok' : ''}" id="nCount">${w}/${min} words</span>
              <div class="row"><button class="btn" id="addCard">＋ Make a flashcard</button><button class="btn primary" id="nSubmit" ${w >= min ? '' : 'disabled'}>Submit & compare →</button></div></div>
            </div>
          </div>
          <div id="compare">${done ? compareBlock(t) : ''}</div>
        </div>`;
      }
      case 'recall':
        return `<div><div class="card" style="margin-bottom:14px"><h2>🃏 Recall</h2><p class="muted">Say the answer out loud (or in your head) <em>before</em> flipping. Be honest with the grade — the schedule is only as good as your honesty.</p></div><div id="topicCards"></div></div>`;
      case 'council': {
        const c = t.council;
        const lenses = [
          ['contrarian', '🗡️', 'The Contrarian', 'Where the rule fails, the dissent, the critique — the stuff that earns "critical analysis" marks.'],
          ['first', '🔬', 'The First-Principles Thinker', 'What the rule assumes and why it exists.'],
          ['expansion', '🔭', 'The Expansionist', 'Connections to other topics and other subjects.'],
          ['outsider', '👶', 'The Outsider', 'The whole thing in plain words.'],
          ['executor', '🛠️', 'The Executor', 'How to use it in a problem question, step by step.']
        ];
        return `<div class="read">
          <div class="card" style="margin-bottom:14px"><h2>🏛️ The council's five readings</h2><p class="muted">Top answers don't just state the rule — they test it from several angles. Read each lens, then write your own critique below.</p></div>
          ${c ? `<div class="stack">${lenses.map(([k, i, name, sub]) => c[k] ? `<div class="lens"><h3>${i} ${name}</h3><p class="muted" style="font-size:.88em">${sub}</p><div class="prose">${LQ.md(c[k])}</div></div>` : '').join('')}</div>`
            : `<div class="card"><p>The council lenses for this topic come with its study pack. Meanwhile, fill these in yourself:</p><ol><li>Where does this rule fail or get criticised?</li><li>What does it assume?</li><li>What does it connect to?</li><li>Explain it in one plain sentence.</li><li>How would you apply it to a fact pattern?</li></ol></div>`}
          <label class="field" style="margin-top:16px"><span>Your own critique (one paragraph you could drop into an essay)</span><textarea id="myCritique">${esc((LQ.state.notes[t.id] || {}).critique || '')}</textarea></label>
        </div>`;
      }
      case 'palace': {
        const loci = LQ.palaceLociFor(s.id, t.id);
        return `<div class="read">
          <div class="card" style="margin-bottom:14px"><h2>🗝️ Place it in your memory palace</h2><p class="muted">Each locus is a fixed spot on a route you already know. Picture the image <em>vividly</em> — exaggerated, moving, funny or disgusting works best — for 5 seconds each.</p></div>
          ${loci.length ? `<div class="stack">${loci.map(l => `<div class="locus"><span class="n">${l.n}</span><div><strong>${esc(l.room)} — ${esc(l.spot)}</strong><br><span>${LQ.md(l.image).replace(/^<p>|<\/p>$/g, '')}</span><br><small class="muted">↳ ${LQ.md(l.meaning).replace(/^<p>|<\/p>$/g, '')}</small></div></div>`).join('')}</div>
            <div class="row" style="margin-top:14px"><button class="btn primary" data-go="#/palace?walk=${s.id}&topic=${t.id}">Walk these loci now →</button></div>`
            : `<div class="card"><p>No loci for this topic yet. Open the <a href="#/palace">Memory Palace</a> builder and add your own — use a route you know (your room, hostel corridor, the walk to class).</p></div>`}
        </div>`;
      }
      case 'test': {
        const mcqs = (s.mcqs || []).filter(q => q.topic === t.id);
        const pq = (D.pastQuestions || []).filter(q => (q.topics || []).includes(t.id));
        return `<div class="read">
          ${mcqs.length ? `<div class="card"><h2>🧪 Quick quiz (${mcqs.length})</h2><div id="mcqBox"></div></div>` : ''}
          ${pq.length ? `<div class="card" style="margin-top:14px"><h2>📝 Past-paper questions on this topic</h2><div class="list">${pq.map(q => `<div class="item"><span class="grow"><small class="muted">${esc(q.paper)} · ${q.marks} marks${q.oldLaw ? ' · set under older law' : ''}</small><br>${esc((q.short || q.text.replace(/\*\*/g, '')).slice(0, 200))}…</span><button class="btn small" data-go="#/papers?practice=${q.id}">Answer it</button></div>`).join('')}</div></div>` : ''}
          ${!mcqs.length && !pq.length ? `<div class="card"><p>No quiz for this topic yet — test yourself with its flashcards in cram mode, or write a 10-minute answer to: <em>"Critically explain ${esc(t.title)} with cases."</em></p></div>` : ''}
        </div>`;
      }
    }
    return '';
  }

  function actEntry(sec) {
    const [act, num] = sec.split('/');
    const n = num.replace(/^Art\.?\s*/i, '');
    return { act, n, x: D.actText && D.actText[act] && D.actText[act][n] };
  }
  function sectionTitle(sec) {
    const full = LQ.fullSec(sec);
    return full.includes('/') && actEntry(full).x ? actEntry(full).x.title : '';
  }

  function caseCard(id, c) {
    return `<div class="card case-card">
      <div class="row between"><h3 style="margin:0"><span class="case-link" data-case="${id}">${esc(c.name)}</span></h3><small class="muted">${esc(c.cite || '')}</small></div>
      ${c.oneLine ? `<p style="margin:8px 0 0"><strong>${esc(c.oneLine)}</strong></p>` : ''}
      <dl>
        ${c.facts ? `<dt>Facts</dt><dd>${LQ.md(c.facts).replace(/^<p>|<\/p>$/g, '')}</dd>` : ''}
        ${c.issue ? `<dt>Issue</dt><dd>${LQ.md(c.issue).replace(/^<p>|<\/p>$/g, '')}</dd>` : ''}
        ${c.held ? `<dt>Held</dt><dd>${LQ.md(c.held).replace(/^<p>|<\/p>$/g, '')}</dd>` : ''}
        ${c.use ? `<dt>Use it for</dt><dd>${LQ.md(c.use).replace(/^<p>|<\/p>$/g, '')}</dd>` : ''}
        ${c.sections ? `<dt>Sections</dt><dd>${LQ.md(c.sections).replace(/^<p>|<\/p>$/g, '')}</dd>` : ''}
      </dl>
      ${c.hook ? `<div class="hook">🧠 ${LQ.md(c.hook).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}
    </div>`;
  }
  LQ.caseCard = caseCard;

  function compareBlock(t) {
    return `<div class="card" style="margin-top:16px"><h2>🔍 Compare with the model summary</h2>
      <div class="prose">${LQ.md(t.modelSummary || t.gist || 'Compare your summary with the Learn step.')}</div>
      <p class="muted">Anything you missed? Add it to your notes in a different colour of thought — then make a card for it.</p></div>`;
  }

  LQ.after.topic = function (p) {
    const found = LQ.findTopic(p.sid, p.tid);
    if (!found) return;
    const { s, t } = found;
    const step = p.step || firstOpenStep(t.id);
    const place = nextPlace(step, s, t);
    const goNext = () => {
      if (step === 'council') { const n = LQ.state.notes[t.id] = LQ.state.notes[t.id] || {}; n.critique = $('#myCritique').value; }
      if (STEP_DONE[step]) LQ.completeStep(t.id, step);
      location.hash = place.hash;
    };
    const drawBar = () => { $('#stepBar').innerHTML = stepBar(step, s, t); $('#stepNext').onclick = goNext; };
    const finished = () => { LQ.completeStep(t.id, step); drawBar(); };
    drawBar();
    if (step === 'write') wireNotes(s, t, drawBar);
    if (step === 'recall') LQ.mountCardSession($('#topicCards'), { subject: s.id, topic: t.id, limit: 60, onFinish: finished, onContinue: goNext, continueLabel: `Continue: ${place.label}` });
    if (step === 'test' && $('#mcqBox')) LQ.mountMCQ($('#mcqBox'), (s.mcqs || []).filter(q => q.topic === t.id), finished);
    const crit = $('#myCritique');
    if (crit) crit.oninput = () => { const n = LQ.state.notes[t.id] = LQ.state.notes[t.id] || {}; n.critique = crit.value; LQ.save(); };
  };

  function wireNotes(s, t, onDone) {
    const min = LQ.state.settings.notesMinWords;
    const n = LQ.state.notes[t.id] = LQ.state.notes[t.id] || { cues: '', notes: '', summary: '' };
    n.subject = s.id; n.title = t.title;
    const upd = () => {
      n.cues = $('#nCues').value; n.notes = $('#nNotes').value; n.summary = $('#nSummary').value;
      n.words = wordCount(n.cues) + wordCount(n.notes) + wordCount(n.summary); n.updated = Date.now();
      const w = wordCount(n.summary);
      $('#nCount').textContent = `${w}/${min} words`;
      $('#nCount').classList.toggle('ok', w >= min);
      $('#nSubmit').disabled = w < min;
      LQ.save();
    };
    ['#nCues', '#nNotes', '#nSummary'].forEach(sel => $(sel).oninput = upd);
    $('#nSubmit').onclick = () => {
      upd();
      if (!LQ.topicState(t.id).steps.write) {
        LQ.day().notes += 1;
        LQ.questProgress('notes', 1);
        LQ.addXP(Math.min(30, Math.round(n.words / 15)), 'Notes written');
      }
      LQ.completeStep(t.id, 'write');
      $('#compare').innerHTML = compareBlock(t);
      LQ.checkBadges();
      onDone();
    };
    $('#addCard').onclick = () => LQ.addCustomCard(s.id, t.id);
  }

  LQ.addCustomCard = function addCustomCard(sid, tid) {
    const m = LQ.modal(`<h2>＋ New flashcard</h2>
      <label class="field"><span>Front (question)</span><textarea id="ccF" style="min-height:70px"></textarea></label>
      <label class="field"><span>Back (answer)</span><textarea id="ccB" style="min-height:90px"></textarea></label>
      <div class="row"><button class="btn primary" id="ccSave">Save card</button><button class="btn" id="ccCancel">Cancel</button></div>`);
    $('#ccSave', m).onclick = () => {
      const f = $('#ccF', m).value.trim(), b = $('#ccB', m).value.trim();
      if (!f || !b) return LQ.toast('Fill both sides first.');
      const card = { id: 'u-' + LQ.h.uid(), subject: sid, topic: tid, front: f, back: b, type: 'basic' };
      LQ.state.customCards.push(card);
      LQ.introduce(card);
      LQ.addXP(3, 'Card created');
      LQ.save(); LQ.closeModal();
    };
    $('#ccCancel', m).onclick = () => LQ.closeModal();
  };

  /* ---------- case + section pop-ups (delegated from app.js) ---------- */
  LQ.showCase = function showCase(id) {
    const f = LQ.findCase(id);
    if (!f) return LQ.toast('Case not in the bank yet.');
    const { subject, c } = f;
    const cards = (subject.cards || []).filter(x => (x.cases || []).includes(id));
    const m = LQ.modal(`${caseCard(id, c)}
      ${c.extra ? `<div class="card prose" style="margin-top:12px">${LQ.md(c.extra)}</div>` : ''}
      <div class="row" style="margin-top:14px">${c.file ? `<button class="btn primary" data-open="${esc(c.file)}">Open the judgment</button>` : ''}${cards.length ? `<span class="muted">${cards.length} flashcards use this case</span>` : ''}<span class="spacer"></span><button class="btn" id="closeM">Close</button></div>`, { wide: true });
    $('#closeM', m).onclick = () => LQ.closeModal();
  };

  LQ.showSection = function showSection(ref) {
    const sec = LQ.fullSec(ref);
    if (!sec.includes('/')) {
      const m = LQ.modal(`<h2>Section ${esc(sec)}</h2><p>Not in the built-in text.</p><button class="btn" id="closeM">Close</button>`);
      $('#closeM', m).onclick = () => LQ.closeModal();
      return;
    }
    const [act] = sec.split('/');
    const a = (D.acts || {})[act];
    const e = actEntry(sec);
    if (e.x) {
      const m = LQ.modal(`<h2>${esc(LQ.secLabel(act + '/' + e.n))} — ${esc(e.x.title)}</h2>${e.x.oldRef ? `<p><span class="chip">Old law: ${esc(e.x.oldRef)}</span></p>` : ''}<div class="statute">${esc(e.x.text)}</div>
        <div class="row" style="margin-top:14px"><button class="btn" data-go="#/statute?act=${act}&s=${e.n}">Open in Bare Acts</button>${a && a.file ? `<button class="btn" data-open="${esc(a.file)}">📄 PDF</button>` : ''}<span class="spacer"></span><button class="btn" id="closeM">Close</button></div>`, { wide: true });
      $('#closeM', m).onclick = () => LQ.closeModal();
      return;
    }
    const m = LQ.modal(`<h2>${esc(a ? a.name : act)} — ${esc(LQ.secLabel(sec).replace(/^\S+\s/, ''))}</h2><p>Open the bare act at this provision. (Acts with built-in text open here; the others open as PDFs.)</p>
      <div class="row">${a && a.file ? `<button class="btn primary" data-open="${esc(a.file)}">Open ${esc(a.name)}</button>` : ''}<button class="btn" id="closeM">Close</button></div>`);
    $('#closeM', m).onclick = () => LQ.closeModal();
  };

  /* ---------- My Notes ---------- */
  LQ.views.notes = function notes() {
    const all = Object.entries(LQ.state.notes).filter(([, n]) => (n.words || 0) > 0 || n.critique);
    const by = {};
    for (const [tid, n] of all) (by[n.subject || 'other'] = by[n.subject || 'other'] || []).push([tid, n]);
    return `<div class="page"><div class="row between"><h1>🗒️ My notes</h1><div class="row"><button class="btn" id="expMd">Export all as Markdown</button><button class="btn" id="expHtml">Export printable page</button></div></div>
      <p class="muted">Everything you've written in the Write and Council steps. These are yours — the app never overwrites them.</p>
      ${all.length ? Object.entries(by).map(([sid, list]) => `<div class="section-title"><h2>${esc(D.subjects[sid] ? D.subjects[sid].name : sid)}</h2></div>
        <div class="list">${list.map(([tid, n]) => `<div class="item click" data-go="#/topic/${sid}/${tid}?step=write"><span>✍️</span><span class="grow"><strong>${esc(n.title || tid)}</strong><br><small class="muted">${n.words || 0} words · ${n.updated ? new Date(n.updated).toLocaleString('en-IN') : ''}</small></span></div>`).join('')}</div>`).join('')
        : `<div class="empty">No notes yet. Open any topic and go to the <strong>Write</strong> step.</div>`}
    </div>`;
  };
  function notesExport(kind) {
    const parts = [];
    for (const [tid, n] of Object.entries(LQ.state.notes)) {
      if (!(n.words > 0 || n.critique)) continue;
      const subj = D.subjects[n.subject] ? D.subjects[n.subject].name : '';
      parts.push(`## ${n.title || tid}\n*${subj}*\n\n### Cues\n${n.cues || ''}\n\n### Notes\n${n.notes || ''}\n\n### Summary\n${n.summary || ''}\n${n.critique ? `\n### My critique\n${n.critique}\n` : ''}`);
    }
    const md = `# LexQuest notes — exported ${new Date().toLocaleString('en-IN')}\n\n` + parts.join('\n\n---\n\n');
    if (kind === 'md') return md;
    return `<!doctype html><meta charset="utf-8"><title>My notes</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;line-height:1.6;padding:0 16px}pre{white-space:pre-wrap;font-family:inherit}h2{border-top:1px solid #ccc;padding-top:16px}</style><pre>${esc(md)}</pre>`;
  }
  LQ.after.notes = function () {
    const go = async kind => {
      const payload = notesExport(kind);
      if (window.lq) { const p = await window.lq.exportFile(payload, kind === 'md' ? 'My LexQuest notes.md' : 'My LexQuest notes.html', kind); if (p) LQ.toast('Saved to ' + p); }
      else LQ.toast('Export works in the desktop app.');
    };
    $('#expMd').onclick = () => go('md');
    $('#expHtml').onclick = () => go('html');
  };

  /* ---------- Bare acts ---------- */
  LQ.views.statute = function statute(p) {
    const texts = D.actText || {};
    const pdfs = Object.values(D.acts || {}).filter(a => a.file);
    const nameOf = k => ((D.acts || {})[k] || {}).name || k.toUpperCase();
    const keys = Object.keys(texts).sort((a, b) => (a === D.defaultAct ? -1 : b === D.defaultAct ? 1 : 0));
    const act = texts[p.act] ? p.act : keys[0];
    const pdfButtons = `<div class="row" style="margin-bottom:14px">${pdfs.map(a => `<button class="btn small" data-open="${esc(a.file)}">📄 ${esc(a.name)}</button>`).join('')}</div>`;
    if (!act) return `<div class="page"><h1>📜 Bare acts</h1>${pdfButtons}${pdfs.length ? '' : '<div class="empty">No acts yet. A course pack can add searchable acts and links to their PDFs.</div>'}</div>`;
    const src = texts[act];
    const info = (D.acts || {})[act] || {};
    const unit = info.unitName || 'Section';
    const q = (p.q || '').toLowerCase();
    const secs = Object.entries(src).filter(([n, x]) => !q || n.toLowerCase() === q || x.title.toLowerCase().includes(q) || x.text.toLowerCase().includes(q))
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10) || a[0].localeCompare(b[0]));
    const focus = p.s && src[p.s] ? p.s : null;
    const base = `#/statute?act=${act}`;
    return `<div class="page"><h1>📜 Bare acts</h1>
      <p class="muted">Acts with built-in text can be read and searched here (unannotated). The others open as PDFs from your folders.</p>
      <div class="pill-nav">${keys.map(k => `<button class="${act === k ? 'active' : ''}" data-go="#/statute?act=${k}">⚖️ ${esc(nameOf(k))}</button>`).join('')}</div>
      ${pdfButtons}
      <div class="grid" style="grid-template-columns:320px minmax(0,1fr);gap:18px">
        <div class="card tight" style="max-height:72vh;overflow-y:auto">
          <input type="search" id="secSearch" placeholder="${esc(info.searchHint || `Search ${nameOf(act)}`)}" value="${esc(p.q || '')}">
          <div class="list" style="margin-top:10px">${secs.map(([n, x]) => `<div class="item click ${focus === n ? 'active' : ''}" data-go="${base}&s=${n}${p.q ? '&q=' + encodeURIComponent(p.q) : ''}" style="${focus === n ? 'border-color:var(--accent)' : ''}"><strong>${n}</strong><span class="grow" style="font-size:.86em">${esc(x.title)}</span>${x.oldRef ? `<small class="faint">${esc(x.oldRef)}</small>` : ''}</div>`).join('')}</div>
        </div>
        <div class="card">${focus ? `<h2>${unit} ${focus} — ${esc(src[focus].title)}</h2>${src[focus].oldRef ? `<p><span class="chip">Old law: ${esc(src[focus].oldRef)}</span></p>` : ''}<div class="statute">${highlight(src[focus].text, p.q)}</div>` : `<div class="empty">Pick ${unit === 'Article' ? 'an article' : `a ${unit.toLowerCase()}`} on the left.<br><br>Tip: in an open-statute exam the act tells you the rule — your marks come from the <strong>cases</strong> and the <strong>application</strong>. Use the act to quote the exact words.</div>`}</div>
      </div></div>`;
  };
  function highlight(text, q) {
    const safe = esc(text);
    if (!q || q.length < 3) return safe;
    return safe.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
  }
  LQ.after.statute = function (p) {
    const box = $('#secSearch');
    if (!box) return;
    let t = null;
    box.oninput = () => { clearTimeout(t); t = setTimeout(() => { location.hash = `#/statute?act=${p.act || ''}&q=${encodeURIComponent(box.value)}${p.s ? '&s=' + p.s : ''}`; }, 350); };
    box.focus(); box.setSelectionRange(box.value.length, box.value.length);
  };
})();
