# Password Manager

A client-side password manager with encrypted vault, configurable policies, password generation, and account tracking. All data is stored in your browser's `localStorage` -- nothing is sent to any server.

## Features

- **Encrypted Vault** -- all passwords encrypted at rest with AES-256-GCM using a master passphrase
- **Master Passphrase** -- PBKDF2 key derivation (100,000 iterations, SHA-256) protects your vault
- **Auto-Lock** -- configurable inactivity timeout (default: 5 minutes) automatically locks the vault
- **Change Passphrase** -- re-encrypt all data with a new master passphrase via the Policy tab
- **Password Generator** -- cryptographically secure random passwords using `crypto.getRandomValues()`
- **Editable Password Policy** -- max/min age, min length, complexity, history count, auto-lock timeout
- **Password Complexity** -- enforces 3 of 4 character categories (uppercase, lowercase, digits, special)
- **Account Name Restriction** -- passwords cannot contain the account name or parts of it
- **Password History** -- last N passwords cannot be reused (default: 5)
- **Password Age Tracking** -- shows expired/expiring badges per account
- **Minimum Password Age** -- prevents changing passwords too frequently
- **Strength Meter** -- visual indicator of password strength
- **Export/Import** -- backup and restore data as encrypted JSON (requires passphrase to import)
- **Cloud Sync** -- push/pull encrypted vault to GitHub Pages (`01-projects/safe-place`) for cross-device sync
- **Mobile-friendly** -- responsive design, works on phones and tablets

## Default Policy

| Setting | Default |
|---------|---------|
| Maximum password age | 180 days |
| Minimum password age | 2 days |
| Minimum password length | 16 characters |
| Password complexity | Required (3 of 4 categories) |
| Password history | Last 5 cannot be reused |
| Auto-lock timeout | 5 minutes (0 = disabled) |

## Local Usage

The app requires a secure context (HTTPS or localhost) for the Web Crypto API. Serve it via a local HTTP server:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then open `http://localhost:8080` in your browser.

**Note:** Opening `index.html` directly via `file://` will not work -- `crypto.subtle` is unavailable in that context.

## Mobile Access via GitHub Pages (Free)

To access from your phone without buying a domain:

1. Create a GitHub repository (e.g. `password-manager`)
2. Push these files to the repo:
   ```
   git init
   git add index.html style.css app.js README.md
   git commit -m "Password manager app"
   git remote add origin https://github.com/YOUR_USERNAME/password-manager.git
   git push -u origin main
   ```
3. Go to **Settings > Pages** in your GitHub repo
4. Set Source to **Deploy from a branch**, select `main`, folder `/`, click Save
5. Your app will be live at: `https://YOUR_USERNAME.github.io/password-manager/`
6. On your phone, open that URL and **Add to Home Screen** for app-like access

GitHub Pages serves over HTTPS, so the Web Crypto API works out of the box.

**Important:** The app itself is publicly accessible, but your passwords are encrypted with your master passphrase and stored only in YOUR browser's localStorage. They never leave your device. Each device has its own separate data. Use Export/Import or Cloud Sync to sync between devices.

## Cloud Sync (GitHub Pages)

Sync your encrypted vault across devices using a GitHub repository as cloud storage.

### Setup

1. Create a GitHub repo named `safe-place` under your account/org (e.g. `01-projects/safe-place`)
2. Enable GitHub Pages on the repo (Settings > Pages > Deploy from branch `main`, folder `/`)
3. Generate a [Personal Access Token](https://github.com/settings/tokens/new?scopes=repo&description=password-manager-sync) with `repo` scope
4. In the app, go to **Policy > Cloud Sync > Settings** and paste your token

### Usage

- **Push to cloud** -- uploads your encrypted vault to `vault-backup.json` in the repo
- **Pull from cloud** -- downloads and imports the backup (prompts for the backup's master passphrase if different from current)
- The backup file is served via GitHub Pages at `https://01-projects.github.io/safe-place/vault-backup.json`

### How it works

1. **Push**: the app builds an encrypted backup payload (same format as file export) and uploads it to the repo via the GitHub Contents API
2. **Pull**: the app fetches the backup from GitHub Pages (public) or the API (private repos), then decrypts and imports it
3. All passwords in the backup are AES-256-GCM encrypted -- the GitHub repo only ever contains ciphertext
4. The GitHub token is stored in `localStorage` (`pm_github_token`) and never leaves your browser except in API calls to `api.github.com`

### Configuration

The repo owner and name are set in [`app.js`](app.js:5):

```javascript
var GITHUB_REPO_OWNER = '01-projects';
var GITHUB_REPO_NAME = 'safe-place';
```

Change these if your repo is at a different location.

## Security

- **Encryption**: AES-256-GCM with a key derived from your master passphrase via PBKDF2 (100k iterations, SHA-256)
- **No plaintext passwords** in localStorage, export files, or cloud backups -- everything is encrypted at rest
- **Auto-lock** wipes the decryption key from memory after configurable inactivity
- **Password generation** uses `crypto.getRandomValues()` (cryptographically secure PRNG)
- **Zero dependencies** -- no external libraries, minimal network requests (only for cloud sync)
- **Export files** contain encrypted passwords -- require the master passphrase to import
- **Cloud sync** uploads only encrypted data -- your GitHub repo never contains plaintext passwords
- **Each browser/device** has independent data storage

## Architecture

```
index.html    -- lock screen + app UI
app.js        -- vault crypto, policy, generation, account CRUD, export/import
style.css     -- dark theme styling
```

### Vault Flow

1. **First visit**: user creates a master passphrase (min 8 chars)
2. A random 16-byte salt is generated and stored in `localStorage` (`pm_salt`)
3. PBKDF2 derives an AES-256 key from passphrase + salt
4. A verification token (encrypted sentinel string) is stored (`pm_verify`)
5. All account passwords are encrypted before writing to `localStorage` (`pm_accounts`)
6. On reload: user enters passphrase, sentinel is decrypted to verify, then accounts are decrypted into memory
7. Auto-lock timer wipes the in-memory key after inactivity
