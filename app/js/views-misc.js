// Timetable, Memory Guide, Trophies and Settings.
'use strict';
(function () {
  const { $, $$, esc, todayKey, daysBetween, fmtDate } = LQ.h;
  const D = window.LQ_DATA;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};

  /* ---------- Timetable ---------- */
  LQ.views.timetable = function timetable() {
    const today = todayKey();
    const days = D.timetable || [];
    const plan = LQ.plan();
    const phases = [];
    for (const d of days) { if (!phases.length || phases[phases.length - 1].name !== d.phase) phases.push({ name: d.phase, days: [] }); phases[phases.length - 1].days.push(d); }
    const allItems = days.flatMap(d => plan.days[d.date].items.filter(i => i.state !== 'exam'));
    const doneN = allItems.filter(i => i.state === 'done').length;
    const pastMoved = plan.moved.filter(b => b.fromDate < today);
    const catchUp = LQ.state.settings.catchUpHours;
    if (!days.length) return `<div class="page"><h1>🗓️ Timetable</h1>${LQ.noCourses()}<div class="empty">No timetable yet. A course pack can add a day-by-day plan, and it adapts when you skip a topic.</div></div>`;
    return `<div class="page"><div class="row between"><h1>🗓️ Timetable</h1><span class="chip ok">${doneN}/${allItems.length} blocks done</span></div>
      <p class="muted">Each block is ${LQ.state.settings.sprintMin}-minute sprints with breaks. Tick a block when it's done. On a <strong>light day</strong> (4 h) keep review + Tier 1 and skip the further-reading cards; on a <strong>heavy day</strong> (8 h) spend the extra time on timed past-paper answers, not new material — and never two heavy days in a row.</p>
      ${plan.moved.length || plan.dropped.length ? `<div class="card" style="border-color:${plan.unplaced.length ? 'var(--bad)' : 'var(--accent)'};margin-bottom:16px">
        <h3>🔄 Your plan has adapted</h3>
        ${plan.moved.length ? `<p class="muted">${plan.moved.length} skipped topic ${plan.moved.length === 1 ? 'block' : 'blocks'} (${plan.movedHours} h still to do) ${plan.moved.length === 1 ? 'is' : 'are'} spread over the days before each subject’s next exam: the nearest exam and highest tier go first, on the days with the most room. Look for the <span class="chip t2">↩</span> blocks below. Steps you’ve already finished in a topic are taken off automatically, and the plan updates each time you tick something.</p>` : ''}
        ${plan.unplaced.length ? `<div class="callout warn"><strong>${plan.unplacedHours} h won’t fit before the exam</strong>, even with the extra time below. Allow more time, or let these go (lowest tier first):${plan.unplaced.map(b => `<div class="task-row"><span class="task"><span><span class="chip">${b.left}h</span> <span class="chip t${b.tier}">Tier ${b.tier}</span> <strong>${esc(D.subjects[b.subject] ? D.subjects[b.subject].short : b.subject)}</strong> — ${esc(b.text)}</span></span><button class="task-act" data-drop="${b.id}">✕ Let go</button></div>`).join('')}</div>` : ''}
        ${plan.expired.length ? `<p class="muted">${plan.expired.length} ${plan.expired.length === 1 ? 'block is' : 'blocks are'} past ${plan.expired.length === 1 ? 'its' : 'their'} subject’s last exam and no longer scheduled.</p>` : ''}
        <div class="row between" style="margin-top:10px"><label class="row" style="flex:1;min-width:260px">Extra time allowed per day for catch-up: <strong id="catchUpV">${catchUp} h</strong><input type="range" id="catchUp" min="0" max="4" step="0.5" value="${catchUp}" style="flex:1"></label>
          ${pastMoved.length ? `<button class="btn small" id="planAllDone">✓ I already studied the ${pastMoved.length} from earlier days</button>` : ''}</div>
        ${plan.dropped.length ? `<details style="margin-top:10px"><summary class="muted">Let go (${plan.dropped.length})</summary>${plan.dropped.map(b => `<div class="task-row"><span class="task"><span><strong>${esc(D.subjects[b.subject] ? D.subjects[b.subject].short : b.subject)}</strong> — ${esc(b.text)}</span></span><button class="task-act" data-restore="${b.id}">↩ Restore</button></div>`).join('')}</details>` : ''}
      </div>` : ''}
      ${phases.map(ph => `<div class="section-title"><h2>${esc(ph.name)}</h2></div><div class="grid g3">${ph.days.map(d => {
        const dp = plan.days[d.date];
        const over = d.date >= today && dp.load > dp.budget;
        return `<div class="day ${d.date === today ? 'today' : ''} ${dp.isExamDay ? 'exam' : ''} ${d.date < today ? 'past' : ''}" ${d.date === today ? 'id="todayCard"' : ''}>
          <h4>${fmtDate(d.date)} ${d.date === today ? '<span class="chip t2">today</span>' : ''} ${d.hours ? `<span class="chip">${esc(d.hours)}</span>` : ''} ${dp.extra.length && d.date >= today ? `<span class="chip ${over ? 't2' : ''}" title="Planned time including catch-up">≈ ${dp.load} h</span>` : ''}</h4>
          ${dp.items.filter(it => it.state !== 'dropped').map(it => it.state === 'exam' ? `<div class="task"><span>🎓</span><span><strong>${esc(it.text)}</strong></span></div>` : LQ.taskRow(it)).join('')}
          ${dp.extra.map(LQ.pieceRow).join('')}
        </div>`;
      }).join('')}</div>`).join('')}
    </div>`;
  };
  LQ.after.timetable = function () {
    LQ.wirePlan();
    const range = $('#catchUp');
    if (range) {
      range.oninput = () => { $('#catchUpV').textContent = range.value + ' h'; };
      range.onchange = () => { LQ.state.settings.catchUpHours = Number(range.value); LQ.save(); LQ.rerender(); };
    }
    const all = $('#planAllDone');
    if (all) all.onclick = () => {
      const blocks = LQ.plan().moved.filter(b => b.fromDate < todayKey());
      if (!confirm(`Mark these ${blocks.length} blocks from earlier days as done? You can untick any of them on its day.`)) return;
      for (const b of blocks) LQ.state.timetable[b.id] = 'done';
      LQ.save(); LQ.rerender();
    };
    const t = $('#todayCard'); if (t) t.scrollIntoView({ block: 'center' });
  };

  /* ---------- Memory guide ---------- */
  const GUIDE = [
    ['🧭', 'How to use LexQuest every day', `The daily loop takes about 15 minutes of overhead and does most of the remembering for you:
1. **Open Today.** Do the due flashcards first (they're the ones you're about to forget).
2. **Run sprints on the timetable's topic.** Each topic has seven steps: Prime → Learn → Write → Recall → Council → Palace → Test. Don't skip Write — producing your own notes is where memory forms.
3. **Walk the palace once** (2–3 minutes), forwards one day, backwards the next.
4. **End the day with one timed answer** from Past Papers when you can. Exams reward writing, so practise writing.
!tip Weak memory is mostly a *method* problem, not a brain problem. Re-reading feels productive but fades fast; testing yourself feels harder and lasts.`],
    ['🔁', 'Spacing and retrieval (the two that matter most)', `**Retrieval practice** — pulling an answer out of your head — strengthens memory more than reading it again. Every flashcard, quiz and blank-page answer is retrieval.
**Spacing** — reviewing just before you'd forget — makes each review count for more. The flashcard scheduler does this for you, and it is **exam-aware**: it makes sure every card comes back at least once before that subject's paper.
- Grade honestly. "Again" isn't failure; it's the schedule doing its job.
- Little and often beats long and rare: 3 × 15 minutes > 1 × 45 minutes.
- Mix subjects in a review session (interleaving). It feels harder and works better.`],
    ['🏛️', 'The memory palace (method of loci)', `You already remember places effortlessly. The palace borrows that.
1. **Pick a route you know** — your room, your hostel floor, the walk to the library.
2. **Fix the stops in order** — door, light switch, bed, desk, window… 3–6 per room.
3. **Place one vivid image per stop.** Make it *exaggerated, moving, funny or gross*, and make it interact with the spot. "A giant lobster signing a contract with its claw" sticks; "offer and acceptance" does not.
4. **Walk it** — forwards, then backwards. The app's walk mode quizzes you stop by stop.
!tip Build a palace on the Memory Palace page, in *your own* place — personal places work far better than borrowed ones.`],
    ['🔢', 'Remembering section numbers', `Section numbers are just numbers, and brains hate those. Turn them into words or rhymes.
**Rhymes** (say them out loud). Make your own: pick a rhyme for the number, then tie it to what the section does.
- *One-oh-four, knock on the door* — section 104 is whatever you picture behind that door.
**The Major System** (for any number): each digit is a consonant sound — 0 s/z, 1 t/d, 2 n, 3 m, 4 r, 5 l, 6 j/sh/ch, 7 k/g, 8 f/v, 9 p/b. Add vowels to make a word, then picture that word doing what the section says:
- 15 → **T**a**L**e
- 22 → **N**u**N**
- 23 → **GN**o**M**e
- 24 → **N**e**R**o
- 26 → **N**a**CH**o
- 57 → **L**a**K**e
- 58 → **L**ea**F**
- 63 → **J**a**M**`],
    ['🧩', 'Chunking cases into stories', `A case is easier to recall as a 4-beat story: **who did what → what the court had to decide → what it held → why it matters to you**. The case cards are built that way.
- Attach every case to a *picture of its facts*: the bottle, the train, the snail.
- Group cases by the rule they make, not by year.
- For the exam you need: the name, one line of holding, and the facts that let you spot when it applies.`],
    ['✍️', 'Notes that actually stick (Cornell)', `The Write step uses Cornell notes:
- **Cues** (left): questions and keywords you'll quiz yourself with later.
- **Notes** (right): rule → case → exception → example.
- **Summary** (bottom): explain it to a friend in your own words. The app won't unlock the model summary until you've written yours, because the *effort* of producing it is what builds the memory.
!tip Cover the right side and answer the cues. That turns your notes into a self-test.`],
    ['🎯', 'Short attention span toolkit', `- **Sprints, not sessions.** 25 minutes is a sprint. Can't face it? Set it to 15 in Settings. Starting is the hard part; the timer handles the rest.
- **One micro-goal per sprint** ("notes on one case + its 6 cards"). Specific goals roughly double follow-through.
- **Parking lot** (Ctrl+L): when a stray thought pops up, write it down and get back. You'll see it after the sprint.
- **Focus mode** (press F): hides the menu so only the task is on screen.
- **Breaks are part of the work.** Stand, water, look out of a window. No phone during breaks if you can manage it; it makes the next sprint harder to start.
- **Two-minute rule:** if you're stuck, do the smallest possible next step — open the case card, write one cue.`],
    ['😴', 'Sleep, food and the night before', `- Memory is **consolidated during sleep**. An all-nighter trades tomorrow's recall for tonight's reading. Aim for 7+ hours, especially before exams.
- The night before a paper: **no new material**. Review cards, walk the palace, read the last-hour sheet, sleep.
- The morning of: one palace walk and the last-hour sheet. Then stop.`],
    ['🏆', 'Writing top-grade answers', `Examiners reward *synthesis* and *critical, analytical ability*. In practice:
1. **Issue** — name every issue the facts raise (one paragraph each).
2. **Rule** — section number + exact words where it matters (you have the bare act) + the leading case.
3. **Application** — use *these* facts. Most lost marks are here.
4. **Critique** — one line from the Council: a dissent, a criticism, a policy point.
5. **Conclusion** — commit to an answer.
!exam Use the Council step for every Tier 1 topic. That's where the "critical analysis" sentences come from.`]
  ];
  LQ.views.guide = function guide() {
    return `<div class="page read"><h1>🧠 Memory guide</h1><p class="muted">Short, practical, and tuned for a weak memory and a short attention span. Each idea is built into the app somewhere.</p>
      ${GUIDE.map(([i, t, body]) => `<div class="card prose" style="margin-bottom:14px"><h2>${i} ${esc(t)}</h2>${LQ.md(body)}</div>`).join('')}</div>`;
  };

  /* ---------- Trophies ---------- */
  LQ.views.trophies = function trophies() {
    const li = LQ.levelInfo();
    const tot = k => LQ.totalOf(k);
    return `<div class="page"><h1>🏆 Trophies</h1>
      <div class="grid g4">
        <div class="card"><div class="stat">Lv ${li.lvl}</div><div class="stat-label">${esc(li.rank)} · ${LQ.state.xp} XP</div></div>
        <div class="card"><div class="stat">${tot('sprints')}</div><div class="stat-label">sprints (${Math.round(tot('minutes') / 60)} h focused)</div></div>
        <div class="card"><div class="stat">${tot('cards')}</div><div class="stat-label">card reviews</div></div>
        <div class="card"><div class="stat">${LQ.state.streak.best || 0}</div><div class="stat-label">best streak</div></div>
      </div>
      <div class="section-title"><h2>Badges</h2></div>
      <div class="grid g4">${LQ.BADGES.map(b => { const got = LQ.state.badges[b.id]; return `<div class="card" style="${got ? '' : 'opacity:.45'}"><div style="font-size:2em">${got ? b.icon : '🔒'}</div><strong>${esc(b.name)}</strong><br><small class="muted">${esc(b.desc)}</small>${got ? `<br><small class="faint">${new Date(got).toLocaleDateString('en-IN')}</small>` : ''}</div>`; }).join('')}</div>
      <div class="section-title"><h2>The ladder</h2></div>
      <p class="muted">Law Clerk → Research Intern → Junior Associate → Associate → Senior Associate → Advocate → Senior Advocate → District Judge → High Court Judge → Supreme Court Justice → Chief Justice. A new rank every three levels.</p>
      <div class="section-title"><h2>Last 14 days</h2></div>
      <div class="card"><div class="row" style="align-items:flex-end;gap:6px;height:140px">${Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); const k = todayKey(d); const x = LQ.state.days[k] || { xp: 0 }; const max = Math.max(50, ...Object.values(LQ.state.days).map(v => v.xp)); return `<div title="${k}: ${x.xp} XP" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;background:var(--accent);border-radius:6px 6px 0 0;height:${Math.round(x.xp / max * 110)}px;min-height:2px"></div><small class="faint">${d.getDate()}</small></div>`; }).join('')}</div></div>
    </div>`;
  };

  /* ---------- Semesters ---------- */
  LQ.views.semesters = function semesters() {
    const deg = D.degree, s = LQ.state.settings;
    const LABEL = { past: 'Past', current: 'Current', upcoming: 'Upcoming' };
    const cards = Array.from({ length: deg.semesters }, (_, i) => i + 1).map(n => {
      const subs = LQ.semesterSubjects(n), st = LQ.semesterStatus(n), info = (D.semesterInfo || {})[n] || {};
      const active = n === D.activeSemester;
      return `<div class="card sem-card ${active ? 'active' : ''} ${subs.length ? '' : 'none'}">
        <div class="row between"><h3>Semester ${n}</h3><span class="chip ${st === 'current' ? 'ok' : ''}">${LABEL[st]}</span></div>
        ${info.term ? `<p class="muted">${esc(info.term)}</p>` : ''}
        ${subs.length
          ? `<p>${subs.map(x => `${x.icon} ${esc(x.short)}`).join(' · ')}</p>${info.note ? `<p class="faint">${esc(info.note)}</p>` : ''}
            ${active ? '<span class="chip ok">You’re studying this semester</span>' : `<button class="btn primary small" data-sem="${n}">Study Semester ${n}</button>`}`
          : `<p class="faint">${st === 'upcoming' ? 'Not started yet.' : 'Not added yet.'}</p>`}
      </div>`;
    }).join('');
    return `<div class="page"><div class="hero"><h1>🎓 Semesters</h1>
        <label class="field" style="max-width:520px"><span>Your degree</span><input type="text" id="degName" value="${esc(s.degree || deg.name)}"></label>
        <p class="muted">${deg.semesters} semesters. Each semester has its own courses, exams, timetable, flashcards, palaces and past papers. Your progress in every semester is kept when you switch.</p></div>
      <div class="grid g3">${cards}</div>
      <div class="card" style="margin-top:18px"><h2>Adding a semester</h2><ol>
        <li>Put a course pack for each course in the <code>LexQuest Content</code> folder beside the app, with <code>semester: N</code> on each subject. Its courses then appear on this page.</li>
        <li>Optionally, make a <code>Semester N</code> folder next to the folder the app is in, with your readings and bare acts inside. A course’s links open files from there, and you can point it elsewhere in Settings while that semester is active.</li>
      </ol><button class="btn" id="openContent">📂 Open the content folder</button></div></div>`;
  };
  LQ.after.semesters = function () {
    $('#degName').onchange = e => { LQ.state.settings.degree = e.target.value.trim(); LQ.save(); };
    $$('[data-sem]').forEach(b => b.onclick = () => LQ.switchSemester(Number(b.dataset.sem)));
  };

  /* ---------- Settings ---------- */
  LQ.views.settings = function settings() {
    const s = LQ.state.settings;
    const range = (id, label, min, max, step, val, unit = '') => `<label class="field"><span>${label}: <strong id="${id}V">${val}${unit}</strong></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
    return `<div class="page read"><h1>⚙️ Settings</h1>
      ${LQ.profileCard()}

      <div class="card" style="margin-top:14px"><h2>🎨 Theme</h2><div class="swatches">${LQ.THEMES.map(([k, n]) => `<div class="swatch ${s.theme === k ? 'active' : ''}" data-theme-pick="${k}" data-theme="${k}" style="background:var(--panel);color:var(--text)">${esc(n)}<div class="bar"><i style="background:var(--bg)"></i><i style="background:var(--panel2)"></i><i style="background:var(--accent)"></i><i style="background:var(--accent2)"></i><i style="background:var(--good)"></i></div></div>`).join('')}</div>
        <div class="row" style="margin-top:14px"><label class="row">Accent colour <input type="color" id="sAccent" value="${s.accent || '#7aa2ff'}"></label><button class="btn small" id="sAccentReset">Use theme accent</button></div>
        <p class="muted" style="margin-top:10px">Tip: switch themes every few days so the screen doesn't become wallpaper to your brain.</p></div>

      <div class="card" style="margin-top:14px"><h2>🔤 Reading comfort</h2>
        <label class="field"><span>Font</span><select id="sFont">${Object.keys(LQ.FONTS).map(k => `<option value="${k}" ${s.font === k ? 'selected' : ''}>${{ system: 'System (Segoe UI)', readable: 'Extra readable (Verdana)', serif: 'Book serif (Georgia)', rounded: 'Rounded (Trebuchet)', mono: 'Monospace' }[k]}</option>`).join('')}</select></label>
        ${range('sSize', 'Text size', 13, 22, 1, s.fontSize, 'px')}
        ${range('sLine', 'Line spacing', 1.3, 2.1, 0.1, s.lineHeight)}
        ${range('sWidth', 'Reading width', 620, 1100, 20, s.readWidth, 'px')}
        <label class="row"><input type="checkbox" id="sMotion" ${s.reduceMotion ? 'checked' : ''}> Reduce motion</label>
        <label class="row" style="margin-top:8px"><input type="checkbox" id="sConfetti" ${s.confetti ? 'checked' : ''}> Celebration animations</label>
        <label class="row" style="margin-top:8px"><input type="checkbox" id="sSound" ${s.sound ? 'checked' : ''}> Sounds (sprint end, level up)</label></div>

      <div class="card" style="margin-top:14px"><h2>⏱️ Focus</h2>
        ${range('sSprint', 'Sprint length', 10, 50, 5, s.sprintMin, ' min')}
        ${range('sBreak', 'Short break', 3, 15, 1, s.breakMin, ' min')}
        ${range('sLong', 'Long break (every 4th)', 10, 30, 5, s.longBreakMin, ' min')}
        ${range('sGoal', 'Daily sprint goal', 2, 16, 1, s.dailyGoal)}
        ${range('sWords', 'Minimum summary words before the model summary unlocks', 30, 200, 10, s.notesMinWords)}</div>

      <div class="card" style="margin-top:14px"><h2>🃏 Flashcards</h2>
        ${range('sPer', 'Cards per session', 10, 120, 5, s.cardsPerSession)}
        ${range('sNew', 'New cards per day', 10, 200, 10, s.newPerDay)}</div>

      <div class="card" style="margin-top:14px"><h2>💾 Files and data</h2>
        <p>Semester ${D.activeSemester} folder: <code id="rootPath">…</code></p>
        <p>This profile’s progress: <code id="dataPath">…</code> <small class="muted">(a daily backup is kept in its "backups" folder)</small></p>
        <div class="row"><button class="btn" id="sRoot">Change semester folder</button><button class="btn" id="sExport">Export backup</button><button class="btn" id="sImport">Import backup</button><span class="spacer"></span><button class="btn bad" id="sReset">Reset all progress</button></div></div>
      <div class="card" style="margin-top:14px"><h2>📦 Course content</h2>
        <p>Course packs folder: <code id="contentPath">…</code></p>
        ${(D.packs || []).length
          ? D.packs.map(k => `<div class="task-row"><span class="task"><span>${k.error ? '⚠️' : '✓'} ${esc(k.name)}${k.error ? ` <small class="muted">${esc(k.error)}</small>` : ''}</span></span></div>`).join('')
          : '<p class="muted">No packs loaded.</p>'}
        <p class="muted">Packs are code that runs inside this app, so only add ones you made or trust. Restart after changing them.</p>
        <button class="btn" id="openContent">📂 Open the content folder</button></div>
      ${LQ.updatesCard()}
    </div>`;
  };

  LQ.after.settings = async function () {
    const s = LQ.state.settings;
    const set = (k, v) => { s[k] = v; LQ.applyAppearance(); LQ.save(); };
    LQ.afterProfileCard();
    LQ.afterUpdatesCard();
    $$('[data-theme-pick]').forEach(el => el.onclick = () => { set('theme', el.dataset.themePick); $$('.swatch').forEach(x => x.classList.toggle('active', x === el)); });
    $('#sAccent').oninput = e => set('accent', e.target.value);
    $('#sAccentReset').onclick = () => set('accent', '');
    $('#sFont').onchange = e => set('font', e.target.value);
    const bind = (id, key, unit = '', num = Number) => { const el = $('#' + id); el.oninput = () => { set(key, num(el.value)); $('#' + id + 'V').textContent = el.value + unit; }; };
    bind('sSize', 'fontSize', 'px'); bind('sLine', 'lineHeight'); bind('sWidth', 'readWidth', 'px');
    bind('sSprint', 'sprintMin', ' min'); bind('sBreak', 'breakMin', ' min'); bind('sLong', 'longBreakMin', ' min');
    bind('sGoal', 'dailyGoal'); bind('sWords', 'notesMinWords'); bind('sPer', 'cardsPerSession'); bind('sNew', 'newPerDay');
    $('#sMotion').onchange = e => set('reduceMotion', e.target.checked);
    $('#sConfetti').onchange = e => set('confetti', e.target.checked);
    $('#sSound').onchange = e => set('sound', e.target.checked);
    if (window.lq) {
      const info = await window.lq.info();
      $('#rootPath').textContent = info.semesterRoot; $('#dataPath').textContent = info.userDir || info.dataDir; $('#contentPath').textContent = info.contentDir;
    } else { $('#rootPath').textContent = '(browser preview)'; $('#dataPath').textContent = '(browser storage)'; $('#contentPath').textContent = '(browser preview)'; }
    $('#sRoot').onclick = async () => { if (!window.lq) return; const r = await window.lq.chooseRoot(); if (r) { LQ.fileCache = {}; LQ.toast('Semester folder set'); LQ.rerender(); } };
    $('#sExport').onclick = async () => { if (!window.lq) return LQ.toast('Desktop app only'); const p = await window.lq.exportFile(JSON.stringify(LQ.state, null, 1), `LexQuest backup ${todayKey()}.json`, 'json'); if (p) LQ.toast('Backup saved'); };
    $('#sImport').onclick = async () => {
      if (!window.lq) return LQ.toast('Desktop app only');
      const txt = await window.lq.importFile(); if (!txt) return;
      try { const obj = JSON.parse(txt); if (!obj || !obj.settings) throw new Error('not a backup'); if (!confirm('Replace this profile’s progress with this backup?')) return; LQ.state = obj; LQ.save(true).then(() => location.reload()); }
      catch { LQ.toast('That file is not a LexQuest backup.'); }
    };
    $('#sReset').onclick = () => {
      if (!confirm('Reset ALL progress (XP, cards, notes, palace)? Export a backup first if unsure.')) return;
      if (!confirm('Really reset? This cannot be undone.')) return;
      const keep = LQ.state.settings;
      LQ.state = LQ.freshState();
      LQ.state.settings = keep;
      LQ.state.onboarded = true;
      LQ.save(true).then(() => location.reload());
    };
  };
})();
