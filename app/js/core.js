// LexQuest core: state, persistence, spaced repetition, XP, quests, badges, timer and UI helpers.
'use strict';

window.LQ = window.LQ || {};
const D = window.LQ_DATA; // filled by the course packs (see boot.js); may be empty
D.subjects = D.subjects || {};
D.degree = D.degree || { name: 'My degree', semesters: 10, current: 1 };
D.semesterInfo = D.semesterInfo || {};
// Packs that don't name a semester belong to the current one.
for (const s of Object.values(D.subjects)) if (!s.semester) s.semester = D.degree.current;

const BREAK_IDEAS = [
  'Stand up, roll your shoulders 10 times, then touch your toes.',
  'Drink a full glass of water.',
  'Look at something 6 metres away for 20 seconds (rests your eyes).',
  'Walk to the end of the corridor and back.',
  'Box breathing: in 4 s, hold 4 s, out 4 s, hold 4 s — four rounds.',
  'Say out loud the one thing you learned in the last sprint.',
  'Tidy your desk for one minute — only what you can reach.',
  'Step outside or open a window for fresh air.',
  'Stretch your wrists and fingers; you have a lot of writing ahead.',
  'Eat something small: fruit, nuts. Avoid a sugar crash.',
  'Close your eyes and walk one room of your memory palace.',
  'Do 10 squats or 10 wall push-ups.'
];

/* ---------- small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const fmtDate = k => parseDay(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const wordCount = s => (String(s || '').trim().match(/\S+/g) || []).length;
const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
LQ.h = { $, $$, esc, todayKey, parseDay, daysBetween, fmtDate, wordCount, uid, shuffle };

/* ---------- mini markdown with legal links ---------- */
// [[s:26]] -> section of the pack's default act, [[s:act/9]] -> a named act, [[c:id]] -> case link
LQ.secLabel = s => {
  if (!s.includes('/')) return 's. ' + s;
  const a = s.split('/')[0];
  // Order keys like "O.I-r.10" read as "O. I R. 10".
  const n = s.split('/')[1].replace(/^O\.([IVXL]+)(?:-r\.(.+))?$/i, (_, o, r) => 'O. ' + o + (r ? ' R. ' + r : ''));
  const act = (D.acts || {})[a] || {};
  if (act.prefix) return `${act.prefix} ${n}`;
  // Labels that already carry "s." / "ss." / "r." are kept as written.
  const unit = /^((ss?|rr?|Art|Sch)\.?\s|O\.|Order)/i.test(n) ? '' : `${act.unit || 's.'} `;
  return a.toUpperCase() + ' ' + unit + n;
};
// A section reference with the default act filled in when it names none.
LQ.fullSec = s => (s.includes('/') || !D.defaultAct ? s : `${D.defaultAct}/${s}`);
LQ.md = function md(src) {
  if (!src) return '';
  const inline = t => esc(t)
    .replace(/\[\[s:([\w./-]+)(?:\|([^\]]+))?\]\]/g, (_, s, label) => `<span class="sec-link" data-sec="${s}">${label ? esc(label) : esc(LQ.secLabel(s))}</span>`)
    .replace(/\[\[c:([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, c, label) => `<span class="case-link" data-case="${c}">${label ? esc(label) : esc(caseName(c))}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(src).split('\n');
  let html = '', list = null, rows = 0;
  const close = () => { if (list) { html += list === 'table' ? '</table></div>' : `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    // Pipe tables: the first row is the header; a |---| separator row is skipped.
    if (/^\s*\|/.test(l)) {
      if (list !== 'table') { close(); html += '<div class="md-table"><table>'; list = 'table'; rows = 0; }
      if (/^\s*\|[\s:|-]+\|$/.test(l)) continue;
      const tag = rows++ ? 'td' : 'th';
      html += '<tr>' + l.trim().replace(/^\||\|$/g, '').split('|').map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('') + '</tr>';
      continue;
    }
    if (/^\s*[-•]\s+/.test(l)) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`; continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`; continue; }
    close();
    if (!l.trim()) continue;
    if (l.startsWith('### ')) html += `<h3>${inline(l.slice(4))}</h3>`;
    else if (l.startsWith('## ')) html += `<h2>${inline(l.slice(3))}</h2>`;
    else if (l.startsWith('> ')) html += `<blockquote>${inline(l.slice(2))}</blockquote>`;
    else if (l.startsWith('!tip ')) html += `<div class="callout tip">💡 ${inline(l.slice(5))}</div>`;
    else if (l.startsWith('!warn ')) html += `<div class="callout warn">⚠️ ${inline(l.slice(6))}</div>`;
    else if (l.startsWith('!exam ')) html += `<div class="callout exam">🎯 ${inline(l.slice(6))}</div>`;
    else html += `<p>${inline(l)}</p>`;
  }
  close();
  return html;
};

// Cases are looked up across every semester, so a later course can cite an earlier one's case.
function caseName(id) {
  for (const s of Object.values(D.allSubjects || D.subjects)) if (s.cases && s.cases[id]) return s.cases[id].name;
  return id;
}
LQ.findCase = id => { for (const s of Object.values(D.allSubjects || D.subjects)) if (s.cases && s.cases[id]) return { subject: s, c: s.cases[id] }; return null; };
LQ.findTopic = (sid, tid) => { const s = D.subjects[sid]; if (!s) return null; for (const u of s.units) for (const t of u.topics) if (t.id === tid) return { s, u, t }; return null; };
LQ.allTopics = sid => { const s = D.subjects[sid]; return s ? s.units.flatMap(u => u.topics.map(t => ({ s, u, t }))) : []; };

/* ---------- state ---------- */
const DEFAULT_SETTINGS = {
  name: '', theme: 'midnight', accent: '', font: 'system', fontSize: 16, lineHeight: 1.6, readWidth: 860,
  reduceMotion: false, sound: true, sprintMin: 25, breakMin: 5, longBreakMin: 15, dailyGoal: 8,
  notesMinWords: 60, cardsPerSession: 40, newPerDay: 60, confetti: true, catchUpHours: 2, typeAnswers: false
};

function freshState() {
  return {
    version: 1, createdAt: Date.now(), settings: { ...DEFAULT_SETTINGS },
    xp: 0, days: {}, streak: { current: 0, best: 0, lastDay: null },
    cards: {}, customCards: [], topics: {}, notes: {}, palace: { custom: [], walks: {} },
    timetable: {}, planPieces: {}, quests: null, badges: {}, parking: [], mocks: [], mcq: {}, practice: {}, newToday: { day: null, n: 0 }, recall: {},
    calendar: { events: [] }
  };
}

LQ.freshState = freshState;
LQ.state = freshState();
let saveTimer = null;
// Progress goes to the signed-in profile (LQ.store is set up in profiles.js); nothing is saved
// before someone signs in.
LQ.save = function save(now = false) {
  clearTimeout(saveTimer);
  const doSave = () => (LQ.user ? Promise.resolve(LQ.store.save(LQ.state)).catch(() => false) : Promise.resolve(false));
  if (now) return doSave();
  saveTimer = setTimeout(doSave, 400);
  return Promise.resolve(true);
};
LQ.load = async function load() {
  let s = null;
  try { s = await LQ.store.load(); } catch { s = null; }
  const base = freshState();
  LQ.state = s ? { ...base, ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) }, palace: { ...base.palace, ...(s.palace || {}) } } : base;
};
window.addEventListener('beforeunload', () => LQ.save(true));

