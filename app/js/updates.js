// The Updates card in Settings, the quiet check when the app opens, and the sidebar notice.
'use strict';
(function () {
  const { $, esc } = LQ.h;
  const api = () => window.lq && window.lq.update;
  LQ.updateInfo = null; // the newer release, once a check has found one
  let progressWired = false;

  LQ.updatesCard = function updatesCard() {
    return `<div class="card" style="margin-top:14px"><h2>🔄 Updates</h2>
      ${api() ? `<p>Installed version: <strong id="upCurrent">…</strong></p>
        <label class="field"><span>GitHub repository to update from (owner/repository)</span>
          <div class="row"><input type="text" id="upRepo" placeholder="yourname/lexquest" style="flex:1" spellcheck="false"><button class="btn small" id="upRepoSave">Save</button></div></label>
        <label class="field"><span>Access token, only needed if the repository is private. It’s stored encrypted on this computer.</span>
          <div class="row"><input type="password" id="upToken" autocomplete="off" style="flex:1" placeholder="Paste a read-only token"><button class="btn small" id="upTokenSave">Save</button><button class="btn small" id="upTokenClear" hidden>Remove</button></div></label>
        <label class="row" style="margin-bottom:12px"><input type="checkbox" id="upAuto"> Check automatically when the app opens</label>
        <div class="row"><button class="btn primary" id="upCheck">Check for updates</button><span class="muted" id="upMsg"></span></div>
        <div id="upResult"></div>` : '<p class="muted">Updates work in the desktop app.</p>'}
    </div>`;
  };

  function showRelease(r) {
    const box = $('#upResult');
    if (!box) return;
    box.innerHTML = `<div class="callout tip" style="margin-top:12px"><strong>Version ${esc(r.latest)} is available</strong> (${r.sizeMB} MB).
        ${r.notes ? `<div class="prose" style="margin-top:6px">${LQ.md(r.notes)}</div>` : ''}
        <div class="row" style="margin-top:10px">${r.canInstall
          ? '<button class="btn primary" id="upInstall">Download and install</button>'
          : '<button class="btn" id="upPage">Open the release page</button><span class="muted">Automatic install works in the packaged app.</span>'}</div>
        <div class="progress" id="upBar" style="margin-top:10px" hidden><i style="width:0%"></i></div>
        <p class="muted" style="margin:8px 0 0">The app will close, replace itself and reopen. Your progress is kept.</p></div>`;
    const page = $('#upPage'); if (page) page.onclick = () => api().openPage();
    const inst = $('#upInstall');
    if (inst) inst.onclick = async () => {
      inst.disabled = true; inst.textContent = 'Downloading…'; $('#upBar').hidden = false;
      const dl = await api().download();
      if (!dl.ok) { inst.disabled = false; inst.textContent = 'Try again'; $('#upBar').hidden = true; return LQ.toast(dl.error); }
      inst.textContent = 'Restarting…';
      await LQ.save(true);
      const go = await api().install();
      if (!go.ok) { inst.disabled = false; inst.textContent = 'Try again'; LQ.toast(go.error); }
    };
  }

  LQ.afterUpdatesCard = async function afterUpdatesCard() {
    if (!api()) return;
    const s = await api().get();
    $('#upCurrent').textContent = 'v' + s.current;
    $('#upRepo').value = s.repo;
    $('#upAuto').checked = s.auto;
    $('#upTokenClear').hidden = !s.hasToken;
    if (s.hasToken) $('#upToken').placeholder = 'Token saved. Paste a new one to replace it.';
    const msg = t => { $('#upMsg').textContent = t; };
    $('#upRepoSave').onclick = async () => {
      const r = await api().set({ repo: $('#upRepo').value });
      if (!r.ok) return LQ.toast(r.error);
      LQ.toast('Repository saved'); LQ.afterUpdatesCard();
    };
    $('#upTokenSave').onclick = async () => {
      const value = $('#upToken').value.trim();
      if (!value) return LQ.toast('Paste a token first.');
      const r = await api().set({ token: value });
      if (!r.ok) return LQ.toast(r.error);
      $('#upToken').value = ''; LQ.toast('Token saved'); LQ.afterUpdatesCard();
    };
    $('#upTokenClear').onclick = async () => { await api().set({ token: '' }); LQ.toast('Token removed'); LQ.afterUpdatesCard(); };
    $('#upAuto').onchange = e => api().set({ auto: e.target.checked });
    $('#upCheck').onclick = async () => {
      const b = $('#upCheck'); b.disabled = true; msg('Checking…'); $('#upResult').innerHTML = '';
      const r = await api().check();
      b.disabled = false;
      if (!r.ok) { LQ.updateInfo = null; LQ.renderChrome(); return msg(r.error); }
      LQ.updateInfo = r.available ? r : null;
      LQ.renderChrome();
      if (r.available) { msg(''); showRelease(r); } else msg(`You’re up to date (v${r.current}).`);
    };
    if (LQ.updateInfo) showRelease(LQ.updateInfo);
    if (!progressWired) {
      progressWired = true;
      api().onProgress(p => {
        const bar = $('#upBar i');
        if (bar) bar.style.width = `${Math.round(p.received / p.total * 100)}%`;
      });
    }
  };

  // Quiet: a failed check says nothing, and it runs at most twice a day.
  LQ.autoCheckForUpdate = async function autoCheckForUpdate() {
    if (!api()) return;
    const s = await api().get();
    if (!s.autoCheckDue) return;
    const r = await api().check();
    if (r.ok && r.available) { LQ.updateInfo = r; LQ.renderChrome(); LQ.toast(`LexQuest ${r.latest} is available. Open Settings to install it.`); }
  };
})();
