// Course Builder, main-process side. A course is built from its manual, then week by week from its
// readings, by sending the files to Claude. This runs here, not in the page, so the API key and file
// reading stay out of reach of course packs (packs are code that runs in the page).
//
// Built courses are plain JSON in "LexQuest Content/Built courses/<id>.json" (data, never code), and
// the page turns them into subjects at start-up (app/js/course-format.js).
const { ipcMain, dialog, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { SUPPORTED, describe, toBlock } = require('./filetext');

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_REQUEST_BYTES = 30 * 1024 * 1024; // the API accepts up to 32 MB per request
const KEEP_HISTORY = 10;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

/* ---------- registration ---------- */

function register({ configFile, readJson, writeJsonAtomic, contentDir, semesterRoot, getWindow }) {
  const builtDir = path.join(contentDir, 'Built courses');
  const picked = new Set(); // files the person chose in a dialog this session: the only ones allowed outside the semester folder
  const running = new Map(); // job id -> stream

  const cfg = () => readJson(configFile, {}).builder || {};
  const save = patch => { const all = readJson(configFile, {}); writeJsonAtomic(configFile, { ...all, builder: { ...(all.builder || {}), ...patch } }); };
  const storedKey = () => { const k = cfg().key; if (!k) return null; try { return safeStorage.decryptString(Buffer.from(k, 'base64')); } catch { return null; } };

  // A file the page names must be inside the semester folder, or one the person picked.
  function resolve(file, semester) {
    if (file.abs) { if (!picked.has(file.abs)) throw new Error('That file wasn’t chosen in this session. Choose it again.'); return file.abs; }
    const root = path.resolve(semesterRoot(semester));
    const abs = path.resolve(root, String(file.rel || '').replace(/[\\/]+/g, path.sep));
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('That file is outside the semester folder.');
    if (!fs.existsSync(abs)) throw new Error(`Not found: ${file.rel}`);
    return abs;
  }
  const relTo = (abs, semester) => {
    const root = path.resolve(semesterRoot(semester));
    return abs.startsWith(root + path.sep) ? path.relative(root, abs).split(path.sep).join('/') : null;
  };

  ipcMain.handle('builder:get', () => ({
    hasKey: !!cfg().key, envKey: !!process.env.ANTHROPIC_API_KEY, model: cfg().model || DEFAULT_MODEL,
    canEncrypt: safeStorage.isEncryptionAvailable(), builtDir
  }));

  ipcMain.handle('builder:setKey', (_e, key) => {
    key = String(key || '').trim();
    if (!key) { save({ key: null }); return { ok: true }; }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'This computer can’t store the key securely.' };
    save({ key: safeStorage.encryptString(key).toString('base64') });
    return { ok: true };
  });

  ipcMain.handle('builder:root', (_e, semester) => semesterRoot(Number(semester) || undefined));

  ipcMain.handle('builder:pick', async (_e, { semester, folder = false, title } = {}) => {
    const root = semesterRoot(Number(semester) || undefined);
    const res = await dialog.showOpenDialog(getWindow(), folder
      ? { title: title || 'Choose the course folder', defaultPath: root, properties: ['openDirectory'] }
      : { title: title || 'Choose a file', defaultPath: root, properties: ['openFile', 'multiSelections'], filters: [{ name: 'Course files', extensions: SUPPORTED.map(x => x.slice(1)) }] });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths.map(abs => {
      picked.add(abs);
      return folder ? { abs, rel: relTo(abs, semester), name: path.basename(abs) } : { abs, rel: relTo(abs, semester), ...describe(abs) };
    });
  });

  // Every readable file under a folder of the semester (for matching readings to files).
  ipcMain.handle('builder:scan', (_e, relDir, semester) => {
    const root = path.resolve(semesterRoot(Number(semester) || undefined));
    const start = path.resolve(root, String(relDir || '').replace(/[\\/]+/g, path.sep));
    if (!(start === root || start.startsWith(root + path.sep)) || !fs.existsSync(start)) return [];
    const out = [];
    (function walk(dir, depth) {
      if (depth > 6 || out.length >= 3000) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (SUPPORTED.includes(path.extname(e.name).toLowerCase())) out.push({ rel: path.relative(root, p).split(path.sep).join('/'), name: e.name, size: fs.statSync(p).size });
      }
    })(start, 0);
    return out;
  });

  ipcMain.handle('builder:describe', (_e, files, semester) => files.map(f => {
    try { const abs = resolve(f, Number(semester) || undefined); return { ok: true, ...describe(abs) }; } catch (err) { return { ok: false, error: err.message }; }
  }));

  // One request to Claude: the files as documents, then the instructions. Streams so a long answer
  // can't time out, and reports progress to the page.
  ipcMain.handle('builder:run', async (_e, job) => {
    const blocks = [], skipped = [];
    let bytes = Buffer.byteLength(job.prompt || '') + Buffer.byteLength(job.system || '');
    for (const f of job.files || []) {
      try {
        const { block, bytes: b } = toBlock(resolve(f, Number(job.semester) || undefined));
        if (bytes + b > MAX_REQUEST_BYTES) { skipped.push(`${block.title}: the files together would pass Claude’s 32 MB limit`); continue; }
        blocks.push(block); bytes += b;
      } catch (err) { skipped.push(err.message); }
    }
    if (job.requireFiles && !blocks.length) return { ok: false, error: 'None of the files could be read.', skipped };
    const key = storedKey();
    let client;
    try { client = new Anthropic({ ...(key ? { apiKey: key } : {}), ...(cfg().baseUrl ? { baseURL: cfg().baseUrl } : {}), maxRetries: 2 }); }
    catch { return { ok: false, error: 'Add your Claude API key first (Course Builder → API key).', skipped }; }
    const send = progress => { const w = getWindow(); if (w) w.webContents.send('builder:progress', { id: job.id, ...progress }); };
    let stream;
    try {
      stream = client.beta.messages.stream({
        model: cfg().model || DEFAULT_MODEL,
        max_tokens: 64000,
        // If a safety classifier declines, the API retries on a suitable model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: job.effort || 'high' },
        system: job.system,
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: job.prompt }] }]
      });
      running.set(job.id, stream);
      let last = 0;
      stream.on('text', (_delta, snapshot) => { if (Date.now() - last > 250) { last = Date.now(); send({ chars: snapshot.length }); } });
      send({ chars: 0, sent: blocks.map(b => b.title) });
      const msg = await stream.finalMessage();
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
      if (msg.stop_reason === 'refusal') return { ok: false, error: `Claude declined this request${msg.stop_details && msg.stop_details.category ? ` (${msg.stop_details.category})` : ''}.`, skipped, usage };
      if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'Claude’s answer ran past the length limit. Build fewer topics at once, or leave out a long reading.', text, skipped, usage };
      return { ok: true, text, model: msg.model, usage, sent: blocks.map(b => b.title), skipped };
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) return { ok: false, cancelled: true, error: 'Stopped.', skipped };
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Claude rejected the API key. Check it under Course Builder → API key.', skipped };
      if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, error: 'This API key isn’t allowed to use that model.', skipped };
      if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Claude is limiting requests right now. Wait a minute and try again.', skipped };
      if (err instanceof Anthropic.BadRequestError) return { ok: false, error: `Claude couldn’t take this request: ${err.message}`, skipped };
      if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Couldn’t reach Claude. Check your internet connection.', skipped };
      if (err instanceof Anthropic.APIError) return { ok: false, error: `Claude replied with an error (${err.status}): ${err.message}`, skipped };
      return { ok: false, error: /api key|apiKey|authentication/i.test(err.message) ? 'Add your Claude API key first (Course Builder → API key).' : err.message, skipped };
    } finally {
      running.delete(job.id);
    }
  });

  ipcMain.handle('builder:cancel', (_e, id) => { const s = running.get(id); if (s) s.abort(); return !!s; });

  /* ---------- built courses on disk ---------- */
  ipcMain.handle('builder:list', () => {
    if (!fs.existsSync(builtDir)) return [];
    return fs.readdirSync(builtDir).filter(f => f.toLowerCase().endsWith('.json')).sort().map(f => {
      try { return { file: f, course: JSON.parse(fs.readFileSync(path.join(builtDir, f), 'utf8')) }; }
      catch (err) { return { file: f, error: `Couldn’t read ${f}: ${err.message}` }; }
    });
  });

  ipcMain.handle('builder:save', (_e, course) => {
    if (!course || course.format !== 'lexquest-course' || !ID_RE.test(String(course.id || ''))) return { ok: false, error: 'That isn’t a course this app can save.' };
    const json = JSON.stringify(course, null, 1);
    if (json.length > 20 * 1024 * 1024) return { ok: false, error: 'The course is too large to save.' };
    const file = path.join(builtDir, `${course.id}.json`);
    fs.mkdirSync(builtDir, { recursive: true });
    // Keep the last few versions, so a rebuild can be undone by hand.
    if (fs.existsSync(file)) {
      const hist = path.join(builtDir, 'history');
      fs.mkdirSync(hist, { recursive: true });
      fs.copyFileSync(file, path.join(hist, `${course.id} ${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
      const mine = fs.readdirSync(hist).filter(f => f.startsWith(course.id + ' ')).sort();
      while (mine.length > KEEP_HISTORY) fs.unlinkSync(path.join(hist, mine.shift()));
    }
    writeJsonAtomic(file, course);
    return { ok: true, file };
  });

  // Removing a course moves its file aside rather than erasing it.
  ipcMain.handle('builder:remove', (_e, id) => {
    if (!ID_RE.test(String(id || ''))) return { ok: false, error: 'Unknown course.' };
    const file = path.join(builtDir, `${id}.json`);
    if (!fs.existsSync(file)) return { ok: false, error: 'Course not found.' };
    const bin = path.join(builtDir, 'removed');
    fs.mkdirSync(bin, { recursive: true });
    fs.renameSync(file, path.join(bin, `${id} ${new Date().toISOString().slice(0, 10)}.json`));
    return { ok: true };
  });

  ipcMain.handle('builder:openFolder', () => { fs.mkdirSync(builtDir, { recursive: true }); shell.openPath(builtDir); return builtDir; });
}

module.exports = { register };
