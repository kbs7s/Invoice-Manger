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
    issue: renderIssue,
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

  // ----- إصدار (هيكل مؤقت) -----
  async function renderIssue() {
    const box = $('#next-numbers');
    box.innerHTML = '';
    for (const [type, info] of Object.entries(St.DOC_TYPES)) {
      const n = await St.peekNumber(type);
      box.insertAdjacentHTML('beforeend',
        `<div class="stat"><span>الرقم التالي — ${esc(info.label)}</span><b>${esc(formatNumber(type, n, settings))}</b></div>`);
    }
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
      <tr>
        <td dir="ltr">${esc(formatNumber(d.type, d.number, settings))}</td>
        <td>${esc((St.DOC_TYPES[d.type] || {}).label || d.type)}</td>
        <td>${esc(d.date)}</td>
        <td>${esc(d.data && d.data.customer)}</td>
        <td>${esc(formatMoney(d.data && d.data.total, d.currency))}</td>
        <td class="path">${esc(d._path)}</td>
      </tr>`).join('');
    $('#archive-empty').hidden = rows.length > 0;
  }

  // ----- القوالب -----
  async function renderTemplates() {
    const list = await St.listTemplates();
    $('#templates-list').innerHTML = list.map((t) => `
      <div class="tpl">
        <b>${esc(t.name)}</b>
        ${(t.types || []).map((ty) => `<span class="badge">${esc((St.DOC_TYPES[ty] || {}).label || ty)}</span>`).join('')}
        ${(t.sizes || []).map((s) => `<span class="badge">${esc(s)}</span>`).join('')}
        <div class="muted">${t.builtin ? 'قالب أساسي' : 'قالب محفوظ في المجلد'}</div>
      </div>`).join('');
    $('#templates-empty').hidden = list.length > 0;
  }

  // ----- الإعدادات -----
  async function renderSettings() {
    settings = await St.getSettings();
    const form = $('#settings-form');
    $('#sel-currency').innerHTML = Object.entries(St.CURRENCIES).map(([k, v]) => `<option value="${k}">${esc(v.label)} (${esc(v.symbol)})</option>`).join('');
    $('#sel-size').innerHTML = Object.keys(St.PAPER_SIZES).map((k) => `<option value="${k}">${k}</option>`).join('');
    $('#prefix-fields').innerHTML = Object.entries(St.DOC_TYPES).map(([k, v]) =>
      `<label>${esc(v.label)}<input name="prefixes.${k}" dir="ltr"></label>`).join('');
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
  $('#btn-archive-refresh').addEventListener('click', () => renderArchive(true));
  $('#settings-form').addEventListener('submit', (e) => saveSettingsForm(e).catch((err) => toast('تعذّر الحفظ: ' + err.message, true)));
  $('#logo-input').addEventListener('change', (e) => readLogo(e.target.files[0]));
  $('#btn-logo-clear').addEventListener('click', () => { $('#logo-preview').removeAttribute('src'); $('#logo-input').value = ''; });
  $('#btn-export').addEventListener('click', () => downloadBackup().catch((e) => toast(e.message, true)));

  // للاختبار: تشغيل البرنامج على مجلد جاهز
  window.App = { openApp, toast, formatNumber, formatMoney };

  boot().catch((e) => showGate('none', e.message));
})();
