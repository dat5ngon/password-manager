// ── Defaults ──
var DEFAULT_POLICY = { maxAge:180, minAge:2, minLength:16, complexity:true, historyCount:5, autoLockMinutes:5 };

// ── Google Drive cloud sync config (SafePlace) ──
var SAFE_PLACE_CLIENT_ID = '805871064081-6uh6ghboi12sd4p5vn26cmalfh48lgaj.apps.googleusercontent.com';
var SAFE_PLACE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
var SAFE_PLACE_APP_NAME = 'password-manager';
var SAFE_PLACE_FILE_NAME = 'vault-backup.json';

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
  initSyncAuth();
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
//  SafePlace Cloud Sync (Google Drive)
//  Uses the SafePlace storage pattern from safe-place project.
//  Google OAuth2 for auth, Google Drive API for file storage.
//  Folder structure: SafePlace/password-manager/vault-backup.json
// ══════════════════════════════════════════════════════════════

// SafePlaceStorage -- Google Drive wrapper (ES5, adapted from safe-place project)
function SafePlaceStorage(accessToken, rootFolderId) {
  this.accessToken = accessToken;
  this.rootFolderId = rootFolderId;
}

SafePlaceStorage.prototype._api = function(path, options) {
  options = options || {};
  var url = path.indexOf('http') === 0 ? path : 'https://www.googleapis.com/drive/v3' + path;
  var headers = Object.assign({}, { 'Authorization': 'Bearer ' + this.accessToken }, options.headers || {});
  var fetchOpts = Object.assign({}, options, { headers: headers });
  return fetch(url, fetchOpts).then(function(res) {
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        var msg = (err.error && err.error.message) ? err.error.message : 'Drive API error: ' + res.status;
        return Promise.reject(new Error(msg));
      });
    }
    return res;
  });
};

SafePlaceStorage.prototype.getOrCreateFolder = function(name, parentId) {
  parentId = parentId || this.rootFolderId;
  var self = this;
  var query = "name='" + name + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  return this._api('/files?q=' + encodeURIComponent(query) + '&fields=files(id,name)').then(function(res) {
    return res.json();
  }).then(function(data) {
    if (data.files && data.files.length > 0) return data.files[0];
    return self._api('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    }).then(function(createRes) { return createRes.json(); });
  });
};

SafePlaceStorage.prototype.getAppFolder = function(appName) {
  return this.getOrCreateFolder(appName, this.rootFolderId);
};

SafePlaceStorage.prototype.findFile = function(name, folderId) {
  folderId = folderId || this.rootFolderId;
  var query = "name='" + name + "' and '" + folderId + "' in parents and trashed=false";
  return this._api('/files?q=' + encodeURIComponent(query) + '&fields=files(id,name,size,modifiedTime,mimeType)').then(function(res) {
    return res.json();
  }).then(function(data) {
    return (data.files && data.files.length > 0) ? data.files[0] : null;
  });
};

SafePlaceStorage.prototype.uploadData = function(name, data, mimeType, folderId) {
  folderId = folderId || this.rootFolderId;
  var form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: name, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([data], { type: mimeType }));
  return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + this.accessToken },
    body: form
  }).then(function(res) {
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        var msg = (err.error && err.error.message) ? err.error.message : 'Upload failed: ' + res.status;
        return Promise.reject(new Error(msg));
      });
    }
    return res.json();
  });
};

SafePlaceStorage.prototype.downloadJSON = function(fileId) {
  return this._api('/files/' + fileId + '?alt=media').then(function(res) {
    return res.json();
  });
};

SafePlaceStorage.prototype.deleteFile = function(fileId) {
  return fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + this.accessToken }
  });
};

// ── Sync state ──
var syncTokenClient = null;
var syncStorage = null;
var syncAppFolderId = null;

function initSyncAuth() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    setTimeout(initSyncAuth, 300);
    return;
  }
  syncTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: SAFE_PLACE_CLIENT_ID,
    scope: SAFE_PLACE_SCOPES,
    callback: handleSyncAuthResponse
  });
  var btn = document.getElementById('syncSignInBtn');
  if (btn) btn.disabled = false;
}

