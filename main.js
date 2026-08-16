const DEBUG = false; // Set to false to disable debug logging
const { app, BrowserWindow, dialog, ipcMain, globalShortcut, screen, session, desktopCapturer, shell, clipboard } = require('electron');
const path = require('path');
const { getWindowDiagnostic } = require('./src/window-diagnostics');
const store = require('./src/store');
const { captureScreenshot } = require('./src/screen');
const { getScreenCaptureError } = require('./src/screen-request');
const { createSTT } = require('./src/stt');
const { createLLM, formatProviderError, getFeatureMaxTokens } = require('./src/llm');
const { MODES, hasRemoteTranscript } = require('./src/prompts');
const { rms16 } = require('./src/wav');
const { takeAudioChunk } = require('./src/audio-buffer');
const { LIVE_AUDIO, retainNewestAudio, shouldFlushLiveAudio } = require('./src/live-audio');
const { clearConversation } = require('./src/conversation');
const { VOICE_REPLY_FLUSH_WAIT_MS, waitForCompletion } = require('./src/fresh-audio');
const { shouldAutomaticallyContinue } = require('./src/continuation');
const { createOutputGuard } = require('./src/output-guard');
const { getCooldownMs, getEarliestRetryMs } = require('./src/provider-cooldown');
const { extractResumeText } = require('./src/resume');
const { boundedText, getSetupStatus, sanitizeAskPayload, sanitizeSettingsPatch, toPcmBuffer } = require('./src/validators');

let win = null;

// -------- capture / transcript state --------
const state = { capturing: false, busy: false, requests: 0, transcribing: { you: false, them: false } };
let sttDisabled = false; // set when the key can't reach any speech model (stops retry spam)
const buffers = { you: [], them: [] };
const bufferBytes = { you: 0, them: 0 };
const lastSpeechAt = { you: 0, them: 0 };
const transcript = []; // { channel, text, ts }
const context = { resumeText: '', resumeName: '', company: '', role: '', responsibilities: '' };
const providerCooldowns = {};

function loadTranscriptHistory() {
  const history = store.getHistory() || [];
  transcript.length = 0;
  history.forEach((item) => transcript.push(item));
}

function persistTranscriptHistory() {
  store.setHistory(transcript.slice(-200));
}
function recordProviderCooldown(provider, error) {
  const cooldownMs = getCooldownMs(error);
  if (cooldownMs) providerCooldowns[provider] = Date.now() + cooldownMs;
}
const FLUSH_MS = LIVE_AUDIO.flushMs;
const MIN_BYTES = LIVE_AUDIO.minTranscriptionBytes;
const RMS_GATE = 240;
const MAX_TRANSCRIPT_TURNS = 80;
const MAX_BUFFER_BYTES = LIVE_AUDIO.maxBufferedBytes;
const MAX_TRANSCRIPTION_BYTES = LIVE_AUDIO.maxTranscriptionBytes;
let flushTimer = null;

function send(channel, data) { if (win && !win.isDestroyed()) win.webContents.send(channel, data); }

// -------- window --------
async function requestInitialPermissions() {
  if (process.platform !== 'darwin') return;
  try {
    const { systemPreferences } = require('electron');
    if (typeof systemPreferences.askForMediaAccess === 'function') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  } catch (error) {
    console.log('[permissions] microphone prompt skipped', error && error.message);
  }
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = 700, H = 600;
  win = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(workArea.x + (workArea.width - W) / 2),
    y: workArea.y + 6,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Invisibility + overlay behavior. Set CUE_NO_PROTECT=1 to disable for debugging.
  win.setContentProtection(!process.env.CUE_NO_PROTECT);            // excluded from screen capture (best-effort)
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (typeof win.setHiddenInMissionControl === 'function') win.setHiddenInMissionControl(true);
  } else {
    win.setAlwaysOnTop(true);
  }

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const reportWindowState = (type) => {
    const diagnostic = getWindowDiagnostic(type, win);
    if (diagnostic) send('window:state', diagnostic);
  };
  ['focus', 'blur', 'show', 'hide'].forEach((type) => win.on(type, () => reportWindowState(type)));

  win.webContents.on('did-finish-load', () => {
    win.showInactive();
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      if (typeof win.setHiddenInMissionControl === 'function') win.setHiddenInMissionControl(true);
    }
    reportWindowState('ready');
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[laka-ai] renderer gone', JSON.stringify(d)));
}