/* ---------- semesters ---------- */
// Every course pack is registered in D.subjects with a semester. The active
// semester decides what the views see: D.subjects, exams, timetable, palaces and papers are narrowed
// to it, while D.allSubjects keeps everything.
const ALL = { subjects: D.subjects, exams: D.exams || [], timetable: D.timetable || [], palaces: D.palaces || [], papers: D.papers || [], pastQuestions: D.pastQuestions || [] };
LQ.allExams = () => ALL.exams; // every semester's, for the calendar
D.allSubjects = ALL.subjects;
LQ.semesterSubjects = n => Object.values(ALL.subjects).filter(s => s.semester === n);
LQ.semesterStatus = n => n < D.degree.current ? 'past' : n === D.degree.current ? 'current' : 'upcoming';
LQ.useSemester = function useSemester(n) {
  if (!LQ.semesterSubjects(n).length) n = D.degree.current;
  const ids = new Set(LQ.semesterSubjects(n).map(s => s.id));
  const keep = x => ids.has(x.subject);
  D.subjects = Object.fromEntries(Object.entries(ALL.subjects).filter(([id]) => ids.has(id)));
  D.exams = ALL.exams.filter(keep);
  D.timetable = ALL.timetable.filter(d => (d.semester || D.degree.current) === n);
  D.palaces = ALL.palaces.filter(keep);
  D.papers = ALL.papers.filter(keep);
  D.pastQuestions = ALL.pastQuestions.filter(keep);
  D.activeSemester = n;
  LQ.state.semester = n;
  LQ.fileCache = {};
  Promise.resolve(LQ.store && LQ.store.setSemester(n, D.degree.current)).catch(() => null);
  return n;
};
// The subject to show when none is chosen: the next exam's, otherwise the first.
LQ.defaultSubject = function defaultSubject() {
  const today = todayKey();
  const next = (D.exams || []).filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next && D.subjects[next.subject]) return next.subject;
  return Object.keys(D.subjects)[0] || '';
};
// What the empty app shows until a course pack is added.
LQ.noCourses = () => (Object.keys(D.subjects).length ? '' : `<div class="card" style="margin-bottom:16px"><h2>📦 No courses yet</h2>
  <p>LexQuest is ready, but it doesn’t come with any courses. Every feature works once a course pack is added: put the pack’s files in the <strong>LexQuest Content</strong> folder beside the app, then restart. You can already use sprints, your own flashcards and your own memory palaces.</p>
  ${window.lq ? '<button class="btn primary" id="openContent">Open the LexQuest Content folder</button>' : ''}</div>`);

