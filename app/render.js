/*
 * render.js — تحويل مستند + قالب إلى صفحات جاهزة للمعاينة والطباعة
 *
 * القالب كائن يُسجَّل عبر Store.registerTemplate:
 *   {
 *     id, name, description,
 *     types: ['sales', 'receipt'],     الأنواع التي يدعمها
 *     sizes: ['A4', 'A5'],             المقاسات التي يدعمها
 *     css: '...',                      تنسيق القالب (يُحقن مرة واحدة)
 *     render(ctx) => html              يرسم نسخة واحدة من المستند
 *   }
 *
 * ctx يحتوي: doc, data, type, title, number, company, theme, blank, half,
 *            totals, words, h (أدوات مساعدة)
 */
(function () {
  'use strict';
  const St = window.Store;

  // ---------- أدوات ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function num(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function currency(code) { return St.CURRENCIES[code] || St.CURRENCIES.IQD; }
  function fmt(amount, code) {
    const c = currency(code);
    return num(amount).toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  }
  function money(amount, code) { return fmt(amount, code) + ' ' + currency(code).symbol; }

  // ---------- التفقيط (كتابة المبلغ بالحروف) ----------
  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const SCALES = [
    null,
    { one: 'ألف', two: 'ألفان', plural: 'آلاف', single: 'ألف' },
    { one: 'مليون', two: 'مليونان', plural: 'ملايين', single: 'مليون' },
    { one: 'مليار', two: 'ملياران', plural: 'مليارات', single: 'مليار' },
  ];

  function below1000(n) {
    const parts = [];
    const h = Math.floor(n / 100), r = n % 100;
    // "مائتا" عند الإضافة (مائتا ألف، مائتا دينار)
    if (h) parts.push(h === 2 && !r ? 'مائتا' : HUNDREDS[h]);
    if (r) {
      if (r < 10) parts.push(ONES[r]);
      else if (r < 20) parts.push(TEENS[r - 10]);
      else parts.push(r % 10 ? ONES[r % 10] + ' و' + TENS[Math.floor(r / 10)] : TENS[Math.floor(r / 10)]);
    }
    return parts.join(' و');
  }

  function integerWords(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'صفر';
    const groups = [];
    for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
      const g = n % 1000;
      if (!g) continue;
      const s = SCALES[i];
      let w;
      if (!s) w = below1000(g);
      else if (g === 1) w = s.one;
      else if (g === 2) w = s.two;
      else w = below1000(g) + ' ' + (g % 100 >= 3 && g % 100 <= 10 ? s.plural : s.single);
      groups.unshift(w);
    }
    return groups.join(' و');
  }

  const CURRENCY_WORDS = {
    IQD: { main: 'دينار عراقي', sub: 'فلس' },
    USD: { main: 'دولار أمريكي', sub: 'سنت' },
  };

  /** "فقط مائة وخمسون ألف دينار عراقي لا غير" */
  function tafqeet(amount, code) {
    const a = Math.abs(num(amount));
    const cw = CURRENCY_WORDS[code] || CURRENCY_WORDS.IQD;
    const whole = Math.floor(a);
    const fraction = Math.round((a - whole) * (code === 'IQD' ? 1000 : 100));
    let s = 'فقط ' + integerWords(whole) + ' ' + cw.main;
    if (fraction) s += ' و' + integerWords(fraction) + ' ' + cw.sub;
    return s + ' لا غير';
  }

  // ---------- الحسابات ----------
  function totals(doc) {
    const d = doc.data || {};
    if (doc.type === 'receipt') {
      const amount = num(d.amount);
      return { subtotal: amount, discount: 0, net: amount, prevBalance: 0, grand: amount, paid: amount, remaining: 0, total: amount };
    }
    const items = (d.items || []).filter((it) => it && (it.name || num(it.qty) || num(it.price)));
    const subtotal = items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
    const discount = num(d.discount);
    const net = subtotal - discount;
    const prevBalance = num(d.prevBalance);           // رصيد / طلب سابق على الزبون
    const grand = net + prevBalance;                   // المطلوب الكلي
    const paid = d.paid === '' || d.paid == null ? net : num(d.paid);
    return { subtotal, discount, net, prevBalance, grand, paid, remaining: grand - paid, total: net };
  }

  // ---------- أجزاء مشتركة بين القوالب ----------
  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  };

  function logoHTML(company, cls) {
    if (company.logo) return `<img src="${esc(company.logo)}" class="${cls}-img" alt="">`;
    return `<div class="${cls}-symbol">${esc(company.logoSymbol || '')}</div>` +
      (company.logoText ? `<div class="${cls}-sub">${esc(company.logoText)}</div>` : '');
  }

  function watermarkHTML(company, show) {
    if (!show) return '';
    if (company.logo) return `<div class="wm"><img src="${esc(company.logo)}" alt=""></div>`;
    if (!company.logoSymbol) return '';
    return `<div class="wm"><span>${esc(company.logoSymbol)}</span></div>`;
  }

  const h = { esc, num, fmt, money, icons: ICONS, logo: logoHTML, watermark: watermarkHTML, tafqeet };

  // ---------- القوالب المستوردة (ملف JSON بدون كود) ----------
  /*
   * صيغة القالب المستورد:
   *   { "id": "my-invoice", "name": "...", "types": ["sales"], "sizes": ["A4","A5"],
   *     "minRows": 10, "theme": { "primary": "#..", "dark": "#..", "accent": "#.." },
   *     "css": ".tpl-my-invoice .x { ... }",
   *     "html": "<div class='doc'> {{company.name}} ... {{#items}}<tr><td>{{i}}</td><td>{{name}}</td></tr>{{/items}} ..." }
   * الوسوم: {{x}} نص، {{{x}}} HTML (مثل logo)، {{#x}}...{{/x}} تكرار أو شرط، {{^x}}...{{/x}} إذا كان فارغاً.
   */
  function lookup(stack, key) {
    if (key === '.') return stack[stack.length - 1];
    for (let i = stack.length - 1; i >= 0; i--) {
      let v = stack[i];
      let ok = true;
      for (const part of key.split('.')) {
        if (v != null && typeof v === 'object' && part in v) v = v[part];
        else { ok = false; break; }
      }
      if (ok) return v;
    }
    return undefined;
  }

  function mustache(tplStr, view) {
    function run(str, stack) {
      let out = '';
      let i = 0;
      const re = /\{\{(\{?)([#^\/]?)\s*([\w.]+)\s*\}?\}\}/g;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(str))) {
        out += str.slice(i, m.index);
        const [all, raw, kind, key] = m;
        if (kind === '#' || kind === '^') {
          // نبحث عن الإغلاق المطابق مع مراعاة التداخل
          const open = new RegExp('\\{\\{\\s*[#^]\\s*' + key.replace('.', '\\.') + '\\s*\\}\\}|\\{\\{\\s*\\/\\s*' + key.replace('.', '\\.') + '\\s*\\}\\}', 'g');
          open.lastIndex = re.lastIndex;
          let depth = 1, mm, end = -1, endLen = 0;
          while ((mm = open.exec(str))) {
            if (mm[0].includes('/')) { if (--depth === 0) { end = mm.index; endLen = mm[0].length; break; } }
            else depth++;
          }
          if (end < 0) throw new Error('وسم غير مغلق: ' + key);
          const inner = str.slice(re.lastIndex, end);
          const v = lookup(stack, key);
          const truthy = Array.isArray(v) ? v.length > 0 : !!v;
          if (kind === '#') {
            if (Array.isArray(v)) out += v.map((x) => run(inner, stack.concat([x]))).join('');
            else if (truthy) out += run(inner, typeof v === 'object' ? stack.concat([v]) : stack);
          } else if (!truthy) out += run(inner, stack);
          i = re.lastIndex = end + endLen;
          continue;
        }
        if (kind === '/') { i = re.lastIndex; continue; }
        const v = lookup(stack, key);
        out += raw ? (v == null ? '' : String(v)) : esc(v);
        i = re.lastIndex;
      }
      return out + str.slice(i);
    }
    return run(tplStr, [view]);
  }

  function viewFor(ctx, minRows) {
    const { data, totals: t, currency, blank } = ctx;
    const m = (x) => (blank ? '' : money(x, currency));
    const items = (blank ? [] : (data.items || [])).map((it, i) => ({
      i: i + 1, name: it.name, notes: it.notes, unit: it.unit, qty: it.qty, pack: it.pack,
      price: fmt(it.price, currency), total: fmt(num(it.qty) * num(it.price), currency),
    }));
    const emptyRows = [];
    if (blank) for (let k = items.length; k < (minRows || 0); k++) emptyRows.push({ i: k + 1 }); // للنموذج اليدوي فقط
    const v = (x) => (blank ? '' : x);
    return {
      company: ctx.company, title: ctx.title, number: ctx.number, copyLabel: ctx.copyLabel,
      date: v(ctx.doc.date), blank,
      logo: logoHTML(ctx.company, 'logo'), watermark: watermarkHTML(ctx.company, ctx.watermark),
      icons: ICONS, symbol: currency_symbol(currency),
      customer: v(data.customer), customerAddress: v(data.customerAddress), customerPhone: v(data.customerPhone),
      paymentMethod: v(data.paymentMethod), transactionType: v(data.transactionType),
      purpose: v(data.purpose), notes: v(data.notes), terms: data.terms, receiver: v(data.receiver), accountant: v(data.accountant),
      items, emptyRows, itemCount: blank ? '' : items.reduce((s, it) => s + num(it.qty), 0),
      subtotal: m(t.subtotal), discount: m(t.discount), net: m(t.net), prevBalance: m(t.prevBalance),
      hasPrev: !!t.prevBalance, grand: m(t.grand), paid: m(t.paid), remaining: m(t.remaining), total: m(t.total),
      amount: m(t.total), words: ctx.words, isSales: ctx.type === 'sales', isReceipt: ctx.type === 'receipt',
    };
  }
  function currency_symbol(code) { return currency(code).symbol; }

  /** يحوّل قالباً مستورداً (JSON) إلى قالب قابل للرسم */
  function compileTemplate(json) {
    if (!json || !json.id || !json.html) throw new Error('ملف القالب ناقص: يحتاج id و html');
    if (!/^[a-z0-9-]+$/i.test(json.id)) throw new Error('معرّف القالب يجب أن يكون حروفاً إنكليزية وأرقاماً و - فقط');
    mustache(json.html, {}); // فحص الصيغة
    return {
      ...json,
      types: json.types && json.types.length ? json.types : ['sales'],
      sizes: json.sizes && json.sizes.length ? json.sizes : ['A4', 'A5'],
      render: (ctx) => mustache(json.html, viewFor(ctx, json.minRows == null ? 10 : json.minRows)),
    };
  }

  // ---------- تخطيط الصفحات ----------
  /**
   * كيف يُوزّع المستند على الورق حسب النوع والمقاس:
   *  - الفاتورة: نسخة واحدة تملأ الصفحة. في A5 نفس التصميم مصغّراً.
   *  - الوصل: في A4 نسختان (أصل + نسخة) مع خط قص، وفي A5 أفقي نسخة واحدة.
   */
  function layoutFor(type, size) {
    if (type === 'receipt') {
      return size === 'A5'
        ? { page: 'A5 landscape', w: 210, hgt: 148, copies: 1, half: true, zoom: 1 }
        : { page: 'A4 portrait', w: 210, hgt: 297, copies: 2, half: true, zoom: 1 };
    }
    return size === 'A5'
      ? { page: 'A5 portrait', w: 210, hgt: 297, copies: 1, half: false, zoom: 148 / 210 }
      : { page: 'A4 portrait', w: 210, hgt: 297, copies: 1, half: false, zoom: 1 };
  }

  const injected = new Set();
  function injectCSS(tpl) {
    if (!tpl.css || injected.has(tpl.id)) return;
    const st = document.createElement('style');
    st.dataset.template = tpl.id;
    st.textContent = tpl.css;
    document.head.appendChild(st);
    injected.add(tpl.id);
  }

  function themeVars(theme) {
    const t = theme || {};
    return `--c-primary:${t.primary || '#174257'};--c-dark:${t.dark || '#0d2836'};--c-accent:${t.accent || '#0ea5e9'};`;
  }

  /**
   * يرجع HTML لصفحة واحدة (أو أكثر) جاهزة.
   * opts: { blank: طباعة نموذج فارغ للكتابة اليدوية, watermark }
   */
  function renderPages(doc, tpl, settings, opts = {}) {
    injectCSS(tpl);
    // نتجاهل أسطر المواد الفارغة
    if (doc.data && Array.isArray(doc.data.items)) {
      doc = { ...doc, data: { ...doc.data, items: doc.data.items.filter((it) => it && (it.name || num(it.qty) || num(it.price))) } };
    }
    const size = (tpl.sizes || []).includes(doc.size) ? doc.size : (tpl.sizes || ['A4'])[0];
    const L = layoutFor(doc.type, size);
    const company = { ...St.DEFAULT_SETTINGS.company, ...(settings.company || {}) };
    const blank = !!opts.blank;
    const watermark = opts.watermark != null ? opts.watermark : !!(settings.defaults && settings.defaults.watermark);
    const t = totals(doc);
    const d = doc.data || {};
    const prefix = (settings.prefixes && settings.prefixes[doc.type]) || '';
    const numberText = doc.number ? (prefix ? prefix + '-' : '') + String(doc.number).padStart(5, '0') : '';
    const title = (settings.titles && settings.titles[doc.type]) || (St.DOC_TYPES[doc.type] || {}).label || '';

    const theme = { ...(tpl.theme || {}), ...((settings.templateThemes || {})[tpl.id] || {}) };
    const copies = [];
    for (let i = 0; i < L.copies; i++) {
      const ctx = {
        doc, data: d, type: doc.type, title, company, currency: doc.currency || 'IQD',
        number: blank ? '' : numberText,
        copyLabel: L.copies > 1 ? (i === 0 ? 'الأصل' : 'نسخة') : '',
        theme, blank, half: L.half, totals: t,
        words: blank ? '' : (d.amountWords || tafqeet(t.total, doc.currency)),
        watermark, h,
      };
      copies.push(`<div class="copy">${tpl.render(ctx)}</div>`);
    }
    const sep = L.copies > 1 ? '<div class="cut-line"><span>✂</span></div>' : '';
    const inner = copies.join(sep);
    return {
      page: L.page,
      html: `<div class="sheet tpl-${esc(tpl.id)} type-${esc(doc.type)} size-${size}" style="${themeVars(theme)}--sheet-w:${L.w}mm;--sheet-h:${L.hgt}mm;--zoom:${L.zoom}">` +
        `<div class="sheet-inner">${inner}</div></div>`,
    };
  }

  // ---------- الطباعة ----------
  function print(rendered) {
    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    let st = document.getElementById('print-page-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'print-page-style';
      document.head.appendChild(st);
    }
    st.textContent = `@page { size: ${rendered.page}; margin: 0; }`;
    root.innerHTML = rendered.html;
    // ننتظر تحميل الخطوط والصور قبل فتح نافذة الطباعة
    const imgs = Array.from(root.querySelectorAll('img')).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }));
    Promise.all([document.fonts ? document.fonts.ready : null, ...imgs]).then(() => {
      window.print();
    });
  }

  window.Render = { renderPages, print, totals, tafqeet, integerWords, money, fmt, esc, layoutFor, compileTemplate, mustache };
})();
