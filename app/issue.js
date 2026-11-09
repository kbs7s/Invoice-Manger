/*
 * issue.js — شاشة إصدار المستندات: نموذج الإدخال، المعاينة المباشرة، الحفظ والطباعة
 */
(function () {
  'use strict';
  const St = window.Store;
  const R = window.Render;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const App = () => window.App;
  const esc = (s) => R.esc(s);
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  // الحقول النصية البسيطة في data
  const TEXT_FIELDS = ['customer', 'paymentMethod', 'transactionType', 'discount', 'paid', 'terms',
    'amount', 'purpose', 'notes', 'amountWords', 'receiver', 'accountant'];

  let cur = null;        // المستند الحالي
  let templates = [];
  let dirty = false;
  let wired = false;

  function settings() { return App().settings; }

  function blankItem() { return { name: '', qty: '', unit: '', price: '', notes: '' }; }

  /** مستند جديد مع تذكّر آخر القيم المستخدمة لكل نوع (الشروط، المحاسب...) */
  function newDoc(type) {
    const s = settings();
    type = type || (cur && cur.type) || 'sales';
    const mem = (s.memory && s.memory[type]) || {};
    return {
      type,
      number: '',
      date: today(),
      templateId: (cur && cur.templateId) || s.defaults.templateId || 'classic',
      size: (cur && cur.size) || s.defaults.size || 'A4',
      currency: (cur && cur.currency) || s.defaults.currency || 'IQD',
      watermark: s.defaults.watermark !== false,
      data: {
        customer: '', paymentMethod: mem.paymentMethod || 'نقداً', transactionType: '',
        items: type === 'sales' ? [blankItem(), blankItem(), blankItem()] : [],
        discount: '', paid: '', terms: mem.terms || '',
        amount: '', purpose: '', notes: '', amountWords: '',
        receiver: '', accountant: mem.accountant || '',
      },
    };
  }

  // ---------- تعبئة النموذج ----------
  function fillSelect(sel, entries, value) {
    sel.innerHTML = entries.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    if (value != null) sel.value = value;
  }

  function templateFor(doc) {
    return templates.find((t) => t.id === doc.templateId && (t.types || []).includes(doc.type)) ||
      templates.find((t) => (t.types || []).includes(doc.type));
  }

  function fillSelectors() {
    const editing = !!cur._path;
    fillSelect($('#f-type'), Object.entries(St.DOC_TYPES).map(([k, v]) => [k, v.label]), cur.type);
    $('#f-type').disabled = editing;
    const tpls = templates.filter((t) => (t.types || []).includes(cur.type));
    const tpl = templateFor(cur);
    cur.templateId = tpl ? tpl.id : cur.templateId;
    fillSelect($('#f-template'), tpls.map((t) => [t.id, t.name]), cur.templateId);
    const sizes = (tpl && tpl.sizes) || ['A4'];
    if (!sizes.includes(cur.size)) cur.size = sizes[0];
    fillSelect($('#f-size'), sizes.map((k) => [k, k + (cur.type === 'receipt' ? (k === 'A4' ? ' — وصلين بالورقة' : ' — أفقي') : '')]), cur.size);
    fillSelect($('#f-currency'), Object.entries(St.CURRENCIES).map(([k, v]) => [k, `${v.label} (${v.symbol})`]), cur.currency);
  }

  async function fillForm() {
    fillSelectors();
    $('#f-number').value = cur.number || '';
    const next = await St.peekNumber(cur.type);
    $('#f-number').placeholder = cur._path ? '' : `تلقائي: ${next}`;
    $('#f-date').value = cur.date || today();
    for (const k of TEXT_FIELDS) { const el = $('#f-' + k); if (el) el.value = cur.data[k] == null ? '' : cur.data[k]; }
    $('#f-watermark').checked = cur.watermark !== false;
    $$('#issue-form [data-for]').forEach((el) => { el.hidden = el.dataset.for !== cur.type; });
    renderItems();
    updateHeader();
    const c = settings().company || {};
    $('#issue-company-notice').hidden = !!(c.name || c.logo);
    refresh();
  }

  function updateHeader() {
    const label = St.DOC_TYPES[cur.type].label;
    if (cur._path) {
      $('#issue-title').textContent = `تعديل ${label} رقم ${App().formatNumber(cur.type, cur.number, settings())}`;
      $('#issue-status').textContent = 'محفوظ في: ' + cur._path + (dirty ? ' — فيه تغييرات غير محفوظة' : '');
    } else {
      $('#issue-title').textContent = label + (cur.type === 'receipt' ? ' جديد' : ' جديدة');
      $('#issue-status').textContent = dirty ? 'غير محفوظ بعد' : '';
    }
  }

  // ---------- جدول المواد ----------
  function renderItems() {
    const items = cur.data.items || (cur.data.items = []);
    $('#items-editor').innerHTML = `
      <div class="it-row it-head"><span>#</span><span>المادة</span><span>الكمية</span><span>الوحدة</span><span>السعر</span><span>ملاحظات</span><span></span></div>` +
      items.map((it, i) => `
      <div class="it-row" data-i="${i}">
        <span class="it-idx">${i + 1}</span>
        <input data-k="name" value="${esc(it.name)}" placeholder="اسم المادة">
        <input data-k="qty" value="${esc(it.qty)}" inputmode="decimal" dir="ltr">
        <input data-k="unit" value="${esc(it.unit)}" list="units-list">
        <input data-k="price" value="${esc(it.price)}" inputmode="decimal" dir="ltr">
        <input data-k="notes" value="${esc(it.notes)}">
        <button type="button" class="it-del" title="حذف">✕</button>
      </div>`).join('') +
      '<datalist id="units-list"><option value="قطعة"><option value="علبة"><option value="كارتون"><option value="جهاز"><option value="كيلو"><option value="متر"><option value="لتر"><option value="رزمة"></datalist>';
  }

  // ---------- الحسابات والمعاينة ----------
  function readForm() {
    cur.type = $('#f-type').value;
    cur.templateId = $('#f-template').value;
    cur.size = $('#f-size').value;
    cur.currency = $('#f-currency').value;
    cur.number = $('#f-number').value ? Number($('#f-number').value) : '';
    cur.date = $('#f-date').value || today();
    cur.watermark = $('#f-watermark').checked;
    for (const k of TEXT_FIELDS) { const el = $('#f-' + k); if (el) cur.data[k] = el.value.trim(); }
  }

  let raf = 0;
  function refresh() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const tpl = templateFor(cur);
      if (!tpl) return;
      const t = R.totals(cur);
      const auto = R.tafqeet(t.total, cur.currency);
      $('#f-amountWords').placeholder = auto;
      const box = $('#totals-box');
      box.innerHTML = cur.type === 'sales'
        ? `<div><span>المجموع</span><b>${R.money(t.subtotal, cur.currency)}</b></div>
           <div><span>بعد الخصم</span><b>${R.money(t.net, cur.currency)}</b></div>
           <div><span>الواصل</span><b class="green">${R.money(t.paid, cur.currency)}</b></div>
           <div><span>المتبقي</span><b class="${t.remaining > 0 ? 'red' : ''}">${R.money(t.remaining, cur.currency)}</b></div>`
        : `<div><span>المبلغ</span><b>${R.money(t.total, cur.currency)}</b></div>`;
      // نعرض الرقم التالي في المعاينة إذا كان المستند جديداً
      const shown = { ...cur, number: cur.number || Number(($('#f-number').placeholder.match(/\d+/) || [0])[0]) || '' };
      const r = R.renderPages(shown, tpl, settings(), { watermark: cur.watermark });
      $('#issue-preview').innerHTML = r.html;
      updateHeader();
    });
  }

  function markDirty() { dirty = true; refresh(); }

  // ---------- الحفظ والطباعة ----------
  function validate() {
    if (!cur.data.customer) return 'اكتب اسم السيد / الجهة';
    if (cur.type === 'sales' && !(cur.data.items || []).some((it) => it.name)) return 'أضف مادة واحدة على الأقل';
    if (cur.type === 'receipt' && !(R.totals(cur).total > 0)) return 'اكتب المبلغ';
    return '';
  }

  async function save() {
    readForm();
    const err = validate();
    if (err) { App().toast(err, true); return null; }
    const out = JSON.parse(JSON.stringify(cur));
    const toNum = (v) => (v === '' || v == null ? '' : (isFinite(Number(String(v).replace(/,/g, ''))) ? Number(String(v).replace(/,/g, '')) : v));
    out.data.items = (out.data.items || []).filter((it) => it.name || it.qty || it.price)
      .map((it) => ({ ...it, qty: toNum(it.qty), price: toNum(it.price) }));
    for (const k of ['discount', 'paid', 'amount']) out.data[k] = toNum(out.data[k]);
    out.data.total = R.totals(out).total;
    if (cur._path) out._path = cur._path;
    const saved = await St.saveDocument(out);
    // تذكّر القيم المتكررة للمرة القادمة
    const s = JSON.parse(JSON.stringify(settings()));
    s.memory = s.memory || {};
    s.memory[cur.type] = { paymentMethod: out.data.paymentMethod, terms: out.data.terms, accountant: out.data.accountant };
    s.defaults.templateId = out.templateId;
    s.defaults.size = out.size;
    App().settings = await St.saveSettings(s);
    cur = saved;
    if (!cur.data.items || !cur.data.items.length) cur.data.items = cur.type === 'sales' ? [blankItem()] : [];
    dirty = false;
    await fillForm();
    loadCustomers();
    App().toast('تم الحفظ: ' + App().formatNumber(cur.type, cur.number, settings()));
    return saved;
  }

  function print() {
    readForm();
    const tpl = templateFor(cur);
    const shown = { ...cur, number: cur.number || '' };
    R.print(R.renderPages(shown, tpl, settings(), { watermark: cur.watermark }));
  }

  // ---------- أسماء العملاء من الأرشيف ----------
  async function loadCustomers() {
    try {
      const docs = await St.listDocuments();
      const names = [...new Set(docs.map((d) => d.data && d.data.customer).filter(Boolean))];
      $('#customers-list').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
    } catch (e) { /* غير مهم */ }
  }

  // ---------- ربط الأحداث ----------
  function wire() {
    if (wired) return;
    wired = true;
    const form = $('#issue-form');
    form.addEventListener('input', (e) => {
      const row = e.target.closest('.it-row');
      if (row && e.target.dataset.k) {
        cur.data.items[Number(row.dataset.i)][e.target.dataset.k] = e.target.value;
      } else if (e.target.id !== 'f-type') {
        readForm();
      }
      markDirty();
    });
    form.addEventListener('change', async (e) => {
      if (e.target.id === 'f-type') {
        cur = newDoc(e.target.value); dirty = false; await fillForm();
      } else if (e.target.id === 'f-template') {
        readForm(); fillSelectors(); markDirty();
      }
    });
    form.addEventListener('click', (e) => {
      const del = e.target.closest('.it-del');
      if (!del) return;
      cur.data.items.splice(Number(del.closest('.it-row').dataset.i), 1);
      if (!cur.data.items.length) cur.data.items.push(blankItem());
      renderItems(); markDirty();
    });
    // Enter في آخر سطر مواد يضيف سطراً جديداً
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.closest('.it-row')) return;
      e.preventDefault();
      const row = e.target.closest('.it-row');
      const i = Number(row.dataset.i);
      if (i === cur.data.items.length - 1) { cur.data.items.push(blankItem()); renderItems(); }
      const next = $(`.it-row[data-i="${i + 1}"] input[data-k="name"]`);
      if (next) next.focus();
    });
    $('#issue-company-notice').addEventListener('click', (e) => { if (e.target.dataset.goto) App().switchTab(e.target.dataset.goto); });
    $('#btn-add-item').addEventListener('click', () => {
      cur.data.items.push(blankItem()); renderItems();
      const inputs = $$('.it-row input[data-k="name"]'); inputs[inputs.length - 1].focus();
    });
    $('#btn-words-auto').addEventListener('click', () => { $('#f-amountWords').value = ''; readForm(); markDirty(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); save().catch((err) => App().toast('تعذّر الحفظ: ' + err.message, true)); });
    $('#btn-save-print').addEventListener('click', () => save().then((d) => d && print()).catch((err) => App().toast('تعذّر الحفظ: ' + err.message, true)));
    $('#btn-print-only').addEventListener('click', print);
    $('#btn-new').addEventListener('click', async () => {
      if (dirty && !confirm('فيه تغييرات غير محفوظة. تريد تبدأ مستند جديد؟')) return;
      cur = newDoc(cur.type); dirty = false; await fillForm();
    });
    // Ctrl+S للحفظ و Ctrl+P للطباعة داخل شاشة الإصدار
    document.addEventListener('keydown', (e) => {
      if ($('[data-panel="issue"]').hidden || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); form.requestSubmit(); }
      if (k === 'p') { e.preventDefault(); print(); }
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  // ---------- الواجهة العامة ----------
  async function render() {
    wire();
    templates = await St.listTemplates();
    if (!cur) cur = newDoc('sales');
    await fillForm();
    loadCustomers();
  }

  /** يفتح مستنداً من الأرشيف للتعديل، أو نسخة منه كمستند جديد */
  async function open(doc, asCopy) {
    if (dirty && !confirm('فيه تغييرات غير محفوظة بالمستند الحالي. تكمل؟')) return false;
    const d = JSON.parse(JSON.stringify(doc));
    if (asCopy) { delete d._path; delete d.createdAt; delete d.updatedAt; d.number = ''; d.date = today(); }
    if (d.type === 'sales' && !(d.data.items || []).length) d.data.items = [blankItem()];
    cur = d;
    dirty = !!asCopy;
    return true;
  }

  window.Issue = { render, open, get current() { return cur; } };
})();