LQ.day = function day(k = todayKey()) {
  const d = LQ.state.days;
  if (!d[k]) d[k] = { sprints: 0, cards: 0, xp: 0, minutes: 0, notes: 0, walks: 0, mcq: 0, mocks: 0 };
  return d[k];
};

/* ---------- XP, levels, streak ---------- */
const RANKS = ['Law Clerk', 'Research Intern', 'Junior Associate', 'Associate', 'Senior Associate', 'Advocate', 'Senior Advocate', 'District Judge', 'High Court Judge', 'Supreme Court Justice', 'Chief Justice'];
LQ.levelInfo = function levelInfo(xp = LQ.state.xp) {
  let lvl = 1, need = 120, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(120 * Math.pow(lvl, 1.3)); }
  return { lvl, into: xp - acc, need, pct: Math.round(((xp - acc) / need) * 100), rank: RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 3))] };
};

LQ.addXP = function addXP(n, why) {
  if (!n) return;
  const before = LQ.levelInfo().lvl;
  LQ.state.xp += n;
  LQ.day().xp += n;
  touchStreak();
  const after = LQ.levelInfo();
  if (why) LQ.toast(`+${n} XP · ${why}`, 'xp');
  if (after.lvl > before) {
    LQ.toast(`🎉 Level ${after.lvl}! You're now a ${after.rank}.`, 'badge');
    LQ.sound('level');
  }
  LQ.checkBadges();
  LQ.renderTopbar();
  LQ.save();
};

function touchStreak() {
  const k = todayKey(), st = LQ.state.streak;
  if (st.lastDay === k) return;
  if (st.lastDay && daysBetween(st.lastDay, k) === 1) st.current += 1;
  else st.current = 1;
  st.lastDay = k;
  st.best = Math.max(st.best, st.current);
}

/* ---------- spaced repetition (SM-2 style, exam-aware) ---------- */
LQ.examDateFor = function examDateFor(subjectId) {
  const now = todayKey();
  const exams = (D.exams || []).filter(e => e.subject === subjectId && e.date >= now).sort((a, b) => a.date.localeCompare(b.date));
  return exams[0] ? exams[0].date : null;
};

LQ.allCards = function allCards() {
  const out = [];
  for (const s of Object.values(D.subjects)) for (const c of (s.cards || [])) out.push({ ...c, subject: s.id });
  for (const c of LQ.state.customCards) if (!c.subject || D.subjects[c.subject]) out.push({ ...c, custom: true });
  return out;
};

LQ.cardState = id => LQ.state.cards[id];
LQ.isDue = function isDue(card, now = Date.now()) {
  const st = LQ.state.cards[card.id];
  return st ? st.due <= now : false;
};

LQ.dueCards = function dueCards(filter = {}) {
  const now = Date.now();
  return LQ.allCards().filter(c => {
    if (filter.subject && c.subject !== filter.subject) return false;
    if (filter.topic && c.topic !== filter.topic) return false;
    const st = LQ.state.cards[c.id];
    return st && st.due <= now;
  });
};

LQ.newCards = function newCards(filter = {}) {
  return LQ.allCards().filter(c => {
    if (filter.subject && c.subject !== filter.subject) return false;
    if (filter.topic && c.topic !== filter.topic) return false;
    return !LQ.state.cards[c.id];
  });
};

