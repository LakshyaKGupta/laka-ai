<div align="center">

# Laka AI

**A local AI assistant that can help with your screen, notes, and permitted conversations.**

A local desktop assistant. Bring your own AI key (Groq · Google Gemini · OpenAI · Anthropic).

<img src="docs/tutorial.png" width="620" alt="Laka AI first-run tutorial" />

</div>

---

> [!IMPORTANT]
> **Please read this first.** Use Laka AI only for legitimate, permitted workflows — such as your own notes, studying, accessibility, and practice. Do not use it in proctored exams, interviews, or recorded meetings unless every participant and platform explicitly permits it.

---

## What it does

Laka AI floats a small glass panel on top of everything. It takes **three separate inputs** — your **screen**, your **microphone**, and permitted **meeting audio** — and uses an AI model to help you in real time.

| Feature | How to trigger | What it uses |
|---|---|---|
| **Assist** | `⌘` `↵` or the *Assist* button | your screen + recent conversation |
| **What should I say?** | button | meeting audio + your mic |
| **Follow-up questions** | button | the whole conversation |
| **Recap** | button | the whole conversation |
| **Ask anything** | type + `↵` | your screen + conversation |
| **Solve a coding problem** | `⌘` `H` | your screen only |
| **Smart** toggle | pill in the box | switches to a smarter (slower) model |

It is designed for your own notes, permitted conversations, study, and practice. Screen-capture behavior is platform-dependent and must not be relied on for concealment.

---

## Install

Run Laka AI from source:

You need [Node.js](https://nodejs.org) 18+ installed. No Xcode required.

```bash
git clone https://github.com/LakshyaKGupta/laka-ai.git
cd laka-ai
npm install
npm start
```

To build your own `Laka AI.app`:
```bash
npm run pack      # creates dist/mac-arm64/Laka AI.app
```
> Note: local builds are unsigned until you configure an Apple Developer ID certificate. The release configuration enables hardened runtime and notarization when its signing and Apple credentials are supplied. macOS permission grants may need to be renewed after replacing a locally built app.

For a public, signed macOS download through GitHub Releases, follow [the release guide](docs/RELEASE.md).

---

## First launch — the 1-minute setup

When Laka AI opens the first time, a **built-in tutorial** walks you through everything below. You can reopen it anytime by clicking the **Laka AI logo** (top-left of the pill). Here's the same thing in writing.

### Step 1 — Grant two macOS permissions

Laka AI can't help until macOS lets it see and hear. When you first use a feature, macOS will prompt you — click **Allow**. If a prompt doesn't appear, add Laka AI manually:

- **Microphone:** System Settings → **Privacy & Security** → **Microphone** → turn on **Laka AI**.
- **Screen Recording:** System Settings → **Privacy & Security** → **Screen Recording** → turn on **Laka AI**. (This one grant covers both screenshots *and* meeting audio.) macOS may ask you to **quit & reopen** Laka AI — let it.

### Step 2 — Add your AI key (bring your own)

Laka AI uses **your own** API key. Click the **`...`** button in the input box (or press `⌘` `,`) to open **Settings**, pick a provider, and paste your key:

| Provider | Get a key | Notes |
|---|---|---|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | One key does everything — **but** for the *listening* features the key must have **Whisper / audio** access (a "restricted" project key that only allows chat will give a 403 on transcription). |
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com) | Great for screen & coding help. Claude has no speech-to-text, so add an OpenAI or Gemini key too if you want the listening features. |
| **Google Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Recommended starting point: one key does chat + transcription, with a limited free tier. |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | Recommended free alternative: fast Llama responses plus Whisper transcription. Free limits still apply. |

Your API keys are encrypted with macOS Keychain and the settings file retains only encrypted ciphertext. They are sent only to the provider you choose. Laka AI has no server and collects nothing.

### Speech-to-text and accuracy

Laka AI uses Groq Whisper first when a Groq key is configured, then OpenAI/Gemini when available, then [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) locally. Enable the local fallback in **Settings → Local voice fallback**. On first use, Laka AI installs the Python package into its own app-data folder and downloads the selected model; later launches reuse that cached runtime and model. Choose **Small multilingual** for Hindi or mixed-language meetings; use Base English for the fastest English-only fallback.

### Capture other people in a Meet call on macOS

