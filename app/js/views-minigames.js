// Three quick games on the Games page, next to Base Defence: Lightning Judge (rule a clue's answer right
// or wrong against the clock), Match Pairs (connect clues to answers) and Fill the Gap (type the word
// blanked out of a line of the revision sheet). Logic in revision-core.js; shared helpers in LQ.revKit.
'use strict';
(function () {
  const D = window.LQ_DATA;
  const { esc, $, $$ } = LQ.h;
  const core = LQ.revCore;
  const kit = () => LQ.revKit;

  const GAMES = {
    defence: { icon: '☄️', name: 'Base Defence', blurb: 'Type answers to blast falling asteroids.' },
    judge: { icon: '⚡', name: 'Lightning Judge', blurb: 'A clue and an answer: rule it right or wrong before the timer runs out. Half are decoys.' },
    match: { icon: '🧩', name: 'Match Pairs', blurb: 'Connect six clues to their answers, three boards, against the clock.' },
    gap: { icon: '✍️', name: 'Fill the Gap', blurb: 'A line from your revision sheet with a key word missing: type it.' }
  };
  const SPEEDS = { relaxed: { name: '🐢 Relaxed', sec: 10 }, normal: { name: '🚶 Normal', sec: 7 }, fast: { name: '🏃 Fast', sec: 4 } };
  const ROUNDS = { judge: 20, match: 3, gap: 12 };

  const prefs = () => kit().store().prefs;
  const best = (sid, key) => ((kit().store().best[sid] || {})[key]);
  const setBest = (sid, key, v, lowerIsBetter) => {
    const b = kit().store().best[sid] = kit().store().best[sid] || {};
    const old = b[key];
    const better = old == null || (lowerIsBetter ? v < old : v > old);
    if (better) b[key] = v;
    return better;
  };
  const topicsPicked = sid => prefs()['gameTopics_' + sid] || [];
  const inTopics = (sid, t) => { const p = topicsPicked(sid); return !p.length || p.includes(t); };
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function picker(kind, sid) {
    return `<div class="pill-nav" style="margin:10px 0 4px">${Object.entries(GAMES).map(([k, g]) =>
      `<button data-go="#/games?game=${k}&subject=${esc(sid)}" class="${k === kind ? 'active' : ''}" title="${esc(g.blurb)}">${g.icon} ${esc(g.name)}</button>`).join('')}</div>`;
  }

  const STYLE = `<style>
    .mg-card{border-radius:18px;border:2px solid var(--line);background:var(--panel);padding:22px;max-width:860px;margin:0 auto}
    .mg-clue{font-size:1.3em;line-height:1.5;font-weight:600}
    .mg-ans{font-size:1.6em;font-weight:800;color:var(--accent);margin:14px 0 4px}
    .mg-bar{height:10px;border-radius:10px;background:var(--panel2);overflow:hidden;margin:16px 0}
    .mg-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--good),var(--warn),var(--bad));transform-origin:left}
    .mg-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .mg-btns button{font-size:1.2em;padding:16px;border-radius:14px;border:2px solid var(--line);background:var(--panel2);color:var(--text);font-weight:700;cursor:pointer}
    .mg-btns .no:hover{border-color:var(--bad)} .mg-btns .yes:hover{border-color:var(--good)}
    .mg-card.ok{border-color:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 35%,transparent)}
    .mg-card.bad{border-color:var(--bad);animation:mgshake .25s}
    @keyframes mgshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
    .mg-fb{min-height:52px;margin-top:12px}
    .mg-board{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1100px;margin:0 auto}
    .mg-col{display:flex;flex-direction:column;gap:10px}
    .mg-tile{border:2px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--panel);color:var(--text);text-align:left;font:inherit;cursor:pointer;line-height:1.4}
    .mg-tile.sel{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 30%,transparent)}
    .mg-tile.done{border-color:var(--good);opacity:.45;cursor:default}
    .mg-tile.bad{border-color:var(--bad);animation:mgshake .25s}
    .mg-tile .k{display:inline-block;min-width:1.6em;font-weight:800;color:var(--accent)}
    .mg-gap{font-size:1.25em;line-height:1.6}
    .mg-gap u{text-decoration:none;border-bottom:3px solid var(--warn);padding:0 1.5em}
    .mg-in{width:100%;font-size:1.25em;padding:12px 14px;border-radius:12px;border:2px solid var(--accent);background:var(--bg);color:var(--text);font-family:inherit;margin-top:14px}
    .mg-hint{font-family:Consolas,monospace;letter-spacing:.18em;color:var(--warn);margin-top:8px}
    .mg-top{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}
    @media (max-width:800px){.mg-board{grid-template-columns:1fr}}
  </style>`;

  function header(kind, sid, subs) {
    const g = GAMES[kind];
    return `<div class="row between" style="flex-wrap:wrap;gap:10px"><h1 style="margin:0">${g.icon} ${esc(g.name)}</h1>
      <div class="pill-nav" style="margin:0">${subs.map(s => `<button data-go="#/games?game=${kind}&subject=${esc(s.id)}" class="${s.id === sid ? 'active' : ''}">${esc(s.icon || '')} ${esc(s.short || s.name)}</button>`).join('')}</div></div>
      ${picker(kind, sid)}<p class="muted">${esc(g.blurb)}</p>`;
  }
  function topicChips(sid, counts) {
    const picked = topicsPicked(sid);
    return `<h3>Topics <span class="muted" style="font-weight:400;font-size:.8em">(none picked = all)</span></h3><div>${kit().topicsOf(sid).filter(t => counts[t.id]).map(t =>
      `<button class="btn small${picked.includes(t.id) ? ' primary' : ''}" style="margin:0 6px 6px 0" data-mg-topic="${esc(t.id)}">${esc(core.clip(kit().plain(t.title), 44))} <span class="muted">${counts[t.id]}</span></button>`).join('')}
      <button class="btn small ghost" data-mg-topic="__all">Clear (all topics)</button></div>`;
  }
  const countBy = (list, key = 't') => list.reduce((m, x) => { m[x[key]] = (m[x[key]] || 0) + 1; return m; }, {});

  /* ---------------- the page ---------------- */
  function view(kind, params) {
    const subs = kit().subjectsNow(), p = prefs();
    const sid = D.subjects[params.subject] ? params.subject : (D.subjects[p.gameSubject] ? p.gameSubject : subs[0].id);
    p.gameSubject = sid;
    if (params.topic) p['gameTopics_' + sid] = [params.topic];
    let pool, extra = '';
    if (kind === 'gap') pool = core.gapLines(kit().sheetFor(sid).sections, kit().plain);
    else pool = kit().bank(sid).filter(x => x.show && x.show.length <= 48);
    const counts = countBy(pool);
    if (kind === 'judge') {
      const sp = SPEEDS[p.judgeSpeed] ? p.judgeSpeed : 'normal';
      extra = `<h3>Speed</h3><div class="pill-nav">${Object.entries(SPEEDS).map(([k, s]) => `<button data-mg-speed="${k}" class="${k === sp ? 'active' : ''}">${s.name} · ${s.sec} s</button>`).join('')}</div>`;
    }
    const b = kind === 'match' ? best(sid, 'match') : best(sid, kind);
    return `<div class="page" id="mgRoot" data-kind="${kind}" data-sid="${esc(sid)}" style="max-width:1180px">${STYLE}
      <div id="mgSetup">${header(kind, sid, subs)}
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><span class="chip">${pool.length} ${kind === 'gap' ? 'lines from your revision sheet' : 'questions'}</span>${b != null ? `<span class="chip">🏆 best ${kind === 'match' ? fmtTime(b) : b}</span>` : ''}</div>
        ${extra}${topicChips(sid, counts)}
        <div class="row" style="gap:10px;margin-top:18px;align-items:center"><button class="btn primary" id="mgStart" style="font-size:1.15em;padding:12px 26px">▶ Start</button>
          <span class="muted">${kind === 'judge' ? '<b>→</b> correct · <b>←</b> wrong · Esc to stop' : kind === 'gap' ? '<b>Enter</b> check · <b>Tab</b> a letter · Esc to stop' : 'Click a clue, then its answer'}</span></div>
      </div><div id="mgPlay" hidden></div></div>`;
  }

  function after() {
    const root = $('#mgRoot'); if (!root) return;
    const kind = root.dataset.kind, sid = root.dataset.sid, p = prefs();
    kit().setCrumb('Games · ' + GAMES[kind].name);
    kit().save();
    const refresh = () => { location.hash = `#/games?game=${kind}&subject=${sid}&r=${Date.now() % 100000}`; };
    $('#mgSetup').addEventListener('click', e => {
      const t = e.target.closest('[data-mg-topic]');
      if (t) { const id = t.dataset.mgTopic, cur = new Set(topicsPicked(sid)); if (id === '__all') cur.clear(); else if (cur.has(id)) cur.delete(id); else cur.add(id); p['gameTopics_' + sid] = [...cur]; kit().save(); return refresh(); }
      const s = e.target.closest('[data-mg-speed]');
      if (s) { p.judgeSpeed = s.dataset.mgSpeed; kit().save(); return refresh(); }
    });
    $('#mgStart').onclick = () => {
      $('#mgSetup').hidden = true; const host = $('#mgPlay'); host.hidden = false;
      ({ judge: playJudge, match: playMatch, gap: playGap })[kind](host, sid);
    };
  }

  // Keys for the running game; the router removes LQ._keys when the page changes.
  function keys(fn) { LQ.unmountKeys(); LQ._keys = fn; document.addEventListener('keydown', fn); }
  function endScreen(host, sid, kind, title, line, misses, again) {
    LQ.unmountKeys();
    if (LQ.addXP) try { LQ.addXP(20, GAMES[kind].name); } catch (e) { /* cosmetic */ }
    kit().save();
    host.innerHTML = `<div class="card" style="text-align:center;max-width:860px;margin:0 auto"><h1 style="margin:.2em 0">${title}</h1><p style="font-size:1.25em">${line}</p>
      <div class="row" style="gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" id="mgAgain">🔁 Again</button>
        <button class="btn" data-go="#/games?game=${kind}&subject=${esc(sid)}">⚙️ Settings</button>
        ${misses.length ? `<button class="btn" data-go="#/games?game=defence&subject=${esc(sid)}&mode=weak">☄️ Drill my weak spots</button>` : ''}
        <button class="btn" data-go="#/revision?subject=${esc(sid)}">📖 Revision sheet</button></div></div>
      ${misses.length ? `<div class="card prose" style="margin:14px auto 0;max-width:860px"><h2>Read these once, out loud</h2><div class="md-table"><table><tr><th>Clue</th><th>Answer</th><th>Why</th></tr>${misses.map(m => `<tr><td>${esc(m.q)}</td><td><b>${esc(m.a)}</b></td><td>${esc(m.why || '')}</td></tr>`).join('')}</table></div></div>` : ''}`;
    $('#mgAgain', host).onclick = again;
  }

  /* ---------------- Lightning Judge ---------------- */
  function playJudge(host, sid) {
    const p = prefs(), sec = SPEEDS[p.judgeSpeed] ? SPEEDS[p.judgeSpeed].sec : 7;
    const pool = kit().bank(sid).filter(x => inTopics(sid, x.t));
    const rounds = core.judgeRounds(pool, ROUNDS.judge);
    if (!rounds.length) { host.innerHTML = '<div class="card">Not enough questions for this choice of topics. Pick more topics.</div>'; return; }
    let i = 0, score = 0, streak = 0, right = 0, timer = null, t0 = 0, locked = false;
    const misses = [];
    const draw = () => {
      const r = rounds[i];
      host.innerHTML = `<div class="mg-top"><span class="chip">${i + 1} / ${rounds.length}</span><span class="chip">Score ${score}</span><span class="chip">🔥 streak ${streak}</span><span class="chip">✓ ${right}</span></div>
        <div class="mg-card" id="mgCard"><div class="muted" style="margin-bottom:6px">${esc(kit().shortTopic(sid, r.it.t))}</div>
        <div class="mg-clue">${esc(r.it.q)}</div><div class="mg-ans">→ ${esc(r.shown)}</div>
        <div class="mg-bar"><i id="mgTime"></i></div>
        <div class="mg-btns"><button class="no" id="mgNo">← Wrong</button><button class="yes" id="mgYes">Correct →</button></div>
        <div class="mg-fb" id="mgFb"></div></div>`;
      $('#mgNo').onclick = () => judge(false); $('#mgYes').onclick = () => judge(true);
      locked = false; t0 = performance.now();
      const bar = $('#mgTime');
      const tick = () => { if (locked || !document.body.contains(host)) return; const f = Math.max(0, 1 - (performance.now() - t0) / (sec * 1000)); if (bar) bar.style.transform = `scaleX(${f})`; if (f <= 0) return judge(null); timer = requestAnimationFrame(tick); };
      timer = requestAnimationFrame(tick);
    };
    const judge = says => {
      if (locked) return; locked = true; cancelAnimationFrame(timer);
      const r = rounds[i], ok = says === r.truth, card = $('#mgCard');
      kit().record(r.it, ok);
      if (ok) { right++; streak++; const bonus = Math.round(Math.max(0, 1 - (performance.now() - t0) / (sec * 1000)) * 10); score += (10 + bonus) * Math.min(3, 1 + Math.floor(streak / 5)); }
      else { streak = 0; misses.push({ q: r.it.q, a: r.it.show, why: r.it.why }); }
      card.classList.add(ok ? 'ok' : 'bad');
      $('#mgFb').innerHTML = ok ? `<b style="color:var(--good)">✓ ${r.truth ? 'Right, that is the answer.' : 'Right, that was a decoy.'}</b>${r.truth ? '' : ` The answer: <b>${esc(r.it.show)}</b>`}`
        : `<b style="color:var(--bad)">${says === null ? '⏱ Time.' : '✗ No.'}</b> The answer is <b>${esc(r.it.show)}</b>${r.it.why ? ` <span class="muted">— ${esc(core.clip(r.it.why, 160))}</span>` : ''}`;
      setTimeout(() => { i++; if (i < rounds.length && document.body.contains(host)) draw(); else if (document.body.contains(host)) finish(); }, ok ? 700 : 2600);
    };
    const finish = () => {
      const played = Math.min(rounds.length, i + (locked && i < rounds.length && misses.length + right > i ? 1 : 0));
      const complete = played >= rounds.length;
      const isBest = complete && setBest(sid, 'judge', score);
      endScreen(host, sid, 'judge', isBest ? '🏆 New best!' : complete ? '⚖️ Court adjourned' : '⚖️ Stopped early',
        `Score <b>${score}</b> · ${right}/${played} right${played ? ` · ${Math.round(right / played * 100)}%` : ''}${complete ? '' : ` · ${rounds.length - played} not played`}`, misses, () => playJudge(host, sid));
    };
    keys(e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); judge(true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); judge(false); }
      else if (e.key === 'Escape') { e.preventDefault(); locked = true; cancelAnimationFrame(timer); finish(); }
    });
    draw();
  }

  /* ---------------- Match Pairs ---------------- */
  function playMatch(host, sid) {
    const pool = kit().bank(sid).filter(x => inTopics(sid, x.t));
    const boards = [];
    const used = new Set();
    for (let b = 0; b < ROUNDS.match; b++) {
      const board = core.pairBoard(pool.filter(x => !used.has(x.id)), 6);
      if (!board) break;
      board.pairs.forEach(x => used.add(x.id));
      boards.push(board);
    }
    if (!boards.length) { host.innerHTML = '<div class="card">Not enough questions for this choice of topics. Pick more topics.</div>'; return; }
    LQ.unmountKeys();
    let bi = 0, mistakes = 0, sel = null;
    const start = performance.now(), misses = [], missed = new Set();
    let clock = null;
    const draw = () => {
      const { pairs, answers } = boards[bi];
      host.innerHTML = `<div class="mg-top"><span class="chip">Board ${bi + 1} / ${boards.length}</span><span class="chip" id="mgClock">0:00</span><span class="chip">✗ ${mistakes}</span></div>
        <div class="mg-board"><div class="mg-col">${pairs.map((it, k) => `<button class="mg-tile" data-q="${k}"><span class="k">${k + 1}</span> ${esc(core.clip(it.q, 150))}</button>`).join('')}</div>
        <div class="mg-col">${answers.map((it, k) => `<button class="mg-tile" data-a="${k}"><span class="k">${'ABCDEF'[k]}</span> ${esc(it.show)}</button>`).join('')}</div></div>`;
      const left = new Set(pairs.map((_, k) => k));
      host.querySelector('.mg-board').addEventListener('click', e => {
        const tile = e.target.closest('.mg-tile'); if (!tile || tile.classList.contains('done')) return;
        const side = tile.dataset.q != null ? 'q' : 'a', idx = +(tile.dataset.q != null ? tile.dataset.q : tile.dataset.a);
        if (!sel || sel.side === side) { $$('.mg-tile.sel', host).forEach(x => x.classList.remove('sel')); tile.classList.add('sel'); sel = { side, idx, tile }; return; }
        const qi = side === 'q' ? idx : sel.idx, ai = side === 'a' ? idx : sel.idx;
        const qTile = side === 'q' ? tile : sel.tile, aTile = side === 'a' ? tile : sel.tile;
        const it = pairs[qi], ok = answers[ai] === it;
        if (ok) {
          qTile.classList.remove('sel'); aTile.classList.remove('sel'); qTile.classList.add('done'); aTile.classList.add('done');
          if (!missed.has(it.id)) kit().record(it, true);
          left.delete(qi);
          if (!left.size) { bi++; setTimeout(() => (bi < boards.length ? draw() : finish()), 450); }
        } else {
          mistakes++;
          [qTile, aTile].forEach(x => { x.classList.remove('sel'); x.classList.add('bad'); setTimeout(() => x.classList.remove('bad'), 300); });
          if (!missed.has(it.id)) { missed.add(it.id); kit().record(it, false); misses.push({ q: it.q, a: it.show, why: it.why }); }
          const c = host.querySelector('.mg-top .chip:last-child'); if (c) c.textContent = `✗ ${mistakes}`;
        }
        sel = null;
      });
    };
    const tick = () => { const c = $('#mgClock'); if (!c || !document.body.contains(host)) return clearInterval(clock); c.textContent = fmtTime((performance.now() - start) / 1000); };
    clock = setInterval(tick, 500);
    const finish = () => {
      clearInterval(clock);
      const secs = Math.round((performance.now() - start) / 1000) + mistakes * 5; // each wrong match costs 5 seconds
      const isBest = boards.length === ROUNDS.match && setBest(sid, 'match', secs, true);
      endScreen(host, sid, 'match', isBest ? '🏆 New best time!' : '🧩 All matched', `Time <b>${fmtTime(secs)}</b> (including ${mistakes} × 5 s for wrong matches) · ${boards.length} boards`, misses, () => playMatch(host, sid));
    };
    draw();
  }

  /* ---------------- Fill the Gap ---------------- */
  function playGap(host, sid) {
    const all = core.gapLines(kit().sheetFor(sid).sections, kit().plain).filter(x => inTopics(sid, x.t));
    const st = kit().store();
    const weight = x => { const s = st.items['gap:' + x.id] || { c: 0, m: 0, s: 0 }; return 3 * s.m - s.c + (s.s ? 0 : 1) + Math.random() * 3; };
    const lines = all.map(x => [weight(x), x]).sort((a, b) => b[0] - a[0]).slice(0, ROUNDS.gap).map(p => p[1]);
    if (!lines.length) { host.innerHTML = '<div class="card">This subject\'s revision sheet has no lines to blank for these topics.</div>'; return; }
    let i = 0, right = 0, streak = 0, hint = 0, answered = false;
    const misses = [];
    const rec = (x, ok) => { const s = st.items['gap:' + x.id] = st.items['gap:' + x.id] || { s: 0, c: 0, m: 0 }; s.s++; if (ok) s.c++; else s.m++; s.last = Date.now(); };
    const hintText = x => { let n = 0; return x.show.split('').map(ch => { if (ch === ' ') return '&nbsp; '; if (!/[a-z0-9]/i.test(ch)) return esc(ch); n++; return n <= hint ? esc(ch.toUpperCase()) : '_'; }).join(' '); };
    const draw = () => {
      const x = lines[i]; hint = 1; answered = false;
      host.innerHTML = `<div class="mg-top"><span class="chip">${i + 1} / ${lines.length}</span><span class="chip">✓ ${right}</span><span class="chip">🔥 streak ${streak}</span></div>
        <div class="mg-card" id="mgCard"><div class="muted" style="margin-bottom:8px">📖 ${esc(x.section)}</div>
        <div class="mg-gap">${esc(x.text).replace('_____', '<u>?</u>')}</div>
        <div class="mg-hint" id="mgHint">${hintText(x)}</div>
        <input class="mg-in" id="mgIn" autocomplete="off" spellcheck="false" placeholder="Type the missing word, then Enter">
        <div class="mg-fb" id="mgFb"></div></div>`;
      const inp = $('#mgIn'); inp.focus();
      inp.addEventListener('keydown', e => {
        if (e.key === 'Tab') { e.preventDefault(); if (!answered) { hint++; $('#mgHint').innerHTML = hintText(x); } return; }
        if (e.key === 'Escape') { e.preventDefault(); return finish(); }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (answered) { i++; return i < lines.length ? draw() : finish(); }
        if (!inp.value.trim()) return;
        answered = true;
        const ok = core.matches(inp.value, x.a);
        rec(x, ok && hint <= 1);
        if (ok) { right++; streak++; } else { streak = 0; misses.push({ q: x.text, a: x.show, why: x.section }); }
        $('#mgCard').classList.add(ok ? 'ok' : 'bad');
        $('#mgFb').innerHTML = (ok ? `<b style="color:var(--good)">✓ ${esc(x.show)}</b>` : `<b style="color:var(--bad)">✗ It's</b> <b>${esc(x.show)}</b>`) + '<div class="muted" style="font-size:.85em;margin-top:4px">Enter for the next line</div>';
        kit().save();
      });
    };
    const finish = () => {
      const played = Math.min(lines.length, i + (answered ? 1 : 0)), complete = played >= lines.length;
      const isBest = complete && lines.length >= ROUNDS.gap && setBest(sid, 'gap', right);
      endScreen(host, sid, 'gap', isBest ? '🏆 New best!' : complete ? '✍️ Sheet drilled' : '✍️ Stopped early', `${right} / ${played} gaps filled${complete ? '' : ` · ${lines.length - played} not played`}`, misses, () => playGap(host, sid));
    };
    draw();
  }

  LQ.miniGames = { view, after, picker, has: k => k in GAMES && k !== 'defence' };
})();
