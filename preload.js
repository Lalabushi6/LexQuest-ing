// Exposes a small, explicit API to the page. Nothing else from Node is reachable.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lq', {
  load: () => ipcRenderer.invoke('data:load'),
  save: state => ipcRenderer.invoke('data:save', state),
  info: () => ipcRenderer.invoke('app:info'),
  open: rel => ipcRenderer.invoke('fs:open', rel),
  reveal: rel => ipcRenderer.invoke('fs:reveal', rel),
  exists: rels => ipcRenderer.invoke('fs:exists', rels),
  list: relDir => ipcRenderer.invoke('fs:list', relDir),
  chooseRoot: () => ipcRenderer.invoke('fs:chooseRoot'),
  exportFile: (payload, name, kind) => ipcRenderer.invoke('data:export', payload, name, kind),
  importFile: () => ipcRenderer.invoke('data:import'),
  exportPdf: (html, name) => ipcRenderer.invoke('pdf:export', html, name),
  setSemester: (n, home) => ipcRenderer.invoke('sem:set', n, home),
  contentFiles: () => ipcRenderer.invoke('content:files'),
  openContentFolder: () => ipcRenderer.invoke('content:open'),
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    set: change => ipcRenderer.invoke('update:set', change),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    openPage: () => ipcRenderer.invoke('update:page'),
    onProgress: cb => ipcRenderer.on('update:progress', (_e, p) => cb(p))
  },
  builder: {
    get: () => ipcRenderer.invoke('builder:get'),
    setKey: key => ipcRenderer.invoke('builder:setKey', key),
    root: semester => ipcRenderer.invoke('builder:root', semester),
    pick: opts => ipcRenderer.invoke('builder:pick', opts),
    scan: (relDir, semester) => ipcRenderer.invoke('builder:scan', relDir, semester),
    describe: (files, semester) => ipcRenderer.invoke('builder:describe', files, semester),
    run: job => ipcRenderer.invoke('builder:run', job),
    cancel: id => ipcRenderer.invoke('builder:cancel', id),
    list: () => ipcRenderer.invoke('builder:list'),
    save: course => ipcRenderer.invoke('builder:save', course),
    remove: id => ipcRenderer.invoke('builder:remove', id),
    openFolder: () => ipcRenderer.invoke('builder:openFolder'),
    onProgress: cb => ipcRenderer.on('builder:progress', (_e, p) => cb(p))
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (name, pin) => ipcRenderer.invoke('users:create', name, pin),
    login: (id, pin) => ipcRenderer.invoke('users:login', id, pin),
    logout: () => ipcRenderer.invoke('users:logout'),
    rename: name => ipcRenderer.invoke('users:rename', name),
    setPin: (oldPin, newPin) => ipcRenderer.invoke('users:setPin', oldPin, newPin),
    remove: pin => ipcRenderer.invoke('users:remove', pin)
  }
});
