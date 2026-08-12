# Laka AI Handoff

## Current state

- Local checkout is based on upstream `Blueturboguy07/cue` commit `5eb6520`.
- The shipped app identity is now **Laka AI** (`com.lakshya.lakaai`).
- The default provider is Gemini with `gemini-3.1-flash-lite`; the Smart setting uses `gemini-3-flash-preview`.
- Local preferences are written to `laka-ai-data.json` in Electron's user-data directory; API keys are encrypted using macOS Keychain (`safeStorage`) and old plaintext entries are migrated on load.
- Resume uploads, company, role, and responsibilities remain session-only by default. When the user explicitly opts into the Local profile checkbox, the profile and resume are encrypted with macOS Keychain before being persisted.
- Free-tier-only is on by default and permits only the configured Gemini free-tier models. The Settings view shows a per-session request count.
- Settings includes **Quit Laka AI**. GitHub Actions includes CI plus a tag-triggered macOS release workflow; see `docs/RELEASE.md` for required Apple and GitHub secrets.
- Chat replies remain visible in the scrollable panel for the current conversation. User questions and AI replies are retained as bounded conversation context; Clear conversation history removes them.
- Faster-Whisper is an optional local STT fallback. On first use, Laka AI provisions it into its app-data directory and downloads the chosen model; `src/faster_whisper_runner.py` hosts one persistent local worker for later requests.
- Fast answers skip a new screenshot for typed follow-ups, cap transcript at 4,000 characters and resume context at 3,500 characters, and cap fast-mode output at 450 tokens. Settings shows first-token latency after a request.
- Voice capture now downsamples the actual AudioWorklet rate to 16 kHz before WAV/STT conversion, and renderer transcript events render as scrollable `You` / `Other speaker` bubbles. The original Cue repository was compared: it uses the same browser capture pattern but did not render transcript events.

## Verification

- Run `npm ci` to install from the lockfile.
- Run `npm run pack` to create `dist/mac-arm64/Laka AI.app` on Apple Silicon.
- Run `npm start` for the source Electron app.
- Run `npm test` for the unit suite; GitHub Actions runs install, test, a high-severity production-dependency audit, and macOS packaging.
- Last local verification: `npm test` passed (20 tests), `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities, and `npm run pack` completed with ASAR enabled.

## Follow-up priorities

1. For a distributable build, configure a Developer ID Application certificate (`CSC_LINK`/`CSC_KEY_PASSWORD`) and Apple notarization secrets (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). The build script is ready but deliberately skips without these credentials.
2. Add integration tests for actual provider streaming using test keys stored in the CI secret store.
3. Bundle a managed Python runtime and Faster-Whisper model if local fallback must work on user machines without the one-time Python installation.

## Session Update - 2026-07-27

### Objective
- Make permitted Meet audio usable with headphones, provide a better free alternative to Gemini, and improve transcription accuracy.

### Completed
- Added Groq as a Keychain-backed LLM and STT provider. Groq Llama is an automatic fallback after a Gemini quota failure; Groq Whisper is the first cloud transcription option when configured.
- Replaced the misleading macOS system-loopback attempt with a user-selected virtual audio input. The UI explains how to route Meet output to a BlackHole/Loopback + headphones Multi-Output Device.
- Added multilingual Faster-Whisper model choices for mixed-language speech and a concise Gemini 429 recovery message.
- Updated the README with the correct Laka AI repository, Groq setup, and macOS meeting-audio routing steps.

### Files Modified
- `main.js`, `renderer/index.html`, `renderer/renderer.js`
- `src/llm.js`, `src/stt.js`, `src/local-stt.js`, `src/store.js`, `src/validators.js`
- `README.md` and provider/STT/security tests

### Architecture Decisions
- macOS remote audio uses an explicit virtual input; Electron's built-in loopback is retained only for non-macOS platforms because macOS does not support Electron loopback capture.
- Free-tier-only mode permits the documented Gemini and Groq defaults. Provider keys remain protected via Electron safeStorage where macOS Keychain is available.

### Dependencies Added
- None. Groq uses the existing OpenAI-compatible SDK.

### Verification
- `npm test` passed: 22 tests.
- `npm audit --omit=dev --audit-level=high` passed: 0 production vulnerabilities.
- `npm run pack` completed with ASAR enabled; signing/notarization correctly skipped because Apple release credentials are not configured locally.

### Issues Found
- A virtual device still must be installed and selected by the user on macOS; an app cannot safely or reliably reroute system audio/headphones itself.

### Pending Work
- Test actual device routing and provider calls with a user-owned Groq key and a BlackHole/Loopback device installed.
- Bundle a managed Python runtime if Faster-Whisper must work on machines without Python 3.

### Notes For Next Agent
- Do not present macOS system-loopback as supported. Follow `README.md` for the required Multi-Output Device route.

## Session Update - 2026-07-27 (latency and Groq payload fix)

### Objective
- Fix Groq's `messages[1].content must be a string` failure and reduce delayed, inaccurate live transcription.

### Completed
- Groq text models now always receive string-only chat messages; image payloads are omitted for Groq so screenshot features no longer fail with a 400 error.
- Added a bounded PCM queue: transcription flushes every 2.2 seconds and processes a maximum four-second audio segment, preserving newer audio for the next pass instead of creating ever-larger, slower requests.
- Corrected the cloud-speech status text to name Faster-Whisper rather than a nonexistent browser fallback.

### Files Modified
- `main.js`, `src/llm.js`, `src/audio-buffer.js`
- `test/providers.test.js`, `test/audio-buffer.test.js`

### Verification
- `npm test` passed: 24 tests.
- `node --check main.js` and `node --check src/llm.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.

