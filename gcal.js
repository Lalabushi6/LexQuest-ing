// Google Calendar. A profile connects its Google account the way Google asks installed apps to: the
// system browser, a one-off listener on 127.0.0.1 and PKCE. LexQuest then keeps a "LexQuest" calendar
// in that account in step with the app (exams, the study plan, recall checks, the person's own events)
// and reads their other calendars to show beside it. It only ever writes to the calendar it created.
// The OAuth client is made by the person in Google Cloud and kept in config.json; each profile's
// sign-in is encrypted by the operating system (safeStorage) and kept in its own folder.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cal = require('./app/js/calendar.js');

const GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3'
};
const SCOPES = {
  own: 'https://www.googleapis.com/auth/calendar.app.created',           // make the LexQuest calendar and manage its events
  list: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', // see which calendars there are
  read: 'https://www.googleapis.com/auth/calendar.events.readonly'        // read events to show them in the app
};
const CALENDAR_NAME = 'LexQuest';
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class GoogleError extends Error {
  constructor(message, { status = 0, reason = '', signedOut = false } = {}) { super(message); this.status = status; this.reason = reason; this.signedOut = signedOut; }
}

// The client ID and secret from the JSON file Google Cloud gives for a "Desktop app" client.
function parseClient(text) {
  let obj;
  try { obj = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('That isn’t the JSON file Google gave you.'); }
  const c = (obj && (obj.installed || obj.web || obj)) || {};
  const id = String(c.client_id || c.clientId || '').trim(), secret = String(c.client_secret || c.clientSecret || '').trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('That file has no Google OAuth client ID in it. Download the JSON of a “Desktop app” client.');
  if (obj && obj.web && !obj.installed) throw new Error('That is a “Web application” client. Make a “Desktop app” client instead.');
  return { id, secret: /^[\w-]{10,100}$/.test(secret) ? secret : '' };
}

