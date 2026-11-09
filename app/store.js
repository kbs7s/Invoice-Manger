/*
 * store.js — بيانات البرنامج فوق طبقة الحفظ
 *
 * ترتيب مجلد العمل:
 *   workspace.json                 علامة المجلد ونسخة البيانات
 *   settings/settings.json         بيانات الجهة، العملة، المقاس الافتراضي...
 *   settings/counters.json         آخر رقم لكل نوع مستند
 *   templates/<id>.json            القوالب المضافة (القوالب الأساسية مدمجة في البرنامج)
 *   documents/<type>/<year>/<type>-<number>.json   المستندات الصادرة
 */
(function () {
  'use strict';
  const S = window.Storage;

  const WORKSPACE_VERSION = 1;

  /** أنواع المستندات. يمكن إضافة أنواع جديدة هنا لاحقاً. */
  const DOC_TYPES = {
    sales:   { label: 'فاتورة مبيعات', prefix: 'INV' },
    receipt: { label: 'وصل قبض',      prefix: 'RCV' },
  };

  const PAPER_SIZES = {
    A4: { label: 'A4', width: 210, height: 297 },
    A5: { label: 'A5', width: 148, height: 210 },
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
  }

  // ---------- الإعدادات ----------
  async function getSettings() {
    return merge(DEFAULT_SETTINGS, await S.readJSON('settings/settings.json', {}));
  }
  async function saveSettings(settings) {
    await S.writeJSON('settings/settings.json', settings);
    return settings;
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
  async function saveDocument(doc) {
    if (!DOC_TYPES[doc.type]) throw new Error('نوع مستند غير معروف: ' + doc.type);
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
    await S.writeJSON(path, out);
    return { ...out, _path: path };
  }

  async function loadDocument(path) {
    return { ...(await S.readJSON(path)), _path: path };
  }

  async function deleteDocument(path) { await S.remove(path); }

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
        if (t && t.id) all[t.id] = { ...t, builtin: false };
      } catch (err) { console.warn('قالب تالف', e.name, err); }
    }
    return Object.values(all).filter((t) => !type || (t.types || []).includes(type));
  }

  async function saveTemplate(tpl) {
    if (!tpl.id) throw new Error('القالب يحتاج معرّف id');
    await S.writeJSON('templates/' + tpl.id + '.json', tpl);
  }

  // ---------- النسخ الاحتياطي ----------
  /** ملف واحد يحتوي كل شيء، للتصدير أو النقل */
  async function exportAll() {
    const files = {};
    for (const p of [
      'workspace.json',
      ...(await S.walkJSON('settings')),
      ...(await S.walkJSON('templates')),
      ...(await S.walkJSON('documents')),
    ]) {
      try { files[p] = await S.readJSON(p); } catch (e) { /* تخطي */ }
    }
    return { app: 'invoice-manager', exportedAt: new Date().toISOString(), files };
  }

  window.Store = {
    DOC_TYPES, PAPER_SIZES, CURRENCIES, DEFAULT_SETTINGS,
    initWorkspace,
    getSettings, saveSettings,
    peekNumber, takeNumber,
    docPath, saveDocument, loadDocument, deleteDocument, listDocuments,
    registerTemplate, listTemplates, saveTemplate,
    exportAll,
  };
})();
