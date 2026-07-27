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
- Fast answers skip a new screenshot for typed follow-ups, cap transcript and resume context to 6,000 characters each, and cap fast-mode output at 700 tokens. Settings shows first-token latency after a request.

## Verification

- Run `npm ci` to install from the lockfile.
- Run `npm run pack` to create `dist/mac-arm64/Laka AI.app` on Apple Silicon.
- Run `npm start` for the source Electron app.
- Run `npm test` for the unit suite; GitHub Actions runs install, test, a high-severity production-dependency audit, and macOS packaging.
- Last local verification: `npm test` passed (19 tests), `npm audit --omit=dev --audit-level=high` found 0 production vulnerabilities, and `npm run pack` completed with ASAR enabled.

## Follow-up priorities

1. For a distributable build, configure a Developer ID Application certificate (`CSC_LINK`/`CSC_KEY_PASSWORD`) and Apple notarization secrets (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). The build script is ready but deliberately skips without these credentials.
2. Add integration tests for actual provider streaming using test keys stored in the CI secret store.
3. Bundle a managed Python runtime and Faster-Whisper model if local fallback must work on user machines without the one-time Python installation.
