/*
 * store.js — بيانات البرنامج فوق طبقة الحفظ
 *
 * ترتيب مجلد العمل:
 *   workspace.json                 علامة المجلد ونسخة البيانات
 *   settings/settings.json         بيانات الجهة، العملة، المقاس الافتراضي...
 *   settings/counters.json         آخر رقم لكل نوع مستند
 *   templates/<id>.json            القوالب المضافة (القوالب الأساسية مدمجة في البرنامج)
 *   documents/<type>/<year>/<type>-<number>.json   المستندات الصادرة
 *   audit/<YYYY-MM>/<time>-<id>.json                سجل العمليات (ملف لكل عملية، لا يُعدَّل)
 *   backups/                                         نسخ تلقائية قبل ترحيل البيانات
 */
(function () {
  'use strict';
  const S = window.Storage;

  /*
   * نسخة بنية البيانات:
   *  1 — الأصلية.
   *  2 — مواد بخصم/ضريبة/رمز، دفعات متعددة على الفاتورة، تاريخ استحقاق، إلغاء المستند،
   *      وصل يسدد أكثر من فاتورة (allocations)، سجل العمليات.
   * كل الحقول الجديدة اختيارية، فالمستندات القديمة تُقرأ كما هي بدون تحويل.
   */
  const WORKSPACE_VERSION = 2;

  /** طرق الدفع الافتراضية (قابلة للتعديل من الإعدادات) */
  const PAY_METHODS = ['نقداً', 'تحويل مصرفي', 'إيداع مصرفي', 'بطاقة', 'POS', 'دفع إلكتروني', 'صك', 'آجل'];

  /** أنواع المستندات. يمكن إضافة أنواع جديدة هنا لاحقاً. */
  const DOC_TYPES = {
    sales:   { label: 'فاتورة مبيعات', prefix: 'INV' },
    receipt: { label: 'وصل قبض',      prefix: 'RCV' },
  };

  const PAPER_SIZES = {
    A4: { label: 'A4', width: 210, height: 297 },
    A5: { label: 'A5', width: 148, height: 210 },
    Letter: { label: 'Letter', width: 215.9, height: 279.4 },
    T80: { label: 'حراري 80 ملم', width: 80, height: 0 },
    T58: { label: 'حراري 58 ملم', width: 58, height: 0 },
  };
  const SIZE_LABELS = { A4: 'A4', A5: 'A5', Letter: 'Letter (أمريكي)', T80: 'حراري 80 ملم (كاشير)', T58: 'حراري 58 ملم (صغير)' };

  /** إعدادات التصميم العامة لكل المستندات */
  const DEFAULT_DESIGN = {
    font: 'cairo', scale: 100, logo: 'm', margin: '', table: 'bordered',
    cols: { code: false, unit: true, notes: true, disc: false, tax: false },
    signs: true, stamp: true, footerText: '',
  };

  const CURRENCIES = {
    IQD: { label: 'دينار عراقي', symbol: 'د.ع', decimals: 0 },
    USD: { label: 'دولار أمريكي', symbol: '$', decimals: 2 },
  };

  const DEFAULT_SETTINGS = {
    company: {
      name: '', subtitle: '', address: '', phone: '', email: '',
      logo: '',        // صورة بصيغة data URL
      logoSymbol: '',  // حروف تظهر مكان الشعار إذا لم توجد صورة
      logoText: '',    // نص لاتيني صغير تحت الحروف
    },
    defaults: { currency: 'IQD', size: 'A4', templateId: 'classic', watermark: true },
    titles: Object.fromEntries(Object.entries(DOC_TYPES).map(([k, v]) => [k, v.label])),
    templateThemes: {}, // ألوان مخصصة لكل قالب: { classic: { primary, dark, accent } }
    prefixes: Object.fromEntries(Object.entries(DOC_TYPES).map(([k, v]) => [k, v.prefix])),
    payMethods: PAY_METHODS.join('\n'),             // سطر لكل طريقة
    tax: { enabled: '', label: 'الضريبة', rate: '' }, // الضريبة معطّلة افتراضياً
    invoice: { dueDays: '' },                         // مدة الاستحقاق الافتراضية بالأيام (فارغ = بدون)
    design: DEFAULT_DESIGN,
  };

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const k in over || {}) {
      const b = base ? base[k] : undefined;
      const o = over[k];
      out[k] = b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' ? merge(b, o) : o;
    }
    return out;
  }

  // ---------- تهيئة مجلد العمل ----------
  async function initWorkspace() {
    for (const d of ['settings', 'templates', 'documents']) await S.ensureDir(d);
    for (const t of Object.keys(DOC_TYPES)) await S.ensureDir('documents/' + t);
    if (!(await S.exists('workspace.json'))) {
      await S.writeJSON('workspace.json', {
        app: 'invoice-manager', version: WORKSPACE_VERSION, createdAt: new Date().toISOString(),
      });
    }
    if (!(await S.exists('settings/settings.json'))) await S.writeJSON('settings/settings.json', DEFAULT_SETTINGS);
    if (!(await S.exists('settings/counters.json'))) await S.writeJSON('settings/counters.json', {});
    await migrate();
  }

  // ---------- ترحيل البيانات ----------
  /**
   * ترحيل غير هدّام: نأخذ نسخة كاملة أولاً، نتحقق أن كل المستندات مقروءة، ثم نرفع رقم النسخة.
   * لا يُعاد كتابة أي مستند. إذا انقطع الترحيل يُعاد من البداية بأمان في المرة القادمة.
   */
  let migrated = false;
  async function migrate() {
    const ws = await S.readJSON('workspace.json', {});
    const from = Number(ws.version) || 1;
    if (from >= WORKSPACE_VERSION || migrated) return { from, to: from };
    const backup = await exportAll();
    const n = Object.keys(backup.files).filter((p) => p.startsWith('documents/')).length;
    const bpath = `backups/before-v${WORKSPACE_VERSION}-${new Date().toISOString().slice(0, 10)}.json`;
    await S.ensureDir('backups');
    if (!(await S.exists(bpath))) await S.writeJSON(bpath, backup);
    // تحقق: كل مستند فيه نوع ورقم
    const bad = Object.entries(backup.files).filter(([p, d]) => p.startsWith('documents/') && !(d && d.type && d.number));
    if (bad.length) console.warn('مستندات ناقصة (تبقى كما هي):', bad.map(([p]) => p));
    await S.writeJSON('workspace.json', { ...ws, version: WORKSPACE_VERSION, migratedAt: new Date().toISOString(), migratedFrom: from, migrationBackup: bpath });
    migrated = true;
    await audit('migrate', { label: `ترحيل البيانات من النسخة ${from} إلى ${WORKSPACE_VERSION} (${n} مستند، نسخة احتياطية: ${bpath})` });
    return { from, to: WORKSPACE_VERSION, docs: n, backup: bpath };
  }

  // ---------- سجل العمليات ----------
  /** نص مختصر يميّز المستند في السجل */
  function docLabel(d) {
    if (!d || !d.type) return '';
    const s = cachedSettings || DEFAULT_SETTINGS;
    const p = (s.prefixes && s.prefixes[d.type]) || '';
    return (p ? p + '-' : '') + String(d.number).padStart(5, '0') + (d.data && d.data.customer ? ' — ' + d.data.customer : '');
  }
  /**
   * يضيف عملية للسجل. كل عملية ملف مستقل (لا تتعارض الأجهزة ولا يُكتب فوق عملية سابقة).
   * entry: { label, path, before, after }
   */
  async function audit(action, entry = {}) {
    try {
      const at = new Date().toISOString();
      const id = Math.random().toString(36).slice(2, 8);
      const user = (window.Auth && window.Auth.user) || '';
      const rec = { at, user, action, path: entry.path || '', label: entry.label || docLabel(entry.after || entry.before), before: entry.before || null, after: entry.after || null };
      await S.writeJSON(`audit/${at.slice(0, 7)}/${at.replace(/[:.]/g, '-')}-${id}.json`, rec);
    } catch (e) { console.warn('تعذّر تسجيل العملية', e); }
  }
  async function listAudit(month) {
    const out = [];
    for (const p of await S.walkJSON(month ? 'audit/' + month : 'audit')) {
      try { out.push({ ...(await S.readJSON(p)), _path: p }); } catch (e) { /* تخطي */ }
    }
    return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  // ---------- الإعدادات ----------
  let cachedSettings = null;
  async function getSettings() {
    return (cachedSettings = merge(DEFAULT_SETTINGS, await S.readJSON('settings/settings.json', {})));
  }
  /** الحقول التي تغيّرت فقط (بدون الشعار لأنه صورة كبيرة) */
  function diff(a, b, pre = '', out = {}) {
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      if (k === 'logo' || k === 'memory') continue;
      const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
      if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) diff(x, y, pre + k + '.', out);
      else if (JSON.stringify(x) !== JSON.stringify(y)) out[pre + k] = [x === undefined ? null : x, y === undefined ? null : y];
    }
    return out;
  }
  async function saveSettings(settings, opts = {}) {
    const before = cachedSettings;
    await S.writeJSON('settings/settings.json', settings);
    cachedSettings = settings;
    if (!opts.quiet && before) {
      const d = diff(before, settings);
      if (Object.keys(d).length) await audit('settings', { label: 'تعديل الإعدادات: ' + Object.keys(d).join('، '), before: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v[0]])), after: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v[1]])) });
    }
    return settings;
  }
  function payMethods(settings) {
    const s = settings || cachedSettings || DEFAULT_SETTINGS;
    const list = String(s.payMethods || '').split('\n').map((x) => x.trim()).filter(Boolean);
    return list.length ? list : PAY_METHODS;
  }

  // ---------- الترقيم ----------
  async function peekNumber(type) {
    const counters = await S.readJSON('settings/counters.json', {});
    return (counters[type] || 0) + 1;
  }
  /** يحجز الرقم التالي ويحفظه. */
  async function takeNumber(type) {
    const counters = await S.readJSON('settings/counters.json', {});
    const n = (counters[type] || 0) + 1;
    counters[type] = n;
    await S.writeJSON('settings/counters.json', counters);
    return n;
  }
  /** إذا أدخل المستخدم رقماً يدوياً أعلى من العداد، نرفع العداد حتى لا يتكرر. */
  async function bumpCounter(type, n) {
    const counters = await S.readJSON('settings/counters.json', {});
    if (!counters[type] || n > counters[type]) {
      counters[type] = n;
      await S.writeJSON('settings/counters.json', counters);
    }
  }

  // ---------- المستندات ----------
  function docPath(doc) {
    const year = (doc.date || new Date().toISOString()).slice(0, 4);
    return `documents/${doc.type}/${year}/${doc.type}-${String(doc.number).padStart(5, '0')}.json`;
  }

  /**
   * يحفظ مستنداً. إذا لم يكن له رقم يأخذ الرقم التالي تلقائياً.
   * شكل المستند:
   *   { type, number, date, templateId, size, currency, data: {...} }
   */
  async function saveDocument(doc, opts = {}) {
    if (!DOC_TYPES[doc.type]) throw new Error('نوع مستند غير معروف: ' + doc.type);
    let before = null;
    if (doc._path) { try { before = await S.readJSON(doc._path); } catch (e) { before = null; } }
    const now = new Date().toISOString();
    const out = { ...doc };
    if (!out.number) out.number = await takeNumber(out.type);
    else await bumpCounter(out.type, Number(out.number));
    out.date = out.date || now.slice(0, 10);
    out.createdAt = out.createdAt || now;
    out.updatedAt = now;
    // إذا تغيّرت السنة أو الرقم عند التعديل، نحذف الملف القديم
    if (doc._path && doc._path !== docPath(out)) {
      try { await S.remove(doc._path); } catch (e) { /* غير موجود */ }
    }
    delete out._path;
    const path = docPath(out);
    // لا نكتب فوق مستند آخر يحمل نفس الرقم
    if (path !== doc._path && (await S.exists(path))) {
      throw new Error(`يوجد مستند بنفس الرقم ${out.number} في هذه السنة`);
    }
    out.schema = WORKSPACE_VERSION;
    await S.writeJSON(path, out);
    await audit(opts.action || (before ? 'update' : 'create'), { path, before, after: out });
    return { ...out, _path: path };
  }

  async function loadDocument(path) {
    return { ...(await S.readJSON(path)), _path: path };
  }

  /** الحذف يحفظ نسخة كاملة من المستند في سجل العمليات، فلا تضيع الحركة المالية */
  async function deleteDocument(path) {
    let before = null;
    try { before = await S.readJSON(path); } catch (e) { before = null; }
    await S.remove(path);
    await audit('delete', { path, before });
  }

  /** إلغاء مستند صادر: يبقى بالأرشيف بحالة "ملغى" ولا يدخل في الحسابات */
  async function setCancelled(doc, cancelled, reason) {
    const out = JSON.parse(JSON.stringify(doc));
    if (cancelled) { out.status = 'cancelled'; out.cancelledAt = new Date().toISOString(); out.cancelReason = reason || ''; }
    else { delete out.status; delete out.cancelledAt; delete out.cancelReason; }
    out._path = doc._path;
    return saveDocument(out, { action: cancelled ? 'cancel' : 'restore' });
  }

  /** يرجع مستنداً محذوفاً من سجل العمليات */
  async function restoreDeleted(rec) {
    if (!rec || !rec.before || !rec.path) throw new Error('لا توجد نسخة لهذا المستند في السجل');
    if (await S.exists(rec.path)) throw new Error('يوجد مستند بنفس الرقم حالياً');
    await S.writeJSON(rec.path, rec.before);
    await audit('undelete', { path: rec.path, after: rec.before });
  }

  /** كل المستندات، الأحدث أولاً. type اختياري. */
  async function listDocuments(type) {
    const roots = type ? ['documents/' + type] : Object.keys(DOC_TYPES).map((t) => 'documents/' + t);
    const docs = [];
    for (const r of roots) {
      for (const p of await S.walkJSON(r)) {
        try { docs.push({ ...(await S.readJSON(p)), _path: p }); }
        catch (e) { console.warn('تعذّرت قراءة', p, e); }
      }
    }
    docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number - a.number));
    return docs;
  }

  // ---------- القوالب ----------
  // القوالب الأساسية تُسجَّل من ملفات app/templates/*.js عبر Store.registerTemplate
  const builtinTemplates = {};
  function registerTemplate(tpl) { builtinTemplates[tpl.id] = { ...tpl, builtin: true }; }

  async function listTemplates(type) {
    const all = { ...builtinTemplates };
    for (const e of await S.list('templates')) {
      if (e.kind !== 'file' || !e.name.endsWith('.json')) continue;
      try {
        const t = await S.readJSON('templates/' + e.name);
        if (t && t.id) all[t.id] = { ...window.Render.compileTemplate(t), builtin: false, file: 'templates/' + e.name };
      } catch (err) { console.warn('قالب تالف', e.name, err); }
    }
    return Object.values(all).filter((t) => !type || (t.types || []).includes(type));
  }

  async function saveTemplate(tpl) {
    if (!tpl.id) throw new Error('القالب يحتاج معرّف id');
    if (builtinTemplates[tpl.id]) throw new Error('يوجد قالب أساسي بنفس المعرّف: ' + tpl.id);
    window.Render.compileTemplate(tpl); // يتأكد أن القالب صالح قبل الحفظ
    await S.writeJSON('templates/' + tpl.id + '.json', tpl);
  }

  async function deleteTemplate(id) { await S.remove('templates/' + id + '.json'); }

  // ---------- النسخ الاحتياطي ----------
  /** ملف واحد يحتوي كل شيء، للتصدير أو النقل */
  async function exportAll() {
    const files = {};
    for (const p of [
      'workspace.json',
      ...(await S.walkJSON('settings')),
      ...(await S.walkJSON('templates')),
      ...(await S.walkJSON('documents')),
      ...(await S.walkJSON('audit')),
    ]) {
      try { files[p] = await S.readJSON(p); } catch (e) { /* تخطي */ }
    }
    return { app: 'invoice-manager', exportedAt: new Date().toISOString(), files };
  }

  window.Store = {
    DOC_TYPES, PAPER_SIZES, SIZE_LABELS, CURRENCIES, DEFAULT_SETTINGS, DEFAULT_DESIGN, WORKSPACE_VERSION, PAY_METHODS,
    initWorkspace, migrate,
    getSettings, saveSettings, payMethods,
    peekNumber, takeNumber,
    docPath, saveDocument, loadDocument, deleteDocument, listDocuments, setCancelled, restoreDeleted,
    audit, listAudit, docLabel,
    registerTemplate, listTemplates, saveTemplate, deleteTemplate,
    exportAll,
  };
})();
