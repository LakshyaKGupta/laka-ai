const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('cue', {
  setZoomLevel: (level) => webFrame.setZoomLevel(level),
  getZoomLevel: () => webFrame.getZoomLevel(),
  platform: process.platform,
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  ask: (payload) => ipcRenderer.send('ask', payload),
  captureToggle: () => ipcRenderer.invoke('capture:toggle'),
  captureState: () => ipcRenderer.invoke('capture:state'),
  quit: () => ipcRenderer.invoke('app:quit'),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  conversationEnd: () => ipcRenderer.invoke('conversation:end'),
  usageGet: () => ipcRenderer.invoke('usage:get'),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),
  transcriptAdd: (text) => ipcRenderer.send('transcript:add', text),
  profileGet: () => ipcRenderer.invoke('profile:get'),
  profileSet: (profile, enabled) => ipcRenderer.invoke('profile:set', profile, enabled),
  profileClear: () => ipcRenderer.invoke('profile:clear'),
  contextSet: (patch) => ipcRenderer.invoke('context:set', patch),
  resumeImport: () => ipcRenderer.invoke('resume:import'),
  micPcm: (arrayBuffer) => ipcRenderer.send('mic:pcm', arrayBuffer),
  systemPcm: (arrayBuffer) => ipcRenderer.send('system:pcm', arrayBuffer),
  setIgnoreMouse: (v) => ipcRenderer.send('mouse:ignore', v),
  openPane: (url) => ipcRenderer.send('open-pane', url),
  requestPermissions: () => ipcRenderer.invoke('permissions:request'),
  log: (msg) => ipcRenderer.send('log', msg),
  on: (channel, cb) => {
    const allowed = ['capture:state', 'llm:start', 'llm:token', 'llm:done', 'llm:error', 'status', 'transcript', 'transcription:update', 'usage:update', 'window:state'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});
