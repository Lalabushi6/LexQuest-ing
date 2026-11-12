// The Calendar page: a month view of exams, the study plan, spaced-recall checks, your own events and,
// once connected, your Google calendars. Exports an .ics file, and keeps a "LexQuest" calendar in
// Google up to date (the Google side is in gcal.js; the logic both share is calendar.js).
'use strict';
(function () {
  const { $, $$, esc, todayKey, fmtDate, uid } = LQ.h;
  const D = window.LQ_DATA;
  const C = LQ.calendar;
  const DAY = 86400000;
  const api = () => (window.lq && window.lq.gcal) || null;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};

  const SEND = { exams: true, plan: true, recall: false, own: true };
  const KIND_LABEL = { exam: 'Exam', plan: 'Study plan', recall: 'Recall check', own: 'Your event', google: 'Google', class: 'Class', deadline: 'Deadline', study: 'Study', other: 'Event' };
  // The profile's calendar: its own events, what goes to Google, and which Google calendars to show.
  function calState() {
    const s = LQ.state.calendar = LQ.state.calendar || {};
    if (!Array.isArray(s.events)) s.events = [];
    s.send = { ...SEND, ...(s.send || {}) };
    if (!Array.isArray(s.show)) s.show = null; // null means the main Google calendar only
    return s;
  }

  // Spaced-recall checks still to come (and any due now), from when each topic was learnt.
  function recalls(today) {
    const R = LQ.retention;
    if (!R) return [];
    const info = {};
    for (const s of Object.values(D.subjects)) for (const u of s.units) for (const t of u.topics) info[t.id] = { title: t.title, subject: s.id };
    const dueNow = new Set(R.recallDue(LQ.state.topics || {}, LQ.state.recall || {}).map(d => `${d.id}:${d.checkpoint}`));
    const out = [];
    for (const [id, ts] of Object.entries(LQ.state.topics || {})) {
      const learnt = info[id] && ts && ts.steps && (ts.steps.learn || ts.steps.write);
      if (!learnt) continue;
      const log = (LQ.state.recall || {})[id] || [];
      for (const cp of R.CHECKPOINTS) {
        const at = learnt + cp * DAY;
        if (log.some(r => r.t >= at)) continue;
        const date = todayKey(new Date(at));
        if (date >= today) out.push({ topic: id, ...info[id], date, checkpoint: cp });
        else if (dueNow.has(`${id}:${cp}`)) out.push({ topic: id, ...info[id], date, checkpoint: cp, overdue: true });
      }
    }
    return out;
  }

  // Everything LexQuest puts on the calendar; `include` picks the kinds (all of them by default).
  LQ.calendarEvents = function calendarEvents(include = {}) {
    const today = todayKey();
    return C.collect({ exams: LQ.allExams ? LQ.allExams() : D.exams || [], plan: LQ.plan(), subjects: D.allSubjects || D.subjects, own: calState().events, recalls: recalls(today), today, include });
  };

  /* ---------- Google ---------- */
  const G = LQ.gcal = { status: null, calendars: null, cache: {}, busy: false, connecting: false };
  async function refreshStatus() { const a = api(); G.status = a ? await a.status() : null; return G.status; }
  const onCalendarPage = () => /^#\/calendar/.test(location.hash);
  function signedOut(r) {
    if (r && r.signedOut && G.status) { G.status.connected = false; G.status.signedOutAt = Date.now(); G.calendars = null; G.cache = {}; }
  }
  async function loadCalendars() {
    const r = await api().calendars();
    if (r.ok) G.calendars = r.calendars; else signedOut(r);
    return r;
  }
  const shown = () => { const s = calState(); return (G.calendars || []).filter(c => !c.lexquest && (s.show ? s.show.includes(c.id) : c.primary)); };
  // Events from the chosen Google calendars for a range, kept for five minutes.
  async function fetchRange(from, to) {
    const k = `${from}|${to}`, hit = G.cache[k];
    if (hit && (hit.loading || Date.now() - hit.at < 5 * 60000)) return null;
    G.cache[k] = { at: Date.now(), events: hit ? hit.events : [], loading: true };
    if (!G.calendars) { const r = await loadCalendars(); if (!r.ok) { G.cache[k] = { at: Date.now(), events: [], error: r.error }; return G.cache[k]; } }
    const cals = shown();
    const r = cals.length ? await api().events({ from, to, calendars: cals }) : { ok: true, events: [], errors: [] };
    if (!r.ok) signedOut(r);
    G.cache[k] = { at: Date.now(), events: r.ok ? r.events : [], error: r.ok ? (r.errors || [])[0] : r.error };
    return G.cache[k];
  }

  // Sends LexQuest's events to the LexQuest calendar in Google. Quiet when run in the background.
  LQ.syncGoogle = async function syncGoogle(quiet = false) {
    const a = api();
    if (!a || G.busy) return null;
    const st = G.status || await refreshStatus();
    if (!st || !st.connected) return null;
    G.busy = true; paintGoogle();
    let r;
    try { r = await a.sync({ events: LQ.calendarEvents(calState().send), today: todayKey() }); } catch (err) { r = { ok: false, error: err.message }; }
    G.busy = false;
    if (r.ok) {
      await refreshStatus();
      const n = r.inserted + r.updated + r.removed;
      if (!quiet) LQ.toast(r.failed ? `Synced, but ${r.failed} change${r.failed === 1 ? '' : 's'} failed: ${r.errors[0] || ''}` : n ? `Google Calendar updated: ${r.inserted} added, ${r.updated} changed, ${r.removed} removed` : 'Google Calendar is already up to date', r.failed ? 'bad' : '');
    } else {
      signedOut(r);
      if (!quiet || r.signedOut) LQ.toast(r.error, 'bad');
    }
    if (onCalendarPage()) LQ.rerender();
    return r;
  };
  let syncTimer = null;
  const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => LQ.syncGoogle(true), 4000); };

  // At start-up: sync once the app has settled, then every hour.
  LQ.calendarStart = async function calendarStart() {
    if (!api()) return;
    await refreshStatus().catch(() => null);
    if (!G.status || !G.status.connected) return;
    setTimeout(() => LQ.syncGoogle(true), 8000);
    setInterval(() => { G.cache = {}; LQ.syncGoogle(true); }, 60 * 60000);
  };

  /* ---------- the page ---------- */
  const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const shift = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return monthKey(d.getFullYear(), d.getMonth() + 1); };
  const kindOf = e => (e.kind === 'own' ? e.ownKind || 'other' : e.kind);
  const time = e => (e.allDay ? 'All day' : `${e.start}–${e.end}`);
  const styleOf = e => (e.kind === 'google' && e.color ? ` style="--ev:${esc(e.color)}"` : '');

  function chip(e) {
    return `<span class="cal-chip k-${kindOf(e)}"${styleOf(e)} title="${esc(`${e.allDay ? '' : `${e.start} `}${e.title}`)}">${e.allDay ? '' : `<b>${esc(e.start)}</b> `}${esc(e.label || e.title)}</span>`;
  }

  function row(e) {
    const k = kindOf(e);
    const extra = e.kind === 'plan' ? `<a href="#/timetable" class="cal-link">Open the timetable →</a>`
      : e.kind === 'recall' ? `<a href="#/drill?mode=recall&sid=${esc(e.subject)}&tid=${esc(e.key.split(':')[1])}" class="cal-link">Recall it now →</a>`
        : e.kind === 'google' && e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener" class="cal-link">Open in Google Calendar ↗</a>`
          : e.kind === 'exam' && D.subjects[e.subject] ? `<a href="#/subject/${esc(e.subject)}" class="cal-link">Open ${esc(D.subjects[e.subject].short)} →</a>` : '';
    return `<div class="cal-event k-${k}"${styleOf(e)}>
      <div class="row between"><strong>${esc(e.title)}</strong>${e.kind === 'own' ? `<button class="task-act" data-cal-edit="${esc(e.id)}">✎ Edit</button>` : ''}</div>
      <div class="muted small">${esc(time(e))} · ${esc(e.kind === 'google' ? e.calendar || 'Google' : KIND_LABEL[k] || 'Event')}${e.repeat === 'weekly' ? ` · every week${e.until ? ` until ${esc(fmtDate(e.until))}` : ''}` : ''}</div>
      ${e.details ? `<div class="cal-details">${esc(e.details)}</div>` : ''}${extra}</div>`;
  }

  LQ.views.calendar = function calendar(params) {
    const s = calState(), today = todayKey();
    const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.m || '') ? params.m : today.slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const weeks = C.monthGrid(y, mo - 1);
    const from = weeks[0][0], to = weeks[weeks.length - 1][6];
    const sel = C.isDate(params.d) ? params.d : m === today.slice(0, 7) ? today : `${m}-01`;
    const mine = LQ.calendarEvents();
    const google = ((G.status && G.status.connected && G.cache[`${from}|${to}`]) || {}).events || [];
    const days = C.byDay(mine.concat(google), from, to);
    const go = (mm, d) => `#/calendar?m=${mm}${d ? `&d=${d}` : ''}`;
    const month = new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const selDay = days[sel] || [];
    return `<div class="page"><div class="row between"><h1>📅 Calendar</h1>
        <div class="row"><button class="btn primary" id="calAdd">＋ Add event</button><button class="btn" id="calIcs" title="An .ics file for Google Calendar, Outlook or a phone">⬇ Export .ics</button>${G.status && G.status.connected ? `<button class="btn" id="calSync" ${G.busy ? 'disabled' : ''}>${G.busy ? 'Syncing…' : '⟳ Sync with Google'}</button>` : ''}</div></div>
      <div class="cal-wrap">
        <div class="card cal-month">
          <div class="cal-nav"><button class="icon-btn" data-go="${go(shift(m, -1))}" title="Previous month">‹</button><h2>${esc(month)}</h2><button class="icon-btn" data-go="${go(shift(m, 1))}" title="Next month">›</button><span class="spacer"></span>${m !== today.slice(0, 7) || sel !== today ? `<button class="btn small" data-go="${go(today.slice(0, 7), today)}">Today</button>` : ''}</div>
          <div class="cal-grid">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
            ${weeks.flat().map(k => {
              const list = days[k] || [];
              const cls = [k.slice(0, 7) !== m && 'out', k === today && 'today', k === sel && 'sel', k < today && 'past', list.some(e => e.kind === 'exam') && 'has-exam'].filter(Boolean).join(' ');
              return `<button class="cal-cell ${cls}" data-go="${go(m, k)}" aria-label="${esc(fmtDate(k))}${list.length ? `, ${list.length} event${list.length === 1 ? '' : 's'}` : ''}"><span class="cal-num">${Number(k.slice(8))}</span>${list.slice(0, 3).map(chip).join('')}${list.length > 3 ? `<span class="cal-more">+${list.length - 3} more</span>` : ''}</button>`;
            }).join('')}
          </div>
          <div class="cal-legend">${['exam', 'plan', 'recall', 'class', 'deadline', 'study', 'other'].map(k => `<span class="cal-chip k-${k}">${KIND_LABEL[k]}</span>`).join('')}${G.status && G.status.connected ? '<span class="cal-chip k-google">From Google</span>' : ''}</div>
        </div>
        <div class="card cal-day">
          <div class="row between"><h3>${esc(fmtDate(sel))}${sel === today ? ' <span class="chip t2">today</span>' : ''}</h3><button class="btn small" id="calAddDay">＋ Add</button></div>
          ${selDay.length ? selDay.map(row).join('') : '<p class="muted">Nothing on this day.</p>'}
        </div>
      </div>
      <div class="card" id="gcalCard" style="margin-top:16px">${googleCard()}</div>
    </div>`;
  };

  function googleCard() {
    const st = G.status;
    const head = '<h2>🔗 Google Calendar</h2>';
    if (!api()) return `${head}<p class="muted">Google Calendar sync works in the desktop app. You can still export an .ics file and import it in Google Calendar (Settings → Import &amp; export).</p>`;
    if (!st) return `${head}<p class="muted">Checking…</p>`;
    if (G.connecting) return `${head}<p>Finish signing in to Google in your browser. This page updates when you’re done.</p><button class="btn" id="gcCancel">Cancel</button>`;
    if (!st.client) {
      return `${head}<p>LexQuest can keep a <strong>LexQuest</strong> calendar in your Google account up to date with your exams, study plan and your own events, and show your Google events here. It only ever changes the calendar it makes.</p>
        <p>Google needs a one-time setup first (about ten minutes). It gives LexQuest its own sign-in with Google, which stays between you and Google:</p>
        <ol class="gc-steps">
          <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Make a Google Cloud project</a> (free), named e.g. <em>LexQuest</em>.</li>
          <li><a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Turn on the Google Calendar API</a> for it: <strong>Enable</strong>.</li>
          <li>Open <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a> → <strong>Get started</strong>. App name <em>LexQuest</em>, your email, Audience <strong>External</strong>, your email again, agree, <strong>Create</strong>.</li>
          <li>Under <strong>Audience</strong>, press <strong>Publish app</strong>. While an app is in “Testing”, Google ends its sign-ins after 7 days; publishing stops that. (Or stay in Testing, add yourself under Test users, and reconnect each week.)</li>
          <li>Under <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener"><strong>Clients</strong></a> → <strong>Create client</strong>, choose Application type <strong>Desktop app</strong>, press <strong>Create</strong>, then <strong>Download JSON</strong>.</li>
          <li>Choose that file here, then press <strong>Connect</strong>. Google will say it hasn’t verified the app: it’s your own, so choose <strong>Advanced → Go to LexQuest</strong>, and tick every box.</li>
        </ol>
        <div class="row"><button class="btn primary" id="gcPick">Choose the downloaded file…</button></div>
        <details style="margin-top:10px"><summary class="muted">Or paste the file’s contents</summary><textarea id="gcPaste" rows="4" placeholder='{"installed":{"client_id":"….apps.googleusercontent.com","client_secret":"…"}}' style="width:100%;margin-top:8px"></textarea><button class="btn small" id="gcPasteSave" style="margin-top:6px">Save</button></details>`;
    }
    if (!st.connected) {
      return `${head}${st.signedOutAt ? `<div class="callout warn">Google signed LexQuest out${st.signedOutAt > 1 ? ` on ${esc(new Date(st.signedOutAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}` : ''}. If your Google app is still in “Testing”, that happens every 7 days: publish it under Audience → Publish app to stop it.</div>` : ''}
        <p>The OAuth client is saved (<code>${esc(st.clientHint)}</code>). Connect your Google account to start syncing.</p>
        <div class="row"><button class="btn primary" id="gcConnect">Connect Google Calendar</button><button class="btn small ghost" id="gcClear">Use a different client</button></div>`;
    }
    const s = calState();
    const box = (k, label) => `<label class="row"><input type="checkbox" data-gc-send="${k}" ${s.send[k] ? 'checked' : ''}> ${label}</label>`;
    const r = st.lastResult;
    return `${head}<p>Connected${st.account ? ` as <strong>${esc(st.account)}</strong>` : ''}. ${st.lastSync ? `Last synced ${esc(new Date(st.lastSync).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${r ? ` (${r.inserted} added, ${r.updated} changed, ${r.removed} removed${r.failed ? `, ${r.failed} failed` : ''})` : ''}.` : 'Not synced yet.'}</p>
      <div class="grid g2">
        <div><h3>Add to your LexQuest calendar in Google</h3>${box('exams', 'Exams')}${box('plan', 'Study plan (one all-day entry per day)')}${box('recall', 'Recall checks')}${box('own', 'Your own events')}
          <p class="muted small">LexQuest keeps that calendar in step, so change these events here: edits made in Google are replaced at the next sync. Past days are left as they were.</p></div>
        <div><h3>Show here from Google</h3><div id="gcCals">${G.calendars ? calendarBoxes() : '<p class="muted">Loading your calendars…</p>'}</div>${st.canRead ? '' : '<p class="muted small">LexQuest wasn’t given permission to read your calendars. Disconnect and connect again, ticking every box, to see them here.</p>'}</div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="gcSync" ${G.busy ? 'disabled' : ''}>${G.busy ? 'Syncing…' : '⟳ Sync now'}</button><a class="btn" href="https://calendar.google.com/" target="_blank" rel="noopener">Open Google Calendar ↗</a><span class="spacer"></span><button class="btn small ghost" id="gcDisconnect">Disconnect</button></div>`;
  }

  function calendarBoxes() {
    const s = calState();
    const list = (G.calendars || []).filter(c => !c.lexquest);
    if (!list.length) return '<p class="muted">No other calendars.</p>';
    return list.map(c => `<label class="row"><input type="checkbox" data-gc-show="${esc(c.id)}" ${(s.show ? s.show.includes(c.id) : c.primary) ? 'checked' : ''}> <span class="cal-dot" style="--ev:${esc(/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#888888')}"></span> ${esc(c.summary)}${c.primary ? ' <span class="muted small">(main)</span>' : ''}</label>`).join('');
  }

  function paintGoogle() {
    const card = $('#gcalCard');
    if (!card) return;
    card.innerHTML = googleCard();
    wireGoogle();
  }

  function wireGoogle() {
    const a = api();
    if (!a) return;
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    const afterClient = r => { if (!r) return; if (r.ok) { LQ.toast('Google client saved'); refreshStatus().then(paintGoogle); } else LQ.toast(r.error, 'bad'); };
    on('#gcPick', async () => afterClient(await a.pickClientFile()));
    on('#gcPasteSave', async () => afterClient(await a.setClient($('#gcPaste').value)));
    on('#gcClear', async () => { await a.clearClient(); await refreshStatus(); paintGoogle(); });
    on('#gcCancel', () => a.cancel());
    on('#gcConnect', async () => {
      G.connecting = true; paintGoogle();
      const r = await a.connect();
      G.connecting = false;
      await refreshStatus();
      if (r.ok) { LQ.toast(`Connected${r.account ? ` as ${r.account}` : ''}`); G.calendars = null; G.cache = {}; LQ.syncGoogle(false); } else LQ.toast(r.error, 'bad');
      if (onCalendarPage()) LQ.rerender();
    });
    on('#gcSync', () => LQ.syncGoogle(false));
    on('#gcDisconnect', async () => {
      if (!confirm('Disconnect Google Calendar? LexQuest stops syncing and forgets this sign-in. The LexQuest calendar stays in your Google account until you delete it there.')) return;
      await a.disconnect();
      G.calendars = null; G.cache = {};
      await refreshStatus();
      LQ.rerender();
    });
    $$('[data-gc-send]').forEach(el => el.onchange = () => { calState().send[el.dataset.gcSend] = el.checked; LQ.save(); syncSoon(); });
    $$('[data-gc-show]').forEach(el => el.onchange = () => {
      const s = calState();
      s.show = $$('[data-gc-show]').filter(x => x.checked).map(x => x.dataset.gcShow);
      LQ.save(); G.cache = {}; LQ.rerender();
    });
  }

  /* ---------- your own events ---------- */
  function editEvent(id, date) {
    const s = calState();
    const ev = s.events.find(e => e.id === id) || { id: null, title: '', date: date || todayKey(), allDay: true, start: '09:00', end: '10:00', kind: 'class', repeat: '', until: '', note: '' };
    const m = LQ.modal(`<h2>${ev.id ? 'Edit event' : 'New event'}</h2>
      <label class="field"><span>Title</span><input type="text" id="ceTitle" maxlength="120" value="${esc(ev.title)}" placeholder="e.g. Moot court practice"></label>
      <div class="grid g2"><label class="field"><span>Date</span><input type="date" id="ceDate" value="${esc(ev.date)}"></label>
        <label class="field"><span>Kind</span><select id="ceKind">${C.KINDS.map(k => `<option value="${k}" ${ev.kind === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select></label></div>
      <label class="row"><input type="checkbox" id="ceAllDay" ${ev.allDay ? 'checked' : ''}> All day</label>
      <div class="grid g2" id="ceTimes" ${ev.allDay ? 'hidden' : ''}><label class="field"><span>Starts</span><input type="time" id="ceStart" value="${esc(ev.start || '09:00')}"></label><label class="field"><span>Ends</span><input type="time" id="ceEnd" value="${esc(ev.end || '10:00')}"></label></div>
      <label class="row" style="margin-top:8px"><input type="checkbox" id="ceRepeat" ${ev.repeat === 'weekly' ? 'checked' : ''}> Repeat every week</label>
      <label class="field" id="ceUntilBox" ${ev.repeat === 'weekly' ? '' : 'hidden'}><span>Until (leave empty for a year)</span><input type="date" id="ceUntil" value="${esc(ev.until || '')}"></label>
      <label class="field"><span>Note</span><textarea id="ceNote" rows="3" maxlength="2000">${esc(ev.note || '')}</textarea></label>
      <div class="row"><button class="btn primary" id="ceSave">Save</button><button class="btn" id="ceCancel">Cancel</button><span class="spacer"></span>${ev.id ? '<button class="btn bad" id="ceDelete">Delete</button>' : ''}</div>`);
    const allDay = $('#ceAllDay', m), repeat = $('#ceRepeat', m);
    allDay.onchange = () => { $('#ceTimes', m).hidden = allDay.checked; };
    repeat.onchange = () => { $('#ceUntilBox', m).hidden = !repeat.checked; };
    $('#ceTitle', m).focus();
    $('#ceCancel', m).onclick = () => LQ.closeModal();
    const done = () => { LQ.save(); LQ.closeModal(); LQ.rerender(); syncSoon(); };
    $('#ceSave', m).onclick = () => {
      const start = $('#ceStart', m).value, end = $('#ceEnd', m).value;
      if (!allDay.checked && end && start && end <= start) return LQ.toast('The event has to end after it starts.', 'bad');
      const clean = C.cleanOwn({ id: ev.id || uid(), title: $('#ceTitle', m).value, date: $('#ceDate', m).value, allDay: allDay.checked, start, end, kind: $('#ceKind', m).value, repeat: repeat.checked ? 'weekly' : '', until: $('#ceUntil', m).value, note: $('#ceNote', m).value });
      if (!clean) return LQ.toast('Give the event a title and a date.', 'bad');
      const i = s.events.findIndex(e => e.id === clean.id);
      if (i >= 0) s.events[i] = clean; else s.events.push(clean);
      done();
    };
    const del = $('#ceDelete', m);
    if (del) del.onclick = () => { if (!confirm(`Delete “${ev.title}”?`)) return; s.events = s.events.filter(e => e.id !== ev.id); done(); };
  }

  async function exportIcs() {
    const ics = C.toICS(LQ.calendarEvents(calState().send), { name: 'LexQuest' });
    const name = `LexQuest calendar ${todayKey()}.ics`;
    if (window.lq) { const p = await window.lq.exportFile(ics, name, 'ics'); if (p) LQ.toast('Saved. In Google Calendar: Settings → Import & export → Import.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  LQ.after.calendar = function (params) {
    const today = todayKey();
    const sel = C.isDate(params.d) ? params.d : null;
    $('#calAdd').onclick = () => editEvent(null, sel || today);
    $('#calAddDay').onclick = () => editEvent(null, sel || (params.m && params.m !== today.slice(0, 7) ? `${params.m}-01` : today));
    $('#calIcs').onclick = exportIcs;
    const sync = $('#calSync'); if (sync) sync.onclick = () => LQ.syncGoogle(false);
    $$('[data-cal-edit]').forEach(b => b.onclick = () => editEvent(b.dataset.calEdit));
    wireGoogle();
    if (!api()) return;
    // Bring the Google side up to date, then redraw once if anything new arrived.
    (async () => {
      const before = JSON.stringify(G.status);
      await refreshStatus();
      if (!onCalendarPage()) return;
      if (JSON.stringify(G.status) !== before) paintGoogle();
      if (!G.status || !G.status.connected) return;
      const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.m || '') ? params.m : today.slice(0, 7);
      const [y, mo] = m.split('-').map(Number);
      const weeks = C.monthGrid(y, mo - 1);
      // fetchRange answers null while its range is fresh, so this redraws once and doesn't loop.
      const got = await fetchRange(weeks[0][0], weeks[weeks.length - 1][6]);
      if (!onCalendarPage() || !got) return;
      if (got.error) LQ.toast(got.error, 'bad');
      LQ.rerender();
    })().catch(err => LQ.toast(err.message, 'bad'));
  };
})();
