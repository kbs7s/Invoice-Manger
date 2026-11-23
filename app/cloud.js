/*
 * cloud.js — حفظ نسخة من البيانات في مستودع GitHub خاص
 *
 * كل ملف في مجلد العمل يُحفظ بنفس المسار داخل المستودع:
 *   settings/settings.json      بيانات الجهة، الافتراضيات، القالب المختار (defaults.templateId) وألوان القوالب
 *   settings/counters.json      آخر رقم لكل نوع مستند
 *   documents/<type>/<year>/…   الفواتير والوصولات
 *   templates/<id>.json         القوالب المستوردة
 *
 * يستخدم GitHub REST API مباشرة بـ Personal Access Token يُحفظ في هذا المتصفح فقط.
 * المستودع يجب أن يكون خاصاً (Private) لأن فيه بيانات الزبائن.
 */
(function () {
  'use strict';
  const S = window.Storage;
  const API = 'https://api.github.com';
  const CONF_KEY = 'im-github';
  const PENDING_KEY = 'im-github-pending';
  const SHA_KEY = 'im-github-shas';
  const SYNCED = /^(workspace\.json|(settings|documents|templates)\/.+\.json)$/;

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* تجاهل */ } }
  let conf = load(CONF_KEY, {});     // { repo: 'owner/name', branch, login, autoSync, cloudOnly } + token في الذاكرة فقط
  // الرمز لا يُحفظ نصاً عادياً: يُحفظ مشفّراً بكلمة سر الدخول (auth.js) ويُقرأ بعد فتح القفل
  const legacyToken = conf.token; // نسخ قديمة كانت تحفظه مكشوفاً، ننقله للخزنة المشفّرة
  delete conf.token;
  function saveConf() {
    save(CONF_KEY, { ...conf, token: undefined });
    if (window.Auth && window.Auth.unlocked && window.Auth.getSecret('github') !== conf.token) {
      return window.Auth.setSecret('github', conf.token || null).catch((e) => console.error(e));
    }
  }
  let pending = load(PENDING_KEY, {}); // path -> 'put' | 'del'
  let shas = load(SHA_KEY, {});        // path -> sha آخر نسخة معروفة على GitHub
  let status = { state: 'off', message: '' };
  const listeners = new Set();

  function setStatus(state, message) {
    status = { state, message: message || '' };
    listeners.forEach((fn) => { try { fn(status); } catch (e) { /* تجاهل */ } });
  }
  const signedIn = () => !!(conf.token && conf.repo && conf.branch);
  const configured = signedIn;
  const tracked = (path) => SYNCED.test(path);

  // ---------- ترميز النص ----------
  function toB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  // ---------- الطلبات ----------
  async function gh(path, opts = {}, token = conf.token) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opts,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: 'Bearer ' + token,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.headers || {}),
        },
      });
    } catch (e) { const err = new Error('تعذّر الاتصال بالإنترنت'); err.offline = true; throw err; }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) {
      const err = new Error(explain(res.status, body && body.message));
      err.status = res.status; err.raw = body && body.message;
      throw err;
    }
    return body;
  }
  function explain(status, msg) {
    if (status === 401) return 'الرمز (Token) غير صحيح أو منتهي';
    if (status === 403 && /rate limit/i.test(msg || '')) return 'تجاوزت حد الطلبات على GitHub، حاول بعد قليل';
    if (status === 403) return 'الرمز ما عنده صلاحية الكتابة على المستودع (Contents: Read and write)';
    if (status === 404) return 'المستودع غير موجود، أو الرمز ما عنده صلاحية عليه';
    return msg || ('GitHub HTTP ' + status);
  }

  /** يتحقق من الرمز والمستودع ويحفظهما */
  async function connect(token, repo) {
    token = String(token || '').trim();
    repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!token) throw new Error('أدخل الرمز (Personal Access Token)');
    const user = await gh('/user', {}, token);
    if (!repo.includes('/')) repo = user.login + '/' + (repo || 'invoice-data');
    let info;
    try { info = await gh('/repos/' + repo, {}, token); }
    catch (e) {
      if (e.status !== 404 || repo.split('/')[0].toLowerCase() !== user.login.toLowerCase()) throw e;
      // المستودع غير موجود: نحاول إنشاءه خاصاً
      try { info = await gh('/user/repos', { method: 'POST', body: JSON.stringify({ name: repo.split('/')[1], private: true, auto_init: true, description: 'بيانات مدير الفواتير' }) }, token); }
      catch (e2) { throw new Error(`المستودع ${repo} غير موجود. أنشئه من GitHub كمستودع خاص (Private) ثم حاول مرة ثانية.`); }
    }
    if (!info.private) throw new Error(`المستودع ${info.full_name} عام (Public). اجعله خاصاً (Private) لأن فيه بيانات زبائنك.`);
    if (info.permissions && !info.permissions.push) throw new Error('الرمز ما عنده صلاحية الكتابة على هذا المستودع');
    const changedRepo = conf.repo !== info.full_name;
    conf = { ...conf, token, repo: info.full_name, branch: info.default_branch || 'main', login: user.login };
    if (changedRepo) { shas = {}; save(SHA_KEY, shas); }
    saveConf();
    setStatus('idle', 'متصل');
    return conf;
  }

  function signOut() {
    conf = { autoSync: conf.autoSync };
    shas = {}; save(SHA_KEY, shas);
    saveConf();
    setStatus('off');
  }

  async function shaOf(path) {
    try {
      const r = await gh(`/repos/${conf.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(conf.branch)}`);
      return r && r.sha;
    } catch (e) { if (e.status === 404) return null; throw e; }
  }

  async function putFile(path, text, retry = true) {
    const body = { message: 'حفظ ' + path, content: toB64(text), branch: conf.branch };
    if (shas[path]) body.sha = shas[path];
    try {
      const r = await gh(`/repos/${conf.repo}/contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
      shas[path] = r.content.sha; save(SHA_KEY, shas);
    } catch (e) {
      // النسخة على GitHub تغيّرت من جهاز ثاني أو ما نعرف الـ sha: نجلبه ونعيد مرة واحدة
      if (retry && (e.status === 409 || e.status === 422)) {
        const sha = await shaOf(path);
        if (sha) shas[path] = sha; else delete shas[path];
        return putFile(path, text, false);
      }
      throw e;
    }
  }

  async function deleteFile(path) {
    const sha = shas[path] || (await shaOf(path));
    if (!sha) return;
    try {
      await gh(`/repos/${conf.repo}/contents/${encPath(path)}`, { method: 'DELETE', body: JSON.stringify({ message: 'حذف ' + path, sha, branch: conf.branch }) });
    } catch (e) {
      if (e.status === 404) { /* محذوف مسبقاً */ }
      else if (e.status === 409 || e.status === 422) { const s2 = await shaOf(path); if (s2) await gh(`/repos/${conf.repo}/contents/${encPath(path)}`, { method: 'DELETE', body: JSON.stringify({ message: 'حذف ' + path, sha: s2, branch: conf.branch }) }); }
      else throw e;
    }
    delete shas[path]; save(SHA_KEY, shas);
  }

  /** كل ملفات البيانات في المستودع: { path: text } */
  async function fetchAll() {
    let tree;
    try { tree = await gh(`/repos/${conf.repo}/git/trees/${encodeURIComponent(conf.branch)}?recursive=1`); }
    catch (e) { if (e.status === 409 || e.status === 404) return {}; throw e; } // مستودع فارغ
    const blobs = (tree.tree || []).filter((t) => t.type === 'blob' && tracked(t.path));
    const out = {};
    let i = 0;
    async function worker() {
      while (i < blobs.length) {
        const t = blobs[i++];
        const b = await gh(`/repos/${conf.repo}/git/blobs/${t.sha}`);
        out[t.path] = fromB64(b.content);
        shas[t.path] = t.sha;
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, blobs.length) }, worker));
    save(SHA_KEY, shas);
    return out;
  }

  // ---------- طابور الرفع ----------
  let running = null;
  let timer = null;
  function changed(path, op) {
    if (!tracked(path)) return;
    pending[path] = op;
    save(PENDING_KEY, pending);
    if (signedIn() && conf.autoSync !== false) schedule(500);
    else notifyCount();
  }
  function notifyCount() {
    const n = Object.keys(pending).length;
    if (signedIn()) setStatus(status.state === 'error' ? 'error' : 'idle', n ? `${n} بانتظار الرفع` : 'متزامن');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); }

  /** يرفع كل التغييرات المعلّقة، ويقرأ المحتوى الحالي من المجلد وقت الرفع */
  async function flush() {
    if (running) return running;
    if (!signedIn()) return;
    running = (async () => {
      const paths = Object.keys(pending);
      if (!paths.length) { setStatus('idle', 'متزامن'); return; }
      setStatus('syncing', `جاري الرفع إلى GitHub (${paths.length})...`);
      let failed = null;
      for (const path of paths) {
        const op = pending[path];
        try {
          if (op === 'del') await deleteFile(path);
          else {
            let text;
            try { text = await S.readText(path); }
            catch (e) { if (e.name === 'NotFoundError') { delete pending[path]; save(PENDING_KEY, pending); continue; } throw e; }
            await putFile(path, text);
          }
          if (pending[path] === op) delete pending[path];
          save(PENDING_KEY, pending);
        } catch (e) { failed = e; break; }
      }
      if (failed) {
        setStatus('error', failed.message);
        if (failed.offline || failed.status >= 500) schedule(30000);
        throw failed;
      }
      notifyCount();
    })();
    try { return await running; } finally { running = null; if (Object.keys(pending).length && status.state !== 'error') schedule(500); }
  }

  async function uploadAll() {
    for (const p of ['workspace.json', ...(await S.walkJSON('settings')), ...(await S.walkJSON('templates')), ...(await S.walkJSON('documents'))]) {
      if (await S.exists(p)) pending[p] = 'put';
    }
    save(PENDING_KEY, pending);
    await flush();
    return Object.keys(pending).length;
  }

  /** ينزّل ملفات المستودع إلى المجلد (يستبدل الملفات بنفس الاسم، ما عدا اللي بانتظار الرفع) */
  async function downloadAll() {
    setStatus('syncing', 'جاري التنزيل من GitHub...');
    try {
      const files = await fetchAll();
      await S.quietly(async () => { for (const [p, text] of Object.entries(files)) if (!pending[p]) await S.writeText(p, text); });
      notifyCount();
      return Object.keys(files).length;
    } catch (e) { setStatus('error', e.message); throw e; }
  }

  /** بدون مجلد: يحمّل كل البيانات من GitHub إلى الذاكرة ويعمل عليها */
  async function openCloudWorkspace() {
    const files = await fetchAll();
    S.useMemory(files);
    notifyCount();
    if (Object.keys(pending).length) schedule(500);
    return Object.keys(files).length;
  }

  function configure(next) {
    next = { ...next };
    delete next.token; delete next.repo; delete next.branch; delete next.login;
    conf = { ...conf, ...next };
    saveConf();
  }

  if (window.Auth) {
    window.Auth.onUnlock((secrets) => {
      conf.token = secrets.github || legacyToken || undefined;
      if (legacyToken) saveConf();
      if (signedIn()) { setStatus('idle', Object.keys(pending).length ? `${Object.keys(pending).length} بانتظار الرفع` : 'متصل'); if (Object.keys(pending).length && conf.autoSync !== false) schedule(1500); }
    });
  }

  window.addEventListener('online', () => { if (signedIn() && Object.keys(pending).length) schedule(1000); });
  if (signedIn()) setStatus('idle', Object.keys(pending).length ? `${Object.keys(pending).length} بانتظار الرفع` : 'متصل');

  window.Cloud = {
    get config() { return { ...conf, token: undefined }; },
    get status() { return status; },
    get pendingCount() { return Object.keys(pending).length; },
    configured, signedIn, configure, connect, signOut,
    changed, flush, uploadAll, downloadAll, fetchAll, openCloudWorkspace,
    onStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); },
  };
})();
