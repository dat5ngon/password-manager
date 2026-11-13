# Password Manager

A client-side password manager with configurable policies, password generation, and account tracking. All data is stored in your browser's `localStorage` -- nothing is sent to any server.

## Features

- **Password Generator** -- cryptographically secure random passwords using `crypto.getRandomValues()`
- **Editable Password Policy** -- max/min age, min length, complexity, history count
- **Password Complexity** -- enforces 3 of 4 character categories (uppercase, lowercase, digits, special)
- **Account Name Restriction** -- passwords cannot contain the account name or parts of it
- **Password History** -- last N passwords cannot be reused (default: 5)
- **Password Age Tracking** -- shows expired/expiring badges per account
- **Minimum Password Age** -- prevents changing passwords too frequently
- **Strength Meter** -- visual indicator of password strength
- **Export/Import** -- backup and restore data as JSON
- **Mobile-friendly** -- responsive design, works on phones and tablets

## Default Policy

| Setting | Default |
|---------|---------|
| Maximum password age | 180 days |
| Minimum password age | 2 days |
| Minimum password length | 16 characters |
| Password complexity | Required (3 of 4 categories) |
| Password history | Last 5 cannot be reused |

## Local Usage

Open `index.html` directly in any browser. No server needed.

## Mobile Access via GitHub Pages (Free)

To access from your phone without buying a domain:

1. Create a GitHub repository (e.g. `password-manager`)
2. Push these 3 files to the repo:
   ```
   git init
   git add index.html style.css app.js
   git commit -m "Password manager app"
   git remote add origin https://github.com/YOUR_USERNAME/password-manager.git
   git push -u origin main
   ```
3. Go to **Settings > Pages** in your GitHub repo
4. Set Source to **Deploy from a branch**, select `main`, folder `/`, click Save
5. Your app will be live at: `https://YOUR_USERNAME.github.io/password-manager/`
6. On your phone, open that URL and **Add to Home Screen** for app-like access

**Important:** Since this is a public GitHub Pages site, the app itself is public -- but your passwords are stored only in YOUR browser's localStorage and never leave your device. Each device has its own separate data. Use Export/Import to sync between devices.

## Security Notes

- All data stays in your browser's `localStorage` -- nothing is transmitted
- Password generation uses `crypto.getRandomValues()` (cryptographically secure)
- No external dependencies -- zero network requests
- Export files contain plaintext passwords -- store them securely
- Each browser/device has independent data storage