// Sign-in in the browser. Resolves with Google's tokens, or rejects if cancelled, refused or timed out.
function authorize({ client, openExternal, fetch, timeoutMs = 5 * 60 * 1000, endpoints = GOOGLE, onServer = () => {} }) {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let done = false, timer = null;
    const server = http.createServer();
    const finish = (err, value) => {
      if (done) return;
      done = true; clearTimeout(timer);
      server.close();
      if (err) reject(err); else resolve(value);
    };
    onServer({ cancel: () => finish(new GoogleError('Google sign-in was cancelled.')) });
    server.on('error', err => finish(err));
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}`;
      server.on('request', (req, res) => {
        const u = new URL(req.url, redirect);
        if (u.pathname !== '/' || u.searchParams.get('state') !== state) { res.writeHead(404); res.end(); return; }
        const error = u.searchParams.get('error'), code = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><meta charset="utf-8"><title>LexQuest</title><body style="font:16px system-ui,sans-serif;max-width:32em;margin:15vh auto;padding:0 16px">
          <h2>${error ? 'LexQuest wasn’t connected' : 'LexQuest is connected to Google Calendar'}</h2><p>You can close this tab and go back to LexQuest.</p></body>`);
        if (error || !code) return finish(new GoogleError(error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google refused the sign-in (${error || 'no code'}).`));
        const form = { code, client_id: client.id, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier };
        if (client.secret) form.client_secret = client.secret;
        tokenRequest(fetch, endpoints.token, form).then(t => finish(null, t), finish);
      });
      const url = `${endpoints.auth}?${new URLSearchParams({
        client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: Object.values(SCOPES).join(' '),
        code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent'
      })}`;
      timer = setTimeout(() => finish(new GoogleError('Google sign-in timed out. Try again.')), timeoutMs);
      Promise.resolve(openExternal(url)).catch(err => finish(err));
    });
  });
}

async function tokenRequest(fetch, url, form) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }); }
  catch { throw new GoogleError('Couldn’t reach Google. Check your internet connection.'); }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) return body;
  if (body.error === 'invalid_grant') throw new GoogleError('Google has signed LexQuest out: the connection expired or was removed. Connect again.', { status: res.status, reason: 'invalid_grant', signedOut: true });
  if (body.error === 'invalid_client' || body.error === 'unauthorized_client') throw new GoogleError('Google didn’t accept the OAuth client. Choose the client’s JSON file again.', { status: res.status, reason: body.error });
  throw new GoogleError(`Google sign-in failed (${body.error_description || body.error || res.status}).`, { status: res.status, reason: body.error || '' });
}

// A small Calendar API client. getToken(force) returns an access token, refreshing it when asked.
function makeApi({ fetch, getToken, base = GOOGLE.api }) {
  async function call(method, url, body, retried = false) {
    const token = await getToken(retried);
    let res;
    try { res = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new GoogleError('Couldn’t reach Google. Check your internet connection.'); }
    if (res.status === 401 && !retried) return call(method, url, body, true);
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const err = (data && data.error) || {};
    const reason = (err.errors && err.errors[0] && err.errors[0].reason) || err.status || '';
    if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(err.message || '')) throw new GoogleError('The Google Calendar API is off in your Google Cloud project. Turn it on (APIs & Services → Library → Google Calendar API → Enable), then try again.', { status: res.status, reason });
    if (res.status === 403 && /insufficient/i.test(`${reason} ${err.message}`)) throw new GoogleError('LexQuest wasn’t given all the Calendar permissions it asked for. Disconnect, connect again and tick every box.', { status: res.status, reason: 'insufficientPermissions' });
    throw new GoogleError(`Google Calendar replied with an error (${res.status}${err.message ? `: ${err.message}` : ''}).`, { status: res.status, reason });
  }
  const enc = encodeURIComponent;
  async function pages(url, params) {
    const items = [];
    let pageToken = '';
    for (let i = 0; i < 40; i++) {
      const q = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) });
      const data = await call('GET', `${url}?${q}`);
      items.push(...(data.items || []));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return items;
  }
  return {
    call,
    calendars: () => pages('/users/me/calendarList', { maxResults: '250' }),
    events: (id, params) => pages(`/calendars/${enc(id)}/events`, { maxResults: '2500', ...params }),
    getCalendar: id => call('GET', `/calendars/${enc(id)}`),
    createCalendar: timeZone => call('POST', '/calendars', { summary: CALENDAR_NAME, description: 'Exams, the study plan and your own events from LexQuest. LexQuest keeps this calendar up to date, so make changes in the app: edits made here are replaced at the next sync.', timeZone }),
    insert: (id, body) => call('POST', `/calendars/${enc(id)}/events`, body),
    replace: (id, eventId, body) => call('PUT', `/calendars/${enc(id)}/events/${enc(eventId)}`, body),
    remove: (id, eventId) => call('DELETE', `/calendars/${enc(id)}/events/${enc(eventId)}`).catch(err => { if (err.status === 404 || err.status === 410) return {}; throw err; })
  };
}

// Makes sure the LexQuest calendar exists (making it again if the person deleted it in Google), then
// brings its events in line with `events` (from calendar.collect). Returns what changed.
async function syncCalendar(api, { calendarId, events, timeZone, today }) {
  let id = calendarId;
  if (id) {
    try { const c = await api.getCalendar(id); if (c.deleted) id = null; } catch (err) { if (err.status === 404 || err.status === 410 || err.status === 403) id = null; else throw err; }
  }
  if (!id) id = (await api.createCalendar(timeZone)).id;
  const existing = await api.events(id, { privateExtendedProperty: 'lqApp=lexquest', showDeleted: 'false' });
  const desired = events.map(e => cal.googleBody(e, timeZone));
  const d = cal.diff(desired, existing, today);
  const result = { calendarId: id, inserted: 0, updated: 0, removed: 0, failed: 0, errors: [] };
  const jobs = [
    ...d.insert.map(b => () => api.insert(id, b).then(() => { result.inserted += 1; })),
    ...d.update.map(u => () => api.replace(id, u.id, u.body).then(() => { result.updated += 1; })),
    ...d.remove.map(e => () => api.remove(id, e).then(() => { result.removed += 1; }))
  ];
  // A few at a time keeps well inside Google's rate limits.
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await job(); } catch (err) {
        if (err.signedOut || err.reason === 'insufficientPermissions') throw err;
        result.failed += 1;
        if (result.errors.length < 3) result.errors.push(err.message);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return result;
}

// Events from the person's chosen calendars between two dates, ready for the month view.
async function readEvents(api, { calendars, from, to, skipId }) {
  const out = [], errors = [];
  const timeMin = cal.parse(from).toISOString(), timeMax = cal.parse(cal.addDays(to, 1)).toISOString();
  for (const c of calendars.slice(0, 12)) {
    if (!c || !c.id || c.id === skipId) continue;
    try {
      const items = await api.events(c.id, { singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax });
      out.push(...cal.fromGoogle(items, c));
    } catch (err) {
      if (err.signedOut) throw err;
      errors.push(`${c.summary || c.id}: ${err.message}`);
    }
  }
  return { events: out, errors };
}

/* ---------- the app's side ---------- */
function register({ configFile, readJson, writeJsonAtomic, getUserDir, getWindow }) {
  const { ipcMain, dialog, safeStorage, shell, net } = require('electron');
  const fetch = (url, opts) => net.fetch(url, opts);
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const seal = s => safeStorage.encryptString(s).toString('base64');
  const open = s => { try { return safeStorage.decryptString(Buffer.from(s, 'base64')); } catch { return null; } };

  const clientCfg = () => readJson(configFile, {}).google || {};
  const client = () => { const c = clientCfg(); if (!c.clientId) return null; return { id: c.clientId, secret: c.secret ? open(c.secret) || '' : '' }; };
  const saveClient = c => { const all = readJson(configFile, {}); writeJsonAtomic(configFile, { ...all, google: c }); };

  const userFile = () => { const d = getUserDir(); return d ? path.join(d, 'google.json') : null; };
  const account = () => { const f = userFile(); return f ? readJson(f, null) : null; };
  const saveAccount = patch => { const f = userFile(); if (!f) return null; const next = { ...(readJson(f, {}) || {}), ...patch }; writeJsonAtomic(f, next); return next; };
  // Signing out keeps only the LexQuest calendar's id, so connecting again reuses that calendar.
  const forget = () => { const f = userFile(); if (f && fs.existsSync(f)) writeJsonAtomic(f, { calendarId: (readJson(f, {}) || {}).calendarId || '' }); access = null; };

  let access = null;   // { token, exp, user } — the short-lived access token, never written to disk
  let pending = null;  // the sign-in in progress, so it can be cancelled
  async function getToken(force) {
    const dir = getUserDir();
    if (!force && access && access.user === dir && access.exp > Date.now() + 60000) return access.token;
    const a = account(), c = client();
    const refresh = a && a.refresh ? open(a.refresh) : null;
    if (!c || !refresh) throw new GoogleError('Connect Google Calendar first.', { signedOut: true });
    const form = { client_id: c.id, refresh_token: refresh, grant_type: 'refresh_token' };
    if (c.secret) form.client_secret = c.secret;
    try {
      const t = await tokenRequest(fetch, GOOGLE.token, form);
      access = { token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000, user: dir };
      return access.token;
    } catch (err) {
      if (err.signedOut) { saveAccount({ refresh: null, signedOutAt: Date.now() }); access = null; }
      throw err;
    }
  }
  const api = makeApi({ fetch, getToken });
  const fail = err => ({ ok: false, error: err.message || String(err), signedOut: !!err.signedOut });
  const has = (scopes, s) => String(scopes || '').split(/\s+/).includes(s);

  ipcMain.handle('gcal:status', () => {
    const c = clientCfg(), a = account() || {};
    return {
      client: !!c.clientId, clientHint: c.clientId ? `${c.clientId.slice(0, 12)}…` : '', canEncrypt: safeStorage.isEncryptionAvailable(),
      connected: !!a.refresh, account: a.account || '', calendarId: a.calendarId || '', lastSync: a.lastSync || 0, lastResult: a.lastResult || null,
      canRead: has(a.scopes, SCOPES.read) && has(a.scopes, SCOPES.list), signedOutAt: a.signedOutAt || 0, timeZone: timeZone()
    };
  });

  function setClient(text) {
    const c = parseClient(text);
    if (c.secret && !safeStorage.isEncryptionAvailable()) throw new Error('This computer can’t store the client secret securely.');
    saveClient({ clientId: c.id, secret: c.secret ? seal(c.secret) : null });
    access = null;
    return { ok: true };
  }
  ipcMain.handle('gcal:setClient', (_e, text) => { try { return setClient(String(text || '').slice(0, 20000)); } catch (err) { return fail(err); } });
  ipcMain.handle('gcal:pickClientFile', async () => {
    const res = await dialog.showOpenDialog(getWindow(), { title: 'Choose the OAuth client file you downloaded from Google Cloud', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled || !res.filePaths[0]) return null;
    try {
      if (fs.statSync(res.filePaths[0]).size > 20000) throw new Error('That file is too big to be a Google client file.');
      return setClient(fs.readFileSync(res.filePaths[0], 'utf8'));
    } catch (err) { return fail(err); }
  });
  ipcMain.handle('gcal:clearClient', () => { saveClient(undefined); access = null; return { ok: true }; });

  ipcMain.handle('gcal:connect', async () => {
    const c = client();
    if (!c) return { ok: false, error: 'Add your Google OAuth client first.' };
    if (!getUserDir()) return { ok: false, error: 'Sign in to a profile first.' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'This computer can’t store the Google sign-in securely.' };
    if (pending) pending.cancel();
    try {
      const t = await authorize({ client: c, fetch, openExternal: url => shell.openExternal(url), onServer: p => { pending = p; } });
      pending = null;
      if (!t.refresh_token) return { ok: false, error: 'Google didn’t give LexQuest a lasting sign-in. Remove LexQuest’s access in your Google Account (Security → Third-party connections) and connect again.' };
      if (!has(t.scope, SCOPES.own)) return { ok: false, error: 'LexQuest needs permission to make and manage its own calendar. Connect again and tick that box.' };
      const prev = account() || {};
      saveAccount({ refresh: seal(t.refresh_token), scopes: t.scope, connectedAt: Date.now(), signedOutAt: 0, calendarId: prev.calendarId || '' });
      access = { token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000, user: getUserDir() };
      let email = '';
      if (has(t.scope, SCOPES.list)) { try { const p = (await api.calendars()).find(x => x.primary); email = p ? p.id : ''; } catch { /* shown as just "connected" */ } }
      saveAccount({ account: email });
      const w = getWindow(); if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
      return { ok: true, account: email };
    } catch (err) { pending = null; return fail(err); }
  });
  ipcMain.handle('gcal:cancel', () => { if (pending) pending.cancel(); pending = null; return true; });

  ipcMain.handle('gcal:disconnect', async () => {
    const a = account();
    const refresh = a && a.refresh ? open(a.refresh) : null;
    if (refresh) { try { await fetch(GOOGLE.revoke, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }).toString() }); } catch { /* signed out here either way */ } }
    forget();
    return { ok: true };
  });

  ipcMain.handle('gcal:calendars', async () => {
    try {
      const own = (account() || {}).calendarId;
      const list = await api.calendars();
      return { ok: true, calendars: list.filter(c => !c.deleted).map(c => ({ id: c.id, summary: c.summaryOverride || c.summary || c.id, color: c.backgroundColor || '', primary: !!c.primary, lexquest: c.id === own })) };
    } catch (err) { return fail(err); }
  });

  ipcMain.handle('gcal:events', async (_e, { from, to, calendars } = {}) => {
    if (!cal.isDate(from) || !cal.isDate(to) || to < from || cal.parse(to) - cal.parse(from) > 400 * 86400000) return { ok: false, error: 'Bad date range.' };
    try {
      const list = (Array.isArray(calendars) ? calendars : []).map(c => ({ id: String(c.id || '').slice(0, 300), summary: String(c.summary || '').slice(0, 120), color: String(c.color || '') }));
      const r = await readEvents(api, { calendars: list, from, to, skipId: (account() || {}).calendarId });
      return { ok: true, ...r };
    } catch (err) { return fail(err); }
  });

  ipcMain.handle('gcal:sync', async (_e, { events, today } = {}) => {
    if (!Array.isArray(events) || events.length > 3000 || !cal.isDate(today)) return { ok: false, error: 'Nothing to sync.' };
    // Rebuild every event from plain fields, so only well-formed events reach Google.
    const clean = events.map(e => {
      if (!e || typeof e !== 'object' || !cal.isDate(e.date) || !/^(exam|plan|recall|own):[\w:@.-]{1,120}$/.test(e.key || '')) return null;
      const time = t => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t || '') ? t : '');
      const timed = !e.allDay && time(e.start);
      return { key: e.key, kind: e.key.split(':')[0], date: e.date, allDay: !timed, start: timed ? e.start : '', end: timed ? time(e.end) : '', title: String(e.title || '').slice(0, 200) || 'Event', details: String(e.details || '').slice(0, 4000), repeat: e.repeat === 'weekly' ? 'weekly' : '', until: cal.isDate(e.until) ? e.until : '' };
    }).filter(Boolean);
    try {
      const r = await syncCalendar(api, { calendarId: (account() || {}).calendarId, events: clean, timeZone: timeZone(), today });
      saveAccount({ calendarId: r.calendarId, lastSync: Date.now(), lastResult: { inserted: r.inserted, updated: r.updated, removed: r.removed, failed: r.failed } });
      return { ok: true, ...r };
    } catch (err) { return fail(err); }
  });
}

module.exports = { register, parseClient, authorize, makeApi, syncCalendar, readEvents, tokenRequest, GoogleError, SCOPES };
