// Profiles: the "Who's studying?" screen, PINs, switching and profile settings.
// In the desktop app profiles live in "LexQuest Data/users"; the browser preview keeps them in
// localStorage so the same screens can be tried without the .exe.
'use strict';
(function () {
  const { $, $$, esc, uid } = LQ.h;
  const COLORS = ['#7aa2ff', '#4fd18b', '#ffbf5e', '#ff79c6', '#4dd0e1', '#b892ff', '#f28da0', '#c7d36f'];
  const validPin = p => /^\d{4,8}$/.test(String(p || ''));

  /* ---------- storage: desktop IPC, or a localStorage stand-in for the browser preview ---------- */
  function browserStore() {
    const KEY = 'lexquest-users';
    let current = null;
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
    const write = db => localStorage.setItem(KEY, JSON.stringify(db));
    const pub = u => ({ id: u.id, name: u.name, color: u.color, hasPin: !!u.pin, createdAt: u.createdAt, lastUsed: u.lastUsed });
    const digest = async (pin, salt) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)))).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashPin = async pin => { const salt = uid() + uid(); return { salt, hash: await digest(pin, salt) }; };
    const matches = async (u, pin) => !u.pin || (await digest(String(pin || ''), u.pin.salt)) === u.pin.hash;
    function db() {
      let d = read();
      if (d) return d;
      d = { users: [], lastUser: null };
      // Progress saved before profiles existed becomes the first profile.
      const legacy = localStorage.getItem('lexquest');
      if (legacy) {
        let name = 'Me';
        try { name = JSON.parse(legacy).settings.name || name; } catch { /* keep default */ }
        const id = 'u' + uid();
        d.users.push({ id, name, color: COLORS[0], pin: null, createdAt: Date.now(), lastUsed: Date.now() });
        d.lastUser = id;
        localStorage.setItem('lexquest:' + id, legacy);
      }
      write(d);
      return d;
    }
    const me = () => db().users.find(u => u.id === current);
    return {
      load: async () => current ? JSON.parse(localStorage.getItem('lexquest:' + current) || 'null') : null,
      save: async s => { if (current) localStorage.setItem('lexquest:' + current, JSON.stringify(s)); return !!current; },
      setSemester: async () => null,
      users: {
        list: async () => { const d = db(); return { users: d.users.map(pub), lastUser: d.lastUser }; },
        async create(name, pin) {
          name = String(name || '').trim().slice(0, 40);
          if (!name) return { ok: false, error: 'Please enter a name.' };
          if (pin && !validPin(pin)) return { ok: false, error: 'A PIN must be 4–8 digits.' };
          const d = db();
          if (d.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'A profile with that name already exists.' };
          const u = { id: 'u' + uid(), name, color: COLORS[d.users.length % COLORS.length], pin: pin ? await hashPin(pin) : null, createdAt: Date.now(), lastUsed: Date.now() };
          d.users.push(u); d.lastUser = u.id; write(d); current = u.id;
          return { ok: true, user: pub(u) };
        },
        async login(id, pin) {
          const d = db(); const u = d.users.find(x => x.id === id);
          if (!u) return { ok: false, error: 'That profile no longer exists.' };
          if (!(await matches(u, pin))) return { ok: false, error: 'Wrong PIN.' };
          u.lastUsed = Date.now(); d.lastUser = id; write(d); current = id;
          return { ok: true, user: pub(u) };
        },
        logout: async () => { current = null; return true; },
        async rename(name) {
          name = String(name || '').trim().slice(0, 40);
          const d = db(); if (!current || !name) return { ok: false, error: 'Please enter a name.' };
          if (d.users.some(u => u.id !== current && u.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'Another profile already has that name.' };
          d.users.find(u => u.id === current).name = name; write(d); return { ok: true };
        },
        async setPin(oldPin, newPin) {
          const d = db(); const u = d.users.find(x => x.id === current);
          if (!u || !(await matches(u, oldPin))) return { ok: false, error: 'Your current PIN is wrong.' };
          if (newPin && !validPin(newPin)) return { ok: false, error: 'A PIN must be 4–8 digits.' };
          u.pin = newPin ? await hashPin(newPin) : null; write(d); return { ok: true };
        },
        async remove(pin) {
          const d = db(); const u = me();
          if (!u || !(await matches(u, pin))) return { ok: false, error: 'Wrong PIN.' };
          d.users = d.users.filter(x => x.id !== u.id);
          if (d.lastUser === u.id) d.lastUser = d.users[0] ? d.users[0].id : null;
          write(d); localStorage.removeItem('lexquest:' + u.id); current = null;
          return { ok: true };
        }
      }
    };
  }

  LQ.store = window.lq
    ? { load: () => window.lq.load(), save: s => window.lq.save(s), setSemester: (n, home) => window.lq.setSemester(n, home), users: window.lq.users }
    : browserStore();

  /* ---------- the "Who's studying?" screen ---------- */
  const initials = name => name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (u, size = 64) => `<span class="avatar" style="--av:${esc(u.color || COLORS[0])};width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px">${esc(initials(u.name))}</span>`;
  LQ.avatar = avatar;

  // Resolves with the signed-in profile. One profile without a PIN goes straight in,
  // unless the person chose "Switch profile".
  LQ.signIn = function signIn({ picker = false } = {}) {
    return new Promise(async resolve => {
      const { users, lastUser } = await LQ.store.users.list();
      if (!picker && users.length === 1 && !users[0].hasPin) {
        const r = await LQ.store.users.login(users[0].id);
        if (r.ok) return resolve(r.user);
      }
      const root = $('#loginRoot');
      root.hidden = false;
      const done = user => { root.hidden = true; root.innerHTML = ''; resolve(user); };
      const ordered = users.slice().sort((a, b) => (b.id === lastUser) - (a.id === lastUser) || (b.lastUsed || 0) - (a.lastUsed || 0));
      root.innerHTML = `<div class="login-box">
        <div class="login-brand">⚖️ LexQuest</div>
        <h1>${users.length ? 'Who’s studying?' : 'Create your profile'}</h1>
        ${users.length ? `<div class="profiles">${ordered.map(u => `<button class="profile-tile" data-user="${u.id}">${avatar(u)}<strong>${esc(u.name)}</strong><small class="muted">${u.hasPin ? '🔒 PIN' : 'No PIN'}</small></button>`).join('')}
          <button class="profile-tile add" id="addProfile"><span class="avatar add">＋</span><strong>Add profile</strong><small class="muted">For someone else</small></button></div>` : ''}
        <div id="loginPanel"></div>
        <p class="faint login-note">Profiles are saved on this computer, in the “LexQuest Data” folder. Each profile has its own progress, cards, notes and settings. A PIN keeps others out of your profile inside the app; it does not encrypt the files.</p>
      </div>`;
      $$('[data-user]', root).forEach(b => b.onclick = () => {
        const u = users.find(x => x.id === b.dataset.user);
        $$('.profile-tile', root).forEach(t => t.classList.toggle('active', t === b));
        if (!u.hasPin) return LQ.store.users.login(u.id).then(r => r.ok ? done(r.user) : showError(r.error));
        pinPanel(u);
      });
      const add = $('#addProfile', root);
      if (add) add.onclick = () => { $$('.profile-tile', root).forEach(t => t.classList.toggle('active', t === add)); createPanel(); };
      if (!users.length) createPanel();

      function showError(msg) { const e = $('#loginErr', root); if (e) e.textContent = msg; else LQ.toast(msg); }
      function pinPanel(u) {
        $('#loginPanel', root).innerHTML = `<div class="login-panel"><label class="field"><span>PIN for ${esc(u.name)}</span>
          <input type="password" id="pinIn" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••"></label>
          <div class="row"><button class="btn primary" id="pinGo">Open</button><span class="login-err" id="loginErr"></span></div></div>`;
        const go = async () => { const r = await LQ.store.users.login(u.id, $('#pinIn', root).value); if (r.ok) done(r.user); else { showError(r.error); $('#pinIn', root).select(); } };
        $('#pinGo', root).onclick = go;
        $('#pinIn', root).onkeydown = e => { if (e.key === 'Enter') go(); };
        $('#pinIn', root).focus();
      }
      function createPanel() {
        $('#loginPanel', root).innerHTML = `<div class="login-panel">
          <label class="field"><span>Name</span><input type="text" id="cName" maxlength="40" placeholder="First name"></label>
          <div class="grid g2"><label class="field"><span>PIN (optional, 4–8 digits)</span><input type="password" id="cPin" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
          <label class="field"><span>Repeat PIN</span><input type="password" id="cPin2" inputmode="numeric" maxlength="8" autocomplete="new-password"></label></div>
          <label class="field"><span>Theme</span><select id="cTheme">${LQ.THEMES.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
          <div class="row"><button class="btn primary" id="cGo">Create and start</button><span class="login-err" id="loginErr"></span></div></div>`;
        $('#cName', root).focus();
        $('#cGo', root).onclick = async () => {
          const pin = $('#cPin', root).value;
          if (pin !== $('#cPin2', root).value) return showError('The two PINs don’t match.');
          const r = await LQ.store.users.create($('#cName', root).value, pin);
          if (!r.ok) return showError(r.error);
          done({ ...r.user, isNew: true, theme: $('#cTheme', root).value });
        };
      }
    });
  };

  // Save, sign out and reload into the profile picker.
  LQ.switchProfile = async function switchProfile() {
    await LQ.save(true);
    await LQ.store.users.logout();
    try { sessionStorage.setItem('lq-picker', '1'); } catch { /* preview only */ }
    location.reload();
  };

  /* ---------- profile card in Settings ---------- */
  LQ.profileCard = () => {
    const u = LQ.user || { name: '', hasPin: false };
    return `<div class="card"><h2>👤 Profile</h2>
      <div class="row" style="margin-bottom:12px">${avatar(u, 48)}<div class="grow"><strong>${esc(u.name)}</strong><br><small class="muted">${u.hasPin ? 'Protected by a PIN' : 'No PIN'}</small></div><button class="btn" id="pSwitch">Switch profile</button></div>
      <label class="field"><span>Name (shown on the profile screen and in your greeting)</span><div class="row"><input type="text" id="pName" maxlength="40" value="${esc(u.name)}" style="flex:1"><button class="btn small" id="pNameSave">Save</button></div></label>
      <div class="grid g3">
        ${u.hasPin ? '<label class="field"><span>Current PIN</span><input type="password" id="pOld" inputmode="numeric" maxlength="8" autocomplete="off"></label>' : ''}
        <label class="field"><span>${u.hasPin ? 'New PIN (blank = remove)' : 'New PIN (4–8 digits)'}</span><input type="password" id="pNew" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
        <label class="field"><span>Repeat new PIN</span><input type="password" id="pNew2" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
      </div>
      <div class="row"><button class="btn small" id="pPin">${u.hasPin ? 'Change or remove PIN' : 'Set PIN'}</button><span class="spacer"></span><button class="btn small bad" id="pDelete">Delete this profile</button></div>
      <p class="faint" style="margin-top:8px;font-size:.85em">Deleting moves the profile’s folder to “LexQuest Data/deleted profiles”, so it can still be recovered by hand.</p></div>`;
  };

  LQ.afterProfileCard = function afterProfileCard() {
    const u = LQ.user; if (!u) return;
    $('#pSwitch').onclick = () => LQ.switchProfile();
    $('#pNameSave').onclick = async () => {
      const name = $('#pName').value.trim();
      const r = await LQ.store.users.rename(name);
      if (!r.ok) return LQ.toast(r.error);
      u.name = name; LQ.state.settings.name = name; LQ.save(); LQ.renderChrome(); LQ.toast('Name saved'); LQ.rerender();
    };
    $('#pPin').onclick = async () => {
      const next = $('#pNew').value;
      if (next !== $('#pNew2').value) return LQ.toast('The two new PINs don’t match.');
      if (!u.hasPin && !next) return LQ.toast('Type a PIN of 4–8 digits.');
      const r = await LQ.store.users.setPin(u.hasPin ? $('#pOld').value : '', next);
      if (!r.ok) return LQ.toast(r.error);
      u.hasPin = !!next; LQ.toast(next ? 'PIN saved' : 'PIN removed'); LQ.rerender();
    };
    $('#pDelete').onclick = async () => {
      if (!confirm(`Delete the profile “${u.name}”? Its progress, cards and notes leave the app.`)) return;
      const pin = u.hasPin ? prompt('Enter this profile’s PIN to confirm:') : '';
      if (pin === null) return;
      const r = await LQ.store.users.remove(pin);
      if (!r.ok) return LQ.toast(r.error);
      try { sessionStorage.setItem('lq-picker', '1'); } catch { /* preview only */ }
      location.reload();
    };
  };
})();
