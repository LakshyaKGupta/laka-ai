/* cue renderer — UI state, mic capture, IPC, streaming render. */
(function () {
  const { icon } = window.ICONS;
  const cue = window.cue; // exposed by preload
  const $ = (s) => document.querySelector(s);
  const cmdKey = cue.platform === 'darwin' ? '⌘' : 'Ctrl';
  const isCmdOrCtrl = (e) => cue.platform === 'darwin' ? e.metaKey : e.ctrlKey;

  // ---- paint icons -------------------------------------------------------
  $('#logo-btn').innerHTML = icon('logo', { size: 18 });
  $('.tb-hide .chev').innerHTML = icon('chevron-down', { size: 14 });
  $('#stop-btn').innerHTML = icon('stop-square', { size: 15 });
  document.querySelector('.act[data-mode="assist"] .ic').innerHTML = icon('sparkles', { size: 16 });
  document.querySelector('.act[data-mode="say"] .ic').innerHTML = icon('wand-sparkles', { size: 16 });
  document.querySelector('.act[data-mode="followup"] .ic').innerHTML = icon('message-circle', { size: 16 });
  document.querySelector('.act[data-mode="recap"] .ic').innerHTML = icon('refresh-cw', { size: 16 });
  $('#end-conversation').innerHTML = icon('stop-square', { size: 14 });
  $('#smart-toggle .ic').innerHTML = icon('zap', { size: 14 });
  $('#more-btn').innerHTML = icon('more-horizontal', { size: 18 });
  $('#mic-toggle').innerHTML = icon('mic', { size: 16 });
  $('#send-btn').innerHTML = icon('play', { size: 15 });

  // ---- state -------------------------------------------------------------
  let settings = null;
  let busy = false;
  let aiEl = null;       // current streaming <div class="ai-text">
  let apiKeyInputs = { openai: '', anthropic: '', gemini: '', groq: '', omniroute: '', openrouter: '', nvidia: '' };
  let caretEl = null;
  let usage = { requests: 0, freeTierOnly: true };
  const diagnostics = [];
  let resumeName = '';
  let lastAiText = '';
  let profile = { enabled: false, displayName: '', company: '', role: '', responsibilities: '', resumeName: '', hasResume: false };

  const messages = $('#messages');

  function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // minimal, safe markdown: fenced code, bullets, inline code, bold, paragraphs
  function renderMarkdown(text) {
    const lines = text.split('\n');
    let html = '', inCode = false, inList = false, buf = [];
    const flushP = () => { if (buf.length) { html += '<p>' + inline(buf.join(' ')) + '</p>'; buf = []; } };
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    for (const raw of lines) {
      const line = raw;
      if (/^```/.test(line.trim())) {
        if (!inCode) { flushP(); if (inList) { html += '</ul>'; inList = false; } html += '<pre><code>'; inCode = true; }
        else { html += '</code></pre>'; inCode = false; }
        continue;
      }
      if (inCode) { html += esc(line) + '\n'; continue; }
      if (/^\s*[-*]\s+/.test(line)) { flushP(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>'; continue; }
      if (line.trim() === '') { flushP(); if (inList) { html += '</ul>'; inList = false; } continue; }
      buf.push(line.trim());
    }
    flushP(); if (inList) html += '</ul>'; if (inCode) html += '</code></pre>';
    return html;
  }

  function clearMessages() { messages.innerHTML = ''; aiEl = null; caretEl = null; lastAiText = ''; }
  function scrollMessagesToBottom() { messages.scrollTop = messages.scrollHeight; }

  function addUserBubble(text) {
    const b = document.createElement('div');
    b.className = 'user-bubble';
    b.textContent = text;
    messages.appendChild(b);
    scrollMessagesToBottom();
  }

  function startAi(small) {
    aiEl = document.createElement('div');
    aiEl.className = 'ai-text' + (small ? ' small' : '');
    aiEl.dataset.raw = '';
    caretEl = document.createElement('span');
    caretEl.className = 'ai-caret';
    aiEl.appendChild(caretEl);
    messages.appendChild(aiEl);
    scrollMessagesToBottom();
  }

  function appendToken(t) {
    if (!aiEl) startAi(false);
    aiEl.dataset.raw += t;
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = t;
    aiEl.insertBefore(span, caretEl);
    scrollMessagesToBottom();
  }

  function finalizeAi() {
    if (!aiEl) return;
    const raw = aiEl.dataset.raw || '';
    const structured = raw.replace(/\n{3,}/g, '\n\n').trim();
    lastAiText = structured;
    aiEl.innerHTML = renderMarkdown(structured);
    aiEl = null; caretEl = null;
    scrollMessagesToBottom();
  }

  function setBusy(v) { busy = v; $('#send-btn').classList.toggle('busy', v); }
  function recordDiagnostic(message) {
    diagnostics.unshift(`${new Date().toLocaleTimeString()} · ${message}`);
    diagnostics.splice(15);
    const target = $('#diagnostics');
    if (target) target.textContent = diagnostics.join('\n') || 'No diagnostics yet.';
  }

  // ---- actions -----------------------------------------------------------
  function runMode(mode, text) {
    if (busy) return;
    setBusy(true);
    cue.ask({ mode, text: text || '' });
  }

  document.querySelectorAll('.act').forEach((btn) => {
    btn.addEventListener('click', () => runMode(btn.dataset.mode, ''));
  });

  const input = $('#input');
  const placeholder = $('#placeholder');
  const composer = $('#composer');

  function syncPlaceholder() {
    placeholder.classList.toggle('hidden', input.value.length > 0 || document.activeElement === input);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }
  input.addEventListener('input', syncPlaceholder);
  input.addEventListener('focus', () => { composer.classList.add('focused'); placeholder.classList.add('hidden'); });
  input.addEventListener('blur', () => { composer.classList.remove('focused'); syncPlaceholder(); });
  $('#input-area').addEventListener('click', () => input.focus());

  function send() {
    const text = input.value.trim();
    if (!text) { runMode('assist', ''); return; }
    input.value = ''; syncPlaceholder();
    runMode('ask', text);
  }
  $('#send-btn').addEventListener('click', send);
  $('#paste-btn').addEventListener('click', async () => {
    const fromClipboard = await cue.clipboardRead();
    if (fromClipboard) {
      input.value = (input.value ? input.value + '\n' : '') + fromClipboard;
      syncPlaceholder();
      input.focus();
    }
  });
  $('#copy-btn').addEventListener('click', async () => {
    const ok = await cue.clipboardWrite(lastAiText || input.value);
    showStatus(ok ? 'Copied to clipboard.' : 'Unable to copy to clipboard.');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isCmdOrCtrl(e)) { e.preventDefault(); send(); }
    if (e.key === 'Enter' && isCmdOrCtrl(e)) { e.preventDefault(); runMode('assist', ''); }
  });

  // Smart toggle
  const smartBtn = $('#smart-toggle');
  smartBtn.addEventListener('click', async () => {
    settings.smart = !settings.smart;
    smartBtn.classList.toggle('on', settings.smart);
    settings = await cue.settingsSet({ smart: settings.smart });
  });

  // Hide / collapse
  $('#hide-btn').addEventListener('click', () => {
    const collapsed = $('#panel').classList.toggle('collapsed');
    $('#hide-btn').classList.toggle('collapsed', collapsed);
    $('#live-dot').style.display = collapsed ? 'none' : '';
  });

  // Stop = start/stop listening. Kick off the capture flow directly from the click so
  // the user gesture is fresh and mic access starts immediately.
  function toggleListening() {
    const active = $('#stop-btn').classList.contains('active');
    if (!active) {
      showStatus('Listening started. Only use this where consent is allowed.');
      cue.captureToggle();
      requestAnimationFrame(() => {
        if (!micStream) startMic().catch(() => {});
      });
    } else {
      showStatus('Listening stopped.');
      cue.captureToggle();
    }
  }
  $('#stop-btn').addEventListener('click', toggleListening);
  $('#mic-toggle').addEventListener('click', toggleListening);

  // ---- capture: mic (renderer side) --------------------------------------
  let audioCtx = null, micStream = null, micNode = null, micProc = null;

  async function startMic() {
    if (micStream) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 16000
        }
      });
      audioCtx = new AudioContext({ sampleRate: 16000 });
      await audioCtx.audioWorklet.addModule('./pcm-processor.js');
      micNode = audioCtx.createMediaStreamSource(micStream);
      micProc = new AudioWorkletNode(audioCtx, 'pcm-processor');
      micProc.port.onmessage = (e) => cue.micPcm(e.data);
      const sink = audioCtx.createGain(); sink.gain.value = 0; // run processor silently
      micNode.connect(micProc); micProc.connect(sink); sink.connect(audioCtx.destination);
      recordDiagnostic('Microphone input started');
    } catch (err) {
      cue.log('mic error: ' + (err && err.message));
    }
  }
  function stopMic() {
    if (micProc) { micProc.port.onmessage = null; micProc.disconnect(); micProc = null; }
    if (micNode) { micNode.disconnect(); micNode = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  }

  // ---- capture: system/meeting audio (getDisplayMedia loopback, in cue's process) ----
  let sysStream = null, sysCtx = null, sysNode = null, sysProc = null;
  async function startSystemAudio() {
    if (sysStream) return;
    try {
      if (cue.platform === 'darwin') {
        const deviceId = settings.meetingAudioDeviceId;
        if (!deviceId) {
          showStatus('To transcribe other speakers on macOS, choose your BlackHole or Loopback input in Settings, then start listening again.');
          return;
        }
        sysStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        sysCtx = new AudioContext({ sampleRate: 16000 });
        await sysCtx.audioWorklet.addModule('./pcm-processor.js');
        sysNode = sysCtx.createMediaStreamSource(sysStream);
        sysProc = new AudioWorkletNode(sysCtx, 'pcm-processor');
        sysProc.port.onmessage = (e) => cue.systemPcm(e.data);
        const sink = sysCtx.createGain(); sink.gain.value = 0;
        sysNode.connect(sysProc); sysProc.connect(sink); sink.connect(sysCtx.destination);
        const selectedInput = $('#meeting-audio-device').selectedOptions[0];
        recordDiagnostic(`Meeting audio input started: ${selectedInput ? selectedInput.textContent : 'selected device'}`);
        showStatus('Meeting audio input is active. Make sure Meet output is routed to your virtual device and headphones.');
        return;
      }
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
      } catch (audioErr) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }
      stream.getVideoTracks().forEach((t) => t.stop()); // we only want the audio
      const tracks = stream.getAudioTracks();
      if (!tracks.length) { cue.log('system audio: no loopback track (macOS loopback unsupported here)'); stream.getTracks().forEach((t) => t.stop()); return; }
      sysStream = stream;
      sysCtx = new AudioContext({ sampleRate: 16000 });
      await sysCtx.audioWorklet.addModule('./pcm-processor.js');
      sysNode = sysCtx.createMediaStreamSource(new MediaStream(tracks));
      sysProc = new AudioWorkletNode(sysCtx, 'pcm-processor');
      sysProc.port.onmessage = (e) => cue.systemPcm(e.data);
      const sink = sysCtx.createGain(); sink.gain.value = 0;
      sysNode.connect(sysProc); sysProc.connect(sink); sink.connect(sysCtx.destination);
      showStatus('Speaker audio capture is active where the OS allows it.');
      cue.log('system audio: capturing loopback');
    } catch (err) {
      if (cue.platform === 'darwin') showStatus('Meeting audio input could not start. Re-select BlackHole or Loopback in Settings, then try again.');
      cue.log('system audio error: ' + (err && err.message));
    }
  }
  function stopSystemAudio() {
    if (sysProc) { sysProc.port.onmessage = null; sysProc.disconnect(); sysProc = null; }
    if (sysNode) { sysNode.disconnect(); sysNode = null; }
    if (sysCtx) { sysCtx.close(); sysCtx = null; }
    if (sysStream) { sysStream.getTracks().forEach((t) => t.stop()); sysStream = null; }
  }

  // ---- events from main --------------------------------------------------
  cue.on('capture:state', ({ active }) => {
    $('#live-dot').classList.toggle('off', !active);
    $('#stop-btn').classList.toggle('active', active);
    $('#mic-toggle').classList.toggle('active', active);
    $('#mic-toggle').setAttribute('aria-label', active ? 'Stop listening' : 'Start listening');
    if (active) {
      recordDiagnostic('Listening started');
      startMic().catch(() => {});
      startSystemAudio().catch(() => {});
    } else {
      recordDiagnostic('Listening stopped');
      stopMic();
      stopSystemAudio();
    }
  });
  cue.on('llm:start', ({ userBubble, small }) => {
    if (userBubble) addUserBubble(userBubble);
    startAi(!!small);
    setBusy(true);
    recordDiagnostic('Answer request started');
  });
  cue.on('llm:token', ({ text }) => appendToken(text));
  cue.on('llm:done', () => { finalizeAi(); setBusy(false); recordDiagnostic('Answer request completed'); });
  cue.on('llm:error', ({ message }) => {
    if (!aiEl) startAi(true);
    aiEl.dataset.raw = message; finalizeAi(); setBusy(false);
    lastAiText = message;
    recordDiagnostic('Answer request failed');
    if (message) showStatus(message + (message.includes('Settings') ? '' : ' Open Settings with the gear icon to fix it.'));
  });
  cue.on('transcript', ({ channel, text }) => {
    const bubble = document.createElement('div');
    bubble.className = 'transcript-bubble';
    bubble.textContent = `${channel === 'you' ? 'You' : 'Other speaker'}: ${text}`;
    messages.appendChild(bubble);
    recordDiagnostic(`Transcript received from ${channel === 'you' ? 'microphone' : 'meeting audio'}`);
    scrollMessagesToBottom();
  });
  cue.on('transcription:update', ({ channel, provider, durationMs, latencyMs, outcome }) => {
    recordDiagnostic(`${channel === 'you' ? 'Microphone' : 'Meeting'} STT · ${provider} · ${outcome} · ${(durationMs / 1000).toFixed(1)}s audio / ${(latencyMs / 1000).toFixed(1)}s`);
  });
  cue.on('window:state', ({ type, visible, focused, alwaysOnTop }) => {
    recordDiagnostic(`Laka AI window ${type} · ${visible ? 'visible' : 'hidden'} · ${focused ? 'focused' : 'not focused'} · ${alwaysOnTop ? 'topmost' : 'normal'}`);
  });
  let statusTimer = null;
  function showStatus(message) {
    let el = document.getElementById('cue-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cue-status';
      const panel = document.getElementById('panel');
      panel.insertBefore(el, document.getElementById('action-row'));
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove('show'), 11000);
  }
  cue.on('status', ({ message }) => {
    cue.log('[status] ' + message);
    showStatus(message);
  });
  cue.on('usage:update', (next) => {
    usage = next;
    updateUsage();
    const latency = next.latency || {};
    recordDiagnostic(`Provider ${latency.provider || 'unknown'} · ${latency.completion || 'unknown'} · ${(latency.totalMs || 0) / 1000}s · ${latency.attempts || 1} attempt(s)`);
  });

  // ---- settings ----------------------------------------------------------
  const scrim = $('#settings-scrim');
  function openSettings() { fillSettings(); scrim.classList.remove('hidden'); refreshMeetingAudioDevices(); }
  async function closeSettings() { await saveSettings(); scrim.classList.add('hidden'); }
  $('#more-btn').addEventListener('click', openSettings);
  $('#s-close').addEventListener('click', closeSettings);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSettings(); });

  $('#request-permissions').addEventListener('click', () => {
    showStatus('Requesting microphone permission…');
    cue.requestPermissions();
  });

  function fillSettings() {
    document.querySelectorAll('#provider-seg button').forEach((b) => b.classList.toggle('on', b.dataset.provider === settings.provider));
    const setKeyInput = (provider) => {
      const field = $('#key-' + provider);
      const previousValue = apiKeyInputs[provider] || '';
      field.value = previousValue;
      field.dataset.defaultPlaceholder = field.dataset.defaultPlaceholder || field.placeholder;
      field.placeholder = settings.apiKeyConfigured[provider] ? 'Configured — enter a new key to replace' : field.dataset.defaultPlaceholder;
    };
    ['openai', 'anthropic', 'gemini', 'groq', 'omniroute', 'openrouter', 'nvidia'].forEach(setKeyInput);
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    $('#model-fast').value = m.fast; $('#model-smart').value = m.smart;
    $('#free-tier-only').checked = !!settings.freeTierOnly;
    $('#local-speech-enabled').checked = settings.localSpeechEnabled !== false;
    $('#local-speech-model').value = settings.localSpeechModel || 'base.en';
    $('#speech-language').value = settings.speechLanguage || 'auto';
    $('#meeting-audio-device').value = settings.meetingAudioDeviceId || '';
    $('#remember-profile').checked = !!profile.enabled;
    $('#display-name').value = $('#display-name').value || profile.displayName || '';
    $('#company').value = $('#company').value || profile.company || '';
    $('#role').value = $('#role').value || profile.role || '';
    $('#responsibilities').value = $('#responsibilities').value || profile.responsibilities || '';
    $('#resume-status').textContent = resumeName || profile.resumeName || 'Not loaded';
    $('#diagnostics').textContent = diagnostics.join('\n') || 'No diagnostics yet.';
    updateUsage();
    $('#s-status').textContent = statusText();
  }
  function statusText() {
    const k = settings.apiKeyConfigured;
    const has = [k.openai && 'OpenAI', k.anthropic && 'Anthropic', k.gemini && 'Gemini', k.groq && 'Groq', k.omniroute && 'OmniRoute', k.openrouter && 'OpenRouter', k.nvidia && 'Nvidia'].filter(Boolean);
    const freeBackups = [
      settings.provider !== 'gemini' && k.gemini && 'Gemini',
      settings.provider !== 'groq' && k.groq && 'Groq',
      settings.provider !== 'openrouter' && k.openrouter && 'OpenRouter'
    ].filter(Boolean);
    const stt = k.groq ? 'Groq Whisper' : (k.openai ? 'Whisper' : (k.gemini ? 'Gemini' : 'Faster-Whisper'));
    const localRoute = k.omniroute ? ' · local route: OmniRoute' : '';
    return 'Active: ' + settings.provider + ' · keys: ' + (has.join(', ') || 'none set') + ' · free backups: ' + (freeBackups.join(' → ') || 'add Groq or OpenRouter') + localRoute + ' · transcription: ' + stt;
  }
  function updateUsage() {
    const timing = usage.latency && usage.latency.firstTokenMs ? ` · first token ${(usage.latency.firstTokenMs / 1000).toFixed(1)}s` : '';
    const details = usage.latency || {};
    const completion = details.completion ? ` · ${details.completion}` : '';
    const provider = details.provider ? ` · ${details.provider}` : '';
    const text = `${usage.requests || 0} requests this session · ${usage.freeTierOnly ? 'free-tier only is on' : 'paid models may be used'}${provider}${completion}${timing}`;
    $('#usage-status').textContent = text;
  }
  document.querySelectorAll('#provider-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.provider = b.dataset.provider;
    document.querySelectorAll('#provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    $('#model-fast').value = m.fast; $('#model-smart').value = m.smart;
    $('#s-status').textContent = statusText();
  }));
  async function saveSettings() {
    const apiKeys = {};
    ['openai', 'anthropic', 'gemini', 'groq', 'omniroute', 'openrouter', 'nvidia'].forEach((provider) => {
      const field = $('#key-' + provider);
      const value = field.value.trim();
      apiKeyInputs[provider] = value;
      if (value) apiKeys[provider] = value;
    });
    if (!settings.models[settings.provider]) settings.models[settings.provider] = {};
    settings.models[settings.provider].fast = $('#model-fast').value.trim();
    settings.models[settings.provider].smart = $('#model-smart').value.trim();
    settings = await cue.settingsSet({ provider: settings.provider, models: settings.models, apiKeys, freeTierOnly: $('#free-tier-only').checked, localSpeechEnabled: $('#local-speech-enabled').checked, localSpeechModel: $('#local-speech-model').value, speechLanguage: $('#speech-language').value, meetingAudioDeviceId: $('#meeting-audio-device').value });
    const contextPatch = { company: $('#company').value, role: $('#role').value, responsibilities: $('#responsibilities').value };
    await cue.contextSet(contextPatch);
    profile = await cue.profileSet({ displayName: $('#display-name').value, ...contextPatch }, $('#remember-profile').checked);
    if (profile && profile.error) showStatus(profile.error);
  }
  async function refreshMeetingAudioDevices() {
    const select = $('#meeting-audio-device');
    const selected = settings.meetingAudioDeviceId || select.value;
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = inputs.length ? 'Choose BlackHole or Loopback' : 'Grant microphone permission, then refresh';
      select.appendChild(placeholder);
      inputs.forEach((device) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || 'Audio input';
        select.appendChild(option);
      });
      const virtual = inputs.find((device) => /blackhole|loopback|soundflower/i.test(device.label));
      select.value = inputs.some((device) => device.deviceId === selected) ? selected : (virtual ? virtual.deviceId : '');
      if (!inputs.length) showStatus('Grant microphone permission, then refresh audio devices to choose BlackHole or Loopback.');
    } catch (error) {
      showStatus('Unable to list audio devices. Grant microphone permission, then refresh.');
    }
  }
  $('#refresh-audio-devices').addEventListener('click', refreshMeetingAudioDevices);
  $('#resume-upload').addEventListener('click', async () => {
    const result = await cue.resumeImport();
    if (result && result.resumeName) {
      resumeName = result.resumeName;
      $('#resume-status').textContent = `${resumeName} · ${result.characters} chars`;
      if ($('#remember-profile').checked) profile = await cue.profileSet({ displayName: $('#display-name').value, company: $('#company').value, role: $('#role').value, responsibilities: $('#responsibilities').value }, true);
    } else if (result && result.error) showStatus(result.error);
  });
  $('#clear-history').addEventListener('click', async () => {
    if (await cue.historyClear()) { clearMessages(); showStatus('Conversation history cleared.'); }
  });
  async function endConversation() {
    if (await cue.conversationEnd()) {
      clearMessages();
      showStatus('Conversation ended. Listening stopped and the current transcript was cleared.');
    }
  }
  $('#end-conversation').addEventListener('click', endConversation);
  $('#end-conversation-settings').addEventListener('click', endConversation);
  $('#clear-personalization').addEventListener('click', async () => {
    profile = await cue.profileClear();
    resumeName = '';
    $('#remember-profile').checked = false;
    $('#display-name').value = '';
    $('#company').value = '';
    $('#role').value = '';
    $('#responsibilities').value = '';
    $('#resume-status').textContent = 'Not loaded';
    showStatus('Saved personalization and resume removed from this Mac.');
  });
  $('#quit-app').addEventListener('click', () => cue.quit());

  // ---- global keys -------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !scrim.classList.contains('hidden')) closeSettings();
    if (isCmdOrCtrl(e)) {
      if (e.key === ',') { e.preventDefault(); openSettings(); }
    }
  });

  // UI Zoom buttons (text only)
  let currentZoom = 1;
  function updateZoom(delta) {
    currentZoom = Math.max(0.5, Math.min(3, currentZoom + delta));
    document.documentElement.style.setProperty('--text-zoom', currentZoom);
  }
  $('#zoom-in-btn').addEventListener('click', () => updateZoom(0.1));
  $('#zoom-out-btn').addEventListener('click', () => updateZoom(-0.1));

  // ---- click-through: only the UI blocks the mouse; empty gaps pass to your screen ----
  let ignoring = null;
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; cue.setIgnoreMouse(v); } }
  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overUI = !!(el && el.closest && el.closest('#toolbar, #panel-wrap, #settings-scrim, #onboard-scrim'));
    setIgnore(!overUI);
  });
  setIgnore(true); // start fully click-through; hovering the panel re-enables it

  // ---- onboarding / first-run tutorial -----------------------------------
  const obScrim = $('#onboard-scrim');
  const OB_STEPS = [
    {
      icon: '👋',
      title: 'Welcome to Laka AI',
      body: 'Laka AI is a private helper that stays close to the work. It can assist with your screen, notes, and conversation context without needing a separate window or setup each time.<br><br>This guide keeps the setup light and quiet.'
    },
    ...(cue.platform === 'darwin' ? [{
      icon: '🔐',
      title: 'Allow Laka AI to see & hear',
      body: 'Laka AI uses a couple of macOS permissions only when you enable them. You can approve them in the popup and continue quietly afterward.<ul><li><strong>Microphone</strong> — for listening when you choose</li><li><strong>Screen Recording</strong> — for screen-aware help when you enable it</li></ul>',
      buttons: [
        { label: 'Open Microphone settings', action: () => cue.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone') },
        { label: 'Open Screen Recording settings', action: () => cue.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture') }
      ]
    }] : []),
    {
      icon: '🔑',
      title: 'Connect an AI provider',
      body: 'Laka AI uses <strong>your own</strong> API key. Start with <span class="hl">Google Gemini</span> for the free tier, or choose <span class="hl">OpenAI</span>, <span class="hl">Anthropic</span>, or <span class="hl">Nvidia</span>. Paste your key into Settings when you are ready.<br><br><strong>Tip:</strong> listening works best with a speech-capable key, but screen-based help still works without it.',
      buttons: [{ label: 'Open Laka AI Settings', action: () => { finishOnboard(); openSettings(); } }]
    },
    {
      icon: '🫥',
      title: 'Use responsibly',
      body: cue.platform === 'darwin'
        ? 'Use Laka AI only where the people involved consent and the platform permits it. The app is designed to stay lightweight and optional rather than intrusive.'
        : 'Use Laka AI only where the people involved consent and the platform permits it. The app is designed to stay lightweight and optional rather than intrusive.'
    },
    {
      icon: '✨',
      title: 'You’re all set',
      body: `How to use Laka AI:<ul><li><span class="kbd">${cmdKey}</span> <span class="kbd">↵</span> — <strong>Assist</strong> with what is on screen or in your notes</li><li>Click <strong>▢</strong> in the top bar to start or stop listening where permitted</li><li>Type a question and press <span class="kbd">↵</span></li></ul>Reopen this guide anytime by clicking the <strong>Laka AI logo</strong>. Quit with <span class="kbd">${cmdKey}</span><span class="kbd">⇧</span><span class="kbd">X</span>.`
    }
  ];
  let obIndex = 0;
  function renderOnboard() {
    const step = OB_STEPS[obIndex];
    $('#ob-icon').textContent = step.icon;
    $('#ob-title').textContent = step.title;
    $('#ob-body').innerHTML = step.body;
    const btns = $('#ob-buttons'); btns.innerHTML = '';
    (step.buttons || []).forEach((b) => { const el = document.createElement('button'); el.textContent = b.label; el.addEventListener('click', b.action); btns.appendChild(el); });
    const dots = $('#ob-dots'); dots.innerHTML = '';
    OB_STEPS.forEach((_, i) => { const d = document.createElement('span'); if (i === obIndex) d.className = 'on'; dots.appendChild(d); });
    $('#ob-back').style.visibility = obIndex === 0 ? 'hidden' : 'visible';
    $('#ob-next').textContent = obIndex === OB_STEPS.length - 1 ? 'Done' : 'Next';
    $('#ob-skip').style.visibility = obIndex === OB_STEPS.length - 1 ? 'hidden' : 'visible';
  }
  function showOnboard() { obIndex = 0; renderOnboard(); obScrim.classList.remove('hidden'); setIgnore(false); }
  async function finishOnboard() {
    obScrim.classList.add('hidden');
    if (settings && !settings.onboarded) { settings.onboarded = true; await cue.settingsSet({ onboarded: true }); }
  }
  $('#ob-next').addEventListener('click', () => { if (obIndex === OB_STEPS.length - 1) finishOnboard(); else { obIndex++; renderOnboard(); } });
  $('#ob-back').addEventListener('click', () => { if (obIndex > 0) { obIndex--; renderOnboard(); } });
  $('#ob-skip').addEventListener('click', finishOnboard);
  $('#logo-btn').addEventListener('click', showOnboard);

  // ---- boot --------------------------------------------------------------
  (async function boot() {
    settings = await cue.settingsGet();
    usage = await cue.usageGet() || usage;
    profile = await cue.profileGet() || profile;
    resumeName = profile.resumeName || '';
    if (cue.platform !== 'darwin') {
      $('#placeholder').innerHTML = 'Ask about your screen or conversation, or <span class="keycap">Ctrl</span><span class="keycap">⏎</span> for Assist';
    }
    smartBtn.classList.toggle('on', !!settings.smart);
    clearMessages();
    syncPlaceholder();
    const st = await cue.captureState();
    $('#live-dot').classList.toggle('off', !st.active);
    $('#stop-btn').classList.toggle('active', st.active);
    if (!settings.onboarded) showOnboard();

    if (cue.platform === 'win32') {
      const keycaps = document.querySelectorAll('#placeholder .keycap');
      if (keycaps.length > 0) keycaps[0].textContent = 'Ctrl';
    }
  })();
})();
