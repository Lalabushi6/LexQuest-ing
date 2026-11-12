// Tests for gcal.js against a fake Google: reading the client file, the browser sign-in (loopback
// listener, state and PKCE), keeping the LexQuest calendar in step, and reading other calendars.
// Nothing here talks to the real Google. Run with: npm test
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const G = require('../gcal.js');
const C = require('../app/js/calendar.js');
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// An in-memory Google Calendar behind a fetch function.
function fakeGoogle() {
  const g = { calendars: {}, list: [{ id: 'me@example.com', summary: 'me@example.com', primary: true, backgroundColor: '#9fe1e7' }, { id: 'family', summary: 'Family', backgroundColor: '#33b679' }], calls: [], expired: false, n: 0, tokens: 0 };
  g.calendars.family = { events: { f1: { id: 'f1', summary: 'Birthday', start: { date: '2031-02-08' }, end: { date: '2031-02-09' } } } };
  g.calendars['me@example.com'] = { events: { p1: { id: 'p1', summary: 'Gym', start: { dateTime: new Date(2031, 1, 3, 7, 0).toISOString() }, end: { dateTime: new Date(2031, 1, 3, 8, 0).toISOString() } } } };
  g.fetch = async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || 'GET', body = opts.body && method !== 'GET' && !/form/.test((opts.headers || {})['Content-Type'] || '') ? JSON.parse(opts.body) : null;
    g.calls.push(`${method} ${u.pathname}`);
    if (u.hostname === 'oauth2.googleapis.com') { g.tokens += 1; return reply(200, { access_token: `tok${g.tokens}`, expires_in: 3600 }); }
    if ((opts.headers || {}).Authorization !== `Bearer tok${g.tokens}` || g.expired) { g.expired = false; return reply(401, { error: { message: 'expired' } }); }
    const p = decodeURIComponent(u.pathname.replace('/calendar/v3', ''));
    let m;
    if (p === '/users/me/calendarList') return reply(200, { items: g.list });
    if (p === '/calendars' && method === 'POST') { const id = `lq${++g.n}`; g.calendars[id] = { meta: { id, ...body }, events: {} }; g.list.push({ id, summary: body.summary }); return reply(200, g.calendars[id].meta); }
    if ((m = p.match(/^\/calendars\/([^/]+)$/))) return g.calendars[m[1]] && g.calendars[m[1]].meta ? reply(200, g.calendars[m[1]].meta) : reply(404, { error: { message: 'Not Found' } });
    if ((m = p.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/))) {
      const c = g.calendars[m[1]];
      if (!c) return reply(404, { error: { message: 'Not Found' } });
      if (method === 'GET') {
        let items = Object.values(c.events);
        const prop = u.searchParams.get('privateExtendedProperty');
        if (prop) { const [k, v] = prop.split('='); items = items.filter(e => e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private[k] === v); }
        // Two pages, to check paging.
        const start = Number(u.searchParams.get('pageToken') || 0);
        return reply(200, { items: items.slice(start, start + 3), ...(start + 3 < items.length ? { nextPageToken: String(start + 3) } : {}) });
      }
      if (method === 'POST') { const id = `ev${++g.n}`; c.events[id] = { id, ...body }; return reply(200, c.events[id]); }
      if (method === 'PUT') { if (!c.events[m[2]]) return reply(404, {}); c.events[m[2]] = { id: m[2], ...body }; return reply(200, c.events[m[2]]); }
      if (method === 'DELETE') { if (!c.events[m[2]]) return reply(410, {}); delete c.events[m[2]]; return { ok: true, status: 204, json: async () => ({}) }; }
    }
    return reply(400, { error: { message: `unexpected ${method} ${p}` } });
  };
  g.getToken = async force => { if (force || !g.tokens) { g.tokens += 1; } return `tok${g.tokens}`; };
  return g;
}

test('the client file: a Desktop app JSON is read; others are refused', () => {
  const c = G.parseClient(JSON.stringify({ installed: { client_id: '123-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secret_value' } }));
  assert.deepStrictEqual(c, { id: '123-abc.apps.googleusercontent.com', secret: 'GOCSPX-secret_value' });
  assert.throws(() => G.parseClient('{not json'), /JSON file/);
  assert.throws(() => G.parseClient(JSON.stringify({ web: { client_id: '1.apps.googleusercontent.com' } })), /Desktop app/);
  assert.throws(() => G.parseClient(JSON.stringify({ installed: { client_id: 'nope' } })), /no Google OAuth client ID/);
});

