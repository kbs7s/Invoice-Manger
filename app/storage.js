/*
 * storage.js — طبقة الحفظ على القرص
 *
 * يعتمد على File System Access API (Chrome / Edge):
 *  - المستخدم يختار مجلد العمل مرة واحدة.
 *  - مقبض المجلد (handle) يُحفظ في IndexedDB حتى لا نسأل كل مرة،
 *    ويكفي عند إعادة الفتح أن يضغط المستخدم "متابعة" لإعادة منح الإذن.
 *  - كل البيانات (قوالب، مستندات، إعدادات) تُكتب كملفات JSON داخل المجلد،
 *    فيمكن نقل المجلد كاملاً إلى جهاز آخر.
 */
(function () {
  'use strict';

  const IDB_NAME = 'invoice-manager';
  const IDB_STORE = 'handles';
  const IDB_KEY = 'workspace';

  // ---------- IndexedDB صغير لحفظ مقبض المجلد ----------
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, value) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbDel(key) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- حالة المجلد ----------
  let root = null; // FileSystemDirectoryHandle

  const supported = typeof window.showDirectoryPicker === 'function';

  async function hasPermission(handle, ask) {
    if (!handle.queryPermission) return true; // OPFS لا يحتاج إذناً
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (ask && (await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  /** يحاول استرجاع المجلد المحفوظ. يرجع: 'ready' | 'needs-permission' | 'none' */
  async function restore() {
    let handle;
    try { handle = await idbGet(IDB_KEY); } catch (e) { handle = null; }
    if (!handle) return 'none';
    if (await hasPermission(handle, false)) { root = handle; return 'ready'; }
    pending = handle;
    return 'needs-permission';
  }
  let pending = null;

  /** يُستدعى من ضغطة زر (يحتاج تفاعل المستخدم) لإعادة منح الإذن */
  async function grantPending() {
    if (!pending) return false;
    if (await hasPermission(pending, true)) { root = pending; pending = null; return true; }
    return false;
  }

  /** يفتح نافذة اختيار المجلد */
  async function pick() {
    const handle = await window.showDirectoryPicker({ id: 'invoice-manager', mode: 'readwrite' });
    if (!(await hasPermission(handle, true))) throw new Error('لم يتم منح إذن الكتابة على المجلد');
    await idbSet(IDB_KEY, handle);
    root = handle; mem = null;
    return handle;
  }

  /** للاختبار أو للاستخدام مع مجلد جاهز (مثل OPFS) */
  function useHandle(handle) { root = handle; mem = null; }

  async function forget() { root = null; pending = null; await idbDel(IDB_KEY); }

  function requireRoot() {
    if (!root) throw new Error('لم يتم اختيار مجلد العمل بعد');
    return root;
  }

  // ---------- وضع السحابة فقط (بدون مجلد) ----------
  // الملفات تُحفظ في الذاكرة وتُرفع إلى GitHub عبر cloud.js. يُستخدم على الأجهزة التي لا تدعم المجلدات (مثل الهاتف).
  let mem = null; // Map: path -> text
  function useMemory(entries) { mem = new Map(Object.entries(entries || {})); root = null; }

  // إشعار طبقة المزامنة بكل تغيير (إلا أثناء التنزيل من السحابة)
  let silent = 0;
  function notify(path, op) {
    if (silent || !path.endsWith('.json') || !window.Cloud) return;
    try { window.Cloud.changed(path, op); } catch (e) { console.warn(e); }
  }
  async function quietly(fn) { silent++; try { return await fn(); } finally { silent--; } }

  // ---------- عمليات الملفات ----------
  function split(path) { return path.split('/').filter(Boolean); }
  const norm = (path) => split(path).join('/');
  function memMissing(path) { const e = new Error('الملف غير موجود: ' + path); e.name = 'NotFoundError'; return e; }

  async function dir(path, create) {
    let h = requireRoot();
    for (const part of split(path)) h = await h.getDirectoryHandle(part, { create: !!create });
    return h;
  }

  async function fileHandle(path, create) {
    const parts = split(path);
    const name = parts.pop();
    const d = await dir(parts.join('/'), create);
    return d.getFileHandle(name, { create: !!create });
  }

  async function exists(path) {
    if (mem) return mem.has(norm(path));
    try { await fileHandle(path, false); return true; } catch (e) { return false; }
  }

  async function readText(path) {
    if (mem) { if (!mem.has(norm(path))) throw memMissing(path); return mem.get(norm(path)); }
    const fh = await fileHandle(path, false);
    return (await fh.getFile()).text();
  }

  async function writeText(path, text) {
    if (mem) mem.set(norm(path), text);
    else {
      const fh = await fileHandle(path, true);
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    }
    notify(norm(path), 'put');
  }

  async function readJSON(path, fallback) {
    try { return JSON.parse(await readText(path)); }
    catch (e) {
      if (arguments.length > 1 && (e.name === 'NotFoundError' || e.name === 'TypeError')) return fallback;
      if (arguments.length > 1 && e instanceof SyntaxError) {
        console.warn('ملف JSON تالف:', path, e);
        return fallback;
      }
      throw e;
    }
  }

  function writeJSON(path, obj) {
    return writeText(path, JSON.stringify(obj, null, 2));
  }

  async function remove(path) {
    if (mem) {
      if (!mem.delete(norm(path))) throw memMissing(path);
      return notify(norm(path), 'del');
    }
    const parts = split(path);
    const name = parts.pop();
    const d = await dir(parts.join('/'), false);
    await d.removeEntry(name);
    notify(norm(path), 'del');
  }

  /** يرجع قائمة بالعناصر داخل مسار: [{name, kind}] */
  async function list(path) {
    if (mem) {
      const prefix = norm(path) ? norm(path) + '/' : '';
      const seen = new Map();
      for (const k of mem.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length).split('/');
        seen.set(rest[0], { name: rest[0], kind: rest.length > 1 ? 'directory' : 'file' });
      }
      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    let d;
    try { d = await dir(path, false); } catch (e) { return []; }
    const out = [];
    for await (const [name, h] of d.entries()) out.push({ name, kind: h.kind });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /** كل ملفات JSON تحت مسار بشكل متداخل: ['documents/sales/2026/x.json', ...] */
  async function walkJSON(path) {
    const out = [];
    for (const e of await list(path)) {
      const p = path ? path + '/' + e.name : e.name;
      if (e.kind === 'directory') out.push(...(await walkJSON(p)));
      else if (e.name.endsWith('.json')) out.push(p);
    }
    return out;
  }

  window.Storage = {
    supported,
    restore, grantPending, pick, useHandle, useMemory, forget, quietly,
    get ready() { return !!root || !!mem; },
    get mode() { return mem ? 'cloud' : 'folder'; },
    get folderName() { return mem ? 'GitHub (بدون مجلد)' : root ? root.name : (pending ? pending.name : ''); },
    ensureDir: async (p) => { if (!mem) await dir(p, true); },
    exists, readText, writeText, readJSON, writeJSON, remove, list, walkJSON,
  };
})();
