// Loads the installed course packs, then the app, strictly in order. The app itself ships with no
// courses: packs live in the "LexQuest Content" folder beside the .exe. In a browser preview, packs
// can be named in the address instead: index.html?pack=../examples/example-pack.js
'use strict';
(async function () {
  window.LQ_DATA = { subjects: {} };
  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });

  const packs = window.lq
    ? await window.lq.contentFiles()
    : new URLSearchParams(location.search).getAll('pack').map(p => ({ name: p, url: p }));
  const results = [];
  let current = null;
  const onError = e => { if (current) { current.error = e.message; e.preventDefault(); } };
  window.addEventListener('error', onError);
  for (const pack of packs) {
    current = { name: pack.name };
    results.push(current);
    await load(pack.url).catch(() => { current.error = 'The file could not be read.'; });
  }
  current = null;
  window.removeEventListener('error', onError);

  // Courses made with the Course Builder are JSON (data, not code), applied after the packs.
  await load('js/course-format.js');
  window.LQ_BUILT = [];
  if (window.lq && window.lq.builder) {
    try { window.LQ_BUILT = await window.lq.builder.list(); } catch { window.LQ_BUILT = []; }
    results.push(...window.LQ_COURSE.apply(window.LQ_DATA, window.LQ_BUILT));
  }
  window.LQ_DATA.packs = results; // shown in Settings, so a broken pack can be found

  for (const file of ['core', 'planner', 'retention', 'calendar', 'views-learn', 'views-practice', 'views-misc', 'views-retention', 'views-calendar', 'views-builder', 'search', 'profiles', 'updates', 'app']) await load(`js/${file}.js`);
})();
