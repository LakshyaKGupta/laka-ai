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

## Session Update - 2026-08-12 (v2.1 free fallback and self diagnostics)

### Objective
- Add a free text fallback after Gemini and Groq, validate the app's own overlay lifecycle safely, and prepare a macOS build.

### Completed
- Added OpenRouter as a Keychain-backed, text-only provider. Its default `openrouter/free` model is eligible for Free-tier-only mode and is tried after Gemini and Groq when they return an error.
- Added Settings controls, status visibility, model defaults, validation, provider-chain tests, and user-facing quota recovery guidance for OpenRouter.
- Added local-only Laka AI window diagnostics: ready/focus/blur/show/hide, visible state, own focus state, and own always-on-top state. It deliberately does not inspect, suppress, or alter other applications' focus/monitoring behavior.
- Bumped the app to `2.1.0` and created `dist/Laka AI v2.1.zip` from the Apple Silicon `.app`.

### Files Modified
- `package.json`, `package-lock.json`, `README.md`, `HANDOFF.md`
- `main.js`, `preload.js`, `renderer/index.html`, `renderer/renderer.js`
- `src/llm.js`, `src/store.js`, `src/validators.js`, `src/window-diagnostics.js`
- `test/providers.test.js`, `test/security.test.js`, `test/window-diagnostics.test.js`

