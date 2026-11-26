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
    $('#gate-cloud').hidden = !window.Cloud.signedIn();
  }

  // ---------- الحفظ على Firebase ----------
  /** يفتح البرنامج على بيانات Firebase بدون مجلد */
  async function openCloud() {
    $('#gate-error').hidden = true;
    const n = await window.Cloud.openCloudWorkspace();
    window.Cloud.configure({ cloudOnly: true });
    await openApp();
    toast(n ? `تم تحميل ${n} ملف من Firebase` : 'حسابك فارغ، ابدأ بتعبئة بيانات الجهة من الإعدادات');
  }

  function renderCloud() {
    const C = window.Cloud;
    const cfg = C.config;
    $('#cloud-info').innerHTML = `الحساب <b dir="ltr">${esc(cfg.email || '')}</b> على مشروع <b dir="ltr">${esc(cfg.projectId || '')}</b>. ` +
      (S.mode === 'cloud' ? 'تعمل الآن من Firebase مباشرة (بدون مجلد).' : 'كل حفظ بالمجلد يُرفع تلقائياً، وتغييرات الأجهزة الأخرى تنزل للمجلد.');
    $('#btn-cloud-download').hidden = S.mode === 'cloud';
    $('#btn-cloud-upload').hidden = S.mode === 'cloud';
    let old = null;
    try { old = JSON.parse(localStorage.getItem('im-github')); } catch (e) { old = null; }
    if (old && old.repo && !$('#gh-repo').value) { $('#gh-repo').value = old.repo; $('#gh-import').open = true; }
  }
  function showCloudStatus(st) {
    const C = window.Cloud;
    const pill = $('#cloud-pill');
    pill.hidden = !C.signedIn();
    pill.dataset.state = st.state;
    $('#cloud-pill-text').textContent = st.state === 'error' ? 'خطأ بالحفظ على Firebase' : 'Firebase: ' + (st.message || 'متصل');
    pill.title = 'الحفظ على Firebase: ' + (st.message || '');
    const badge = $('#cloud-badge');
    badge.className = 'badge ' + ({ idle: 'success', syncing: 'primary', error: 'danger' }[st.state] || '');
    badge.textContent = C.signedIn() ? (st.state === 'error' ? 'خطأ: ' + st.message : st.message || 'متصل') : 'غير متصل';
  }

  async function pickFolder() {
    try {
      await S.pick();
      window.Cloud.configure({ cloudOnly: false });
      await openApp();
    } catch (e) {
      if (e.name === 'AbortError') return; // المستخدم أغلق النافذة
      showGate(S.folderName ? 'needs-permission' : 'none', 'تعذّر فتح المجلد: ' + e.message);
    }
  }

  async function boot() {
    const cloudOnly = () => window.Cloud.config.cloudOnly;
    if (!S.supported) return openCloud().catch((e) => showGate('unsupported', e.message));
    const state = await S.restore();
    if (state === 'ready' && !cloudOnly()) return openApp();
    if (cloudOnly()) return openCloud().catch((e) => showGate(state === 'ready' ? 'none' : state, e.message));
    showGate(state === 'ready' ? 'none' : state);
  }

  // ---------- البرنامج ----------
  let settings = null;

  async function openApp() {
    await St.initWorkspace();
    settings = await St.getSettings();
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#folder-name').textContent = S.folderName;
    $('#btn-change-folder').hidden = !S.supported;
    $('#btn-change-folder').textContent = S.mode === 'cloud' ? 'استخدام مجلد' : 'تغيير';
    switchTab(currentTab);
    if (S.mode !== 'cloud' && window.Cloud.signedIn()) window.Cloud.attachFolder().catch((e) => toast('Firebase: ' + e.message, true));
  }

  let currentTab = 'dashboard';
  const renderers = {
    dashboard: renderDashboard,
    issue: () => window.Issue.render(),
    archive: renderArchive,
    payments: renderPayments,
    customers: renderCustomers,
    templates: renderTemplates,
    settings: renderSettings,
    audit: renderAudit,
  };
  function switchTab(tab) {
    currentTab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    renderers[tab]().catch((e) => toast('خطأ: ' + e.message, true));
  }

  // ----- الحالة المالية -----
  /** الحالة المالية للمستند: للفاتورة المتبقي = الصافي − الواصل (بدون الرصيد السابق حتى لا يُحسب مرتين) */
  const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const isCancelled = (d) => d && d.status === 'cancelled';
  function money(d) {
    // المستند الملغى يبقى بالأرشيف لكن لا يدخل بأي حساب
    if (isCancelled(d)) return { total: 0, paid: 0, linked: 0, due: 0, status: 'cancelled' };
    const t = Render.totals(d);
    if (d.type === 'receipt') return { total: t.total, paid: t.total, due: 0, status: 'receipt', unallocated: d._unallocated || 0 };
    // paid = الواصل المكتوب بالفاتورة فقط (حتى لا تُجمع الوصولات مرتين)، linked = وصولات التسديد المرتبطة بها
    const own = Math.max(0, Math.min(t.paid, t.net));
    const linked = d._linked || 0;
    const due = Math.max(0, Render.add(t.net, -own, -linked));
    const overdue = due > 0.0001 && d.data && d.data.dueDate && d.data.dueDate < todayStr();
    return { total: t.net, paid: own, linked, due, status: due <= 0.0001 ? 'paid' : overdue ? 'overdue' : (own + linked > 0 ? 'partial' : 'due') };
  }

  /** توزيع الوصل على الفواتير: data.allocations، أو الربط القديم data.invoiceNo بكامل المبلغ */
  function allocsOf(r) {
    const d = r.data || {};
    if (Array.isArray(d.allocations) && d.allocations.length) {
      return d.allocations.map((a) => ({ invoiceNo: Number(a.invoiceNo), amount: Render.num(a.amount) })).filter((a) => a.invoiceNo && a.amount > 0);
    }
    const no = Number(d.invoiceNo);
    return no ? [{ invoiceNo: no, amount: Render.totals(r).total }] : [];
  }

  // ----- ربط وصولات التسديد بالفواتير -----
  /** يربط كل وصل فيه data.invoiceNo بفاتورته: inv._linked (المجموع) و inv._payments و receipt._invoice */
  function linkPayments(docs) {
    // خصائص غير قابلة للتعداد: لا تُحفظ مع المستند ولا تسبب حلقة عند نسخه
    const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, configurable: true, enumerable: false });
    const inv = new Map();
    for (const d of docs) { if (d.type === 'sales') { hide(d, '_linked', 0); hide(d, '_payments', []); hide(d, '_alloc', new Map()); inv.set(Number(d.number), d); } }
    // من الأقدم للأحدث: الوصل الأقدم يأخذ أولوية التسديد
    const receipts = docs.filter((d) => d.type === 'receipt').sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.number - b.number));
    for (const d of receipts) {
      hide(d, '_invoice', null); hide(d, '_invoices', []); hide(d, '_unallocated', 0); hide(d, '_over', 0);
      if (isCancelled(d)) continue;
      const total = Render.totals(d).total;
      let used = 0;
      for (const a of allocsOf(d)) {
        const i = inv.get(a.invoiceNo);
        if (!i || isCancelled(i)) { d._invoices.push({ missing: true, number: a.invoiceNo, amount: a.amount }); continue; }
        if ((i.currency || 'IQD') !== (d.currency || 'IQD')) { d._invoices.push({ inv: i, amount: 0, currencyMismatch: true }); if (!i._payments.includes(d)) i._payments.push(d); continue; }
        // لا يُحتسب أكثر من المتبقي على الفاتورة ولا أكثر من مبلغ الوصل (لا تسديد مكرر)
        const t = Render.totals(i);
        const room = Math.max(0, Render.add(t.net, -Math.max(0, Math.min(t.paid, t.net)), -i._linked));
        const take = Math.max(0, Math.min(a.amount, room, Render.add(total, -used)));
        if (take < a.amount) d._over = Render.add(d._over, a.amount - take);
        i._linked = Render.add(i._linked, take);
        i._alloc.set(d, Render.add(i._alloc.get(d) || 0, take));
        used = Render.add(used, take);
        if (!i._payments.includes(d)) i._payments.push(d);
        d._invoices.push({ inv: i, amount: take });
      }
      d._unallocated = Math.max(0, Render.add(total, -used)); // رصيد للزبون (دفعة مقدمة / زيادة)
      const first = d._invoices[0];
      d._invoice = first ? (first.missing ? { missing: true, number: first.number } : first.inv) : null;
    }
    return docs;
  }
  async function loadAll() { return linkPayments(await St.listDocuments()); }
  const invLabel = (no) => formatNumber('sales', no, settings);
  const STATUS = {
    paid: '<span class="badge success">مدفوعة</span>',
    partial: '<span class="badge warning">دفعة جزئية</span>',
    due: '<span class="badge danger">آجل</span>',
    overdue: '<span class="badge danger">متأخرة ⚠</span>',
    receipt: '<span class="badge primary">مقبوض</span>',
    cancelled: '<span class="badge muted-badge">ملغى</span>',
  };
  const typeBadge = (t) => `<span class="badge ${t === 'sales' ? '' : 'primary'}">${esc((St.DOC_TYPES[t] || {}).label || t)}</span>`;
  /** يجمع مبالغ بعملات مختلفة: { IQD: 1000, USD: 5 } */
  function addTo(map, cur, v) { cur = cur || 'IQD'; map[cur] = (map[cur] || 0) + v; }
  function sumText(map, main) {
    const keys = Object.keys(map).filter((k) => Math.abs(map[k]) > 0.0001);
    if (!keys.length) return { main: formatMoney(0, main), rest: '' };
    const first = keys.includes(main) ? main : keys[0];
    return { main: formatMoney(map[first], first), rest: keys.filter((k) => k !== first).map((k) => '+ ' + formatMoney(map[k], k)).join('  ') };
  }

  function linkNote(d) {
    if (isCancelled(d)) return `<div class="link-note muted">ملغى${d.cancelReason ? ': ' + esc(d.cancelReason) : ''}</div>`;
    if (d.type === 'receipt' && d._invoices && d._invoices.length) {
      const parts = d._invoices.map((x) => x.missing
        ? `<span class="muted">${esc(invLabel(x.number))} (محذوفة أو ملغاة)</span>`
        : `<button class="linkish" data-act="open-invoice" data-no="${Number(x.inv.number)}">${esc(invLabel(x.inv.number))}</button>`);
      return `<div class="link-note">عن فاتورة ${parts.join('، ')}${d._unallocated > 0.0001 ? ` <span class="muted">· غير موزّع ${esc(formatMoney(d._unallocated, d.currency))}</span>` : ''}</div>`;
    }
    if (d.type === 'sales' && d._payments && d._payments.length) {
      return `<div class="link-note"><button class="linkish" data-act="payments">${d._payments.length} وصل تسديد</button></div>`;
    }
    if (d.type === 'sales' && d.data && d.data.dueDate && money(d).due > 0.0001) return `<div class="link-note muted">تستحق ${esc(d.data.dueDate)}</div>`;
    return '';
  }
  const payBtn = (d) => (d.type === 'sales' && money(d).due > 0.0001 ? '<button class="btn small" data-act="pay" title="إنشاء وصل تسديد لهذه الفاتورة">💵 تسديد</button>' : '');

  function docRow(d, actions) {
    const m = money(d);
    return `
      <tr data-path="${esc(d._path)}" class="${isCancelled(d) ? 'cancelled' : ''}">
        <td class="num strong">${esc(formatNumber(d.type, d.number, settings))}</td>
        <td>${typeBadge(d.type)}</td>
        <td class="num">${esc(d.date)}</td>
        <td class="strong">${esc(d.data && d.data.customer)}${linkNote(d)}</td>
        <td class="money">${esc(formatMoney(isCancelled(d) ? Render.totals(d).total : m.total, d.currency))}${m.due > 0 ? `<div class="muted" style="font-size:11.5px;font-weight:500">متبقي ${esc(formatMoney(m.due, d.currency))}</div>` : ''}</td>
        <td>${STATUS[m.status]}</td>
        <td class="acts">${actions}</td>
      </tr>`;
  }

  // ----- لوحة التحكم -----
  let dashDocs = [];
  function inPeriod(d, period) {
    if (period === 'all') return true;
    const now = new Date();
    const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    return period === 'year' ? String(d.date || '').startsWith(String(now.getFullYear())) : String(d.date || '').startsWith(ym);
  }
  async function renderDashboard() {
    dashDocs = await loadAll();
    const period = $('#dash-period').value;
    const main = settings.defaults.currency || 'IQD';
    const docs = dashDocs.filter((d) => inPeriod(d, period));
    const sales = {}, paid = {}, due = {};
    let nSales = 0, nRec = 0;
    for (const d of docs) {
      const m = money(d);
      if (d.type === 'sales') { nSales++; addTo(sales, d.currency, m.total); }
      else nRec++;
      addTo(paid, d.currency, m.paid);
    }
    const S1 = sumText(sales, main), S2 = sumText(paid, main);
    $('#kpi-sales').textContent = S1.main; $('#kpi-sales-n').textContent = S1.rest || `${nSales} فاتورة`;
    $('#kpi-paid').textContent = S2.main; $('#kpi-paid-n').textContent = S2.rest || `${nRec} وصل قبض`;
    $('#kpi-docs').textContent = docs.length;
    $('#kpi-docs-n').textContent = `من أصل ${dashDocs.length} بالأرشيف`;

    // الديون تراكمية (كل الفترات) لأنها ما زالت مستحقة
    const custs = customerBalances(dashDocs);
    const debtors = custs.filter((c) => c.balance > 0.0001);
    for (const c of debtors) addTo(due, c.currency, c.balance);
    const S3 = sumText(due, main);
    $('#kpi-rem').textContent = S3.main; $('#kpi-rem-n').textContent = S3.rest || `على ${debtors.length} زبون (حتى اليوم)`;

    const salesMain = sales[main] || 0, paidMain = paid[main] || 0;
    const pct = salesMain > 0 ? Math.min(100, Math.round((paidMain / salesMain) * 100)) : (docs.length ? 100 : 0);
    $('#kpi-pct').textContent = pct + '%';
    $('#kpi-bar').style.width = pct + '%';

    const company = (settings.company && settings.company.name) || '';
    $('#dash-hello').textContent = company ? `أهلاً، ${company} 👋` : 'أهلاً بك 👋';
    $('#dash-sub').textContent = dashDocs.length
      ? `آخر مستند صدر بتاريخ ${dashDocs[0].date}. الأرقام التالية حسب الفترة المختارة.`
      : 'ابدأ بإصدار أول فاتورة أو وصل، وستظهر هنا الإحصائيات.';

    const recent = dashDocs.slice(0, 7);
    $('#dash-recent').innerHTML = recent.map((d) => docRow(d,
      payBtn(d) + '<button class="btn small ghost" data-act="open" title="فتح للتعديل">✏️</button><button class="btn small ghost" data-act="print" title="طباعة">🖨️</button>')).join('');
    $('#dash-empty').hidden = recent.length > 0;

    const top = debtors.sort((a, b) => b.balance - a.balance).slice(0, 5);
    $('#dash-debtors').innerHTML = top.map((c) => `<li><span>${esc(c.name)}</span><b>${esc(formatMoney(c.balance, c.currency))}</b></li>`).join('');
    $('#dash-debtors-empty').hidden = top.length > 0;
  }

  // ----- العملاء -----
  /** حساب كل زبون: المشتريات − الواصل بالفواتير − وصولات القبض = المتبقي عليه */
  function customerBalances(docs) {
    const map = new Map();
    for (const d of docs.slice().reverse()) { // من الأقدم للأحدث حتى تبقى آخر بيانات اتصال
      const name = ((d.data && d.data.customer) || '').trim();
      if (!name || isCancelled(d)) continue;
      const key = name + '|' + (d.currency || 'IQD');
      let c = map.get(key);
      if (!c) { c = { name, currency: d.currency || 'IQD', phone: '', address: '', count: 0, total: 0, paid: 0, balance: 0, last: '' }; map.set(key, c); }
      const m = money(d);
      c.count++;
      if (d.type === 'sales') c.total += m.total;
      c.paid += m.paid;
      c.balance = c.total - c.paid;
      if (d.data.customerPhone) c.phone = d.data.customerPhone;
      if (d.data.customerAddress) c.address = d.data.customerAddress;
      if ((d.date || '') > c.last) c.last = d.date || '';
    }
    return Array.from(map.values());
  }

  let custList = [];
  async function renderCustomers(reload = true) {
    if (reload) custList = customerBalances(await loadAll());
    const q = $('#cust-search').value.trim().toLowerCase();
    const sort = $('#cust-sort').value;
    const rows = custList.filter((c) => !q || (c.name + ' ' + c.phone).toLowerCase().includes(q));
    rows.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ar')
      : sort === 'recent' ? b.last.localeCompare(a.last)
      : sort === 'total' ? b.total - a.total : b.balance - a.balance);
    $('#customers-grid').innerHTML = rows.map((c, i) => {
      const st = c.balance > 0.0001 ? '<span class="badge danger">عليه مبلغ</span>' : (c.balance < -0.0001 ? '<span class="badge primary">له رصيد</span>' : '<span class="badge success">حساب خالص</span>');
      return `
      <div class="customer" data-i="${custList.indexOf(c)}">
        <div class="customer-head"><h3>${esc(c.name)}</h3>${st}</div>
        <div class="customer-info">
          ${c.phone ? `<span>📞 <span dir="ltr">${esc(c.phone)}</span></span>` : ''}
          ${c.address ? `<span>📍 ${esc(c.address)}</span>` : ''}
          <span>📑 ${c.count} مستند · آخر تعامل ${esc(c.last)}</span>
        </div>
        <div class="customer-money">
          <div><span>المشتريات</span><b>${esc(formatMoney(c.total, c.currency))}</b></div>
          <div><span>المقبوض</span><b>${esc(formatMoney(c.paid, c.currency))}</b></div>
          <div><span>${c.balance < 0 ? 'رصيد له' : 'المتبقي'}</span><b class="${c.balance > 0.0001 ? 'red' : 'green'}">${esc(formatMoney(Math.abs(c.balance), c.currency))}</b></div>
        </div>
        <div class="row">
          <button class="btn small" data-cust="sales">+ فاتورة</button>
          <button class="btn small" data-cust="receipt">+ وصل قبض</button>
          <button class="btn small ghost" data-cust="history">المستندات</button>
        </div>
      </div>`;
    }).join('');
    $('#customers-empty').hidden = rows.length > 0;
  }

  async function newFor(type, c) {
    const prefill = c ? { customer: c.name, customerPhone: c.phone, customerAddress: c.address } : null;
    if (type === 'receipt' && c && c.balance > 0) prefill.amount = String(Math.round(c.balance * 100) / 100);
    if (await window.Issue.startNew(type, prefill, c && c.currency)) switchTab('issue');
  }

  // ----- الأرشيف -----
  let archiveDocs = [];
  async function renderArchive(reload = true) {
    const sel = $('#archive-type');
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">كل الأنواع</option>' +
        Object.entries(St.DOC_TYPES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    }
    if (reload) archiveDocs = await loadAll();
    const q = $('#archive-search').value.trim().toLowerCase();
    const status = $('#archive-status').value;
    const type = sel.value;
    const rows = archiveDocs.filter((d) => {
      if (type && d.type !== type) return false;
      const st = money(d).status;
      if (status === 'open' ? !['due', 'partial', 'overdue'].includes(st) : status && st !== status) return false;
      if (!q) return true;
      return searchText(d).includes(q);
    });
    $('#archive-body').innerHTML = rows.map((d) => docRow(d, `${payBtn(d)}
          <button class="btn small ghost" data-act="open">فتح</button>
          <button class="btn small ghost" data-act="print">طباعة</button>
          <button class="btn small ghost" data-act="copy">تكرار</button>
          ${isCancelled(d) ? '<button class="btn small ghost" data-act="restore">إرجاع</button>' : '<button class="btn small ghost danger" data-act="cancel" title="يبقى بالأرشيف ولا يدخل بالحسابات">إلغاء</button>'}
          <button class="btn small ghost danger" data-act="delete">حذف</button>`)).join('');
    // مجموع المبالغ المعروضة لكل عملة ونوع
    const sums = {};
    for (const d of rows) {
      const k = d.type + '|' + (d.currency || 'IQD');
      sums[k] = (sums[k] || 0) + money(d).total;
    }
    $('#archive-foot').innerHTML = rows.length ? `<tr><td colspan="7" class="muted">${rows.length} مستند — ` +
      Object.entries(sums).map(([k, v]) => { const [t, c] = k.split('|'); return `${esc(St.DOC_TYPES[t].label)}: <b dir="ltr">${esc(formatMoney(v, c))}</b>`; }).join(' · ') +
      '</td></tr>' : '';
    $('#archive-empty').hidden = rows.length > 0;
  }

  /** نص البحث: الرقم، الزبون، الهاتف، التاريخ، المبلغ، المواد ورموزها، أرقام المرجع */
  function searchText(d) {
    const x = d.data || {};
    return [formatNumber(d.type, d.number, settings), d.number, x.customer, x.customerPhone, d.date, x.reference, x.ref, x.purpose,
      Render.totals(d).total, ...(x.items || []).map((it) => [it.name, it.code].join(' ')),
      ...(x.payments || []).map((p) => [p.method, p.ref].join(' '))].join(' ').toLowerCase();
  }

  async function archiveAction(act, path, btn) {
    const doc = archiveDocs.find((d) => d._path === path) || dashDocs.find((d) => d._path === path) || payDocs.find((d) => d._path === path);
    if (!doc) return;
    if (act === 'pay') return payInvoice(doc);
    if (act === 'payments') { payFilter = Number(doc.number); return switchTab('payments'); }
    if (act === 'open-invoice') {
      const no = btn && btn.dataset.no ? Number(btn.dataset.no) : 0;
      const x = no ? (doc._invoices || []).find((y) => y.inv && Number(y.inv.number) === no) : null;
      const inv = x ? x.inv : doc._invoice;
      if (inv && !inv.missing && await window.Issue.open(inv, false)) switchTab('issue');
      return;
    }
    if (act === 'cancel') {
      const label = formatNumber(doc.type, doc.number, settings);
      const reason = prompt(`إلغاء ${label}؟ يبقى بالأرشيف بحالة "ملغى" ولا يدخل بالحسابات.\nسبب الإلغاء (اختياري):`, '');
      if (reason === null) return;
      await St.setCancelled(doc, true, reason.trim());
      toast('تم إلغاء ' + label);
      return switchTab(currentTab);
    }
    if (act === 'restore') {
      await St.setCancelled(doc, false);
      toast('تم إرجاع المستند');
      return switchTab(currentTab);
    }
    if (act === 'open' || act === 'copy') {
      if (await window.Issue.open(doc, act === 'copy')) switchTab('issue');
    } else if (act === 'print') {
      const tpls = await St.listTemplates(doc.type);
      const tpl = tpls.find((t) => t.id === doc.templateId) || tpls[0];
      Render.print(Render.renderPages(doc, tpl, settings, { watermark: doc.watermark }));
    } else if (act === 'delete') {
      const label = formatNumber(doc.type, doc.number, settings);
      const n = (doc._payments || []).length;
      if (!confirm(`حذف المستند ${label}؟` + (n ? `\nمرتبط بها ${n} وصل تسديد، تبقى الوصولات لكن بدون فاتورة.` : '') +
        '\nالأفضل "إلغاء" المستند بدل حذفه. نسخة منه تبقى في سجل العمليات ويمكن إرجاعها من هناك.')) return;
      await St.deleteDocument(path);
      toast('تم حذف ' + label);
      switchTab(currentTab);
    }
  }

  // ----- أرشيف التسديدات -----
  let payDocs = [];
  let payFilter = 0; // رقم فاتورة لعرض تسديداتها فقط
  /** وصل تسديد جديد مرتبط بفاتورة، بالمبلغ المتبقي عليها */
  async function payInvoice(inv) {
    const m = money(inv);
    const label = invLabel(inv.number);
    const prefill = {
      customer: inv.data.customer || '', customerPhone: inv.data.customerPhone || '', customerAddress: inv.data.customerAddress || '',
      amount: String(Math.round(m.due * 100) / 100), invoiceNo: Number(inv.number),
      purpose: `تسديد فاتورة رقم ${label}`, transactionType: 'تسديد',
    };
    if (await window.Issue.startNew('receipt', prefill, inv.currency)) switchTab('issue');
  }
  async function renderPayments(reload = true) {
    if (reload) payDocs = await loadAll();
    const q = $('#pay-search').value.trim().toLowerCase();
    const link = $('#pay-link').value;
    const inv = payFilter ? payDocs.find((d) => d.type === 'sales' && Number(d.number) === payFilter) : null;
    $('#pay-filter').hidden = !payFilter;
    if (payFilter) {
      const m = inv ? money(inv) : null;
      $('#pay-filter-text').innerHTML = inv
        ? `تسديدات الفاتورة <b>${esc(invLabel(payFilter))}</b> — ${esc(inv.data.customer || '')}: الإجمالي ${esc(formatMoney(m.total, inv.currency))}، الواصل بالفاتورة ${esc(formatMoney(m.paid, inv.currency))}، المسدد بالوصولات ${esc(formatMoney(m.linked, inv.currency))}، <b class="${m.due > 0.0001 ? 'red' : 'green'}">المتبقي ${esc(formatMoney(m.due, inv.currency))}</b>`
        : `تسديدات الفاتورة <b>${esc(invLabel(payFilter))}</b> (الفاتورة محذوفة)`;
      $('#btn-pay-filter-add').hidden = !(inv && m.due > 0.0001);
    }
    const rows = payDocs.filter((d) => {
      if (d.type !== 'receipt') return false;
      if (payFilter) return allocsOf(d).some((a) => a.invoiceNo === payFilter);
      if (link === 'linked' && !d._invoice) return false;
      if (link === 'free' && d._invoice) return false;
      if (link === 'credit' && !(d._unallocated > 0.0001)) return false;
      if (!q) return true;
      return (searchText(d) + ' ' + (d._invoices || []).map((x) => invLabel(x.missing ? x.number : x.inv.number)).join(' ')).toLowerCase().includes(q);
    });
    $('#pay-body').innerHTML = rows.map((d) => {
      const i = d._invoice;
      const list = d._invoices || [];
      const invCell = isCancelled(d) ? '<span class="badge muted-badge">ملغى</span>'
        : !list.length ? '<span class="muted">بدون فاتورة</span>'
        : list.map((x) => x.missing ? `<span class="muted">${esc(invLabel(x.number))} (محذوفة)</span>`
          : `<button class="linkish strong" data-act="open-invoice" data-no="${Number(x.inv.number)}">${esc(invLabel(x.inv.number))}</button>${list.length > 1 ? ` <small class="muted">${esc(formatMoney(x.amount, d.currency))}</small>` : ''}`).join('<br>') +
          (d._unallocated > 0.0001 ? `<div class="link-note muted">غير موزّع: ${esc(formatMoney(d._unallocated, d.currency))}</div>` : '');
      const left = list.length === 1 && i && !i.missing ? money(i) : null;
      return `
      <tr data-path="${esc(d._path)}" class="${isCancelled(d) ? 'cancelled' : ''}">
        <td class="num strong">${esc(formatNumber(d.type, d.number, settings))}</td>
        <td class="num">${esc(d.date)}</td>
        <td class="strong">${esc(d.data.customer)}<div class="link-note muted">${esc(d.data.purpose || '')}</div></td>
        <td class="money">${esc(formatMoney(Render.totals(d).total, d.currency))}<div class="link-note muted">${esc(Render.payText(d.data))}${d.data.ref ? ' · ' + esc(d.data.ref) : ''}</div></td>
        <td>${invCell}</td>
        <td class="money">${left ? (left.due > 0.0001 ? `<span class="red">${esc(formatMoney(left.due, i.currency))}</span>` : '<span class="badge success">مسددة بالكامل</span>') : list.filter((x) => x.inv).length > 1 ? list.filter((x) => x.inv).map((x) => money(x.inv).due > 0.0001 ? `<span class="red">${esc(formatMoney(money(x.inv).due, x.inv.currency))}</span>` : '<span class="badge success">مسددة</span>').join('<br>') : '—'}</td>
        <td class="acts">
          <button class="btn small ghost" data-act="open">فتح</button>
          <button class="btn small ghost" data-act="print">طباعة</button>
          <button class="btn small ghost danger" data-act="delete">حذف</button>
        </td>
      </tr>`;
    }).join('');
    const sums = {};
    for (const d of rows) addTo(sums, d.currency, money(d).total);
    const T = sumText(sums, settings.defaults.currency || 'IQD');
    $('#pay-foot').innerHTML = rows.length ? `<tr><td colspan="7" class="muted">${rows.length} وصل تسديد — المجموع <b dir="ltr">${esc(T.main)}</b> ${esc(T.rest)}</td></tr>` : '';
    $('#pay-empty').hidden = rows.length > 0;
    // الفواتير المفتوحة (عليها متبقي) لإنشاء وصل تسديد بسرعة
    const open = payDocs.filter((d) => d.type === 'sales' && money(d).due > 0.0001);
    $('#pay-open').innerHTML = open.slice(0, 12).map((d) => `
      <li data-path="${esc(d._path)}"><span><b>${esc(invLabel(d.number))}</b> · ${esc(d.data.customer || '')}</span>
      <span class="row"><b class="red">${esc(formatMoney(money(d).due, d.currency))}</b><button class="btn small" data-act="pay">💵 تسديد</button></span></li>`).join('');
    $('#pay-open-empty').hidden = open.length > 0;
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

  const pv = { templateId: null, type: 'sales', size: 'A4', blank: false, watermark: null, theme: null, design: null };
  /** ألوان جاهزة سريعة: [رئيسي، غامق، إبراز] */
  const SWATCHES = [
    ['#174257', '#0d2836', '#245b73'], ['#0f766e', '#0f172a', '#14b8a6'], ['#1d4ed8', '#172554', '#f59e0b'],
    ['#7c2d12', '#431407', '#ea580c'], ['#6d28d9', '#2e1065', '#a78bfa'], ['#be123c', '#4c0519', '#fb7185'],
    ['#166534', '#052e16', '#84cc16'], ['#334155', '#0f172a', '#94a3b8'],
  ];
  function designNow() {
    const base = { ...St.DEFAULT_DESIGN, ...(settings.design || {}) };
    base.cols = { ...St.DEFAULT_DESIGN.cols, ...((settings.design && settings.design.cols) || {}) };
    return pv.design || base;
  }
  function syncDesignInputs() {
    const d = designNow();
    $$('#design-form [data-d]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = d[el.dataset.d] !== false;
      else el.value = d[el.dataset.d] == null || d[el.dataset.d] === '' ? (el.dataset.d === 'margin' ? 8 : '') : d[el.dataset.d];
    });
    $$('#design-form [data-col]').forEach((el) => { el.checked = !!d.cols[el.dataset.col]; });
    $('#design-form [data-o="scale"]').textContent = (d.scale || 100) + '%';
    $('#design-form [data-o="margin"]').textContent = d.margin ? d.margin + ' ملم' : 'افتراضي';
  }
  function readDesignInputs() {
    const d = JSON.parse(JSON.stringify(designNow()));
    $$('#design-form [data-d]').forEach((el) => {
      const k = el.dataset.d;
      d[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    });
    $$('#design-form [data-col]').forEach((el) => { d.cols[el.dataset.col] = el.checked; });
    pv.design = d;
    syncDesignInputs();
    renderPreview();
  }
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
    if (pv.type === 'sales' && designNow().cols.code) doc.data = { ...doc.data, items: doc.data.items.map((it, i) => ({ ...it, code: 'P-10' + (i + 1) })) };
    const r = Render.renderPages(doc, tpl, s, { blank: pv.blank, watermark: pv.watermark, design: designNow() });
    $('#pv-area').innerHTML = r.html;
    Render.fitPreview($('#pv-area'));
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
        ${t.builtin ? '' : '<span class="tpl-del" data-del="' + esc(t.id) + '" title="حذف القالب من المجلد">حذف</span>'}
      </button>`).join('');
    const tpl = currentTemplate();
    $('#pv-type').innerHTML = (tpl.types || []).map((k) => `<option value="${k}">${esc(St.DOC_TYPES[k].label)}</option>`).join('');
    if (!(tpl.types || []).includes(pv.type)) pv.type = tpl.types[0];
    $('#pv-type').value = pv.type;
    $('#pv-size').innerHTML = (tpl.sizes || []).map((k) => {
      const hint = pv.type === 'receipt' ? (k === 'A4' || k === 'Letter' ? ' — وصلين بالورقة' : k === 'A5' ? ' — أفقي' : '') : '';
      return `<option value="${k}">${esc(St.SIZE_LABELS[k] || k)}${hint}</option>`;
    }).join('');
    if (!(tpl.sizes || []).includes(pv.size)) pv.size = tpl.sizes[0];
    $('#pv-size').value = pv.size;
    $('#pv-blank').checked = pv.blank;
    $('#pv-watermark').checked = pv.watermark;
    syncThemeInputs();
    syncDesignInputs();
    $('#pv-swatches').innerHTML = SWATCHES.map((c, i) => `<button type="button" class="swatch" data-sw="${i}" title="تطبيق هذه الألوان" style="background:linear-gradient(135deg,${c[1]} 0 40%,${c[0]} 40% 75%,${c[2]} 75%)"></button>`).join('');
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
    $$('[name]', form).forEach((el) => { const v = getPath(settings, el.name); el.value = v == null ? '' : v; });
    $('#logo-preview').src = settings.company.logo || '';
    renderCloud();
    renderSecurity();
  }

  // ---------- سجل العمليات ----------
  const AUDIT_ACTIONS = {
    create: 'إنشاء', update: 'تعديل', delete: 'حذف', cancel: 'إلغاء', restore: 'إرجاع من الإلغاء', undelete: 'إرجاع محذوف',
    settings: 'الإعدادات', migrate: 'ترحيل البيانات', login: 'دخول', logout: 'خروج',
  };
  let auditRows = [];
  async function renderAudit(reload = true) {
    if (reload) {
      auditRows = await St.listAudit();
      const months = [...new Set(auditRows.map((r) => (r.at || '').slice(0, 7)))];
      const sel = $('#audit-month'); const keep = sel.value;
      sel.innerHTML = '<option value="">كل الأشهر</option>' + months.map((m) => `<option>${esc(m)}</option>`).join('');
      sel.value = months.includes(keep) ? keep : '';
      const as = $('#audit-action');
      if (as.options.length <= 1) as.innerHTML = '<option value="">كل العمليات</option>' + Object.entries(AUDIT_ACTIONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    }
    const q = $('#audit-search').value.trim().toLowerCase();
    const month = $('#audit-month').value, action = $('#audit-action').value;
    const rows = auditRows.filter((r) => (!month || (r.at || '').startsWith(month)) && (!action || r.action === action) &&
      (!q || [r.label, r.user, r.path].join(' ').toLowerCase().includes(q)));
    const amount = (d) => (d && d.type ? formatMoney(Render.totals(d).total, d.currency) : '');
    const change = (r) => {
      if (r.action === 'settings') return Object.keys(r.after || {}).map((k) => `${esc(k)}: <s>${esc(JSON.stringify((r.before || {})[k]))}</s> ← ${esc(JSON.stringify(r.after[k]))}`).join('<br>');
      if (r.action === 'update' && r.before && r.after) {
        const a = amount(r.before), b = amount(r.after);
        return a !== b ? `المبلغ: <s>${esc(a)}</s> ← ${esc(b)}` : 'تعديل بيانات';
      }
      return esc(amount(r.after || r.before));
    };
    $('#audit-body').innerHTML = rows.slice(0, 500).map((r, i) => `
      <tr data-i="${auditRows.indexOf(r)}">
        <td class="num">${esc((r.at || '').replace('T', ' ').slice(0, 19))}</td>
        <td><span class="badge ${['delete', 'cancel'].includes(r.action) ? 'danger' : r.action === 'create' ? 'success' : ''}">${esc(AUDIT_ACTIONS[r.action] || r.action)}</span></td>
        <td class="strong">${esc(r.label || r.path)}</td>
        <td class="muted" style="font-size:12px">${change(r)}</td>
        <td dir="ltr" class="muted" style="font-size:12px">${esc(r.user || '')}</td>
        <td class="acts">${r.action === 'delete' && r.before ? '<button class="btn small ghost" data-audit="undelete">إرجاع</button>' : ''}</td>
      </tr>`).join('');
    $('#audit-empty').hidden = rows.length > 0;
    $('#audit-count').textContent = rows.length > 500 ? `آخر 500 من ${rows.length}` : `${rows.length} عملية`;
  }
  $('#audit-search').addEventListener('input', () => renderAudit(false));
  $('#audit-month').addEventListener('change', () => renderAudit(false));
  $('#audit-action').addEventListener('change', () => renderAudit(false));
  $('#audit-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-audit]');
    if (!b) return;
    const r = auditRows[Number(b.closest('tr').dataset.i)];
    try { await St.restoreDeleted(r); toast('تم إرجاع المستند للأرشيف'); renderAudit(true); }
    catch (err) { toast(err.message, true); }
  });

  // ---------- الأمان ----------
  function renderSecurity() {
    $('#sec-user').textContent = window.Auth.user || '';
    $('#sec-idle').value = String(window.Auth.idle);
  }
  $('#btn-lock').addEventListener('click', () => window.Auth.lock());
  $('#btn-lock-now').addEventListener('click', () => window.Auth.lock());
  $('#sec-idle').addEventListener('change', (e) => { window.Auth.setIdle(Number(e.target.value)); toast('تم حفظ مدة القفل التلقائي'); });
  $('#sec-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if ($('#sec-new').value !== $('#sec-new2').value) return toast('كلمتا السر الجديدتان غير متطابقتين', true);
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await window.Auth.changePassword($('#sec-cur').value, $('#sec-new').value);
      f.reset();
      toast('تم تغيير كلمة السر');
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

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
    if (file.size > 500 * 1024) return toast('حجم الشعار كبير، اختر صورة أقل من 500KB', true);
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
    if (await S.grantPending()) { window.Cloud.configure({ cloudOnly: false }); openApp(); }
    else showGate('needs-permission', 'لم يتم السماح بالوصول للمجلد.');
  });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  // أزرار التنقل والإصدار السريع في أي مكان
  $('#app').addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go && !go.closest('#issue-form')) return switchTab(go.dataset.goto);
    const nw = e.target.closest('[data-new]');
    if (nw) return newFor(nw.dataset.new);
  });
  $('#btn-top-new').addEventListener('click', () => newFor((window.Issue.current && window.Issue.current.type) || 'sales'));
  $('#dash-backup').addEventListener('click', () => downloadBackup().catch((e) => toast(e.message, true)));
  $('#dash-period').addEventListener('change', () => renderDashboard().catch((e) => toast(e.message, true)));
  $('#dash-recent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) archiveAction(b.dataset.act, b.closest('[data-path]').dataset.path, b).catch((err) => toast(err.message, true));
  });
  $('#cust-search').addEventListener('input', () => renderCustomers(false));
  $('#cust-sort').addEventListener('change', () => renderCustomers(false));
  $('#customers-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cust]');
    if (!b) return;
    const c = custList[Number(b.closest('.customer').dataset.i)];
    if (b.dataset.cust === 'history') {
      $('#archive-search').value = c.name; $('#archive-status').value = ''; $('#archive-type').value = '';
      switchTab('archive');
    } else newFor(b.dataset.cust, c).catch((err) => toast(err.message, true));
  });
  $('#archive-status').addEventListener('change', () => renderArchive(false));

  // ----- الوضع الليلي -----
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('#theme-icon').textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('im-theme', t); } catch (e) { /* تجاهل */ }
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  $('#btn-theme').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  $('#archive-type').addEventListener('change', () => renderArchive(false));
  $('#archive-search').addEventListener('input', () => renderArchive(false));
  $('#archive-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) archiveAction(b.dataset.act, b.closest('[data-path]').dataset.path, b).catch((err) => toast(err.message, true));
  });
  $('#btn-archive-refresh').addEventListener('click', () => renderArchive(true));
  $('#pay-search').addEventListener('input', () => renderPayments(false));
  $('#pay-link').addEventListener('change', () => renderPayments(false));
  $('#btn-pay-filter-clear').addEventListener('click', () => { payFilter = 0; renderPayments(false); });
  $('#btn-pay-filter-add').addEventListener('click', () => { const inv = payDocs.find((d) => d.type === 'sales' && Number(d.number) === payFilter); if (inv) payInvoice(inv); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab="payments"]'); if (b) payFilter = 0; }, true);
  ['#pay-body', '#pay-open'].forEach((sel) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) archiveAction(b.dataset.act, b.closest('[data-path]').dataset.path, b).catch((err) => toast(err.message, true));
  }));
  $('#tpl-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const exists = (await St.listTemplates()).find((t) => t.id === json.id && !t.builtin);
      if (exists && !confirm(`يوجد قالب بنفس المعرّف (${json.id}). تريد استبداله؟`)) return;
      await St.saveTemplate(json);
      pv.templateId = json.id; pv.theme = null;
      toast('تم استيراد القالب: ' + (json.name || json.id));
      renderTemplates();
    } catch (err) { toast('تعذّر استيراد القالب: ' + err.message, true); }
  });
  $('#templates-list').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      if (!confirm('حذف هذا القالب من مجلد العمل؟ المستندات المحفوظة به تبقى، لكنها تُطبع بقالب آخر.')) return;
      await St.deleteTemplate(del.dataset.del);
      if (pv.templateId === del.dataset.del) pv.templateId = null;
      toast('تم حذف القالب');
      return renderTemplates();
    }
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
  $('#pv-swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    const c = SWATCHES[Number(b.dataset.sw)];
    pv.theme = { primary: c[0], dark: c[1], accent: c[2] };
    syncThemeInputs(); renderPreview();
  });
  $('#design-form').addEventListener('input', readDesignInputs);
  $('#design-form').addEventListener('change', readDesignInputs);
  $('#btn-design-save').addEventListener('click', async () => {
    try {
      const next = JSON.parse(JSON.stringify(settings));
      next.design = designNow();
      settings = await St.saveSettings(next);
      pv.design = null;
      toast('تم حفظ التصميم، يطبَّق على كل المستندات');
      renderTemplates();
    } catch (err) { toast(err.message, true); }
  });
  $('#btn-design-reset').addEventListener('click', () => { pv.design = JSON.parse(JSON.stringify(St.DEFAULT_DESIGN)); syncDesignInputs(); renderPreview(); });
  $('#settings-form').addEventListener('submit', (e) => saveSettingsForm(e).catch((err) => toast('تعذّر الحفظ: ' + err.message, true)));
  $('#logo-input').addEventListener('change', (e) => readLogo(e.target.files[0]));
  $('#btn-logo-clear').addEventListener('click', () => { $('#logo-preview').removeAttribute('src'); $('#logo-input').value = ''; });
  $('#btn-export').addEventListener('click', () => downloadBackup().catch((e) => toast(e.message, true)));

  // للاختبار: تشغيل البرنامج على مجلد جاهز
  window.App = {
    openApp, loadAll, money, allocsOf, invLabel, toast, formatNumber, formatMoney, switchTab, pv, isCancelled, todayStr,
    get settings() { return settings; },
    set settings(v) { settings = v; },
  };

  // ----- أحداث السحابة -----
  window.Cloud.onStatus(showCloudStatus);
  $('#btn-gate-cloud').addEventListener('click', () => openCloud().catch((e) => showGate(S.supported ? (S.folderName ? 'needs-permission' : 'none') : 'unsupported', e.message)));
  // تغييرات من جهاز آخر: نحدّث الشاشة الحالية (ما عدا شاشة الإصدار حتى لا يضيع ما تكتبه)
  window.addEventListener('cloud-pulled', async () => {
    try { settings = await St.getSettings(); } catch (e) { return; }
    if (currentTab !== 'issue' && !$('#app').hidden) renderers[currentTab]().catch(() => {});
  });
  $('#btn-cloud-sync').addEventListener('click', async () => {
    try { await window.Cloud.sync(); toast('تمت المزامنة مع Firebase'); }
    catch (err) { toast('تعذّرت المزامنة: ' + err.message, true); }
  });
  $('#btn-cloud-upload').addEventListener('click', async () => {
    try { await window.Cloud.uploadAll(); toast('تم رفع كل بيانات المجلد إلى Firebase'); }
    catch (err) { toast('تعذّر الرفع: ' + err.message, true); }
  });
  $('#btn-cloud-download').addEventListener('click', async () => {
    if (!confirm('نسخ كل بيانات Firebase إلى المجلد؟ الملفات بنفس الاسم تُستبدل بنسخة Firebase.')) return;
    try {
      const n = await window.Cloud.downloadAll();
      settings = await St.getSettings();
      toast(`تم نسخ ${n} ملف من Firebase إلى المجلد`);
      renderSettings();
    } catch (err) { toast('تعذّر النسخ: ' + err.message, true); }
  });
  $('#btn-gh-import').addEventListener('click', async (e) => {
    const b = e.target;
    b.disabled = true;
    try {
      const n = await window.Cloud.importFromGitHub($('#gh-repo').value, $('#gh-token').value.trim());
      $('#gh-token').value = '';
      settings = await St.getSettings();
      toast(`تم نقل ${n} ملف من GitHub إلى Firebase`);
      renderSettings();
    } catch (err) { toast('تعذّر النقل: ' + err.message, true); }
    finally { b.disabled = false; }
  });
  $('#btn-logout').addEventListener('click', () => {
    if (!confirm('تسجيل الخروج من هذا الجهاز؟ بياناتك تبقى محفوظة على Firebase.')) return;
    window.Auth.logout();
  });

  window.Auth.gate().then(boot).catch((e) => showGate('none', e.message));
})();
