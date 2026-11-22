// The Videos page: study and revision videos per subject (listed by a content pack in D.videos), with a
// player that remembers where you stopped, a speed control, chapters you can jump to, and a watched tick.
// D.videos = { <subjectId>: [{ title, url, group?, topic?, chapters?: [{ t: seconds, label }] }] }
// Progress is in state.videos: { speed, pos: { url: seconds }, done: { url: true }, last: { sid: index } }.
'use strict';
(function () {
  const D = window.LQ_DATA;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};
  const { esc, $, $$ } = LQ.h;

  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  const store = () => {
    const s = (LQ.state.videos = LQ.state.videos || {});
    s.pos = s.pos || {}; s.done = s.done || {}; s.last = s.last || {}; s.speed = SPEEDS.includes(s.speed) ? s.speed : 1;
    return s;
  };
  const save = () => { try { LQ.save(); } catch (e) { /* not signed in */ } };
  const listFor = sid => ((D.videos || {})[sid] || []).filter(v => v && v.url);
  const subjectsWithVideos = () => Object.values(D.subjects).filter(s => listFor(s.id).length);
  const fmt = sec => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const setCrumb = t => setTimeout(() => { const c = $('#crumb'); if (c) c.textContent = t; }, 0);

  const STYLE = `<style>
    .vid-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
    .vid-card{border:2px solid var(--line);border-radius:14px;background:var(--panel);padding:14px 16px;cursor:pointer;text-align:left;color:var(--text);font:inherit;display:flex;flex-direction:column;gap:6px}
    .vid-card:hover{border-color:var(--accent)}
    .vid-card .t{font-weight:700;font-size:1.05em;line-height:1.3}
    .vid-card .m{color:var(--muted);font-size:.88em}
    .vid-bar{height:6px;border-radius:6px;background:var(--panel2);overflow:hidden}.vid-bar i{display:block;height:100%;background:var(--accent)}
    .vid-wrap{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}
    .vid-wrap video{width:100%;border-radius:12px;background:#000;max-height:72vh}
    .vid-ch{max-height:72vh;overflow:auto;border:2px solid var(--line);border-radius:12px;background:var(--panel)}
    .vid-ch button{display:flex;gap:10px;width:100%;text-align:left;padding:8px 12px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);font:inherit;cursor:pointer}
    .vid-ch button:hover{background:var(--panel2)} .vid-ch button.on{background:color-mix(in srgb,var(--accent) 22%,transparent);font-weight:700}
    .vid-ch .tc{font-family:Consolas,monospace;color:var(--muted);min-width:52px}
    .vid-h{margin:18px 0 8px}
    @media (max-width:980px){.vid-wrap{grid-template-columns:1fr}}
  </style>`;

  function subjectPills(sid, subs) {
    return `<div class="pill-nav" style="margin:0">${subs.map(s => `<button data-go="#/videos?subject=${esc(s.id)}" class="${s.id === sid ? 'active' : ''}">${esc(s.icon || '')} ${esc(s.short || s.name)}</button>`).join('')}</div>`;
  }

  LQ.views.videos = function videos(params) {
    const subs = subjectsWithVideos(), st = store();
    if (!subs.length) return `<div class="page">${STYLE}<h1>🎬 Videos</h1><div class="card"><p>No videos yet. A content pack can list them in <code>LQ_DATA.videos</code> (one list per subject).</p></div></div>`;
    const sid = listFor(params.subject).length ? params.subject : (listFor(st.lastSubject).length ? st.lastSubject : subs[0].id);
    st.lastSubject = sid;
    const list = listFor(sid), S = D.subjects[sid];
    const vi = params.v != null && list[+params.v] ? +params.v : null;
    if (vi == null) {
      const groups = [];
      list.forEach((v, i) => { const g = v.group || 'Videos'; let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, items: [] }); G.items.push({ v, i }); });
      const watched = list.filter(v => st.done[v.url]).length;
      return `<div class="page" style="max-width:1180px">${STYLE}
        <div class="row between" style="flex-wrap:wrap;gap:10px"><h1 style="margin:0">🎬 Videos</h1>${subjectPills(sid, subs)}</div>
        <p class="muted">${esc(S.name)} · ${list.length} videos · ${watched} watched. Videos remember where you stopped; pick a speed in the player.</p>
        ${groups.map(G => `<h2 class="vid-h">${esc(G.g)}</h2><div class="vid-grid">${G.items.map(({ v, i }) => {
          const ch = (v.chapters || []), last = ch.length ? ch[ch.length - 1].t : 0, pos = st.pos[v.url] || 0;
          const pct = st.done[v.url] ? 100 : (v.duration ? Math.min(100, Math.round(pos / v.duration * 100)) : (pos ? 5 : 0));
          return `<button class="vid-card" data-go="#/videos?subject=${esc(sid)}&v=${i}"><span class="t">${st.done[v.url] ? '✅ ' : '▶ '}${esc(v.title)}</span>
            <span class="m">${v.duration ? fmt(v.duration) + ' · ' : ''}${ch.length ? ch.length + ' chapters' : ''}${pos && !st.done[v.url] ? ` · stopped at ${fmt(pos)}` : ''}${!v.duration && last ? '' : ''}</span>
            <span class="vid-bar"><i style="width:${pct}%"></i></span></button>`;
        }).join('')}</div>`).join('')}</div>`;
    }
    const v = list[vi], ch = v.chapters || [];
    return `<div class="page" id="vidRoot" data-sid="${esc(sid)}" data-v="${vi}" style="max-width:1400px">${STYLE}
      <div class="row between" style="flex-wrap:wrap;gap:10px"><h1 style="margin:0;font-size:1.5em">🎬 ${esc(v.title)}</h1>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-go="#/videos?subject=${esc(sid)}">← All ${esc(S.short || S.name)} videos</button>
          ${vi > 0 ? `<button class="btn" data-go="#/videos?subject=${esc(sid)}&v=${vi - 1}">⏮ Previous</button>` : ''}
          ${vi < list.length - 1 ? `<button class="btn" data-go="#/videos?subject=${esc(sid)}&v=${vi + 1}">Next ⏭</button>` : ''}</div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:10px 0"><span class="muted">Speed</span><div class="pill-nav" style="margin:0">${SPEEDS.map(x => `<button data-vid-speed="${x}" class="${x === st.speed ? 'active' : ''}">${x}×</button>`).join('')}</div>
        <label class="row" style="gap:6px;margin-left:auto"><input type="checkbox" id="vidDone" ${st.done[v.url] ? 'checked' : ''}> Watched</label></div>
      <div class="vid-wrap"><div><video id="vidEl" controls preload="metadata" src="${esc(v.url)}"></video>
        <p class="muted" style="margin-top:6px">Space plays or pauses · ← → jump 10 s · [ ] change speed · picks up where you left off.</p></div>
        ${ch.length ? `<div class="vid-ch" id="vidCh">${ch.map((c, k) => `<button data-vid-t="${c.t}" data-k="${k}"><span class="tc">${fmt(c.t)}</span><span>${esc(c.label)}</span></button>`).join('')}</div>` : ''}</div></div>`;
  };

  LQ.after.videos = function () {
    const root = $('#vidRoot');
    setCrumb('Videos');
    if (!root) return;
    const st = store(), sid = root.dataset.sid, vi = +root.dataset.v, v = listFor(sid)[vi], el = $('#vidEl');
    st.last[sid] = vi; save();
    el.playbackRate = st.speed;
    el.addEventListener('loadedmetadata', () => {
      const p = st.pos[v.url] || 0;
      if (p > 5 && p < el.duration - 10) el.currentTime = p;
      el.playbackRate = st.speed;
      if (!v.duration && isFinite(el.duration)) v.duration = el.duration;
    }, { once: true });
    let lastSave = 0;
    const chs = $$('#vidCh button');
    const mark = () => { let k = -1; chs.forEach((b, i) => { if (+b.dataset.vidT <= el.currentTime + 0.5) k = i; }); chs.forEach((b, i) => b.classList.toggle('on', i === k)); };
    el.addEventListener('timeupdate', () => {
      mark();
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); st.pos[v.url] = el.currentTime; if (el.duration && el.currentTime / el.duration > 0.92 && !st.done[v.url]) { st.done[v.url] = true; const d = $('#vidDone'); if (d) d.checked = true; } save(); }
    });
    el.addEventListener('pause', () => { st.pos[v.url] = el.currentTime; save(); });
    el.addEventListener('ended', () => { st.pos[v.url] = 0; st.done[v.url] = true; const d = $('#vidDone'); if (d) d.checked = true; save(); });
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-vid-t]'); if (t) { el.currentTime = +t.dataset.vidT; el.play(); return; }
      const s = e.target.closest('[data-vid-speed]');
      if (s) { st.speed = +s.dataset.vidSpeed; el.playbackRate = st.speed; $$('[data-vid-speed]').forEach(b => b.classList.toggle('active', b === s)); save(); }
    });
    $('#vidDone').onchange = e => { if (e.target.checked) st.done[v.url] = true; else delete st.done[v.url]; save(); };
    const keys = e => {
      if (/input|textarea|select/i.test((e.target.tagName || '')) && e.target !== el) return;
      if (e.key === ' ' && e.target !== el) { e.preventDefault(); el.paused ? el.play() : el.pause(); }
      else if (e.key === 'ArrowRight' && e.target !== el) { e.preventDefault(); el.currentTime = Math.min(el.duration || 1e9, el.currentTime + 10); }
      else if (e.key === 'ArrowLeft' && e.target !== el) { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 10); }
      else if (e.key === ']' || e.key === '[') {
        const i = SPEEDS.indexOf(st.speed), n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ']' ? 1 : -1)))];
        st.speed = n; el.playbackRate = n; $$('[data-vid-speed]').forEach(b => b.classList.toggle('active', +b.dataset.vidSpeed === n)); save();
      }
    };
    LQ.unmountKeys(); LQ._keys = keys; document.addEventListener('keydown', keys);
  };
})();