### Pending Work
- Live provider and device testing still requires the user's own configured key and a real microphone/BlackHole or Loopback source; no API key is stored or printed by development tooling.

## Session Update - 2026-07-27 (v2.0 performance and speech accuracy)

### Objective
- Improve response speed across chat, Assist, and voice; improve speech recognition accuracy; produce a downloadable macOS v2.0 build.

### Completed
- Reduced Fast/Smart output budgets to 450/900 tokens and reduced transcript/resume prompt caps to 4,000/3,500 characters to lower provider latency without removing grounded role/resume context.
- Added a speech-language selector. Choosing English avoids auto-detection delay; Hindi and other common languages are passed to Groq Whisper, OpenAI Whisper, Gemini, and local Faster-Whisper.
- Versioned the application as `2.0.0` for the requested v2.0 package.

### Files Modified
- `package.json`, `package-lock.json`, `HANDOFF.md`
- `src/llm.js`, `src/prompts.js`, `src/stt.js`, `src/local-stt.js`, `src/faster_whisper_runner.py`, `src/store.js`, `src/validators.js`
- `renderer/index.html`, `renderer/renderer.js`, and corresponding tests

### Verification
- `npm test` passed: 25 tests.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` completed and `dist/Laka AI v2.0.zip` was created from `dist/mac-arm64/Laka AI.app`.

### Notes For Next Agent
- The source app was restarted after this change. The downloadable archive is unsigned until Apple signing credentials are configured.

## Session Update - 2026-08-12 (answer completion and diagnostics)

### Objective
- Prevent cut-off LLM answers, expose local reliability diagnostics, and improve observability for voice latency.

### Completed
- Preserved each provider's finish reason through the streaming boundary and recognize length/max-token stops from Gemini, Anthropic, and OpenAI-compatible providers.
- Automatically continue a truncated answer once without duplicating prior text. If it remains incomplete or the retry fails, retain the partial reply and offer a user-controlled Continue action.
- Added local-only diagnostics for Laka AI requests, listening state, selected meeting-audio input, transcription provider/outcome, audio duration, and latency. Diagnostics never record API keys or transcript content.
- No work was added to bypass monitoring, proctoring, tab-switch, or focus checks.

### Files Modified
- `main.js`, `preload.js`, `renderer/index.html`, `renderer/renderer.js`, `renderer/styles.css`
- `src/llm.js`, `test/providers.test.js`, `HANDOFF.md`

### Architecture Decisions
- Continuation is bounded to one automatic attempt per answer; later completion requires an explicit user action to control cost and prevent loops.
- Diagnostics report only Laka AI's own state and timing, never external application state or hidden-focus behavior.

### Verification
- `npm test` passed: 26 tests.
- `node --check main.js`, `node --check preload.js`, and `node --check renderer/renderer.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` completed with ASAR enabled; signing/notarization was skipped because Apple credentials are not configured locally.
