# Password Manager -- Project Instructions

## Overview

Client-side password manager with AES-256-GCM encrypted vault, configurable policies, password generation, and GitHub Pages cloud sync. Zero dependencies -- pure HTML/CSS/JS.

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
- **No external dependencies** -- all crypto via Web Crypto API (`crypto.subtle`), no npm packages.
- **localStorage only** -- all data persisted in browser localStorage. Each device has independent storage.
- **Encrypted at rest** -- passwords encrypted with AES-256-GCM before writing to localStorage or export files.
- **Cloud sync via GitHub API** -- pushes/pulls encrypted vault backup to `01-projects/safe-place` repo. GitHub token stored in localStorage (`pm_github_token`).

## Cloud Sync Config

The GitHub repo target is configured at the top of `app.js`:

```javascript
var GITHUB_REPO_OWNER = '01-projects';
var GITHUB_REPO_NAME = 'safe-place';
var GITHUB_BACKUP_FILE = 'vault-backup.json';
var GITHUB_BRANCH = 'main';
```

## Security Notes

- `crypto.subtle` requires a secure context (HTTPS or localhost). The app won't work over `file://`.
- Master passphrase minimum: 8 characters. PBKDF2 with 100k iterations, SHA-256.
- GitHub token needs `repo` scope for push access. Stored in localStorage, only sent to `api.github.com`.
- Export/cloud backup files contain only ciphertext -- safe to store in public repos.

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
