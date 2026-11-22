/*
 * cloud.js — مزامنة البيانات مع Firebase (Firestore + تسجيل الدخول بالبريد)
 *
 * يستخدم واجهات REST الرسمية مباشرة (بدون مكتبات خارجية) حتى يبقى البرنامج خفيفاً
 * ويفتح من ملف محلي أو من GitHub Pages.
 *
 * شكل البيانات في Firestore (كل مستخدم له مساحته الخاصة):
 *   users/{uid}/settings/settings      بيانات الجهة، الافتراضيات، القالب المختار، ألوان القوالب
 *   users/{uid}/settings/counters      آخر رقم لكل نوع مستند
 *   users/{uid}/documents/{id}         الفواتير والوصولات (id مثل sales__2026__sales-00001)
 *   users/{uid}/templates/{id}         القوالب المستوردة
 * كل وثيقة فيها الحقل _path (مسار الملف الأصلي) و _updatedAt.
 *
 * الإعدادات (مفتاح API ومعرّف المشروع ورمز الجلسة) تُحفظ في هذا المتصفح فقط.
 */
(function () {
  'use strict';
  const S = window.Storage;
  const CONF_KEY = 'im-cloud';
  const PENDING_KEY = 'im-cloud-pending';
  const COLLECTIONS = ['settings', 'documents', 'templates'];

  // ---------- الإعدادات المحلية ----------
  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* تجاهل */ } }
  let conf = load(CONF_KEY, {}); // { apiKey, projectId, email, uid, refreshToken, autoSync }
  let pending = load(PENDING_KEY, {}); // path -> 'put' | 'del'
  let idToken = null, idTokenExp = 0;
  let status = { state: 'off', message: '' }; // off | idle | syncing | error
  const listeners = new Set();

  function setStatus(state, message) {
    status = { state, message: message || '' };
    listeners.forEach((fn) => { try { fn(status); } catch (e) { /* تجاهل */ } });
  }
  const configured = () => !!(conf.apiKey && conf.projectId);
  const signedIn = () => configured() && !!conf.refreshToken && !!conf.uid;

  // ---------- تحويل القيم من وإلى صيغة Firestore ----------
  function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
    if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
    return { stringValue: String(v) };
  }
  function toFields(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
    return out;
  }
  function fromValue(v) {
    if (!v || 'nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    return null;
  }
  function fromFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
    return out;
  }

  // مسار الملف <-> مكان الوثيقة
  function locate(path) {
    const parts = path.split('/');
    const col = parts.shift();
    if (!COLLECTIONS.includes(col) || !parts.length) return null; // workspace.json وغيره لا يُرفع
    return { col, id: parts.join('__').replace(/\.json$/, '') };
  }

  // ---------- الطلبات ----------
  async function api(url, opts) {
    let res;
    try { res = await fetch(url, opts); }
    catch (e) { const err = new Error('تعذّر الاتصال بالإنترنت'); err.offline = true; throw err; }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) {
      const code = (body && body.error && (body.error.message || body.error.status)) || ('HTTP ' + res.status);
      const err = new Error(explain(code));
      err.code = code; err.status = res.status;
      throw err;
    }
    return body;
  }
  function explain(code) {
    const map = {
      EMAIL_NOT_FOUND: 'البريد غير مسجل. اضغط "إنشاء حساب" أول مرة.',
      INVALID_PASSWORD: 'كلمة المرور غير صحيحة',
      INVALID_LOGIN_CREDENTIALS: 'البريد أو كلمة المرور غير صحيحة',
      EMAIL_EXISTS: 'هذا البريد مسجل مسبقاً. استخدم "تسجيل الدخول".',
      WEAK_PASSWORD: 'كلمة المرور ضعيفة (6 أحرف على الأقل)',
      INVALID_EMAIL: 'صيغة البريد غير صحيحة',
      OPERATION_NOT_ALLOWED: 'فعّل تسجيل الدخول بالبريد (Email/Password) من Firebase Console > Authentication',
      CONFIGURATION_NOT_FOUND: 'فعّل Authentication في مشروع Firebase أولاً',
      PERMISSION_DENIED: 'Firebase رفض الطلب. تأكد من قواعد الأمان (Rules) في Firestore.',
      TOKEN_EXPIRED: 'انتهت الجلسة، سجّل الدخول مرة أخرى',
      USER_DISABLED: 'هذا الحساب معطّل',
    };
    for (const k of Object.keys(map)) if (String(code).startsWith(k)) return map[k];
    if (/API key not valid/i.test(code)) return 'مفتاح API غير صحيح';
    if (/NOT_FOUND/.test(code)) return 'لم يتم العثور على قاعدة Firestore. أنشئها من Firebase Console > Firestore Database.';
    return String(code);
  }

  async function signIn(email, password, create) {
    if (!configured()) throw new Error('أدخل مفتاح API ومعرّف المشروع أولاً');
    const op = create ? 'signUp' : 'signInWithPassword';
    const r = await api(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${encodeURIComponent(conf.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    conf = { ...conf, email: r.email, uid: r.localId, refreshToken: r.refreshToken };
    idToken = r.idToken; idTokenExp = Date.now() + (Number(r.expiresIn) - 60) * 1000;
    save(CONF_KEY, conf);
    setStatus('idle', 'متصل');
    return conf;
  }

  function signOut() {
    conf = { apiKey: conf.apiKey, projectId: conf.projectId, autoSync: conf.autoSync };
    idToken = null; idTokenExp = 0;
    save(CONF_KEY, conf);
    setStatus('off');
  }

  async function token() {
    if (!signedIn()) throw new Error('لم يتم تسجيل الدخول إلى Firebase');
    if (idToken && Date.now() < idTokenExp) return idToken;
    const r = await api(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(conf.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(conf.refreshToken),
    });
    idToken = r.id_token; idTokenExp = Date.now() + (Number(r.expires_in) - 60) * 1000;
    if (r.refresh_token && r.refresh_token !== conf.refreshToken) { conf.refreshToken = r.refresh_token; save(CONF_KEY, conf); }
    return idToken;
  }

  const base = () => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(conf.projectId)}/databases/(default)/documents/users/${encodeURIComponent(conf.uid)}`;
  async function authed(url, opts = {}) {
    const t = await token();
    return api(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  }

  async function putDoc(path, obj) {
    const loc = locate(path);
    if (!loc) return;
    let data = obj;
    // حد Firestore للوثيقة 1MB: الشعار الكبير جداً لا يُرفع
    if (loc.col === 'settings' && obj && obj.company && obj.company.logo && obj.company.logo.length > 700000) {
      data = JSON.parse(JSON.stringify(obj)); data.company.logo = ''; data._logoTooLarge = true;
    }
    const fields = toFields({ ...data, _path: path, _updatedAt: new Date().toISOString() });
    await authed(`${base()}/${loc.col}/${encodeURIComponent(loc.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    });
  }
  async function delDoc(path) {
    const loc = locate(path);
    if (!loc) return;
    try { await authed(`${base()}/${loc.col}/${encodeURIComponent(loc.id)}`, { method: 'DELETE' }); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  /** كل الوثائق في السحابة: { path: object } */
  async function fetchAll() {
    const out = {};
    for (const col of COLLECTIONS) {
      let pageToken = '';
      do {
        const r = await authed(`${base()}/${col}?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`);
        for (const d of (r && r.documents) || []) {
          const obj = fromFields(d.fields);
          const path = obj._path || (col + '/' + d.name.split('/').pop().split('__').join('/') + '.json');
          delete obj._path; delete obj._updatedAt; delete obj._logoTooLarge;
          out[path] = obj;
        }
        pageToken = r && r.nextPageToken;
      } while (pageToken);
    }
    return out;
  }

  // ---------- طابور الرفع ----------
  let running = null;
  let retryTimer = null;
  function changed(path, op) {
    if (!locate(path)) return;
    pending[path] = op;
    save(PENDING_KEY, pending);
    if (signedIn() && conf.autoSync !== false) schedule(400);
    else notifyCount();
  }
  function notifyCount() {
    const n = Object.keys(pending).length;
    if (signedIn()) setStatus(status.state === 'error' ? 'error' : 'idle', n ? `${n} بانتظار الرفع` : 'متزامن');
  }
  function schedule(ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => flush().catch(() => {}), ms);
  }

  /** يرفع كل التغييرات المعلّقة. يقرأ المحتوى الحالي من المجلد وقت الرفع. */
  async function flush() {
    if (running) return running;
    if (!signedIn()) return;
    running = (async () => {
      const paths = Object.keys(pending);
      if (!paths.length) { setStatus('idle', 'متزامن'); return; }
      setStatus('syncing', `جاري الرفع (${paths.length})...`);
      let failed = null;
      for (const path of paths) {
        const op = pending[path];
        try {
          if (op === 'del') await delDoc(path);
          else {
            let obj;
            try { obj = await S.readJSON(path); }
            catch (e) { if (e.name === 'NotFoundError') { delete pending[path]; continue; } throw e; }
            await putDoc(path, obj);
          }
          if (pending[path] === op) delete pending[path]; // لم يتغير أثناء الرفع
          save(PENDING_KEY, pending);
        } catch (e) { failed = e; break; }
      }
      if (failed) {
        setStatus('error', failed.message);
        if (failed.offline || failed.status >= 500) schedule(30000); // إعادة المحاولة لاحقاً
        throw failed;
      }
      notifyCount();
    })();
    try { return await running; } finally { running = null; if (Object.keys(pending).length && status.state !== 'error') schedule(400); }
  }

  /** يضيف كل ملفات المجلد للطابور ويرفعها */
  async function uploadAll() {
    for (const col of COLLECTIONS) for (const p of await S.walkJSON(col)) pending[p] = 'put';
    save(PENDING_KEY, pending);
    await flush();
    return Object.keys(pending).length;
  }

  /** ينزّل كل بيانات السحابة إلى المجلد الحالي (يستبدل الملفات بنفس الاسم) */
  async function downloadAll() {
    setStatus('syncing', 'جاري التنزيل...');
    try {
      const files = await fetchAll();
      await S.quietly(async () => {
        for (const [p, obj] of Object.entries(files)) if (!pending[p]) await S.writeJSON(p, obj);
      });
      notifyCount();
      return Object.keys(files).length;
    } catch (e) { setStatus('error', e.message); throw e; }
  }

  /** وضع السحابة فقط: يحمّل كل البيانات في الذاكرة ويعمل عليها */
  async function openCloudWorkspace() {
    const files = await fetchAll();
    const entries = {};
    for (const [p, obj] of Object.entries(files)) entries[p] = JSON.stringify(obj, null, 2);
    S.useMemory(entries);
    notifyCount();
    if (Object.keys(pending).length) schedule(400);
    return Object.keys(files).length;
  }

  function configure(next) {
    next = { ...next };
    const changedProject = ('projectId' in next && next.projectId !== conf.projectId) || ('apiKey' in next && next.apiKey !== conf.apiKey);
    delete next.refreshToken; delete next.uid;
    conf = { ...conf, ...next };
    if (changedProject) { delete conf.uid; delete conf.refreshToken; idToken = null; }
    save(CONF_KEY, conf);
    setStatus(signedIn() ? 'idle' : 'off', signedIn() ? 'متصل' : '');
  }

  window.addEventListener('online', () => { if (signedIn() && Object.keys(pending).length) schedule(1000); });
  if (signedIn()) setStatus('idle', Object.keys(pending).length ? `${Object.keys(pending).length} بانتظار الرفع` : 'متصل');

  window.Cloud = {
    get config() { return { ...conf, refreshToken: undefined }; },
    get status() { return status; },
    get pendingCount() { return Object.keys(pending).length; },
    configured, signedIn, configure, signIn, signOut,
    changed, flush, uploadAll, downloadAll, fetchAll, openCloudWorkspace,
    onStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); },
    _internal: { toValue, fromValue, toFields, fromFields, locate },
  };
})();
