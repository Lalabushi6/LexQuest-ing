// Updates from GitHub Releases. LexQuest ships as one portable .exe with its data beside it, which
// electron-updater can't replace, so this does it directly: find the latest release, download its
// LexQuest.exe next to the running one, verify it, then hand over to a small script that swaps the
// files once the app has closed and starts the new version. "LexQuest Data" is never touched.
const { net, safeStorage, app, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ASSET = 'LexQuest.exe';
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const RECHECK_MS = 12 * 60 * 60 * 1000;

// The running .exe; only set when started as the packaged portable app.
const target = () => process.env.PORTABLE_EXECUTABLE_FILE || null;
const parts = v => String(v).replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
function isNewer(latest, current) {
  const a = parts(latest), b = parts(current);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return false;
}

// Replaces the .exe once it can be moved, keeps the old one until the new version has started,
// and puts everything back if the swap fails.
function swapScript(exe, download, previous) {
  const q = p => p.replace(/%/g, '%%');
  return [
    '@echo off', 'chcp 65001 >nul', 'set tries=0',
    'ping -n 4 127.0.0.1 >nul',
    ':wait',
    `move /y "${q(exe)}" "${q(previous)}" >nul 2>&1 && goto swap`,
    'set /a tries+=1', 'if %tries% geq 60 goto run',
    'ping -n 2 127.0.0.1 >nul', 'goto wait',
    ':swap',
    `move /y "${q(download)}" "${q(exe)}" >nul 2>&1 && goto run`,
    `move /y "${q(previous)}" "${q(exe)}" >nul 2>&1`,
    ':run', `start "" "${q(exe)}"`,
    '(goto) 2>nul & del "%~f0"'
  ].join('\r\n');
}

function register({ configFile, readJson, writeJsonAtomic, getWindow }) {
  let found = null; // the release from the last check; downloads only ever use this, never a URL from the page
  let downloaded = false;
  let downloading = false;

  const cfg = () => readJson(configFile, {}).update || {};
  const save = patch => { const all = readJson(configFile, {}); writeJsonAtomic(configFile, { ...all, update: { ...(all.update || {}), ...patch } }); };
  // Release builds carry their own repository (written in by the release workflow).
  const bundledRepo = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'update-source.json'), 'utf8')).repo || ''; } catch { return ''; } };
  const repo = () => cfg().repo || bundledRepo();
  const token = () => {
    const t = cfg().token;
    if (!t) return null;
    try { return safeStorage.decryptString(Buffer.from(t, 'base64')); } catch { return null; }
  };
  const headers = extra => {
    const h = { 'User-Agent': `LexQuest/${app.getVersion()}`, 'X-GitHub-Api-Version': '2022-11-28', ...extra };
    const t = token();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  ipcMain.handle('update:get', () => {
    const c = cfg();
    return {
      current: app.getVersion(), repo: repo(), hasToken: !!c.token, auto: c.auto !== false, canInstall: !!target(),
      autoCheckDue: !!repo() && c.auto !== false && Date.now() - (c.lastCheck || 0) > RECHECK_MS
    };
  });

  ipcMain.handle('update:set', (_e, change) => {
    if ('repo' in change) {
      const r = String(change.repo || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
      if (r && !REPO_RE.test(r)) return { ok: false, error: 'Use the form owner/repository, e.g. yourname/lexquest.' };
      save({ repo: r });
    }
    if ('auto' in change) save({ auto: !!change.auto });
    if ('token' in change) {
      if (!change.token) save({ token: null });
      else if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'This computer can’t store the token securely.' };
      else save({ token: safeStorage.encryptString(String(change.token).trim()).toString('base64') });
    }
    found = null; downloaded = false;
    return { ok: true };
  });

  ipcMain.handle('update:check', async () => {
    found = null; downloaded = false;
    const r = repo();
    if (!r) return { ok: false, error: 'Add your GitHub repository first.' };
    let res;
    try {
      res = await net.fetch(`https://api.github.com/repos/${r}/releases/latest`, { headers: headers({ Accept: 'application/vnd.github+json' }) });
    } catch {
      return { ok: false, error: 'Couldn’t reach GitHub. Check your internet connection.' };
    }
    save({ lastCheck: Date.now() });
    if (res.status === 404) return { ok: false, error: `No release found for ${r}. If the repository is private, add an access token below.` };
    if (res.status === 401) return { ok: false, error: 'GitHub rejected the access token. It may have expired.' };
    if (res.status === 403 || res.status === 429) return { ok: false, error: 'GitHub is limiting requests. Try again later.' };
    if (!res.ok) return { ok: false, error: `GitHub replied with an error (${res.status}).` };
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/i, ''), current = app.getVersion();
    if (!isNewer(latest, current)) return { ok: true, available: false, current, latest };
    const assets = rel.assets || [];
    const exe = assets.find(a => a.name === ASSET);
    if (!exe) return { ok: false, error: `Release ${rel.tag_name} has no ${ASSET} attached.` };
    const sum = assets.find(a => a.name === `${ASSET}.sha256`);
    found = { version: latest, url: exe.url, size: exe.size, sumUrl: sum ? sum.url : null, digest: exe.digest || null, page: rel.html_url };
    return { ok: true, available: true, current, latest, notes: String(rel.body || '').slice(0, 4000), sizeMB: Math.round(exe.size / 1048576), canInstall: !!target() };
  });

  ipcMain.handle('update:download', async () => {
    const exe = target();
    if (!found) return { ok: false, error: 'Check for updates first.' };
    if (!exe) return { ok: false, error: 'Updates install only in the packaged app.' };
    const file = `${exe}.download`;
    const fail = error => { try { fs.unlinkSync(file); } catch { /* nothing to remove */ } return { ok: false, error }; };
    downloading = true;
    try {
      const res = await net.fetch(found.url, { headers: headers({ Accept: 'application/octet-stream' }) });
      if (!res.ok) return fail(`The download failed (${res.status}).`);
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(file);
      const reader = res.body.getReader();
      let received = 0, head = null, lastSent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        if (!head) head = chunk.subarray(0, 2).toString('latin1');
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        if (Date.now() - lastSent > 200) {
          lastSent = Date.now();
          const w = getWindow();
          if (w) w.webContents.send('update:progress', { received, total: found.size });
        }
      }
      await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve); });
      // Check it is complete, is really a program, and matches the published checksum.
      if (received !== found.size) return fail('The download was incomplete. Try again.');
      if (head !== 'MZ') return fail('The downloaded file isn’t a Windows program, so it wasn’t installed.');
      let expected = found.digest ? found.digest.replace(/^sha256:/i, '') : null;
      if (found.sumUrl) {
        const s = await net.fetch(found.sumUrl, { headers: headers({ Accept: 'application/octet-stream' }) });
        if (s.ok) expected = (await s.text()).trim().split(/\s+/)[0];
      }
      if (expected && expected.toLowerCase() !== hash.digest('hex')) return fail('The download failed its checksum, so it wasn’t installed.');
      downloaded = true;
      return { ok: true };
    } catch (err) {
      return fail(`The download failed: ${err.message}`);
    } finally {
      downloading = false;
    }
  });

  ipcMain.handle('update:install', () => {
    const exe = target();
    if (!exe || !downloaded) return { ok: false, error: 'Nothing is ready to install.' };
    const script = path.join(os.tmpdir(), `lexquest-update-${process.pid}.cmd`);
    fs.writeFileSync(script, swapScript(exe, `${exe}.download`, `${exe}.previous`), 'utf8');
    spawn('cmd.exe', ['/d', '/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => app.quit(), 200);
    return { ok: true };
  });

  ipcMain.handle('update:page', () => { if (found && /^https:\/\/github\.com\//.test(found.page || '')) shell.openExternal(found.page); return true; });

  // The new version is up, so the one it replaced and any abandoned download can go.
  app.whenReady().then(() => setTimeout(() => {
    const exe = target();
    if (!exe || downloading || downloaded) return;
    for (const leftover of [`${exe}.previous`, `${exe}.download`]) { try { fs.unlinkSync(leftover); } catch { /* not there, or still closing */ } }
  }, 20000));
}

module.exports = { register, isNewer };
