# Releasing Laka AI

Laka AI is a local Electron desktop application. It is distributed as a signed macOS download; it is not hosted as a web application and does not require a backend for normal use.

## One-time GitHub setup

1. Create an Apple Developer account and a **Developer ID Application** certificate.
2. Export that certificate as a password-protected `.p12`, base64-encode it, and add these GitHub Actions secrets:
   - `CSC_LINK`: base64-encoded `.p12` certificate.
   - `CSC_KEY_PASSWORD`: certificate export password.
   - `APPLE_ID`: Apple ID used for notarization.
   - `APPLE_APP_SPECIFIC_PASSWORD`: app-specific Apple ID password.
   - `APPLE_TEAM_ID`: Apple Developer Team ID.
3. Push this repository to GitHub and enable Actions.

## Publish

1. Update `version` in `package.json` and run `npm ci && npm test`.
2. Commit and push the release changes.
3. Create and push a matching tag, for example `v0.1.1`.
4. The **Release macOS** GitHub Action signs, notarizes, packages, and attaches the ZIP to the GitHub Release.

Users download the ZIP, move **Laka AI.app** to `/Applications`, and launch that same installed app on later runs. Keeping a stable signed app identity avoids unnecessary macOS permission prompts.

## Before publishing

- Confirm `npm test`, `npm audit --audit-level=high`, and `npm run pack` pass.
- Test fresh install, Keychain key persistence, local-profile/resume restoration, and microphone/screen recording prompts on a clean macOS account.
- Do not put provider API keys, resume data, certificates, or Apple credentials in the repository or release assets.