LQ.grade = function grade(card, g) {
  const now = Date.now();
  const st = LQ.state.cards[card.id] || { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: now, seen: 0 };
  st.seen = (st.seen || 0) + 1;
  st.last = now;
  if (g === 1) {
    st.reps = 0; st.lapses += 1; st.interval = 0; st.ef = Math.max(1.3, st.ef - 0.2);
    st.due = now + 60 * 1000;
  } else {
    let iv;
    if (st.reps === 0) iv = g === 2 ? 0.5 : g === 3 ? 1 : 3;
    else if (st.reps === 1) iv = g === 2 ? 1.5 : g === 3 ? 3 : 6;
    else iv = st.interval * (g === 2 ? 1.2 : g === 3 ? st.ef : st.ef * 1.3);
    st.ef = Math.max(1.3, st.ef + (g === 4 ? 0.15 : g === 2 ? -0.15 : 0));
    st.reps += 1;
    // Exam-aware: always see the card again at least once before its paper.
    const exam = LQ.examDateFor(card.subject);
    if (exam) {
      const daysLeft = (parseDay(exam) - now) / 86400000;
      if (daysLeft > 1.5 && iv > daysLeft - 1) iv = Math.max(0.5, daysLeft - 1);
    }
    st.interval = iv;
    st.due = now + iv * 86400000;
  }
  LQ.state.cards[card.id] = st;
  LQ.day().cards += 1;
  LQ.questProgress('cards', 1);
  LQ.addXP(g >= 3 ? 2 : 1);
  LQ.save();
  return st;
};

LQ.introduce = function introduce(card) {
  if (LQ.state.cards[card.id]) return;
  const nt = LQ.state.newToday;
  if (nt.day !== todayKey()) { nt.day = todayKey(); nt.n = 0; }
  nt.n += 1;
  LQ.state.cards[card.id] = { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), seen: 0 };
};

LQ.mastery = function mastery(filter) {
  const cards = LQ.allCards().filter(c => (!filter.subject || c.subject === filter.subject) && (!filter.topic || c.topic === filter.topic));
  if (!cards.length) return 0;
  let score = 0;
  for (const c of cards) {
    const st = LQ.state.cards[c.id];
    if (!st) continue;
    score += Math.min(1, (st.reps || 0) / 3) * (st.lapses > 3 ? 0.7 : 1);
  }
  return Math.round((score / cards.length) * 100);
};

/* ---------- the adaptive plan (the logic is in planner.js) ---------- */
LQ.plan = function plan() {
  const tier = id => { for (const s of Object.values(D.subjects)) for (const u of s.units) for (const t of u.topics) if (t.id === id) return t.tier; return 2; };
  return LQ.replan({
    days: D.timetable || [], today: todayKey(), status: LQ.state.timetable, pieces: LQ.state.planPieces,
    topicPct: id => LQ.topicPct(id), nextExam: LQ.examDateFor, tierOf: tier, extraHours: LQ.state.settings.catchUpHours
  });
};

/* ---------- topic progress ---------- */
LQ.STEPS = [
  { id: 'prime', label: 'Prime', icon: '🎯', xp: 5 },
  { id: 'learn', label: 'Learn', icon: '📖', xp: 15 },
  { id: 'write', label: 'Write', icon: '✍️', xp: 20 },
  { id: 'recall', label: 'Recall', icon: '🃏', xp: 10 },
  { id: 'council', label: 'Council', icon: '🏛️', xp: 10 },
  { id: 'palace', label: 'Palace', icon: '🗝️', xp: 10 },
  { id: 'test', label: 'Test', icon: '🧪', xp: 15 }
];
LQ.topicState = id => (LQ.state.topics[id] = LQ.state.topics[id] || { steps: {}, opened: 0 });
LQ.completeStep = function completeStep(topicId, step) {
  const ts = LQ.topicState(topicId);
  if (ts.steps[step]) return false;
  ts.steps[step] = Date.now();
  const def = LQ.STEPS.find(s => s.id === step);
  LQ.addXP(def ? def.xp : 5, `${def ? def.label : step} complete`);
  if (LQ.STEPS.every(s => ts.steps[s.id])) {
    LQ.addXP(40, 'Topic conquered 🏁');
    LQ.celebrate();
  }
  LQ.save();
  return true;
};
LQ.topicPct = id => { const ts = LQ.state.topics[id]; if (!ts) return 0; return Math.round((LQ.STEPS.filter(s => ts.steps[s.id]).length / LQ.STEPS.length) * 100); };

