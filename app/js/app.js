// Router, global click handling, keyboard shortcuts and first-run setup.
'use strict';
(function () {
  const { $, $$, esc, todayKey, fmtDate } = LQ.h;
  const D = window.LQ_DATA;
  const CRUMBS = { home: 'Today', subjects: 'Subjects', semesters: 'Semesters', subject: 'Subject', topic: 'Topic', review: 'Flashcards', palace: 'Memory palace', papers: 'Past papers', mock: 'Mock exam', timetable: 'Timetable', notes: 'My notes', statute: 'Bare acts', guide: 'Memory guide', trophies: 'Trophies', settings: 'Settings', builder: 'Course builder' };

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = (path || 'home').split('/').filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const name = parts[0] || 'home';
    if (name === 'subject') params.id = parts[1];
    if (name === 'topic') { params.sid = parts[1]; params.tid = parts[2]; }
    return { name, params };
  }

  let current = null;
  function render() {
    current = parse();
    const view = LQ.views[current.name] || LQ.views.home;
    LQ.unmountKeys();
    const main = $('#main');
    try {
      main.innerHTML = view(current.params);
      if (LQ.after[current.name]) LQ.after[current.name](current.params);
    } catch (err) {
      console.error(err);
      main.innerHTML = `<div class="page empty"><h2>Something broke on this page</h2><p>${esc(err.message)}</p><a href="#/home">Back to Today</a></div>`;
    }
    const navName = current.name === 'subject' || current.name === 'topic' ? 'subjects' : current.name;
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.route === navName));
    let crumb = CRUMBS[current.name] || '';
    if (current.name === 'subject' && D.subjects[current.params.id]) crumb = D.subjects[current.params.id].name;
    if (current.name === 'topic') { const f = LQ.findTopic(current.params.sid, current.params.tid); if (f) crumb = `${f.s.short} › ${f.t.title}`; }
    $('#crumb').textContent = crumb;
    main.scrollTop = 0;
    LQ.renderTopbar();
    LQ.renderChrome();
    LQ.save();
  }

  // Sidebar: the active semester at the top, the signed-in profile at the bottom.
  let appInfo = null;
  LQ.renderChrome = function renderChrome() {
    const n = D.activeSemester, info = (D.semesterInfo || {})[n] || {};
    $('#semChip').innerHTML = `<span>🎓 Semester ${n}</span><small>${esc(info.term || '')}</small>`;
    const u = LQ.user;
    $('#sidebarFoot').innerHTML = (LQ.updateInfo ? `<button class="btn small primary" data-go="#/settings" style="width:100%;margin-bottom:8px">⬆ Update to ${esc(LQ.updateInfo.latest)}</button>` : '')
      + (u ? `<div class="profile-chip">${LQ.avatar(u, 30)}<span class="grow"><strong>${esc(u.name)}</strong></span><button class="btn small ghost" id="switchProfile" title="Switch profile">Switch</button></div>` : '')
      + (appInfo ? `<div>v${esc(appInfo.version)} · saved locally</div>` : '<div>Preview mode (browser)</div>');
    const sw = $('#switchProfile');
    if (sw) sw.onclick = () => LQ.switchProfile();
  };
  LQ.rerender = () => { const top = $('#main').scrollTop; render(); $('#main').scrollTop = top; };

  // Suggest what to study next: the first open block on today's plan.
  LQ.nextUp = function () {
    const plan = LQ.plan().days[todayKey()];
    if (!plan) return null;
    const it = plan.items.find(i => i.state === 'open') || plan.extra.find(p => !p.done);
    return it ? `${D.subjects[it.subject] ? D.subjects[it.subject].short + ': ' : ''}${it.text}` : null;
  };

  /* ---------- last-hour cheatsheets: on screen and as PDF ---------- */
  const withSheets = () => Object.values(D.subjects).filter(s => s.lastHour);

  // A printable page: always black on white whatever the app's theme, one subject per page.
  function sheetDocument(subjects) {
    const today = todayKey();
    const sections = subjects.map(s => {
      const heading = (s.lastHour.match(/^### (.+)$/m) || [])[1] || s.name;
      const exams = (D.exams || []).filter(e => e.subject === s.id && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      return `<section><header><b>${esc(heading)}</b><span>${exams.map(e => `${esc(e.title)}: ${esc(fmtDate(e.date))}`).join('<br>')}</span></header>
        ${LQ.md(s.lastHour.replace(/^### .+\n?/m, ''))}</section>`;
    }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(subjects.length === 1 ? subjects[0].name : `Semester ${D.activeSemester}`)} — last-hour cheatsheet</title><style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; font: 10.5pt/1.42 "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
      section { break-after: page; } section:last-child { break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: baseline; gap: 16pt; border-bottom: 1.5pt solid #111; padding-bottom: 4pt; margin-bottom: 9pt; }
      header b { font-size: 15pt; } header span { font-size: 8.5pt; color: #444; text-align: right; white-space: nowrap; }
      h2, h3 { font-size: 11.5pt; margin: 9pt 0 4pt; break-after: avoid; }
      p { margin: 0 0 6pt; } ul, ol { margin: 0 0 7pt; padding-left: 14pt; } li { margin-bottom: 5pt; break-inside: avoid; }
      .callout { border: 1pt solid #999; border-left: 3pt solid #111; border-radius: 3pt; padding: 5pt 8pt; margin-top: 9pt; background: #f3f3f3; break-inside: avoid; }
      code { font-family: Consolas, monospace; font-size: 9.5pt; }
      table { border-collapse: collapse; margin: 0 0 7pt; } th, td { border: .75pt solid #999; padding: 2pt 5pt; text-align: left; }
    </style></head><body>${sections}</body></html>`;
  }

  LQ.exportSheets = async function exportSheets(subjects, btn) {
    if (!window.lq) return LQ.toast('PDF export works in the desktop app.');
    if (!subjects.length) return LQ.toast('No cheatsheets to export yet.');
    const name = subjects.length === 1 ? `${subjects[0].short} - last-hour cheatsheet.pdf` : `Semester ${D.activeSemester} - last-hour cheatsheets.pdf`;
    if (btn) btn.disabled = true;
    const res = await window.lq.exportPdf(sheetDocument(subjects), name);
    if (btn) btn.disabled = false;
    if (res) LQ.toast(res.ok ? `Saved to ${res.path}` : res.error);
  };

  // Opens one subject's sheet, or the sheet for the next exam if none is named.
  LQ.showSheet = function showSheet(subjectId) {
    const today = todayKey();
    const next = (D.exams || []).filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const s = D.subjects[subjectId] || (next && D.subjects[next.subject]) || withSheets()[0];
    const label = !subjectId && next ? next.title : s ? s.name : '';
    const m = LQ.modal(`<h2>🚨 Last-hour sheet — ${esc(label)}</h2>
      ${s && s.lastHour ? `<div class="prose">${LQ.md(s.lastHour)}</div>` : '<p>No sheet for this subject yet. Cram its cards and walk the palace.</p>'}
      <div class="row"><button class="btn primary" data-go="#/review?subject=${s ? s.id : ''}&cram=1">Cram its cards</button>
        ${s && s.lastHour ? '<button class="btn" id="pdfOne">📄 Save as PDF</button><button class="btn" id="pdfAll">📚 All subjects as one PDF</button>' : ''}
        <button class="btn" id="closeM">Close</button></div>`, { wide: true });
    $('#closeM', m).onclick = () => LQ.closeModal();
    if (s && s.lastHour) {
      $('#pdfOne', m).onclick = e => LQ.exportSheets([s], e.currentTarget);
      $('#pdfAll', m).onclick = e => LQ.exportSheets(withSheets(), e.currentTarget);
    }
  };

  // One delegated handler for every link-like element in the app.
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); LQ.closeModal(); location.hash = go.dataset.go; return; }
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); LQ.openFile(open.dataset.open); return; }
    const sec = e.target.closest('[data-sec]');
    if (sec) { e.preventDefault(); LQ.showSection(sec.dataset.sec); return; }
    const cs = e.target.closest('[data-case]');
    if (cs) { e.preventDefault(); LQ.showCase(cs.dataset.case); return; }
    const sheet = e.target.closest('[data-sheet]');
    if (sheet) { e.preventDefault(); LQ.showSheet(sheet.dataset.sheet); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'sprint') LQ.promptSprint();
      if (a === 'panic') LQ.showSheet();
      if (a === 'sheets-pdf') LQ.exportSheets(withSheets(), act);
      if (a === 'park') LQ.parkThought();
    }
    if (e.target.closest('#openContent')) {
      if (window.lq) window.lq.openContentFolder(); else LQ.toast('Desktop app only');
      return;
    }
    const nav = e.target.closest('#nav button');
    if (nav) location.hash = '#/' + nav.dataset.route;
  });

  document.addEventListener('keydown', e => {
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); LQ.parkThought(); return; }
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); LQ.openSearch(); return; }
    if (e.key === 'Escape' && $('#modalRoot').innerHTML) { LQ.closeModal(); return; }
    if (typing || $('#modalRoot').innerHTML) return;
    if (e.key === '/' && !LQ._keys) { e.preventDefault(); LQ.openSearch(); return; }
    if (e.key === 'f' || e.key === 'F') $('#app').classList.toggle('focus');
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) { const next = $('#stepNext'); if (next) next.click(); }
  });

  $('#toggleSidebar').onclick = () => $('#app').classList.toggle('focus');
  $('#parkingBtn').onclick = () => LQ.parkThought();
  $('#searchBtn').onclick = () => LQ.openSearch();
  window.addEventListener('hashchange', render);

  function onboarding() {
    const m = LQ.modal(`<h2>⚖️ Welcome to LexQuest</h2>
      <p>This app is built around your courses and your exam dates. It's designed for a weak memory and a short attention span, so everything happens in <strong>short sprints</strong>, with <strong>spaced flashcards</strong>, a <strong>memory palace</strong> and <strong>notes you must write yourself</strong>.</p>
      <label class="field"><span>What should I call you?</span><input type="text" id="obName" placeholder="Your first name"></label>
      <label class="field"><span>Pick a starting theme (you can change it any time)</span><select id="obTheme">${LQ.THEMES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <div class="callout tip">The loop: <strong>due cards → today's sprint topics → one palace walk → one timed answer</strong>. Start with <em>Today</em>.</div>
      <div class="row"><button class="btn primary" id="obGo">Let's go</button></div>`, { sticky: true });
    $('#obTheme', m).onchange = e => { LQ.state.settings.theme = e.target.value; LQ.applyAppearance(); };
    $('#obGo', m).onclick = () => {
      const name = $('#obName', m).value.trim();
      LQ.state.settings.name = name;
      if (name && LQ.user) LQ.store.users.rename(name).then(r => { if (r.ok) { LQ.user.name = name; LQ.renderChrome(); } });
      LQ.state.onboarded = true;
      LQ.save(true); LQ.closeModal(); render();
    };
  }

  // Check which readings exist so the subject pages can show green/red chips.
  LQ.checkSemesterFiles = () => LQ.checkFiles(Object.values(D.subjects).flatMap(s => s.units.flatMap(u => u.topics.flatMap(t => (t.readings || []).map(r => r.file)))).filter(Boolean));

  LQ.switchSemester = function switchSemester(n) {
    LQ.useSemester(n);
    LQ.save(true);
    LQ.checkSemesterFiles();
    location.hash = '#/home';
    LQ.rerender();
  };

  async function init() {
    let picker = false;
    try { picker = sessionStorage.getItem('lq-picker') === '1'; sessionStorage.removeItem('lq-picker'); } catch { /* preview only */ }
    LQ.user = await LQ.signIn({ picker });
    await LQ.load();
    // A profile made on the sign-in screen already has a name and theme, so it skips the welcome.
    if (LQ.user.isNew) {
      LQ.state.settings.name = LQ.user.name;
      LQ.state.settings.theme = LQ.user.theme || LQ.state.settings.theme;
      LQ.state.onboarded = true;
      delete LQ.user.isNew; delete LQ.user.theme;
    }
    LQ.useSemester(LQ.state.semester || D.degree.current);
    LQ.applyAppearance();
    LQ.quests();
    if (window.lq) appInfo = await window.lq.info();
    if (!location.hash) location.hash = '#/home';
    render();
    LQ.save(true);
    if (!LQ.state.onboarded) onboarding();
    LQ.checkSemesterFiles();
    LQ.autoCheckForUpdate();
    setInterval(() => LQ.renderTopbar(), 30000);
  }
  init();
})();
