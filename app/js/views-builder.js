// Course Builder: make a course from its manual, then build each week's notes from that week's
// readings, with Claude — or, without an API key, by pasting a request into Claude in the browser
// and pasting the reply back. Courses are saved as JSON in "LexQuest Content/Built courses" and load
// like any other course. Every result is kept as a draft until it is saved, so nothing paid for is lost.
'use strict';
(function () {
  const { $, $$, esc, todayKey, fmtDate } = LQ.h;
  const D = window.LQ_DATA;
  const F = window.LQ_COURSE;
  const api = () => window.lq && window.lq.builder;
  LQ.views = LQ.views || {};
  LQ.after = LQ.after || {};

  const entries = () => window.LQ_BUILT || [];
  const courses = () => entries().filter(e => e.course).map(e => e.course);
  const findCourse = id => courses().find(c => c.id === id);
  const copy = o => JSON.parse(JSON.stringify(o));
  const store = () => (LQ.state.builder = LQ.state.builder || { draft: null, notes: {} });
  const MB = n => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;
  const pl = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const LIMIT = 30 * 1048576;
  // Claude Opus 5.5, US$ per million tokens; shown so each build's cost is visible.
  const usageLine = u => (u ? `${(u.input || 0).toLocaleString('en-IN')} tokens read · ${(u.output || 0).toLocaleString('en-IN')} written · about US$${(((u.input || 0) * 4 + (u.output || 0) * 20) / 1e6).toFixed(2)}` : '');
  const weekIncludes = (w, n) => { const nums = (String(w || '').match(/\d+/g) || []).map(Number); return nums.length >= 2 ? n >= nums[0] && n <= nums[nums.length - 1] : nums[0] === n; };

  /* ---------- what Claude is asked ---------- */
  const SYSTEM = `You turn law-school course material into study material for LexQuest, a study app used by a student with a weak memory and a short attention span who is aiming for top grades.

Accuracy comes first. Work from the attached documents and well-established law only. Never invent a case, citation, section number, page or quotation. Where the documents don't settle something, say so in the text with "(check)" rather than guess. Keep citations exactly as the documents give them.

Write plainly: short sentences, one idea per bullet, and bold the words that earn marks. Explain the rule, the authority for it, its exceptions and an example, and say how it is examined.

Reply with one JSON object and nothing else: no sentence before or after it and no code fences.

Text fields use LexQuest's markdown, which supports only these: lines starting "### " (headings), "- " (bullets, one level only, never indented), "1. " (numbered lines), **bold**, *italics*, lines starting "> " (quotes), pipe tables, and callout lines starting "!tip ", "!warn " or "!exam ". Link a case from this topic's case list as [[c:key]], using its key. Nothing else: no links, no HTML, no nested lists.`;

  function syllabusPrompt(c) {
    return `The attached document is the course manual for "${c.name}"${c.semester ? ` (semester ${c.semester})` : ''}. Lay out the course week by week.

Return this JSON:
{
  "blurb": "one line on what the course covers",
  "about": "markdown: the course code if stated; its aims; the assessment scheme with weights; the end-term's format and rules (open or closed book, what may be brought in); and a short 'How to study it' list",
  "paperPattern": "one or two sentences on the end-term paper's format, if the manual says; otherwise \\"\\"",
  "units": [
    { "title": "the manual's name for the week or unit, with its week numbers, e.g. \\"Weeks 2–3 — Corporate personality\\"",
      "topics": [
        { "title": "short topic title",
          "subtitle": "up to 8 words",
          "week": "\\"1\\" or \\"2–3\\"",
          "tier": 1,
          "readings": [ { "title": "as the manual cites it, with pages", "kind": "reading | case | act", "tier": 1 } ],
          "sections": ["statutory provisions the week lists, as written"],
          "questions": ["the manual's questions to consider for this week, word for word"] } ] } ],
  "exams": [ { "title": "…", "date": "YYYY-MM-DD", "note": "…" } ],
  "instructorItems": ["anything the manual leaves 'to be assigned' or 'to be specified', so the student can ask"]
}

Topic tier: 1 = core and likely examined, 2 = important, 3 = minor. Reading tier: 1 = mandatory, 2 = suggested, 3 = further or optional.
Keep every week the manual lists, in order. Use one topic per distinct subject; split a week only when it clearly covers separate topics. List only exams the manual gives a date for.`;
  }

  function notesPrompt(c, t, names, extra) {
    const others = c.units.flatMap(u => u.topics).filter(x => x.id !== t.id).map(x => `${x.title} (week ${x.week || '?'})`).join('; ');
    return `Course: "${c.name}". Topic: "${t.title}"${t.week ? `, week ${t.week}` : ''}. Priority tier ${t.tier} of 3.
The manual's readings for it:
${t.readings.length ? t.readings.map(r => `- ${r.title} (${r.kind}, ${r.tier === 1 ? 'mandatory' : r.tier === 2 ? 'suggested' : 'further'})`).join('\n') : '- none listed'}
${t.sections.length ? `Provisions: ${t.sections.join('; ')}\n` : ''}${t.questions.length ? `The manual's questions to consider:\n${t.questions.map(q => `- ${q}`).join('\n')}\n` : ''}Attached: ${names.length ? names.join('; ') : 'nothing — work from the reading list and well-established law, and mark anything you can’t confirm with "(check)"'}.
The course's other topics (for connections): ${others || 'none'}.
${extra ? `The student adds: ${extra}\n` : ''}
Build this topic's study material. Return this JSON:
{
  "gist": "a 30-second summary in 2–3 sentences",
  "prime": ["3 questions to try before studying"],
  "examFocus": "how this is likely examined and what earns the marks",
  "guide": "the main notes in LexQuest markdown, in ### sections: each rule with its authority, exceptions and an example; the leading cases; short key quotations; 600–1500 words",
  "modelSummary": "a 120–200 word model summary the student compares their own against",
  "mnemonics": ["2–4 memory hooks: acronyms, rhymes or vivid pictures"],
  "council": { "contrarian": "the main criticisms, dissents and weak points", "first": "the first principles and assumptions behind the rules", "expansion": "links to other topics and subjects", "outsider": "the whole topic in plain words", "executor": "a step-by-step method for a problem question on it" },
  "cases": [ { "key": "short-id", "name": "…", "cite": "as the documents give it", "oneLine": "the holding in one line", "facts": "…", "issue": "…", "held": "…", "use": "when to cite it in an exam", "hook": "a vivid image of the facts" } ],
  "cards": [ { "front": "a question", "back": "the answer" }, { "cloze": "a sentence with {{the hidden part}}" } ],
  "mcqs": [ { "q": "…", "options": ["…", "…", "…", "…"], "answer": 0, "why": "one line on why" } ],
  "loci": [ { "spot": "a place along a route", "image": "a vivid, exaggerated image", "meaning": "what it stands for" } ],
  "lastHour": ["3–6 lines for the night-before sheet"]
}
Give 15–30 flashcards, each testing one fact; 6–10 quiz questions with four options and one right answer (answer is its index, from 0); and 4–8 loci. Cover every case the manual lists for this topic that the material lets you describe accurately.`;
  }

  /* ---------- running a request ---------- */
  const listeners = {};
  let wired = false;
  function onProgress(id, cb) {
    if (!wired && api()) { wired = true; api().onProgress(p => { if (listeners[p.id]) listeners[p.id](p); }); }
    listeners[id] = cb;
  }

  async function runJob(box, job, expectChars) {
    job.id = 'j' + LQ.h.uid();
    const started = Date.now();
    let chars = 0, info = 'sending the files to Claude';
    box.innerHTML = `<div class="callout tip"><strong>✨ Claude is working.</strong> <span id="bjInfo">${info}</span>
      <div class="progress" style="margin-top:10px"><i id="bjBar" style="width:4%"></i></div>
      <div class="row" style="margin-top:8px"><small class="muted" id="bjTime">0:00</small><span class="spacer"></span><button class="btn small" id="bjStop">Stop</button></div>
      <p class="muted" style="margin:8px 0 0;font-size:.88em">Reading long files takes a few minutes. You can use the rest of the app meanwhile; the result is kept here when it’s done.</p></div>`;
    const tick = setInterval(() => {
      const el = $('#bjTime', box);
      if (!el) return;
      el.textContent = `${LQ.fmtClock(Date.now() - started)} · ${chars ? `${chars.toLocaleString('en-IN')} characters written` : 'reading and thinking'}`;
    }, 500);
    onProgress(job.id, p => {
      if (p.sent) info = p.sent.length ? `reading ${p.sent.length} file${p.sent.length > 1 ? 's' : ''}` : 'working without files';
      if (typeof p.chars === 'number') chars = p.chars;
      const i = $('#bjInfo', box), bar = $('#bjBar', box);
      if (i) i.textContent = info;
      if (bar) bar.style.width = `${Math.min(96, 4 + (chars / (expectChars || 30000)) * 92)}%`;
    });
    const stop = $('#bjStop', box);
    if (stop) stop.onclick = () => { stop.disabled = true; stop.textContent = 'Stopping…'; api().cancel(job.id); };
    try { return await api().run(job); } finally { clearInterval(tick); delete listeners[job.id]; }
  }

  // "Use Claude in your browser": the same request, to paste into a chat with the files attached.
  function pastePanel(box, { prompt, files, onReply }) {
    const full = `${SYSTEM}\n\n---\n\n${prompt}`;
    box.innerHTML = `<div class="card tight" style="margin-top:12px"><h3>📋 Use Claude in your browser</h3>
      <ol><li>Open a new chat at <strong>claude.ai</strong>.</li>
        <li>Attach ${files.length ? `these file${files.length > 1 ? 's' : ''}: ${files.map(f => `<strong>${esc(f)}</strong>`).join(', ')}` : 'no files'}.</li>
        <li>Copy the request below into the chat and send it.</li>
        <li>Copy Claude’s whole reply and paste it into the box at the bottom.</li></ol>
      <textarea id="bpPrompt" readonly style="min-height:150px;font-size:.85em">${esc(full)}</textarea>
      <div class="row" style="margin:8px 0 14px"><button class="btn small" id="bpCopy">Copy the request</button></div>
      <label class="field"><span>Claude’s reply</span><textarea id="bpReply" style="min-height:150px" placeholder="Paste the reply here (it starts with {)"></textarea></label>
      <div class="row"><button class="btn primary" id="bpUse">Use this reply</button><span class="muted" id="bpErr"></span></div></div>`;
    $('#bpCopy', box).onclick = async () => {
      const ta = $('#bpPrompt', box);
      try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
      LQ.toast('Copied. Paste it into Claude.');
    };
    $('#bpUse', box).onclick = () => {
      const text = $('#bpReply', box).value;
      try { onReply(text); } catch (err) { $('#bpErr', box).textContent = err.message; }
    };
  }

  /* ---------- pages ---------- */
  LQ.views.builder = function builder(p) {
    if (!api()) return `<div class="page"><h1>🛠️ Course Builder</h1><div class="empty">The Course Builder works in the desktop app.</div></div>`;
    if (p.new) return pageNew();
    if (p.review) return pageReview();
    if (p.course && p.topic) return pageTopic(p.course, p.topic);
    if (p.course) return pageCourse(p.course);
    return pageHome();
  };

  LQ.after.builder = function (p) {
    if (!api()) return;
    if (p.new) return afterNew();
    if (p.review) return afterReview();
    if (p.course && p.topic) return afterTopic(p.course, p.topic);
    if (p.course) return afterCourse(p.course);
    return afterHome();
  };

  /* Home: the key, the courses, and the way in. */
  function pageHome() {
    const list = entries();
    const draft = store().draft;
    return `<div class="page read">
      <div class="hero"><h1>🛠️ Course Builder</h1>
        <p>Make a LexQuest course for any semester from its course manual. Claude reads the manual and lays out the weeks, topics and readings, and links each reading to the file in your course folder. Then, as each week comes round, it builds that week’s notes from the readings: the guide, flashcards, quiz, case cards, council lenses, memory-palace images and the last-hour sheet.</p>
        <div class="row"><button class="btn primary" data-go="#/builder?new=1">＋ New course from its manual</button><button class="btn" id="bOpenDir">📂 Built-courses folder</button></div></div>
      ${draft ? `<div class="callout tip">You were setting up <strong>${esc(draft.course.name)}</strong> and haven’t saved it yet. <a href="#/builder?review=1">Finish it</a></div>` : ''}
      <div id="bKey" class="card" style="margin-bottom:16px"><p class="muted">Checking…</p></div>
      <div class="section-title"><h2>Your built courses</h2></div>
      ${list.length ? `<div class="list">${list.map(e => {
        if (!e.course) return `<div class="item"><span>⚠️</span><span class="grow">${esc(e.error || e.file)}</span></div>`;
        const c = e.course, st = F.stats(c), wk = F.currentWeek(c, todayKey());
        return `<div class="item click" data-go="#/builder?course=${esc(c.id)}"><span style="font-size:1.6em">${esc(c.icon || '📘')}</span>
          <span class="grow"><strong>${esc(c.name)}</strong><br><small class="muted">Semester ${esc(c.semester || D.degree.current)} · notes built for ${st.built} of ${st.topics} topics · ${st.cards} flashcards${wk ? ` · week ${wk} now` : ''}</small></span><span>→</span></div>`;
      }).join('')}</div>` : '<div class="empty">No built courses yet. Start with a course manual.</div>'}
      <div class="card" style="margin-top:18px"><h2>How it works</h2><ol>
        <li><strong>Put the course’s files in its folder</strong> inside the semester folder (e.g. <code>Semester 6\\Torts</code>): the manual, readings, cases and slides.</li>
        <li><strong>New course → choose the manual.</strong> Check the weeks and the files it matched, then save. The course appears in Subjects at once, with each week’s reading list and the manual’s questions.</li>
        <li><strong>Each week, build that week’s notes</strong> from its readings (and your class slides or notes, if you like). The Today page reminds you when a week’s notes are due.</li>
        <li><strong>Study it like any other course:</strong> the seven steps, the flashcards, the palace and the last-hour sheet all fill in as you build.</li></ol>
        <p class="muted">Claude can be wrong. Built notes are marked as such; check anything important against the readings.</p></div>
    </div>`;
  }

  async function afterHome() {
    const od = $('#bOpenDir'); if (od) od.onclick = () => api().openFolder();
    const box = $('#bKey');
    const s = await api().get();
    const keyHtml = s.hasKey
      ? `<h2>🔑 Claude API key</h2><p><span class="chip ok">Saved</span> The key is stored encrypted on this computer and used only for Course Builder requests. Model: <code>${esc(s.model)}</code>.</p>
        <div class="row"><button class="btn small" id="bKeyNew">Replace it</button><button class="btn small bad" id="bKeyDel">Remove it</button></div>`
      : `<h2>🔑 Claude API key</h2>
        ${s.envKey ? '<p><span class="chip ok">Found</span> Using the <code>ANTHROPIC_API_KEY</code> set on this computer. You can save a different key here instead.</p>' : '<p>To build with one click, add an API key from <strong>console.anthropic.com</strong> (Settings → API keys). Use is billed to that account: roughly US$0.50–1 to read a 40-page manual and US$1–3 for a week of readings. Each build shows what it cost.</p>'}
        <div class="row inline-controls"><input type="password" class="grow-input" id="bKeyIn" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"><button class="btn primary small" id="bKeySave">Save key</button></div>
        <p class="muted" style="margin-top:8px;font-size:.88em">No key? Every step also offers <strong>Use Claude in your browser</strong>: copy the request into claude.ai, attach the files and paste the reply back. The files you choose are sent to Anthropic to be read; nothing else leaves this computer.</p>`;
    box.innerHTML = keyHtml;
    const save = $('#bKeySave'); if (save) save.onclick = async () => { const v = $('#bKeyIn').value.trim(); if (!v) return LQ.toast('Paste the key first.'); const r = await api().setKey(v); if (!r.ok) return LQ.toast(r.error); LQ.toast('Key saved'); afterHome(); };
    const del = $('#bKeyDel'); if (del) del.onclick = async () => { if (!confirm('Remove the saved API key?')) return; await api().setKey(''); LQ.toast('Key removed'); afterHome(); };
    const nw = $('#bKeyNew'); if (nw) nw.onclick = async () => { await api().setKey(''); afterHome(); };
  }

  /* New course: the details, the folder and the manual. */
  let form = null;
  function pageNew() {
    form = form || { name: '', short: '', icon: '📘', semester: D.activeSemester || D.degree.current, folder: '', manual: null, weekOneStarts: '', examDate: '' };
    return `<div class="page read"><a href="#/builder" class="muted">← Course Builder</a><h1>＋ New course from its manual</h1>
      <div class="card">
        <div class="grid g2"><label class="field"><span>Course name</span><input type="text" id="nfName" value="${esc(form.name)}" placeholder="e.g. Law of Torts"></label>
          <label class="field"><span>Short name (shown on chips)</span><input type="text" id="nfShort" maxlength="14" value="${esc(form.short)}" placeholder="e.g. Torts"></label></div>
        <div class="grid g3"><label class="field"><span>Icon (an emoji)</span><input type="text" id="nfIcon" maxlength="4" value="${esc(form.icon)}"></label>
          <label class="field"><span>Semester</span><input type="number" id="nfSem" min="1" max="${D.degree.semesters}" value="${esc(form.semester)}"></label>
          <label class="field"><span>End-term date (optional)</span><input type="date" id="nfExam" value="${esc(form.examDate)}"></label></div>
        <label class="field"><span>Week 1 starts on (optional; lets the app tell you which week’s notes to build)</span><input type="date" id="nfWeek" value="${esc(form.weekOneStarts)}" style="max-width:220px;display:block"></label>
        <label class="field"><span>Course folder, inside the semester folder (<code id="nfRoot">…</code>)</span>
          <div class="row inline-controls"><input type="text" class="grow-input" id="nfFolder" value="${esc(form.folder)}" placeholder="e.g. Torts" readonly><button class="btn small" id="nfPickDir">Choose…</button></div></label>
        <label class="field"><span>Course manual (PDF, Word or text)</span>
          <div class="row"><span class="grow" id="nfManual">${form.manual ? `📄 ${esc(form.manual.name)}` : '<span class="muted">Not chosen yet</span>'}</span><button class="btn small" id="nfPickManual">Choose the manual…</button></div></label>
        <div class="row" style="margin-top:6px"><button class="btn primary" id="nfGo">✨ Read the manual with Claude</button><button class="btn" id="nfPaste">📋 Use Claude in your browser</button><span class="muted" id="nfErr"></span></div>
      </div>
      <div id="nfOut"></div></div>`;
  }

  function readForm() {
    form.name = $('#nfName').value.trim(); form.short = $('#nfShort').value.trim(); form.icon = $('#nfIcon').value.trim() || '📘';
    form.semester = Number($('#nfSem').value) || D.degree.current; form.examDate = $('#nfExam').value; form.weekOneStarts = $('#nfWeek').value;
  }
  function uniqueId(base) {
    const taken = new Set([...Object.keys(D.allSubjects || D.subjects), ...courses().map(c => c.id)]);
    let id = F.slug(base, 24) || 'course', n = 2;
    while (taken.has(id)) id = `${F.slug(base, 20)}-${n++}`;
    return id;
  }

  async function afterNew() {
    const err = t => { $('#nfErr').textContent = t; };
    const showRoot = async () => { $('#nfRoot').textContent = await api().root(Number($('#nfSem').value) || D.degree.current); };
    showRoot();
    $('#nfSem').onchange = () => { readForm(); showRoot(); };
    ['#nfName', '#nfShort', '#nfIcon', '#nfExam', '#nfWeek'].forEach(s => { $(s).oninput = readForm; });
    $('#nfPickDir').onclick = async () => {
      readForm();
      const r = await api().pick({ semester: form.semester, folder: true, title: 'Choose the course’s folder' });
      if (!r) return;
      if (r[0].rel == null) return err('Choose a folder inside the semester folder shown above.');
      form.folder = r[0].rel; $('#nfFolder').value = form.folder; err('');
      if (!form.name) { form.name = r[0].name; $('#nfName').value = form.name; }
    };
    $('#nfPickManual').onclick = async () => {
      readForm();
      const r = await api().pick({ semester: form.semester, title: 'Choose the course manual' });
      if (!r) return;
      form.manual = r[0];
      $('#nfManual').innerHTML = `📄 ${esc(r[0].name)} <small class="muted">${MB(r[0].size)}${r[0].pages ? ` · ${r[0].pages} pages` : ''}</small>`;
      err('');
    };
    const ready = () => {
      readForm();
      if (!form.name) { err('Give the course a name.'); return null; }
      if (!form.manual) { err('Choose the course manual.'); return null; }
      err('');
      return F.newCourse({ ...form, id: uniqueId(form.short || form.name) });
    };
    const accept = (text, usage) => {
      const course = F.normalizeSyllabus(F.extractJson(text), ready());
      return keepDraft(course, usage);
    };
    $('#nfGo').onclick = async () => {
      const base = ready(); if (!base) return;
      const box = $('#nfOut');
      const res = await runJob(box, { system: SYSTEM, prompt: syllabusPrompt(base), files: [form.manual.rel ? { rel: form.manual.rel } : { abs: form.manual.abs }], semester: form.semester, requireFiles: true, effort: 'high' }, 12000);
      if (!res.ok) { box.innerHTML = `<div class="callout warn">${esc(res.error)}${res.skipped && res.skipped.length ? `<br><small>${res.skipped.map(esc).join('<br>')}</small>` : ''}</div>`; return; }
      try { await accept(res.text, res.usage); }
      catch (e) { box.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
    };
    $('#nfPaste').onclick = () => {
      const base = ready(); if (!base) return;
      pastePanel($('#nfOut'), { prompt: syllabusPrompt(base), files: [form.manual.name], onReply: text => accept(text, null) });
    };
  }

  async function keepDraft(course, usage) {
    const files = course.folder ? await api().scan(course.folder, course.semester) : [];
    const matched = F.autoMatch(course, files);
    store().draft = { course, usage, matched, at: Date.now() };
    await LQ.save(true);
    form = null;
    location.hash = '#/builder?review=1';
  }

  /* Review: check the weeks, tiers and files before saving the course. */
  function pageReview() {
    const d = store().draft;
    if (!d) return `<div class="page"><div class="empty">Nothing to review. <a href="#/builder?new=1">Start a new course</a>.</div></div>`;
    const c = d.course;
    const readings = c.units.flatMap(u => u.topics.flatMap(t => t.readings));
    return `<div class="page"><a href="#/builder" class="muted">← Course Builder</a>
      <h1>${esc(c.icon)} Check ${esc(c.name)} before saving</h1>
      <p class="muted">Claude laid out ${c.units.reduce((a, u) => a + u.topics.length, 0)} topics in ${c.units.length} units, with ${readings.length} readings; ${readings.filter(r => r.file).length} were matched to files in <code>${esc(c.folder || '(no folder)')}</code>. Fix any week, tier or file below, then save. ${d.usage ? `<br><small>${esc(usageLine(d.usage))}</small>` : ''}</p>
      ${c.about ? `<details class="card" style="margin-bottom:12px"><summary><strong>About the course (from the manual)</strong></summary><div class="prose">${LQ.md(c.about)}</div></details>` : ''}
      ${c.instructorItems.length ? `<div class="callout warn"><strong>Things the manual leaves to your instructor:</strong><br>${c.instructorItems.map(esc).join('<br>')}</div>` : ''}
      <div id="bReview"><p class="muted">Loading the folder…</p></div>
      <div class="row" style="margin-top:16px;position:sticky;bottom:0;background:var(--bg);padding:10px 0"><button class="btn primary" id="brSave">💾 Save the course</button><button class="btn bad" id="brDrop">Discard</button><span class="muted" id="brErr"></span></div></div>`;
  }

  async function afterReview() {
    const d = store().draft; if (!d) return;
    const c = d.course;
    const files = c.folder ? await api().scan(c.folder, c.semester) : [];
    const touch = () => LQ.save();
    const fileSelect = (r, ti, ri) => {
      const opts = F.matchFiles(r.title, files, 6);
      if (r.file && !opts.some(o => o.rel === r.file)) opts.unshift({ rel: r.file, name: r.file.split('/').pop() });
      return `<select data-file="${ti}:${ri}" style="max-width:100%"><option value="">— not in the folder —</option>${opts.map(o => `<option value="${esc(o.rel)}" ${o.rel === r.file ? 'selected' : ''}>${esc(o.rel.replace(c.folder + '/', ''))}</option>`).join('')}<option value="__pick">Choose another file…</option></select>`;
    };
    const topics = c.units.flatMap((u, ui) => u.topics.map((t, i) => ({ u, ui, t, i })));
    $('#bReview').innerHTML = c.units.map((u, ui) => `<div class="section-title"><h2><input type="text" data-unit="${ui}" value="${esc(u.title)}" style="font-size:inherit;font-weight:700;width:100%"></h2></div>
      ${u.topics.map(t => { const ti = topics.findIndex(x => x.t === t); return `<div class="card tight" style="margin-bottom:10px">
        <div class="row inline-controls"><input type="text" data-tw="${ti}" value="${esc(t.week)}" style="width:80px" title="Week"><input type="text" class="grow-input" data-tt="${ti}" value="${esc(t.title)}" title="Topic"><select data-tier="${ti}">${[1, 2, 3].map(n => `<option value="${n}" ${t.tier === n ? 'selected' : ''}>Tier ${n}</option>`).join('')}</select><button class="btn small bad" data-deltopic="${ti}" title="Remove this topic">✕</button></div>
        ${t.readings.length ? `<table class="t" style="margin-top:8px"><tbody>${t.readings.map((r, ri) => `<tr><td style="width:45%">${r.kind === 'case' ? '⚖️' : r.kind === 'act' ? '📜' : '📄'} ${esc(r.title)}</td><td style="width:140px"><select data-rtier="${ti}:${ri}" style="width:auto">${[1, 2, 3].map(n => `<option value="${n}" ${r.tier === n ? 'selected' : ''}>${n === 1 ? 'Mandatory' : n === 2 ? 'Suggested' : 'Further'}</option>`).join('')}</select></td><td>${fileSelect(r, ti, ri)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:6px 0 0">No readings listed.</p>'}
        ${t.questions.length ? `<p class="muted" style="margin:6px 0 0;font-size:.88em">${t.questions.length} question${t.questions.length > 1 ? 's' : ''} to consider from the manual</p>` : ''}</div>`; }).join('')}`).join('');
    const at = s => { const [a, b] = s.split(':').map(Number); return { t: topics[a].t, r: topics[a].t.readings[b] }; };
    $$('[data-unit]').forEach(el => el.oninput = () => { c.units[+el.dataset.unit].title = el.value; touch(); });
    $$('[data-tw]').forEach(el => el.oninput = () => { topics[+el.dataset.tw].t.week = el.value.trim(); touch(); });
    $$('[data-tt]').forEach(el => el.oninput = () => { topics[+el.dataset.tt].t.title = el.value.trim(); touch(); });
    $$('[data-tier]').forEach(el => el.onchange = () => { topics[+el.dataset.tier].t.tier = +el.value; touch(); });
    $$('[data-rtier]').forEach(el => el.onchange = () => { at(el.dataset.rtier).r.tier = +el.value; touch(); });
    $$('[data-file]').forEach(el => el.onchange = async () => {
      const x = at(el.dataset.file);
      if (el.value !== '__pick') { x.r.file = el.value; return touch(); }
      const picked = await api().pick({ semester: c.semester, title: 'Choose the file for this reading' });
      if (picked && picked[0].rel) { x.r.file = picked[0].rel; touch(); }
      else if (picked) LQ.toast('Choose a file inside the semester folder.');
      LQ.rerender();
    });
    $$('[data-deltopic]').forEach(b => b.onclick = () => {
      const { u, i } = topics[+b.dataset.deltopic];
      if (!confirm('Remove this topic from the course?')) return;
      u.topics.splice(i, 1); c.units = c.units.filter(x => x.topics.length); touch(); LQ.rerender();
    });
    $('#brSave').onclick = async () => {
      c.updated = Date.now();
      const r = await api().save(c);
      if (!r.ok) { $('#brErr').textContent = r.error; return; }
      store().draft = null;
      await LQ.save(true);
      location.hash = '#/builder?course=' + c.id;
      location.reload();
    };
    $('#brDrop').onclick = async () => { if (!confirm('Discard this course? You’d need to read the manual again.')) return; store().draft = null; await LQ.save(true); location.hash = '#/builder'; };
  }

  /* A course: this week, every topic's status, and its settings. */
  function topicRow(c, t, wk) {
    const n = t.notes, draft = store().notes[t.id];
    const files = t.readings.filter(r => r.file).length;
    const now = wk && weekIncludes(t.week, wk);
    return `<div class="item"><span class="chip">${t.week ? `Wk ${esc(t.week)}` : '—'}</span>
      <span class="grow"><strong>${esc(t.title)}</strong> <span class="chip t${t.tier}">Tier ${t.tier}</span>${now ? ' <span class="chip t2">this week</span>' : ''}<br>
        <small class="muted">${t.readings.length} reading${t.readings.length === 1 ? '' : 's'}, ${files} in the folder · ${n ? `notes built ${fmtDate(todayKey(new Date(n.builtAt)))}: ${pl(n.cards.length, 'card')}, ${pl(n.mcqs.length, 'quiz question')}, ${pl(n.cases.length, 'case')}` : 'notes not built yet'}${draft ? ' · <strong>an unsaved result is waiting</strong>' : ''}</small></span>
      <button class="btn small ${n ? '' : 'primary'}" data-go="#/builder?course=${esc(c.id)}&topic=${esc(t.id)}">${draft ? 'Review' : n ? '↻ Rebuild' : '✨ Build notes'}</button>
      ${D.subjects[c.id] ? `<button class="btn small" data-go="#/topic/${esc(c.id)}/${esc(t.id)}">Open</button>` : ''}</div>`;
  }

  function pageCourse(id) {
    const c = findCourse(id);
    if (!c) return `<div class="page"><div class="empty">That course isn’t in the built-courses folder. <a href="#/builder">Back</a></div></div>`;
    const st = F.stats(c), wk = F.currentWeek(c, todayKey());
    const sem = c.semester || D.degree.current;
    const due = wk ? c.units.flatMap(u => u.topics).filter(t => weekIncludes(t.week, wk)) : [];
    return `<div class="page"><a href="#/builder" class="muted">← Course Builder</a>
      <div class="hero"><div class="row between"><div><h1>${esc(c.icon)} ${esc(c.name)}</h1>
        <p class="muted">Semester ${esc(sem)} · notes built for ${st.built} of ${st.topics} topics · ${st.cards} flashcards${c.manual ? ` · from ${esc(c.manual.name)}` : ''}</p></div>
        <div class="row">${D.subjects[c.id] ? `<button class="btn" data-go="#/subject/${esc(c.id)}">📚 Open in Subjects</button>` : `<button class="btn" id="bcSem">🎓 Study Semester ${esc(sem)}</button>`}</div></div>
        <div class="progress" style="margin-top:10px"><i style="width:${st.topics ? st.built / st.topics * 100 : 0}%"></i></div></div>
      ${wk === 0 ? `<div class="callout tip">Week 1 starts on ${fmtDate(c.weekOneStarts)}.</div>` : ''}
      ${wk ? `<div class="card" style="margin-bottom:16px"><h2>📅 It’s week ${wk}</h2>${due.length ? `<div class="list">${due.map(t => topicRow(c, t, wk)).join('')}</div>` : '<p class="muted">The manual lists nothing for this week.</p>'}</div>` : ''}
      ${c.units.map(u => `<div class="section-title"><h2>${esc(u.title)}</h2></div><div class="list">${u.topics.map(t => topicRow(c, t, wk)).join('')}</div>`).join('')}
      <details class="card" style="margin-top:18px"><summary><strong>⚙️ Course settings</strong></summary>
        <div class="grid g3" style="margin-top:10px"><label class="field"><span>Name</span><input type="text" id="bcName" value="${esc(c.name)}"></label>
          <label class="field"><span>Short name</span><input type="text" id="bcShort" maxlength="14" value="${esc(c.short)}"></label>
          <label class="field"><span>Icon</span><input type="text" id="bcIcon" maxlength="4" value="${esc(c.icon)}"></label></div>
        <div class="grid g3"><label class="field"><span>Semester</span><input type="number" id="bcSemN" min="1" max="${D.degree.semesters}" value="${esc(sem)}"></label>
          <label class="field"><span>Week 1 starts on</span><input type="date" id="bcWeek" value="${esc(c.weekOneStarts || '')}"></label>
          <label class="field"><span>Course folder</span><input type="text" id="bcFolder" value="${esc(c.folder || '')}"></label></div>
        <h3>Exams</h3>${(c.exams || []).map((e, i) => `<div class="row inline-controls" style="margin-bottom:6px"><input type="text" class="grow-input" data-et="${i}" value="${esc(e.title)}"><input type="date" data-ed="${i}" value="${esc(e.date)}"><button class="btn small bad" data-edel="${i}">✕</button></div>`).join('')}
        <div class="row"><button class="btn small" id="bcAddExam">＋ Exam</button><span class="spacer"></span><button class="btn bad small" id="bcRemove">Remove the course</button><button class="btn primary" id="bcSave">Save settings</button></div>
        <p class="muted" style="font-size:.86em;margin-top:8px">Saved in <code>LexQuest Content\\Built courses\\${esc(c.id)}.json</code>. Earlier versions are kept in its <code>history</code> folder.</p></details></div>`;
  }

  async function saveCourse(c, hash) {
    c.updated = Date.now();
    const r = await api().save(c);
    if (!r.ok) { LQ.toast(r.error); return false; }
    await LQ.save(true);
    location.hash = hash;
    location.reload();
    return true;
  }

  function afterCourse(id) {
    const base = findCourse(id); if (!base) return;
    const c = copy(base);
    const sem = $('#bcSem'); if (sem) sem.onclick = () => LQ.switchSemester(c.semester || D.degree.current);
    $$('[data-et]').forEach(el => el.oninput = () => { c.exams[+el.dataset.et].title = el.value; });
    $$('[data-ed]').forEach(el => el.oninput = () => { c.exams[+el.dataset.ed].date = el.value; });
    $$('[data-edel]').forEach(b => b.onclick = () => { c.exams.splice(+b.dataset.edel, 1); b.parentElement.remove(); });
    $('#bcAddExam').onclick = () => { c.exams = c.exams || []; c.exams.push({ title: `${c.short} end-term`, date: todayKey(), note: '' }); saveCourse(c, '#/builder?course=' + c.id); };
    $('#bcSave').onclick = () => {
      c.name = $('#bcName').value.trim() || c.name; c.short = $('#bcShort').value.trim() || c.short; c.icon = $('#bcIcon').value.trim() || c.icon;
      c.semester = Number($('#bcSemN').value) || c.semester; c.weekOneStarts = $('#bcWeek').value; c.folder = $('#bcFolder').value.trim().replace(/\\/g, '/').replace(/\/$/, '');
      c.exams = (c.exams || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
      saveCourse(c, '#/builder?course=' + c.id);
    };
    $('#bcRemove').onclick = async () => {
      if (!confirm(`Remove ${c.name}? Its file moves to "Built courses\\removed", so it can be restored by hand.`)) return;
      const r = await api().remove(c.id);
      if (!r.ok) return LQ.toast(r.error);
      location.hash = '#/builder'; location.reload();
    };
  }

  /* A topic: choose what Claude reads, build, check, save. */
  const extraFiles = {}; // topic id -> files picked outside the reading list
  function pageTopic(cid, tid) {
    const c = findCourse(cid);
    const t = c && c.units.flatMap(u => u.topics).find(x => x.id === tid);
    if (!t) return `<div class="page"><div class="empty">Topic not found. <a href="#/builder">Back</a></div></div>`;
    const n = t.notes;
    return `<div class="page read"><a href="#/builder?course=${esc(c.id)}" class="muted">← ${esc(c.name)}</a>
      <h1>${esc(t.title)}</h1><p class="muted">${t.week ? `Week ${esc(t.week)} · ` : ''}Tier ${t.tier}${t.subtitle ? ' · ' + esc(t.subtitle) : ''}</p>
      ${n ? `<div class="callout tip">Notes built on ${fmtDate(todayKey(new Date(n.builtAt)))} from ${n.sources.length ? n.sources.map(esc).join(', ') : 'the reading list'}: ${pl(n.cards.length, 'flashcard')}, ${pl(n.mcqs.length, 'quiz question')}, ${pl(n.cases.length, 'case')}. Building again replaces them.
        <div class="row" style="margin-top:8px">${D.subjects[c.id] ? `<button class="btn small" data-go="#/topic/${esc(c.id)}/${esc(t.id)}">Open the topic</button>` : ''}<button class="btn small bad" id="btClear">Remove these notes</button></div></div>` : ''}
      <div class="card"><h2>What should Claude read?</h2>
        <div id="btFiles"><p class="muted">Checking the files…</p></div>
        <div class="row" style="margin-top:8px"><button class="btn small" id="btAdd">＋ Add slides, notes or another file</button><span class="spacer"></span><span class="muted" id="btSize"></span></div>
        <label class="field" style="margin-top:12px"><span>Anything Claude should know (optional)</span><textarea id="btExtra" style="min-height:70px" placeholder="e.g. The professor stressed the dissent in class. Skip the further readings."></textarea></label>
        <div class="row"><button class="btn primary" id="btGo">✨ Build this week’s notes</button><button class="btn" id="btPaste">📋 Use Claude in your browser</button></div></div>
      <div id="btOut"></div></div>`;
  }

  async function afterTopic(cid, tid) {
    const c = findCourse(cid);
    const t = c && c.units.flatMap(u => u.topics).find(x => x.id === tid);
    if (!t) return;
    const sem = c.semester || D.degree.current;
    const extra = extraFiles[tid] = extraFiles[tid] || [];
    const listed = t.readings.filter(r => r.file);
    const info = listed.length ? await api().describe(listed.map(r => ({ rel: r.file })), sem) : [];
    const rows = listed.map((r, i) => ({ key: 'r' + i, label: r.title, file: { rel: r.file }, info: info[i], on: info[i] && info[i].ok }));
    const draw = () => {
      const all = rows.concat(extra.map((f, i) => ({ key: 'x' + i, label: f.name, file: f.rel ? { rel: f.rel } : { abs: f.abs }, info: { ok: true, size: f.size, pages: f.pages }, on: f.on !== false, extra: i })));
      $('#btFiles').innerHTML = (all.length ? all.map(x => `<label class="row" style="margin-bottom:6px;align-items:flex-start"><input type="checkbox" data-src="${x.key}" ${x.on ? 'checked' : ''} ${x.info && x.info.ok ? '' : 'disabled'}>
          <span class="grow">${esc(x.label)}<br><small class="muted">${x.info && x.info.ok ? `${MB(x.info.size)}${x.info.pages ? ` · ${pl(x.info.pages, 'page')}` : ''}` : esc((x.info && x.info.error) || 'not found')}</small></span>${x.extra != null ? `<button class="btn small ghost" data-unx="${x.extra}">✕</button>` : ''}</label>`).join('') : '<p class="muted">No files are linked to this topic’s readings. Add some below, or build from the reading list alone.</p>')
        + (t.readings.length > listed.length ? `<p class="muted" style="font-size:.86em">Not in the folder: ${t.readings.filter(r => !r.file).map(r => esc(r.title)).join('; ')}</p>` : '');
      const chosen = all.filter(x => x.on && x.info && x.info.ok);
      const size = chosen.reduce((a, x) => a + (x.info.size || 0) * (/\.pdf$/i.test(x.file.rel || x.file.abs || '') ? 1.34 : 1), 0);
      $('#btSize').innerHTML = `${chosen.length} file${chosen.length === 1 ? '' : 's'} · ${MB(size)} of 30 MB${size > LIMIT ? ' — <strong>too much; untick some</strong>' : ''}`;
      $$('[data-src]').forEach(cb => cb.onchange = () => { const x = all.find(y => y.key === cb.dataset.src); if (x.extra != null) extra[x.extra].on = cb.checked; else x.on = cb.checked; draw(); });
      $$('[data-unx]').forEach(b => b.onclick = e => { e.preventDefault(); extra.splice(+b.dataset.unx, 1); draw(); });
      return chosen;
    };
    let chosen = draw();
    const refresh = () => { chosen = draw(); };
    $('#btAdd').onclick = async () => { const r = await api().pick({ semester: sem, title: 'Add files for Claude to read' }); if (r) { extra.push(...r); refresh(); } };
    const clear = $('#btClear');
    if (clear) clear.onclick = async () => { if (!confirm('Remove this topic’s built notes? Its flashcard progress stays, but the cards leave the course.')) return; const cc = copy(c); cc.units.flatMap(u => u.topics).find(x => x.id === tid).notes = null; await saveCourse(cc, `#/builder?course=${cid}&topic=${tid}`); };
    const out = $('#btOut');
    const names = () => chosen.map(x => x.file.rel ? x.file.rel.split('/').pop() : x.label);
    const accept = (text, meta) => {
      const notes = F.normalizeNotes(F.extractJson(text), { ...meta, builtAt: Date.now() });
      store().notes[tid] = { notes, usage: meta.usage || null, at: Date.now() };
      LQ.save(true);
      preview(out, c, t);
    };
    $('#btGo').onclick = async () => {
      refresh();
      const res = await runJob(out, { system: SYSTEM, prompt: notesPrompt(c, t, names(), $('#btExtra').value.trim()), files: chosen.map(x => x.file), semester: sem, effort: 'high' }, 45000);
      if (!res.ok) { out.innerHTML = `<div class="callout warn">${esc(res.error)}${res.skipped && res.skipped.length ? `<br><small>${res.skipped.map(esc).join('<br>')}</small>` : ''}</div>`; return; }
      try { accept(res.text, { model: res.model, sources: res.sent, usage: res.usage }); }
      catch (e) { out.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
      if (res.skipped && res.skipped.length) LQ.toast(`Skipped: ${res.skipped.join('; ')}`);
    };
    $('#btPaste').onclick = () => { refresh(); pastePanel(out, { prompt: notesPrompt(c, t, names(), $('#btExtra').value.trim()), files: names(), onReply: text => accept(text, { model: 'Claude (browser)', sources: names() }) }); };
    if (store().notes[tid]) preview(out, c, t);
  }

  function preview(box, c, t) {
    const d = store().notes[t.id];
    if (!d) return;
    const n = d.notes;
    // Until the notes are saved their cases aren't in the case bank, so show case links by name.
    const named = s => String(s || '').replace(/\[\[c:([\w-]+)(?:\|([^\]]+))?\]\]/g, (m, k, label) => { const c = n.cases.find(x => x.key === k); return label || (c ? `*${c.name}*` : m); });
    box.innerHTML = `<div class="card" style="margin-top:16px"><div class="row between"><h2 style="margin:0">🔍 Check the notes, then save</h2><small class="muted">${esc(usageLine(d.usage))}</small></div>
      <div class="row" style="margin:10px 0">${[[n.cards.length, 'flashcard'], [n.mcqs.length, 'quiz question'], [n.cases.length, 'case'], [n.loci.length, 'palace image'], [n.mnemonics.length, 'memory hook']].map(([k, l]) => `<span class="chip">${pl(k, l)}</span>`).join('')}</div>
      ${n.gist ? `<div class="callout tip"><strong>Gist:</strong> ${LQ.md(named(n.gist)).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}
      <div class="prose" style="max-height:420px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:10px 14px">${LQ.md(named(n.guide))}</div>
      ${n.cases.length ? `<h3>Cases</h3><ul>${n.cases.map(k => `<li><strong>${esc(k.name)}</strong> ${k.cite ? `<small class="muted">${esc(k.cite)}</small>` : ''} — ${esc(k.oneLine)}</li>`).join('')}</ul>` : ''}
      ${n.cards.length ? `<details><summary>The flashcards</summary><ol>${n.cards.map(x => `<li>${x.type === 'cloze' ? esc(x.text.replace(/\{\{|\}\}/g, '')) : `${esc(x.front)} <span class="muted">→ ${esc(x.back)}</span>`}</li>`).join('')}</ol></details>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn primary" id="bnSave">💾 Save to the course</button><button class="btn bad" id="bnDrop">Discard</button></div></div>`;
    $('#bnSave', box).onclick = async () => {
      const cc = copy(findCourse(c.id));
      cc.units.flatMap(u => u.topics).find(x => x.id === t.id).notes = n;
      delete store().notes[t.id];
      if (!(await saveCourse(cc, `#/builder?course=${c.id}`))) store().notes[t.id] = d;
    };
    $('#bnDrop', box).onclick = () => { if (!confirm('Discard these notes?')) return; delete store().notes[t.id]; LQ.save(true); box.innerHTML = ''; };
  }

  /* On Today: which week's notes are due to be built. */
  LQ.builderNudge = function builderNudge() {
    const out = [];
    for (const c of courses()) {
      if ((c.semester || D.degree.current) !== D.activeSemester) continue;
      const wk = F.currentWeek(c, todayKey());
      if (!wk) continue;
      const todo = c.units.flatMap(u => u.topics).filter(t => weekIncludes(t.week, wk) && !t.notes);
      if (todo.length) out.push(`<div class="item click" data-go="#/builder?course=${esc(c.id)}&topic=${esc(todo[0].id)}"><span>🛠️</span><span class="grow"><strong>${esc(c.short)} week ${wk}:</strong> build the notes for ${todo.map(t => esc(t.title)).join(', ')}</span><span>→</span></div>`);
    }
    return out.length ? `<div class="card" style="margin-bottom:16px"><h2>📚 This week’s notes to build</h2><div class="list">${out.join('')}</div></div>` : '';
  };
})();
