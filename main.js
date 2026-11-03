// LexQuest — Electron main process.
// Portable: everything is stored in "LexQuest Data" next to the .exe. Each profile keeps its own
// progress in users/<id>/progress.json. Courses are not part of the app: they load from the
// "LexQuest Content" folder beside the .exe, so updating the app never touches them. Course files are
// opened relative to the active semester's folder (the folder the .exe sits in for the current
// semester, unless changed in Settings).
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const updater = require('./updater');

const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const baseDir = isPortable ? process.env.PORTABLE_EXECUTABLE_DIR : path.resolve(__dirname, '..');
const dataDir = path.join(baseDir, 'LexQuest Data');
const contentDir = path.join(baseDir, 'LexQuest Content');
const legacyStateFile = path.join(dataDir, 'progress.json');
const configFile = path.join(dataDir, 'config.json');
const usersFile = path.join(dataDir, 'users.json');
const usersDir = path.join(dataDir, 'users');
const COLORS = ['#7aa2ff', '#4fd18b', '#ffbf5e', '#ff79c6', '#4dd0e1', '#b892ff', '#f28da0', '#c7d36f'];

let mainWindow = null;
let currentUser = null;           // the profile signed in to this window
let activeSemester = 1;
// The current semester's folder holds the .exe; other semesters default to a sibling "Semester N" folder.
let homeSemester = 1;
const attempts = {};              // profile id -> { n, until }: slows down PIN guessing

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------- profiles ---------- */
const readUsers = () => readJson(usersFile, { version: 1, users: [], lastUser: null });
const userDir = id => path.join(usersDir, id);
const userStateFile = id => path.join(userDir(id), 'progress.json');
const newId = () => 'u' + crypto.randomBytes(5).toString('hex');
const publicUser = u => ({ id: u.id, name: u.name, color: u.color, hasPin: !!u.pin, createdAt: u.createdAt, lastUsed: u.lastUsed });
const validPin = pin => /^\d{4,8}$/.test(String(pin || ''));

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function pinMatches(user, pin) {
  if (!user.pin) return true;
  const h = crypto.scryptSync(String(pin || ''), user.pin.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(user.pin.hash, 'hex'));
}

// Before profiles existed, all progress lived in one progress.json. Move it into a first profile
// (named from its settings) and keep the original file untouched under a new name.
function migrateToProfiles() {
  ensureDataDir();
  if (fs.existsSync(usersFile)) return;
  const db = { version: 1, users: [], lastUser: null };
  const legacy = readJson(legacyStateFile, null);
  if (legacy) {
    const id = newId();
    fs.mkdirSync(userDir(id), { recursive: true });
    fs.copyFileSync(legacyStateFile, userStateFile(id));
    db.users.push({ id, name: (legacy.settings && legacy.settings.name) || 'Me', color: COLORS[0], pin: null, createdAt: legacy.createdAt || Date.now(), lastUsed: Date.now() });
    db.lastUser = id;
  }
  writeJsonAtomic(usersFile, db);
  if (legacy) fs.renameSync(legacyStateFile, path.join(dataDir, 'progress (before profiles).json'));
}

