// Revision and Games logic with no UI (tested in test/revision.test.js): checking a typed answer,
// and building a subject's typing-game question bank from a pack's own data.
//
// A pack can add, per subject id:
//   D.asteroids[sid] = [{ t: topicId, d: 1|2|3, q: 'clue', a: ['accepted', 'answers'], why: 'one line' }]
//   D.revision[sid]  = { title, intro, sections: [{ id, icon, title, topic?, md }] }
// Without them, the bank is built from the subject's key-words tables, flashcards, case cards and
// MCQs, and the Revision page assembles a sheet from the topics.
'use strict';
(function () {
  /* ---------------- text helpers ---------------- */
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // Markdown and app links to plain text; caseName(id) resolves [[c:id]] links.
  const plainWith = caseName => s => String(s || '')
    .replace(/\[\[c:[\w-]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[c:([\w-]+)\]\]/g, (_, id) => caseName(id) || id)
    .replace(/\[\[s:([\w./-]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[s:([\w./-]+)\]\]/g, (_, s) => 's. ' + s.split('/').pop())
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s*/gm, '').replace(/^!\w+\s/gm, '').replace(/\s+/g, ' ').trim();

  /* ---------------- answer matching ---------------- */
  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 're']);
  function norm(s) {
    const words = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`']/g, '').replace(/&/g, ' and ').replace(/\bvs?\.?\b/g, ' v ')
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const kept = words.filter(w => !STOP.has(w));
    return (kept.length ? kept : words).join(' '); // an answer that is only "a" (a clause letter) still counts
  }
  // Optimal-string-alignment distance: a swapped pair of letters counts as one typo.
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 9;
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const digitsOf = s => (s.match(/\d+/g) || []).join(',');
  // True when what was typed is one of the accepted answers (small typos allowed on longer words;
  // numbers must be exact).
  function matches(typed, answers) {
    const t = norm(typed); if (!t) return false;
    const tc = t.replace(/ /g, '');
    for (const raw of answers) {
      const n = norm(raw); if (!n) continue;
      const nc = n.replace(/ /g, '');
      if (t === n || tc === nc) return true;
      if (digitsOf(n) && digitsOf(t) !== digitsOf(n)) continue;
      const tol = /^\d+$/.test(nc) ? 0 : nc.length >= 10 ? 2 : nc.length >= 5 ? 1 : 0;
      if (tol && lev(tc, nc) <= tol) return true;
      // the answer inside a slightly longer phrase
      if (n.length >= 4 && (' ' + t + ' ').includes(' ' + n + ' ') && t.length <= n.length + 14) return true;
    }
    return false;
  }
  // Exact enough to fire without pressing Enter.
  const exactHit = (typed, answers) => { const t = norm(typed).replace(/ /g, ''); return !!t && answers.some(a => norm(a).replace(/ /g, '') === t); };

  /* ---------------- accepted answers ---------------- */
  // Words in case names too common to identify a case on their own.
  const GENERIC = new Set(['state', 'union', 'india', 'government', 'commissioner', 'director', 'secretary', 'people', 'regina', 'king', 'queen', 'crown', 'others', 'another', 'anr', 'ors', 'limited', 'ltd', 'company', 'co', 'bank', 'corporation', 'board', 'municipal', 'council', 'case', 'explorers', 'district', 'collector', 'registrar', 'official', 'liquidator', 'income', 'tax', 'officer', 'superintendent', 'public', 'prosecutor', 'national', 'indian', 'association', 'international', 'airport', 'authority', 'society', 'trust', 'federation', 'workers', 'employees', 'industries', 'mills', 'private', 'chief', 'minister', 'ministry', 'controller', 'general', 'governor', 'municipality', 'commission', 'hotel', 'restaurants', 'foundation', 'tribunal', 'court', 'high', 'supreme']);
  // "Smith v Jones Ltd" -> "smith v jones ltd", "smith"; a name with no "v" -> its distinctive words.
  function caseAliases(name) {
    const clean = String(name).replace(/\(.*?\)/g, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
    const out = new Set([clean.toLowerCase()]);
    const parts = clean.split(/\s+(?:v|vs|versus)\s+/i);
    const firstGood = parts.find(p => !/^(r|re|in re|state|state of \w+|union of india|the state)$/i.test(p.trim())) || parts[0];
    if (parts.length > 1) {
      out.add(firstGood.toLowerCase());
      const words = firstGood.split(' ').filter(w => w.length >= 4 && !GENERIC.has(w.toLowerCase()) && /^[A-Z]/.test(w));
      if (words[0]) out.add(words[0].toLowerCase());
      if (words.length > 1) out.add(words[words.length - 1].toLowerCase());
      if (parts[0] !== firstGood) out.add(parts.join(' v ').toLowerCase());
    } else {
      clean.split(' ').filter(w => w.length >= 5 && /^[A-Z]/.test(w) && !GENERIC.has(w.toLowerCase())).forEach(w => out.add(w.toLowerCase()));
    }
    return [...out].filter(a => a.length >= 3);
  }
  // Hide the answer's words inside a clue built from the notes.
  function maskWords(text, answers) {
    let q = text;
    const words = new Set();
    answers.forEach(a => { words.add(a); a.split(' ').forEach(w => { if (w.length >= 4 && !GENERIC.has(w)) words.add(w); }); });
    [...words].sort((a, b) => b.length - a.length).forEach(w => {
      const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'gi');
      q = q.replace(re, '▢▢▢');
    });
    return q;
  }
  const leaks = (q, answers) => answers.some(a => a.length >= 4 && norm(q).includes(norm(a)));
  const stripParens = s => s.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  // As given, without brackets, and "a / b" alternatives (but "p/e" stays whole).
  const aliasSet = arr => [...new Set(arr.flatMap(a => {
    const l = String(a).toLowerCase().trim(); const p = stripParens(l); const sl = l.split(/\s+\/\s+/);
    return [l, p].concat(sl.length > 1 && sl.every(x => x.length >= 3) ? sl : []);
  }).filter(a => a && a.length <= 60))];
  // Drop answers already printed in the clue ("Clause of s. 13: …" must not accept "13"), keeping one at least.
  function dropLeaks(q, a) {
    const nq = ' ' + norm(q) + ' ';
    const qNums = new Set(norm(q).match(/\d+/g) || []);
    const main = digitsOf(norm(a[0]));
    const keep = a.filter(x => {
      const n = norm(x); if (!n) return true;
      if (nq.includes(' ' + n + ' ')) return false;
      const d = digitsOf(n);
      if (d && d !== main && d.split(',').every(k => qNums.has(k))) return false;
      return true;
    });
    return keep.length ? keep : a;
  }

  /* ---------------- the bank ---------------- */
  // S: a subject; curated: its D.asteroids list; caseName(id): resolves case links.
  // Each item: { id, t, d, q, a, why, show, src: core|kw|card|case|mcq }.
  function buildBank(S, curated, caseName) {
    const plain = plainWith(caseName || (() => null));
    const topics = (S.units || []).flatMap(u => u.topics || []);
    const items = [], seen = new Set();
    const add = it => {
      if (!it.q || !it.a || !it.a.length) return;
      it.a = dropLeaks(it.q, aliasSet(it.a));
      if (!it.show || !it.a.includes(String(it.show).toLowerCase().trim())) it.show = it.show && it.src === 'case' ? it.show : it.a[0];
      if (!matches(it.show, it.a)) it.a.push(String(it.show).toLowerCase().trim()); // the shown answer always counts
      const key = norm(it.q);
      if (!key || seen.has(key)) return;
      seen.add(key);
      it.t = it.t || '';
      it.id = S.id + ':' + hash(it.q);
      items.push(it);
    };
    // 1. hand-written
    for (const x of curated || []) add({ t: x.t, d: x.d || 2, q: x.q, a: x.a, why: x.why || '', src: 'core' });
    // 2. key-words tables in the notes ("| **term** | meaning |"): meaning -> term
    for (const t of topics) {
      const text = [t.guideDeep, t.guide].filter(x => typeof x === 'string').join('\n');
      for (const m of text.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*$/gm)) {
        const term = plain(m[1]), meaning = plain(m[2]);
        if (term.length > 48 || meaning.length < 14 || /^-+$/.test(meaning)) continue;
        const ans = [term].concat(term.includes('(') ? [term.match(/\((.+?)\)/)[1]] : []);
        add({ t: t.id, d: 1, q: '🔑 Key word: ' + clip(maskWords(meaning, aliasSet(ans)), 220), a: ans, why: term + ' — ' + clip(meaning, 160), src: 'kw' });
      }
    }
    // 3. flashcards: a cloze's blank, or the bold words on the back
    for (const c of S.cards || []) {
      if (c.type === 'cloze' && c.text) {
        const ans = [...c.text.matchAll(/\{\{(.+?)\}\}/g)].map(m => plain(m[1]));
        if (ans.length) add({ t: c.topic, d: 2, q: '🃏 ' + clip(plain(c.text.replace(/\{\{.+?\}\}/g, '____')), 230), a: ans.slice(0, 1), why: plain(c.text.replace(/\{\{(.+?)\}\}/g, '$1')), src: 'card' });
        continue;
      }
      const front = plain(c.front), back = c.back || '';
      const bold = [...back.matchAll(/\*\*(.+?)\*\*/g)].map(m => plain(m[1]).replace(/[.:;,]+$/, ''))
        .filter(b => norm(b).length >= 2 && b.length <= 48 && !leaks(front, [b]) && !/^(and|or|not|no|yes|but|only|may|must|all)$/i.test(b));
      if (bold.length) add({ t: c.topic, d: 2, q: '🃏 ' + clip(front, 230), a: bold.slice(0, 6), why: clip(plain(back), 220), src: 'card' });
    }
    // 4. case cards: the one-liner, the facts or the memory hook -> the case name
    for (const [cid, c] of Object.entries(S.cases || {})) {
      const ans = caseAliases(c.name);
      const t = (topics.find(x => (x.cases || []).includes(cid)) || {}).id || '';
      const show = plain(c.name).replace(/\s*\(.*?\)\s*/g, ' ').trim();
      if (c.oneLine) add({ show, t, d: 2, q: '⚖️ Which case? ' + clip(maskWords(plain(c.oneLine), ans), 220), a: ans, why: c.name + ' — ' + clip(plain(c.held || c.oneLine), 180), src: 'case' });
      if (c.facts) add({ show, t, d: 3, q: '⚖️ Name the case from its facts: ' + clip(maskWords(plain(c.facts), ans), 230), a: ans, why: c.name + ' — ' + clip(plain(c.oneLine || c.held), 180), src: 'case' });
      if (c.hook) add({ show, t, d: 1, q: '🧠 Memory hook → which case? ' + clip(maskWords(plain(c.hook), ans), 200), a: ans, why: c.name + ' — ' + clip(plain(c.oneLine || ''), 160), src: 'case' });
    }
    // 5. MCQs with a short answer
    for (const q of S.mcqs || []) {
      const ansText = plain((q.options || [])[q.answer] || '');
      if (!ansText || ansText.length > 45 || /above|both|neither|none of|all of/i.test(ansText)) continue;
      add({ t: q.topic, d: 2, q: '❓ ' + clip(plain(q.q), 220), a: [ansText], why: plain(q.why || ''), src: 'mcq' });
    }
    return items;
  }

  const api = { norm, lev, matches, exactHit, caseAliases, maskWords, aliasSet, dropLeaks, buildBank, plainWith, clip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.LQ = window.LQ || {}; window.LQ.revCore = api; }
})();
