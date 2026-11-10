// Search everything in the active semester: topics, cases, flashcards, bare-act sections and past
// questions. Ctrl+K (or /) opens it; arrow keys move, Enter opens the highlighted result.
'use strict';
(function () {
  const { $, $$, esc } = LQ.h;
  const D = window.LQ_DATA;
  const plain = s => String(s || '').replace(/\[\[[cs]:[\w./-]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[c:([\w-]+)\]\]/g, (_, id) => { const f = LQ.findCase(id); return f ? f.c.name : id; }).replace(/\[\[s:([\w./-]+)\]\]/g, '$1').replace(/[*`>#{}]/g, '').replace(/^!(tip|warn|exam)\s/gm, '');
  let index = null, indexedFor = null;

  function build() {
    const out = [];
    const add = (kind, icon, title, sub, body, go, weight) => out.push({ kind, icon, title, sub, hay: `${title} ${sub} ${body}`.toLowerCase(), titleL: String(title).toLowerCase(), go, weight });
    for (const s of Object.values(D.subjects)) {
      for (const u of s.units) for (const t of u.topics) add('Topic', '📖', t.title, `${s.short} · ${u.title}`, plain(`${t.subtitle || ''} ${t.gist || ''} ${(t.guide || '').slice(0, 6000)}`), `#/topic/${s.id}/${t.id}?step=learn`, 3);
      for (const [id, c] of Object.entries(s.cases || {})) add('Case', '⚖️', c.name, `${s.short}${c.cite ? ' · ' + c.cite : ''}`, plain(`${c.oneLine || ''} ${c.held || ''} ${c.facts || ''}`), { case: id }, 3);
      for (const c of s.cards || []) { const q = plain(c.front || c.text || ''); add('Card', '🃏', q.slice(0, 140), s.short, plain(c.back || ''), `#/review?subject=${s.id}&browse=1`, 1); }
    }
    for (const [act, secs] of Object.entries(D.actText || {})) {
      const name = ((D.acts || {})[act] || {}).name || act.toUpperCase();
      for (const [n, x] of Object.entries(secs || {})) add('Section', '📜', `${LQ.secLabel(act + '/' + n)} — ${x.title}`, name, String(x.text || '').slice(0, 1500), `#/statute?act=${act}&s=${n}`, 2);
    }
    for (const q of D.pastQuestions || []) add('Past question', '📝', (q.short || plain(q.text)).slice(0, 140), `${(D.subjects[q.subject] || {}).short || ''} · ${q.paper}`, plain(q.text), `#/papers?practice=${q.id}`, 2);
    return out;
  }

  // Every word must appear somewhere; title hits rank above body hits.
  function find(query) {
    if (indexedFor !== D.activeSemester || !index) { index = build(); indexedFor = D.activeSemester; }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const it of index) {
      if (!words.every(w => it.hay.includes(w))) continue;
      const inTitle = words.filter(w => it.titleL.includes(w)).length;
      hits.push({ it, score: inTitle * 10 + it.weight + (it.titleL.startsWith(words[0]) ? 5 : 0) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 40).map(h => h.it);
  }

  LQ.openSearch = function openSearch(initial = '') {
    const m = LQ.modal(`<h2>🔍 Search</h2><input type="search" id="sq" placeholder="A case, a section, a theorist, a word…" value="${esc(initial)}" autocomplete="off">
      <div id="sres" class="list" style="margin-top:12px;max-height:60vh;overflow-y:auto"></div>
      <p class="muted" style="margin:10px 0 0;font-size:.85em">↑ ↓ to move · Enter to open · Esc to close</p>`, { wide: true });
    let results = [], sel = 0;
    const open = r => { LQ.closeModal(); if (r.go.case) LQ.showCase(r.go.case); else location.hash = r.go; };
    const draw = () => {
      const q = $('#sq', m).value.trim();
      results = q.length >= 2 ? find(q) : [];
      sel = Math.min(sel, Math.max(0, results.length - 1));
      $('#sres', m).innerHTML = q.length < 2 ? '<div class="muted">Type at least two letters.</div>' : results.length
        ? results.map((r, i) => `<div class="item click ${i === sel ? 'active' : ''}" data-i="${i}" style="${i === sel ? 'border-color:var(--accent)' : ''}"><span>${r.icon}</span><span class="grow"><strong>${esc(r.title)}</strong><br><small class="muted">${esc(r.kind)} · ${esc(r.sub)}</small></span></div>`).join('')
        : '<div class="muted">Nothing found. Try fewer or different words.</div>';
      $$('[data-i]', m).forEach(el => el.onclick = () => open(results[+el.dataset.i]));
    };
    const box = $('#sq', m);
    box.oninput = () => { sel = 0; draw(); };
    box.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); open(results[sel]); }
    };
    draw();
    setTimeout(() => box.focus(), 30);
  };
  LQ.resetSearch = () => { index = null; };
})();
