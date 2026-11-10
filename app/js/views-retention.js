// Drills: closed-book free recall, weak spots, an interleaved quiz and a case drill — the retrieval
// practice that makes things stick. The scoring and selection logic is in retention.js.
'use strict';
(function () {
  const { $, $$, esc, todayKey, wordCount } = LQ.h;
  const D = window.LQ_DATA;
  const R = LQ.retention;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};

  const recallLog = () => (LQ.state.recall = LQ.state.recall || {});
  const topicCards = (sid, tid) => LQ.allCards().filter(c => c.subject === sid && c.topic === tid);
  const allQuestions = sid => (D.subjects[sid] ? D.subjects[sid].mcqs || [] : []);
  const subjectsWith = key => Object.values(D.subjects).filter(s => key === 'cases' ? Object.keys(s.cases || {}).length >= 4 : (s[key] || []).length);

  // Topics due for a spaced recall in the active semester.
  LQ.recallDue = function recallDue() {
    const live = new Set(Object.values(D.subjects).flatMap(s => s.units.flatMap(u => u.topics.map(t => t.id))));
    return R.recallDue(LQ.state.topics, recallLog()).filter(x => live.has(x.id) && LQ.allCards().some(c => c.topic === x.id));
  };

  // Sends cards back into today's queue (new cards are introduced first).
  function dueNow(cards) {
    for (const c of cards) { LQ.introduce(c); LQ.state.cards[c.id].due = Date.now(); }
    LQ.save();
  }

  const MODES = [['recall', '🧠 Free recall'], ['weak', '🎯 Weak spots'], ['mixed', '🔀 Mixed quiz'], ['cases', '⚖️ Case drill']];

  LQ.views.drill = function drill(p) {
    const mode = MODES.some(([k]) => k === p.mode) ? p.mode : 'recall';
    const tabs = `<div class="pill-nav">${MODES.map(([k, l]) => `<button class="${mode === k ? 'active' : ''}" data-go="#/drill?mode=${k}">${l}</button>`).join('')}</div>`;
    const intro = {
      recall: 'Close the notes and write down everything you remember about one topic. Then check it against the cards. Trying to recall it is what makes it stick, and seeing what you missed tells you what to review.',
      weak: 'The cards you keep forgetting and the questions you keep getting wrong, worst first. A short drill on these does more than another pass over everything.',
      mixed: 'Questions from every topic of one subject, shuffled so the same topic rarely comes up twice in a row. Mixing topics is harder than drilling one, and it is how the exam asks.',
      cases: 'Name the case from what it decided. Every case answer in the exam starts here.'
    }[mode];
    return `<div class="page"><h1>🏋️ Drills</h1>${tabs}<p class="muted" style="max-width:760px">${intro}</p><div id="drillBody">${body(mode, p)}</div></div>`;
  };

  function subjectSelect(list, sel, id = 'drillSubject') {
    return `<select id="${id}">${list.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.icon || ''} ${esc(s.short || s.name)}</option>`).join('')}</select>`;
  }
  const pickSubject = (list, sel) => (list.some(s => s.id === sel) ? sel : list.some(s => s.id === LQ.defaultSubject()) ? LQ.defaultSubject() : (list[0] || {}).id);

  function body(mode, p) {
    if (!Object.keys(D.subjects).length) return LQ.noCourses();
    if (mode === 'recall') return p.sid && p.tid ? recallPage(p.sid, p.tid) : recallPicker(p);
    if (mode === 'weak') return weakPage(p);
    const list = subjectsWith(mode === 'cases' ? 'cases' : 'mcqs');
    if (!list.length) return `<div class="empty">No ${mode === 'cases' ? 'case banks' : 'quiz questions'} in this semester’s courses yet.</div>`;
    const sid = pickSubject(list, p.subject);
    return `<div class="row" style="margin-bottom:12px">${subjectSelect(list, sid)}<button class="btn primary" id="drillStart">${mode === 'cases' ? 'Start the case drill' : 'Start a mixed quiz'}</button></div><div class="card" id="quizBox" hidden></div>`;
  }

  /* ---------- free recall ---------- */
  function recallPicker(p) {
    const due = LQ.recallDue();
    const list = Object.values(D.subjects).filter(s => s.cards && s.cards.length);
    const sid = pickSubject(list, p.subject);
    const s = D.subjects[sid];
    const topics = s ? LQ.allTopics(sid).filter(x => topicCards(sid, x.t.id).length) : [];
    const last = id => { const r = (recallLog()[id] || []).slice(-1)[0]; return r ? `last ${r.pct}%` : 'not tried'; };
    return `${due.length ? `<div class="card" style="margin-bottom:16px"><h2>⏰ Due for recall (${due.length})</h2><p class="muted">Topics you learnt 1, 3, 7 or 14 days ago. Recalling them at these gaps is what moves them into long-term memory.</p><div class="list">${due.slice(0, 12).map(x => {
      const f = Object.values(D.subjects).map(s2 => LQ.findTopic(s2.id, x.id)).find(Boolean);
      return f ? `<div class="item click" data-go="#/drill?mode=recall&sid=${f.s.id}&tid=${x.id}"><span>🧠</span><span class="grow"><strong>${esc(f.t.title)}</strong><br><small>${esc(f.s.short)} · day ${x.checkpoint} check · ${last(x.id)}</small></span><span>→</span></div>` : '';
    }).join('')}</div></div>` : ''}
      <div class="card"><h2>Pick a topic</h2>${list.length ? `<div class="row" style="margin-bottom:10px">${subjectSelect(list, sid, 'recallSubject')}</div>
        <div class="list">${topics.map(x => `<div class="item click" data-go="#/drill?mode=recall&sid=${sid}&tid=${x.t.id}"><span class="grow">${esc(x.t.title)}<br><small class="muted">${topicCards(sid, x.t.id).length} points · ${last(x.t.id)}</small></span><span>→</span></div>`).join('')}</div>` : '<p class="muted">No flashcards yet to check a recall against.</p>'}</div>`;
  }

  function recallPage(sid, tid) {
    const f = LQ.findTopic(sid, tid);
    if (!f) return '<div class="empty">That topic isn’t in this semester.</div>';
    const n = topicCards(sid, tid).length;
    const draft = (LQ.state.recallDraft || {})[tid] || '';
    return `<div class="card"><div class="row between"><h2>🧠 ${esc(f.t.title)}</h2><a href="#/drill?mode=recall&subject=${sid}" class="muted">Other topics →</a></div>
      <p class="muted">No peeking. Write the rules, sections, cases and what they held — fragments are fine. You will be checked against ${n} points.</p>
      <textarea id="blurt" rows="12" style="width:100%" placeholder="Everything you remember about ${esc(f.t.title)}…">${esc(draft)}</textarea>
      <div class="row between" style="margin-top:8px"><small class="muted" id="blurtCount">${wordCount(draft)} words</small><button class="btn primary" id="blurtCheck">Check my recall</button></div></div>
      <div id="blurtResult"></div>`;
  }

  function showRecallResult(sid, tid, text) {
    const cards = topicCards(sid, tid);
    const res = R.scoreRecall(text, cards);
    const log = recallLog();
    (log[tid] = log[tid] || []).push({ t: Date.now(), pct: res.pct, words: wordCount(text) });
    if (log[tid].length > 20) log[tid] = log[tid].slice(-20);
    if (LQ.state.recallDraft) delete LQ.state.recallDraft[tid];
    LQ.addXP(5 + Math.round(res.pct / 10), 'Free recall');
    const missed = res.points.filter(x => !x.recalled);
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const row = x => `<div class="item ${x.recalled ? 'done' : ''}"><span>${x.recalled ? '✅' : '⬜'}</span><span class="grow">${LQ.md(x.prompt).replace(/^<p>|<\/p>$/g, '')}${x.recalled ? '' : `<div class="muted" style="margin-top:4px">${LQ.md(x.answer).replace(/^<p>|<\/p>$/g, '')}</div>`}</span></div>`;
    $('#blurtResult').innerHTML = `<div class="card" style="margin-top:16px"><div class="row between"><h2>You recalled ${res.recalled} of ${res.total} (${res.pct}%)</h2>
      ${missed.length ? `<button class="btn primary" id="sendMissed">Review the ${missed.length} I missed now</button>` : '<span class="chip ok">Everything covered</span>'}</div>
      <p class="muted">${res.pct >= 80 ? 'Strong recall. The next check will come round on schedule.' : res.pct >= 50 ? 'A good base. Review the missed points now, then try again tomorrow.' : 'Normal for a first attempt. Review the missed points now — that is where the learning happens.'} The match is done on key words, so a point you made in your own words may be marked missed: judge for yourself.</p>
      <div class="list">${missed.map(row).join('')}${res.points.filter(x => x.recalled).map(row).join('')}</div></div>`;
    const btn = $('#sendMissed');
    if (btn) btn.onclick = () => {
      const list = missed.map(x => byId[x.id]).filter(Boolean);
      dueNow(list);
      $('#blurtResult').innerHTML = '<div class="card" style="margin-top:16px"><div id="missedSession"></div></div>';
      LQ.mountCardSession($('#missedSession'), { cards: list, continueLabel: 'Back to drills', onContinue: () => { location.hash = '#/drill?mode=recall'; } });
    };
    LQ.save();
  }

  /* ---------- weak spots ---------- */
  function weakPage() {
    const cards = R.weakCards(LQ.allCards(), LQ.state.cards, 40);
    const qs = R.weakQuestions(Object.values(D.subjects).flatMap(s => (s.mcqs || []).map(q => ({ ...q, subject: s.id }))), LQ.state.mcq, 30);
    const today = todayKey();
    const soon = (D.exams || []).filter(e => e.date >= today && LQ.h.daysBetween(today, e.date) <= 14).map(e => e.subject);
    const topics = soon.flatMap(sid => LQ.allTopics(sid).map(x => ({ ...x, m: LQ.mastery({ subject: sid, topic: x.t.id }), n: topicCards(sid, x.t.id).length })))
      .filter(x => x.n && x.m < 40).sort((a, b) => a.m - b.m).slice(0, 12);
    const label = c => esc(LQ.retention.cardPoint(c).prompt.replace(/\[\[[cs]:[^\]|]*\|?([^\]]*)\]\]/g, '$1').replace(/[*_`]/g, '').slice(0, 110));
    return `<div class="grid g2">
      <div class="card"><div class="row between"><h2>🃏 Cards you keep forgetting (${cards.length})</h2>${cards.length ? '<button class="btn primary" id="drillWeakCards">Drill them</button>' : ''}</div>
        ${cards.length ? `<div class="list">${cards.slice(0, 15).map(w => `<div class="item"><span class="grow">${label(w.card)}<br><small class="muted">${esc((D.subjects[w.card.subject] || {}).short || '')} · forgot ${w.lapses}×</small></span></div>`).join('')}</div>` : '<p class="muted">Nothing yet — cards you mark Again more than once show up here.</p>'}</div>
      <div class="card"><div class="row between"><h2>❓ Questions you got wrong (${qs.length})</h2>${qs.length ? '<button class="btn primary" id="drillWeakQs">Retake them</button>' : ''}</div>
        ${qs.length ? `<div class="list">${qs.slice(0, 12).map(w => `<div class="item"><span class="grow">${esc(String(w.q.q).replace(/[*_`]/g, '').slice(0, 110))}<br><small class="muted">${esc((D.subjects[w.q.subject] || {}).short || '')} · ${Math.round(w.acc * 100)}% right over ${w.n} tr${w.n === 1 ? 'y' : 'ies'}</small></span></div>`).join('')}</div>` : '<p class="muted">Nothing yet — quiz questions you miss show up here.</p>'}</div>
    </div>
    <div class="card" style="margin-top:16px"><h2>📉 Weak topics with an exam in the next 14 days</h2>
      ${topics.length ? `<div class="list">${topics.map(x => `<div class="item"><span class="grow"><strong>${esc(x.t.title)}</strong><br><small class="muted">${esc(x.s.short)} · ${x.m}% card mastery</small></span><a class="btn small" href="#/drill?mode=recall&sid=${x.s.id}&tid=${x.t.id}">Free recall</a><a class="btn small" href="#/topic/${x.s.id}/${x.t.id}">Open</a></div>`).join('')}</div>` : '<p class="muted">No weak topics before your next exams. 👏</p>'}</div>
    <div class="card" id="weakBox" hidden style="margin-top:16px"></div>`;
  }

  LQ.after.drill = function (p) {
    const mode = p.mode || 'recall';
    const sel = $('#recallSubject');
    if (sel) sel.onchange = () => { location.hash = `#/drill?mode=recall&subject=${sel.value}`; };
    if (mode === 'recall' && p.sid && p.tid && $('#blurt')) {
      const ta = $('#blurt');
      ta.oninput = () => {
        $('#blurtCount').textContent = `${wordCount(ta.value)} words`;
        LQ.state.recallDraft = LQ.state.recallDraft || {};
        LQ.state.recallDraft[p.tid] = ta.value;
        LQ.save();
      };
      $('#blurtCheck').onclick = () => {
        if (wordCount(ta.value) < 5) return LQ.toast('Write a few lines first — even fragments count.');
        ta.disabled = true; $('#blurtCheck').disabled = true;
        showRecallResult(p.sid, p.tid, ta.value);
      };
      ta.focus();
    }
    if (mode === 'weak') {
      const box = $('#weakBox');
      const wc = $('#drillWeakCards'), wq = $('#drillWeakQs');
      if (wc) wc.onclick = () => {
        const list = R.weakCards(LQ.allCards(), LQ.state.cards, 40).map(w => w.card);
        box.hidden = false; box.scrollIntoView({ block: 'start' });
        LQ.mountCardSession(box, { cards: list, continueLabel: 'Done', onContinue: () => LQ.rerender() });
      };
      if (wq) wq.onclick = () => {
        const list = R.weakQuestions(Object.values(D.subjects).flatMap(s => s.mcqs || []), LQ.state.mcq, 30).map(w => w.q);
        box.hidden = false; box.scrollIntoView({ block: 'start' });
        LQ.mountMCQ(box, list);
      };
    }
    if (mode === 'mixed' || mode === 'cases') {
      const start = $('#drillStart');
      if (!start) return;
      start.onclick = () => {
        const sid = $('#drillSubject').value, s = D.subjects[sid];
        const qs = mode === 'cases' ? R.caseQuestions(s, 12) : R.interleave(allQuestions(sid).concat(R.caseQuestions(s, 5)), 15);
        if (!qs.length) return LQ.toast('Not enough material in that subject for this drill yet.');
        const box = $('#quizBox');
        box.hidden = false;
        LQ.mountMCQ(box, qs, (right, n) => { if (n && right / n >= 0.8) LQ.toast('Strong round — try another subject, or come back tomorrow.'); });
      };
      const ss = $('#drillSubject');
      if (ss) ss.onchange = () => { location.hash = `#/drill?mode=${mode}&subject=${ss.value}`; };
    }
  };

  // The card on Today: what is due for recall, and the weak cards waiting.
  LQ.recallNudge = function recallNudge() {
    if (!Object.keys(D.subjects).length) return '';
    const due = LQ.recallDue();
    const weak = R.weakCards(LQ.allCards(), LQ.state.cards, 99).length;
    if (!due.length && !weak) return '';
    const first = due[0] && Object.values(D.subjects).map(s => LQ.findTopic(s.id, due[0].id)).find(Boolean);
    return `<div class="card" style="margin-top:16px"><div class="row between"><h2>🧠 Make it stick</h2><a href="#/drill" class="muted">All drills →</a></div>
      <div class="row">${first ? `<button class="btn primary" data-go="#/drill?mode=recall&sid=${first.s.id}&tid=${first.t.id}">Free recall: ${esc(first.t.title)}${due.length > 1 ? ` (+${due.length - 1} due)` : ''}</button>` : ''}
      ${weak ? `<button class="btn" data-go="#/drill?mode=weak">🎯 ${weak} weak card${weak === 1 ? '' : 's'}</button>` : ''}
      <button class="btn" data-go="#/drill?mode=mixed">🔀 Mixed quiz</button></div>
      <p class="muted" style="margin:8px 0 0">Ten minutes of closed-book recall beats an hour of re-reading.</p></div>`;
  };
})();