function handleSyncAuthResponse(response) {
  if (response.error) {
    setSyncStatus('Sign-in failed: ' + response.error, true);
    return;
  }
  syncStorage = new SafePlaceStorage(response.access_token, null);
  syncStorage.getOrCreateFolder('SafePlace', 'root').then(function(rootFolder) {
    syncStorage.rootFolderId = rootFolder.id;
    return syncStorage.getAppFolder(SAFE_PLACE_APP_NAME);
  }).then(function(appFolder) {
    syncAppFolderId = appFolder.id;
    // Show sync buttons, hide sign-in
    document.getElementById('syncSignInBtn').classList.add('hidden');
    document.getElementById('cloudExportBtn').classList.remove('hidden');
    document.getElementById('cloudImportBtn').classList.remove('hidden');
    document.getElementById('syncSignOutBtn').classList.remove('hidden');
    setSyncStatus('Connected');
  }).catch(function(err) {
    setSyncStatus('Error: ' + (err.message || err), true);
  });
}

function handleSyncSignIn() {
  if (!syncTokenClient) {
    setSyncStatus('Google API loading...', true);
    return;
  }
  syncTokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSyncSignOut() {
  if (syncStorage && syncStorage.accessToken) {
    google.accounts.oauth2.revoke(syncStorage.accessToken);
  }
  syncStorage = null;
  syncAppFolderId = null;
  document.getElementById('syncSignInBtn').classList.remove('hidden');
  document.getElementById('cloudExportBtn').classList.add('hidden');
  document.getElementById('cloudImportBtn').classList.add('hidden');
  document.getElementById('syncSignOutBtn').classList.add('hidden');
  setSyncStatus('');
}

// Push encrypted backup to Google Drive
function cloudExport() {
  if (!syncStorage || !syncAppFolderId) {
    setSyncStatus('Not connected', true);
    return;
  }
  if (!cryptoKey) {
    showToast('Vault must be unlocked to export', 'error');
    return;
  }

  var btn = document.getElementById('cloudExportBtn');
  btn.disabled = true;
  setSyncStatus('Exporting...');

  var data = buildExportPayload();
  var content = JSON.stringify(data, null, 2);

  // Delete existing file first to avoid duplicates
  syncStorage.findFile(SAFE_PLACE_FILE_NAME, syncAppFolderId).then(function(existing) {
    if (existing) return syncStorage.deleteFile(existing.id);
    return Promise.resolve();
  }).then(function() {
    return syncStorage.uploadData(SAFE_PLACE_FILE_NAME, content, 'application/json', syncAppFolderId);
  }).then(function() {
    setSyncStatus('Exported ' + accounts.length + ' accounts');
    showToast('Vault exported to Google Drive', 'success');
  }).catch(function(err) {
    setSyncStatus('Export failed: ' + (err.message || err), true);
  }).then(function() {
    btn.disabled = false;
  });
}

// Pull encrypted backup from Google Drive
function cloudImport() {
  if (!syncStorage || !syncAppFolderId) {
    setSyncStatus('Not connected', true);
    return;
  }
  if (!cryptoKey) {
    showToast('Vault must be unlocked to import', 'error');
    return;
  }

  var btn = document.getElementById('cloudImportBtn');
  btn.disabled = true;
  setSyncStatus('Importing...');

  syncStorage.findFile(SAFE_PLACE_FILE_NAME, syncAppFolderId).then(function(file) {
    if (!file) {
      setSyncStatus('No backup found', true);
      return Promise.reject(new Error('No backup found on Google Drive'));
    }
    return syncStorage.downloadJSON(file.id);
  }).then(function(data) {
    return applyImportData(data).then(function() {
      setSyncStatus('Imported ' + accounts.length + ' accounts');
      showToast('Vault imported from Google Drive (' + accounts.length + ' accounts)', 'success');
    });
  }).catch(function(err) {
    var msg = err.message || 'Import failed';
    if (msg === 'Import cancelled') showToast(msg, 'warning');
    else if (msg !== 'No backup found on Google Drive') setSyncStatus('Import failed: ' + msg, true);
  }).then(function() {
    btn.disabled = false;
  });
}

function setSyncStatus(msg, isError) {
  var el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--text-muted)';
  if (msg && !isError) {
    setTimeout(function() {
      if (el.textContent === msg) el.textContent = '';
    }, 4000);
  }
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