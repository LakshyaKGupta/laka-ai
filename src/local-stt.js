const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ALLOWED_MODELS = new Set(['tiny.en', 'base.en', 'small.en', 'medium.en', 'tiny', 'base', 'small', 'medium']);

function normalizeModel(model) {
  return ALLOWED_MODELS.has(model) ? model : 'base.en';
}

function runnerPath({ isPackaged = false, resourcesPath = process.resourcesPath, localDir = __dirname } = {}) {
  return isPackaged
    ? path.join(resourcesPath, 'app.asar.unpacked', 'src', 'faster_whisper_runner.py')
    : path.join(localDir, 'faster_whisper_runner.py');
}

function runtimeEnv(runtimeDir) {
  return { ...process.env, PYTHONPATH: [runtimeDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
}

function pipInstallArgs(runtimeDir) {
  return ['-m', 'pip', 'install', '--disable-pip-version-check', '--target', runtimeDir, 'faster-whisper'];
}

function runPython(python, args, env, timeout = 240_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { env, windowsHide: true });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Faster-Whisper setup timed out. Check your internet connection and try again.')); }, timeout);
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(output || `Python exited with code ${code}.`));
    });
  });
}

class FasterWhisperWorker {
  constructor({ python = 'python3', model = 'base.en', isPackaged, resourcesPath, localDir, runtimeDir, onStatus = () => {} } = {}) {
    this.python = python;
    this.model = normalizeModel(model);
    this.script = runnerPath({ isPackaged, resourcesPath, localDir });
    this.runtimeDir = runtimeDir || path.join(os.homedir(), '.laka-ai', 'faster-whisper-python');
    this.onStatus = onStatus;
    this.child = null;
    this.startPromise = null;
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = '';
  }

  async ensureRuntime() {
    const env = runtimeEnv(this.runtimeDir);
    try {
      await runPython(this.python, ['-c', 'import faster_whisper'], env, 10_000);
      return env;
    } catch (_) {
      this.onStatus('Preparing Faster-Whisper for first use. This runs once and may take a few minutes.');
      fs.mkdirSync(this.runtimeDir, { recursive: true, mode: 0o700 });
      await runPython(this.python, pipInstallArgs(this.runtimeDir), env);
      this.onStatus('Faster-Whisper is ready. Downloading the selected speech model on first use.');
      return env;
    }
  }

  async start() {
    if (this.child && !this.child.killed) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.ensureRuntime().then((env) => {
      this.child = spawn(this.python, [this.script, '--model', this.model], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child.stdin.on('error', (error) => this.failAll(error));
    let stdout = '';
    this.child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop();
      lines.filter(Boolean).forEach((line) => this.handleLine(line));
    });
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk.toString()).slice(-2000); });
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('exit', (code) => {
      const detail = this.stderr || `Faster-Whisper worker exited (${code}).`;
      this.failAll(new Error(detail));
      this.child = null;
    });
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  handleLine(line) {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) pending.reject(new Error(response.error));
    else pending.resolve((response.text || '').trim());
  }

  failAll(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  async transcribe(wav, language = '') {
    await this.start();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Faster-Whisper took too long to transcribe this audio.'));
      }, 180_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child.stdin.write(JSON.stringify({ id, audio: wav.toString('base64'), language }) + '\n'); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
}

let worker = null;
function transcribeLocal(wav, settings = {}) {
  const model = normalizeModel(settings.localSpeechModel);
  if (!worker || worker.model !== model) worker = new FasterWhisperWorker({ model, isPackaged: Boolean(process.resourcesPath && __dirname.includes('app.asar')), runtimeDir: settings.localSpeechRuntimeDir, onStatus: settings.onLocalStatus });
  return worker.transcribe(wav, settings.speechLanguage || '');
}

module.exports = { FasterWhisperWorker, normalizeModel, pipInstallArgs, runnerPath, runtimeEnv, transcribeLocal };
