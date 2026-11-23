/*
 * auth.js — شاشة الدخول بحساب Firebase
 *
 *   - الدخول بالبريد وكلمة السر عبر Firebase Authentication (واجهة REST الرسمية، بدون مكتبات).
 *     نفس الحساب يعمل على كل الأجهزة، والخادم (قواعد Firestore) يمنع أي أحد غيرك من بياناتك.
 *   - رمز الجلسة (refresh token) لا يُحفظ مكشوفاً: يُشفّر بـ AES-256-GCM بمفتاح مشتق من كلمة السر
 *     (PBKDF2-SHA256، 600,000 دورة) ويُحفظ في 'im-auth'. هذا يسمح بالدخول بدون إنترنت بنفس كلمة السر.
 *   - كلمة السر نفسها لا تُحفظ أبداً.
 *   - بعد 5 محاولات خاطئة: انتظار يتضاعف (30 ثانية ← 15 دقيقة). Firebase أيضاً يوقف المحاولات الكثيرة.
 *   - قفل تلقائي بعد الخمول، والقفل يعيد تحميل الصفحة فيمسح البيانات من الذاكرة.
 *   - نسيان كلمة السر: Firebase يرسل رابط تعيين إلى البريد.
 */
(function () {
  'use strict';
  const VAULT_KEY = 'im-auth';
  const CONF_KEY = 'im-firebase';
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

  // ---------- إعدادات المشروع ----------
  function config() {
    const baked = window.FIREBASE_CONFIG || {};
    if (baked.apiKey && baked.projectId) return { apiKey: baked.apiKey, projectId: baked.projectId, baked: true };
    const c = read(CONF_KEY) || {};
    return { apiKey: c.apiKey || '', projectId: c.projectId || '', baked: false };
  }
  const configured = () => { const c = config(); return !!(c.apiKey && c.projectId); };
  const prefs = () => read(CONF_KEY) || {};
  const setPrefs = (p) => write(CONF_KEY, { ...prefs(), ...p });

  let vault = read(VAULT_KEY);      // { v:2, email, iter, salt, iv, ct }  ct = { refreshToken, uid, email }
  if (vault && vault.v !== 2) vault = null; // حساب محلي قديم (قبل Firebase)
  let key = null;                   // مفتاح التشفير في الذاكرة فقط
  let session = null;               // { uid, email, refreshToken }
  let idToken = null, idTokenExp = 0;
  const unlockFns = [];

  // ---------- طلبات Firebase Auth ----------
  async function api(url, body, form) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      });
    } catch (e) { const err = new Error('تعذّر الاتصال بالإنترنت'); err.offline = true; throw err; }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const code = (data && data.error && data.error.message) || 'HTTP ' + res.status;
      const err = new Error(explain(code));
      err.code = code; err.status = res.status;
      throw err;
    }
    return data;
  }
  function explain(code) {
    const map = {
      INVALID_LOGIN_CREDENTIALS: 'البريد أو كلمة السر غير صحيحة',
      EMAIL_NOT_FOUND: 'البريد أو كلمة السر غير صحيحة',
      INVALID_PASSWORD: 'البريد أو كلمة السر غير صحيحة',
      EMAIL_EXISTS: 'هذا البريد مسجل مسبقاً. استخدم تسجيل الدخول.',
      INVALID_EMAIL: 'صيغة البريد غير صحيحة',
      WEAK_PASSWORD: 'كلمة السر ضعيفة',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة، Firebase أوقف الدخول مؤقتاً. حاول بعد قليل.',
      USER_DISABLED: 'هذا الحساب معطّل',
      OPERATION_NOT_ALLOWED: 'فعّل الدخول بالبريد (Email/Password) من Firebase Console > Authentication',
      ADMIN_ONLY_OPERATION: 'إنشاء الحسابات مقفل في هذا المشروع (هذا جيد للأمان). أنشئ الحساب من Firebase Console.',
      CONFIGURATION_NOT_FOUND: 'فعّل Authentication في مشروع Firebase أولاً',
      CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'سجّل الدخول من جديد ثم غيّر كلمة السر',
      TOKEN_EXPIRED: 'انتهت الجلسة، سجّل الدخول من جديد',
      INVALID_REFRESH_TOKEN: 'انتهت الجلسة، سجّل الدخول من جديد',
      USER_NOT_FOUND: 'الحساب غير موجود',
    };
    for (const k of Object.keys(map)) if (String(code).startsWith(k)) return map[k];
    if (/API key not valid|API_KEY_INVALID/i.test(code)) return 'مفتاح API غير صحيح';
    return String(code);
  }
  const idUrl = (op) => `https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${encodeURIComponent(config().apiKey)}`;
  function takeTokens(r) {
    idToken = r.idToken || r.id_token;
    idTokenExp = Date.now() + (Number(r.expiresIn || r.expires_in || 3600) - 120) * 1000;
    const rt = r.refreshToken || r.refresh_token;
    return rt;
  }

  /** رمز صالح للطلبات على Firestore (يجدده تلقائياً) */
  async function getIdToken() {
    if (!session) throw new Error('البرنامج مقفل');
    if (idToken && Date.now() < idTokenExp) return idToken;
    const r = await api(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config().apiKey)}`,
      { grant_type: 'refresh_token', refresh_token: session.refreshToken }, true);
    const rt = takeTokens(r);
    if (rt && rt !== session.refreshToken) { session.refreshToken = rt; await persist(); }
    return idToken;
  }

  // ---------- التشفير ----------
  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const aad = (email) => enc.encode('im-auth/v2/' + config().projectId + '/' + email);
  async function persist() {
    if (!key || !vault || !session) return;
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(vault.email) }, key, enc.encode(JSON.stringify(session)));
    vault = { ...vault, iv: b64(iv), ct: b64(ct) };
    write(VAULT_KEY, vault);
  }
  async function sealNew(password, s) {
    const salt = rand(16);
    key = await deriveKey(password, salt, ITER);
    vault = { v: 2, email: s.email, iter: ITER, salt: b64(salt) };
    session = s;
    await persist();
  }
  async function openVault(password, email) {
    if (!vault || !vault.ct || vault.email !== email) return null;
    const k = await deriveKey(password, unb64(vault.salt), vault.iter || ITER);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv), additionalData: aad(vault.email) }, k, unb64(vault.ct));
      return { k, s: JSON.parse(dec.decode(pt)) };
    } catch (e) { return null; }
  }

  // ---------- قوة كلمة السر ----------
  const COMMON = ['password', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', '11111111', 'iloveyou', 'admin', 'welcome', 'abc123', 'password1', '00000000', '987654321', 'baghdad', 'iraq'];
  function check(password, email) {
    const p = password || '';
    const issues = [];
    if ([...p].length < MIN_LEN) issues.push(`${MIN_LEN} أحرف على الأقل`);
    const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u, /[؀-ۿ]/].filter((r) => r.test(p)).length;
    if (classes < 3 || !/\p{L}/u.test(p)) issues.push('امزج حروفاً وأرقاماً ورموزاً (3 أنواع على الأقل)');
    const low = p.toLowerCase();
    if (COMMON.some((w) => low.includes(w))) issues.push('لا تستخدم كلمات أو أرقام شائعة');
    if (/(.)\1{3,}/u.test(p)) issues.push('لا تكرر نفس الحرف كثيراً');
    const user = (email || '').split('@')[0].toLowerCase();
    if (user.length >= 3 && low.includes(user)) issues.push('لا تضع اسم البريد داخل كلمة السر');
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
  const FORMS = ['config', 'login', 'signup', 'forgot'];
  function show(mode, msg, ok) {
    $('#lock').hidden = false;
    FORMS.forEach((m) => { $('#lock-' + m).hidden = m !== mode; });
    setMsg(msg || '', ok);
    const email = (vault && vault.email) || prefs().email || '';
    if (mode === 'login') {
      if (!$('#l-email').value) $('#l-email').value = email;
      $('#l-pass').value = '';
      setTimeout(() => ($('#l-email').value ? $('#l-pass') : $('#l-email')).focus(), 50);
      $('#btn-change-project').hidden = config().baked;
      tickLockout();
    } else if (mode === 'config') {
      const c = config();
      $('#cfg-key').value = c.apiKey; $('#cfg-project').value = c.projectId;
      setTimeout(() => $('#cfg-key').focus(), 50);
    } else if (mode === 'forgot') {
      $('#fp-email').value = $('#l-email').value || email;
    } else if (mode === 'signup') {
      $('#su-email').value = $('#l-email').value || '';
      setTimeout(() => $('#su-email').focus(), 50);
    }
  }
  function setMsg(m, ok) { const el = $('#lock-msg'); el.textContent = m; el.hidden = !m; el.classList.toggle('ok', !!ok); }
  function busy(form, on, label) {
    const b = form.querySelector('button[type=submit]');
    b.disabled = on;
    if (on) { b.dataset.label = b.dataset.label || b.textContent; b.textContent = label; } else if (b.dataset.label) b.textContent = b.dataset.label;
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
  function meter(input, out, emailInput) {
    const upd = () => {
      const r = check(input.value, emailInput ? emailInput.value.trim() : '');
      out.dataset.score = input.value ? r.score : '';
      out.querySelector('span').textContent = !input.value ? '' : r.ok ? (['', '', 'مقبولة', 'قوية', 'قوية جداً'][r.score] || 'مقبولة') : r.issues[0];
    };
    input.addEventListener('input', upd);
    if (emailInput) emailInput.addEventListener('input', upd);
  }

  function onConfig(e) {
    e.preventDefault();
    let k = $('#cfg-key').value.trim(), p = $('#cfg-project').value.trim();
    // يقبل لصق كتلة firebaseConfig كاملة في أي حقل
    const blob = k + ' ' + p;
    const mk = blob.match(/apiKey["']?\s*:\s*["']([^"']+)/), mp = blob.match(/projectId["']?\s*:\s*["']([^"']+)/);
    if (mk) k = mk[1];
    if (mp) p = mp[1];
    if (!/^AIza[\w-]{20,}$/.test(k)) return setMsg('مفتاح API غير صحيح (يبدأ بـ AIza)');
    if (!/^[a-z0-9-]{4,40}$/.test(p)) return setMsg('معرّف المشروع غير صحيح (حروف إنكليزية صغيرة وأرقام و -)');
    const old = config();
    setPrefs({ apiKey: k, projectId: p });
    if (old.projectId && old.projectId !== p) { localStorage.removeItem(VAULT_KEY); vault = null; }
    show('login');
  }

  async function onLogin(e) {
    e.preventDefault();
    const f = e.target;
    if (lockoutLeft()) return tickLockout();
    const email = $('#l-email').value.trim().toLowerCase();
    const pass = $('#l-pass').value;
    busy(f, true, 'جاري التحقق...');
    try {
      let s = null, offline = false;
      try {
        const r = await api(idUrl('signInWithPassword'), { email, password: pass, returnSecureToken: true });
        const rt = takeTokens(r);
        s = { uid: r.localId, email: (r.email || email).toLowerCase(), refreshToken: rt };
        await sealNew(pass, s);
      } catch (err) {
        if (err.offline) {
          // بدون إنترنت: نفتح الخزنة المحلية بنفس كلمة السر
          const v = await openVault(pass, email);
          if (v) { key = v.k; session = v.s; s = v.s; offline = true; }
          else if (vault && vault.email === email) { recordFail(); throw new Error('كلمة السر غير صحيحة (بدون إنترنت)'); }
          else throw new Error('لا يوجد اتصال بالإنترنت. أول دخول على هذا الجهاز يحتاج إنترنت.');
        } else {
          if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(err.code || '')) {
            const fl = recordFail();
            throw new Error(err.message + (fl.n >= 3 && fl.n < 5 ? ` (بقيت ${5 - fl.n} محاولات قبل الإيقاف المؤقت)` : ''));
          }
          throw err;
        }
      }
      localStorage.removeItem(FAILS_KEY);
      setPrefs({ email: s.email });
      $('#l-pass').value = '';
      done(offline);
    } catch (err) {
      $('#l-pass').value = '';
      setMsg(err.message);
    } finally { busy(f, false); if (lockoutLeft()) tickLockout(); }
  }

  async function onSignup(e) {
    e.preventDefault();
    const f = e.target;
    const email = $('#su-email').value.trim().toLowerCase();
    const p1 = $('#su-pass').value, p2 = $('#su-pass2').value;
    const r = check(p1, email);
    if (!r.ok) return setMsg('كلمة السر ضعيفة: ' + r.issues.join('، '));
    if (p1 !== p2) return setMsg('كلمتا السر غير متطابقتين');
    busy(f, true, 'جاري إنشاء الحساب...');
    try {
      const res = await api(idUrl('signUp'), { email, password: p1, returnSecureToken: true });
      const rt = takeTokens(res);
      await sealNew(p1, { uid: res.localId, email, refreshToken: rt });
      setPrefs({ email });
      f.reset();
      done(false);
    } catch (err) { setMsg(err.message); }
    finally { busy(f, false); }
  }

  async function onForgot(e) {
    e.preventDefault();
    const f = e.target;
    const email = $('#fp-email').value.trim();
    busy(f, true, 'جاري الإرسال...');
    try {
      await api(idUrl('sendOobCode'), { requestType: 'PASSWORD_RESET', email });
      show('login', 'إذا كان البريد مسجلاً، وصلك رابط لتعيين كلمة سر جديدة. افحص البريد (وقسم Spam).', true);
    } catch (err) {
      // لا نكشف هل البريد مسجل أم لا
      if (/EMAIL_NOT_FOUND/.test(err.code || '')) show('login', 'إذا كان البريد مسجلاً، وصلك رابط لتعيين كلمة سر جديدة.', true);
      else setMsg(err.message);
    } finally { busy(f, false); }
  }

  function done(offline) {
    clearInterval(tick);
    $('#lock').hidden = true;
    setMsg('');
    unlockFns.forEach((fn) => { try { fn(api_.session, { offline }); } catch (err) { console.error(err); } });
    startIdleTimer();
    if (resolveGate) { resolveGate(); resolveGate = null; }
  }

  // ---------- القفل التلقائي ----------
  let last = Date.now(), idleTimer = null;
  const idleMinutes = () => (IDLE_OPTIONS.includes(prefs().idle) ? prefs().idle : 15);
  function startIdleTimer() {
    const bump = () => { last = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    clearInterval(idleTimer);
    idleTimer = setInterval(() => { if (Date.now() - last > idleMinutes() * 60000) lock(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > idleMinutes() * 60000) lock(); });
  }
  let locking = false;
  async function lock() {
    if (locking) return;
    locking = true;
    try { if (window.Cloud && window.Cloud.signedIn()) await Promise.race([window.Cloud.flush(), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* يبقى في الطابور */ }
    key = null; session = null; idToken = null;
    location.reload();
  }
  async function logout() {
    try { if (window.Cloud && window.Cloud.signedIn()) await Promise.race([window.Cloud.flush(), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* تجاهل */ }
    localStorage.removeItem(VAULT_KEY);
    key = null; session = null; idToken = null;
    location.reload();
  }

  async function changePassword(current, next) {
    if (!session) throw new Error('البرنامج مقفل');
    const r = check(next, session.email);
    if (!r.ok) throw new Error('كلمة السر الجديدة ضعيفة: ' + r.issues.join('، '));
    let fresh;
    try { fresh = await api(idUrl('signInWithPassword'), { email: session.email, password: current, returnSecureToken: true }); }
    catch (e) { if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(e.code || '')) throw new Error('كلمة السر الحالية غير صحيحة'); throw e; }
    const up = await api(idUrl('update'), { idToken: fresh.idToken, password: next, returnSecureToken: true });
    const rt = takeTokens(up);
    await sealNew(next, { ...session, refreshToken: rt || session.refreshToken });
  }

  function gate() {
    if (!window.crypto || !crypto.subtle) {
      $('#lock').hidden = false;
      FORMS.forEach((m) => { $('#lock-' + m).hidden = true; });
      setMsg('هذا المتصفح لا يدعم التشفير المطلوب. افتح البرنامج من رابط https أو في Chrome أو Edge.');
      return new Promise(() => {});
    }
    return new Promise((resolve) => {
      resolveGate = resolve;
      show(configured() ? 'login' : 'config');
    });
  }

  function bind() {
    $('#lock-config').addEventListener('submit', onConfig);
    $('#lock-login').addEventListener('submit', onLogin);
    $('#lock-signup').addEventListener('submit', onSignup);
    $('#lock-forgot').addEventListener('submit', onForgot);
    document.querySelectorAll('#lock [data-show]').forEach((b) => b.addEventListener('click', () => show(b.dataset.show)));
    meter($('#su-pass'), $('#su-meter'), $('#su-email'));
    document.querySelectorAll('#lock [data-reveal]').forEach((b) => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.reveal);
      i.type = i.type === 'password' ? 'text' : 'password';
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  const api_ = {
    gate, lock, logout, changePassword, check, getIdToken,
    get unlocked() { return !!session; },
    get session() { return session ? { uid: session.uid, email: session.email, apiKey: config().apiKey, projectId: config().projectId } : null; },
    get user() { return session && session.email; },
    get idle() { return idleMinutes(); },
    get config() { return config(); },
    IDLE_OPTIONS,
    setIdle(min) { if (IDLE_OPTIONS.includes(min)) { setPrefs({ idle: min }); last = Date.now(); } },
    onUnlock(fn) { unlockFns.push(fn); if (session) fn(api_.session, { offline: !idToken }); },
  };
  window.Auth = api_;
})();