// One backup per profile per day, keep the last 10.
function dailyBackup(id) {
  const file = userStateFile(id);
  if (!fs.existsSync(file)) return;
  const backups = path.join(userDir(id), 'backups');
  if (!fs.existsSync(backups)) fs.mkdirSync(backups, { recursive: true });
  const target = path.join(backups, `progress-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  const all = fs.readdirSync(backups).filter(f => f.startsWith('progress-')).sort();
  while (all.length > 10) fs.unlinkSync(path.join(backups, all.shift()));
}

function setTitle() {
  if (!mainWindow) return;
  const u = currentUser && readUsers().users.find(x => x.id === currentUser);
  mainWindow.setTitle(u ? `LexQuest — ${u.name}` : 'LexQuest');
}

/* ---------- semester folders ---------- */
function semesterRoot(n = activeSemester) {
  const cfg = readJson(configFile, {});
  const custom = (cfg.roots || {})[n] || (n === homeSemester ? cfg.semesterRoot : null);
  if (custom && fs.existsSync(custom)) return custom;
  return n === homeSemester ? baseDir : path.join(path.dirname(baseDir), `Semester ${n}`);
}

function resolveInRoot(rel) {
  return path.join(semesterRoot(), rel.replace(/[\\/]+/g, path.sep));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#14161c',
    title: 'LexQuest',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  // The page sets its own document title; keep the profile name in the window title instead.
  mainWindow.on('page-title-updated', e => { e.preventDefault(); setTitle(); });
  // Links in content open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('users:list', () => {
  const db = readUsers();
  return { users: db.users.map(publicUser), lastUser: db.lastUser };
});

ipcMain.handle('users:create', (_e, name, pin) => {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'Please enter a name.' };
  if (pin && !validPin(pin)) return { ok: false, error: 'A PIN must be 4–8 digits.' };
  const db = readUsers();
  if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'A profile with that name already exists.' };
  const u = { id: newId(), name, color: COLORS[db.users.length % COLORS.length], pin: pin ? hashPin(pin) : null, createdAt: Date.now(), lastUsed: Date.now() };
  fs.mkdirSync(userDir(u.id), { recursive: true });
  db.users.push(u); db.lastUser = u.id;
  writeJsonAtomic(usersFile, db);
  currentUser = u.id; setTitle();
  return { ok: true, user: publicUser(u) };
});

ipcMain.handle('users:login', (_e, id, pin) => {
  const db = readUsers();
  const u = db.users.find(x => x.id === id);
  if (!u) return { ok: false, error: 'That profile no longer exists.' };
  const a = attempts[id] || { n: 0, until: 0 };
  if (a.until > Date.now()) return { ok: false, error: `Too many wrong PINs. Try again in ${Math.ceil((a.until - Date.now()) / 1000)} s.` };
  if (!pinMatches(u, pin)) {
    a.n += 1;
    if (a.n >= 5) { a.until = Date.now() + 30000; a.n = 0; }
    attempts[id] = a;
    return { ok: false, error: 'Wrong PIN.' };
  }
  delete attempts[id];
  u.lastUsed = Date.now(); db.lastUser = id;
  writeJsonAtomic(usersFile, db);
  currentUser = id; setTitle();
  return { ok: true, user: publicUser(u) };
});

ipcMain.handle('users:logout', () => { currentUser = null; setTitle(); return true; });

// The changes below act only on the signed-in profile.
ipcMain.handle('users:rename', (_e, name) => {
  name = String(name || '').trim().slice(0, 40);
  if (!currentUser || !name) return { ok: false, error: 'Please enter a name.' };
  const db = readUsers();
  if (db.users.some(u => u.id !== currentUser && u.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Another profile already has that name.' };
  db.users.find(u => u.id === currentUser).name = name;
  writeJsonAtomic(usersFile, db); setTitle();
  return { ok: true };
});

ipcMain.handle('users:setPin', (_e, oldPin, newPin) => {
  if (!currentUser) return { ok: false, error: 'Not signed in.' };
  const db = readUsers();
  const u = db.users.find(x => x.id === currentUser);
  if (!pinMatches(u, oldPin)) return { ok: false, error: 'Your current PIN is wrong.' };
  if (newPin && !validPin(newPin)) return { ok: false, error: 'A PIN must be 4–8 digits.' };
  u.pin = newPin ? hashPin(newPin) : null;
  writeJsonAtomic(usersFile, db);
  return { ok: true };
});

// Deleting a profile moves its folder to "deleted profiles" rather than erasing it.
ipcMain.handle('users:remove', (_e, pin) => {
  if (!currentUser) return { ok: false, error: 'Not signed in.' };
  const db = readUsers();
  const u = db.users.find(x => x.id === currentUser);
  if (!pinMatches(u, pin)) return { ok: false, error: 'Wrong PIN.' };
  const bin = path.join(dataDir, 'deleted profiles');
  fs.mkdirSync(bin, { recursive: true });
  if (fs.existsSync(userDir(u.id))) fs.renameSync(userDir(u.id), path.join(bin, `${u.name.replace(/[^\w -]/g, '')} ${u.id} ${new Date().toISOString().slice(0, 10)}`));
  db.users = db.users.filter(x => x.id !== u.id);
  if (db.lastUser === u.id) db.lastUser = db.users[0] ? db.users[0].id : null;
  writeJsonAtomic(usersFile, db);
  currentUser = null; setTitle();
  return { ok: true };
});

ipcMain.handle('data:load', () => {
  if (!currentUser) return null;
  dailyBackup(currentUser);
  return readJson(userStateFile(currentUser), null);
});

ipcMain.handle('data:save', (_e, state) => {
  if (!currentUser) return false;
  writeJsonAtomic(userStateFile(currentUser), state);
  return true;
});

ipcMain.handle('sem:set', (_e, n, home) => {
  homeSemester = Number(home) || homeSemester;
  activeSemester = Number(n) || homeSemester;
  return semesterRoot();
});

// The course packs to load, in order: as listed in content.json if there is one, otherwise by name.
ipcMain.handle('content:files', () => {
  if (!fs.existsSync(contentDir)) return [];
  const present = fs.readdirSync(contentDir).filter(f => f.toLowerCase().endsWith('.js')).sort();
  const listed = (readJson(path.join(contentDir, 'content.json'), {}).load || []).map(f => path.basename(String(f)));
  return (listed.length ? listed.filter(f => present.includes(f)) : present).map(f => ({ name: f, url: pathToFileURL(path.join(contentDir, f)).href }));
});

ipcMain.handle('content:open', () => {
  fs.mkdirSync(contentDir, { recursive: true });
  shell.openPath(contentDir);
  return contentDir;
});

ipcMain.handle('app:info', () => ({
  dataDir,
  contentDir,
  userDir: currentUser ? userDir(currentUser) : null,
  semesterRoot: semesterRoot(),
  semester: activeSemester,
  portable: isPortable,
  version: app.getVersion()
}));

ipcMain.handle('fs:open', async (_e, rel) => {
  const p = resolveInRoot(rel);
  if (!fs.existsSync(p)) return { ok: false, error: 'Not found: ' + rel };
  const err = await shell.openPath(p);
  return { ok: !err, error: err || null };
});

ipcMain.handle('fs:reveal', (_e, rel) => {
  const p = resolveInRoot(rel);
  if (fs.existsSync(p)) shell.showItemInFolder(p);
  else shell.openPath(semesterRoot());
  return true;
});

ipcMain.handle('fs:exists', (_e, rels) => rels.map(r => fs.existsSync(resolveInRoot(r))));

ipcMain.handle('fs:list', (_e, relDir) => {
  const p = resolveInRoot(relDir);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name);
});

ipcMain.handle('fs:chooseRoot', async () => {
  const res = await dialog.showOpenDialog({ title: `Choose your Semester ${activeSemester} folder`, properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  const cfg = readJson(configFile, {});
  cfg.roots = { ...(cfg.roots || {}), [activeSemester]: res.filePaths[0] };
  writeJsonAtomic(configFile, cfg);
  return res.filePaths[0];
});

ipcMain.handle('data:export', async (_e, payload, suggestedName, kind) => {
  const filters = kind === 'md'
    ? [{ name: 'Markdown', extensions: ['md'] }]
    : kind === 'html' ? [{ name: 'Web page', extensions: ['html'] }] : [{ name: 'JSON', extensions: ['json'] }];
  const res = await dialog.showSaveDialog({ title: 'Export', defaultPath: path.join(semesterRoot(), suggestedName), filters });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, payload, 'utf8');
  return res.filePath;
});

// Asks where to save (starting in the folder used last time), renders the finished HTML page
// off-screen with scripts off, saves it as a PDF and opens it so it can be checked or printed.
ipcMain.handle('pdf:export', async (_e, html, suggestedName) => {
  const lastDir = readJson(configFile, {}).pdfDir;
  const startDir = lastDir && fs.existsSync(lastDir) ? lastDir : semesterRoot();
  const res = await dialog.showSaveDialog(mainWindow, { title: 'Choose where to save the PDF', buttonLabel: 'Save PDF', defaultPath: path.join(startDir, suggestedName), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (res.canceled || !res.filePath) return null;
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.6, left: 0.55, right: 0.55 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });
    fs.writeFileSync(res.filePath, pdf);
    writeJsonAtomic(configFile, { ...readJson(configFile, {}), pdfDir: path.dirname(res.filePath) });
    shell.openPath(res.filePath);
    return { ok: true, path: res.filePath };
  } catch (err) {
    const busy = err.code === 'EBUSY' || err.code === 'EPERM';
    return { ok: false, error: busy ? 'That PDF is open in another program. Close it and try again.' : err.message };
  } finally {
    win.destroy();
  }
});

ipcMain.handle('data:import', async () => {
  const res = await dialog.showOpenDialog({ title: 'Import a LexQuest backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (res.canceled || !res.filePaths[0]) return null;
  return fs.readFileSync(res.filePaths[0], 'utf8');
});

updater.register({ configFile, readJson, writeJsonAtomic, getWindow: () => mainWindow });

app.whenReady().then(() => {
  migrateToProfiles();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
