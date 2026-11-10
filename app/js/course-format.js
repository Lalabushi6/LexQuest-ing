// Built courses: the JSON format the Course Builder saves, and how it becomes an ordinary subject.
// A course is made from its manual (weeks, topics, readings), then each topic gets its notes when its
// week comes round. Everything that arrives from Claude (or a pasted reply) is checked and cleaned
// here before it is kept, and everything is plain data. No DOM in here, so it can be tested alone.
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const F = root.LQ_COURSE = {};
  const FORMAT = 'lexquest-course', VERSION = 1;
  F.FORMAT = FORMAT; F.VERSION = VERSION;

  /* ---------- small helpers ---------- */
  const str = (v, max = 4000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\r\n?/g, '\n').trim().slice(0, max);
  const arr = v => (Array.isArray(v) ? v : []);
  const slug = (s, max = 30) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '');
  // A short stable id from text, so rebuilding a topic keeps the same card ids for the same cards.
  const hash = s => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
  const tierOf = v => ([1, 2, 3].includes(Number(v)) ? Number(v) : 2);
  F.slug = slug; F.hash = hash;

  // LexQuest's markdown is small. Bring anything else into it rather than showing raw symbols.
  F.cleanMd = function cleanMd(s, max = 60000) {
    return str(s, max).split('\n')
      .filter(l => !/^\s*```/.test(l))
      .map(l => l
        .replace(/^#{4,}\s+/, '### ').replace(/^#\s+/, '## ')
        .replace(/^\s+([-*•])\s+/, '- ').replace(/^\*\s+/, '- ')
        .replace(/\[([^\]\n]+)\]\((?:https?:|#)[^)]*\)/g, '$1')
        .replace(/<\/?(?:b|i|u|em|strong|br|p|div|span|a|sup|sub)\b[^>]*>/gi, ''))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  // The first JSON object in a reply, ignoring code fences or a sentence around it.
  F.extractJson = function extractJson(text) {
    const t = String(text || '').replace(/^﻿/, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('There is no JSON object in that reply.');
    const body = t.slice(a, b + 1);
    try { return JSON.parse(body); } catch (first) {
      try { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); } catch { throw new Error(`That reply isn’t valid JSON (${first.message}). Ask Claude to send only the JSON again.`); }
    }
  };

  // "2–3", "Week 4", "Weeks 7 and 8" -> 2, 4, 7.
  F.firstWeek = w => { const m = String(w || '').match(/\d+/); return m ? Number(m[0]) : null; };
  F.currentWeek = function currentWeek(course, today) {
    if (!course.weekOneStarts || !/^\d{4}-\d{2}-\d{2}$/.test(course.weekOneStarts)) return null;
    const [y, m, d] = course.weekOneStarts.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
    const days = Math.round((new Date(ty, tm - 1, td) - new Date(y, m - 1, d)) / 86400000);
    return days < 0 ? 0 : Math.floor(days / 7) + 1;
  };

  /* ---------- the syllabus, from the manual ---------- */
  F.newCourse = function newCourse(form) {
    const id = slug(form.id || form.short || form.name, 24) || 'course';
    return {
      format: FORMAT, version: VERSION, id,
      name: str(form.name, 120) || 'New course', short: str(form.short, 24) || str(form.name, 24) || 'Course',
      icon: str(form.icon, 8) || '📘', semester: Number(form.semester) || null, folder: str(form.folder, 300).replace(/\\/g, '/').replace(/\/$/, ''),
      weekOneStarts: /^\d{4}-\d{2}-\d{2}$/.test(form.weekOneStarts || '') ? form.weekOneStarts : '',
      manual: form.manual ? { file: str(form.manual.rel || form.manual.name, 400), name: str(form.manual.name, 200) } : null,
      exams: form.examDate && /^\d{4}-\d{2}-\d{2}$/.test(form.examDate) ? [{ date: form.examDate, title: `${str(form.short, 24) || 'Course'} end-term`, note: '' }] : [],
      blurb: '', about: '', paperPattern: '', instructorItems: [], units: [], created: Date.now(), updated: Date.now()
    };
  };

  F.normalizeSyllabus = function normalizeSyllabus(raw, course) {
    const c = JSON.parse(JSON.stringify(course));
    c.blurb = str(raw.blurb, 300);
    c.about = F.cleanMd(raw.about, 12000);
    c.paperPattern = F.cleanMd(raw.paperPattern, 1500);
    c.instructorItems = arr(raw.instructorItems).map(x => str(x, 400)).filter(Boolean).slice(0, 40);
    let n = 0;
    c.units = arr(raw.units).slice(0, 40).map(u => ({
      title: str(u && u.title, 160) || 'Unit',
      topics: arr(u && u.topics).slice(0, 20).map(t => ({
        id: `${c.id}-t${++n}`,
        title: str(t && t.title, 160) || `Topic ${n}`,
        subtitle: str(t && t.subtitle, 120),
        week: str(t && t.week, 20),
        tier: tierOf(t && t.tier),
        readings: arr(t && t.readings).slice(0, 40).map(r => ({
          title: str(r && (r.title || r), 300),
          kind: ['reading', 'case', 'act'].includes(r && r.kind) ? r.kind : 'reading',
          tier: tierOf(r && r.tier), file: ''
        })).filter(r => r.title),
        sections: arr(t && t.sections).map(x => str(x, 120)).filter(Boolean).slice(0, 40),
        questions: arr(t && t.questions).map(x => str(x, 600)).filter(Boolean).slice(0, 20),
        notes: null
      })).filter(t => t.title)
    })).filter(u => u.topics.length);
    if (!c.units.length) throw new Error('No weeks or topics came back. Check that the right file is the course manual.');
    for (const e of arr(raw.exams)) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(e && e.date) ? e.date : '';
      if (date && !c.exams.some(x => x.date === date)) c.exams.push({ date, title: str(e.title, 80) || `${c.short} exam`, note: str(e.note, 120) });
    }
    c.updated = Date.now();
    return c;
  };

  /* ---------- a topic's notes, from its readings ---------- */
  F.normalizeNotes = function normalizeNotes(raw, meta = {}) {
    const cases = [];
    const seen = new Set();
    for (const k of arr(raw.cases).slice(0, 30)) {
      const name = str(k && k.name, 200);
      if (!name) continue;
      let key = slug(k.key || name, 24) || 'case';
      while (seen.has(key)) key += 'x';
      seen.add(key);
      cases.push({ key, name, cite: str(k.cite, 200), oneLine: str(k.oneLine, 400), facts: F.cleanMd(k.facts, 2000), issue: F.cleanMd(k.issue, 1000), held: F.cleanMd(k.held, 3000), use: F.cleanMd(k.use, 1000), hook: F.cleanMd(k.hook, 600) });
    }
    const cards = [];
    for (const c of arr(raw.cards).slice(0, 80)) {
      if (c && typeof c.cloze === 'string' && /\{\{.+?\}\}/.test(c.cloze)) cards.push({ type: 'cloze', text: F.cleanMd(c.cloze, 800) });
      else if (c && str(c.front) && str(c.back)) cards.push({ type: 'basic', front: F.cleanMd(c.front, 600), back: F.cleanMd(c.back, 1500) });
    }
    const mcqs = [];
    for (const q of arr(raw.mcqs).slice(0, 25)) {
      const options = arr(q && q.options).map(o => str(o, 300)).filter(Boolean).slice(0, 6);
      const answer = Number(q && q.answer);
      if (!str(q && q.q) || options.length < 2 || !(answer >= 0 && answer < options.length) || new Set(options).size !== options.length) continue;
      mcqs.push({ q: F.cleanMd(q.q, 600), options, answer, why: F.cleanMd(q.why, 600) });
    }
    const council = {};
    for (const k of ['contrarian', 'first', 'expansion', 'outsider', 'executor']) { const v = F.cleanMd(raw.council && raw.council[k], 3000); if (v) council[k] = v; }
    const notes = {
      builtAt: meta.builtAt || Date.now(), model: str(meta.model, 60), sources: arr(meta.sources).map(x => str(x, 200)).slice(0, 40),
      gist: F.cleanMd(raw.gist, 1200), prime: arr(raw.prime).map(x => str(x, 400)).filter(Boolean).slice(0, 6),
      examFocus: F.cleanMd(raw.examFocus, 1500), guide: F.cleanMd(raw.guide, 60000), modelSummary: F.cleanMd(raw.modelSummary, 3000),
      mnemonics: arr(raw.mnemonics).map(x => F.cleanMd(x, 400)).filter(Boolean).slice(0, 8),
      council: Object.keys(council).length ? council : null, cases, cards, mcqs,
      loci: arr(raw.loci).slice(0, 12).map(l => ({ spot: str(l && l.spot, 120), image: F.cleanMd(l && l.image, 500), meaning: F.cleanMd(l && l.meaning, 300) })).filter(l => l.spot && l.image && l.meaning),
      lastHour: arr(raw.lastHour).map(x => F.cleanMd(x, 400)).filter(Boolean).slice(0, 10)
    };
    if (!notes.guide && !notes.cards.length) throw new Error('The reply has no notes or flashcards in it.');
    return notes;
  };

  /* ---------- matching the manual's readings to files in the course folder ---------- */
  const STOP = new Set('the and for with from that this into pdf docx pptx txt html htm chapter chapters pages page vol edn edition excerpts excerpt extract extracts reading readings part further supplementary optional notes versus ors anr others ltd pvt india indian state'.split(' '));
  const words = s => (String(s || '').toLowerCase().normalize('NFKD').replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9\s]/g, ' ').match(/[a-z]{3,}|\d{4}/g) || []).filter(w => !STOP.has(w));
  F.matchFiles = function matchFiles(title, files, limit = 8) {
    const want = [...new Set(words(title))];
    if (!want.length) return [];
    return files.map(f => {
      const have = new Set(words(f.rel));
      const hits = want.filter(w => have.has(w)).length;
      return { ...f, score: Math.round((hits / want.length) * 100) / 100 };
    }).filter(f => f.score > 0).sort((a, b) => b.score - a.score || a.rel.length - b.rel.length).slice(0, limit);
  };
  // Fill in a file for each reading only where the best match is clear.
  F.autoMatch = function autoMatch(course, files) {
    let n = 0;
    for (const u of course.units) for (const t of u.topics) for (const r of t.readings) {
      if (r.file) continue;
      const [best, next] = F.matchFiles(r.title, files, 2);
      if (best && best.score >= 0.6 && (!next || best.score - next.score >= 0.15)) { r.file = best.rel; n++; }
    }
    return n;
  };

  /* ---------- a course becomes a subject ---------- */
  F.stats = course => {
    const topics = course.units.flatMap(u => u.topics);
    return { topics: topics.length, built: topics.filter(t => t.notes).length, cards: topics.reduce((a, t) => a + (t.notes ? t.notes.cards.length : 0), 0) };
  };

  function skeletonGuide(t) {
    const lines = ['### What the manual sets'];
    for (const r of t.readings) lines.push(`- ${r.kind === 'case' ? '⚖️ ' : ''}${r.title}${r.tier === 1 ? ' **(mandatory)**' : r.tier === 3 ? ' *(further)*' : ''}`);
    if (t.sections.length) lines.push('### Provisions', ...t.sections.map(s => `- ${s}`));
    if (t.questions.length) lines.push('### The manual’s questions to consider', ...t.questions.map(q => `- ${q}`));
    lines.push('!tip The notes for this week haven’t been built yet. Open the Course Builder when you reach this week and build them from the readings.');
    return lines.join('\n');
  }

  F.toData = function toData(course) {
    const sid = course.id;
    const localKeys = new Map(); // a case key as Claude wrote it -> its id in the app
    for (const u of course.units) for (const t of u.topics) for (const k of (t.notes ? t.notes.cases : [])) if (!localKeys.has(k.key)) localKeys.set(k.key, `${sid}-${k.key}`);
    const link = s => String(s || '').replace(/\[\[c:([\w-]+)(\|[^\]]*)?\]\]/g, (m, k, label) => (localKeys.has(k) ? `[[c:${localKeys.get(k)}${label || ''}]]` : label ? label.slice(1) : m));
    const subject = {
      id: sid, name: course.name, short: course.short, icon: course.icon || '📘', folder: course.folder || '', blurb: course.blurb || '',
      builtCourse: true, packDue: 'week by week in the Course Builder',
      about: [link(course.about), course.instructorItems && course.instructorItems.length ? `### Ask your instructor\n${course.instructorItems.map(x => `- ${x}`).join('\n')}` : '', '!warn Built with the Course Builder from your course manual and readings. Check anything important against the readings themselves.'].filter(Boolean).join('\n'),
      paperPattern: course.paperPattern || '', units: [], cards: [], mcqs: [], cases: {}
    };
    if (course.semester) subject.semester = course.semester;
    const rooms = [];
    let built = 0, total = 0;
    for (const u of course.units) {
      const unit = { title: u.title, topics: [] };
      for (const t of u.topics) {
        total++;
        const n = t.notes;
        const topic = { id: t.id, title: t.title, subtitle: t.subtitle, week: t.week, tier: t.tier, readings: t.readings.map(r => ({ title: r.title, file: r.file || '', tier: r.tier, kind: r.kind })) };
        if (n) {
          built++;
          Object.assign(topic, { gist: link(n.gist), prime: n.prime.length ? n.prime : t.questions.slice(0, 4), examFocus: link(n.examFocus), guide: link(n.guide), modelSummary: link(n.modelSummary), mnemonics: n.mnemonics.map(link), cases: n.cases.map(k => localKeys.get(k.key)) });
          if (n.council) topic.council = Object.fromEntries(Object.entries(n.council).map(([k, v]) => [k, link(v)]));
          for (const k of n.cases) {
            const id = localKeys.get(k.key);
            if (!subject.cases[id]) subject.cases[id] = { name: k.name, cite: k.cite, oneLine: k.oneLine, facts: link(k.facts), issue: link(k.issue), held: link(k.held), use: link(k.use), hook: link(k.hook), file: (t.readings.find(r => r.kind === 'case' && r.file && words(r.title).some(w => words(k.name).includes(w))) || {}).file || '' };
          }
          const used = new Set();
          for (const c of n.cards) {
            let id = `${t.id}-${hash(c.type === 'cloze' ? c.text : c.front)}`;
            while (used.has(id)) id += 'x';
            used.add(id);
            subject.cards.push(c.type === 'cloze' ? { id, topic: t.id, type: 'cloze', text: link(c.text) } : { id, topic: t.id, type: 'basic', front: link(c.front), back: link(c.back) });
          }
          n.mcqs.forEach((q, i) => subject.mcqs.push({ id: `${t.id}-q${hash(q.q)}${i}`, topic: t.id, q: link(q.q), options: q.options, answer: q.answer, why: link(q.why) }));
          if (n.loci.length) rooms.push({ name: t.title.slice(0, 48), icon: '🚪', loci: n.loci.map((l, i) => ({ id: `${t.id}-l${i + 1}`, spot: l.spot, image: link(l.image), meaning: link(l.meaning), topic: t.id })) });
        } else {
          Object.assign(topic, { gist: t.subtitle || '', prime: t.questions.slice(0, 4), guide: skeletonGuide(t) });
        }
        unit.topics.push(topic);
      }
      subject.units.push(unit);
    }
    subject.contentLevel = built && built === total ? 'full' : built ? 'partial' : 'syllabus';
    // The last-hour sheet is compiled from each built topic's own summary lines.
    const sheet = course.units.flatMap(u => u.topics).filter(t => t.notes);
    if (sheet.length) subject.lastHour = `### ${course.name} — the last hour\n` + sheet.map(t => `**${t.title}**\n` + (t.notes.lastHour.length ? t.notes.lastHour : [t.notes.gist]).map(x => `- ${link(x)}`).join('\n')).join('\n');
    const exams = (course.exams || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e => ({ subject: sid, date: e.date, title: e.title || `${course.short} exam`, note: e.note || '' }));
    const palaces = rooms.length ? [{ id: `${sid}-palace`, subject: sid, name: `${course.short} palace`, intro: 'Built from each week’s notes. Re-imagine the images in a place you know well.', rooms }] : [];
    return { subject, exams, palaces };
  };

  // Adds built courses to the app's data. A course whose id a course pack already uses is skipped.
  F.apply = function apply(D, entries) {
    const report = [];
    for (const e of entries || []) {
      const name = `Built: ${e.course && e.course.name ? e.course.name : e.file}`;
      if (e.error || !e.course) { report.push({ name, error: e.error || 'unreadable' }); continue; }
      try {
        if (e.course.format !== FORMAT) throw new Error('not a LexQuest course file');
        if (D.subjects[e.course.id]) throw new Error(`a course pack already uses the id "${e.course.id}"`);
        const { subject, exams, palaces } = F.toData(e.course);
        D.subjects[subject.id] = subject;
        D.exams = (D.exams || []).concat(exams);
        D.palaces = (D.palaces || []).concat(palaces);
        report.push({ name });
      } catch (err) { report.push({ name, error: err.message }); }
    }
    return report;
  };
})();
