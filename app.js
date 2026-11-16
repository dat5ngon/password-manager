// ── Defaults ──
var DEFAULT_POLICY = { maxAge:180, minAge:2, minLength:16, complexity:true, historyCount:5, autoLockMinutes:5 };

// ── GitHub Pages cloud sync config ──
var GITHUB_REPO_OWNER = '01-projects';
var GITHUB_REPO_NAME = 'safe-place';
var GITHUB_BACKUP_FILE = 'vault-backup.json';
var GITHUB_BRANCH = 'main';

// ── Word lists for memorable passwords ──
var ADVERBS = [
  'always','almost','barely','boldly','bravely','briskly','calmly','clearly',
  'closely','coldly','daily','deeply','easily','evenly','fairly','finally',
  'firmly','freely','fully','gently','gladly','greatly','hardly','highly',
  'honestly','hugely','justly','keenly','kindly','largely','lately','lightly',
  'likely','lively','lonely','loudly','mainly','merely','mostly','namely',
  'nearly','neatly','nicely','nobly','oddly','often','only','openly',
  'partly','poorly','purely','quickly','quietly','rarely','really','richly',
  'rightly','roughly','sadly','safely','seldom','sharply','simply','slowly',
  'smoothly','softly','solely','sorely','steeply','sternly','still','strongly',
  'surely','sweetly','swiftly','thinly','tightly','totally','truly','vastly',
  'warmly','weakly','widely','wildly','wisely'
];

var ADJECTIVES = [
  'active','ancient','angry','bitter','blind','bold','brave','bright',
  'broken','busy','calm','cheap','clean','clever','close','cold',
  'common','cool','crazy','cruel','dark','dead','deep','dense',
  'dirty','double','dry','dull','eager','early','empty','equal',
  'evil','exact','extra','faint','false','famous','fancy','fast',
  'fatal','fierce','final','firm','flat','foreign','formal','fragile',
  'fresh','frozen','gentle','giant','global','golden','grand','grave',
  'green','gross','guilty','happy','harsh','heavy','hidden','hollow',
  'honest','hostile','humble','hungry','ideal','inner','intense','iron',
  'joint','junior','keen','large','legal','light','linear','liquid',
  'lively','lonely','loose','lovely','lucky','magic','major','mental',
  'mighty','minor','mobile','modern','moral','narrow','native','noble',
  'normal','novel','obvious','orange','outer','painful','pale','passive',
  'perfect','plain','plastic','pleasant','polite','popular','pretty','primary',
  'private','proper','proud','public','purple','quiet','random','rapid',
  'remote','rigid','rising','robust','rocky','rough','royal','rural',
  'sacred','secure','senior','severe','shadow','shallow','sharp','shiny',
  'silent','silver','simple','single','smooth','social','solar','solid',
  'stable','steady','steep','sticky','stiff','stormy','strong','subtle',
  'sudden','super','sweet','swift','tender','thick','tight','tiny',
  'tough','tricky','triple','unique','upper','urban','useful','vacant',
  'valid','verbal','violet','visual','vital','vivid','vocal','warm',
  'weekly','weird','wicked','wooden','worthy','yellow','young','zealous'
];

var NOUNS = [
  'anchor','badge','basket','beacon','blade','bridge','bucket','bundle',
  'cabin','candle','canyon','castle','cedar','chapel','cherry','cipher',
  'circle','cliff','cloud','cobalt','comet','copper','coral','corner',
  'cradle','creek','crest','crown','crystal','dagger','desert','diamond',
  'dragon','eagle','ember','engine','falcon','feather','fence','flame',
  'forest','fossil','fountain','garden','glacier','globe','goblet','granite',
  'hammer','harbor','helmet','horizon','hunter','island','ivory','jacket',
  'jasper','jungle','kernel','knight','ladder','lantern','lemon','leopard',
  'locket','magnet','mantle','marble','meadow','mirror','monkey','mosaic',
  'nebula','needle','nickel','oasis','ocean','orchid','osprey','oyster',
  'paddle','palace','panther','parrot','pasture','pebble','pepper','phoenix',
  'pillar','planet','plaster','pocket','portal','prism','puzzle','python',
  'quartz','rabbit','raven','ribbon','riddle','rocket','saddle','salmon',
  'sandal','scepter','shadow','shield','signal','silver','socket','spider',
  'spirit','spruce','stable','summit','sunset','temple','thistle','thunder',
  'timber','token','tower','tunnel','turtle','valley','velvet','vessel',
  'violet','vortex','walnut','whisper','widget','willow','window','winter',
  'wizard','zenith','zephyr'
];

// Leet-speak substitution map
var LEET_MAP = {
  's': '$', 'e': '3', 'o': '0', 'g': '9',
  'a': '@', 'i': '!', 'S': '$', 'H': '#'
};

// Verification sentinel -- encrypted with the master key to verify passphrase
var VERIFY_SENTINEL = 'pm-vault-ok-2026';

var policy = loadPolicy();
var accounts = [];
var cryptoKey = null; // AES-GCM key derived from master passphrase, held in memory only
var autoLockTimer = null; // inactivity timer ID

// ══════════════════════════════════════════════════════════════
//  Crypto helpers (PBKDF2 + AES-GCM)
// ══════════════════════════════════════════════════════════════

function deriveKey(passphrase, salt) {
  var enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    .then(function(baseKey) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
}

function encryptText(plaintext, key) {
  var enc = new TextEncoder();
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext))
    .then(function(cipherBuf) {
      var combined = new Uint8Array(iv.length + cipherBuf.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cipherBuf), iv.length);
      return arrayToBase64(combined);
    });
}

function decryptText(base64, key) {
  var bytes = base64ToArray(base64);
  var iv = bytes.slice(0, 12);
  var ciphertext = bytes.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext)
    .then(function(plainBuf) {
      return new TextDecoder().decode(plainBuf);
    });
}

