// ── Defaults ──
var DEFAULT_POLICY = { maxAge:180, minAge:2, minLength:16, complexity:true, historyCount:5 };

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

// Leet-speak substitution map: original char -> replacement
var LEET_MAP = {
  's': '$', 'e': '3', 'o': '0', 'g': '9',
  'a': '@', 'i': '!', 'S': '$', 'H': '#'
};

var policy = loadPolicy();
var accounts = loadAccounts();

// ── Init ──
document.addEventListener('DOMContentLoaded', function() {
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
});

// ── Storage ──
function loadPolicy() {
  try { var s = localStorage.getItem('pm_policy'); return s ? Object.assign({}, DEFAULT_POLICY, JSON.parse(s)) : Object.assign({}, DEFAULT_POLICY); }
  catch(e) { return Object.assign({}, DEFAULT_POLICY); }
}
function loadAccounts() {
  try { var s = localStorage.getItem('pm_accounts'); return s ? JSON.parse(s) : []; }
  catch(e) { return []; }
}
function persistAccounts() { localStorage.setItem('pm_accounts', JSON.stringify(accounts)); }

function savePolicy() {
  policy = {
    maxAge: parseInt(document.getElementById('policy-max-age').value) || DEFAULT_POLICY.maxAge,
    minAge: parseInt(document.getElementById('policy-min-age').value) || DEFAULT_POLICY.minAge,
    minLength: Math.max(8, parseInt(document.getElementById('policy-min-length').value) || DEFAULT_POLICY.minLength),
    complexity: document.getElementById('policy-complexity').checked,
    historyCount: parseInt(document.getElementById('policy-history').value) || DEFAULT_POLICY.historyCount
  };
  localStorage.setItem('pm_policy', JSON.stringify(policy));
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
}

// ── Password Generation ──
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

// Called when user types in the password field manually
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
  // Pick one word from each category
  var adverb = ADVERBS[rng(ADVERBS.length)];
  var adjective = ADJECTIVES[rng(ADJECTIVES.length)];
  var noun = NOUNS[rng(NOUNS.length)];

  // Capitalize first letter of each word
  adverb = adverb.charAt(0).toUpperCase() + adverb.slice(1);
  adjective = adjective.charAt(0).toUpperCase() + adjective.slice(1);
  noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  // Combine: AdverbAdjectiveNoun
  var base = adverb + adjective + noun;

  // Separate leet chars into special-producing and digit-producing
  var SPECIAL_LEET = { 's':'$', 'a':'@', 'i':'!', 'S':'$', 'H':'#' };
  var DIGIT_LEET = { 'e':'3', 'o':'0', 'g':'9' };

  var leetKeys = Object.keys(LEET_MAP);
  var arr = base.split('');
  var hasSpecial = false;
  var hasDigit = false;

  // Apply leet-speak substitutions randomly (~40% chance per eligible char)
  for (var i = 0; i < arr.length; i++) {
    if (leetKeys.indexOf(arr[i]) !== -1 && rng(100) < 40) {
      arr[i] = LEET_MAP[arr[i]];
      if (SPECIAL_LEET[base.charAt(i)] !== undefined) hasSpecial = true;
      if (DIGIT_LEET[base.charAt(i)] !== undefined) hasDigit = true;
    }
  }

  // Guarantee at least one special-char substitution
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

  // Guarantee at least one digit substitution
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

  // If still shorter than required length, append random digits
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

// ── Validation ──
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

// ── Strength Meter ──
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

// ── Account CRUD ──
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
  // Switch to generator tab and pre-fill
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

function showAboutDialog() {
  var html = '<h2>About</h2>' +
    '<div class="about-section">' +
      '<h3>Credit</h3>' +
      '<p>&copy; dat5ngon 2026</p>' +
      '<p style="color:var(--text-dim);font-size:12px;margin-top:4px;">A lightweight, zero-dependency password manager that runs entirely in your browser.</p>' +
    '</div>' +
    '<div class="about-section">' +
      '<h3>Security Notes</h3>' +
      '<ul>' +
        '<li>All data stays in your browser\'s localStorage -- nothing is transmitted to any server</li>' +
        '<li>Password generation uses <code style="font-family:JetBrains Mono,monospace;font-size:12px;color:var(--accent-light);background:var(--surface2);padding:1px 5px;border-radius:3px;">crypto.getRandomValues()</code> (cryptographically secure)</li>' +
        '<li>No external dependencies -- zero network requests after page load</li>' +
        '<li>Export files contain plaintext passwords -- store them securely</li>' +
        '<li>Each browser and device has independent data storage</li>' +
      '</ul>' +
    '</div>' +
    '<div class="about-version">password manager v1.0</div>' +
    '<div class="btn-group" style="margin-top:16px;justify-content:flex-end;">' +
      '<button class="btn btn-outline btn-sm" onclick="closeModal()">Close</button>' +
    '</div>';

  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModalOnBackdrop(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ── Export / Import ──
function exportData() {
  var data = { policy: policy, accounts: accounts, exportDate: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'password-manager-backup-' + new Date().toISOString().slice(0,10) + '.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data exported', 'success');
}

function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (data.accounts) {
        accounts = data.accounts;
        persistAccounts();
      }
      if (data.policy) {
        policy = Object.assign({}, DEFAULT_POLICY, data.policy);
        localStorage.setItem('pm_policy', JSON.stringify(policy));
        populatePolicyForm();
      }
      renderAccounts();
      showToast('Data imported (' + accounts.length + ' accounts)', 'success');
    } catch(err) {
      showToast('Invalid file format', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function clearAllData() {
  if (!confirm('Delete ALL accounts and reset policy? This cannot be undone.')) return;
  accounts = [];
  policy = Object.assign({}, DEFAULT_POLICY);
  localStorage.removeItem('pm_accounts');
  localStorage.removeItem('pm_policy');
  populatePolicyForm();
  renderAccounts();
  showToast('All data cleared', 'success');
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
