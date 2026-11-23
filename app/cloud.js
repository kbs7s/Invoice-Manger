/*
 * cloud.js — حفظ ومزامنة البيانات في Firebase Firestore
 *
 * كل ملف في مجلد العمل يُحفظ كوثيقة باسم مساره:
 *   users/{uid}/files/{id}   الحقول: path (المسار الأصلي)، text (محتوى JSON)، deleted، updatedAt (وقت الخادم)
 *   مثال: documents/sales/2026/sales-00001.json  ←  id = documents__sales__2026__sales-00001.json
 *
 * المزامنة باتجاهين:
 *   - كل حفظ أو حذف يدخل طابوراً ويُرفع (ويبقى في الطابور إذا انقطع الإنترنت).
 *   - الجهاز يسحب التغييرات الجديدة فقط (updatedAt > آخر سحب) كل دقيقة وعند الرجوع للنافذة.
 *   - الحذف يُحفظ كعلامة deleted حتى يعرفه الجهاز الثاني.
 *
 * الدخول والرموز من auth.js. قواعد Firestore تسمح لكل مستخدم بمساحته فقط (انظر README).
 */
(function () {
  'use strict';
  const S = window.Storage;
  const A = () => window.Auth;
  const PENDING_KEY = 'im-fb-pending';
  const SYNC_KEY = 'im-fb-sync';
  const SYNCED = /^(workspace\.json|(settings|documents|templates)\/.+\.json)$/;
  const MAX_BYTES = 1000000;

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* تجاهل */ } }
  let pending = load(PENDING_KEY, {}); // path -> 'put' | 'del'
  let status = { state: 'off', message: '' };
  let active = false;   // يوجد مجلد أو مساحة ذاكرة مفتوحة نزامنها
  const listeners = new Set();

  function setStatus(state, message) {
    status = { state, message: message || '' };
    listeners.forEach((fn) => { try { fn(status); } catch (e) { /* تجاهل */ } });
  }
  const signedIn = () => !!(A() && A().unlocked);
  const tracked = (path) => SYNCED.test(path);
  const docId = (path) => path.split('/').join('__');

  // ---------- الطلبات ----------
  function root() {
    const s = A().session;
    return `projects/${encodeURIComponent(s.projectId)}/databases/(default)/documents`;
  }
  const userDoc = () => `${root()}/users/${encodeURIComponent(A().session.uid)}`;
  async function fs(path, opts = {}) {
    const token = await A().getIdToken();
    let res;
    try {
      res = await fetch('https://firestore.googleapis.com/v1/' + path, {
        ...opts,
        headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (e) { const err = new Error('تعذّر الاتصال بالإنترنت'); err.offline = true; throw err; }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      const raw = (body && body.error && (body.error.message || body.error.status)) || 'HTTP ' + res.status;
      const err = new Error(explain(res.status, raw));
      err.status = res.status; err.raw = raw;
      throw err;
    }
    return body;
  }
  function explain(status, raw) {
    if (status === 403) return 'Firebase رفض الطلب. تأكد من قواعد الأمان (Rules) في Firestore.';
    if (status === 404 && /database/i.test(raw)) return 'لم يتم العثور على قاعدة Firestore. أنشئها من Firebase Console > Firestore Database.';
    if (status === 401) return 'انتهت الجلسة، سجّل الدخول من جديد';
    if (status === 429) return 'تجاوزت حد الاستخدام المجاني لليوم، حاول لاحقاً';
    return raw;
  }

  async function write(path, text, deleted) {
    if (!deleted && new Blob([text]).size > MAX_BYTES) throw new Error(`الملف ${path} أكبر من 1MB (صغّر الشعار)`);
    const s = A().session;
    const name = `projects/${s.projectId}/databases/(default)/documents/users/${s.uid}/files/${docId(path)}`;
    await fs(`${root()}:commit`, {
      method: 'POST',
      body: JSON.stringify({
        writes: [{
          update: { name, fields: { path: { stringValue: path }, text: { stringValue: deleted ? '' : text }, deleted: { booleanValue: !!deleted } } },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        }],
      }),
    });
  }

  /** التغييرات منذ وقت معيّن (أو كل شيء): [{ path, text, deleted, at }] */
  async function changesSince(since) {
    const q = { from: [{ collectionId: 'files' }], orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' }] };
    if (since) q.where = { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN', value: { timestampValue: since } } };
    const rows = await fs(`${userDoc()}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: q }) });
    return (rows || []).filter((r) => r.document).map((r) => {
      const f = r.document.fields || {};
      return {
        path: f.path && f.path.stringValue,
        text: (f.text && f.text.stringValue) || '',
        deleted: !!(f.deleted && f.deleted.booleanValue),
        at: f.updatedAt && f.updatedAt.timestampValue,
      };
    }).filter((d) => d.path && tracked(d.path));
  }

  // ---------- آخر سحب (لكل حساب ومشروع، وللمجلد فقط) ----------
  const syncKey = () => A().session.projectId + '/' + A().session.uid + '/' + S.folderName;
  let memLast = null;
  function getLast() { if (S.mode === 'cloud') return memLast; const s = load(SYNC_KEY, {}); return s.key === syncKey() ? s.last : null; }
  function setLast(v) { if (S.mode === 'cloud') memLast = v; else save(SYNC_KEY, { key: syncKey(), last: v }); }

  // ---------- السحب ----------
  let pulling = null;
  async function pull() {
    if (!signedIn() || !active) return 0;
    if (pulling) return pulling;
    pulling = (async () => {
      const first = !getLast();
      const rows = await changesSince(getLast());
      let n = 0, lastAt = getLast();
      const remote = new Set();
      await S.quietly(async () => {
        for (const d of rows) {
          remote.add(d.path);
          lastAt = d.at || lastAt;
          if (pending[d.path]) continue; // تعديل محلي لم يُرفع بعد يفوز
          if (d.deleted) { if (await S.exists(d.path)) { await S.remove(d.path); n++; } continue; }
          let cur = null;
          try { cur = await S.readText(d.path); } catch (e) { cur = null; }
          if (cur !== d.text) { await S.writeText(d.path, d.text); n++; }
        }
      });
      if (lastAt) setLast(lastAt);
      // أول مزامنة لهذا المجلد: نرفع الملفات المحلية غير الموجودة في السحابة (دمج الطرفين)
      if (first && S.mode !== 'cloud') {
        for (const p of await localPaths()) if (!remote.has(p)) pending[p] = 'put';
        save(PENDING_KEY, pending);
      }
      if (n) window.dispatchEvent(new CustomEvent('cloud-pulled', { detail: { count: n } }));
      return n;
    })();
    try { return await pulling; } finally { pulling = null; }
  }
  async function localPaths() {
    const out = [];
    for (const p of ['workspace.json', ...(await S.walkJSON('settings')), ...(await S.walkJSON('templates')), ...(await S.walkJSON('documents'))]) {
      if (tracked(p) && await S.exists(p)) out.push(p);
    }
    return out;
  }

  // ---------- طابور الرفع ----------
  let running = null;
  let timer = null;
  function changed(path, op) {
    if (!tracked(path)) return;
    pending[path] = op;
    save(PENDING_KEY, pending);
    if (signedIn() && active) schedule(500);
    else notifyCount();
  }
  function notifyCount() {
    const n = Object.keys(pending).length;
    if (signedIn()) setStatus(status.state === 'error' ? 'error' : 'idle', n ? `${n} بانتظار الرفع` : 'متزامن');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); }

  async function flush() {
    if (running) return running;
    if (!signedIn() || !active) return;
    running = (async () => {
      const paths = Object.keys(pending);
      if (!paths.length) { setStatus('idle', 'متزامن'); return; }
      setStatus('syncing', `جاري الحفظ على Firebase (${paths.length})...`);
      let failed = null;
      for (const path of paths) {
        const op = pending[path];
        try {
          if (op === 'del') await write(path, '', true);
          else {
            let text;
            try { text = await S.readText(path); }
            catch (e) { if (e.name === 'NotFoundError') { delete pending[path]; save(PENDING_KEY, pending); continue; } throw e; }
            await write(path, text, false);
          }
          if (pending[path] === op) delete pending[path];
          save(PENDING_KEY, pending);
        } catch (e) { failed = e; break; }
      }
      if (failed) {
        setStatus('error', failed.message);
        if (failed.offline || failed.status >= 500 || failed.status === 429) schedule(30000);
        throw failed;
      }
      notifyCount();
    })();
    try { return await running; } finally { running = null; if (Object.keys(pending).length && status.state !== 'error') schedule(500); }
  }

  /** رفع + سحب */
  async function sync() {
    setStatus('syncing', 'جاري المزامنة...');
    try { await flush(); await pull(); await flush(); notifyCount(); }
    catch (e) { setStatus('error', e.message); if (e.offline) schedule(30000); throw e; }
  }

  async function uploadAll() {
    for (const p of await localPaths()) pending[p] = 'put';
    save(PENDING_KEY, pending);
    await flush();
    return Object.keys(pending).length;
  }

  // ---------- تشغيل المزامنة ----------
  let poll = null;
  function startPolling() {
    clearInterval(poll);
    poll = setInterval(() => { if (!document.hidden) sync().catch(() => {}); }, 60000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active && signedIn()) sync().catch(() => {}); });
  window.addEventListener('online', () => { if (active && signedIn()) sync().catch(() => {}); });

  /** يبدأ المزامنة لمجلد العمل الحالي */
  async function attachFolder() {
    active = true;
    startPolling();
    return sync();
  }

  /** بدون مجلد: تحميل كل البيانات من Firebase إلى الذاكرة */
  async function openCloudWorkspace() {
    if (!signedIn()) throw new Error('سجّل الدخول أولاً');
    S.useMemory({});
    memLast = null;
    active = true;
    const n = await pull();
    startPolling();
    if (Object.keys(pending).length) schedule(500);
    notifyCount();
    return n;
  }

  /** ينسخ كل البيانات من السحابة إلى المجلد (للنسخ الاحتياطي على جهاز جديد) */
  async function downloadAll() {
    setLast(null);
    return pull();
  }

  // ---------- نقل البيانات من مستودع GitHub القديم ----------
  async function importFromGitHub(repo, token) {
    repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('اكتب المستودع بالشكل: اسم-المستخدم/اسم-المستودع');
    const gh = async (p) => {
      let res;
      try { res = await fetch('https://api.github.com' + p, { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token } }); }
      catch (e) { throw new Error('تعذّر الاتصال بـ GitHub'); }
      if (res.status === 401) throw new Error('رمز GitHub غير صحيح أو منتهي');
      if (res.status === 404) throw new Error('المستودع غير موجود أو الرمز ما عنده صلاحية عليه');
      if (!res.ok) throw new Error('GitHub: HTTP ' + res.status);
      return res.json();
    };
    const info = await gh('/repos/' + repo);
    const tree = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(info.default_branch || 'main')}?recursive=1`);
    const items = (tree.tree || []).filter((t) => t.type === 'blob' && tracked(t.path) && t.path !== 'workspace.json');
    let n = 0;
    for (const t of items) {
      const b = await gh(`/repos/${repo}/git/blobs/${t.sha}`);
      const bin = atob(String(b.content).replace(/\s/g, ''));
      const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      await S.writeText(t.path, text); // يمر عبر changed() فيُرفع إلى Firebase
      n++;
    }
    ['im-github', 'im-github-pending', 'im-github-shas'].forEach((k) => localStorage.removeItem(k));
    await flush().catch(() => {});
    return n;
  }

  if (A()) A().onUnlock(() => { notifyCount(); });

  window.Cloud = {
    get status() { return status; },
    get pendingCount() { return Object.keys(pending).length; },
    get active() { return active; },
    get config() { const s = A() && A().session; return { email: s && s.email, projectId: s && s.projectId, cloudOnly: !!load('im-firebase', {}).cloudOnly }; },
    configure(next) { const c = load('im-firebase', {}); if ('cloudOnly' in next) c.cloudOnly = !!next.cloudOnly; save('im-firebase', c); },
    signedIn, changed, flush, pull, sync, uploadAll, downloadAll, attachFolder, openCloudWorkspace, importFromGitHub,
    onStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); },
  };
})();
