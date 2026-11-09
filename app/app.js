/*
 * app.js — واجهة البرنامج
 */
(function () {
  'use strict';
  const S = window.Storage;
  const St = window.Store;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // ---------- أدوات صغيرة ----------
  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isError ? 5000 : 2500);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
    target[last] = val;
  }
  function formatNumber(type, n, settings) {
    const prefix = (settings.prefixes && settings.prefixes[type]) || '';
    return (prefix ? prefix + '-' : '') + String(n).padStart(5, '0');
  }
  function formatMoney(amount, currency) {
    const c = St.CURRENCIES[currency] || St.CURRENCIES.IQD;
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }) + ' ' + c.symbol;
  }

  // ---------- شاشة المجلد ----------
  function showGate(mode, error) {
    $('#app').hidden = true;
    $('#gate').hidden = false;
    $('#gate-unsupported').hidden = mode !== 'unsupported';
    $('#gate-new').hidden = mode !== 'none';
    $('#gate-resume').hidden = mode !== 'needs-permission';
    $('#gate-folder').textContent = S.folderName;
    $('#gate-error').hidden = !error;
    $('#gate-error').textContent = error || '';
  }

  async function pickFolder() {
    try {
      await S.pick();
      await openApp();
    } catch (e) {
      if (e.name === 'AbortError') return; // المستخدم أغلق النافذة
      showGate(S.folderName ? 'needs-permission' : 'none', 'تعذّر فتح المجلد: ' + e.message);
    }
  }

  async function boot() {
    if (!S.supported) return showGate('unsupported');
    const state = await S.restore();
    if (state === 'ready') return openApp();
    showGate(state);
  }

  // ---------- البرنامج ----------
  let settings = null;

  async function openApp() {
    await St.initWorkspace();
    settings = await St.getSettings();
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#folder-name').textContent = S.folderName;
    switchTab(currentTab);
  }

  let currentTab = 'issue';
  const renderers = {
    issue: () => window.Issue.render(),
    archive: renderArchive,
    templates: renderTemplates,
    settings: renderSettings,
  };
  function switchTab(tab) {
    currentTab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    renderers[tab]().catch((e) => toast('خطأ: ' + e.message, true));
  }

  // ----- الأرشيف -----
  let archiveDocs = [];
  async function renderArchive(reload = true) {
    const sel = $('#archive-type');
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">كل الأنواع</option>' +
        Object.entries(St.DOC_TYPES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    }
    if (reload) archiveDocs = await St.listDocuments(sel.value || undefined);
    const q = $('#archive-search').value.trim().toLowerCase();
    const rows = archiveDocs.filter((d) => {
      if (!q) return true;
      const hay = [formatNumber(d.type, d.number, settings), d.data && d.data.customer, d.date].join(' ').toLowerCase();
      return hay.includes(q);
    });
    $('#archive-body').innerHTML = rows.map((d) => `
      <tr data-path="${esc(d._path)}">
        <td dir="ltr">${esc(formatNumber(d.type, d.number, settings))}</td>
        <td>${esc((St.DOC_TYPES[d.type] || {}).label || d.type)}</td>
        <td>${esc(d.date)}</td>
        <td>${esc(d.data && d.data.customer)}</td>
        <td dir="ltr" class="money">${esc(formatMoney(d.data && d.data.total, d.currency))}</td>
        <td class="acts">
          <button class="btn small ghost" data-act="open">فتح</button>
          <button class="btn small ghost" data-act="print">طباعة</button>
          <button class="btn small ghost" data-act="copy">تكرار</button>
          <button class="btn small ghost danger" data-act="delete">حذف</button>
        </td>
      </tr>`).join('');
    // مجموع المبالغ المعروضة لكل عملة ونوع
    const sums = {};
    for (const d of rows) {
      const k = d.type + '|' + (d.currency || 'IQD');
      sums[k] = (sums[k] || 0) + Number((d.data && d.data.total) || 0);
    }
    $('#archive-foot').innerHTML = rows.length ? `<tr><td colspan="6" class="muted">${rows.length} مستند — ` +
      Object.entries(sums).map(([k, v]) => { const [t, c] = k.split('|'); return `${esc(St.DOC_TYPES[t].label)}: <b dir="ltr">${esc(formatMoney(v, c))}</b>`; }).join(' · ') +
      '</td></tr>' : '';
    $('#archive-empty').hidden = rows.length > 0;
  }

  async function archiveAction(act, path) {
    const doc = archiveDocs.find((d) => d._path === path);
    if (!doc) return;
    if (act === 'open' || act === 'copy') {
      if (await window.Issue.open(doc, act === 'copy')) switchTab('issue');
    } else if (act === 'print') {
      const tpls = await St.listTemplates(doc.type);
      const tpl = tpls.find((t) => t.id === doc.templateId) || tpls[0];
      Render.print(Render.renderPages(doc, tpl, settings, { watermark: doc.watermark }));
    } else if (act === 'delete') {
      const label = formatNumber(doc.type, doc.number, settings);
      if (!confirm(`حذف المستند ${label} نهائياً من المجلد؟`)) return;
      await St.deleteDocument(path);
      toast('تم حذف ' + label);
      renderArchive(true);
    }
  }

  // ----- القوالب والمعاينة -----
  const SAMPLE = {
    sales: {
      type: 'sales', number: 1, date: new Date().toISOString().slice(0, 10), currency: 'IQD',
      data: {
        customer: 'السيد / محمد علي', paymentMethod: 'نقداً',
        items: [
          { name: 'طابعة ليزر متعددة الوظائف', qty: 1, unit: 'قطعة', price: 450000, notes: 'ضمان سنة' },
          { name: 'ورق طباعة A4', qty: 10, unit: 'رزمة', price: 6500, notes: '' },
          { name: 'حبر طابعة أسود', qty: 3, unit: 'علبة', price: 35000, notes: 'أصلي' },
          { name: 'كرسي مكتبي', qty: 2, unit: 'قطعة', price: 120000, notes: '' },
        ],
        discount: 15000, paid: 600000,
        terms: 'البضاعة المباعة لا ترد ولا تستبدل بعد مرور ٣ أيام.',
        receiver: '', accountant: '',
      },
    },
    receipt: {
      type: 'receipt', number: 1, date: new Date().toISOString().slice(0, 10), currency: 'IQD',
      data: { customer: 'السيد / محمد علي', amount: 750000, purpose: 'تسديد دفعة من الحساب', notes: '', paymentMethod: 'نقداً', transactionType: 'تسديد', receiver: '' },
    },
  };
  const PLACEHOLDER_COMPANY = {
    name: 'اسم الجهة', subtitle: 'النشاط أو الوصف المختصر', address: 'العنوان', phone: '07xx xxx xxxx',
    logoSymbol: 'AB', logoText: 'COMPANY',
  };

  const pv = { templateId: null, type: 'sales', size: 'A4', blank: false, watermark: null, theme: null };
  let templates = [];

  function previewSettings() {
    // إذا لم تُعبّأ بيانات الجهة بعد، نعرض نصوصاً توضيحية في المعاينة فقط
    const c = settings.company;
    const empty = !c.name && !c.logo;
    const company = empty ? { ...c, ...PLACEHOLDER_COMPANY } : c;
    const themes = { ...(settings.templateThemes || {}) };
    if (pv.theme) themes[pv.templateId] = pv.theme;
    return { s: { ...settings, company, templateThemes: themes }, empty };
  }

  function currentTemplate() { return templates.find((t) => t.id === pv.templateId) || templates[0]; }

  function renderPreview() {
    const tpl = currentTemplate();
    if (!tpl) return;
    const { s, empty } = previewSettings();
    const doc = { ...SAMPLE[pv.type], size: pv.size, currency: settings.defaults.currency };
    if (doc.currency === 'USD') {
      doc.data = { ...doc.data, items: (doc.data.items || []).map((it) => ({ ...it, price: it.price / 1500 })), discount: (doc.data.discount || 0) / 1500, paid: doc.data.paid / 1500, amount: (doc.data.amount || 0) / 1500 };
    }
    const r = Render.renderPages(doc, tpl, s, { blank: pv.blank, watermark: pv.watermark });
    $('#pv-area').innerHTML = r.html;
    $('#pv-area').dataset.page = r.page;
    pv.last = r;
    $('#pv-note').textContent = empty ? 'المعاينة تعرض نصوصاً توضيحية. عبّئ بيانات الجهة من تبويب الإعدادات لتظهر بياناتك.' : '';
  }

  function syncThemeInputs() {
    const tpl = currentTemplate();
    const t = pv.theme || { ...(tpl.theme || {}), ...((settings.templateThemes || {})[tpl.id] || {}) };
    $('#pv-c-primary').value = t.primary || '#174257';
    $('#pv-c-dark').value = t.dark || '#0d2836';
    $('#pv-c-accent').value = t.accent || '#0ea5e9';
  }

  async function renderTemplates() {
    templates = await St.listTemplates();
    if (!pv.templateId) pv.templateId = settings.defaults.templateId || (templates[0] && templates[0].id);
    if (pv.watermark == null) pv.watermark = settings.defaults.watermark !== false;
    $('#templates-list').innerHTML = templates.map((t) => `
      <button class="tpl ${t.id === pv.templateId ? 'active' : ''}" data-id="${esc(t.id)}">
        <b>${esc(t.name)}</b>
        <span class="muted">${esc(t.description || '')}</span>
        <span>${(t.types || []).map((ty) => `<span class="badge">${esc((St.DOC_TYPES[ty] || {}).label || ty)}</span>`).join('')}${(t.sizes || []).map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</span>
        ${t.id === settings.defaults.templateId ? '<span class="badge default">الافتراضي</span>' : ''}
      </button>`).join('');
    const tpl = currentTemplate();
    $('#pv-type').innerHTML = (tpl.types || []).map((k) => `<option value="${k}">${esc(St.DOC_TYPES[k].label)}</option>`).join('');
    if (!(tpl.types || []).includes(pv.type)) pv.type = tpl.types[0];
    $('#pv-type').value = pv.type;
    $('#pv-size').innerHTML = (tpl.sizes || []).map((k) => {
      const hint = pv.type === 'receipt' ? (k === 'A4' ? ' — وصلين بالورقة' : ' — أفقي') : '';
      return `<option value="${k}">${k}${hint}</option>`;
    }).join('');
    if (!(tpl.sizes || []).includes(pv.size)) pv.size = tpl.sizes[0];
    $('#pv-size').value = pv.size;
    $('#pv-blank').checked = pv.blank;
    $('#pv-watermark').checked = pv.watermark;
    syncThemeInputs();
    renderPreview();
  }

  async function saveTemplateTheme() {
    const tpl = currentTemplate();
    const next = JSON.parse(JSON.stringify(settings));
    next.templateThemes = next.templateThemes || {};
    next.templateThemes[tpl.id] = { primary: $('#pv-c-primary').value, dark: $('#pv-c-dark').value, accent: $('#pv-c-accent').value };
    next.defaults.templateId = tpl.id;
    settings = await St.saveSettings(next);
    pv.theme = null;
    toast('تم حفظ ألوان القالب وتعيينه كقالب افتراضي');
    renderTemplates();
  }

  async function resetTemplateTheme() {
    const tpl = currentTemplate();
    const next = JSON.parse(JSON.stringify(settings));
    if (next.templateThemes) delete next.templateThemes[tpl.id];
    settings = await St.saveSettings(next);
    pv.theme = null;
    renderTemplates();
  }

  // ----- الإعدادات -----
  async function renderSettings() {
    settings = await St.getSettings();
    const form = $('#settings-form');
    $('#sel-currency').innerHTML = Object.entries(St.CURRENCIES).map(([k, v]) => `<option value="${k}">${esc(v.label)} (${esc(v.symbol)})</option>`).join('');
    $('#sel-size').innerHTML = Object.keys(St.PAPER_SIZES).map((k) => `<option value="${k}">${k}</option>`).join('');
    $('#prefix-fields').innerHTML = Object.entries(St.DOC_TYPES).map(([k, v]) =>
      `<label>عنوان ${esc(v.label)}<input name="titles.${k}"></label>` +
      `<label>بادئة ترقيم ${esc(v.label)}<input name="prefixes.${k}" dir="ltr"></label>`).join('');
    $$('[name]', form).forEach((el) => { el.value = getPath(settings, el.name) || ''; });
    $('#logo-preview').src = settings.company.logo || '';
  }

  async function saveSettingsForm(ev) {
    ev.preventDefault();
    const next = JSON.parse(JSON.stringify(settings));
    $$('[name]', ev.target).forEach((el) => setPath(next, el.name, el.value.trim()));
    next.company.logo = $('#logo-preview').getAttribute('src') || '';
    settings = await St.saveSettings(next);
    toast('تم حفظ الإعدادات في المجلد');
  }

  function readLogo(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) return toast('حجم الشعار كبير، اختر صورة أقل من 1MB', true);
    const r = new FileReader();
    r.onload = () => { $('#logo-preview').src = r.result; };
    r.readAsDataURL(file);
  }

  async function downloadBackup() {
    const data = await St.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invoice-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- ربط الأحداث ----------
  $('#btn-pick').addEventListener('click', pickFolder);
  $('#btn-pick-other').addEventListener('click', pickFolder);
  $('#btn-change-folder').addEventListener('click', pickFolder);
  $('#btn-resume').addEventListener('click', async () => {
    if (await S.grantPending()) openApp();
    else showGate('needs-permission', 'لم يتم السماح بالوصول للمجلد.');
  });
  $('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });
  $('#archive-type').addEventListener('change', () => renderArchive(true));
  $('#archive-search').addEventListener('input', () => renderArchive(false));
  $('#archive-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) archiveAction(b.dataset.act, b.closest('tr').dataset.path).catch((err) => toast(err.message, true));
  });
  $('#btn-archive-refresh').addEventListener('click', () => renderArchive(true));
  $('#templates-list').addEventListener('click', (e) => {
    const b = e.target.closest('.tpl');
    if (!b) return;
    pv.templateId = b.dataset.id; pv.theme = null;
    renderTemplates();
  });
  $('#pv-type').addEventListener('change', (e) => { pv.type = e.target.value; renderTemplates(); });
  $('#pv-size').addEventListener('change', (e) => { pv.size = e.target.value; renderPreview(); });
  $('#pv-blank').addEventListener('change', (e) => { pv.blank = e.target.checked; renderPreview(); });
  $('#pv-watermark').addEventListener('change', (e) => { pv.watermark = e.target.checked; renderPreview(); });
  ['primary', 'dark', 'accent'].forEach((k) => $('#pv-c-' + k).addEventListener('input', () => {
    pv.theme = { primary: $('#pv-c-primary').value, dark: $('#pv-c-dark').value, accent: $('#pv-c-accent').value };
    renderPreview();
  }));
  $('#btn-tpl-save').addEventListener('click', () => saveTemplateTheme().catch((e) => toast(e.message, true)));
  $('#btn-tpl-reset').addEventListener('click', () => resetTemplateTheme().catch((e) => toast(e.message, true)));
  $('#btn-tpl-print').addEventListener('click', () => { if (pv.last) Render.print(pv.last); });
  $('#settings-form').addEventListener('submit', (e) => saveSettingsForm(e).catch((err) => toast('تعذّر الحفظ: ' + err.message, true)));
  $('#logo-input').addEventListener('change', (e) => readLogo(e.target.files[0]));
  $('#btn-logo-clear').addEventListener('click', () => { $('#logo-preview').removeAttribute('src'); $('#logo-input').value = ''; });
  $('#btn-export').addEventListener('click', () => downloadBackup().catch((e) => toast(e.message, true)));

  // للاختبار: تشغيل البرنامج على مجلد جاهز
  window.App = {
    openApp, toast, formatNumber, formatMoney, switchTab, pv,
    get settings() { return settings; },
    set settings(v) { settings = v; },
  };

  boot().catch((e) => showGate('none', e.message));
})();