/* ---------- quests ---------- */
const QUEST_POOL = [
  { id: 'sprints', label: 'Finish {n} focus sprints', goals: [3, 4, 6], xp: 40 },
  { id: 'cards', label: 'Review {n} flashcards', goals: [25, 40, 60], xp: 30 },
  { id: 'notes', label: 'Write notes for {n} topic(s)', goals: [1, 2], xp: 30 },
  { id: 'walks', label: 'Walk the memory palace {n} time(s)', goals: [1, 2], xp: 25 },
  { id: 'mcq', label: 'Answer {n} quiz questions', goals: [10, 15], xp: 25 },
  { id: 'answer', label: 'Write {n} timed exam answer(s)', goals: [1], xp: 40 }
];
LQ.quests = function quests() {
  const k = todayKey();
  if (!LQ.state.quests || LQ.state.quests.day !== k) {
    const picks = shuffle(QUEST_POOL).slice(0, 3);
    if (!picks.some(p => p.id === 'cards')) picks[2] = QUEST_POOL[1];
    LQ.state.quests = { day: k, list: picks.map(p => { const n = p.goals[Math.floor(Math.random() * p.goals.length)]; return { id: p.id, label: p.label.replace('{n}', n), goal: n, xp: p.xp, progress: 0, done: false }; }) };
    LQ.save();
  }
  return LQ.state.quests.list;
};
LQ.questProgress = function questProgress(id, n = 1) {
  const list = LQ.quests();
  for (const q of list) {
    if (q.id !== id || q.done) continue;
    q.progress = Math.min(q.goal, q.progress + n);
    if (q.progress >= q.goal) {
      q.done = true;
      setTimeout(() => LQ.addXP(q.xp, `Quest done: ${q.label}`), 50);
    }
  }
};

/* ---------- badges ---------- */
const BADGES = [
  { id: 'first-sprint', icon: '🚀', name: 'First Sprint', desc: 'Finish your first focus sprint.', test: s => totalOf('sprints') >= 1 },
  { id: 'sprinter', icon: '🏃', name: 'Sprinter', desc: '25 focus sprints in total.', test: s => totalOf('sprints') >= 25 },
  { id: 'marathon', icon: '🏅', name: 'Marathoner', desc: '8 sprints in a single day.', test: s => Object.values(s.days).some(d => d.sprints >= 8) },
  { id: 'cards-100', icon: '🃏', name: 'Card Shark', desc: '100 flashcard reviews.', test: s => totalOf('cards') >= 100 },
  { id: 'cards-1000', icon: '🦈', name: 'Great White', desc: '1,000 flashcard reviews.', test: s => totalOf('cards') >= 1000 },
  { id: 'streak-3', icon: '🔥', name: 'Kindling', desc: '3-day streak.', test: s => s.streak.best >= 3 },
  { id: 'streak-7', icon: '🔥', name: 'Bonfire', desc: '7-day streak.', test: s => s.streak.best >= 7 },
  { id: 'streak-21', icon: '☄️', name: 'Comet', desc: '21-day streak.', test: s => s.streak.best >= 21 },
  { id: 'scribe', icon: '✍️', name: 'Scribe', desc: 'Write notes for 5 topics.', test: s => Object.values(s.notes).filter(n => n.words >= 40).length >= 5 },
  { id: 'palace', icon: '🏛️', name: 'Palace Walker', desc: 'Walk a memory palace 5 times.', test: s => totalOf('walks') >= 5 },
  { id: 'mock', icon: '⏱️', name: 'Under the Clock', desc: 'Complete a timed mock.', test: s => s.mocks.length >= 1 },
  { id: 'level-5', icon: '⭐', name: 'Rising Star', desc: 'Reach level 5.', test: s => LQ.levelInfo(s.xp).lvl >= 5 },
  { id: 'level-10', icon: '🌟', name: 'Senior Counsel', desc: 'Reach level 10.', test: s => LQ.levelInfo(s.xp).lvl >= 10 },
  { id: 'parked', icon: '🅿️', name: 'Thought Parker', desc: 'Park 5 distracting thoughts instead of chasing them.', test: s => s.parking.length >= 5 },
  { id: 'night-owl', icon: '🦉', name: 'Night Owl', desc: 'Finish a sprint after 11 pm.', test: s => !!s.badges['night-owl'] },
  { id: 'early-bird', icon: '🐦', name: 'Early Bird', desc: 'Finish a sprint before 8 am.', test: s => !!s.badges['early-bird'] }
].concat(D.badges || []); // a course pack can add its own
LQ.BADGES = BADGES;
function totalOf(key) { return Object.values(LQ.state.days).reduce((a, d) => a + (d[key] || 0), 0); }
LQ.totalOf = totalOf;
LQ.checkBadges = function checkBadges() {
  for (const b of BADGES) {
    if (LQ.state.badges[b.id]) continue;
    let ok = false;
    try { ok = b.test(LQ.state); } catch { ok = false; }
    if (ok) { LQ.state.badges[b.id] = Date.now(); LQ.toast(`${b.icon} Badge unlocked: ${b.name}`, 'badge'); LQ.sound('badge'); }
  }
};

