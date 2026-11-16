# Password Manager -- Project Instructions

## Overview

Client-side password manager with AES-256-GCM encrypted vault, configurable policies, password generation, and Google Drive cloud sync via SafePlace. Zero runtime dependencies -- pure HTML/CSS/JS with Google Identity Services loaded for cloud sync.

## Architecture

```
index.html    -- lock screen + app UI (tabs: Generator, Accounts, Policy)
app.js        -- vault crypto, policy, generation, account CRUD, export/import, cloud sync
style.css     -- dark theme styling
CLAUDE.md     -- this file
README.md     -- user-facing documentation
```

## Key Design Decisions

- **No build step** -- plain ES5-compatible JS, no bundler, no transpiler. Runs directly in the browser.
- **No npm dependencies** -- all crypto via Web Crypto API (`crypto.subtle`), no packages.
- **localStorage only** -- all data persisted in browser localStorage. Each device has independent storage.
- **Encrypted at rest** -- passwords encrypted with AES-256-GCM before writing to localStorage or export files.
- **Cloud sync via Google Drive** -- uses SafePlace pattern (Google OAuth2 + Drive API). Folder structure: `SafePlace/password-manager/vault-backup.json`.

## Cloud Sync Config

The Google Drive sync is configured at the top of `app.js`:

```javascript
var SAFE_PLACE_CLIENT_ID = '805871064081-6uh6ghboi12sd4p5vn26cmalfh48lgaj.apps.googleusercontent.com';
var SAFE_PLACE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
var SAFE_PLACE_APP_NAME = 'password-manager';
var SAFE_PLACE_FILE_NAME = 'vault-backup.json';
```

The `SafePlaceStorage` class (ES5 prototype-based) wraps the Google Drive API. Same pattern as the `safe-place` and `music-player` projects.

## Security Notes

- `crypto.subtle` requires a secure context (HTTPS or localhost). The app won't work over `file://`.
- Master passphrase minimum: 8 characters. PBKDF2 with 100k iterations, SHA-256.
- Google OAuth scope is `drive.file` -- can only access files the app created, not the entire Drive.
- Export/cloud backup files contain only ciphertext -- safe to store anywhere.

## Testing

No automated tests. Manual testing only -- open in browser via local server:

```bash
npx serve
# or
python -m http.server 8080
```

## Conventions

- ES5 syntax (`var`, `function`, no arrow functions, no `let`/`const`) for maximum browser compatibility.
- Promise chains (no `async`/`await`) for the same reason.
- All DOM manipulation via vanilla JS -- no frameworks.
- `SafePlaceStorage` uses ES5 prototype pattern (not `class`) to match the rest of the codebase.
