// Retention logic: scoring typed and free-recall answers, finding weak spots, building interleaved
// and case drills, and working out which topics are due for a spaced closed-book recall.
// No DOM or app state in here, so it can be tested on its own (test/retention.test.js).
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const LQ = root.LQ = root.LQ || {};

  const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her his '
    + 'how if in into is it its may might must no not of on or our she should so such than that the their them then '
    + 'there these they this those to under upon was we were what when where which while who whom why will with '
    + 'would you your also only any each every other same some very more most less one two three been being '
    + 'over just like held holds hold case court courts judge judges where whether because about after before '
    + 'between against within without through during unless until s ss art arts r o rule rules section sections '
    + 'act acts v vs').split(' '));

  // Plain words from a card's markdown: links, emphasis and code marks removed.
  function plain(text) {
    return String(text || '')
      .replace(/\[\[[cs]:[^\]|]*\|([^\]]+)\]\]/g, ' $1 ')
      .replace(/\[\[c:([^\]]+)\]\]/g, ' $1 ')
      .replace(/\[\[s:[^\]]*?\/([^\]]+)\]\]/g, ' s $1 ')
      .replace(/\{\{|\}\}/g, ' ')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/[’‘]/g, "'");
  }

  // A rough stem, enough to match "leases" with "lease" or "objected" with "objection". A final "e" is
  // dropped so that "lease", "leases" and "leased" all meet at "leas".
  function stem(w) {
    if (/^\d/.test(w)) return w;
    let s = w;
    for (const suf of ['ations', 'ation', 'ions', 'ion', 'ings', 'ing', 'ments', 'ment', 'ies', 'ied', 'es', 'ed', 'ly', 's']) {
      if (suf === 'es' && !/(ss|sh|ch|x|z)es$/.test(w)) continue; // "boxes" → "box", but "leases" → "lease" via "s"
      if (suf === 's' && w.endsWith('ss')) continue; // "witness" is not a plural
      if (w.length - suf.length >= 4 && w.endsWith(suf)) { s = suf === 'ies' || suf === 'ied' ? w.slice(0, -3) + 'y' : w.slice(0, -suf.length); break; }
    }
    return s.length > 4 && s.endsWith('e') ? s.slice(0, -1) : s;
  }

  // The words that carry meaning: no stop-words, at least four letters, or any number ("1950", "21").
  // Each comes back as its stem (for matching) and the word as written (for showing).
  function terms(text) {
    const out = [];
    const seen = new Set();
    for (const raw of plain(text).toLowerCase().split(/[^a-z0-9.]+/)) {
      const w = raw.replace(/^\.+|\.+$/g, '');
      if (!w || STOP.has(w)) continue;
      if (!/^\d+[a-z]?$/.test(w) && w.length < 4) continue;
      const st = stem(w.replace(/\./g, ''));
      if (st && !seen.has(st)) { seen.add(st); out.push({ s: st, w }); }
    }
    return out;
  }
  const keyTerms = text => terms(text).map(t => t.s);

  // How much of the target's meaning the answer contains: the share of its key terms present.
  // hit and miss list the target's words as written. Only the first twelve count: a long answer
  // leads with its point (a case card's one-line holding), and the detail after it is not required.
  function coverage(answer, target) {
    const want = terms(target).slice(0, 12);
    if (!want.length) return { score: 0, hit: [], miss: [], total: 0 };
    const have = new Set(keyTerms(answer));
    const hit = want.filter(t => have.has(t.s)).map(t => t.w);
    return { score: hit.length / want.length, hit, miss: want.filter(t => !have.has(t.s)).map(t => t.w), total: want.length };
  }

  // A suggested grade for a typed answer (1 Again · 2 Hard · 3 Good · 4 Easy). The student still decides.
  function suggestGrade(score) {
    return score < 0.25 ? 1 : score < 0.5 ? 2 : score < 0.8 ? 3 : 4;
  }

  // What a card asks and what it expects, for both basic and cloze cards.
  function cardPoint(card) {
    if (card.type === 'cloze') {
      const answers = [];
      String(card.text || '').replace(/\{\{(.+?)\}\}/g, (m, a) => { answers.push(a); return m; });
      return { id: card.id, prompt: String(card.text || '').replace(/\{\{(.+?)\}\}/g, '[ … ]'), answer: answers.join(' · ') };
    }
    return { id: card.id, prompt: card.front || '', answer: card.back || '' };
  }

  // Free recall: which of the topic's points the student wrote down. A point counts as recalled when
  // enough of its key terms appear (at least one, and the threshold share of up to four of them).
  function scoreRecall(text, cards, threshold = 0.4) {
    const have = new Set(keyTerms(text));
    const points = cards.map(c => {
      const p = cardPoint(c);
      const want = keyTerms(p.answer).slice(0, 12);
      const hit = want.filter(t => have.has(t));
      const need = Math.max(1, Math.ceil(Math.min(4, want.length) * threshold));
      return { ...p, terms: want.length, hits: hit.length, recalled: want.length > 0 && hit.length >= need };
    }).filter(p => p.terms > 0);
    const recalled = points.filter(p => p.recalled).length;
    return { points, recalled, total: points.length, pct: points.length ? Math.round((recalled / points.length) * 100) : 0 };
  }

  // Cards the student keeps forgetting: lapses and a low ease score, worst first.
  function weakCards(cards, states, limit = 40) {
    return cards.map(c => {
      const st = states[c.id];
      if (!st || !st.seen) return null;
      const weight = (st.lapses || 0) * 2 + Math.max(0, 2.5 - (st.ef || 2.5)) * 4;
      return weight >= 1.5 ? { card: c, weight, lapses: st.lapses || 0, ef: st.ef || 2.5 } : null;
    }).filter(Boolean).sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  // Quiz questions answered wrongly more often than not (or at all, if tried only once or twice).
  function weakQuestions(questions, record, limit = 30) {
    return questions.map(q => {
      const r = record[q.id];
      if (!r || !r.n) return null;
      const acc = r.ok / r.n;
      return acc < 2 / 3 - 1e-9 ? { q, acc, n: r.n } : null;
    }).filter(Boolean).sort((a, b) => a.acc - b.acc || b.n - a.n).slice(0, limit);
  }

  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Case drill: "Which case held …?" with three wrong names from the same subject.
  function caseQuestions(subject, n = 12, rnd = Math.random) {
    const cases = Object.entries(subject.cases || {}).filter(([, c]) => c && c.name && c.oneLine);
    if (cases.length < 4) return [];
    return shuffled(cases, rnd).slice(0, n).map(([key, c]) => {
      const wrong = shuffled(cases.filter(([k]) => k !== key), rnd).slice(0, 3).map(([, x]) => x.name);
      const options = shuffled([c.name, ...wrong], rnd);
      return { id: `case:${subject.id}:${key}`, topic: (c.topic || ''), q: `Which case? ${c.oneLine}`, options, answer: options.indexOf(c.name), why: `**${c.name}**${c.cite ? ` — ${c.cite}` : ''}.` };
    });
  }

  // Table cells of one markdown row; a "|" inside [[…]] (a link label) doesn't split.
  function cells(line) {
    const out = []; let cur = '', depth = 0;
    const s = line.trim().replace(/^\||\|$/g, '');
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith('[[', i)) { depth++; cur += '[['; i++; continue; }
      if (s.startsWith(']]', i) && depth) { depth--; cur += ']]'; i++; continue; }
      if (s[i] === '|' && !depth) { out.push(cur.trim()); cur = ''; continue; }
      cur += s[i];
    }
    out.push(cur.trim());
    return out;
  }

  // The rows of a guide's "Key words" (or "Key terms") table: [{ term, meaning }].
  function keyWordRows(guide) {
    const g = String(guide || '');
    const m = g.match(/^#{2,4}\s*Key (?:words|terms)\b[^\n]*\n((?:[ \t]*\n)*(?:\|[^\n]*\n?)+)/m);
    if (!m) return [];
    return m[1].split('\n').filter(l => /^\s*\|/.test(l)).slice(2).map(cells)
      .filter(c => c.length >= 2 && c[0] && c[1])
      .map(c => ({ term: c[0].replace(/\*\*|__/g, '').trim(), meaning: c[1] }))
      .filter(r => r.term && r.meaning);
  }

  // Hide the words that would give the answer away. Matching is by stem, so "rights" hides "right" and
  // "policies" hides "policy"; a possessive ("Ash’s") loses its name and keeps the "’s".
  const wordStem = w => stem(w.toLowerCase());
  function redact(text, words) {
    const hide = new Set(words.filter(w => w && w.length >= 3).map(wordStem));
    if (!hide.size) return String(text || '');
    const hit = w => hide.has(wordStem(w));
    // A [[…]] link is kept whole, or replaced whole when it names a hidden word (it would open the answer).
    return String(text || '').replace(/\[\[[^\]]*\]\]|\p{L}[\p{L}\p{M}]*/gu, w => (w.startsWith('[[')
      ? ((w.match(/\p{L}[\p{L}\p{M}]*/gu) || []).some(hit) ? '___' : w)
      : (hit(w) ? '___' : w)));
  }
  const NAME_SKIP = new Set(['the', 'and', 'state', 'union', 'india', 'ltd', 'limited', 'company', 'corporation', 'others', 'anr', 'ors', 'reg', 'regina', 'rex', 'king', 'queen', 'board', 'bank', 'commissioner', 'government', 'secretary', 'parte', 'for', 'case', 'association', 'trust', 'society', 'council', 'municipal', 'district', 'collector', 'officer']);
  // The words of a case title worth hiding: party names and any short name in brackets ("(Sabarimala)").
  const nameWords = name => String(name || '').split(/[^\p{L}\p{M}]+/u).filter(w => w.length >= 3 && !NAME_SKIP.has(w.toLowerCase()));
  // The words of a key word worth hiding: all of a one-word term, the meaningful ones of a longer term.
  const termWords = term => { const ws = String(term).split(/[^\p{L}\p{M}]+/u).filter(Boolean); return ws.length === 1 ? ws : ws.filter(w => w.length >= 3 && !STOP.has(w.toLowerCase())); };
  const firstSentences = (text, max = 280) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
    return (end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + ' …';
  };

  // How many questions a topic's quiz should have: more notes, more questions. About one for every
  // 100 words of the guide, at least 6 and at most 20, on top of the questions written for it.
  function quizSize(guide) {
    const words = String(guide || '').split(/\s+/).filter(Boolean).length;
    return Math.max(6, Math.min(20, Math.round(words / 100)));
  }

  // A topic's quick quiz: the questions written for it, plus questions built from its own notes —
  // its case cards ("Which case?" from the holding, then from the facts) and its Key words table
  // (term from meaning, then meaning from term). The more the notes hold, the more questions.
  // Wrong options come from the same topic first, then from the rest of the subject.
  function topicQuiz(subject, topic, opts = {}) {
    const rnd = opts.rnd || Math.random;
    const authored = (subject.mcqs || []).filter(q => q.topic === topic.id);
    const n = opts.size != null ? opts.size : quizSize(topic.guide);
    const allCases = Object.entries(subject.cases || {}).filter(([, c]) => c && c.name);
    const mine = (topic.cases || []).map(k => [k, (subject.cases || {})[k]]).filter(([, c]) => c && c.name);
    const tops = (subject.units || []).flatMap(u => u.topics || []);
    const rows = keyWordRows(topic.guide);
    const otherRows = tops.filter(t => t.id !== topic.id).flatMap(t => keyWordRows(t.guide));
    const pick = (right, near, far, k = 3) => {
      const seen = new Set([right.toLowerCase()]); const out = [];
      for (const x of shuffled(near, rnd).concat(shuffled(far, rnd))) { if (out.length >= k) break; const key = String(x).toLowerCase(); if (!seen.has(key)) { seen.add(key); out.push(x); } }
      return out.length === k ? out : null;
    };
    const mcq = (id, q, right, wrong, why) => { const options = shuffled([right, ...wrong], rnd); return { id, topic: topic.id, q, options, answer: options.indexOf(right), why, generated: true }; };
    const caseName = ([k]) => (subject.cases[k] || {}).name;
    const tiers = [[], [], [], []];
    for (const [key, c] of mine) {
      const near = mine.filter(([k]) => k !== key).map(caseName), far = allCases.filter(([k]) => k !== key && !(topic.cases || []).includes(k)).map(([, x]) => x.name);
      const cite = c.cite ? ` ${/^[([]/.test(c.cite) ? c.cite : `(${c.cite})`}` : '';
      const why = `**${c.name}**${cite}${c.oneLine ? `: ${c.oneLine}` : ''}`;
      const hide = nameWords(c.name);
      if (c.oneLine) { const w = pick(c.name, near, far); if (w) tiers[0].push(mcq(`gen:${topic.id}:case:${key}`, `Which case? ${redact(c.oneLine, hide)}`, c.name, w, why)); }
      if (c.facts) { const w = pick(c.name, near, far); if (w) tiers[2].push(mcq(`gen:${topic.id}:facts:${key}`, `Which case had these facts? ${redact(firstSentences(c.facts), hide)}`, c.name, w, why)); }
    }
    for (const r of rows) {
      const slug = r.term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const hide = termWords(r.term);
      const w = pick(r.term, rows.filter(x => x !== r).map(x => x.term), otherRows.map(x => x.term));
      if (w) tiers[1].push(mcq(`gen:${topic.id}:kw:${slug}`, `Which key word? ${redact(r.meaning, hide)}`, r.term, w, `**${r.term}**: ${r.meaning}`));
      const m = pick(r.meaning, rows.filter(x => x !== r).map(x => x.meaning), otherRows.map(x => x.meaning));
      if (m) tiers[3].push(mcq(`gen:${topic.id}:mean:${slug}`, `What does **${r.term}** mean?`, r.meaning, m, `**${r.term}**: ${r.meaning}`));
    }
    // Fill the quiz tier by tier; within the first two, alternate cases and key words so a short quiz has both.
    const out = [];
    const lanes = [shuffled(tiers[0], rnd), shuffled(tiers[1], rnd)];
    while (out.length < n && lanes.some(l => l.length)) for (const l of lanes) if (l.length && out.length < n) out.push(l.shift());
    for (const t of [tiers[2], tiers[3]]) for (const q of shuffled(t, rnd)) if (out.length < n) out.push(q);
    return authored.concat(out);
  }

  // Interleaved quiz: questions from every topic of a subject, spread so the same topic rarely comes twice in a row.
  function interleave(questions, n = 15, rnd = Math.random) {
    const byTopic = {};
    for (const q of shuffled(questions, rnd)) (byTopic[q.topic || '?'] = byTopic[q.topic || '?'] || []).push(q);
    const lanes = shuffled(Object.values(byTopic), rnd);
    const out = [];
    while (out.length < n && lanes.some(l => l.length)) for (const l of lanes) { if (l.length && out.length < n) out.push(l.shift()); }
    return out;
  }

  // Spaced closed-book recall: a topic learnt on day 0 is due on days 1, 3, 7 and 14 after, unless
  // it was recalled on or after that checkpoint. Returns the due topics, the longest-waiting first.
  const CHECKPOINTS = [1, 3, 7, 14];
  function recallDue(topics, recallLog, now = Date.now()) {
    const DAY = 86400000;
    const out = [];
    for (const [id, ts] of Object.entries(topics || {})) {
      const learnt = ts && ts.steps && (ts.steps.learn || ts.steps.write);
      if (!learnt) continue;
      const age = Math.floor((now - learnt) / DAY);
      const cp = CHECKPOINTS.filter(d => d <= age).pop();
      if (!cp) continue;
      const since = learnt + cp * DAY;
      const done = (recallLog[id] || []).some(r => r.t >= since);
      if (!done) out.push({ id, checkpoint: cp, age });
    }
    return out.sort((a, b) => b.age - a.age);
  }

  LQ.retention = { keyTerms, coverage, suggestGrade, cardPoint, scoreRecall, weakCards, weakQuestions, caseQuestions, interleave, recallDue, CHECKPOINTS, keyWordRows, quizSize, topicQuiz };
})();