### Architecture Decisions
- OpenRouter uses the existing OpenAI-compatible SDK and Keychain persistence path; no dependency or plaintext key store was added.
- It is intentionally text-only because `openrouter/free` routes to an available free model whose capability can vary. Voice continues through Groq/OpenAI/Gemini/Faster-Whisper.
- Window telemetry only describes Laka AI's own state and is emitted over the existing allow-listed IPC channel.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 28 tests.
- `node --check main.js`, `node --check preload.js`, `node --check renderer/renderer.js`, and `node --check src/llm.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities.
- `npm run pack` completed for macOS arm64 with ASAR enabled.
- `unzip -t 'dist/Laka AI v2.1.zip'` reported no compressed-data errors.

### Issues Found
- The packaged build is unsigned and not notarized because no Developer ID identity or Apple notarization credentials are available. Do not represent it as a signed GitHub Release until those credentials are configured.

### Pending Work
- Add a user-owned OpenRouter key in Settings and make a live permitted text request to validate the provider externally; automated tests cover configuration and fallback ordering but do not consume API quotas.
- Configure the Apple signing and notarization secrets from `docs/RELEASE.md` before pushing a version tag that triggers the release workflow.

## Session Update - 2026-08-12 (personalization removal and voice answer freshness)

### Objective
- Let the user remove stored personalization, improve full-answer reliability without wasting output tokens, and make the voice-reply action use the freshest available speech.

### Completed
- Added **Remove saved personalization** in Settings. It clears the encrypted persisted profile/resume and all in-memory resume/company/role/responsibility context in one action.
- Added feature-aware response budgets: concise voice and small actions use 260 Fast / 360 Smart tokens; direct Ask and Assist use 600 Fast / 1,000 Smart tokens. Explicit truncation still has the existing bounded automatic continuation as a safety net.
- The user-triggered **What should I say?** action now flushes an available pending audio segment before prompting the model, so it uses the newest completed transcription rather than waiting for the next periodic flush.
- Tightened Ask and Assist prompts to favor complete, self-contained, evidence-based answers without unnecessary repetition.

### Files Modified
- `main.js`, `preload.js`, `renderer/index.html`, `renderer/renderer.js`
- `src/store.js`, `src/llm.js`, `src/prompts.js`
- `test/store.test.js`, `test/response-budget.test.js`, `HANDOFF.md`

### Architecture Decisions
- Answer generation remains an explicit button action. Laka AI does not automatically generate or send answers from continuously captured audio.
- Forced speech flushing is limited to a minimum viable segment and never consumes an undersized audio buffer, preserving accuracy and avoiding dropped partial speech.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 30 tests.
- `node --check main.js`, `node --check preload.js`, `node --check renderer/renderer.js`, and `node --check src/llm.js` passed.

### Pending Work
- Real microphone/meeting-audio accuracy still needs a permitted live test using the selected microphone or BlackHole/Loopback device and the user's provider key; unit tests cannot validate physical device routing or a provider's external transcription quality.

## Session Update - 2026-08-12 (speaker-role correction)

### Objective
- Stop Laka AI from displaying demo content as a live reply or mistaking its own output for the remote speaker.

### Completed
- Removed the startup DCF example conversation from the live message panel.
- Stored generated LLM output as `assistant` instead of `them`; prompt formatting now labels it as `Laka AI` when needed.
- Voice-reply prompts exclude prior Laka AI output entirely, so only the captured user/remote-speaker transcript determines what the user should say.
- The **What should I say?** action now gives a clear recovery message instead of fabricating a profile-based greeting when no other-speaker transcription exists.

### Files Modified
- `main.js`, `renderer/renderer.js`, `src/prompts.js`, `test/performance.test.js`, `HANDOFF.md`

### Architecture Decisions
- `them` is reserved solely for speech captured from the selected meeting-audio input. `assistant` represents Laka AI generated text and is not fed into voice-reply generation.
- Existing historic entries created before this fix may still be labeled `them`; use Clear conversation history once to remove that old context.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 32 tests.
- `node --check main.js`, `node --check renderer/renderer.js`, and `node --check src/prompts.js` passed.

## Session Update - 2026-08-12 (end conversation control)

### Objective
- Provide one clear action to stop an active conversation safely.

### Completed
- Added **End conversation** in Settings. It stops audio capture, clears current transcript/assistant context and pending audio buffers, and removes the visible session messages.
- Kept **Clear conversation history** as the history-only action and **Remove saved personalization** as the separate profile/resume removal action.

### Files Modified
- `main.js`, `preload.js`, `renderer/index.html`, `renderer/renderer.js`, `src/conversation.js`, `test/conversation.test.js`, `HANDOFF.md`

### Architecture Decisions
- Conversation clearing is a small shared helper used by both history clearing and the full end-conversation path, preventing drift between the two actions.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 33 tests.
- `node --check main.js`, `node --check preload.js`, and `node --check renderer/renderer.js` passed.

## Session Update - 2026-08-12 (v2.1.1 visible end control and focused voice context)

### Objective
- Make the conversation-ending action visible without opening Settings, avoid stale app copies, and improve voice-answer relevance and latency.

### Completed
- Added a visible **End conversation** action in the main panel, while retaining the Settings control.
- Reduced voice-reply context from 14 to the newest 8 captured turns and explicitly prioritize the newest remote-speaker statement.
- Versioned the app as `2.1.1` so macOS shows a distinct updated build rather than a replacement that appears unchanged.

### Files Modified
- `package.json`, `package-lock.json`, `renderer/index.html`, `renderer/renderer.js`, `src/prompts.js`, `test/performance.test.js`, `HANDOFF.md`

### Architecture Decisions
- The latest complete remote statement is the strongest signal for a voice reply; bounding prior context improves both relevance and provider latency.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 34 tests.
- `node --check renderer/renderer.js` and `node --check src/prompts.js` passed.

## Session Update - 2026-08-12 (v2.1.2 fast voice action)

### Objective
- Reduce avoidable answer delay and place End conversation beside the Listen control.

### Completed
- Added a 900 ms maximum wait for a pending transcription before a voice reply. If it completes in time, the newest audio is used; otherwise the model starts immediately from the latest completed transcript while transcription continues.
- Moved **End conversation** to the top toolbar beside the Listen control, with a distinct red stop icon.
- Versioned the app as `2.1.2` for an unambiguous package update.

### Files Modified
- `package.json`, `package-lock.json`, `main.js`, `renderer/index.html`, `renderer/renderer.js`, `renderer/styles.css`, `src/fresh-audio.js`, `test/fresh-audio.test.js`, `HANDOFF.md`

### Architecture Decisions
- The fresh-audio deadline preserves a fast response path without cancelling the audio worker or accepting an unbounded transcription wait. Provider/network first-token time remains externally determined and is displayed in local diagnostics.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 36 tests.
- `node --check main.js`, `node --check renderer/renderer.js`, and `node --check src/fresh-audio.js` passed.

## Session Update - 2026-08-12 (v2.1.3 faster Assist)

### Objective
- Reduce Assist latency while preserving screen-grounded responses.

### Completed
- Capped screen-capture thumbnails at a 1,440px longest edge, avoiding full Retina PNG capture/upload overhead.
- Tuned Assist output to 450 Fast / 800 Smart tokens; Ask retains its larger complete-answer budget.
- Versioned the app as `2.1.3` for a distinct distributable package.

### Files Modified
- `package.json`, `package-lock.json`, `src/screen.js`, `src/screen-size.js`, `src/llm.js`, `test/screen-size.test.js`, `test/response-budget.test.js`, `HANDOFF.md`

### Architecture Decisions
- The 1,440px cap preserves enough visual detail for ordinary UI/code/document assistance while reducing image transfer and multimodal provider processing. External provider/network latency remains visible in Diagnostics as first-token and screenshot timing.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 38 tests.
- `node --check src/screen.js`, `node --check src/screen-size.js`, and `node --check src/llm.js` passed.

## Session Update - 2026-08-12 (v2.1.4 answer accuracy guard)

### Objective
- Stop fast but fabricated Assist responses and remove meta/greeting output across Assist, voice, and typed answers.

### Completed
- Marked provider candidates by image capability and made screen Assist select only vision-capable candidates (Gemini, OpenAI, Anthropic, Nvidia). Groq and OpenRouter are skipped for a request that includes a screenshot.
- Screen Assist now reports a clear setup requirement rather than sending a screenshot-less request to a text-only model and guessing from stale context.
- Tightened Assist, voice, and typed-answer instructions to produce only the self-contained final answer: no greeting, planning narration, “I should say” wrapper, or duplicate text.
- Versioned the app as `2.1.4`.

### Files Modified
- `package.json`, `package-lock.json`, `main.js`, `src/llm.js`, `src/prompts.js`, `test/providers.test.js`, `test/performance.test.js`, `HANDOFF.md`

### Architecture Decisions
- Vision accuracy takes priority over a text-only fallback for screen-dependent actions. Free Groq/OpenRouter remain usable for text/voice reply actions, but cannot truthfully inspect a screenshot.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 40 tests.
- `node --check main.js`, `node --check src/llm.js`, and `node --check src/prompts.js` passed.

## Session Update - 2026-08-12 (v2.1.5 quota cooldown and coding accuracy)

### Objective
- Stop repeated Gemini quota calls and prevent generic, incorrect coding Assist answers.

### Completed
- Added an in-session cooldown for a provider that returns HTTP 429. Laka AI honors its stated retry time (or a bounded 60-second fallback) and skips that provider on later requests, immediately attempting configured alternatives.
- Added a clear all-providers-cooling-down message with the earliest retry time instead of repeatedly spending free-tier requests.
- Made coding Assist explicitly verify screenshot inputs/constraints/output and reject generic optimization advice or vague code reviews.

### Files Modified
- `package.json`, `package-lock.json`, `main.js`, `src/llm.js`, `src/prompts.js`, `src/provider-cooldown.js`, `test/provider-cooldown.test.js`, `test/providers.test.js`, `test/performance.test.js`, `HANDOFF.md`

### Architecture Decisions
- Cooldowns are intentionally session-local and contain only provider names plus retry timestamps—never keys, transcript content, or external telemetry.
- Text-only Groq/OpenRouter can keep text and voice workflows available during a Gemini cooldown but cannot replace a vision model for screen Assist.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 45 tests.
- `node --check main.js`, `node --check src/llm.js`, `node --check src/provider-cooldown.js`, and `node --check src/prompts.js` passed.

## Session Update - 2026-08-14 (v2.1.6 fallback routing and answer completeness)

### Objective
- Continue answering when Gemini reaches its free-tier limit, while improving accuracy and complete one-pass replies in chat, Assist, and voice workflows.

### Completed
- Fixed Free-tier-only routing so every configured fallback is evaluated against its own provider/model. A configured eligible Groq or OpenRouter key is now available even when Gemini is selected, cooling down, missing, or not eligible.
- Prevented paid-model fallbacks from being called while Free-tier-only is enabled.
- Increased response budgets for full typed and screen answers (Fast: 800/750 tokens; Smart: 1,200/1,100). Voice replies remain concise but now have a 360/480-token budget.
- Increased the Assist capture edge to 1,600px for clearer code/problem screenshots and block a screen request if Screen Recording capture fails, rather than generating from stale text without seeing the screen.
- Clarified Settings and README so the configured free fallback chain is visible and users know a valid Groq/OpenRouter key is necessary once Gemini is rate-limited.

### Files Modified
- `main.js`, `src/llm.js`, `src/prompts.js`, `src/screen.js`, `src/screen-request.js`
- `renderer/renderer.js`, `README.md`, `package.json`, `package-lock.json`
- `test/providers.test.js`, `test/response-budget.test.js`, `test/screen-size.test.js`, `test/screen-request.test.js`, `HANDOFF.md`

### Architecture Decisions
- Candidate eligibility is centralized in `createLLM`; the renderer still receives only key-presence flags, never API keys.
- Screen-dependent actions fail closed when no image was captured. Text/voice actions can still use Groq/OpenRouter during a Gemini cooldown.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 49 tests.
- `node --check main.js`, `node --check src/llm.js`, `node --check src/prompts.js`, `node --check src/screen.js`, and `node --check src/screen-request.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` produced `dist/mac-arm64/Laka AI.app` with version `2.1.6` and ASAR enabled.
- `unzip -t 'dist/Laka AI v2.1.6.zip'` passed; SHA-256: `d0360b493c6d2e57212687938e2bc723e0b76853c433782ce43f8780dc5d512c`.

### Issues Found
- No local test can prove an external provider key has quota or access. A backup is only usable after its valid user-owned key has been added in Settings.

### Pending Work
- Use the v2.1.6 package, configure Groq and/or OpenRouter, and make one permitted real request to validate the external account quotas.

## Session Update - 2026-08-14 (v2.1.7 live voice latency)

### Objective
- Make listening react quickly, prevent stale queued audio from delaying replies, and add a microphone control beside the Play button.

### Completed
- Replaced the 2.2-second audio polling cadence with an 800 ms live cadence.
- Reduced each transcription request to a bounded 2.5-second audio segment and retained only the newest eight seconds of queued PCM while a provider is busy. Stale speech is now dropped instead of making current speech wait behind it.
- Added a microphone button immediately beside Play. It starts/stops the same consent-gated listening flow as the toolbar control and exposes its active state to assistive technology.

### Files Modified
- `main.js`, `src/live-audio.js`
- `renderer/icons.js`, `renderer/index.html`, `renderer/renderer.js`, `renderer/styles.css`
- `package.json`, `package-lock.json`, `test/live-audio.test.js`, `test/renderer-controls.test.js`, `HANDOFF.md`

### Architecture Decisions
- Live transcription prioritizes freshness over unbounded backlog retention. Provider/network latency is still external and cannot be made zero by the desktop app.
- Voice-answer generation remains user-triggered; listening does not automatically send a response.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 52 tests.
- `node --check main.js`, `node --check renderer/renderer.js`, and `node --check src/live-audio.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` produced `dist/mac-arm64/Laka AI.app` with version `2.1.7` and ASAR enabled.
- `unzip -t 'dist/Laka AI v2.1.7.zip'` passed; SHA-256: `f7f521983a49f32dbd8d181a415555fa00dd37de50d289446725b994bf543a44`.

### Issues Found
- Actual transcription accuracy depends on the microphone/virtual meeting-audio route, the selected language, and the external STT model. Unit tests cannot validate a real audio device or cloud response latency.

### Pending Work
- Conduct a permitted live microphone/meeting-audio test with a configured STT key; no automated test can access a real device or consume the user's provider quota.

## Session Update - 2026-08-14 (v2.1.8 stale-chat correction and automatic completion)

### Objective
- Stop standalone typed messages from receiving stale conversation answers, remove the visible Continue button, and reduce answer latency across voice and Assist.

### Completed
- Standalone messages such as `hi`, `hello`, and `thanks` now omit old transcript context entirely. Other typed messages keep only six relevant prior turns and the current message is explicit and authoritative.
- Removed the Continue button and its IPC surface. A token-limited answer now performs up to two automatic continuations behind the same streamed response; if the provider still cannot complete it, Laka AI shows a precise status rather than a manual action.
- Reduced the maximum freshness wait before a voice reply from 900 ms to 350 ms.
- Fast Assist now captures a 1,440px image; Smart Assist retains 1,600px for accuracy.

### Files Modified
- `main.js`, `preload.js`, `src/continuation.js`, `src/fresh-audio.js`, `src/prompts.js`, `src/screen.js`, `renderer/renderer.js`
- `package.json`, `package-lock.json`, `test/continuation.test.js`, `test/fresh-audio.test.js`, `test/performance.test.js`, `test/renderer-controls.test.js`, `HANDOFF.md`

### Architecture Decisions
- The current typed message is the source of truth; persisted chat history remains available only where it can help a genuine follow-up.
- Continuation remains bounded at two automatic retries to avoid infinite loops and surprise free-tier consumption.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 56 tests.
- `node --check main.js`, `node --check preload.js`, `node --check renderer/renderer.js`, `node --check src/prompts.js`, `node --check src/continuation.js`, `node --check src/fresh-audio.js`, and `node --check src/screen.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` produced `dist/mac-arm64/Laka AI.app` with version `2.1.8` and ASAR enabled.
- `unzip -t 'dist/Laka AI v2.1.8.zip'` passed; SHA-256: `7d4911c549d31194fd7c7daee6af30da6801bb7d8b7ee79dba895f378df31064`.

### Issues Found
- External STT/model network and queue latency cannot be guaranteed or validated without a permitted live provider/device test.

### Pending Work
- Run a permitted microphone/meeting-audio smoke test using the user's configured provider; an automated build cannot validate an external provider response or physical audio route.

## Session Update - 2026-08-16 (v2.1.9 phrase-aware voice and full Assist answers)

### Objective
- Prevent voice slowdowns after a few questions and stop Assist/typed answers from ending halfway through their required output.

### Completed
- Replaced fixed 800 ms speech request dispatch with phrase-aware dispatch: the pipeline polls every 200 ms but only transcribes after 450 ms of silence, when a 2.5-second segment fills, or when the user explicitly requests a voice reply.
- This substantially reduces short cloud STT requests that can exhaust a free tier and trigger a slow fallback, while keeping a short pause-to-transcription delay.
- Raised one-pass output budgets: Assist is 1,100 Fast / 1,500 Smart tokens; typed chat is 900 Fast / 1,300 Smart tokens. Voice remains intentionally brief.

### Files Modified
- `main.js`, `src/live-audio.js`, `src/llm.js`
- `package.json`, `package-lock.json`, `test/live-audio.test.js`, `test/response-budget.test.js`, `HANDOFF.md`

### Architecture Decisions
- Pause-aware phrase segmentation provides a better latency/accuracy/quota balance than sending arbitrary sub-second chunks during active speech.
- Larger answer budgets avoid visible truncation without adding another UI continuation action.

### Dependencies Added
- None.

### Verification
- `npm test` passed: 57 tests.
- `node --check main.js`, `node --check src/live-audio.js`, and `node --check src/llm.js` passed.
- `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` because DNS/network access was unavailable.
- `npm run pack` could not download an Electron build artifact from `github.com` because DNS/network access was unavailable; no v2.1.9 archive was produced.

### Issues Found
- Provider first-token time is still external. The local diagnostics reports the provider and timing after each answer, but no automated test can consume the user's quota or reproduce physical audio conditions.

### Pending Work
- Restore network access, package v2.1.9, and run a permitted live provider/device smoke test.

## Session Update - 2026-08-16 (v2.2.0 local OmniRoute fallback)

### Objective
- Add OmniRoute as a no-server, local AI routing fallback while keeping API-key storage protected and Laka AI's spending controls truthful.

### Completed
- Added **OmniRoute** to Settings, settings validation, optional Keychain-backed endpoint-key persistence, model defaults, status visibility, provider routing, documentation, and regression tests.
- Laka AI sends OmniRoute requests only to the fixed local OpenAI-compatible endpoint `http://127.0.0.1:20128/v1`; it never exposes an arbitrary gateway URL from the renderer.
- Added `auto/fast` and `auto/smart` defaults and placed OmniRoute after Gemini and Groq, before OpenRouter, in the text fallback chain.
- Kept OmniRoute text-only in Laka AI. Screen Assist fails over only to known vision-capable providers rather than sending a screenshot to a dynamic OmniRoute route.
- Kept OmniRoute out of **Free-tier only** eligibility. OmniRoute's own dashboard selects downstream models, so Laka AI cannot honestly verify their price. Users who need that setup must configure only free downstream routes in OmniRoute itself.
- Installed OmniRoute `3.8.49` locally and verified its local server starts at `http://localhost:20128` with the documented `/v1/models` endpoint.
- Documented the one-time local setup: `npm install -g omniroute`, run `omniroute`, open `http://localhost:20128`, and save an endpoint key in Laka AI Settings only when OmniRoute endpoint authentication is enabled. Laka AI does not auto-start OmniRoute.
- Bumped the app to `2.2.0` and produced the Apple Silicon ZIP and DMG.