function arrayToBase64(arr) {
  var binary = '';
  for (var i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToArray(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ══════════════════════════════════════════════════════════════
//  Vault setup, unlock, lock
// ══════════════════════════════════════════════════════════════

function isVaultSetup() {
  return localStorage.getItem('pm_salt') !== null && localStorage.getItem('pm_verify') !== null;
}

function setupVault(passphrase) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var saltB64 = arrayToBase64(salt);
  return deriveKey(passphrase, salt).then(function(key) {
    return encryptText(VERIFY_SENTINEL, key).then(function(verifyToken) {
      localStorage.setItem('pm_salt', saltB64);
      localStorage.setItem('pm_verify', verifyToken);
      cryptoKey = key;
      return migrateExistingAccounts();
    });
  });
}

function unlockVault(passphrase) {
  var saltB64 = localStorage.getItem('pm_salt');
  var verifyToken = localStorage.getItem('pm_verify');
  if (!saltB64 || !verifyToken) return Promise.reject(new Error('Vault not set up'));
  var salt = base64ToArray(saltB64);
  return deriveKey(passphrase, salt).then(function(key) {
    return decryptText(verifyToken, key).then(function(plain) {
      if (plain !== VERIFY_SENTINEL) return Promise.reject(new Error('Wrong passphrase'));
      cryptoKey = key;
      return loadAndDecryptAccounts();
    });
  });
}

function encryptPassword(pw) {
  if (!cryptoKey) return Promise.reject(new Error('Vault locked'));
  return encryptText(pw, cryptoKey);
}

function decryptPassword(encPw) {
  if (!cryptoKey) return Promise.reject(new Error('Vault locked'));
  return decryptText(encPw, cryptoKey);
}

// Load raw account data from localStorage and decrypt all password fields
function loadAndDecryptAccounts() {
  var raw;
  try {
    var s = localStorage.getItem('pm_accounts');
    raw = s ? JSON.parse(s) : [];
  } catch(e) {
    raw = [];
  }
  if (raw.length === 0) { accounts = []; return Promise.resolve(); }

  var promises = raw.map(function(a) {
    var pwPromise = a.password
      ? decryptPassword(a.password).catch(function() { return a.password; })
      : Promise.resolve('');
    var histPromises = (a.passwordHistory || []).map(function(h) {
      return h.password
        ? decryptPassword(h.password).catch(function() { return h.password; })
        : Promise.resolve('');
    });
    return Promise.all([pwPromise, Promise.all(histPromises)]).then(function(results) {
      a.password = results[0];
      var decryptedHist = results[1];
      (a.passwordHistory || []).forEach(function(h, idx) {
        h.password = decryptedHist[idx];
      });
      return a;
    });
  });

  return Promise.all(promises).then(function(decrypted) {
    accounts = decrypted;
  });
}

// Encrypt all password fields and persist to localStorage
function persistAccounts() {
  if (!cryptoKey) return Promise.resolve();

  var promises = accounts.map(function(a) {
    var copy = Object.assign({}, a);
    var pwPromise = encryptPassword(a.password);
    var histPromises = (a.passwordHistory || []).map(function(h) {
      return encryptPassword(h.password).then(function(enc) {
        return { password: enc, date: h.date };
      });
    });
    return Promise.all([pwPromise, Promise.all(histPromises)]).then(function(results) {
      copy.password = results[0];
      copy.passwordHistory = results[1];
      return copy;
    });
  });

  return Promise.all(promises).then(function(encrypted) {
    localStorage.setItem('pm_accounts', JSON.stringify(encrypted));
  });
}

// Migrate plaintext accounts (pre-vault) to encrypted
function migrateExistingAccounts() {
  var raw;
  try {
    var s = localStorage.getItem('pm_accounts');
    raw = s ? JSON.parse(s) : [];
  } catch(e) {
    raw = [];
  }
  if (raw.length === 0) return Promise.resolve();

  // Heuristic: encrypted passwords are long base64 strings (>40 chars)
  var firstPw = raw[0].password || '';
  if (firstPw.length > 40 && /^[A-Za-z0-9+/=]+$/.test(firstPw)) {
    return loadAndDecryptAccounts();
  }

  // Plaintext -- load into memory then re-persist encrypted
  accounts = raw;
  return persistAccounts();
}

// ══════════════════════════════════════════════════════════════
//  Lock screen
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  // crypto.subtle requires a secure context (HTTPS or localhost)
  if (!crypto.subtle) {
    document.getElementById('lock-screen').style.display = 'flex';
    document.getElementById('app-main').style.display = 'none';
    document.getElementById('lock-error').textContent =
      'Encryption requires HTTPS or localhost. Serve this page via a local server (e.g. npx serve) or access via localhost.';
    document.getElementById('lock-btn').disabled = true;
    return;
  }
  showLockScreen();

  // Listen for cross-tab events via localStorage changes.
  window.addEventListener('storage', function(e) {
    // Another tab created the vault while this tab shows "Create" screen
    if (e.key === 'pm_salt' && e.newValue && !cryptoKey) {
      showLockScreen();
    }
    // Another tab locked the vault -- lock this tab too
    if (e.key === 'pm_locked' && e.newValue && cryptoKey) {
      lockVault(true); // silent = true, don't re-broadcast
      showToast('Vault locked from another tab', 'warning');
    }
  });
});