const get = url => new Promise((resolve, reject) => http.get(url, res => { let s = ''; res.on('data', d => { s += d; }); res.on('end', () => resolve({ status: res.statusCode, body: s })); }).on('error', reject));

test('sign-in: the browser is sent to Google with PKCE, and the code comes back to the listener', async () => {
  let sent = null;
  const fetch = async (url, opts) => {
    const form = new URLSearchParams(opts.body);
    sent = Object.fromEntries(form);
    return reply(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3599, scope: Object.values(G.SCOPES).join(' ') });
  };
  const tokens = await G.authorize({
    client: { id: 'cid.apps.googleusercontent.com', secret: 's3cret' }, fetch,
    openExternal: async url => {
      const u = new URL(url);
      assert.strictEqual(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
      const q = Object.fromEntries(u.searchParams);
      assert.strictEqual(q.code_challenge_method, 'S256');
      assert.strictEqual(q.access_type, 'offline');
      assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(q.redirect_uri));
      assert.deepStrictEqual(q.scope.split(' ').sort(), Object.values(G.SCOPES).sort());
      // Something else knocking on the port, or a wrong state, is ignored.
      assert.strictEqual((await get(`${q.redirect_uri}/?code=evil&state=wrong`)).status, 404);
      const ok = await get(`${q.redirect_uri}/?code=the-code&state=${q.state}`);
      assert.ok(ok.body.includes('LexQuest is connected'));
    }
  });
  assert.strictEqual(tokens.refresh_token, 'r1');
  assert.strictEqual(sent.code, 'the-code');
  assert.strictEqual(sent.client_secret, 's3cret');
  assert.strictEqual(sent.grant_type, 'authorization_code');
  assert.ok(sent.code_verifier.length >= 43);
});

test('sign-in: the verifier sent to Google matches the challenge in the browser', async () => {
  let challenge = '', verifier = '';
  await G.authorize({
    client: { id: 'cid.apps.googleusercontent.com', secret: '' },
    fetch: async (url, opts) => { verifier = new URLSearchParams(opts.body).get('code_verifier'); assert.strictEqual(new URLSearchParams(opts.body).get('client_secret'), null); return reply(200, { access_token: 'a', refresh_token: 'r' }); },
    openExternal: async url => { const q = new URL(url).searchParams; challenge = q.get('code_challenge'); await get(`${q.get('redirect_uri')}/?code=c&state=${q.get('state')}`); }
  });
  assert.strictEqual(b64url(crypto.createHash('sha256').update(verifier).digest()), challenge);
});

test('sign-in: a refusal, a cancel and a timeout all end it', async () => {
  await assert.rejects(G.authorize({ client: { id: 'x.apps.googleusercontent.com' }, fetch: async () => reply(200, {}), openExternal: async url => { const q = new URL(url).searchParams; await get(`${q.get('redirect_uri')}/?error=access_denied&state=${q.get('state')}`); } }), /cancelled/);
  let handle;
  const p = G.authorize({ client: { id: 'x.apps.googleusercontent.com' }, fetch: async () => reply(200, {}), openExternal: async () => {}, onServer: h => { handle = h; } });
  handle.cancel();
  await assert.rejects(p, /cancelled/);
  await assert.rejects(G.authorize({ client: { id: 'x.apps.googleusercontent.com' }, fetch: async () => reply(200, {}), openExternal: async () => {}, timeoutMs: 50 }), /timed out/);
});

test('token errors: an expired sign-in is reported as signed out', async () => {
  const err = await G.tokenRequest(async () => reply(400, { error: 'invalid_grant' }), 'https://oauth2.googleapis.com/token', {}).catch(e => e);
  assert.ok(err.signedOut && /Connect again/.test(err.message));
  const net = await G.tokenRequest(async () => { throw new Error('ENOTFOUND'); }, 'https://oauth2.googleapis.com/token', {}).catch(e => e);
  assert.ok(/internet/.test(net.message));
});