/* ---------- sound (generated, no files) ---------- */
let audioCtx = null;
LQ.sound = function sound(kind) {
  if (!LQ.state.settings.sound) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const notes = { done: [523, 659, 784], break: [784, 659], level: [523, 659, 784, 1047], badge: [880, 1175], tick: [440] }[kind] || [600];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.12 + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.12); o.stop(audioCtx.currentTime + i * 0.12 + 0.32);
    });
  } catch { /* audio unavailable */ }
};

/* ---------- toasts, modals, celebration ---------- */
LQ.toast = function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), 3600);
};
LQ.modal = function modal(html, opts = {}) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="overlay"><div class="modal ${opts.wide ? 'wide' : ''}">${html}</div></div>`;
  const ov = $('.overlay', root);
  if (!opts.sticky) ov.addEventListener('mousedown', e => { if (e.target === ov) LQ.closeModal(); });
  return $('.modal', root);
};
LQ.closeModal = () => { $('#modalRoot').innerHTML = ''; };
LQ.celebrate = function celebrate() {
  if (!LQ.state.settings.confetti || LQ.state.settings.reduceMotion) return;
  const main = $('#main');
  main.classList.remove('celebrate'); void main.offsetWidth; main.classList.add('celebrate');
};

/* ---------- appearance ---------- */
LQ.THEMES = [
  ['midnight', 'Midnight'], ['daylight', 'Daylight'], ['sepia', 'Sepia Library'], ['nord', 'Nord Frost'],
  ['forest', 'Forest'], ['velvet', 'Velvet Night'], ['solar', 'Solar Light'], ['ocean', 'Deep Ocean'],
  ['contrast', 'High Contrast'], ['rosewood', 'Rosewood'], ['graphite', 'Graphite'], ['mint', 'Mint Paper']
];
LQ.FONTS = {
  system: '"Segoe UI", system-ui, sans-serif',
  readable: 'Verdana, "Segoe UI", sans-serif',
  serif: 'Georgia, "Cambria", "Times New Roman", serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
  mono: '"Cascadia Code", Consolas, monospace'
};
LQ.applyAppearance = function applyAppearance() {
  const s = LQ.state.settings, root = document.documentElement;
  root.dataset.theme = s.theme;
  root.style.setProperty('--font', LQ.FONTS[s.font] || LQ.FONTS.system);
  root.style.setProperty('--font-size', s.fontSize + 'px');
  root.style.setProperty('--line-height', s.lineHeight);
  root.style.setProperty('--read-width', s.readWidth + 'px');
  if (s.accent) root.style.setProperty('--accent', s.accent); else root.style.removeProperty('--accent');
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
};

/* ---------- focus sprint timer ---------- */
const timer = { mode: 'idle', endsAt: 0, label: '', goal: '', count: 0, handle: null, pausedLeft: 0 };
LQ.timer = timer;
LQ.startSprint = function startSprint(label, goal) {
  timer.mode = 'focus';
  timer.label = label || 'Focus sprint';
  timer.goal = goal || '';
  timer.endsAt = Date.now() + LQ.state.settings.sprintMin * 60000;
  tick();
  LQ.renderTopbar();
};
LQ.startBreak = function startBreak(long) {
  timer.mode = 'break';
  timer.endsAt = Date.now() + (long ? LQ.state.settings.longBreakMin : LQ.state.settings.breakMin) * 60000;
  tick();
  LQ.renderTopbar();
};
LQ.stopTimer = function stopTimer() {
  timer.mode = 'idle'; clearTimeout(timer.handle); LQ.renderTopbar();
};
LQ.pauseTimer = function pauseTimer() {
  if (timer.mode === 'paused') { timer.mode = timer.prevMode; timer.endsAt = Date.now() + timer.pausedLeft; tick(); }
  else if (timer.mode !== 'idle') { timer.prevMode = timer.mode; timer.pausedLeft = timer.endsAt - Date.now(); timer.mode = 'paused'; clearTimeout(timer.handle); }
  LQ.renderTopbar();
};
function tick() {
  clearTimeout(timer.handle);
  if (timer.mode !== 'focus' && timer.mode !== 'break') return;
  const left = timer.endsAt - Date.now();
  if (left <= 0) {
    if (timer.mode === 'focus') sprintDone(); else breakDone();
    return;
  }
  const clock = $('#sprintClock');
  if (clock) clock.textContent = fmtClock(left);
  timer.handle = setTimeout(tick, 500);
}
const fmtClock = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
LQ.fmtClock = fmtClock;

function sprintDone() {
  timer.mode = 'idle';
  timer.count += 1;
  const d = LQ.day();
  d.sprints += 1;
  d.minutes += LQ.state.settings.sprintMin;
  const hr = new Date().getHours();
  if (hr >= 23 && !LQ.state.badges['night-owl']) LQ.state.badges['night-owl'] = Date.now(), LQ.toast('🦉 Badge unlocked: Night Owl', 'badge');
  if (hr < 8 && !LQ.state.badges['early-bird']) LQ.state.badges['early-bird'] = Date.now(), LQ.toast('🐦 Badge unlocked: Early Bird', 'badge');
  LQ.questProgress('sprints', 1);
  LQ.addXP(25, 'Sprint finished');
  LQ.sound('done');
  LQ.celebrate();
  const long = timer.count % 4 === 0;
  const ideas = shuffle(D.breakIdeas || BREAK_IDEAS).slice(0, 3);
  const m = LQ.modal(`
    <h2>🎉 Sprint ${d.sprints} done today</h2>
    ${timer.goal ? `<p>Your goal was: <strong>${esc(timer.goal)}</strong>. Did you hit it?</p>
    <div class="row"><button class="btn good" data-hit="1">Yes 💪</button><button class="btn" data-hit="0">Partly / no</button></div><hr>` : ''}
    <p>Take a ${long ? LQ.state.settings.longBreakMin + '-minute long' : LQ.state.settings.breakMin + '-minute'} break. Try one of these:</p>
    <ul>${ideas.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    <div class="row"><button class="btn primary" id="goBreak">Start break</button><button class="btn" id="skipBreak">Skip break, next sprint</button><span class="spacer"></span><button class="btn ghost" id="doneForNow">Done for now</button></div>`, { sticky: true });
  $$('[data-hit]', m).forEach(b => b.onclick = () => { if (b.dataset.hit === '1') LQ.addXP(10, 'Goal hit'); b.parentElement.innerHTML = '<span class="chip ok">Logged</span>'; });
  $('#goBreak', m).onclick = () => { LQ.closeModal(); LQ.startBreak(long); };
  $('#skipBreak', m).onclick = () => { LQ.closeModal(); LQ.promptSprint(); };
  $('#doneForNow', m).onclick = () => { LQ.closeModal(); LQ.renderTopbar(); LQ.rerender(); };
  LQ.renderTopbar();
  LQ.save();
}
function breakDone() {
  timer.mode = 'idle';
  LQ.sound('break');
  LQ.renderTopbar();
  const m = LQ.modal(`<h2>⏰ Break's over</h2><p>One more sprint? Starting is the hardest part — commit to just the first 5 minutes.</p>
    <div class="row"><button class="btn primary" id="again">Start next sprint</button><button class="btn" id="later">Not now</button></div>`);
  $('#again', m).onclick = () => { LQ.closeModal(); LQ.promptSprint(); };
  $('#later', m).onclick = () => LQ.closeModal();
}

LQ.promptSprint = function promptSprint(label) {
  const suggestion = label || (LQ.nextUp && LQ.nextUp()) || 'Focus sprint';
  const m = LQ.modal(`
    <h2>⏱️ Start a ${LQ.state.settings.sprintMin}-minute sprint</h2>
    <label class="field"><span>What are you working on?</span><input type="text" id="spLabel" value="${esc(suggestion)}"></label>
    <label class="field"><span>One small goal for this sprint (makes it far likelier you'll do it)</span><input type="text" id="spGoal" placeholder="e.g. Write my notes on one case and do its 6 cards"></label>
    <p class="muted">Phone face-down, other tabs closed. If a stray thought shows up, press <kbd>Ctrl</kbd>+<kbd>L</kbd> to park it.</p>
    <div class="row"><button class="btn primary" id="spGo">Start</button><button class="btn" id="spCancel">Cancel</button></div>`);
  $('#spGo', m).onclick = () => { LQ.startSprint($('#spLabel', m).value, $('#spGoal', m).value); LQ.closeModal(); };
  $('#spCancel', m).onclick = () => LQ.closeModal();
  setTimeout(() => $('#spGoal', m).focus(), 50);
};

LQ.parkThought = function parkThought() {
  const m = LQ.modal(`<h2>🅿️ Parking lot</h2><p class="muted">Write the thought down so your brain can let go of it. You'll see it again after the sprint.</p>
    <input type="text" id="parkText" placeholder="e.g. reply to the CR about the moot list">
    <div class="row" style="margin-top:12px"><button class="btn primary" id="parkSave">Park it</button><button class="btn" id="parkClose">Close</button></div>
    ${LQ.state.parking.filter(p => !p.done).length ? `<hr><h3>Parked</h3><div class="list">${LQ.state.parking.map((p, i) => p.done ? '' : `<div class="item"><span class="grow">${esc(p.text)}</span><button class="btn small" data-park="${i}">Done</button></div>`).join('')}</div>` : ''}`);
  const save = () => { const t = $('#parkText', m).value.trim(); if (t) { LQ.state.parking.push({ t: Date.now(), text: t, done: false }); LQ.save(); LQ.checkBadges(); LQ.toast('Parked. Back to it 💪'); } LQ.closeModal(); };
  $('#parkSave', m).onclick = save;
  $('#parkText', m).addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  $('#parkClose', m).onclick = () => LQ.closeModal();
  $$('[data-park]', m).forEach(b => b.onclick = () => { LQ.state.parking[+b.dataset.park].done = true; LQ.save(); b.closest('.item').remove(); });
  setTimeout(() => $('#parkText', m).focus(), 50);
};

/* ---------- top bar ---------- */
LQ.renderTopbar = function renderTopbar() {
  const li = LQ.levelInfo();
  $('#xpBox').innerHTML = `<span class="streak" title="Day streak">🔥 ${LQ.state.streak.current || 0}</span>
    <span class="lvl" title="${esc(li.rank)}">Lv ${li.lvl}</span>
    <span class="xpbar" title="${li.into}/${li.need} XP to next level"><i style="width:${li.pct}%"></i></span>
    <span class="muted">${LQ.state.xp} XP</span>`;
  const sb = $('#sprintBox');
  if (timer.mode === 'idle') sb.innerHTML = `<button class="btn small primary" id="sprintStart">▶ Sprint</button>`;
  else {
    const left = timer.mode === 'paused' ? timer.pausedLeft : timer.endsAt - Date.now();
    sb.innerHTML = `<span class="clock ${timer.mode === 'focus' ? 'on' : timer.mode === 'break' ? 'break' : ''}" id="sprintClock" title="${esc(timer.label)}">${fmtClock(left)}</span>
      <span class="muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${timer.mode === 'break' ? '☕ Break' : esc(timer.label)}</span>
      <button class="icon-btn" id="sprintPause" title="Pause / resume">${timer.mode === 'paused' ? '▶' : '⏸'}</button>
      <button class="icon-btn" id="sprintStop" title="Stop">■</button>`;
  }
  const sbs = $('#sprintStart'); if (sbs) sbs.onclick = () => LQ.promptSprint();
  const sp = $('#sprintPause'); if (sp) sp.onclick = () => LQ.pauseTimer();
  const ss = $('#sprintStop'); if (ss) ss.onclick = () => LQ.stopTimer();
  const due = LQ.dueCards().length;
  $('#dueBadge').textContent = due ? String(due) : '';
};

/* ---------- files on disk ---------- */
LQ.fileCache = {};
LQ.checkFiles = async function checkFiles(paths) {
  const todo = paths.filter(p => p && !(p in LQ.fileCache));
  if (!todo.length) return;
  if (window.lq) {
    const res = await window.lq.exists(todo);
    todo.forEach((p, i) => { LQ.fileCache[p] = res[i]; });
  } else todo.forEach(p => { LQ.fileCache[p] = null; });
};
LQ.openFile = async function openFile(rel) {
  if (!window.lq) { LQ.toast('Opening files works in the desktop app.'); return; }
  const r = await window.lq.open(rel);
  if (!r.ok) LQ.toast('Could not open: ' + (r.error || rel));
};