// -------- STT flushing --------
async function flushChannel(channel, { force = false } = {}) {
  if (state.transcribing[channel]) return;
  const chunks = buffers[channel];
  if (!chunks.length) return;
  if (!shouldFlushLiveAudio({ bytes: bufferBytes[channel], lastSpeechAt: lastSpeechAt[channel], force })) return;
  const { pcm, remaining } = takeAudioChunk(chunks, MAX_TRANSCRIPTION_BYTES);
  buffers[channel] = remaining;
  bufferBytes[channel] = Math.max(0, bufferBytes[channel] - pcm.length);
  if (pcm.length < MIN_BYTES) return;
  if (rms16(pcm) < RMS_GATE) return; // silence gate

  state.transcribing[channel] = true;
  const transcriptionStartedAt = Date.now();
  try {
    const settings = store.getSettings();
    settings.localSpeechRuntimeDir = path.join(app.getPath('userData'), 'faster-whisper-python');
    settings.onLocalStatus = (message) => send('status', { message });
    const stt = createSTT(settings);
    if (!stt.available) {
      if (!sttDisabled) { sttDisabled = true; send('status', { message: 'No transcription key set. Add a Gemini or OpenAI key in Settings to enable listening. Screen-based features work without it.' }); }
      return;
    }
    const res = await stt.transcribe(pcm);
    if (res.error) {
      send('transcription:update', { channel, provider: res.error.provider || 'unknown', durationMs: Math.round(pcm.length / 32), latencyMs: Date.now() - transcriptionStartedAt, outcome: 'error' });
      handleSttError(res.error);
      return;
    }
    send('transcription:update', { channel, provider: res.provider || 'unknown', durationMs: Math.round(pcm.length / 32), latencyMs: Date.now() - transcriptionStartedAt, outcome: res.text && res.text.trim() ? 'transcribed' : 'empty' });
    if (res.text && res.text.trim()) {
      const turn = { channel, text: res.text.trim(), ts: Date.now() };
      transcript.push(turn);
      while (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.shift();
      persistTranscriptHistory();
      if (DEBUG) console.log(`[TRANSCRIPT] ${channel === 'you' ? 'You' : 'Them'}:`, turn.text);
      send('transcript', turn);
    }
  } catch (e) {
    console.log('[stt] error', e && e.message);
  } finally {
    state.transcribing[channel] = false;
  }
}

function handleSttError(err) {
  console.log('[stt] error', err.provider, err.status, err.code, err.message);
  if (sttDisabled) return;
  const noAccess = err.status === 403 || err.status === 401 || err.code === 'model_not_found';
  const quotaIssue = err.status === 429 || err.status === 503 || /quota|rate limit|exceeded|overload|unavailable|retry/i.test(err.message || '');
  sttDisabled = true; // stop hammering the API every few seconds
  if (err.provider === 'faster-whisper') {
    send('status', { message: 'Faster-Whisper could not finish automatic setup. Check your internet connection, then start listening again.' });
  } else if (noAccess) {
    send('status', { message: 'Transcription is off for ' + err.provider + ' because the key does not have speech access. Add a Gemini or OpenAI key in Settings and reopen to enable listening.' });
  } else if (quotaIssue) {
    send('status', { message: 'Cloud speech is temporarily unavailable for ' + err.provider + '. Faster-Whisper will be used automatically if enabled.' });
  } else {
    send('status', { message: 'Transcription error (' + err.provider + '): ' + err.message });
  }
}

function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => { flushChannel('you'); flushChannel('them'); }, FLUSH_MS);
}
function stopFlushLoop() { if (flushTimer) { clearInterval(flushTimer); flushTimer = null; } }

