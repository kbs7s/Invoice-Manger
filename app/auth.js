/*
 * auth.js — شاشة الدخول وقفل البرنامج
 *
 * لا يوجد خادم (البرنامج صفحة ثابتة)، لذلك الحماية مبنية على التشفير داخل المتصفح:
 *   - كلمة السر لا تُحفظ أبداً. يُشتق منها مفتاح AES-256 بـ PBKDF2-SHA256 (600,000 دورة + ملح عشوائي).
 *   - الأسرار (رمز GitHub) تُحفظ مشفّرة بـ AES-GCM في localStorage تحت 'im-auth'.
 *     فك التشفير ينجح فقط بكلمة السر الصحيحة، وهذا هو التحقق نفسه (لا يوجد hash يمكن مقارنته).
 *   - بعد 5 محاولات خاطئة: انتظار يتضاعف (30 ثانية ← 15 دقيقة كحد أقصى).
 *   - قفل تلقائي بعد مدة خمول، والقفل يعيد تحميل الصفحة فيمسح كل البيانات من الذاكرة.
 *   - "نسيت كلمة السر" يمسح الأسرار المشفّرة ويفصل GitHub ومجلد العمل.
 */
(function () {
  'use strict';
  const KEY = 'im-auth';
  const FAILS_KEY = 'im-auth-fails';
  const ITER = 600000;
  const MIN_LEN = 10;
  const IDLE_OPTIONS = [5, 15, 30, 60];
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const $ = (s) => document.querySelector(s);

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  let vault = read(KEY);   // { v, user, iter, salt, iv, ct, idle }
  let key = null;          // CryptoKey غير قابل للتصدير، في الذاكرة فقط
  let secrets = null;      // { github: '...' }
  const unlockFns = [];

  // ---------- التشفير ----------
  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const aad = (user) => enc.encode('im-auth/v1/' + user);
  async function seal(k, user, data) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(user) }, k, enc.encode(JSON.stringify(data)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(k, v) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv), additionalData: aad(v.user) }, k, unb64(v.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function persist() {
    if (!key || !vault) return;
    const sealed = await seal(key, vault.user, { secrets, at: Date.now() });
    vault = { ...vault, ...sealed };
    write(KEY, vault);
  }

  // ---------- قوة كلمة السر ----------
  const COMMON = ['password', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', '11111111', 'iloveyou', 'admin', 'welcome', 'abc123', 'password1', '00000000', '987654321', 'baghdad', 'iraq'];
  function check(password, user) {
    const p = password || '';
    const issues = [];
    if ([...p].length < MIN_LEN) issues.push(`${MIN_LEN} أحرف على الأقل`);
    const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u, /[؀-ۿ]/].filter((r) => r.test(p)).length;
    const hasLetter = /\p{L}/u.test(p);
    if (classes < 3 || !hasLetter) issues.push('امزج حروفاً وأرقاماً ورموزاً (3 أنواع على الأقل)');
    const low = p.toLowerCase();
    if (COMMON.some((w) => low.includes(w))) issues.push('لا تستخدم كلمات أو أرقام شائعة');
    if (/(.)\1{3,}/u.test(p)) issues.push('لا تكرر نفس الحرف كثيراً');
    if (user && user.length >= 3 && low.includes(user.toLowerCase())) issues.push('لا تضع اسم المستخدم داخل كلمة السر');
    let score = Math.min(4, Math.floor([...p].length / 4) + classes - 2);
    if (issues.length) score = Math.min(score, 1);
    return { ok: !issues.length, issues, score: Math.max(0, score) };
  }

  // ---------- محاولات الدخول ----------
  function lockoutLeft() {
    const f = read(FAILS_KEY);
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }
  function recordFail() {
    const f = read(FAILS_KEY) || { n: 0 };
    f.n += 1;
    f.until = f.n >= 5 ? Date.now() + Math.min(30000 * 2 ** (f.n - 5), 15 * 60000) : 0;
    write(FAILS_KEY, f);
    return f;
  }

  // ---------- الواجهة ----------
  let resolveGate = null;
  function show(mode, msg) {
    const box = $('#lock');
    box.hidden = false;
    $('#lock-setup').hidden = mode !== 'setup';
    $('#lock-login').hidden = mode !== 'login';
    $('#lock-forgot').hidden = mode !== 'forgot';
    setMsg(msg || '');
    if (mode === 'login') {
      $('#l-user').value = vault.user;
      $('#l-pass').value = '';
      setTimeout(() => $('#l-pass').focus(), 50);
      tickLockout();
    } else if (mode === 'setup') setTimeout(() => $('#s-user').focus(), 50);
  }
  function setMsg(m, ok) { const el = $('#lock-msg'); el.textContent = m; el.hidden = !m; el.classList.toggle('ok', !!ok); }
  function busy(form, on, label) {
    const b = form.querySelector('button[type=submit]');
    b.disabled = on;
    if (label) { b.dataset.label = b.dataset.label || b.textContent; b.textContent = on ? label : b.dataset.label; }
  }
  let tick = null;
  function tickLockout() {
    clearInterval(tick);
    const run = () => {
      const s = lockoutLeft();
      $('#l-submit').disabled = s > 0;
      if (s > 0) setMsg(`محاولات خاطئة كثيرة. حاول بعد ${s >= 60 ? Math.ceil(s / 60) + ' دقيقة' : s + ' ثانية'}.`);
      else { clearInterval(tick); if (/محاولات خاطئة/.test($('#lock-msg').textContent)) setMsg(''); }
    };
    run();
    tick = setInterval(run, 1000);
  }
  function meter(input, out, userInput) {
    const upd = () => {
      const r = check(input.value, userInput ? userInput.value.trim() : '');
      out.dataset.score = input.value ? r.score : '';
      out.querySelector('span').textContent = !input.value ? '' : r.ok ? ['', '', 'مقبولة', 'قوية', 'قوية جداً'][r.score] || 'مقبولة' : r.issues[0];
    };
    input.addEventListener('input', upd);
    if (userInput) userInput.addEventListener('input', upd);
  }

  async function onSetup(e) {
    e.preventDefault();
    const f = e.target;
    const user = $('#s-user').value.trim();
    const p1 = $('#s-pass').value, p2 = $('#s-pass2').value;
    if (user.length < 3) return setMsg('اسم المستخدم 3 أحرف على الأقل');
    const r = check(p1, user);
    if (!r.ok) return setMsg('كلمة السر ضعيفة: ' + r.issues.join('، '));
    if (p1 !== p2) return setMsg('كلمتا السر غير متطابقتين');
    busy(f, true, 'جاري التشفير...');
    try {
      const salt = rand(16);
      key = await deriveKey(p1, salt, ITER);
      secrets = {};
      vault = { v: 1, user, iter: ITER, salt: b64(salt), idle: (vault && vault.idle) || 15 };
      await persist();
      localStorage.removeItem(FAILS_KEY);
      f.reset();
      done();
    } catch (err) { setMsg('تعذّر إنشاء الحساب: ' + err.message); }
    finally { busy(f, false, 'x'); }
  }

  async function onLogin(e) {
    e.preventDefault();
    const f = e.target;
    if (lockoutLeft()) return tickLockout();
    const user = $('#l-user').value.trim();
    const pass = $('#l-pass').value;
    busy(f, true, 'جاري التحقق...');
    try {
      const k = await deriveKey(pass, unb64(vault.salt), vault.iter || ITER);
      let data = null;
      // اسم المستخدم داخل في التشفير (AAD)، فالاسم الخاطئ يفشل مثل كلمة السر الخاطئة
      if (user === vault.user) { try { data = await open(k, vault); } catch (err) { data = null; } }
      if (!data) {
        const fl = recordFail();
        $('#l-pass').value = '';
        setMsg('اسم المستخدم أو كلمة السر غير صحيحة' + (fl.n >= 3 && fl.n < 5 ? ` (بقيت ${5 - fl.n} محاولات قبل الإيقاف المؤقت)` : ''));
        if (fl.until) tickLockout();
        return;
      }
      key = k;
      secrets = data.secrets || {};
      localStorage.removeItem(FAILS_KEY);
      $('#l-pass').value = '';
      done();
    } finally { busy(f, false, 'x'); if (lockoutLeft()) tickLockout(); }
  }

  async function onForgot(e) {
    e.preventDefault();
    if ($('#f-confirm').value.trim() !== 'مسح') return setMsg('اكتب كلمة "مسح" للتأكيد');
    localStorage.removeItem(KEY);
    localStorage.removeItem(FAILS_KEY);
    // الرمز كان مشفّراً بكلمة السر القديمة فلا يمكن استرجاعه: نفصل GitHub ونطلب اختيار المجلد من جديد
    try { const c = read('im-github') || {}; write('im-github', { autoSync: c.autoSync }); } catch (err) { /* تجاهل */ }
    try { if (window.Storage && window.Storage.forget) await window.Storage.forget(); } catch (err) { /* تجاهل */ }
    location.reload();
  }

  function done() {
    clearInterval(tick);
    $('#lock').hidden = true;
    setMsg('');
    unlockFns.forEach((fn) => { try { fn(secrets); } catch (err) { console.error(err); } });
    startIdleTimer();
    if (resolveGate) { resolveGate(); resolveGate = null; }
  }

  // ---------- القفل التلقائي ----------
  let last = Date.now(), idleTimer = null;
  function startIdleTimer() {
    const bump = () => { last = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    clearInterval(idleTimer);
    idleTimer = setInterval(() => { if (Date.now() - last > idleMinutes() * 60000) lock(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > idleMinutes() * 60000) lock(); });
  }
  const idleMinutes = () => (vault && IDLE_OPTIONS.includes(vault.idle) ? vault.idle : 15);

  let locking = false;
  async function lock() {
    if (locking) return;
    locking = true;
    // نعطي فرصة قصيرة لإكمال الرفع إلى GitHub ثم نعيد التحميل لمسح الذاكرة
    try { if (window.Cloud && window.Cloud.signedIn()) await Promise.race([window.Cloud.flush(), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* يبقى في الطابور */ }
    key = null; secrets = null;
    location.reload();
  }

  // ---------- واجهة برمجية ----------
  async function changePassword(current, next) {
    if (!key) throw new Error('البرنامج مقفل');
    const k = await deriveKey(current, unb64(vault.salt), vault.iter || ITER);
    try { await open(k, vault); } catch (e) { throw new Error('كلمة السر الحالية غير صحيحة'); }
    const r = check(next, vault.user);
    if (!r.ok) throw new Error('كلمة السر الجديدة ضعيفة: ' + r.issues.join('، '));
    const salt = rand(16);
    key = await deriveKey(next, salt, ITER);
    vault = { ...vault, salt: b64(salt), iter: ITER };
    await persist();
  }

  function gate() {
    if (!window.crypto || !crypto.subtle) {
      $('#lock').hidden = false;
      $('#lock-setup').hidden = $('#lock-login').hidden = $('#lock-forgot').hidden = true;
      setMsg('هذا المتصفح لا يدعم التشفير المطلوب. افتح البرنامج من رابط https أو من ملف على الجهاز في Chrome أو Edge.');
      return new Promise(() => {});
    }
    return new Promise((resolve) => {
      resolveGate = resolve;
      show(vault && vault.ct ? 'login' : 'setup');
    });
  }

  function bind() {
    $('#lock-setup').addEventListener('submit', onSetup);
    $('#lock-login').addEventListener('submit', onLogin);
    $('#lock-forgot').addEventListener('submit', onForgot);
    $('#btn-forgot').addEventListener('click', () => show('forgot'));
    $('#btn-forgot-back').addEventListener('click', () => show('login'));
    meter($('#s-pass'), $('#s-meter'), $('#s-user'));
    document.querySelectorAll('#lock [data-reveal]').forEach((b) => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.reveal);
      i.type = i.type === 'password' ? 'text' : 'password';
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  window.Auth = {
    gate, lock, changePassword, check,
    get unlocked() { return !!key; },
    get user() { return vault && vault.user; },
    get idle() { return idleMinutes(); },
    IDLE_OPTIONS,
    setIdle(min) { if (!IDLE_OPTIONS.includes(min) || !vault) return; vault = { ...vault, idle: min }; write(KEY, vault); last = Date.now(); },
    getSecret(name) { return secrets ? secrets[name] : undefined; },
    async setSecret(name, value) {
      if (!key) throw new Error('البرنامج مقفل');
      if (value == null) delete secrets[name]; else secrets[name] = value;
      await persist();
    },
    onUnlock(fn) { unlockFns.push(fn); if (key) fn(secrets); },
  };
})();
