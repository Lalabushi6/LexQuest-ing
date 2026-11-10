// Practice views: flashcard sessions, quizzes, memory palace, past papers, timed answers and mock exams.
'use strict';
(function () {
  const { $, $$, esc, todayKey, shuffle, wordCount } = LQ.h;
  const D = window.LQ_DATA;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};

  /* ---------- card rendering ---------- */
  function cardFaces(card) {
    if (card.type === 'cloze') {
      // Unicode brackets survive the markdown escaper, then become the blank / the highlight.
      const front = LQ.md(card.text.replace(/\{\{(.+?)\}\}/g, '⟦…⟧')).replace(/⟦…⟧/g, '<span class="chip" style="font-size:1em">[ … ]</span>');
      const back = LQ.md(card.text.replace(/\{\{(.+?)\}\}/g, '⟪$1⟫')).replace(/⟪(.+?)⟫/g, '<mark>$1</mark>');
      return { front, back: back + (card.extra ? `<hr>${LQ.md(card.extra)}` : '') };
    }
    return { front: LQ.md(card.front), back: LQ.md(card.back) + (card.extra ? `<hr>${LQ.md(card.extra)}` : '') };
  }

  LQ.unmountKeys = function () { if (LQ._keys) { document.removeEventListener('keydown', LQ._keys); LQ._keys = null; } };

  LQ.mountCardSession = function mountCardSession(el, opts = {}) {
    const filter = { subject: opts.subject, topic: opts.topic };
    let queue;
    // Type-to-answer: write the answer before seeing it (stronger recall), then compare.
    const typing = opts.type != null ? !!opts.type : !!LQ.state.settings.typeAnswers;
    if (opts.cards) queue = shuffle(opts.cards.slice());
    else if (opts.cram) queue = shuffle(LQ.allCards().filter(c => (!filter.subject || c.subject === filter.subject) && (!filter.topic || c.topic === filter.topic)));
    else {
      const due = shuffle(LQ.dueCards(filter));
      const nt = LQ.state.newToday;
      const usedNew = nt.day === todayKey() ? nt.n : 0;
      const newAllowance = opts.topic ? 999 : Math.max(0, LQ.state.settings.newPerDay - usedNew);
      const fresh = shuffle(LQ.newCards(filter)).slice(0, newAllowance);
      queue = due.concat(fresh);
    }
    // Due cards get priority for a place in the session; the order within it is random.
    queue = shuffle(queue.slice(0, opts.limit || LQ.state.settings.cardsPerSession));
    const total = queue.length;
    let done = 0, again = 0, flipped = false, current = null;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const continueBtn = opts.onContinue ? `<button class="btn primary" id="contBtn">${esc(opts.continueLabel || 'Continue')} →</button>` : '';
    const wireContinue = () => { const b = $('#contBtn', el); if (b) { b.onclick = opts.onContinue; b.focus(); } };

    if (!total) {
      el.innerHTML = `<div class="empty">🎉 Nothing due here right now.<br><br><div class="row" style="justify-content:center">${continueBtn}<button class="btn" id="cramBtn">Cram these cards anyway</button></div></div>`;
      const cb = $('#cramBtn', el); if (cb) cb.onclick = () => LQ.mountCardSession(el, { ...opts, cram: true });
      if (opts.onFinish && opts.topic) opts.onFinish();
      wireContinue();
      return;
    }

    // A card marked Again comes back at a random point, at least three cards later when it can.
    function requeue() {
      const card = queue.shift();
      const soonest = Math.min(3, queue.length);
      queue.splice(soonest + Math.floor(Math.random() * (queue.length - soonest + 1)), 0, card);
      again += 1;
    }

    function show() {
      if (!queue.length) return finish();
      current = queue[0];
      flipped = false;
      LQ.introduce(current);
      const f = cardFaces(current);
      const topic = current.topic ? LQ.findTopic(current.subject, current.topic) : null;
      el.innerHTML = `<div class="flash-wrap">
        <div class="row between" style="margin-bottom:8px"><small class="muted">${done}/${total} done${again ? ` · ${again} to repeat` : ''}</small><small class="muted">${opts.cram ? 'Cram mode (doesn’t change schedule much)' : ''}</small></div>
        <div class="progress" style="margin-bottom:14px"><i style="width:${done / total * 100}%"></i></div>
        <div class="flash" id="flash"><div class="face front"><span class="meta">${esc(topic ? topic.t.title : (D.subjects[current.subject] || {}).short || '')}</span><div class="q">${f.front}</div></div><div class="face back"><span class="meta">Answer</span><div>${f.back}</div></div></div>
        ${typing ? '<textarea id="typed" class="typed-answer" rows="3" placeholder="Type your answer first — Ctrl+Enter to check"></textarea><div id="typedResult"></div>' : ''}
        <div class="grades" id="grades"><button class="btn primary" id="flipBtn">${typing ? 'Check my answer <kbd>Ctrl+Enter</kbd>' : 'Show answer <kbd>Space</kbd>'}</button></div>
        <div class="kbd-hint">${typing ? 'Ctrl+Enter = check · then 1 Again · 2 Hard · Space/3 Good · 4 Easy' : 'Space = flip, Space again = Good · 1 Again · 2 Hard · 3 Good · 4 Easy'}</div></div>`;
      $('#flash', el).onclick = flip;
      $('#flipBtn', el).onclick = flip;
      const ta = $('#typed', el);
      if (ta) {
        ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); flip(); } };
        ta.focus();
      }
    }
    function flip() {
      if (flipped) return;
      flipped = true;
      $('#flash', el).classList.add('flipped');
      let suggested = 0;
      const ta = $('#typed', el);
      if (ta) {
        const typed = ta.value.trim();
        ta.readOnly = true; ta.blur();
        if (typed) {
          const cov = LQ.retention.coverage(typed, LQ.retention.cardPoint(current).answer);
          suggested = cov.total ? LQ.retention.suggestGrade(cov.score) : 0;
          $('#typedResult', el).innerHTML = cov.total ? `<div class="callout ${cov.score >= 0.5 ? 'tip' : 'warn'}">You matched ${cov.hit.length} of ${cov.total} key words${cov.miss.length ? ` — missing: <em>${esc(cov.miss.slice(0, 8).join(', '))}</em>` : ''}. Suggested grade: <strong>${['', 'Again', 'Hard', 'Good', 'Easy'][suggested]}</strong> (you decide).</div>` : '';
        } else $('#typedResult', el).innerHTML = '<div class="callout warn">Nothing typed — grade yourself honestly.</div>';
      }
      $('#grades', el).innerHTML = `<button class="btn bad" data-g="1">Again <kbd>1</kbd></button><button class="btn warn" data-g="2">Hard <kbd>2</kbd></button><button class="btn good" data-g="3">Good <kbd>Space</kbd></button><button class="btn primary" data-g="4">Easy <kbd>4</kbd></button>`;
      $$('[data-g]', el).forEach(b => { b.onclick = () => grade(+b.dataset.g); if (+b.dataset.g === suggested) b.classList.add('suggested'); });
    }
    function grade(g) {
      if (!flipped) return;
      counts[g] += 1;
      if (opts.cram) { LQ.day().cards += 1; LQ.questProgress('cards', 1); LQ.addXP(1); }
      else LQ.grade(current, g);
      if (g === 1) requeue(); else { queue.shift(); done += 1; }
      show();
    }
    function finish() {
      LQ.unmountKeys();
      el.innerHTML = `<div class="card" style="text-align:center"><h2>✅ Session complete</h2>
        <p>${total} cards · Again ${counts[1]} · Hard ${counts[2]} · Good ${counts[3]} · Easy ${counts[4]}</p>
        <p class="muted">${counts[1] > total * 0.3 ? 'Lots of misses — that’s normal for new material. They’ll come back soon, which is exactly how they stick.' : 'Solid. Come back when the next batch is due.'}</p>
        <div class="row" style="justify-content:center">${continueBtn}<button class="btn ${continueBtn ? '' : 'primary'}" id="moreBtn">Another round</button>${continueBtn ? '' : '<button class="btn" data-go="#/home">Back to Today</button>'}</div></div>`;
      $('#moreBtn', el).onclick = () => LQ.mountCardSession(el, opts);
      if (opts.onFinish) opts.onFinish();
      wireContinue();
      LQ.renderTopbar();
    }
    LQ.unmountKeys();
    LQ._keys = e => {
      if (/input|textarea|select/i.test(document.activeElement.tagName) || $('#modalRoot').innerHTML) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (flipped) grade(3); else flip(); }
      else if (['1', '2', '3', '4'].includes(e.key)) grade(+e.key);
    };
    document.addEventListener('keydown', LQ._keys);
    show();
  };

  /* ---------- Flashcards page ---------- */
  LQ.views.review = function review(p) {
    const subs = Object.values(D.subjects);
    const sel = p.subject || '';
    const all = LQ.allCards().filter(c => !sel || c.subject === sel);
    const due = LQ.dueCards(sel ? { subject: sel } : {}).length;
    const fresh = LQ.newCards(sel ? { subject: sel } : {}).length;
    return `<div class="page"><div class="row between"><h1>🃏 Flashcards</h1><div class="row"><button class="btn" id="newCard">＋ New card</button><button class="btn" data-go="#/review?${sel ? 'subject=' + sel + '&' : ''}browse=1">Browse all</button></div></div>
      <div class="pill-nav"><button class="${!sel ? 'active' : ''}" data-go="#/review">All (${LQ.dueCards().length} due)</button>${subs.map(s => `<button class="${sel === s.id ? 'active' : ''}" data-go="#/review?subject=${s.id}">${s.icon} ${esc(s.short)} (${LQ.dueCards({ subject: s.id }).length})</button>`).join('')}</div>
      <div class="row" style="margin-bottom:14px"><span class="chip">${all.length} cards</span><span class="chip">${due} due</span><span class="chip">${fresh} new</span><span class="spacer"></span>
        <button class="btn small ${LQ.state.settings.typeAnswers ? 'primary' : ''}" id="typeToggle" title="Write each answer before you see it">${LQ.state.settings.typeAnswers ? '✓ Typing answers' : '⌨ Type answers'}</button>
        <button class="btn small ${p.cram ? 'primary' : ''}" data-go="#/review?${sel ? 'subject=' + sel + '&' : ''}${p.cram ? '' : 'cram=1'}">${p.cram ? '✓ Cram mode' : 'Cram mode (pre-exam)'}</button></div>
      ${p.browse ? browseTable(all) : `<div id="session"></div>`}
    </div>`;
  };
  function browseTable(cards) {
    return `<table class="t"><thead><tr><th>Front</th><th>Topic</th><th>Status</th></tr></thead><tbody>${cards.map(c => {
      const st = LQ.state.cards[c.id];
      const t = c.topic ? LQ.findTopic(c.subject, c.topic) : null;
      return `<tr><td>${esc((c.front || c.text || '').replace(/\{\{|\}\}|\[\[[cs]:|\]\]/g, '').slice(0, 120))}</td><td>${esc(t ? t.t.title : '')}</td><td>${!st ? '<span class="chip">new</span>' : st.due <= Date.now() ? '<span class="chip t2">due</span>' : `<span class="chip ok">in ${Math.max(1, Math.round((st.due - Date.now()) / 86400000))}d</span>`}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  LQ.after.review = function (p) {
    $('#newCard').onclick = () => LQ.addCustomCard(p.subject || LQ.defaultSubject(), '');
    $('#typeToggle').onclick = () => { LQ.state.settings.typeAnswers = !LQ.state.settings.typeAnswers; LQ.save(); LQ.rerender(); };
    const el = $('#session');
    if (el) LQ.mountCardSession(el, { subject: p.subject, cram: !!p.cram });
  };

  /* ---------- quizzes ---------- */
  LQ.mountMCQ = function mountMCQ(el, questions, onFinish) {
    const qs = shuffle(questions);
    let i = 0, right = 0;
    function show() {
      if (i >= qs.length) {
        el.innerHTML = `<h3>Score: ${right}/${qs.length}</h3><p class="muted">${right / qs.length >= 0.8 ? 'Strong. ' : 'Re-read the explanations above the ones you missed, then make a card for each.'}</p><button class="btn" id="mcqAgain">Try again</button>`;
        $('#mcqAgain', el).onclick = () => LQ.mountMCQ(el, questions, onFinish);
        if (onFinish) onFinish(right, qs.length);
        return;
      }
      const q = qs[i];
      const opts = shuffle(q.options.map((o, k) => ({ o, k })));
      el.innerHTML = `<small class="muted">Question ${i + 1} of ${qs.length}</small><p style="margin-top:6px"><strong>${LQ.md(q.q).replace(/^<p>|<\/p>$/g, '')}</strong></p>
        ${opts.map(x => `<button class="mcq-opt" data-k="${x.k}">${LQ.md(x.o).replace(/^<p>|<\/p>$/g, '')}</button>`).join('')}<div id="mcqWhy"></div>`;
      $$('.mcq-opt', el).forEach(b => b.onclick = () => {
        if (el.dataset.locked === '1') return;
        el.dataset.locked = '1';
        const ok = +b.dataset.k === q.answer;
        if (ok) right += 1;
        $$('.mcq-opt', el).forEach(x => { if (+x.dataset.k === q.answer) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        const rec = LQ.state.mcq[q.id] = LQ.state.mcq[q.id] || { ok: 0, n: 0 };
        rec.n += 1; if (ok) rec.ok += 1;
        LQ.day().mcq += 1; LQ.questProgress('mcq', 1); LQ.addXP(ok ? 3 : 1);
        $('#mcqWhy', el).innerHTML = `<div class="callout ${ok ? 'tip' : 'warn'}">${ok ? '✅ Correct. ' : '❌ Not quite. '}${LQ.md(q.why || '').replace(/^<p>|<\/p>$/g, '')}</div><button class="btn primary" id="mcqNext">Next →</button>`;
        $('#mcqNext', el).onclick = () => { el.dataset.locked = '0'; i += 1; show(); };
        $('#mcqNext', el).focus(); // Enter or Space moves on
      });
    }
    el.dataset.locked = '0';
    show();
  };

  /* ---------- memory palace ---------- */
  function palaces() {
    return (D.palaces || []).concat(LQ.state.palace.custom.map(p => ({ ...p, custom: true })));
  }
  function numbered(p) {
    let n = 0;
    return p.rooms.flatMap(r => r.loci.map(l => ({ ...l, n: ++n, room: r.name, icon: r.icon, palace: p.id, subject: p.subject })));
  }
  LQ.palaceLociFor = function (sid, tid) {
    return palaces().filter(p => !sid || p.subject === sid).flatMap(numbered).filter(l => l.topic === tid);
  };

  LQ.views.palace = function palace(p) {
    if (p.walk) return `<div class="page"><div id="walkStage"></div></div>`;
    const list = palaces();
    const sel = list.find(x => x.id === p.id) || list[0];
    return `<div class="page"><div class="row between"><h1>🏛️ Memory palace</h1><button class="btn" id="newPalace">＋ Build my own palace</button></div>
      <p class="muted">The method of loci: you store each fact at a fixed spot along a route you can walk in your head. Walk the route forwards and backwards; the images pull the law back out. Best results come from <strong>your own</strong> places, so copy the images below into a route you know, or build one from scratch.</p>
      <div class="pill-nav">${list.map(x => `<button class="${sel && sel.id === x.id ? 'active' : ''}" data-go="#/palace?id=${x.id}">${esc(x.name)}${x.custom ? ' ✏️' : ''}</button>`).join('')}</div>
      ${sel ? `<div class="hero"><div class="row between"><div><h2>${esc(sel.name)}</h2><p class="muted">${esc(sel.intro || '')}</p></div>
        <div class="row"><button class="btn primary" data-go="#/palace?walk=${sel.id}">🚶 Walk it (${numbered(sel).length} loci)</button><button class="btn" data-go="#/palace?walk=${sel.id}&reverse=1">↩ Walk backwards</button>${sel.custom ? `<button class="btn" id="editPalace" data-id="${sel.id}">Edit</button>` : ''}</div></div></div>
        <div class="palace-rooms">${(() => { let n = 0; return sel.rooms.map(r => `<div class="room"><div class="room-head"><span class="ri">${r.icon || '🚪'}</span><h3 style="margin:0">${esc(r.name)}</h3></div>${r.loci.map(l => { n++; const w = LQ.state.palace.walks[l.id]; return `<div class="locus"><span class="n">${n}</span><div><strong>${esc(l.spot)}</strong> ${w ? (w.ok ? '<span class="chip ok">✓</span>' : '<span class="chip no">missed</span>') : ''}<br><span style="font-size:.92em">${LQ.md(l.image).replace(/^<p>|<\/p>$/g, '')}</span><br><small class="muted">↳ ${LQ.md(l.meaning).replace(/^<p>|<\/p>$/g, '')}</small></div></div>`; }).join('')}</div>`).join(''); })()}</div>` : `<div class="empty">No palace yet.</div>`}
    </div>`;
  };

  LQ.after.palace = function (p) {
    if (p.walk) return walk(p);
    const np = $('#newPalace'); if (np) np.onclick = () => editPalace(null);
    const ep = $('#editPalace'); if (ep) ep.onclick = () => editPalace(ep.dataset.id);
  };

  function walk(p) {
    const stage = $('#walkStage');
    let loci;
    const pal = palaces().find(x => x.id === p.walk);
    if (pal) loci = numbered(pal);
    else loci = palaces().filter(x => x.subject === p.walk).flatMap(numbered).filter(l => !p.topic || l.topic === p.topic);
    if (p.reverse) loci = loci.slice().reverse();
    if (!loci.length) { stage.innerHTML = `<div class="empty">No loci to walk.</div>`; return; }
    let i = 0, ok = 0, revealed = false;
    function show() {
      if (i >= loci.length) {
        LQ.unmountKeys();
        LQ.day().walks += 1; LQ.questProgress('walks', 1);
        LQ.addXP(Math.max(5, ok * 2), 'Palace walk');
        if (p.topic) LQ.completeStep(p.topic, 'palace');
        stage.innerHTML = `<div class="card walk-stage"><div class="big">🏁</div><h2>Walk complete — ${ok}/${loci.length} recalled</h2><p class="muted">${ok === loci.length ? 'Flawless. Walk it backwards next time — that’s the real test.' : 'Re-read the ones you missed and make the image stranger or more personal.'}</p><div class="row" style="justify-content:center">${p.topic ? `<button class="btn primary" id="toTopic" data-go="#/topic/${p.walk}/${p.topic}?step=test">Continue to the Test →</button><button class="btn" id="again">Walk again</button>` : `<button class="btn primary" id="again">Walk again</button><button class="btn" data-go="#/palace">Back to palace</button>`}</div></div>`;
        $('#again', stage).onclick = () => { i = 0; ok = 0; show(); };
        if (p.topic) $('#toTopic', stage).focus();
        return;
      }
      const l = loci[i];
      revealed = false;
      stage.innerHTML = `<div class="card walk-stage">
        <div class="row between"><small class="muted">Locus ${i + 1} of ${loci.length}</small><small class="muted">${ok} recalled</small></div>
        <div class="progress" style="margin:8px 0 6px"><i style="width:${i / loci.length * 100}%"></i></div>
        <div class="big">${l.icon || '🚪'}</div>
        <h2>${esc(l.room)} → ${esc(l.spot)}</h2>
        <p class="muted">Close your eyes. What's waiting at this spot, and what law does it stand for?</p>
        <div id="reveal"><button class="btn primary" id="revealBtn">Reveal <kbd>Space</kbd></button></div></div>`;
      $('#revealBtn', stage).onclick = reveal;
    }
    function reveal() {
      if (revealed) return;
      revealed = true;
      const l = loci[i];
      $('#reveal', stage).innerHTML = `<div class="image"><p>${LQ.md(l.image).replace(/^<p>|<\/p>$/g, '')}</p><p class="muted">↳ ${LQ.md(l.meaning).replace(/^<p>|<\/p>$/g, '')}</p></div>
        <div class="row" style="justify-content:center;margin-top:14px"><button class="btn good" data-r="1">Got it <kbd>Space</kbd></button><button class="btn bad" data-r="0">Missed it <kbd>2</kbd></button></div>`;
      $$('[data-r]', stage).forEach(b => b.onclick = () => rate(b.dataset.r === '1'));
    }
    function rate(good) {
      if (!revealed) return;
      const l = loci[i];
      LQ.state.palace.walks[l.id] = { ok: good, t: Date.now() };
      if (good) ok += 1;
      i += 1; LQ.save(); show();
    }
    LQ.unmountKeys();
    LQ._keys = e => {
      if (/input|textarea/i.test(document.activeElement.tagName)) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (revealed) rate(true); else reveal(); }
      else if (e.key === '1') rate(true); else if (e.key === '2') rate(false);
    };
    document.addEventListener('keydown', LQ._keys);
    show();
  }

  function editPalace(id) {
    const existing = LQ.state.palace.custom.find(x => x.id === id);
    const pal = existing ? JSON.parse(JSON.stringify(existing)) : { id: 'my-' + LQ.h.uid(), name: 'My room', intro: 'A route I walk every day.', subject: LQ.defaultSubject(), rooms: [{ id: LQ.h.uid(), name: 'Doorway', icon: '🚪', loci: [] }] };
    const subjOpts = '<option value="">No subject</option>' + Object.values(D.subjects).map(s => `<option value="${s.id}">${esc(s.short)}</option>`).join('');
    function render() {
      const m = LQ.modal(`<h2>${existing ? 'Edit' : 'Build'} a palace</h2>
        <p class="muted">Pick a place you know in detail. List rooms in walking order, and 3–6 spots per room (door, bed, desk, window…). For each spot, write a <em>vivid, absurd</em> image and what it means.</p>
        <div class="grid g2"><label class="field"><span>Name</span><input type="text" id="pName" value="${esc(pal.name)}"></label><label class="field"><span>Subject</span><select id="pSubj">${subjOpts}</select></label></div>
        <div id="pRooms">${pal.rooms.map((r, ri) => `<div class="card tight" style="margin-bottom:10px"><div class="row"><input type="text" style="width:70px" data-ri="${ri}" data-f="icon" value="${esc(r.icon)}"><input type="text" style="flex:1;width:auto" data-ri="${ri}" data-f="name" value="${esc(r.name)}"><button class="btn small bad" data-delroom="${ri}">✕</button></div>
          ${r.loci.map((l, li) => `<div class="grid g3" style="margin-top:8px"><input type="text" placeholder="Spot (e.g. the kettle)" data-ri="${ri}" data-li="${li}" data-f="spot" value="${esc(l.spot)}"><input type="text" placeholder="Vivid image" data-ri="${ri}" data-li="${li}" data-f="image" value="${esc(l.image)}"><input type="text" placeholder="What it means" data-ri="${ri}" data-li="${li}" data-f="meaning" value="${esc(l.meaning)}"></div>`).join('')}
          <button class="btn small" data-addlocus="${ri}" style="margin-top:8px">＋ Spot</button></div>`).join('')}</div>
        <div class="row"><button class="btn" id="addRoom">＋ Room</button><span class="spacer"></span>${existing ? '<button class="btn bad" id="delPal">Delete palace</button>' : ''}<button class="btn primary" id="savePal">Save</button><button class="btn" id="cancelPal">Cancel</button></div>`, { wide: true, sticky: true });
      $('#pSubj', m).value = pal.subject;
      const sync = () => {
        pal.name = $('#pName', m).value; pal.subject = $('#pSubj', m).value;
        $$('[data-f]', m).forEach(inp => {
          const r = pal.rooms[+inp.dataset.ri];
          if (inp.dataset.li !== undefined) r.loci[+inp.dataset.li][inp.dataset.f] = inp.value; else r[inp.dataset.f] = inp.value;
        });
      };
      $('#addRoom', m).onclick = () => { sync(); pal.rooms.push({ id: LQ.h.uid(), name: 'Next room', icon: '🚪', loci: [] }); render(); };
      $$('[data-addlocus]', m).forEach(b => b.onclick = () => { sync(); pal.rooms[+b.dataset.addlocus].loci.push({ id: LQ.h.uid(), spot: '', image: '', meaning: '' }); render(); });
      $$('[data-delroom]', m).forEach(b => b.onclick = () => { sync(); pal.rooms.splice(+b.dataset.delroom, 1); render(); });
      $('#savePal', m).onclick = () => {
        sync();
        pal.rooms.forEach(r => { r.loci = r.loci.filter(l => l.spot.trim()); });
        const list = LQ.state.palace.custom;
        const idx = list.findIndex(x => x.id === pal.id);
        if (idx >= 0) list[idx] = pal; else { list.push(pal); LQ.addXP(15, 'Palace built'); }
        LQ.save(); LQ.closeModal(); location.hash = '#/palace?id=' + pal.id; LQ.rerender();
      };
      $('#cancelPal', m).onclick = () => LQ.closeModal();
      const dp = $('#delPal', m);
      if (dp) dp.onclick = () => { if (confirm('Delete this palace?')) { LQ.state.palace.custom = LQ.state.palace.custom.filter(x => x.id !== pal.id); LQ.save(); LQ.closeModal(); location.hash = '#/palace'; } };
    }
    render();
  }

  /* ---------- past papers ---------- */
  LQ.views.papers = function papers(p) {
    if (p.practice) return `<div class="page" id="practiceRoot"></div>`;
    const sel = p.subject || LQ.defaultSubject();
    const s = D.subjects[sel];
    if (!s) return `<div class="page"><h1>📝 Past papers</h1>${LQ.noCourses()}<div class="empty">No past papers yet. A course pack can add a question bank with model outlines and a self-marking rubric.</div></div>`;
    const meta = (D.papers || []).filter(x => x.subject === sel);
    const qs = (D.pastQuestions || []).filter(q => q.subject === sel && (!p.mid || q.midterm));
    const hasMidterm = (D.pastQuestions || []).some(q => q.subject === sel && q.midterm);
    return `<div class="page"><h1>📝 Past papers</h1>
      <p class="muted">Questions set under older law are kept, with the current section numbers shown. Anything outside the syllabus is flagged so it can't eat your time.</p>
      <div class="pill-nav">${Object.values(D.subjects).map(x => `<button class="${sel === x.id ? 'active' : ''}" data-go="#/papers?subject=${x.id}">${x.icon} ${esc(x.short)}</button>`).join('')}</div>
      <div class="grid" style="grid-template-columns:330px minmax(0,1fr);gap:18px">
        <div class="card tight"><h3>📂 Papers in your folder</h3><div id="paperList" class="list"><div class="muted">Loading…</div></div>
          ${meta.length ? `<hr><h3>Pattern</h3><div class="prose" style="font-size:.9em">${LQ.md(s && s.paperPattern || '')}</div>` : ''}</div>
        <div><div class="row between"><h2 style="margin:0">Question bank (${qs.length})</h2>${hasMidterm ? `<button class="btn small ${p.mid ? 'primary' : ''}" data-go="#/papers?subject=${sel}${p.mid ? '' : '&mid=1'}">${p.mid ? '✓ ' : ''}Midterm syllabus only</button>` : ''}</div>
          ${qs.length ? `<div class="list" style="margin-top:12px">${qs.map(q => `<div class="item"><span class="grow"><small class="muted">${esc(q.paper)} · ${q.marks} marks ${q.midterm ? '· <span class="chip t1">midterm</span>' : ''} ${q.oldLaw ? '· <span class="chip">older law</span>' : ''} ${q.offSyllabus ? '· <span class="chip no">outside the syllabus</span>' : ''}</small><br>${esc((q.short || q.text.replace(/\*\*/g, '').replace(/\n+/g, ' ')).slice(0, 240))}…</span><button class="btn small primary" data-go="#/papers?practice=${q.id}">Answer</button></div>`).join('')}</div>`
            : `<div class="empty">The ${esc(s ? s.short : '')} question bank is built with its study pack. The papers themselves are listed on the left — open one and practise under a timer.</div>`}
        </div>
      </div></div>`;
  };

  LQ.after.papers = async function (p) {
    if (p.practice) return practice(p.practice);
    const sel = p.subject || LQ.defaultSubject();
    const s = D.subjects[sel];
    if (!s) return;
    const box = $('#paperList');
    let files = [];
    if (window.lq && s) files = await window.lq.list(s.folder + '/Past Papers');
    else files = (D.papers || []).filter(x => x.subject === sel).map(x => x.file.split('/').pop());
    const meta = (D.papers || []).filter(x => x.subject === sel);
    files.sort().reverse();
    box.innerHTML = files.length ? files.map(f => {
      const m = meta.find(x => x.file.endsWith(f)) || {};
      return `<div class="item"><span class="grow"><strong>${esc(f.replace('.pdf', ''))}</strong><br><small class="muted">${esc(m.note || '')}</small></span><button class="btn small" data-open="${esc(s.folder + '/Past Papers/' + f)}">Open</button></div>`;
    }).join('') : '<div class="muted">No papers found in this subject\'s Past Papers folder.</div>';
  };

  const RUBRIC = [
    ['issues', 'Spotted every issue the facts raise'],
    ['law', 'Stated the rule with the correct statutory section'],
    ['cases', 'Used the right cases, with what they held'],
    ['apply', 'Applied the law to these specific facts (not generic)'],
    ['critique', 'Added critical analysis or a counter-argument'],
    ['structure', 'Clear structure (IRAC) and a definite conclusion']
  ];
  LQ.RUBRIC = RUBRIC;
  // A subject can swap in its own rubric, answer hint and pace (e.g. a numerical paper).
  const rubricFor = sid => (D.subjects[sid] || {}).rubric || RUBRIC;
  const hintFor = sid => (D.subjects[sid] || {}).answerHint || 'Structure: **Issue** → **Rule** (section + leading case) → **Application** to these facts → **Conclusion**. One issue per paragraph.';

  function practice(qid) {
    const q = (D.pastQuestions || []).find(x => x.id === qid);
    const root = $('#practiceRoot');
    if (!q) { root.innerHTML = '<div class="empty">Question not found.</div>'; return; }
    const RUBRIC = rubricFor(q.subject);
    const mins = q.minutes || Math.round(q.marks * ((D.subjects[q.subject] || {}).minutesPerMark || 1.8));
    const prev = LQ.state.practice[qid];
    // An answer in progress is kept as a draft, so leaving the page never loses it.
    const drafts = LQ.state.drafts = LQ.state.drafts || {};
    const startText = drafts[qid] != null ? drafts[qid] : prev ? prev.answer : '';
    root.innerHTML = `<a href="#/papers?subject=${q.subject}" class="muted">← Past papers</a>
      <h1>📝 ${esc(q.paper)} · ${q.marks} marks</h1>
      ${q.oldLaw ? `<div class="callout warn">This was set under <strong>older law</strong>. Answer with the current section numbers: ${esc(q.mapNote || 'see Bare Acts')}.</div>` : ''}
      ${q.offSyllabus ? `<div class="callout warn">${esc(q.offSyllabus)}</div>` : ''}
      <div class="card prose">${LQ.md(q.text)}</div>
      <div class="row" style="margin:14px 0">${q.file ? `<button class="btn small" data-open="${esc(q.file)}">📄 Open the original paper</button>` : ''}<span class="chip">Suggested time: ${mins} min</span><button class="btn primary" id="startQ">▶ Start timer</button><span id="qClock" class="stat" style="font-size:1.3em"></span></div>
      <div class="callout tip">${LQ.md(hintFor(q.subject)).replace(/^<p>|<\/p>$/g, '')}</div>
      <div class="answer-box"><textarea id="ans" placeholder="Write your answer here…">${esc(startText)}</textarea></div>
      <div class="row between" style="margin-top:8px"><span class="wordcount" id="ansCount">${wordCount(startText)} words${drafts[qid] != null ? ' · draft kept' : ''}</span><button class="btn primary" id="submitQ">Submit & see the model outline</button></div>
      <div id="outline"></div>`;
    let end = 0, h = null;
    const ans = $('#ans', root);
    ans.oninput = () => { $('#ansCount', root).textContent = wordCount(ans.value) + ' words · draft kept'; drafts[qid] = ans.value; LQ.save(); };
    $('#startQ', root).onclick = () => {
      end = Date.now() + mins * 60000;
      clearInterval(h);
      h = setInterval(() => { const left = end - Date.now(); const c = $('#qClock'); if (!c) return clearInterval(h); c.textContent = left > 0 ? LQ.fmtClock(left) : '⏰ Time!'; if (left <= 0) { clearInterval(h); LQ.sound('break'); } }, 500);
      ans.focus();
    };
    $('#submitQ', root).onclick = () => {
      clearInterval(h);
      $('#outline', root).innerHTML = `<div class="card" style="margin-top:16px"><h2>🧭 Model answer outline</h2><div class="prose">${LQ.md(q.outline || 'No outline yet for this question.')}</div></div>
        <div class="card rubric" style="margin-top:12px"><h2>Grade yourself honestly</h2>${RUBRIC.map(([k, l]) => `<label><input type="checkbox" data-rub="${k}"> ${esc(l)}</label>`).join('')}
        <div class="row" style="margin-top:10px"><button class="btn primary" id="saveGrade">Save</button><span class="muted" id="gradeNote"></span></div></div>`;
      $('#saveGrade', root).onclick = () => {
        const score = $$('[data-rub]', root).filter(x => x.checked).length;
        const first = !LQ.state.practice[qid];
        LQ.state.practice[qid] = { answer: ans.value, score, of: RUBRIC.length, date: Date.now() };
        delete drafts[qid];
        if (first) { LQ.questProgress('answer', 1); LQ.addXP(20 + score * 5, 'Exam answer written'); }
        LQ.save();
        $('#gradeNote', root).textContent = `${score}/${RUBRIC.length} — ${score >= 5 ? 'Top-grade shape. 👏' : score >= 3 ? 'Good base; the unticked boxes are your next marks.' : 'Use the outline to rewrite it once — rewriting is where answers improve.'}`;
      };
    };
  }

  /* ---------- mock exam ---------- */
  LQ.views.mock = function mock(p) {
    if (p.run) return `<div class="page" id="mockRoot"></div>`;
    const past = LQ.state.mocks.slice().reverse();
    const ready = Object.values(D.subjects).filter(s => (D.pastQuestions || []).some(q => q.subject === s.id));
    const open = LQ.state.mockRun && D.subjects[LQ.state.mockRun.subject] ? LQ.state.mockRun : null;
    const left = open ? open.end - Date.now() : 0;
    return `<div class="page"><h1>⏱️ Mock exam</h1>
      <p class="muted">A "boss battle": a fact-pattern question plus short questions drawn from real past papers, under a timer, then marked against the model outlines.</p>
      ${open ? `<div class="callout tip">You have an unfinished ${esc(D.subjects[open.subject].short)} mock (${left > 0 ? `${LQ.fmtClock(left)} left` : 'time is up; you can still submit it'}). Your answers were kept.
        <div class="row" style="margin-top:8px"><button class="btn primary small" data-go="#/mock?run=1&resume=1">Resume it</button><button class="btn small" id="mDropRun">Abandon it</button></div></div>` : ''}
      ${ready.length ? `<div class="card"><div class="grid g3">
        <label class="field"><span>Subject</span><select id="mSubj">${ready.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Scope</span><select id="mScope"><option value="mid">Midterm topics only</option><option value="all">Whole course</option></select></label>
        <label class="field"><span>Duration</span><select id="mDur"><option value="60">60 minutes</option><option value="90" selected>90 minutes</option><option value="180">3 hours (end-term)</option></select></label>
      </div><button class="btn primary" id="mGo">⚔️ Start the mock</button></div>` : `${LQ.noCourses()}<div class="empty">A mock draws on a course's question bank, so it needs a course pack with past questions.</div>`}
      ${past.length ? `<div class="section-title"><h2>Past mocks</h2></div><div class="list">${past.map(m => `<div class="item"><span>🏆</span><span class="grow"><strong>${esc(D.subjects[m.subject] ? D.subjects[m.subject].short : m.subject)}</strong> · ${new Date(m.date).toLocaleString('en-IN')}<br><small class="muted">${m.score}/${m.of} rubric points · ${m.words} words</small></span></div>`).join('')}</div>` : ''}
    </div>`;
  };
  LQ.after.mock = function (p) {
    if (p.run) return runMock(p);
    const go = $('#mGo');
    if (go) go.onclick = () => {
      if (LQ.state.mockRun && !confirm('Start a new mock? The unfinished one will be abandoned.')) return;
      LQ.state.mockRun = null;
      location.hash = `#/mock?run=1&subject=${$('#mSubj').value}&scope=${$('#mScope').value}&dur=${$('#mDur').value}`;
    };
    const drop = $('#mDropRun');
    if (drop) drop.onclick = () => { if (!confirm('Abandon the unfinished mock and its answers?')) return; LQ.state.mockRun = null; LQ.save(); LQ.rerender(); };
  };
  function runMock(p) {
    const root = $('#mockRoot');
    // A mock in progress (its questions, deadline and answers) is kept in the profile, so leaving the
    // page or closing the app doesn't lose it; "Resume" on the Mock page brings it back.
    let run = p.resume && LQ.state.mockRun && D.subjects[LQ.state.mockRun.subject] ? LQ.state.mockRun : null;
    let paper;
    if (run) paper = run.qs.map(id => (D.pastQuestions || []).find(q => q.id === id)).filter(Boolean);
    else {
      if (!D.subjects[p.subject]) { root.innerHTML = '<div class="empty">Choose a subject on the Mock page.</div>'; return; }
      const all = (D.pastQuestions || []).filter(q => q.subject === p.subject && !q.offSyllabus);
      const mid = all.filter(q => q.midterm);
      const pool = p.scope === 'mid' && mid.length ? mid : all;
      // A subject can declare its real paper shape per duration: [[marks, how many], ...].
      const pattern = ((D.subjects[p.subject] || {}).mockPattern || {})[p.dur];
      if (pattern) paper = pattern.flatMap(([m, k]) => shuffle(pool.filter(q => q.marks === m)).slice(0, k));
      else {
        const bigs = shuffle(pool.filter(q => q.marks >= 10));
        const smalls = shuffle(pool.filter(q => q.marks < 10));
        // Subjects with few short questions get more long ones instead.
        const nSmall = Math.min(smalls.length, +p.dur >= 180 ? 4 : 2);
        const nBig = +p.dur >= 180 ? Math.max(1, 4 - nSmall) : +p.dur >= 90 ? (nSmall >= 2 ? 1 : 2) : 1;
        paper = bigs.slice(0, nBig).concat(smalls.slice(0, nSmall));
      }
      if (paper.length) {
        run = LQ.state.mockRun = { subject: p.subject, dur: +p.dur, qs: paper.map(q => q.id), end: Date.now() + (+p.dur) * 60000, answers: {} };
        LQ.save(true);
        // From here on this page is the saved mock, so a re-render resumes it instead of drawing a new paper.
        history.replaceState(null, '', '#/mock?run=1&resume=1');
      }
    }
    if (!paper.length) { root.innerHTML = '<div class="empty">Not enough questions in the bank for this subject yet.</div>'; return; }
    const subject = run.subject;
    const RUBRIC = rubricFor(subject);
    const placeholder = (D.subjects[subject] || {}).answerPlaceholder || 'Issue → Rule → Application → Conclusion';
    const end = run.end;
    root.innerHTML = `<div class="row between"><h1>⚔️ Mock — ${esc(D.subjects[subject].short)}</h1><span class="stat" id="mClock"></span></div>
      <p class="muted">Answer every question below. Your answers are saved as you type, so you can leave and resume from the Mock page. Press Submit when time is up (or earlier).</p>
      ${paper.map((q, i) => `<div class="card" style="margin-bottom:14px"><h3>Q${i + 1} · ${q.marks} marks <small class="muted">(${esc(q.paper)})</small></h3><div class="prose">${LQ.md(q.text)}</div><textarea data-mq="${q.id}" style="min-height:${q.marks >= 10 ? 320 : 160}px" placeholder="${esc(placeholder)}">${esc(run.answers[q.id] || '')}</textarea></div>`).join('')}
      <button class="btn primary" id="mSubmit">Submit paper</button><div id="mResult"></div>`;
    $$('[data-mq]', root).forEach(t => t.oninput = () => { run.answers[t.dataset.mq] = t.value; LQ.save(); });
    const h = setInterval(() => { const c = $('#mClock'); if (!c) return clearInterval(h); const left = end - Date.now(); c.textContent = left > 0 ? LQ.fmtClock(left) : '⏰ Time — finish your sentence'; if (left <= 0 && !c.dataset.rang) { c.dataset.rang = 1; LQ.sound('break'); } }, 500);
    $('#mSubmit').onclick = () => {
      clearInterval(h);
      $('#mResult').innerHTML = paper.map((q, i) => `<div class="card" style="margin-top:14px"><h3>Q${i + 1} model outline</h3><div class="prose">${LQ.md(q.outline || '')}</div><div class="rubric">${RUBRIC.map(([k, l]) => `<label><input type="checkbox" data-mr="${q.id}"> ${esc(l)}</label>`).join('')}</div></div>`).join('') + `<button class="btn primary" id="mSave" style="margin-top:12px">Save my score</button>`;
      $('#mSave').onclick = e => {
        e.currentTarget.disabled = true;
        const score = $$('[data-mr]').filter(x => x.checked).length;
        const words = $$('[data-mq]').reduce((a, t) => a + wordCount(t.value), 0);
        LQ.state.mocks.push({ subject, date: Date.now(), score, of: paper.length * RUBRIC.length, words, qs: paper.map(q => q.id) });
        LQ.state.mockRun = null;
        LQ.day().mocks += 1;
        LQ.addXP(60 + score * 4, 'Mock exam conquered ⚔️');
        LQ.celebrate(); LQ.save();
        location.hash = '#/mock';
      };
      // The page scrolls inside #main, not the window.
      $('#mResult').scrollIntoView({ behavior: LQ.state.settings.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };
  }
})();
