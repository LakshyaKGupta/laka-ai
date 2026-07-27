const { spawn } = require('child_process');
const path = require('path');

const ALLOWED_MODELS = new Set(['tiny.en', 'base.en', 'small.en', 'medium.en']);

function normalizeModel(model) {
  return ALLOWED_MODELS.has(model) ? model : 'base.en';
}

function runnerPath({ isPackaged = false, resourcesPath = process.resourcesPath, localDir = __dirname } = {}) {
  return isPackaged
    ? path.join(resourcesPath, 'app.asar.unpacked', 'src', 'faster_whisper_runner.py')
    : path.join(localDir, 'faster_whisper_runner.py');
}

class FasterWhisperWorker {
  constructor({ python = 'python3', model = 'base.en', isPackaged, resourcesPath, localDir } = {}) {
    this.python = python;
    this.model = normalizeModel(model);
    this.script = runnerPath({ isPackaged, resourcesPath, localDir });
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = '';
  }

  start() {
    if (this.child && !this.child.killed) return;
    this.child = spawn(this.python, [this.script, '--model', this.model], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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

  transcribe(wav) {
    this.start();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Faster-Whisper took too long to transcribe this audio.'));
      }, 45_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, audio: wav.toString('base64') }) + '\n');
    });
  }
}

let worker = null;
function transcribeLocal(wav, settings = {}) {
  const model = normalizeModel(settings.localSpeechModel);
  if (!worker || worker.model !== model) worker = new FasterWhisperWorker({ model, isPackaged: Boolean(process.resourcesPath && __dirname.includes('app.asar')) });
  return worker.transcribe(wav);
}

module.exports = { FasterWhisperWorker, normalizeModel, runnerPath, transcribeLocal };