function showLockScreen() {
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('app-main').style.display = 'none';

  var setup = isVaultSetup();
  var title = document.getElementById('lock-title');
  var subtitle = document.getElementById('lock-subtitle');
  var input = document.getElementById('lock-passphrase');
  var confirmGroup = document.getElementById('lock-confirm-group');
  var confirmInput = document.getElementById('lock-confirm');
  var btn = document.getElementById('lock-btn');
  var error = document.getElementById('lock-error');

  if (setup) {
    title.textContent = 'Unlock Vault';
    subtitle.textContent = 'Enter your master passphrase to access your passwords.';
    confirmGroup.style.display = 'none';
    btn.textContent = 'unlock';
  } else {
    title.textContent = 'Create Master Passphrase';
    subtitle.textContent = 'Set a master passphrase to encrypt all stored passwords. Do not forget it, there is no recovery.';
    confirmGroup.style.display = 'block';
    btn.textContent = 'create vault';
  }

  input.value = '';
  if (confirmInput) confirmInput.value = '';
  error.textContent = '';
  setTimeout(function() { input.focus(); }, 100);
}

function submitLockScreen() {
  var input = document.getElementById('lock-passphrase');
  var confirmInput = document.getElementById('lock-confirm');
  var error = document.getElementById('lock-error');
  var btn = document.getElementById('lock-btn');
  var passphrase = input.value;

  if (!passphrase) { error.textContent = 'Passphrase is required.'; return; }
  if (passphrase.length < 8) { error.textContent = 'Passphrase must be at least 8 characters.'; return; }

  btn.disabled = true;
  btn.textContent = 'working...';
  error.textContent = '';

  if (isVaultSetup()) {
    unlockVault(passphrase).then(function() {
      onVaultUnlocked();
    }).catch(function(err) {
      error.textContent = 'Wrong passphrase. Try again.';
      console.error('Unlock failed:', err);
      btn.disabled = false;
      btn.textContent = 'unlock';
      input.value = '';
      input.focus();
    });
  } else {
    // Guard: re-check if another tab created the vault while this tab was on the "Create" screen
    if (isVaultSetup()) {
      error.textContent = 'A vault was already created (possibly in another tab). Switching to unlock.';
      btn.disabled = false;
      showLockScreen();
      return;
    }
    if (passphrase !== confirmInput.value) {
      error.textContent = 'Passphrases do not match.';
      btn.disabled = false;
      btn.textContent = 'create vault';
      return;
    }
    setupVault(passphrase).then(function() {
      onVaultUnlocked();
    }).catch(function(err) {
      error.textContent = 'Failed to create vault: ' + (err.message || err);
      console.error('Setup failed:', err);
      btn.disabled = false;
      btn.textContent = 'create vault';
    });
  }
}

function onLockKeydown(e) {
  if (e.key === 'Enter') submitLockScreen();
}

function onVaultUnlocked() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app-main').style.display = 'block';

  populatePolicyForm();
  renderAccounts();
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'accounts') renderAccounts();
    });
  });
  startAutoLockTimer();
}

function lockVault(silent) {
  stopAutoLockTimer();
  cryptoKey = null;
  accounts = [];
  // Broadcast lock to other tabs (unless this was triggered by a storage event)
  if (!silent) {
    localStorage.setItem('pm_locked', Date.now().toString());
  }
  showLockScreen();
}

// ── Auto-lock on inactivity ──
function startAutoLockTimer() {
  stopAutoLockTimer();
  var minutes = policy.autoLockMinutes;
  if (!minutes || minutes <= 0) return; // 0 = disabled
  autoLockTimer = setTimeout(function() {
    if (cryptoKey) {
      lockVault();
      showToast('Vault locked due to inactivity', 'warning');
    }
  }, minutes * 60 * 1000);
  // Reset timer on user activity
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function(evt) {
    document.addEventListener(evt, resetAutoLockTimer, { passive: true });
  });
}

function resetAutoLockTimer() {
  if (!cryptoKey) return; // vault already locked
  stopAutoLockTimer();
  startAutoLockTimer();
}

function stopAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function(evt) {
    document.removeEventListener(evt, resetAutoLockTimer);
  });
}

// ── Change master passphrase (modal dialog) ──
function showChangePassphraseDialog() {
  var html = '<h2>Change Master Passphrase</h2>' +
    '<p style="color:var(--text-dim);font-size:12px;margin-bottom:16px;">Re-encrypts all stored passwords with a new passphrase.</p>' +
    '<div class="form-group"><label>Current Passphrase</label>' +
      '<input type="password" id="change-current-pass" placeholder="Enter current passphrase..." autocomplete="off"></div>' +
    '<div class="form-group"><label>New Passphrase</label>' +
      '<input type="password" id="change-new-pass" placeholder="Min 8 characters..." autocomplete="off"></div>' +
    '<div class="form-group"><label>Confirm New Passphrase</label>' +
      '<input type="password" id="change-confirm-pass" placeholder="Confirm new passphrase..." autocomplete="off"></div>' +
    '<div id="change-pass-error" style="color:var(--red);font-size:13px;min-height:20px;margin-bottom:8px;"></div>' +
    '<div class="btn-group">' +
      '<button class="btn btn-primary" onclick="changePassphrase()">change passphrase</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">cancel</button>' +
    '</div>';
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
  setTimeout(function() { document.getElementById('change-current-pass').focus(); }, 100);
}

function changePassphrase() {
  var errorEl = document.getElementById('change-pass-error');
  var currentPass = document.getElementById('change-current-pass').value;
  var newPass = document.getElementById('change-new-pass').value;
  var confirmPass = document.getElementById('change-confirm-pass').value;

  errorEl.textContent = '';
  if (!currentPass) { errorEl.textContent = 'Current passphrase is required.'; return; }
  if (!newPass) { errorEl.textContent = 'New passphrase is required.'; return; }
  if (newPass.length < 8) { errorEl.textContent = 'New passphrase must be at least 8 characters.'; return; }
  if (newPass !== confirmPass) { errorEl.textContent = 'New passphrases do not match.'; return; }

  var saltB64 = localStorage.getItem('pm_salt');
  var verifyToken = localStorage.getItem('pm_verify');
  var salt = base64ToArray(saltB64);

  deriveKey(currentPass, salt).then(function(oldKey) {
    return decryptText(verifyToken, oldKey).then(function(plain) {
      if (plain !== VERIFY_SENTINEL) return Promise.reject(new Error('Wrong passphrase'));
      var newSalt = crypto.getRandomValues(new Uint8Array(16));
      var newSaltB64 = arrayToBase64(newSalt);
      return deriveKey(newPass, newSalt).then(function(newKey) {
        return encryptText(VERIFY_SENTINEL, newKey).then(function(newVerify) {
          localStorage.setItem('pm_salt', newSaltB64);
          localStorage.setItem('pm_verify', newVerify);
          cryptoKey = newKey;
          return persistAccounts();
        });
      });
    });
  }).then(function() {
    closeModal();
    showToast('Master passphrase changed successfully', 'success');
  }).catch(function(err) {
    errorEl.textContent = 'Current passphrase is incorrect.';
    console.error('Change passphrase failed:', err);
  });
}