Electron cannot capture macOS system audio directly. To transcribe remote participants while keeping headphones on, install [BlackHole](https://existential.audio/blackhole/) or Rogue Amoeba Loopback, create a macOS **Multi-Output Device** containing both your headphones and the virtual device, route Meet output to that Multi-Output Device, then choose the BlackHole/Loopback input in **Settings → Meeting audio**. Laka AI captures only after you press Listen and only where every participant and the platform permit it. On Windows, Electron's system-audio loopback is used instead.

### Step 3 — Use with consent

Before using Laka AI with screen or audio input, ensure every participant and the platform allow it. Visibility in screen recordings or screen shares is not guaranteed.

---

## How to use it

- **`⌘` `↵` — Assist.** The do-the-smart-thing key. On a coding problem it solves it; in a conversation it tells you what to say. Works from anywhere.
- **`⌘` `H` — Solve what's on screen.** Screenshots a coding problem and returns the approach, code, and time/space complexity.
- **The `▢` button** (top bar) — start/stop **listening** to a meeting. The green dot means it's live.
- **Type a question** in the box and press `↵` to ask about your screen or conversation.
- **Smart** — flip it on for a smarter, more thorough model; off for fast and cheap.
- **Hide** collapses the panel to just the top bar. Drag Laka AI around by the **top pill**. Quit from **Settings → Quit Laka AI** or with `⌘` `⇧` `X`.

The panel is see-through and click-through — the empty space around it never blocks the app behind it.

---

## How it works (under the hood)

Laka AI is an [Electron](https://www.electronjs.org/) app. Everything runs locally except the calls to your chosen AI provider.

**The three inputs are kept completely separate:**
- **Screen** — captured with Electron's `desktopCapturer` (full-resolution screenshots, taken only when a feature needs one).
- **Your mic ("You")** — `getUserMedia` → downsampled to 16 kHz audio → transcribed.
- **Meeting audio ("Them")** — on macOS, a user-selected BlackHole/Loopback virtual input; on Windows, Electron's system-output loopback. It is kept on its own channel so Laka AI knows *who* said what.

Both audio streams are transcribed (Groq Whisper, OpenAI Whisper, Gemini, or local Faster-Whisper) and fed, with an optional screenshot, to your AI model. Responses **stream** into the panel word-by-word.

The app uses macOS content protection where available, but this is not a privacy or concealment guarantee. Treat every screen share and recording as if Laka AI could be visible.

```
main process ──┬─ overlay window (frameless, transparent, always-on-top, content-protected)
               ├─ screenshot capture (desktopCapturer)
               ├─ speech-to-text (Groq / Whisper / Gemini / Faster-Whisper) ── "You" + "Them" channels
               └─ LLM streaming (Groq / OpenAI / Anthropic / Gemini)
renderer ──────┴─ the glass UI + mic capture + platform-safe meeting-audio input
```

---

## Troubleshooting

**"It says give access, but I already gave access."**
You may have granted an older build. Replacing a locally built app can make macOS stop honoring an old grant (the checkmark can linger). Toggle Laka AI **off and on** in System Settings → Screen Recording, or remove and re-add it.

**A feature returns "403" / "no access to model."**
Your API key is restricted. Most often it's an OpenAI **project key that only allows chat models** — it works for screen/coding help but 403s on transcription (Whisper). Fix: enable audio/Whisper on the key, use an unrestricted key, or add a Gemini key (Laka AI falls back to it for transcription).

**Listening does nothing / no transcript.**
Check Settings shows a transcription-capable key (Groq Whisper, OpenAI Whisper, or Gemini). On macOS, choose BlackHole or Loopback in Settings → Meeting audio and ensure Meet output is routed to the Multi-Output Device; microphone permission alone cannot capture remote audio.

**Gemini says quota exceeded / 429.**
The Gemini free-tier request window is exhausted. Laka AI turns this into a clear retry message and uses Groq automatically when a Groq key is configured. Otherwise wait for the displayed retry time or use a paid provider.

**Laka AI shows up in a screen share.**
This is expected behavior on some capture paths. Do not rely on the app being excluded from any screen share or recording.

**"Laka AI is damaged and can't be opened."**
Right-click the local app bundle and choose **Open**, or build it again with `npm run pack`.

---

## Privacy

- No accounts, no servers, no telemetry. Laka AI collects nothing.
- Your API keys are encrypted in macOS Keychain; `laka-ai-data.json` holds only encrypted values and non-secret preferences.
- Screenshots and audio are sent to your AI provider only when a feature runs, and are not stored by Laka AI beyond the current session's transcript (kept in memory).
- When enabled, Faster-Whisper runs locally on your Mac and processes temporary audio files only for the duration of transcription.

## Contributing

Issues and PRs welcome. Laka AI is intentionally small and readable — `main.js` (app + capture + AI), `renderer/` (the UI), `src/` (providers). No build step for the source (plain HTML/CSS/JS).

### Platform Support
- [x] **macOS** (Fully Supported)
- [x] **Windows** (Fully Supported)
- [ ] **Linux** (Untested)

### Features Open for Contribution
- [ ] Upgrade audio capture pipeline for zero-latency streaming
- [ ] Add optional Deepgram support for ultra-fast transcription

## Credits & license

Built as an open-source study of how tools like **Cluely** and **Interview Coder** work. Modeled on the open-source clones `pickle-com/glass` and `sohzm/cheating-daddy`.

**License: [GPL-3.0-or-later](LICENSE).**