const events = (today, extra = []) => C.collect({
  exams: [{ subject: 'lease', date: '2031-02-10', title: 'Leases final' }],
  own: [{ id: 'o1', title: 'Seminar', date: '2031-02-04', allDay: false, start: '10:00', end: '11:00', repeat: 'weekly', until: '2031-03-04' }, ...extra],
  plan: { days: { '2031-02-05': { date: '2031-02-05', items: [{ state: 'open', hours: 2, subject: 'lease', text: 'Notice' }], extra: [] } } },
  subjects: { lease: { short: 'Leases' } }, today
});

test('sync: makes the LexQuest calendar, adds events, then changes only what changed', async () => {
  const g = fakeGoogle();
  const api = G.makeApi({ fetch: g.fetch, getToken: g.getToken });
  const today = '2031-02-03';
  const r1 = await G.syncCalendar(api, { calendarId: '', events: events(today), timeZone: 'Asia/Kolkata', today });
  assert.deepStrictEqual([r1.inserted, r1.updated, r1.removed, r1.failed], [3, 0, 0, 0]);
  const cal = g.calendars[r1.calendarId];
  assert.strictEqual(cal.meta.summary, 'LexQuest');
  assert.strictEqual(cal.meta.timeZone, 'Asia/Kolkata');
  const seminar = Object.values(cal.events).find(e => e.summary === 'Seminar');
  assert.ok(seminar.recurrence[0].startsWith('RRULE:FREQ=WEEKLY;UNTIL='));

  const r2 = await G.syncCalendar(api, { calendarId: r1.calendarId, events: events(today), timeZone: 'Asia/Kolkata', today });
  assert.deepStrictEqual([r2.inserted, r2.updated, r2.removed], [0, 0, 0]);

  const changed = events(today, [{ id: 'o2', title: 'Library', date: '2031-02-06' }]).filter(e => e.key !== 'plan:2031-02-05');
  changed.find(e => e.key === 'own:o1').title = 'Seminar (room 4)';
  const r3 = await G.syncCalendar(api, { calendarId: r1.calendarId, events: changed, timeZone: 'Asia/Kolkata', today });
  assert.deepStrictEqual([r3.inserted, r3.updated, r3.removed], [1, 1, 1]);
  assert.deepStrictEqual(Object.values(cal.events).map(e => e.summary).sort(), ['Library', 'Seminar (room 4)', '🎓 Leases final']);
  assert.deepStrictEqual(Object.keys(g.calendars.family.events), ['f1'], 'other calendars untouched');
});

test('sync: a LexQuest calendar deleted in Google is made again; an expired token is refreshed once', async () => {
  const g = fakeGoogle();
  const api = G.makeApi({ fetch: g.fetch, getToken: g.getToken });
  const today = '2031-02-03';
  const r1 = await G.syncCalendar(api, { calendarId: 'gone-calendar', events: events(today), timeZone: 'UTC', today });
  assert.notStrictEqual(r1.calendarId, 'gone-calendar');
  assert.strictEqual(r1.inserted, 3);
  g.expired = true;
  const r2 = await G.syncCalendar(api, { calendarId: r1.calendarId, events: events(today), timeZone: 'UTC', today });
  assert.strictEqual(r2.failed, 0);
  assert.ok(g.calls.filter(c => c.startsWith('GET /calendar/v3/calendars/lq')).length >= 2);
});

test('reading other calendars skips the LexQuest one and returns month-view events', async () => {
  const g = fakeGoogle();
  const api = G.makeApi({ fetch: g.fetch, getToken: g.getToken });
  const r = await G.readEvents(api, { calendars: [{ id: 'me@example.com', summary: 'Me', color: '#9fe1e7' }, { id: 'family', summary: 'Family', color: '#33b679' }, { id: 'lq1', summary: 'LexQuest' }, { id: 'missing', summary: 'Missing' }], from: '2031-02-01', to: '2031-02-28', skipId: 'lq1' });
  assert.deepStrictEqual(r.events.map(e => [e.date, e.title, e.calendar, e.start]), [['2031-02-03', 'Gym', 'Me', '07:00'], ['2031-02-08', 'Birthday', 'Family', '']]);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(/Missing/.test(r.errors[0]));
});

(async () => {
  for (const [name, fn] of tests) { await fn(); passed += 1; console.log('ok -', name); }
  console.log(`\n${passed} Google Calendar tests passed`);
})().catch(err => { console.error(err); process.exit(1); });
