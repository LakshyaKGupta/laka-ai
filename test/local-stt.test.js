const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { normalizeModel, pipInstallArgs, runnerPath, runtimeEnv } = require('../src/local-stt');

test('uses an approved Faster-Whisper model and rejects arbitrary command arguments', () => {
  assert.equal(normalizeModel('small.en'), 'small.en');
  assert.equal(normalizeModel('--help'), 'base.en');
});

test('locates the unpacked Faster-Whisper worker in packaged builds', () => {
  const resourcesPath = path.join('/Applications', 'Laka AI.app', 'Contents', 'Resources');
  assert.equal(
    runnerPath({ isPackaged: true, resourcesPath, localDir: '/ignored' }),
    path.join(resourcesPath, 'app.asar.unpacked', 'src', 'faster_whisper_runner.py')
  );
});

test('provisions Faster-Whisper into an app-owned runtime instead of the global Python install', () => {
  const runtimeDir = '/Users/test/Library/Application Support/laka-ai/faster-whisper-python';
  assert.deepEqual(pipInstallArgs(runtimeDir), ['-m', 'pip', 'install', '--disable-pip-version-check', '--target', runtimeDir, 'faster-whisper']);
  assert.equal(runtimeEnv(runtimeDir).PYTHONPATH, runtimeDir);
});