async function flushPendingAudio() {
  const pending = ['you', 'them'].filter((channel) => bufferBytes[channel] >= MIN_BYTES && !state.transcribing[channel]);
  if (!pending.length) return true;
  send('status', { message: 'Transcribing the latest audio…' });
  return waitForCompletion(Promise.all(pending.map((channel) => flushChannel(channel, { force: true }))), VOICE_REPLY_FLUSH_WAIT_MS);
}

// -------- capture toggle --------
// Mic + system audio are both captured in the RENDERER (getUserMedia for the mic,
// getDisplayMedia loopback for system audio) so they run inside Laka AI's own process
// and use Laka AI's own Screen-Recording grant — no separate helper binary to authorize.
function setCapturing(active) {
  state.capturing = active;
  if (active) {
    startFlushLoop();
  } else {
    stopFlushLoop();
    buffers.you = []; buffers.them = []; bufferBytes.you = 0; bufferBytes.them = 0; lastSpeechAt.you = 0; lastSpeechAt.them = 0;
  }
  send('capture:state', { active });
  return active;
}

// -------- feature runner --------
async function runFeature(mode, userText) {
  const startedAt = Date.now();
  if (DEBUG) console.log('[DEBUG MAIN] runFeature called:', { mode, userText, isBusy: state.busy });
  if (state.busy) return;
  const def = MODES[mode];
  if (!def) {
    if (DEBUG) console.log('[DEBUG MAIN] mode not found:', mode);
    return;
  }
  state.busy = true;
  try {
    if (mode === 'ask' && userText && userText.trim()) {
      transcript.push({ channel: 'you', text: userText.trim(), ts: Date.now() });
      while (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.shift();
      persistTranscriptHistory();
    }
    const settings = store.getSettings();
    const llm = createLLM(settings);
    const userBubble = def.userBubble !== null ? def.userBubble : (mode === 'ask' ? userText : null);
    if (DEBUG) console.log('[DEBUG MAIN] LLM settings loaded:', { provider: settings.provider, smart: settings.smart });
    send('llm:start', { userBubble, small: !!def.small });

    const setup = getSetupStatus(settings);
    if (!llm.ready) {
      if (DEBUG) console.log('[DEBUG MAIN] LLM not ready (missing key or model).');
      const fallback = llm.error || (setup.message || ('Add your ' + settings.provider + ' API key in Settings (gear icon) to start. Model: ' + (llm.model || 'unset') + '.'));
      send('llm:error', { message: fallback });
      send('status', { message: setup.message ? setup.message + ' Open Settings with the gear icon to fix it.' : fallback });
      return;
    }
    if (def.needsScreen && !llm.supportsImages) {
      const message = 'Screen Assist needs a vision-capable provider. Select Gemini, OpenAI, Anthropic, or Nvidia with a configured key.';
      send('llm:error', { message });
      send('status', { message });
      return;
    }

    if (mode === 'say') {
      await flushPendingAudio();
      if (!hasRemoteTranscript(transcript)) {
        const message = 'No other-speaker audio has been transcribed yet. Keep listening, then press What should I say? again.';
        send('llm:error', { message });
        send('status', { message });
        return;
      }
    }

    let imageDataUrl = null;
    let screenshotMs = 0;
    if (def.needsScreen && llm.supportsImages) {
      if (DEBUG) console.log('[DEBUG MAIN] Feature needs screen. Capturing screenshot...');
      try { 
        const screenshotStartedAt = Date.now();
        imageDataUrl = await captureScreenshot(settings.smart ? 1600 : 1440);
        screenshotMs = Date.now() - screenshotStartedAt;
        if (DEBUG) console.log('[DEBUG MAIN] Screenshot captured successfully (length:', imageDataUrl.length, ')');
      }
      catch (e) { 
        if (DEBUG) console.error('[DEBUG MAIN] Screenshot capture failed:', e);
        send('status', { message: 'Screen capture needs permission — grant Screen Recording to Laka AI in System Settings.' });
      }
    }

    const screenCaptureError = getScreenCaptureError(def.needsScreen, imageDataUrl);
    if (screenCaptureError) {
      send('llm:error', { message: screenCaptureError });
      send('status', { message: screenCaptureError });
      return;
    }

    const requiresImages = Boolean(def.needsScreen);
    const availableCandidates = llm.getCandidates({ requiresImages, blockedProviders: providerCooldowns });
    if (!availableCandidates.length) {
      const retryMs = getEarliestRetryMs(providerCooldowns);
      const message = retryMs ? `All configured providers are temporarily rate-limited. Retry in ${Math.ceil(retryMs / 1000)} seconds or add Groq/OpenRouter in Settings.` : 'No configured provider can handle this request.';
      send('llm:error', { message });
      send('status', { message });
      return;
    }

    const built = def.build({ transcript, userText: userText || '', ...context });
    if (DEBUG) console.log('[DEBUG MAIN] Built prompt. Starting LLM stream...');
    let firstTokenAt = 0;
    const initialOutput = createOutputGuard((t) => {
      if (!firstTokenAt) firstTokenAt = Date.now();
      send('llm:token', { text: t });
    });
    const first = await llm.stream({
      system: def.system,
      turns: [{ role: 'user', text: built }],
      imageDataUrl,
      requiresImages,
      blockedProviders: providerCooldowns,
      onProviderError: recordProviderCooldown,
      maxTokens: getFeatureMaxTokens(settings, { mode, small: !!def.small }),
      onToken: (t) => initialOutput.push(t)
    });
    initialOutput.finish();
    let fullText = initialOutput.text;
    let completion = first.finishReason;
    let attempts = first.attempts;
    let continuationCount = 0;
    let continuationFailed = false;
    let needsRepair = initialOutput.blocked;
    while ((needsRepair || shouldAutomaticallyContinue(completion, continuationCount)) && continuationCount < 2) {
      send('status', { message: 'Completing the answer…' });
      try {
        const continuationOutput = createOutputGuard((t) => {
          if (!firstTokenAt) firstTokenAt = Date.now();
          send('llm:token', { text: t });
        });
        const continued = await llm.stream({
          system: def.system,
          turns: [{ role: 'user', text: `${built}\n\nContinue only the final answer after the exact last visible character below. Do not repeat, restart, describe your reasoning, mention continuation, or write self-talk.\n\nAnswer so far:\n${fullText}` }],
          maxTokens: getFeatureMaxTokens(settings, { mode, small: !!def.small }),
          requiresImages,
          blockedProviders: providerCooldowns,
          onProviderError: recordProviderCooldown,
          onToken: (t) => continuationOutput.push(t)
        });
        continuationOutput.finish();
        fullText += continuationOutput.text;
        completion = continued.finishReason;
        attempts += continued.attempts;
        needsRepair = continuationOutput.blocked;
        continuationCount += 1;
      } catch (error) {
        continuationFailed = true;
        send('status', { message: 'The provider could not finish the final section. The completed answer is shown.' });
        break;
      }
    }
    if (!continuationFailed && (needsRepair || shouldAutomaticallyContinue(completion, continuationCount))) {
      send('status', { message: 'The provider reached its output limit. Ask a shorter, more focused follow-up if a final section is missing.' });
    }
    if (fullText && fullText.trim()) {
      transcript.push({ channel: 'assistant', text: fullText.trim(), ts: Date.now() });
      while (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.shift();
      persistTranscriptHistory();
    }
    state.requests += 1;
    send('usage:update', {
      requests: state.requests,
      freeTierOnly: settings.freeTierOnly,
      latency: { firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null, totalMs: Date.now() - startedAt, screenshotMs, promptChars: built.length, outputChars: fullText.length, completion, provider: first.provider, model: first.model, attempts }
    });
    if (DEBUG) console.log('[DEBUG MAIN] Full LLM Output:\n', fullText);
    send('llm:done', {});
  } catch (e) {
    send('llm:error', { message: formatProviderError(e) });
  } finally {
    state.busy = false;
  }
}

// -------- IPC --------
function isTrustedRenderer(event) {
  return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
}

function queuePcm(channel, arrayBuffer) {
  const pcm = toPcmBuffer(arrayBuffer);
  if (!pcm) return;
  if (rms16(pcm) >= RMS_GATE) lastSpeechAt[channel] = Date.now();
  const queued = retainNewestAudio([...buffers[channel], pcm], MAX_BUFFER_BYTES);
  buffers[channel] = queued.chunks;
  bufferBytes[channel] = queued.bytes;
}

ipcMain.handle('settings:get', (event) => isTrustedRenderer(event) ? store.getPublicSettings() : null);
ipcMain.handle('settings:set', (event, patch) => {
  if (!isTrustedRenderer(event)) return null;
  sttDisabled = false;
  return store.setSettings(sanitizeSettingsPatch(patch));
});
ipcMain.handle('capture:toggle', (event) => isTrustedRenderer(event) ? setCapturing(!state.capturing) : false);
ipcMain.handle('capture:state', (event) => isTrustedRenderer(event) ? { active: state.capturing } : { active: false });
ipcMain.handle('app:quit', (event) => {
  if (!isTrustedRenderer(event)) return false;
  setCapturing(false);
  app.quit();
  return true;
});
ipcMain.handle('history:clear', (event) => {
  if (!isTrustedRenderer(event)) return false;
  clearConversation({ transcript, buffers, bufferBytes });
  persistTranscriptHistory();
  return true;
});
ipcMain.handle('conversation:end', (event) => {
  if (!isTrustedRenderer(event)) return false;
  setCapturing(false);
  clearConversation({ transcript, buffers, bufferBytes });
  persistTranscriptHistory();
  return true;
});
ipcMain.handle('usage:get', (event) => isTrustedRenderer(event) ? { requests: state.requests, freeTierOnly: store.getSettings().freeTierOnly } : null);
ipcMain.handle('clipboard:read', (event) => isTrustedRenderer(event) ? clipboard.readText() : '');
ipcMain.handle('clipboard:write', (event, text) => {
  if (!isTrustedRenderer(event)) return false;
  clipboard.writeText(String(text || ''));
  return true;
});
ipcMain.handle('profile:get', (event) => isTrustedRenderer(event) ? store.getPublicProfile() : null);
ipcMain.handle('profile:set', (event, profile, enabled) => {
  if (!isTrustedRenderer(event)) return null;
  try {
    const saved = store.setProfile({ ...context, ...profile }, enabled);
    if (saved.enabled) Object.assign(context, store.getProfile());
    return saved;
  } catch (error) {
    return { error: error && error.message ? error.message : 'Unable to save profile.' };
  }
});
ipcMain.handle('profile:clear', (event) => {
  if (!isTrustedRenderer(event)) return null;
  const cleared = store.clearProfile();
  Object.assign(context, { resumeText: '', resumeName: '', company: '', role: '', responsibilities: '' });
  return cleared;
});
ipcMain.handle('context:set', (event, patch) => {
  if (!isTrustedRenderer(event) || !patch || typeof patch !== 'object') return null;
  context.company = boundedText(patch.company, 500);
  context.role = boundedText(patch.role, 500);
  context.responsibilities = boundedText(patch.responsibilities, 4000);
  return { resumeName: context.resumeName, company: context.company, role: context.role, responsibilities: context.responsibilities };
});
ipcMain.handle('resume:import', async (event) => {
  if (!isTrustedRenderer(event)) return null;
  const picked = await dialog.showOpenDialog(win, {
    title: 'Choose your resume',
    properties: ['openFile'],
    filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'txt', 'md'] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  try {
    context.resumeText = await extractResumeText(picked.filePaths[0]);
    context.resumeName = path.basename(picked.filePaths[0]);
    if (store.getPublicProfile().enabled) store.setProfile(context, true);
    return { resumeName: context.resumeName, characters: context.resumeText.length };
  } catch (error) {
    return { error: error && error.message ? error.message : 'Unable to read that resume.' };
  }
});
ipcMain.on('ask', (event, payload) => {
  if (!isTrustedRenderer(event)) return;
  const safe = sanitizeAskPayload(payload);
  if (safe) runFeature(safe.mode, safe.text);
});
ipcMain.on('mic:pcm', (event, arrayBuffer) => { if (isTrustedRenderer(event) && state.capturing) queuePcm('you', arrayBuffer); });
ipcMain.on('system:pcm', (event, arrayBuffer) => { if (isTrustedRenderer(event) && state.capturing) queuePcm('them', arrayBuffer); });
ipcMain.on('transcript:add', (event, text) => {
  if (!isTrustedRenderer(event) || typeof text !== 'string') return;
  const trimmed = text.trim();
  if (!trimmed) return;
  transcript.push({ channel: 'you', text: trimmed, ts: Date.now() });
  while (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.shift();
  persistTranscriptHistory();
  send('transcript', { channel: 'you', text: trimmed, ts: Date.now() });
});
ipcMain.on('mouse:ignore', (event, value) => { if (isTrustedRenderer(event) && typeof value === 'boolean' && win) win.setIgnoreMouseEvents(value, { forward: true }); });
ipcMain.on('open-pane', (event, url) => {
  const allowed = new Set(['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture', 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone']);
  if (isTrustedRenderer(event) && allowed.has(url)) shell.openExternal(url).catch(() => {});
});
ipcMain.handle('permissions:request', async (event) => {
  if (!isTrustedRenderer(event)) return false;
  try {
    await requestInitialPermissions();
    return true;
  } catch (error) {
    console.log('[permissions] request failed', error && error.message);
    return false;
  }
});
ipcMain.on('log', (event, msg) => {
  if (!isTrustedRenderer(event) || typeof msg !== 'string') return;
  console.log('[renderer]', msg.slice(0, 2000).replace(/AIza[\w-]+/g, '[redacted]'));
});

// -------- shortcuts --------
function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Return', () => runFeature('assist', ''));
  globalShortcut.register('CommandOrControl+H', () => runFeature('leetcode', ''));
  globalShortcut.register('CommandOrControl+Shift+X', () => app.quit());
}

// -------- lifecycle --------
app.whenReady().then(async () => {
  loadTranscriptHistory();
  const savedProfile = store.getProfile();
  await requestInitialPermissions();
  if (savedProfile.enabled) Object.assign(context, savedProfile);
  if (app.dock) app.dock.hide();

  const allowMedia = (webContents, permission) => webContents === win?.webContents && ['media', 'microphone', 'audioCapture', 'display-capture'].includes(permission);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, cb) => cb(allowMedia(webContents, permission)));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => allowMedia(webContents, permission));

  // System-audio loopback for getDisplayMedia: hand back a screen source with 'loopback'
  // audio so the renderer can capture what's playing (Zoom/Meet) using cue's own grant.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (request.webContents !== win?.webContents) return callback();
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const response = {};
      if (sources.length && request.video) response.video = sources[0];
      if (request.audio) response.audio = 'loopback';
      callback(Object.keys(response).length ? response : undefined);
    }).catch(() => callback());
  }, { useSystemPicker: false });

  createWindow();
  registerShortcuts();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