### Files Modified
- `README.md`, `package.json`, `package-lock.json`, `HANDOFF.md`
- `renderer/index.html`, `renderer/renderer.js`
- `src/llm.js`, `src/store.js`, `src/validators.js`
- `test/providers.test.js`, `test/renderer-controls.test.js`, `test/security.test.js`

### Architecture Decisions
- The local endpoint is hard-coded to loopback to avoid turning the desktop app into an arbitrary network relay.
- OmniRoute can operate without an endpoint key when its local server permits it; if endpoint authentication is enabled, its key follows the existing Keychain/safeStorage path and is never returned to the renderer after saving.
- It is a chat fallback only. Speech-to-text remains Groq/OpenAI/Gemini/Faster-Whisper, and visual Assist remains vision-provider only.

### Verification
- `npm test` passed: 62 tests.
- `node --check main.js`, `node --check src/llm.js`, `node --check src/validators.js`, and `node --check renderer/renderer.js` passed.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `npm run pack` and `npm run dist` completed with ASAR enabled.
- `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities.
- `curl -H 'Authorization: Bearer omniroute-local' http://127.0.0.1:20128/v1/models` returned HTTP 200, and listed both `auto/fast` and `auto/smart`.
- `unzip -t 'dist/Laka AI-2.2.0-arm64-mac.zip'` passed. SHA-256: `f16363cb1cd848617133038376a699453a0ef4a4643fdaac85756f8e62f6c6ce`.

### Issues Found
- The ZIP/DMG is unsigned and not notarized because a local Developer ID certificate and Apple notarization credentials are not configured. It must not be represented as a signed release.
- A live LLM completion was not sent because the configured OmniRoute route/provider and its resulting cost were not known. The provider contract, loopback target, local model discovery, settings persistence path, packaging, and fallback ordering are covered by tests.

### Pending Work
- In the OmniRoute dashboard, connect only intended downstream providers and configure free-only routes if required; then make one permitted chat request to validate the user's actual route and quota.
- Configure the Apple signing/notarization secrets in `docs/RELEASE.md` before publishing a signed GitHub Release.
