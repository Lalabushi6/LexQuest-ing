// The Revision page (a revision sheet per subject, read a section at a time, ticked off and
// quick-checked) and the Games page ("Base Defence": asteroids carry clues and fall on your base;
// type the answer to destroy them). The logic is in revision-core.js; progress is in state.revx.
'use strict';
(function () {
  const D = window.LQ_DATA;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};
  const { esc, $, $$ } = LQ.h;
  const core = LQ.revCore;
  const { matches, exactHit, norm, clip } = core;

  const store = () => {
    const s = (LQ.state.revx = LQ.state.revx || {});
    s.read = s.read || {}; s.items = s.items || {}; s.best = s.best || {}; s.prefs = s.prefs || {};
    return s;
  };
  const save = () => { try { LQ.save(); } catch (e) { /* not signed in */ } };
  const plain = core.plainWith(id => { const f = LQ.findCase(id); return f ? f.c.name : null; });
  const md = src => LQ.md(String(src || '').replace(/^#### (.+)$/gm, '**$1**'));
  const subjectsNow = () => {
    const today = LQ.h.todayKey();
    const next = sid => { const e = (D.exams || []).filter(x => x.subject === sid && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]; return e ? e.date : '9999'; };
    return Object.values(D.subjects).sort((a, b) => next(a.id).localeCompare(next(b.id)));
  };
  const setCrumb = t => setTimeout(() => { const c = $('#crumb'); if (c) c.textContent = t; }, 0);
  const topicsOf = sid => (D.subjects[sid] ? D.subjects[sid].units.flatMap(u => u.topics) : []);

  // Built once per subject per session (switching semester swaps D.subjects, so key by object).
  const BANK = new WeakMap();
  function bank(sid) {
    const S = D.subjects[sid]; if (!S) return [];
    if (!BANK.has(S)) BANK.set(S, core.buildBank(S, (D.asteroids || {})[sid], id => { const f = LQ.findCase(id); return f ? f.c.name : null; }));
    return BANK.get(S);
  }
  LQ.revBank = bank;

  const topicTitle = (sid, tid) => { const t = topicsOf(sid).find(x => x.id === tid); return t ? t.title : 'Mixed'; };
  const shortTopic = (sid, tid) => clip(topicTitle(sid, tid).split(/[:—(]/)[0].trim(), 26);
  const itemStat = id => store().items[id] || { s: 0, c: 0, m: 0 };
  function record(it, ok) {
    const st = store(); const s = st.items[it.id] = st.items[it.id] || { s: 0, c: 0, m: 0 };
    s.s++; if (ok) s.c++; else s.m++; s.last = Date.now();
  }

  /* ======================================================================
     REVISION PAGE
     ====================================================================== */
  // When no sheet has been written for a subject, assemble one from its topics.
  function autoSheet(S) {
    const sections = [];
    sections.push({ id: 'auto-map', icon: '🗺️', title: 'The course on one page', md: '| Unit | Topic | In one line |\n|---|---|---|\n' + S.units.flatMap(u => u.topics.map(t => `| ${plain(u.title)} | **${plain(t.title)}** | ${plain(t.gist || '')} |`)).join('\n') });
    for (const u of S.units) for (const t of u.topics) {
      const notes = [t.guideDeep, t.guide].filter(x => typeof x === 'string').join('\n');
      const kw = (notes.match(/### Key words[\s\S]*?(?=\n###|\n*$)/) || [''])[0];
      const cases = (t.cases || []).map(id => S.cases && S.cases[id]).filter(Boolean);
      let body = `**🎯 In one breath:** ${t.gist || ''}\n\n`;
      if (t.examFocus) body += `!exam ${plain(t.examFocus)}\n`;
      if (kw) body += kw.replace('### Key words', '### 🔑 Key words') + '\n';
      if (typeof t.guide === 'string') body += '### 🧩 The detail\n' + (kw ? t.guide.replace(kw, '') : t.guide) + '\n';
      if (cases.length) body += '### ⚖️ Cases\n| Case | Held / rule | Use it for |\n|---|---|---|\n' + cases.map(c => `| **${plain(c.name)}** | ${plain(c.oneLine || c.held || '')} | ${clip(plain(c.use || ''), 200)} |`).join('\n') + '\n';
      if ((t.mnemonics || []).length) body += '### 🧠 Memory hooks\n' + t.mnemonics.map(m => '- ' + m).join('\n') + '\n';
      sections.push({ id: 'auto-' + t.id, topic: t.id, icon: '📘', title: plain(t.title), md: body });
    }
    if (S.lastHour) sections.push({ id: 'auto-last', icon: '🚨', title: 'Last hour', md: S.lastHour });
    return { title: S.name + ' — revision sheet (assembled from your notes)', intro: 'No hand-written super sheet for this subject yet, so this one is assembled from the topic notes, key-word tables and case cards.', sections, auto: true };
  }
  const sheetFor = sid => (D.revision && D.revision[sid]) || (D.subjects[sid] ? autoSheet(D.subjects[sid]) : null);

  LQ.views.revision = function revision(params) {
    const subs = subjectsNow();
    if (!subs.length) return `<div class="page"><h1>📖 Revision</h1>${LQ.noCourses()}<p class="muted">Each subject gets a revision sheet here once a course is added.</p></div>`;
    const st = store();
    const sid = D.subjects[params.subject] ? params.subject : (D.subjects[st.prefs.revSubject] ? st.prefs.revSubject : subs[0].id);
    st.prefs.revSubject = sid;
    const sheet = sheetFor(sid);
    const read = st.read[sid] = st.read[sid] || {};
    const n = sheet.sections.length, done = sheet.sections.filter(s => read[s.id]).length;
    const focus = params.focus === '1' || (params.focus == null && st.prefs.revFocus);
    const idx = Math.max(0, Math.min(n - 1, Number(params.i || st.prefs['revIdx_' + sid] || 0)));
    const sec = s => `<section class="card prose revx-sec${read[s.id] ? ' revx-read' : ''}" id="sec-${esc(s.id)}" data-sec-id="${esc(s.id)}" style="margin-bottom:16px;scroll-margin-top:12px">
        <div class="row between" style="align-items:flex-start;gap:10px"><h2 style="margin-top:0">${esc(s.icon || '📘')} ${esc(s.title)}</h2>${read[s.id] ? '<span class="chip" style="background:var(--good);color:var(--bg)">✓ got it</span>' : ''}</div>
        ${md(s.md)}
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
          <button class="btn small ${read[s.id] ? '' : 'primary'}" data-revx-read="${esc(s.id)}">${read[s.id] ? '↺ Mark unread' : '✓ Got it'}</button>
          ${s.topic ? `<button class="btn small" data-revx-check="${esc(s.topic)}" data-revx-secid="${esc(s.id)}">⚡ Quick check (3 questions)</button>
          <button class="btn small" data-go="#/games?game=defence&subject=${esc(sid)}&topic=${esc(s.topic)}">☄️ Defend the base: this topic</button>` : ''}
        </div><div class="revx-qc" id="qc-${esc(s.id)}"></div></section>`;
    return `<div class="page read revx" style="max-width:1260px">
      <style>
        .revx-layout{display:grid;grid-template-columns:250px 1fr;gap:18px;align-items:start}
        .revx-toc{position:sticky;top:0;max-height:calc(100vh - 120px);overflow:auto;padding:10px}
        .revx-toc a{display:block;padding:5px 8px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:.9em;line-height:1.3}
        .revx-toc a:hover,.revx-toc a.on{background:var(--panel2);color:var(--text)}
        .revx-toc a.done{color:var(--good)}
        .revx-sec strong{color:var(--accent)}
        .revx-sec.revx-read{opacity:.93;border-left:4px solid var(--good)}
        .revx-sec h3{border-bottom:1px dashed var(--line);padding-bottom:4px}
        .revx-bar{height:8px;border-radius:8px;background:var(--panel2);overflow:hidden;margin:6px 0 2px}
        .revx-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--good))}
        .revx-qc .qc{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:10px;background:var(--panel2)}
        .revx-qc input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}
        .revx mark{background:var(--warn);color:var(--bg);border-radius:3px;padding:0 2px}
        @media (max-width:900px){.revx-layout{grid-template-columns:1fr}.revx-toc{position:static;max-height:none}}
      </style>
      <div class="row between" style="flex-wrap:wrap;gap:10px"><h1 style="margin:0">📖 Revision</h1>
        <div class="pill-nav" style="margin:0">${subs.map(s => `<button data-go="#/revision?subject=${esc(s.id)}" class="${s.id === sid ? 'active' : ''}">${esc(s.icon || '')} ${esc(s.short || s.name)}${D.revision && D.revision[s.id] ? ' ★' : ''}</button>`).join('')}</div></div>
      <p class="muted" style="margin:.4em 0 .8em">${esc(sheet.title)}${sheet.auto ? ' · ★ marks subjects with a hand-written super sheet' : ''}</p>
      ${sheet.intro ? `<div class="callout tip">💡 ${esc(plain(sheet.intro))}</div>` : ''}
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0 14px">
        <div class="pill-nav" style="margin:0"><button data-go="#/revision?subject=${esc(sid)}&focus=0" class="${focus ? '' : 'active'}">📜 Whole sheet</button><button data-go="#/revision?subject=${esc(sid)}&focus=1&i=${idx}" class="${focus ? 'active' : ''}">🎯 Focus: one section at a time</button></div>
        <input id="revxSearch" placeholder="🔎 Find in this sheet" style="flex:1;min-width:220px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit">
        <span class="chip">${done}/${n} sections ✓</span>
      </div>
      <div class="revx-bar"><i style="width:${Math.round(done / n * 100)}%"></i></div>
      <div class="revx-layout" style="margin-top:14px">
        <nav class="card revx-toc">${sheet.sections.map((s, i) => `<a href="#" data-revx-jump="${esc(s.id)}" data-i="${i}" class="${read[s.id] ? 'done' : ''}${focus && i === idx ? ' on' : ''}">${read[s.id] ? '✓' : (i + 1) + '.'} ${esc(s.title)}</a>`).join('')}</nav>
        <div id="revxBody">${focus
          ? `<div class="row between" style="margin-bottom:10px"><button class="btn" data-go="#/revision?subject=${esc(sid)}&focus=1&i=${Math.max(0, idx - 1)}" ${idx === 0 ? 'disabled' : ''}>← Previous</button><span class="muted">Section ${idx + 1} of ${n} · read it, tick it, check it, move on</span><button class="btn primary" data-go="#/revision?subject=${esc(sid)}&focus=1&i=${Math.min(n - 1, idx + 1)}" ${idx === n - 1 ? 'disabled' : ''}>Next →</button></div>${sec(sheet.sections[idx])}
             <div class="row between"><button class="btn" data-go="#/revision?subject=${esc(sid)}&focus=1&i=${Math.max(0, idx - 1)}" ${idx === 0 ? 'disabled' : ''}>← Previous</button><button class="btn primary" data-go="#/revision?subject=${esc(sid)}&focus=1&i=${Math.min(n - 1, idx + 1)}" ${idx === n - 1 ? 'disabled' : ''}>Next →</button></div>`
          : sheet.sections.map(sec).join('')}
          <div id="revxNoHit" class="card" hidden>Nothing in this sheet matches that.</div></div>
      </div></div>`;
  };

  LQ.after.revision = function (params) {
    if (!$('.revx')) return; // no courses: nothing to wire
    setCrumb('Revision');
    const st = store(), sid = st.prefs.revSubject, sheet = sheetFor(sid);
    if (params.focus != null) st.prefs.revFocus = params.focus === '1';
    if (params.i != null) st.prefs['revIdx_' + sid] = Number(params.i) || 0;
    save();
    const root = $('.revx');
    root.addEventListener('click', e => {
      const r = e.target.closest('[data-revx-read]');
      if (r) {
        const id = r.dataset.revxRead, read = st.read[sid] = st.read[sid] || {};
        if (read[id]) delete read[id]; else { read[id] = Date.now(); try { if (LQ.addXP) LQ.addXP(5, 'Revision section'); if (LQ.sound) LQ.sound('tick'); } catch (err) { /* cosmetic */ } }
        save();
        // In focus mode, ticking a section moves straight on to the next one.
        if (!read[id] || !st.prefs.revFocus) { LQ.rerender(); return; }
        const i = sheet.sections.findIndex(s => s.id === id);
        if (i >= 0 && i < sheet.sections.length - 1) location.hash = `#/revision?subject=${sid}&focus=1&i=${i + 1}`; else LQ.rerender();
        return;
      }
      const j = e.target.closest('[data-revx-jump]');
      if (j) {
        e.preventDefault();
        if (st.prefs.revFocus) { location.hash = `#/revision?subject=${sid}&focus=1&i=${j.dataset.i}`; return; }
        const el = document.getElementById('sec-' + j.dataset.revxJump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const q = e.target.closest('[data-revx-check]');
      if (q) quickCheck(sid, q.dataset.revxCheck, document.getElementById('qc-' + q.dataset.revxSecid));
    });
    // Search: hide sections that don't contain the words, highlight the rest.
    const box = $('#revxSearch');
    const originals = new Map($$('.revx-sec', root).map(s => [s, s.innerHTML]));
    let tmr = null;
    box.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        const q = box.value.trim().toLowerCase();
        let any = false;
        for (const [s, html] of originals) {
          s.innerHTML = html;
          if (!q) { s.hidden = false; continue; }
          const hit = s.textContent.toLowerCase().includes(q);
          s.hidden = !hit; any = any || hit;
          if (hit) highlight(s, q);
        }
        $('#revxNoHit').hidden = !q || any;
      }, 180);
    });
    void sheet;
  };
  function highlight(root, q) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const i = node.nodeValue.toLowerCase().indexOf(q);
      if (i < 0 || node.parentNode.closest('button')) continue;
      const mk = document.createElement('mark');
      const after = node.splitText(i); after.splitText(q.length);
      mk.textContent = after.nodeValue; after.parentNode.replaceChild(mk, after);
    }
  }

  // Three typed questions on one topic, under the section.
  function quickCheck(sid, tid, el) {
    if (!el) return;
    const pool = bank(sid).filter(x => x.t === tid);
    if (!pool.length) { el.innerHTML = '<div class="qc muted">No questions for this topic yet.</div>'; return; }
    const pick = pool.slice().sort((a, b) => (itemStat(b.id).m - itemStat(b.id).c) - (itemStat(a.id).m - itemStat(a.id).c) + (Math.random() - 0.5) * 2 + (a.src === 'core' ? 0.6 : 0) - (b.src === 'core' ? 0.6 : 0)).slice(0, 3);
    let i = 0, right = 0;
    const show = () => {
      if (i >= pick.length) { el.innerHTML = `<div class="qc"><b>${right}/${pick.length}</b> ${right === pick.length ? '🎉 Locked in. Next section.' : '— re-read the bits you missed, then try again.'} <button class="btn small" id="qcAgain">Another 3</button></div>`; $('#qcAgain', el).onclick = () => quickCheck(sid, tid, el); return; }
      const it = pick[i];
      el.innerHTML = `<div class="qc"><div class="muted" style="font-size:.85em">Question ${i + 1} of ${pick.length} · type the key word, Enter to check, Enter again for the next</div>
        <p style="font-size:1.08em;margin:.4em 0">${esc(it.q)}</p><input id="qcIn" autocomplete="off" spellcheck="false" placeholder="Your answer…"><div id="qcOut" style="margin-top:8px"></div></div>`;
      const inp = $('#qcIn', el); inp.focus();
      let answered = false;
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (answered) { i++; show(); return; }
        answered = true;
        const ok = matches(inp.value, it.a); if (ok) right++;
        record(it, ok); save();
        $('#qcOut', el).innerHTML = `${ok ? '<b style="color:var(--good)">✓ Yes</b>' : `<b style="color:var(--bad)">✗ Answer:</b> <b>${esc(it.show)}</b>`} <span class="muted">— ${esc(it.why)}</span><div class="muted" style="font-size:.8em;margin-top:4px">Enter for the next one</div>`;
      });
    };
    show();
  }

  /* ======================================================================
     GAMES PAGE: BASE DEFENCE
     ====================================================================== */
  const LEVELS = {
    cadet: { name: 'Cadet', icon: '🟢', fall: 46, maxOn: 1, gap: 2.2, d: [1, 2], hp: 6, hintFree: 1, desc: 'Slow, one asteroid at a time, first letter + length shown. Learn the answers.' },
    pilot: { name: 'Pilot', icon: '🔵', fall: 34, maxOn: 2, gap: 4.5, d: [1, 2, 3], hp: 5, hintFree: 0, desc: 'Two at a time, all question types, hints cost points.' },
    commander: { name: 'Commander', icon: '🟠', fall: 25, maxOn: 3, gap: 3.4, d: [1, 2, 3], hp: 4, hintFree: 0, desc: 'Three at a time, faster, every wave speeds up.' },
    legend: { name: 'Legend', icon: '🔴', fall: 17, maxOn: 4, gap: 2.6, d: [2, 3], hp: 3, hintFree: 0, noHints: true, desc: 'Hard questions only, four at a time, no hints. Exam pressure.' }
  };
  const MODES = {
    endless: { name: '♾️ Endless', desc: 'Until the base falls.' },
    blitz: { name: '⏱️ 5-minute blitz', desc: 'Score as much as you can in 5 minutes.', time: 300 },
    sprint: { name: '🍅 25-minute pomodoro', desc: 'A full study sprint; the base auto-repairs each wave.', time: 1500 },
    weak: { name: '🎯 Weak spots', desc: 'Only questions you have missed before.' },
    zen: { name: '🧘 Zen (no damage)', desc: 'Nothing can hurt you. Asteroids wait; learn at your own pace.' }
  };

  LQ.views.games = function games(params) {
    const subs = subjectsNow();
    if (!subs.length) return `<div class="page"><h1>☄️ Games</h1>${LQ.noCourses()}<p class="muted">The games' questions come from your courses, so add one first.</p></div>`;
    const st = store(), p = st.prefs;
    // The other games (views-minigames.js) share this page; the picker switches between them.
    const kind = params.game || p.gameKind || 'defence';
    if (kind !== 'defence' && LQ.miniGames && LQ.miniGames.has(kind)) { p.gameKind = kind; return LQ.miniGames.view(kind, params); }
    p.gameKind = 'defence';
    const sid = D.subjects[params.subject] ? params.subject : (D.subjects[p.gameSubject] ? p.gameSubject : subs[0].id);
    p.gameSubject = sid;
    const lvl = LEVELS[params.level] ? params.level : (LEVELS[p.gameLevel] ? p.gameLevel : 'cadet');
    const mode = MODES[params.mode] ? params.mode : (MODES[p.gameMode] ? p.gameMode : 'endless');
    const items = bank(sid);
    const tops = topicsOf(sid).filter(t => items.some(x => x.t === t.id));
    const chosen = params.topic ? [params.topic] : (p['gameTopics_' + sid] || []);
    const weakN = items.filter(x => itemStat(x.id).m > 0).length;
    const seenN = items.filter(x => itemStat(x.id).s > 0).length;
    const masteredN = items.filter(x => { const s = itemStat(x.id); return s.c >= 2 && s.c > s.m * 2; }).length;
    const bySrc = k => items.filter(x => x.src === k).length;
    const best = st.best[sid] || {};
    return `<div class="page revx-game" style="max-width:1320px">
      <style>
        .gx-setup .opt{border:1px solid var(--line);border-radius:14px;padding:10px 12px;cursor:pointer;background:var(--panel);text-align:left;color:var(--text);font:inherit}
        .gx-setup .opt.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset}
        .gx-setup .opt small{display:block;color:var(--muted);margin-top:3px}
        .gx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
        .gx-topics button{margin:0 6px 6px 0}
        .gx-wrap{display:grid;grid-template-columns:1fr 380px;gap:14px;align-items:start}
        .gx-canvas{width:100%;display:block;border-radius:16px;border:1px solid var(--line);background:#05070d}
        .gx-clue{border-radius:16px;border:2px solid var(--bad);padding:14px;background:var(--panel);min-height:120px}
        .gx-clue .big{font-size:1.25em;line-height:1.45;font-weight:600}
        .gx-hint{font-family:Consolas,monospace;letter-spacing:.18em;font-size:1.15em;color:var(--warn);margin-top:8px;word-break:break-word}
        .gx-others{margin-top:10px;display:flex;flex-direction:column;gap:6px}
        .gx-others div{border:1px solid var(--line);border-radius:10px;padding:6px 9px;font-size:.88em;color:var(--muted);background:var(--panel2)}
        .gx-in{width:100%;font-size:1.3em;padding:12px 14px;border-radius:12px;border:2px solid var(--accent);background:var(--bg);color:var(--text);font-family:inherit;margin-top:10px}
        .gx-in.bad{border-color:var(--bad);animation:gxshake .25s}
        .gx-in.good{border-color:var(--good)}
        @keyframes gxshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
        .gx-log{margin-top:10px;font-size:.86em;display:flex;flex-direction:column;gap:5px;max-height:240px;overflow:auto}
        .gx-log div{padding:6px 9px;border-radius:9px;background:var(--panel2)}
        .gx-log .ok{border-left:4px solid var(--good)} .gx-log .no{border-left:4px solid var(--bad)}
        .gx-repair{border:2px solid var(--warn);border-radius:14px;padding:12px;margin-top:10px;background:var(--panel2)}
        .gx-keys{font-size:.8em;color:var(--faint);margin-top:8px}
        .gx-over{max-width:860px;margin:0 auto}
        @media (max-width:980px){.gx-wrap{grid-template-columns:1fr}}
      </style>
      <div id="gxSetup" class="gx-setup">
        <div class="row between" style="flex-wrap:wrap;gap:10px"><h1 style="margin:0">☄️ Base Defence</h1>
          <div class="pill-nav" style="margin:0">${subs.map(s => `<button data-go="#/games?game=defence&subject=${esc(s.id)}" class="${s.id === sid ? 'active' : ''}">${esc(s.icon || '')} ${esc(s.short || s.name)}</button>`).join('')}</div></div>
        ${LQ.miniGames ? LQ.miniGames.picker('defence', sid) : ''}
        <p class="muted">Asteroids carry questions and fall on your court-house base. <b>Type the key word, case or concept</b> to blast them. A hit costs shield; then you re-type the right answer once to repair it, which is what makes it stick.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="chip">${items.length} questions</span><span class="chip">✍️ ${bySrc('core')} hand-written</span><span class="chip">🔑 ${bySrc('kw')} key words</span><span class="chip">🃏 ${bySrc('card')} flashcards</span><span class="chip">⚖️ ${bySrc('case')} case</span><span class="chip">❓ ${bySrc('mcq')} MCQ</span>
          <span class="chip">👁️ seen ${seenN}</span><span class="chip" style="color:var(--good)">🏅 mastered ${masteredN}</span><span class="chip" style="color:var(--bad)">🎯 weak ${weakN}</span>
        </div>
        <h3>1 · Difficulty</h3>
        <div class="gx-grid">${Object.entries(LEVELS).map(([k, L]) => `<button class="opt${k === lvl ? ' on' : ''}" data-gx-level="${k}"><b>${L.icon} ${L.name}</b>${best[k] ? ` <span class="chip">best ${best[k]}</span>` : ''}<small>${L.desc}</small></button>`).join('')}</div>
        <h3>2 · Mode</h3>
        <div class="gx-grid">${Object.entries(MODES).map(([k, M]) => `<button class="opt${k === mode ? ' on' : ''}" data-gx-mode="${k}"><b>${M.name}</b><small>${M.desc}${k === 'weak' ? ` (${weakN} now)` : ''}</small></button>`).join('')}</div>
        <h3>3 · Topics <span class="muted" style="font-weight:400;font-size:.8em">(none picked = all)</span></h3>
        <div class="gx-topics">${tops.map(t => `<button class="btn small${chosen.includes(t.id) ? ' primary' : ''}" data-gx-topic="${esc(t.id)}">${esc(clip(plain(t.title), 44))} <span class="muted">${items.filter(x => x.t === t.id).length}</span></button>`).join('')}
          ${items.some(x => !x.t || !tops.some(t => t.id === x.t)) ? '' : ''}<button class="btn small ghost" data-gx-topic="__all">Clear (all topics)</button></div>
        <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center">
          <label class="row" style="gap:6px"><input type="checkbox" id="gxCore" ${p.gameCoreOnly ? 'checked' : ''} ${bySrc('core') ? '' : 'disabled'}> Hand-written questions only</label>
          <label class="row" style="gap:6px"><input type="checkbox" id="gxRepair" ${p.gameRepair === false ? '' : 'checked'}> Re-type the answer after a hit (recommended)</label>
          <label class="row" style="gap:6px"><input type="checkbox" id="gxSound" ${p.gameSound === false ? '' : 'checked'}> Sound</label>
        </div>
        <div class="row" style="gap:10px;margin-top:18px"><button class="btn primary" id="gxStart" style="font-size:1.15em;padding:12px 26px">🚀 Launch defence</button>
          <span class="muted">Keys: <b>Enter</b> fire · <b>Tab</b> hint · <b>Ctrl+Enter</b> reveal &amp; skip · <b>Esc</b> pause</span></div>
      </div>
      <div id="gxGame" hidden></div>
    </div>`;
  };

  LQ.after.games = function (params) {
    if ($('#mgRoot') && LQ.miniGames) return LQ.miniGames.after(params);
    if (!$('#gxSetup')) return; // no courses: nothing to wire
    setCrumb('Games · Base Defence');
    const st = store(), p = st.prefs, sid = p.gameSubject;
    if (params.topic) p['gameTopics_' + sid] = [params.topic];
    p.gameLevel = LEVELS[params.level] ? params.level : (p.gameLevel || 'cadet');
    p.gameMode = MODES[params.mode] ? params.mode : (p.gameMode || 'endless');
    const root = $('#gxSetup');
    root.addEventListener('click', e => {
      const l = e.target.closest('[data-gx-level]'); if (l) { p.gameLevel = l.dataset.gxLevel; save(); return refresh(); }
      const m = e.target.closest('[data-gx-mode]'); if (m) { p.gameMode = m.dataset.gxMode; save(); return refresh(); }
      const t = e.target.closest('[data-gx-topic]');
      if (t) {
        const id = t.dataset.gxTopic, cur = new Set(p['gameTopics_' + sid] || []);
        if (id === '__all') cur.clear(); else if (cur.has(id)) cur.delete(id); else cur.add(id);
        p['gameTopics_' + sid] = [...cur]; save(); return refresh();
      }
    });
    function refresh() { location.hash = `#/games?subject=${sid}&level=${p.gameLevel}&mode=${p.gameMode}&r=${Date.now() % 100000}`; }
    $('#gxCore').onchange = e => { p.gameCoreOnly = e.target.checked; save(); };
    $('#gxRepair').onchange = e => { p.gameRepair = e.target.checked; save(); };
    $('#gxSound').onchange = e => { p.gameSound = e.target.checked; save(); };
    $('#gxStart').onclick = () => startGame({ sid, level: p.gameLevel, mode: p.gameMode, topics: p['gameTopics_' + sid] || [], coreOnly: !!p.gameCoreOnly, repair: p.gameRepair !== false, sound: p.gameSound !== false });
    if (params.autostart === '1') $('#gxStart').click();
  };

  /* ---------------- the game ---------------- */
  let audio = null;
  function beep(kind, on) {
    if (!on) return;
    try {
      audio = audio || new AudioContext();
      const cfg = { fire: [[880, 'square', 0.05, 0.08], [1320, 'square', 0.04, 0.06]], boom: [[110, 'sawtooth', 0.12, 0.35], [70, 'sawtooth', 0.1, 0.4]], hit: [[160, 'triangle', 0.2, 0.5], [90, 'sawtooth', 0.15, 0.6]], wrong: [[220, 'square', 0.06, 0.12]], wave: [[523, 'sine', 0.1, 0.18], [659, 'sine', 0.1, 0.18], [784, 'sine', 0.1, 0.3]], combo: [[1046, 'sine', 0.07, 0.12]] }[kind] || [[600, 'sine', 0.05, 0.1]];
      cfg.forEach(([f, type, vol, dur], i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.07;
        o.type = type; o.frequency.setValueAtTime(f, t0);
        if (kind === 'boom' || kind === 'hit') o.frequency.exponentialRampToValueAtTime(Math.max(30, f / 3), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
      });
    } catch (e) { /* no audio */ }
  }

  function buildQueue(cfg) {
    const L = LEVELS[cfg.level];
    let pool = bank(cfg.sid);
    if (cfg.coreOnly && pool.some(x => x.src === 'core')) pool = pool.filter(x => x.src === 'core');
    if (cfg.topics.length) pool = pool.filter(x => cfg.topics.includes(x.t));
    if (cfg.mode === 'weak') pool = pool.filter(x => itemStat(x.id).m > 0);
    if (cfg.only) pool = pool.filter(x => cfg.only.includes(x.id));
    let byLevel = pool.filter(x => L.d.includes(x.d));
    if (byLevel.length < 12) byLevel = pool; // small topic: take everything
    const weight = x => { const s = itemStat(x.id); return 3 * s.m - 1.2 * s.c + (s.s ? 0 : 1.2) + (x.src === 'core' ? 0.8 : 0) + Math.random() * 3; };
    return byLevel.map(x => [weight(x), x]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
  }

  function startGame(cfg) {
    const queue = buildQueue(cfg);
    const host = $('#gxGame'), setup = $('#gxSetup');
    if (!queue.length) { LQ.toast && LQ.toast(cfg.mode === 'weak' ? 'No weak spots yet — play another mode first.' : 'No questions for that choice.'); return; }
    setup.hidden = true; host.hidden = false;
    const L = LEVELS[cfg.level], M = MODES[cfg.mode];
    const zen = cfg.mode === 'zen';
    host.innerHTML = `<div class="row between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip">${esc(D.subjects[cfg.sid].short)} · ${L.icon} ${L.name} · ${M.name}</span><span class="chip" id="gxScore">Score 0</span><span class="chip" id="gxCombo">Combo ×1</span><span class="chip" id="gxWave">Wave 1</span><span class="chip" id="gxHp"></span><span class="chip" id="gxTime"></span><span class="chip" id="gxAcc">✓ 0 · ✗ 0</span></div>
        <div class="row" style="gap:8px"><button class="btn small" id="gxPause">⏸ Pause (Esc)</button><button class="btn small" id="gxQuit">🏁 End</button></div></div>
      <div class="gx-wrap">
        <div><canvas class="gx-canvas" id="gxCanvas"></canvas></div>
        <div>
          <div class="gx-clue" id="gxClue"><div class="muted">Incoming…</div></div>
          <input class="gx-in" id="gxIn" autocomplete="off" spellcheck="false" placeholder="Type the answer and press Enter…">
          <div class="gx-keys">Enter fire · Tab hint · Ctrl+Enter reveal/skip · Esc pause · answers to any asteroid count; the red one is locked</div>
          <div id="gxRepairBox"></div>
          <div class="gx-others" id="gxOthers"></div>
          <div class="gx-log" id="gxLog"></div>
        </div>
      </div>`;
    const cv = $('#gxCanvas'), ctx = cv.getContext('2d'), inp = $('#gxIn');
    const css = getComputedStyle(document.documentElement);
    const col = k => css.getPropertyValue(k).trim() || '#fff';
    const C = { accent: col('--accent'), good: col('--good'), bad: col('--bad'), warn: col('--warn'), text: '#e8ecf6', muted: '#8b93a6', accent2: col('--accent2') };
    let W = 800, H = 520, dpr = 1;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      W = cv.clientWidth || 800; H = Math.max(360, Math.min(680, Math.round(window.innerHeight * 0.66)));
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener('resize', resize);
    const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2 }));

    const G = {
      hp: zen ? Infinity : L.hp, maxHp: L.hp, score: 0, combo: 0, bestCombo: 0, wave: 1, killedInWave: 0, waveSize: 8,
      rocks: [], parts: [], beams: [], pops: [], q: queue.slice(), used: 0, spawnT: 0.8, t: 0, paused: false, over: false,
      right: 0, wrong: 0, hits: 0, missed: [], got: [], speed: 1, missStreak: 0, repair: null, shake: 0, flash: 0, interlude: 0, nextId: 1,
      timeLeft: M.time || null, hintsUsed: 0
    };
    const nextItem = () => {
      if (!G.q.length) G.q = buildQueue(cfg); // loop the bank
      return G.q.shift();
    };
    const requeue = (it, gap) => { G.q.splice(Math.min(G.q.length, gap), 0, it); };
    function spawn() {
      const it = nextItem(); if (!it) return;
      const r = 26 + Math.random() * 14 + it.d * 4;
      const fall = (L.fall * (zen ? 1.35 : 1)) / G.speed;
      const pts = Array.from({ length: 11 }, (_, i) => { const a = i / 11 * Math.PI * 2; return [Math.cos(a), Math.sin(a), 0.72 + Math.random() * 0.36]; });
      G.rocks.push({ id: G.nextId++, it, x: r + 20 + Math.random() * (W - 2 * r - 40), y: -r, r, vy: (H - 90) / fall, vx: (Math.random() - 0.5) * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, pts, born: G.t, hint: L.hintFree ? 1 : 0, usedHint: false });
      renderClues();
    }
    const locked = () => G.rocks.filter(r => !r.dead).sort((a, b) => b.y - a.y)[0];
    const baseY = () => H - 46;

    function hintText(rk) {
      if (L.noHints && !zen) return '';
      const a = rk.it.show; if (!rk.hint) return `<span class="muted" style="letter-spacing:0;font-family:inherit;font-size:.8em">${a.split(' ').length} word${a.split(' ').length > 1 ? 's' : ''} · Tab for a letter</span>`;
      let shown = 0;
      return a.split('').map(ch => { if (ch === ' ') return '&nbsp; '; if (!/[a-z0-9]/i.test(ch)) return esc(ch); shown++; return shown <= rk.hint ? esc(ch.toUpperCase()) : '_'; }).join(' ') + ` <span class="muted" style="letter-spacing:0;font-family:inherit;font-size:.75em">(${a.replace(/[^a-z0-9]/gi, '').length})</span>`;
    }
    let lastClueKey = '';
    function renderClues(force) {
      const lk = locked();
      const others = G.rocks.filter(r => !r.dead && r !== lk);
      const key = (lk ? lk.id + ':' + lk.hint : '-') + '|' + others.map(o => o.id).join(',') + (G.repair ? 'R' : '');
      if (key === lastClueKey && !force) return; lastClueKey = key;
      const box = $('#gxClue'); if (!box) return;
      box.innerHTML = lk ? `<div class="row between" style="margin-bottom:6px"><span class="chip">#${lk.id} · ${esc(shortTopic(cfg.sid, lk.it.t))}</span><span class="muted">${'★'.repeat(lk.it.d)}${'☆'.repeat(3 - lk.it.d)}</span></div>
        <div class="big">${esc(lk.it.q)}</div><div class="gx-hint">${hintText(lk)}</div>` : `<div class="muted">${G.interlude > 0 ? 'Wave cleared — breathe.' : 'Incoming…'}</div>`;
      $('#gxOthers').innerHTML = others.sort((a, b) => b.y - a.y).map(o => `<div><b>#${o.id}</b> ${esc(clip(o.it.q, 150))}</div>`).join('');
    }
    function log(ok, it, extra) {
      const el = $('#gxLog'); if (!el) return;
      const d = document.createElement('div'); d.className = ok ? 'ok' : 'no';
      d.innerHTML = `<div class="muted" style="font-size:.85em">${esc(clip(it.q, 110))}</div>${ok ? '✓' : '✗'} <b>${esc(it.show)}</b>${extra ? ' ' + extra : ''} <span class="muted">— ${esc(clip(it.why || '', 170))}</span>`;
      el.prepend(d); while (el.children.length > 14) el.lastChild.remove();
    }
    function boom(x, y, color, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 220; G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.7, max: 1.2, color, size: 1.5 + Math.random() * 3 }); }
    }
    function destroy(rk, typed) {
      rk.dead = true;
      const speedBonus = Math.max(0, 1 - (G.t - rk.born) / (L.fall / G.speed)) * 10;
      G.combo++; G.bestCombo = Math.max(G.bestCombo, G.combo); G.missStreak = 0;
      const mult = Math.min(4, 1 + Math.floor(G.combo / 3) * 0.5);
      const pts = Math.round((10 * rk.it.d + speedBonus) * mult * (rk.usedHint ? 0.5 : 1));
      G.score += pts; G.right++; G.killedInWave++;
      G.beams.push({ x: rk.x, y: rk.y, life: 0.25 });
      boom(rk.x, rk.y, C.warn, 34); boom(rk.x, rk.y, C.accent, 16);
      G.pops.push({ x: rk.x, y: rk.y, text: `+${pts}${mult > 1 ? ' ×' + mult : ''}`, life: 1.1, color: C.good });
      beep('fire', cfg.sound); setTimeout(() => beep('boom', cfg.sound), 90); if (G.combo && G.combo % 5 === 0) beep('combo', cfg.sound);
      record(rk.it, !rk.usedHint || rk.hint <= 1); G.got.push(rk.it);
      // A question that was missed earlier comes back once more, later.
      if (G.missed.includes(rk.it) && !rk.it._back) { rk.it._back = 1; requeue(rk.it, 12); }
      log(true, rk.it, typed && norm(typed) !== norm(rk.it.show) ? `<span class="muted">(you typed “${esc(typed)}”)</span>` : '');
      flashInput('good');
      checkWave();
      renderClues();
    }
    function impact(rk, revealed) {
      rk.dead = true;
      G.combo = 0; G.missStreak++;
      if (!zen) { G.hp--; G.hits++; }
      G.shake = revealed ? 4 : 12; G.flash = revealed ? 0 : 0.35;
      boom(rk.x, baseY(), C.bad, 50);
      beep(revealed ? 'wrong' : 'hit', cfg.sound);
      record(rk.it, false);
      if (!G.missed.includes(rk.it)) G.missed.push(rk.it);
      requeue(rk.it, 4 + Math.floor(Math.random() * 3)); // see it again soon
      log(false, rk.it, revealed ? '<span class="muted">(revealed)</span>' : '<span class="muted">(hit the base)</span>');
      if (G.missStreak >= 3 && !zen) { G.speed = Math.max(0.6, G.speed * 0.85); G.missStreak = 0; G.pops.push({ x: W / 2, y: H / 2, text: 'Assist: slowing down', life: 1.6, color: C.warn }); }
      G.killedInWave++;
      if (G.hp <= 0) return end('The base has fallen');
      if (cfg.repair) {
        G.repair = rk.it; G.paused = true;
        $('#gxRepairBox').innerHTML = `<div class="gx-repair"><b>🛠️ Repair the shield:</b> type <b style="font-size:1.15em;color:var(--warn)">${esc(rk.it.show)}</b> once to continue.${rk.it.a.length > 1 ? ` <span class="muted">(also accepted: ${esc(rk.it.a.slice(1, 5).join(', '))})</span>` : ''}<div class="muted" style="margin-top:6px">${esc(rk.it.q)}</div><div style="margin-top:6px">${esc(rk.it.why || '')}</div></div>`;
        inp.value = ''; inp.placeholder = 'Type the answer shown above to repair…';
      }
      checkWave();
      renderClues(true);
    }
    function checkWave() {
      if (G.killedInWave >= G.waveSize) {
        G.wave++; G.killedInWave = 0; G.interlude = 2.2;
        if (cfg.level !== 'cadet') G.speed = Math.min(2.2, G.speed * (cfg.level === 'legend' ? 1.08 : 1.06));
        if (cfg.mode === 'sprint' && !zen) G.hp = Math.min(G.maxHp, G.hp + 1);
        G.pops.push({ x: W / 2, y: H / 2 - 20, text: `WAVE ${G.wave - 1} CLEARED`, life: 2, color: C.accent, big: true });
        beep('wave', cfg.sound);
      }
    }
    function flashInput(kind) { inp.classList.remove('bad', 'good'); void inp.offsetWidth; inp.classList.add(kind); setTimeout(() => inp.classList.remove(kind), 300); }
    function tryFire(force) {
      const typed = inp.value;
      if (!typed.trim()) return;
      if (G.repair) {
        if (matches(typed, G.repair.a)) { G.repair = null; G.paused = false; $('#gxRepairBox').innerHTML = ''; inp.value = ''; inp.placeholder = 'Type the answer and press Enter…'; flashInput('good'); renderClues(true); }
        else if (force) flashInput('bad');
        return;
      }
      const live = G.rocks.filter(r => !r.dead).sort((a, b) => b.y - a.y);
      const target = live.find(r => (force ? matches(typed, r.it.a) : exactHit(typed, r.it.a)));
      if (target) { destroy(target, typed); inp.value = ''; return; }
      if (force) { G.combo = 0; G.wrong++; G.score = Math.max(0, G.score - 2); flashInput('bad'); beep('wrong', cfg.sound); }
    }
    inp.addEventListener('input', () => tryFire(false));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); if (G.repair || G.over) return;
        const lk = locked(); if (lk) impact(lk, true); return;
      }
      if (e.key === 'Enter') { e.preventDefault(); tryFire(true); return; }
      if (e.key === 'Tab') {
        e.preventDefault(); const lk = locked();
        if (lk && !(L.noHints && !zen)) { lk.hint++; lk.usedHint = lk.hint > (L.hintFree || 0); G.hintsUsed++; if (lk.usedHint && !zen) G.score = Math.max(0, G.score - 3); renderClues(true); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); togglePause(); }
    });
    function togglePause() { if (G.repair || G.over) return; G.paused = !G.paused; $('#gxPause').textContent = G.paused ? '▶ Resume (Esc)' : '⏸ Pause (Esc)'; inp.focus(); }
    $('#gxPause').onclick = togglePause;
    $('#gxQuit').onclick = () => end('You ended the run');
    cv.addEventListener('click', () => inp.focus());
    inp.focus();

    function end(why) {
      if (G.over) return; G.over = true;
      window.removeEventListener('resize', resize);
      const st = store(); const b = st.best[cfg.sid] = st.best[cfg.sid] || {};
      const isBest = !zen && G.score > (b[cfg.level] || 0); if (isBest) b[cfg.level] = G.score;
      if (LQ.addXP) LQ.addXP(Math.min(150, Math.round(G.right * 2)), 'Base Defence');
      save();
      const acc = G.right + G.missed.length ? Math.round(G.right / (G.right + G.hits + (G.missed.length - G.hits > 0 ? G.missed.length - G.hits : 0)) * 100) : 0;
      const uniqMissed = [...new Set(G.missed)];
      host.innerHTML = `<div class="gx-over"><div class="card" style="text-align:center"><h1 style="margin:.2em 0">${G.hp <= 0 ? '💥' : '🏁'} ${esc(why)}</h1>
        <p style="font-size:1.3em">Score <b>${G.score}</b>${isBest ? ' · 🏆 new best!' : ''} · waves ${G.wave} · best combo ${G.bestCombo} · ✓ ${G.right} · ✗ ${uniqMissed.length} questions missed</p>
        <div class="row" style="gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" id="gxAgain">🔁 Play again</button>
          ${uniqMissed.length ? '<button class="btn" id="gxDrill">🎯 Drill just the ones I missed (Zen)</button>' : ''}
          <button class="btn" data-go="#/games?subject=${esc(cfg.sid)}">⚙️ Change settings</button>
          <button class="btn" data-go="#/revision?subject=${esc(cfg.sid)}">📖 Revision sheet</button></div></div>
        ${uniqMissed.length ? `<div class="card prose" style="margin-top:14px"><h2>Read these once, out loud</h2><div class="md-table"><table><tr><th>Question</th><th>Answer</th><th>Why</th></tr>${uniqMissed.map(it => `<tr><td>${esc(it.q)}</td><td><b>${esc(it.show)}</b></td><td>${esc(it.why)}</td></tr>`).join('')}</table></div></div>` : ''}
        ${G.got.length ? `<div class="card" style="margin-top:14px"><h3>Destroyed (${G.got.length})</h3><p class="muted">${[...new Set(G.got.map(x => x.show))].map(esc).join(' · ')}</p></div>` : ''}</div>`;
      $('#gxAgain').onclick = () => startGame(cfg);
      const dr = $('#gxDrill'); if (dr) dr.onclick = () => startGame({ ...cfg, mode: 'zen', level: 'cadet', only: uniqMissed.map(x => x.id), topics: [] });
    }

    let last = performance.now();
    function frame(now) {
      if (!document.body.contains(cv) || G.over) { window.removeEventListener('resize', resize); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!G.paused) update(dt);
      draw();
      requestAnimationFrame(frame);
    }
    function update(dt) {
      G.t += dt;
      if (G.timeLeft != null) { G.timeLeft -= dt; if (G.timeLeft <= 0) return end('Time!'); }
      if (G.interlude > 0) G.interlude -= dt;
      G.spawnT -= dt;
      const live = G.rocks.filter(r => !r.dead);
      const maxOn = zen ? Math.min(2, L.maxOn) : L.maxOn;
      if (G.interlude <= 0 && live.length < maxOn && (G.spawnT <= 0 || live.length === 0)) { spawn(); G.spawnT = L.gap / G.speed + Math.random(); }
      for (const r of live) {
        // In Zen the locked asteroid stops above the base and waits for you.
        const stopY = zen ? baseY() - 70 - r.r : Infinity;
        r.y = Math.min(stopY, r.y + r.vy * dt * (zen && r !== locked() ? 0.5 : 1)); r.x += r.vx * dt; r.rot += r.vr * dt;
        if (r.x < r.r || r.x > W - r.r) r.vx *= -1;
        if (r.y + r.r >= baseY() - 18) impact(r, false);
        if (G.over) return;
      }
      G.rocks = G.rocks.filter(r => !r.dead);
      for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
      G.parts = G.parts.filter(p => p.life > 0);
      G.beams.forEach(b => (b.life -= dt)); G.beams = G.beams.filter(b => b.life > 0);
      G.pops.forEach(p => { p.life -= dt; p.y -= 30 * dt; }); G.pops = G.pops.filter(p => p.life > 0);
      G.shake = Math.max(0, G.shake - dt * 30); G.flash = Math.max(0, G.flash - dt);
      hud();
      renderClues();
    }
    let lastHud = '';
    function hud() {
      const hpTxt = zen ? '🛡️ Zen' : '🛡️ ' + '❤'.repeat(Math.max(0, G.hp)) + '♡'.repeat(Math.max(0, G.maxHp - G.hp));
      const tl = G.timeLeft != null ? `⏱ ${Math.floor(G.timeLeft / 60)}:${String(Math.floor(G.timeLeft % 60)).padStart(2, '0')}` : '';
      const k = [G.score, G.combo, G.wave, hpTxt, tl, G.right, G.missed.length].join('|');
      if (k === lastHud) return; lastHud = k;
      $('#gxScore').textContent = 'Score ' + G.score;
      $('#gxCombo').textContent = 'Combo ×' + Math.min(4, 1 + Math.floor(G.combo / 3) * 0.5) + ' (' + G.combo + ')';
      $('#gxWave').textContent = 'Wave ' + G.wave;
      $('#gxHp').textContent = hpTxt;
      $('#gxTime').textContent = tl; $('#gxTime').style.display = tl ? '' : 'none';
      $('#gxAcc').textContent = `✓ ${G.right} · ✗ ${[...new Set(G.missed)].length}`;
    }
    function draw() {
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (G.shake) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04060c'); g.addColorStop(1, '#0d1426');
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      for (const s of stars) { const y = (s.y * H + G.t * 8 * s.z) % H; ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.6})`; ctx.fillRect(s.x * W, y, s.z * 1.8, s.z * 1.8); }
      // base
      const by = baseY(), cx = W / 2;
      const hpFrac = zen ? 1 : Math.max(0, G.hp / G.maxHp);
      ctx.strokeStyle = `rgba(122,162,255,${0.18 + 0.5 * hpFrac})`; ctx.lineWidth = 3 + hpFrac * 3;
      ctx.beginPath(); ctx.ellipse(cx, by + 30, W * 0.55, 60, 0, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#1b2440'; ctx.fillRect(0, by + 16, W, H - by);
      ctx.fillStyle = '#2b3a66'; ctx.beginPath(); ctx.moveTo(cx - 70, by + 18); ctx.lineTo(cx, by - 14); ctx.lineTo(cx + 70, by + 18); ctx.fill();
      ctx.fillStyle = '#3a4c85'; for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * 24 - 5, by + 4, 10, 16);
      ctx.font = '22px "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚖️', cx, by + 2);
      // cannon toward the locked rock
      const lk = locked();
      if (lk) { const a = Math.atan2(lk.y - (by - 6), lk.x - cx); ctx.strokeStyle = C.accent; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, by - 6); ctx.lineTo(cx + Math.cos(a) * 34, by - 6 + Math.sin(a) * 34); ctx.stroke(); }
      // beams
      for (const b of G.beams) { ctx.strokeStyle = `rgba(255,220,120,${b.life * 4})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, by - 6); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      // rocks
      for (const r of G.rocks) {
        if (r.dead) continue;
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
        const rg = ctx.createRadialGradient(-r.r * 0.3, -r.r * 0.3, 2, 0, 0, r.r * 1.1);
        rg.addColorStop(0, r === lk ? '#a56a52' : '#7d7466'); rg.addColorStop(1, r === lk ? '#4a2620' : '#2f2b27');
        ctx.fillStyle = rg; ctx.beginPath();
        r.pts.forEach(([x, y, k], i) => { const px = x * r.r * k, py = y * r.r * k; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = r === lk ? C.bad : 'rgba(255,255,255,.18)'; ctx.lineWidth = r === lk ? 2.5 : 1; ctx.stroke();
        ctx.restore();
        // trail
        ctx.strokeStyle = 'rgba(255,140,80,.25)'; ctx.lineWidth = r.r * 0.6; ctx.beginPath(); ctx.moveTo(r.x, r.y - r.r); ctx.lineTo(r.x - r.vx * 0.4, r.y - r.r - 40); ctx.stroke();
        // label
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.fillText('#' + r.id, r.x, r.y + 5);
        ctx.font = '11px "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(230,235,250,.85)';
        ctx.fillText(shortTopic(cfg.sid, r.it.t), r.x, r.y + r.r + 14);
        if (r === lk) { ctx.strokeStyle = C.bad; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 9 + Math.sin(G.t * 6) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        // danger line: how close to the base
        const frac = Math.max(0, Math.min(1, r.y / (by - 18)));
        if (frac > 0.7) { ctx.fillStyle = `rgba(255,80,100,${(frac - 0.7) * 2})`; ctx.fillRect(r.x - 20, by + 20, 40, 4); }
      }
      // particles
      for (const p of G.parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
      ctx.globalAlpha = 1;
      for (const p of G.pops) { ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.color; ctx.font = p.big ? 'bold 34px "Segoe UI", sans-serif' : 'bold 18px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); }
      ctx.globalAlpha = 1;
      if (G.flash) { ctx.fillStyle = `rgba(255,60,80,${G.flash})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
      if (G.paused) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.font = 'bold 30px "Segoe UI", sans-serif'; ctx.fillText(G.repair ? '🛠️ Type the answer to repair' : '⏸ Paused', W / 2, H / 2);
        ctx.font = '15px "Segoe UI", sans-serif'; ctx.fillText(G.repair ? 'It is shown on the right' : 'Esc to resume', W / 2, H / 2 + 28);
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  // Shared with the other games (views-minigames.js).
  LQ.revKit = { store, save, record, itemStat, bank, sheetFor, subjectsNow, topicsOf, plain, md, setCrumb, shortTopic };
})();
