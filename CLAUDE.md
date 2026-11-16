# Password Manager — Project Instructions

## Overview

Client-side password manager with AES-256-GCM encrypted vault, configurable policies, password generation, and Google Drive cloud sync via SafePlace iframe + postMessage. Zero runtime dependencies — pure HTML/CSS/JS with no external scripts.

## Architecture

```
index.html    -- lock screen + app UI (tabs: Generator, Accounts, Policy), hidden SafePlace iframe
app.js        -- vault crypto, policy, generation, account CRUD, export/import via SafePlace
style.css     -- dark theme styling
CLAUDE.md     -- this file
README.md     -- user-facing documentation
```

## Key Design Decisions

- **No build step** — plain ES5-compatible JS, no bundler, no transpiler. Runs directly in the browser.
- **No npm dependencies** — all crypto via Web Crypto API (`crypto.subtle`), no packages.
- **localStorage only** — all data persisted in browser localStorage. Each device has independent storage.
- **Encrypted at rest** — passwords encrypted with AES-256-GCM before writing to localStorage or export.
- **No OAuth in this app** — Google Drive sync uses a hidden SafePlace iframe + postMessage. The user must sign in to SafePlace separately. No Google Identity Services script loaded.

## Google Drive Sync (via SafePlace iframe + postMessage)

The password manager embeds `https://dat5ngon.github.io/safe-place/` in a hidden iframe and communicates via `postMessage` to save/load encrypted vault backups.

### postMessage protocol

```javascript
// Request:  { type: 'safeplace-request', id, action, ...params }
// Response: { type: 'safeplace-response', id, ok, ...data }

// Actions:
//   save  — { app: 'password-manager', filename: 'vault-backup.json', data: {...} }
//   load  — { app: 'password-manager', filename: 'vault-backup.json' }
//   ping  — check if user is authenticated
```

Data is stored on Google Drive at `SafePlace/password-manager/vault-backup.json`.

### How export/import work

- **Export to Google Drive**: The existing `buildExportPayload()` builds the encrypted backup object. Instead of downloading as a file, it sends the payload to SafePlace via `safePlaceRequest('save', ...)`.
- **Import from Google Drive**: Calls `safePlaceRequest('load', ...)` to get the backup, then passes it to `applyImportData()`.
- **Auth errors**: If SafePlace is not authenticated, a modal dialog appears with an "Open Safe Place" button that opens SafePlace in a new tab for sign-in.

### Config

```javascript
var SAFE_PLACE_ORIGIN = 'https://dat5ngon.github.io';
var SAFE_PLACE_APP = 'password-manager';
var SAFE_PLACE_FILE = 'vault-backup.json';
```

## Security Notes

- `crypto.subtle` requires a secure context (HTTPS or localhost). The app won't work over `file://`.
- Master passphrase minimum: 8 characters. PBKDF2 with 100k iterations, SHA-256.
- Export/cloud backup files contain only ciphertext — safe to store anywhere.
- The SafePlace iframe runs on the same origin (`dat5ngon.github.io`), so postMessage is restricted to same-origin only.

## Testing

No automated tests. Manual testing only — open in browser via local server:

```bash
npx serve
# or
python -m http.server 8080
```

**Note**: Google Drive sync only works when both apps are on the same origin (`https://dat5ngon.github.io`). For local testing, you'd need both safe-place and password-manager served from the same local origin.

## Conventions

- ES5 syntax (`var`, `function`, no arrow functions, no `let`/`const`) for maximum browser compatibility.
- Promise chains (no `async`/`await`) for the same reason.
- All DOM manipulation via vanilla JS — no frameworks.
- `safePlaceRequest()` uses the same postMessage pattern as the music-player project.
