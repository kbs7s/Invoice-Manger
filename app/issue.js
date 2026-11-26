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
  const TEXT_FIELDS = ['customer', 'customerAddress', 'customerPhone', 'paymentMethod', 'transactionType', 'discount', 'discountPct', 'charges', 'prevBalance', 'terms',
    'amount', 'purpose', 'notes', 'amountWords', 'receiver', 'accountant', 'dueDate', 'reference', 'ref'];
  const NUM_FIELDS = ['discount', 'discountPct', 'charges', 'prevBalance', 'amount'];

  let cur = null;        // المستند الحالي
  let templates = [];
  let dirty = false;
  let wired = false;
  let catalog = {};
  let allDocs = [];
  let codes = {};        // المواد حسب الرمز / الباركود      // كل المستندات مع روابط التسديد (لقائمة الفواتير)

  function settings() { return App().settings; }

  function taxOn() { const t = settings().tax || {}; return !!t.enabled; }
  function blankItem() {
    const it = { code: '', name: '', qty: '', unit: '', pack: '', price: '', discPct: '', disc: '', notes: '' };
    if (taxOn()) it.taxPct = settings().tax.rate || '';
    return it;
  }
  function blankPay(method) { return { method: method || St.payMethods(settings())[0], amount: '', ref: '' }; }
  function addDays(date, n) { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  /** المستندات القديمة: الواصل المكتوب يتحول لسطر دفع واحد */
  function ensurePayments(d) {
    if (d.type !== 'sales') return;
    if (!Array.isArray(d.data.payments) || !d.data.payments.length) {
      d.data.payments = [{ method: d.data.paymentMethod && d.data.paymentMethod !== 'آجل' ? d.data.paymentMethod : St.payMethods(settings())[0], amount: d.data.paid == null ? '' : String(d.data.paid), ref: '' }];
    }
  }

  /** مستند جديد مع تذكّر آخر القيم المستخدمة لكل نوع (الشروط، المحاسب...) */
  function newDoc(type) {
    const s = settings();
    type = type || (cur && cur.type) || 'sales';
    const mem = (s.memory && s.memory[type]) || {};
    const dueDays = Number(s.invoice && s.invoice.dueDays) || 0;
    const doc = {
      type,
      number: '',
      date: today(),
      templateId: (cur && cur.templateId) || s.defaults.templateId || 'classic',
      size: (cur && cur.size) || s.defaults.size || 'A4',
      currency: (cur && cur.currency) || s.defaults.currency || 'IQD',
      watermark: s.defaults.watermark !== false,
      data: {
        customer: '', customerAddress: '', customerPhone: '', prevBalance: '', paymentMethod: mem.paymentMethod || St.payMethods(s)[0], transactionType: '',
        items: type === 'sales' ? [blankItem(), blankItem(), blankItem()] : [],
        discount: '', discountPct: '', charges: '', paid: '', terms: mem.terms || '',
        amount: '', purpose: '', notes: '', amountWords: '', invoiceNo: '', ref: '', reference: '',
        dueDate: type === 'sales' && dueDays ? addDays(today(), dueDays) : '',
        receiver: '', accountant: mem.accountant || '',
      },
    };
    if (type === 'sales') doc.data.payments = [blankPay(mem.paymentMethod && mem.paymentMethod !== 'آجل' ? mem.paymentMethod.split(' + ')[0] : '')];
    return doc;
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
    fillSelect($('#f-size'), sizes.map((k) => [k, (St.SIZE_LABELS[k] || k) + (cur.type === 'receipt' ? (k === 'A4' || k === 'Letter' ? ' — وصلين بالورقة' : k === 'A5' ? ' — أفقي' : '') : '')]), cur.size);
    fillSelect($('#f-currency'), Object.entries(St.CURRENCIES).map(([k, v]) => [k, `${v.label} (${v.symbol})`]), cur.currency);
    const methods = St.payMethods(settings());
    const pm = cur.data.paymentMethod;
    fillSelect($('#f-paymentMethod'), methods.concat(pm && !methods.includes(pm) ? [pm] : []).map((m) => [m, m]), pm || methods[0]);
  }

  async function fillForm() {
    ensurePayments(cur);
    fillSelectors();
    $('#f-number').value = cur.number || '';
    const next = await St.peekNumber(cur.type);
    $('#f-number').placeholder = cur._path ? '' : `تلقائي: ${next}`;
    $('#f-date').value = cur.date || today();
    for (const k of TEXT_FIELDS) { const el = $('#f-' + k); if (el) el.value = cur.data[k] == null ? '' : cur.data[k]; }
    $('#f-watermark').checked = cur.watermark !== false;
    fillInvoiceSelect();
    $$('#issue-form [data-for]').forEach((el) => { el.hidden = el.dataset.for !== cur.type; });
    $('#fs-last-n').textContent = cur.type === 'sales' ? '5' : '4';
    renderItems();
    renderPays();
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
  /** الأعمدة الظاهرة بالمحرر: حسب التصميم + ما يختاره المستخدم بهذا الجهاز + أي عمود فيه قيمة */
  function editorCols() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('im-editor-cols')) || {}; } catch (e) { saved = {}; }
    const dc = (settings().design && settings().design.cols) || {};
    const items = cur.data.items || [];
    const has = (k) => items.some((it) => it[k] !== '' && it[k] != null && Number(it[k]) !== 0);
    const pick = (k, def) => (k in saved ? saved[k] : def);
    const tpl = templateFor(cur);
    return {
      code: pick('code', !!dc.code) || has('code'),
      unit: pick('unit', dc.unit !== false),
      pack: !!(tpl && (tpl.itemFields || []).includes('pack')),
      disc: pick('disc', !!dc.disc) || has('discPct') || has('disc'),
      tax: taxOn() || has('taxPct'),
      notes: pick('notes', dc.notes !== false),
    };
  }
  const COL_LABELS = { code: 'الرمز', unit: 'الوحدة', disc: 'الخصم', notes: 'الملاحظات' };
  function discText(it) { return it.discPct !== '' && it.discPct != null && Number(it.discPct) ? it.discPct + '%' : (it.disc == null ? '' : it.disc); }

  function renderItems() {
    const items = cur.data.items || (cur.data.items = []);
    const c = editorCols();
    const ed = $('#items-editor');
    // العرض النسبي لكل عمود
    const spec = [['idx', '22px'], ['code', '.8fr'], ['name', '2.4fr'], ['qty', '.7fr'], ['unit', '.8fr'], ['pack', '.7fr'], ['price', '1.1fr'],
      ['disc', '.8fr'], ['tax', '.6fr'], ['total', '1.1fr'], ['notes', '1.1fr'], ['acts', '64px']]
      .filter(([k]) => !(k in c) || c[k]);
    const grid = `grid-template-columns:${spec.map((x) => x[1]).join(' ')}`;
    const head = { idx: '#', code: 'الرمز', name: 'المادة', qty: 'الكمية', unit: 'الوحدة', pack: 'التعبئة', price: 'السعر', disc: 'خصم', tax: 'ضريبة %', total: 'المجموع', notes: 'ملاحظات', acts: '' };
    const cell = (k, it, i) => ({
      idx: `<span class="it-idx">${i + 1}</span>`,
      code: `<input data-k="code" value="${esc(it.code)}" dir="ltr" placeholder="SKU">`,
      name: `<input data-k="name" value="${esc(it.name)}" placeholder="اسم المادة" list="item-names">`,
      qty: `<input data-k="qty" value="${esc(it.qty)}" inputmode="decimal" dir="ltr">`,
      unit: `<input data-k="unit" value="${esc(it.unit)}" list="units-list">`,
      pack: `<input data-k="pack" value="${esc(it.pack)}" inputmode="decimal" dir="ltr">`,
      price: `<input data-k="price" value="${esc(it.price)}" inputmode="decimal" dir="ltr">`,
      disc: `<input data-k="discIn" value="${esc(discText(it))}" dir="ltr" placeholder="0 أو 10%" title="مبلغ، أو نسبة مثل 10%">`,
      tax: `<input data-k="taxPct" value="${esc(it.taxPct == null ? '' : it.taxPct)}" inputmode="decimal" dir="ltr">`,
      total: `<span class="it-total num">${lineText(it)}</span>`,
      notes: `<input data-k="notes" value="${esc(it.notes)}">`,
      acts: `<span class="it-acts"><button type="button" class="it-btn" data-it="dup" title="تكرار السطر">⧉</button><button type="button" class="it-btn" data-it="up" title="للأعلى">↑</button><button type="button" class="it-btn" data-it="down" title="للأسفل">↓</button><button type="button" class="it-btn it-del" title="حذف">✕</button></span>`,
    }[k]);
    ed.innerHTML = `<div class="it-row it-head" style="${grid}">${spec.map(([k]) => `<span>${head[k]}</span>`).join('')}</div>` +
      items.map((it, i) => `<div class="it-row" data-i="${i}" style="${grid}">${spec.map(([k]) => cell(k, it, i)).join('')}</div>`).join('') +
      '<datalist id="units-list"><option value="قطعة"><option value="علبة"><option value="كارتون"><option value="جهاز"><option value="كيلو"><option value="متر"><option value="لتر"><option value="رزمة"><option value="ساعة"><option value="خدمة"></datalist>';
    $('#items-cols').innerHTML = Object.entries(COL_LABELS).map(([k, l]) =>
      `<button type="button" class="chip ${c[k] ? 'on' : ''}" data-col="${k}">${c[k] ? '✓ ' : '+ '}${l}</button>`).join('');
    itemsCount();
  }
  function lineText(it) {
    const l = R.line(it);
    return l.total || it.name ? esc(R.fmt(l.total, cur.currency)) : '';
  }
  function itemsCount() {
    const n = (cur.data.items || []).filter((it) => it.name).length;
    $('#items-count').textContent = n ? `(${n})` : '';
  }

  // ---------- أسطر الدفع (أكثر من طريقة) ----------
  function renderPays() {
    if (cur.type !== 'sales') return;
    const methods = St.payMethods(settings());
    const pays = cur.data.payments || (cur.data.payments = [blankPay()]);
    $('#pay-rows').innerHTML = pays.map((p, i) => `
      <div class="pay-row" data-p="${i}">
        <select data-pk="method">${methods.concat(p.method && !methods.includes(p.method) ? [p.method] : []).map((m) => `<option ${m === p.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
        <input data-pk="amount" value="${esc(p.amount)}" inputmode="decimal" dir="ltr" placeholder="${i === 0 ? 'كامل المبلغ' : 'المبلغ'}">
        <input data-pk="ref" value="${esc(p.ref)}" dir="ltr" placeholder="مرجع / رقم صك">
        <button type="button" class="it-btn" data-pdel title="حذف">✕</button>
      </div>`).join('');
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
    if (cur.type === 'sales') cur.data.paymentMethod = R.payText(cur.data);
    if (cur.type === 'receipt') cur.data.invoiceNo = $('#f-invoice').value ? Number($('#f-invoice').value) : '';
    else cur.data.invoiceNo = '';
  }

  // ---------- ربط وصل التسديد بفاتورة ----------
  const sameName = (a, b) => String(a || '').trim() === String(b || '').trim();
  /** المتبقي على الفاتورة بدون احتساب هذا الوصل نفسه (عند تعديل وصل محفوظ) */
  function dueFor(inv) {
    let due = App().money(inv).due;
    if (cur._path && cur.type === 'receipt') {
      const self = (inv._payments || []).find((x) => x._path === cur._path);
      if (self && (self.currency || 'IQD') === (inv.currency || 'IQD')) {
        const t = R.totals(inv);
        due = Math.max(0, t.net - Math.min(t.paid, t.net) - (inv._linked - R.totals(self).total));
      }
    }
    return due;
  }
  function invoiceOptions() {
    const linked = Number(cur.data.invoiceNo) || 0;
    return allDocs.filter((d) => d.type === 'sales' && (Number(d.number) === linked ||
      (dueFor(d) > 0.0001 && (!cur.data.customer || sameName(d.data.customer, cur.data.customer)))));
  }
  function fillInvoiceSelect() {
    const sel = $('#f-invoice');
    if (!sel || cur.type !== 'receipt') return;
    const linked = Number(cur.data.invoiceNo) || 0;
    const opts = invoiceOptions();
    sel.innerHTML = '<option value="">بدون ربط بفاتورة</option>' + opts.map((d) =>
      `<option value="${Number(d.number)}">${esc(App().invLabel(d.number))} — ${esc(d.date)} — ${esc(d.data.customer || '')} — متبقي ${esc(R.money(dueFor(d), d.currency))}</option>`).join('') +
      (linked && !opts.some((d) => Number(d.number) === linked) ? `<option value="${linked}">${esc(App().invLabel(linked))} (غير موجودة)</option>` : '');
    sel.value = linked ? String(linked) : '';
    invoiceHint();
  }
  function invoiceHint() {
    const el = $('#f-invoice-hint');
    const no = Number($('#f-invoice').value) || 0;
    const inv = no && allDocs.find((d) => d.type === 'sales' && Number(d.number) === no);
    if (!inv) { el.textContent = ''; return; }
    const due = dueFor(inv);
    const amt = R.totals(cur).total;
    const after = Math.max(0, due - amt);
    el.innerHTML = `المتبقي على الفاتورة: <b>${esc(R.money(due, inv.currency))}</b>` +
      (amt > 0 ? ` — بعد هذا الوصل: <b class="${after > 0.0001 ? 'red' : 'green'}">${after > 0.0001 ? esc(R.money(after, inv.currency)) : 'تُسدَّد بالكامل'}</b>` : '') +
      (amt - due > 0.0001 ? ' <span class="red">(المبلغ أكبر من المتبقي)</span>' : '') +
      ((inv.currency || 'IQD') !== (cur.currency || 'IQD') ? ' <span class="red">(عملة الفاتورة مختلفة)</span>' : '');
  }
  function onInvoicePick() {
    const prevNo = Number(cur.data.invoiceNo) || 0;
    const prevInv = prevNo && allDocs.find((d) => d.type === 'sales' && Number(d.number) === prevNo);
    const prevAuto = prevInv ? { amount: String(Math.round(dueFor(prevInv) * 100) / 100), purpose: `تسديد فاتورة رقم ${App().invLabel(prevNo)}` } : { amount: '', purpose: '' };
    const no = Number($('#f-invoice').value) || 0;
    cur.data.invoiceNo = no || '';
    const inv = no && allDocs.find((d) => d.type === 'sales' && Number(d.number) === no);
    if (inv) {
      const set = (k, v, auto) => { const el = $('#f-' + k); if (!el.value.trim() || el.value.trim() === auto) { el.value = v; cur.data[k] = v; } };
      set('customer', inv.data.customer || '', '');
      set('amount', String(Math.round(dueFor(inv) * 100) / 100), prevAuto.amount);
      set('purpose', `تسديد فاتورة رقم ${App().invLabel(no)}`, prevAuto.purpose);
      set('transactionType', 'تسديد', '');
      if ((inv.currency || 'IQD') !== cur.currency) { cur.currency = inv.currency || 'IQD'; $('#f-currency').value = cur.currency; }
    }
    readForm();
    invoiceHint();
    markDirty();
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
           ${t.discount ? `<div><span>الخصم</span><b>${R.money(t.discount, cur.currency)}</b></div>` : ''}
           ${t.charges ? `<div><span>الإضافات</span><b>${R.money(t.charges, cur.currency)}</b></div>` : ''}
           ${t.tax ? `<div><span>${esc((settings().tax && settings().tax.label) || 'الضريبة')}</span><b>${R.money(t.tax, cur.currency)}</b></div>` : ''}
           <div class="net"><span>الصافي</span><b>${R.money(t.net, cur.currency)}</b></div>
           ${t.prevBalance ? `<div><span>مع السابق</span><b>${R.money(t.grand, cur.currency)}</b></div>` : ''}
           <div><span>الواصل</span><b class="green">${R.money(t.paid, cur.currency)}</b></div>
           <div><span>المتبقي</span><b class="${t.remaining > 0 ? 'red' : ''}">${R.money(t.remaining, cur.currency)}</b></div>${linkedBox(t)}`
        : `<div><span>المبلغ</span><b>${R.money(t.total, cur.currency)}</b></div>`;
      // نعرض الرقم التالي في المعاينة إذا كان المستند جديداً
      const shown = { ...cur, number: cur.number || Number(($('#f-number').placeholder.match(/\d+/) || [0])[0]) || '' };
      const r = R.renderPages(shown, tpl, settings(), { watermark: cur.watermark });
      $('#issue-preview').innerHTML = r.html;
      R.fitPreview($('#issue-preview'));
      updateHeader();
    });
  }

  /** للفاتورة المحفوظة: وصولات التسديد المرتبطة بها والمتبقي الفعلي */
  function linkedBox(t) {
    if (!cur._path || cur.type !== 'sales') return '';
    const inv = allDocs.find((d) => d.type === 'sales' && Number(d.number) === Number(cur.number));
    if (!inv || !inv._payments || !inv._payments.length) return '';
    const left = Math.max(0, t.net - Math.min(t.paid, t.net) - inv._linked);
    return `<div><span>مسدد بـ ${inv._payments.length} وصل</span><b class="green">${R.money(inv._linked, cur.currency)}</b></div>
            <div><span>المتبقي الفعلي</span><b class="${left > 0.0001 ? 'red' : 'green'}">${R.money(left, cur.currency)}</b></div>`;
  }

  function markDirty() { dirty = true; refresh(); }

  // ---------- الحفظ والطباعة ----------
  function validate() {
    if (!cur.data.customer) return 'اكتب اسم السيد / الجهة';
    if (cur.type === 'sales' && !(cur.data.items || []).some((it) => it.name)) return 'أضف مادة واحدة على الأقل';
    if (cur.type === 'receipt' && !(R.totals(cur).total > 0)) return 'اكتب المبلغ';
    if (cur.type === 'sales') {
      const bad = (cur.data.items || []).find((it) => it.name && (isNaN(R.num(it.qty)) || R.num(it.qty) < 0 || R.num(it.price) < 0));
      if (bad) return 'كمية أو سعر غير صحيح للمادة: ' + bad.name;
      if (R.num(cur.data.discountPct) > 100) return 'نسبة الخصم أكبر من 100%';
      if (cur.data.dueDate && cur.data.dueDate < cur.date) return 'تاريخ الاستحقاق قبل تاريخ الفاتورة';
    }
    return '';
  }

  async function save() {
    readForm();
    const err = validate();
    if (err) { App().toast(err, true); return null; }
    if (cur.type === 'receipt' && !cur._path) {
      const amt = R.totals(cur).total;
      const dup = allDocs.find((d) => d.type === 'receipt' && d.status !== 'cancelled' && d.date === cur.date && sameName(d.data.customer, cur.data.customer) &&
        Math.abs(R.totals(d).total - amt) < 0.0001 && (Number(d.data.invoiceNo) || 0) === (Number(cur.data.invoiceNo) || 0));
      if (dup && !confirm(`يوجد وصل بنفس الزبون والمبلغ والتاريخ (${App().formatNumber('receipt', dup.number, settings())}). تحفظ وصلاً ثانياً؟`)) return null;
    }
    const out = JSON.parse(JSON.stringify(cur));
    const toNum = (v) => (v === '' || v == null ? '' : (isFinite(Number(String(v).replace(/,/g, ''))) ? Number(String(v).replace(/,/g, '')) : v));
    out.data.items = (out.data.items || []).filter((it) => it.name || it.qty || it.price)
      .map((it) => {
        const o = { ...it, qty: toNum(it.qty), price: toNum(it.price), pack: toNum(it.pack) };
        for (const k of ['disc', 'discPct', 'taxPct']) { o[k] = toNum(o[k]); if (o[k] === '' || o[k] === 0) delete o[k]; }
        if (!o.code) delete o.code;
        return o;
      });
    for (const k of NUM_FIELDS) out.data[k] = toNum(out.data[k]);
    for (const k of ['discountPct', 'charges', 'dueDate', 'reference', 'ref']) if (out.data[k] === '' || out.data[k] == null) delete out.data[k];
    if (out.type === 'sales') {
      out.data.payments = (out.data.payments || []).filter((p, i) => i === 0 || (p.amount !== '' && p.amount != null))
        .map((p) => ({ method: p.method, amount: toNum(p.amount), ...(p.ref ? { ref: p.ref } : {}) }));
      // للتوافق مع النسخ السابقة: الواصل كرقم واحد + نص طرق الدفع
      const t = R.totals(out);
      out.data.paid = out.data.payments.some((p) => p.amount !== '') ? t.paid : '';
      out.data.paymentMethod = R.payText(out.data);
    } else delete out.data.payments;
    if (!(out.type === 'receipt' && out.data.invoiceNo)) out.data.invoiceNo = undefined;
    out.data.total = R.totals(out).total;
    if (cur._path) out._path = cur._path;
    const saved = await St.saveDocument(out);
    // تذكّر القيم المتكررة للمرة القادمة
    const s = JSON.parse(JSON.stringify(settings()));
    s.memory = s.memory || {};
    s.memory[cur.type] = { paymentMethod: out.data.paymentMethod, terms: out.data.terms, accountant: out.data.accountant };
    s.defaults.templateId = out.templateId;
    s.defaults.size = out.size;
    App().settings = await St.saveSettings(s, { quiet: true });
    cur = saved;
    if (!cur.data.items || !cur.data.items.length) cur.data.items = cur.type === 'sales' ? [blankItem()] : [];
    if (cur.type === 'sales' && !(cur.data.payments || []).length) cur.data.payments = [blankPay()];
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
      const docs = await App().loadAll();
      allDocs = docs;
      fillInvoiceSelect();
      refresh();
      const names = [...new Set(docs.map((d) => d.data && d.data.customer).filter(Boolean))];
      $('#customers-list').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
      // قائمة المواد المستخدمة سابقاً: اختيار اسم مادة يعبّي السعر والوحدة والوصف من آخر استخدام
      catalog = {};
      codes = {};
      for (const d of docs.slice().reverse()) for (const it of (d.data && d.data.items) || []) { if (it.name) catalog[it.name] = it; if (it.code) codes[String(it.code).toLowerCase()] = it; }
      $('#item-names').innerHTML = Object.keys(catalog).map((n) => `<option value="${esc(n)}">${catalog[n].code ? esc(catalog[n].code) + ' · ' : ''}${esc(R.fmt(catalog[n].price, 'IQD'))}</option>`).join('');
    } catch (e) { /* غير مهم */ }
  }

  function fillFromCatalog(it, known, row) {
    for (const k of ['code', 'name', 'unit', 'price', 'notes', 'pack', 'taxPct']) {
      if ((it[k] === '' || it[k] == null) && known[k] !== '' && known[k] != null) {
        it[k] = known[k];
        const el = row && row.querySelector(`[data-k="${k}"]`); if (el) el.value = known[k];
      }
    }
  }

  // ---------- ربط الأحداث ----------
  function wire() {
    if (wired) return;
    wired = true;
    const form = $('#issue-form');
    form.addEventListener('input', (e) => {
      if (e.target.id === 'item-quick') return;
      const prow = e.target.closest('.pay-row');
      if (prow && e.target.dataset.pk) {
        cur.data.payments[Number(prow.dataset.p)][e.target.dataset.pk] = e.target.value;
        readForm();
        return markDirty();
      }
      const row = e.target.closest('.it-row');
      if (row && e.target.dataset.k) {
        const it = cur.data.items[Number(row.dataset.i)];
        const k0 = e.target.dataset.k;
        if (k0 === 'discIn') {
          const v = e.target.value.trim();
          if (v.endsWith('%')) { it.discPct = v.slice(0, -1).trim(); it.disc = ''; } else { it.disc = v; it.discPct = ''; }
        } else it[k0] = e.target.value;
        const known = (k0 === 'name' && catalog[e.target.value]) || (k0 === 'code' && codes[e.target.value.trim().toLowerCase()]);
        if (known) fillFromCatalog(it, known, row);
        const tot = row.querySelector('.it-total'); if (tot) tot.innerHTML = lineText(it);
        itemsCount();
      } else if (e.target.id !== 'f-type' && e.target.id !== 'f-invoice') {
        readForm();
        if (cur.type === 'receipt' && (e.target.id === 'f-amount' || e.target.id === 'f-currency')) invoiceHint();
      }
      if (e.target.id === 'f-invoice') return;
      markDirty();
    });
    form.addEventListener('change', async (e) => {
      if (e.target.id === 'f-invoice') return onInvoicePick();
      if (e.target.id === 'f-customer' && cur.type === 'receipt') { readForm(); fillInvoiceSelect(); return; }
      if (e.target.id === 'f-type') {
        cur = newDoc(e.target.value); dirty = false; await fillForm();
      } else if (e.target.id === 'f-template') {
        readForm(); fillSelectors(); renderItems(); markDirty();
      }
    });
    form.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-col]');
      if (chip && chip.closest('#items-cols')) {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('im-editor-cols')) || {}; } catch (err) { saved = {}; }
        saved[chip.dataset.col] = !editorCols()[chip.dataset.col];
        try { localStorage.setItem('im-editor-cols', JSON.stringify(saved)); } catch (err) { /* تجاهل */ }
        return renderItems();
      }
      if (e.target.closest('[data-pdel]')) {
        const i = Number(e.target.closest('.pay-row').dataset.p);
        cur.data.payments.splice(i, 1);
        if (!cur.data.payments.length) cur.data.payments.push(blankPay());
        renderPays(); readForm(); return markDirty();
      }
      const btn = e.target.closest('.it-btn');
      if (!btn || !btn.closest('.it-row')) return;
      const items = cur.data.items;
      const i = Number(btn.closest('.it-row').dataset.i);
      const act = btn.classList.contains('it-del') ? 'del' : btn.dataset.it;
      if (act === 'del') { items.splice(i, 1); if (!items.length) items.push(blankItem()); }
      else if (act === 'dup') items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i])));
      else if (act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      else if (act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      renderItems(); markDirty();
    });
    // البحث السريع: اسم أو رمز مادة سابقة + Enter يضيفها كسطر جديد
    $('#item-quick').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = e.target.value.trim();
      if (!v) return;
      const known = catalog[v] || codes[v.toLowerCase()] || Object.values(catalog).find((it) => it.name.includes(v));
      const items = cur.data.items;
      let i = items.findIndex((it) => !it.name && !it.qty && !it.price);
      if (i < 0) { items.push(blankItem()); i = items.length - 1; }
      const it = items[i];
      if (known) { it.name = known.name; fillFromCatalog(it, known); } else it.name = v;
      if (!it.qty) it.qty = '1';
      e.target.value = '';
      renderItems(); markDirty();
      const q = $(`.it-row[data-i="${i}"] input[data-k="qty"]`); if (q) { q.focus(); q.select(); }
    });
    $('#btn-add-pay').addEventListener('click', () => {
      const used = (cur.data.payments || []).map((p) => p.method);
      cur.data.payments.push(blankPay(St.payMethods(settings()).find((m) => !used.includes(m) && m !== 'آجل')));
      renderPays(); markDirty();
      const a = $$('.pay-row [data-pk="amount"]'); a[a.length - 1].focus();
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
    if (asCopy) { delete d.status; delete d.cancelledAt; delete d.cancelReason; }
    cur = d;
    dirty = !!asCopy;
    return true;
  }

  /** يبدأ مستنداً جديداً من نوع معيّن، مع بيانات جاهزة اختيارية (مثل اسم الزبون) */
  async function startNew(type, prefill, currency) {
    if (dirty && !confirm('فيه تغييرات غير محفوظة بالمستند الحالي. تكمل؟')) return false;
    cur = newDoc(type);
    if (currency) cur.currency = currency;
    Object.assign(cur.data, prefill || {});
    dirty = false;
    return true;
  }

  window.Issue = { render, open, startNew, get current() { return cur; } };
})();