// ══════════════════════════════════════════════════════════════
//  Policy storage (not encrypted -- no secrets)
// ══════════════════════════════════════════════════════════════

function loadPolicy() {
  try { var s = localStorage.getItem('pm_policy'); return s ? Object.assign({}, DEFAULT_POLICY, JSON.parse(s)) : Object.assign({}, DEFAULT_POLICY); }
  catch(e) { return Object.assign({}, DEFAULT_POLICY); }
}

function savePolicy() {
  policy = {
    maxAge: parseInt(document.getElementById('policy-max-age').value) || DEFAULT_POLICY.maxAge,
    minAge: parseInt(document.getElementById('policy-min-age').value) || DEFAULT_POLICY.minAge,
    minLength: Math.max(8, parseInt(document.getElementById('policy-min-length').value) || DEFAULT_POLICY.minLength),
    complexity: document.getElementById('policy-complexity').checked,
    historyCount: parseInt(document.getElementById('policy-history').value) || DEFAULT_POLICY.historyCount,
    autoLockMinutes: parseInt(document.getElementById('policy-auto-lock').value) || 0
  };
  localStorage.setItem('pm_policy', JSON.stringify(policy));
  // Restart auto-lock timer with new setting
  if (cryptoKey) startAutoLockTimer();
  showToast('Policy saved', 'success');
}

function resetPolicy() {
  policy = Object.assign({}, DEFAULT_POLICY);
  localStorage.setItem('pm_policy', JSON.stringify(policy));
  populatePolicyForm();
  showToast('Policy reset to defaults', 'success');
}

function populatePolicyForm() {
  document.getElementById('policy-max-age').value = policy.maxAge;
  document.getElementById('policy-min-age').value = policy.minAge;
  document.getElementById('policy-min-length').value = policy.minLength;
  document.getElementById('policy-history').value = policy.historyCount;
  document.getElementById('policy-complexity').checked = policy.complexity;
  document.getElementById('policy-auto-lock').value = policy.autoLockMinutes;
}

// ══════════════════════════════════════════════════════════════
//  Password Generation
// ══════════════════════════════════════════════════════════════

function generatePassword() {
  var accountName = document.getElementById('gen-account').value.trim();
  var pw = '', attempts = 0;
  while (attempts < 200) {
    pw = buildPassword(policy.minLength);
    var v = validatePassword(pw, accountName, []);
    if (v.valid) break;
    attempts++;
  }
  document.getElementById('save-password').value = pw;
  if (accountName && !document.getElementById('save-account').value) {
    document.getElementById('save-account').value = accountName;
  }
  updateStrength(pw);
  updateChecks(pw, accountName);
}

function onPasswordInput() {
  var pw = document.getElementById('save-password').value;
  var acct = document.getElementById('gen-account').value.trim() ||
             document.getElementById('save-account').value.trim();
  if (pw) {
    updateStrength(pw);
    updateChecks(pw, acct);
  }
}

function buildPassword(len) {
  var adverb = ADVERBS[rng(ADVERBS.length)];
  var adjective = ADJECTIVES[rng(ADJECTIVES.length)];
  var noun = NOUNS[rng(NOUNS.length)];

  adverb = adverb.charAt(0).toUpperCase() + adverb.slice(1);
  adjective = adjective.charAt(0).toUpperCase() + adjective.slice(1);
  noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  var base = adverb + adjective + noun;

  var SPECIAL_LEET = { 's':'$', 'a':'@', 'i':'!', 'S':'$', 'H':'#' };
  var DIGIT_LEET = { 'e':'3', 'o':'0', 'g':'9' };

  var leetKeys = Object.keys(LEET_MAP);
  var arr = base.split('');
  var hasSpecial = false;
  var hasDigit = false;

  for (var i = 0; i < arr.length; i++) {
    if (leetKeys.indexOf(arr[i]) !== -1 && rng(100) < 40) {
      arr[i] = LEET_MAP[arr[i]];
      if (SPECIAL_LEET[base.charAt(i)] !== undefined) hasSpecial = true;
      if (DIGIT_LEET[base.charAt(i)] !== undefined) hasDigit = true;
    }
  }

  if (!hasSpecial) {
    var specEligible = [];
    for (var j = 0; j < arr.length; j++) {
      if (SPECIAL_LEET[base.charAt(j)] !== undefined && arr[j] === base.charAt(j)) {
        specEligible.push(j);
      }
    }
    if (specEligible.length > 0) {
      var pick = specEligible[rng(specEligible.length)];
      arr[pick] = SPECIAL_LEET[base.charAt(pick)];
    }
  }

  if (!hasDigit) {
    var digEligible = [];
    for (var k = 0; k < arr.length; k++) {
      if (DIGIT_LEET[base.charAt(k)] !== undefined && arr[k] === base.charAt(k)) {
        digEligible.push(k);
      }
    }
    if (digEligible.length > 0) {
      var pick2 = digEligible[rng(digEligible.length)];
      arr[pick2] = DIGIT_LEET[base.charAt(pick2)];
    }
  }

  var pw = arr.join('');
  var digits = '0123456789';
  while (pw.length < len) {
    pw += digits[rng(digits.length)];
  }
  return pw;
}

function rng(max) {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

function copyPassword() {
  var pw = document.getElementById('save-password').value;
  if (!pw) { showToast('Generate a password first', 'warning'); return; }
  navigator.clipboard.writeText(pw).then(function() { showToast('Copied to clipboard', 'success'); });
}

// ══════════════════════════════════════════════════════════════
//  Validation
// ══════════════════════════════════════════════════════════════

function validatePassword(password, accountName, history) {
  var errors = [];
  if (password.length < policy.minLength)
    errors.push('Must be at least ' + policy.minLength + ' characters (currently ' + password.length + ')');

  if (accountName && accountName.length >= 3) {
    var nl = accountName.toLowerCase(), pl = password.toLowerCase();
    var parts = nl.split(/[.\-_@\s]+/).filter(function(p){ return p.length >= 3; });
    if (pl.indexOf(nl) !== -1) errors.push('Cannot contain the account name');
    for (var i = 0; i < parts.length; i++) {
      if (pl.indexOf(parts[i]) !== -1) errors.push('Cannot contain part of account name ("' + parts[i] + '")');
    }
  }

  if (policy.complexity) {
    if (countCats(password) < 3)
      errors.push('Must use at least 3 of 4 categories: uppercase, lowercase, digits, special');
  }

  if (history && history.length > 0) {
    var recent = history.slice(-policy.historyCount).map(function(h){ return h.password; });
    if (recent.indexOf(password) !== -1)
      errors.push('Was used recently (last ' + policy.historyCount + ' cannot be reused)');
  }
  return { valid: errors.length === 0, errors: errors };
}

function countCats(pw) {
  var c = 0;
  if (/[A-Z]/.test(pw)) c++;
  if (/[a-z]/.test(pw)) c++;
  if (/[0-9]/.test(pw)) c++;
  if (/[^A-Za-z0-9]/.test(pw)) c++;
  return c;
}

function validateManualPassword() {
  var pw = document.getElementById('save-password').value;
  var acct = document.getElementById('save-account').value.trim() || document.getElementById('save-username').value.trim();
  if (!pw) { showToast('Enter a password first', 'warning'); return; }
  var existing = accounts.find(function(a){ return a.name.toLowerCase() === (document.getElementById('save-account').value||'').toLowerCase(); });
  var hist = existing ? existing.passwordHistory : [];
  var r = validatePassword(pw, acct, hist);
  if (r.valid) {
    showToast('Password meets all policy requirements', 'success');
  } else {
    showToast(r.errors[0], 'error');
  }
  updateStrength(pw);
  updateChecks(pw, acct);
}

// ══════════════════════════════════════════════════════════════
//  Strength Meter
// ══════════════════════════════════════════════════════════════

function updateStrength(pw) {
  var fill = document.getElementById('strength-fill');
  var label = document.getElementById('strength-label');
  var score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (pw.length >= 24) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  var unique = new Set(pw).size;
  if (pw.length > 0 && unique / pw.length > 0.7) score++;
  if (pw.length > 0 && unique / pw.length > 0.9) score++;
  var pct = Math.min(100, score * 10);
  var color, text;
  if (pct < 30) { color='#ef4444'; text='Weak'; }
  else if (pct < 50) { color='#f59e0b'; text='Fair'; }
  else if (pct < 70) { color='#eab308'; text='Good'; }
  else if (pct < 90) { color='#22c55e'; text='Strong'; }
  else { color='#10b981'; text='Excellent'; }
  fill.style.width = pct + '%';
  fill.style.background = color;
  label.textContent = text;
  label.style.color = color;
}

function updateChecks(pw, accountName) {
  var checks = [
    { label:'Uppercase (A-Z)', pass:/[A-Z]/.test(pw) },
    { label:'Lowercase (a-z)', pass:/[a-z]/.test(pw) },
    { label:'Digits (0-9)', pass:/[0-9]/.test(pw) },
    { label:'Special (!@#$...)', pass:/[^A-Za-z0-9]/.test(pw) },
    { label:'Min length (' + policy.minLength + ')', pass:pw.length >= policy.minLength }
  ];
  if (accountName && accountName.length >= 3) {
    var nl = accountName.toLowerCase(), pl = pw.toLowerCase();
    var parts = nl.split(/[.\-_@\s]+/).filter(function(p){ return p.length >= 3; });
    var nameOk = pl.indexOf(nl) === -1;
    for (var i = 0; i < parts.length && nameOk; i++) {
      if (pl.indexOf(parts[i]) !== -1) nameOk = false;
    }
    checks.push({ label:'No account name', pass:nameOk });
  }
  var html = '';
  for (var j = 0; j < checks.length; j++) {
    var c = checks[j];
    html += '<div class="check-item ' + (c.pass ? 'pass' : 'fail') + '">' +
      '<span class="check-icon"></span>' +
      escHtml(c.label) + '</div>';
  }
  document.getElementById('complexity-checks').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//  Account CRUD
// ══════════════════════════════════════════════════════════════

function saveAccount() {
  var name = document.getElementById('save-account').value.trim();
  var user = document.getElementById('save-username').value.trim();
  var pw = document.getElementById('save-password').value;
  if (!name) { showToast('Account name is required', 'error'); return; }
  if (!pw) { showToast('Password is required', 'error'); return; }

  var existing = accounts.find(function(a){ return a.name.toLowerCase() === name.toLowerCase(); });
  var hist = existing ? existing.passwordHistory : [];

  var v = validatePassword(pw, user || name, hist);
  if (!v.valid) {
    showToast(v.errors[0], 'error');
    document.getElementById('save-validation').innerHTML =
      '<div style="color:var(--red);font-size:13px;margin-top:8px;">' +
      v.errors.map(function(e){ return '&#10060; ' + escHtml(e); }).join('<br>') + '</div>';
    return;
  }

  if (existing && existing.lastChanged) {
    var daysSince = (Date.now() - existing.lastChanged) / 86400000;
    if (daysSince < policy.minAge) {
      showToast('Password changed too recently (min ' + policy.minAge + ' days between changes)', 'error');
      return;
    }
  }

  var now = Date.now();
  if (existing) {
    existing.username = user;
    existing.password = pw;
    existing.lastChanged = now;
    existing.passwordHistory.push({ password: pw, date: now });
    if (existing.passwordHistory.length > policy.historyCount + 5) {
      existing.passwordHistory = existing.passwordHistory.slice(-policy.historyCount - 5);
    }
  } else {
    accounts.push({
      id: now.toString(36) + rng(9999).toString(36),
      name: name, username: user, password: pw,
      created: now, lastChanged: now,
      passwordHistory: [{ password: pw, date: now }]
    });
  }
  persistAccounts();
  showToast('Account "' + name + '" saved', 'success');
  document.getElementById('save-account').value = '';
  document.getElementById('save-username').value = '';
  document.getElementById('save-password').value = '';
  document.getElementById('save-validation').innerHTML = '';
  renderAccounts();
}

function deleteAccount(id) {
  if (!confirm('Delete this account permanently?')) return;
  accounts = accounts.filter(function(a){ return a.id !== id; });
  persistAccounts();
  closeModal();
  renderAccounts();
  showToast('Account deleted', 'success');
}

// ── Render Accounts ──
function renderAccounts() {
  var container = document.getElementById('accounts-list');
  var searchEl = document.getElementById('search-accounts');
  var search = searchEl ? searchEl.value.toLowerCase() : '';
  var filtered = accounts.filter(function(a) {
    return a.name.toLowerCase().indexOf(search) !== -1 ||
           (a.username && a.username.toLowerCase().indexOf(search) !== -1);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#128274;</div>' +
      (accounts.length === 0 ? '<p>No accounts yet. Generate and save a password to get started.</p>' :
       '<p>No accounts match your search.</p>') + '</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var a = filtered[i];
    var age = getPasswordAge(a);
    var badgeClass, badgeText;
    if (age.days > policy.maxAge) { badgeClass = 'badge-expired'; badgeText = 'Expired (' + age.days + 'd)'; }
    else if (age.days > policy.maxAge * 0.8) { badgeClass = 'badge-warn'; badgeText = 'Expiring (' + age.days + 'd)'; }
    else { badgeClass = 'badge-ok'; badgeText = age.days + 'd old'; }

    html += '<div class="account-item" onclick="showAccountDetail(\'' + a.id + '\')">' +
      '<div class="account-info">' +
        '<div class="account-name">' + escHtml(a.name) + '</div>' +
        '<div class="account-user">' + escHtml(a.username || 'No username') + '</div>' +
      '</div>' +
      '<div class="account-meta">' +
        '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

function getPasswordAge(account) {
  var ms = Date.now() - (account.lastChanged || account.created);
  return { days: Math.floor(ms / 86400000), ms: ms };
}

// ── Account Detail Modal ──
function showAccountDetail(id) {
  var a = accounts.find(function(x){ return x.id === id; });
  if (!a) return;

  var age = getPasswordAge(a);
  var daysLeft = policy.maxAge - age.days;
  var statusHtml;
  if (daysLeft <= 0) statusHtml = '<span style="color:var(--red);">EXPIRED ' + Math.abs(daysLeft) + ' days ago</span>';
  else if (daysLeft <= Math.ceil(policy.maxAge * 0.2)) statusHtml = '<span style="color:var(--amber);">Expires in ' + daysLeft + ' days</span>';
  else statusHtml = '<span style="color:var(--accent-light);">' + daysLeft + ' days remaining</span>';

  var masked = a.password.replace(/./g, '\u2022');

  var histHtml = '';
  if (a.passwordHistory && a.passwordHistory.length > 0) {
    histHtml = '<ul class="history-list">';
    var hist = a.passwordHistory.slice().reverse();
    for (var i = 0; i < hist.length; i++) {
      var h = hist[i];
      var maskedH = h.password.substring(0, 3) + h.password.substring(3).replace(/./g, '\u2022');
      histHtml += '<li class="history-item">' +
        '<span class="history-pw">' + escHtml(maskedH) + '</span>' +
        '<span class="history-date">' + formatDate(h.date) + '</span>' +
      '</li>';
    }
    histHtml += '</ul>';
  } else {
    histHtml = '<p style="color:var(--text-muted);font-size:13px;">No history</p>';
  }

  var html = '<h2>' + escHtml(a.name) + '</h2>' +
    '<div class="form-group"><label>Username / Email</label>' +
      '<div style="padding:8px 0;font-size:14px;">' + escHtml(a.username || 'N/A') + '</div></div>' +
    '<div class="form-group"><label>Password</label>' +
      '<div class="password-display" style="font-size:14px;">' +
        '<span class="pw-text" id="modal-pw" data-visible="false" data-pw="' + escAttr(a.password) + '">' + masked + '</span>' +
        '<div class="btn-group">' +
          '<button class="btn btn-sm btn-outline" onclick="toggleModalPw()">&#128065;</button>' +
          '<button class="btn btn-sm btn-outline" onclick="copyModalPw()">&#128203;</button>' +
        '</div>' +
      '</div></div>' +
    '<div class="form-group"><label>Password Age</label>' +
      '<div style="padding:4px 0;font-size:14px;">' + age.days + ' days -- ' + statusHtml + '</div></div>' +
    '<div class="form-group"><label>Created</label>' +
      '<div style="padding:4px 0;font-size:13px;color:var(--text-muted);">' + formatDate(a.created) + '</div></div>' +
    '<div class="form-group"><label>Last Changed</label>' +
      '<div style="padding:4px 0;font-size:13px;color:var(--text-muted);">' + formatDate(a.lastChanged) + '</div></div>' +
    '<div class="form-group"><label>Password History (' + (a.passwordHistory ? a.passwordHistory.length : 0) + ' entries)</label>' +
      histHtml + '</div>' +
    '<div class="btn-group" style="margin-top:16px;">' +
      '<button class="btn btn-primary btn-sm" onclick="changePasswordFor(\'' + a.id + '\')">&#128260; Change Password</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteAccount(\'' + a.id + '\')">&#128465; Delete</button>' +
      '<button class="btn btn-outline btn-sm" onclick="closeModal()">Close</button>' +
    '</div>';

  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function toggleModalPw() {
  var el = document.getElementById('modal-pw');
  var pw = el.getAttribute('data-pw');
  if (el.getAttribute('data-visible') === 'true') {
    el.textContent = pw.replace(/./g, '\u2022');
    el.setAttribute('data-visible', 'false');
  } else {
    el.textContent = pw;
    el.setAttribute('data-visible', 'true');
  }
}

function copyModalPw() {
  var pw = document.getElementById('modal-pw').getAttribute('data-pw');
  navigator.clipboard.writeText(pw).then(function() { showToast('Password copied', 'success'); });
}

function changePasswordFor(id) {
  closeModal();
  var a = accounts.find(function(x){ return x.id === id; });
  if (!a) return;
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
  document.querySelector('[data-tab="generator"]').classList.add('active');
  document.getElementById('tab-generator').classList.add('active');
  document.getElementById('gen-account').value = a.username || a.name;
  document.getElementById('save-account').value = a.name;
  document.getElementById('save-username').value = a.username || '';
  generatePassword();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function closeModalOnBackdrop(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ── Export / Import ──

// Build the encrypted backup payload (reused by file export and cloud sync)
function buildExportPayload() {
  var rawAccounts;
  try {
    var s = localStorage.getItem('pm_accounts');
    rawAccounts = s ? JSON.parse(s) : [];
  } catch(e) {
    rawAccounts = [];
  }
  return {
    policy: policy,
    accounts: rawAccounts,
    encrypted: true,
    salt: localStorage.getItem('pm_salt'),
    verify: localStorage.getItem('pm_verify'),
    exportDate: new Date().toISOString()
  };
}

// Import decrypted backup data into the vault (reused by file import and cloud sync)
function applyImportData(data) {
  if (!data.accounts) return Promise.reject(new Error('Invalid file format'));

  if (data.encrypted && data.salt && data.verify) {
    var passphrase = prompt('Enter the master passphrase used when this backup was created:');
    if (!passphrase) return Promise.reject(new Error('Import cancelled'));

    var salt = base64ToArray(data.salt);
    return deriveKey(passphrase, salt).then(function(importKey) {
      return decryptText(data.verify, importKey).then(function(plain) {
        if (plain !== VERIFY_SENTINEL) return Promise.reject(new Error('Wrong passphrase'));
        var promises = data.accounts.map(function(a) {
          var pwP = a.password ? decryptText(a.password, importKey).catch(function() { return a.password; }) : Promise.resolve('');
          var histP = (a.passwordHistory || []).map(function(h) {
            return h.password ? decryptText(h.password, importKey).catch(function() { return h.password; }) : Promise.resolve('');
          });
          return Promise.all([pwP, Promise.all(histP)]).then(function(r) {
            a.password = r[0];
            (a.passwordHistory || []).forEach(function(h, idx) { h.password = r[1][idx]; });
            return a;
          });
        });
        return Promise.all(promises).then(function(decrypted) {
          accounts = decrypted;
          return persistAccounts();
        }).then(function() {
          if (data.policy) {
            policy = Object.assign({}, DEFAULT_POLICY, data.policy);
            localStorage.setItem('pm_policy', JSON.stringify(policy));
            populatePolicyForm();
          }
          renderAccounts();
        });
      });
    });
  } else {
    accounts = data.accounts;
    return persistAccounts().then(function() {
      if (data.policy) {
        policy = Object.assign({}, DEFAULT_POLICY, data.policy);
        localStorage.setItem('pm_policy', JSON.stringify(policy));
        populatePolicyForm();
      }
      renderAccounts();
    });
  }
}

function exportData() {
  var data = buildExportPayload();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'password-manager-backup-' + new Date().toISOString().slice(0,10) + '.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data exported (passwords encrypted)', 'success');
}

function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      applyImportData(data).then(function() {
        showToast('Data imported (' + accounts.length + ' accounts)', 'success');
      }).catch(function(err) {
        var msg = err.message || 'Import failed';
        if (msg === 'Import cancelled') showToast(msg, 'warning');
        else showToast(msg, 'error');
      });
    } catch(err) {
      showToast('Invalid file format', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ══════════════════════════════════════════════════════════════
//  GitHub Pages Cloud Sync
//  Pushes/pulls encrypted vault backup to a GitHub repo via API.
//  The repo (e.g. 01-projects/safe-place) can serve the file
//  via GitHub Pages for read access without a token.
// ══════════════════════════════════════════════════════════════

function getGitHubToken() {
  return localStorage.getItem('pm_github_token') || '';
}

function saveGitHubToken(token) {
  if (token) {
    localStorage.setItem('pm_github_token', token);
  } else {
    localStorage.removeItem('pm_github_token');
  }
}

function getGitHubApiUrl() {
  return 'https://api.github.com/repos/' + GITHUB_REPO_OWNER + '/' + GITHUB_REPO_NAME + '/contents/' + GITHUB_BACKUP_FILE;
}

function getGitHubPagesUrl() {
  return 'https://' + GITHUB_REPO_OWNER + '.github.io/' + GITHUB_REPO_NAME + '/' + GITHUB_BACKUP_FILE;
}

// Push encrypted backup to GitHub repo
function cloudExport() {
  var token = getGitHubToken();
  if (!token) {
    showToast('Set your GitHub token first (Policy > Cloud Sync)', 'error');
    return;
  }
  if (!cryptoKey) {
    showToast('Vault must be unlocked to export', 'error');
    return;
  }

  var data = buildExportPayload();
  var content = JSON.stringify(data, null, 2);
  // GitHub API requires base64-encoded content
  var b64Content = btoa(unescape(encodeURIComponent(content)));

  showToast('Uploading to GitHub...', 'warning');

  // First, check if file already exists (need its SHA to update)
  fetch(getGitHubApiUrl(), {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github.v3+json'
    }
  }).then(function(resp) {
    if (resp.ok) return resp.json();
    if (resp.status === 404) return null;
    return resp.json().then(function(err) {
      return Promise.reject(new Error(err.message || 'GitHub API error ' + resp.status));
    });
  }).then(function(existing) {
    var body = {
      message: 'vault backup ' + new Date().toISOString(),
      content: b64Content,
      branch: GITHUB_BRANCH
    };
    if (existing && existing.sha) {
      body.sha = existing.sha; // required for updates
    }
    return fetch(getGitHubApiUrl(), {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.json().then(function(err) {
        return Promise.reject(new Error(err.message || 'Upload failed'));
      });
    }
    showToast('Backup pushed to GitHub', 'success');
  }).catch(function(err) {
    showToast('Cloud export failed: ' + (err.message || err), 'error');
  });
}

// Pull encrypted backup from GitHub (tries Pages URL first, falls back to API)
function cloudImport() {
  if (!cryptoKey) {
    showToast('Vault must be unlocked to import', 'error');
    return;
  }

  showToast('Fetching from GitHub...', 'warning');

  // Try GitHub Pages URL first (works for public repos, no token needed)
  var pagesUrl = getGitHubPagesUrl() + '?t=' + Date.now(); // cache-bust
  fetch(pagesUrl).then(function(resp) {
    if (resp.ok) return resp.text();
    // Fall back to API (works for private repos with token)
    var token = getGitHubToken();
    if (!token) return Promise.reject(new Error('File not found on GitHub Pages and no token set'));
    return fetch(getGitHubApiUrl(), {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json'
      }
    }).then(function(apiResp) {
      if (!apiResp.ok) return Promise.reject(new Error('GitHub API error ' + apiResp.status));
      return apiResp.json().then(function(fileData) {
        // API returns base64-encoded content
        return decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
      });
    });
  }).then(function(text) {
    var data = JSON.parse(text);
    return applyImportData(data).then(function() {
      showToast('Cloud import complete (' + accounts.length + ' accounts)', 'success');
    });
  }).catch(function(err) {
    var msg = err.message || 'Cloud import failed';
    if (msg === 'Import cancelled') showToast(msg, 'warning');
    else showToast('Cloud import failed: ' + msg, 'error');
  });
}

// Show GitHub token configuration dialog
function showCloudSyncDialog() {
  var currentToken = getGitHubToken();
  var masked = currentToken ? currentToken.substring(0, 8) + '...' + currentToken.slice(-4) : 'Not set';
  var pagesUrl = getGitHubPagesUrl();

  var html = '<h2>&#9729; Cloud Sync Settings</h2>' +
    '<p style="color:var(--text-dim);font-size:12px;margin-bottom:16px;">' +
      'Sync your encrypted vault to <strong>' + escHtml(GITHUB_REPO_OWNER + '/' + GITHUB_REPO_NAME) + '</strong> via GitHub.' +
    '</p>' +
    '<div class="form-group"><label>GitHub Personal Access Token</label>' +
      '<input type="password" id="github-token-input" placeholder="ghp_xxxxxxxxxxxx" value="' + escAttr(currentToken) + '" autocomplete="off">' +
      '<p style="color:var(--text-muted);font-size:11px;margin-top:4px;">Needs <code>repo</code> scope. ' +
        '<a href="https://github.com/settings/tokens/new?scopes=repo&description=password-manager-sync" target="_blank" ' +
        'style="color:var(--accent);">Create token</a></p>' +
    '</div>' +
    '<div class="form-group"><label>Status</label>' +
      '<div style="padding:4px 0;font-size:13px;color:var(--text-muted);">Token: ' + escHtml(masked) + '</div>' +
      '<div style="padding:4px 0;font-size:11px;color:var(--text-muted);">Pages URL: <a href="' + escAttr(pagesUrl) + '" target="_blank" style="color:var(--accent);word-break:break-all;">' + escHtml(pagesUrl) + '</a></div>' +
    '</div>' +
    '<div class="btn-group" style="margin-top:16px;">' +
      '<button class="btn btn-primary" onclick="saveCloudToken()">save token</button>' +
      '<button class="btn btn-outline" onclick="clearCloudToken()">clear token</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">close</button>' +
    '</div>';

  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function saveCloudToken() {
  var token = document.getElementById('github-token-input').value.trim();
  if (!token) { showToast('Token is required', 'error'); return; }
  saveGitHubToken(token);
  closeModal();
  showToast('GitHub token saved', 'success');
}

function clearCloudToken() {
  saveGitHubToken('');
  closeModal();
  showToast('GitHub token cleared', 'success');
}

function clearAllData() {
  if (!confirm('Delete ALL accounts, vault, and reset policy? This cannot be undone.')) return;
  accounts = [];
  cryptoKey = null;
  policy = Object.assign({}, DEFAULT_POLICY);
  localStorage.removeItem('pm_accounts');
  localStorage.removeItem('pm_policy');
  localStorage.removeItem('pm_salt');
  localStorage.removeItem('pm_verify');
  populatePolicyForm();
  renderAccounts();
  showToast('All data cleared', 'success');
  showLockScreen();
}

// ── Utilities ──
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(ts) {
  if (!ts) return 'N/A';
  var d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function showToast(msg, type) {
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + (type || '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}