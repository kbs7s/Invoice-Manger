/*
 * القوالب الحديثة — مأخوذة من "فاتورة مبيعات v2"
 *  - modern-angle:   ترويسة غامقة بشكل هندسي مائل
 *  - modern-sidebar: شريط جانبي عمودي فخم
 * الاثنان يشتركان بنفس الجسم (بطاقات البيانات، الجدول الحديث، الخلاصة، التواقيع).
 */
(function () {
  'use strict';

  const base = `
.tpl-M { --border: #e2e8f0; --muted: #64748b; --ink: #0f172a; font-family: 'Readex Pro', 'Cairo', sans-serif; color: var(--ink); }
.tpl-M .doc { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; position: relative; display: flex; flex-direction: column; }
.tpl-M .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }
.tpl-M .wm { opacity: .035; }

.tpl-M .pills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px 20px; background: #f1f5f9; border-bottom: 1px solid var(--border); font-size: 12px; }
.tpl-M .pill { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tpl-M .pill .k { color: var(--muted); font-weight: 700; white-space: nowrap; }
.tpl-M .pill .v { font-weight: 800; text-align: left; }

.tpl-M .body { flex: 1; padding: 8px 20px; }
.tpl-M table.items { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.tpl-M .items th { background: #f1f5f9; color: var(--c-primary); font-weight: 800; padding: 8px 10px; border-bottom: 2px solid var(--border); text-align: center; font-size: 11.5px; }
.tpl-M .items th.name { text-align: right; }
.tpl-M .items td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-weight: 600; height: 32px; }
.tpl-M .items td.name { text-align: right; font-weight: 700; }
.tpl-M .items td.idx { color: var(--muted); }
.tpl-M .items td.idx-empty { color: #cbd5e1; }
.tpl-M .items td.total { color: var(--c-primary); font-weight: 800; }
.tpl-M .items td.note { font-size: 11px; color: var(--muted); }
.tpl-M .items tbody tr:nth-child(even) { background: #fafbfc; }
.tpl-M .items td.dots { border-bottom: 1.5px dashed #cbd5e1; }

.tpl-M .rbody { flex: 1; padding: 14px 24px; display: flex; flex-direction: column; justify-content: space-around; gap: 12px; font-size: 14px; font-weight: 700; }
.tpl-M .rrow { display: flex; align-items: flex-end; gap: 8px; }
.tpl-M .rrow .lbl { white-space: nowrap; }
.tpl-M .fill { border-bottom: 1.5px dashed #94a3b8; flex: 1; min-height: 22px; padding: 0 8px; color: var(--c-primary); font-weight: 700; }
.tpl-M .amount-box { font-size: 15px; font-weight: 800; padding: 3px 12px; border-radius: 6px; background: #f1f5f9; border: 1px solid #cbd5e1; min-width: 140px; text-align: center; }

.tpl-M .summary { display: grid; grid-template-columns: 7fr 5fr; gap: 12px; padding: 10px 20px; background: #f8fafc; border-top: 1px solid var(--border); font-size: 12px; }
.tpl-M .summary .wlabel { font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 2px; }
.tpl-M .summary .words { background: #fff; border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-weight: 700; color: var(--c-primary); min-height: 34px; }
.tpl-M .summary .terms { font-size: 10.5px; color: var(--muted); margin-top: 8px; line-height: 1.5; }
.tpl-M .sumblock { background: linear-gradient(to bottom, #f8fafc, #f1f5f9); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; }
.tpl-M .sumblock > div { display: flex; justify-content: space-between; padding: 2px 0; color: #475569; }
.tpl-M .sumblock .paid { color: #047857; font-weight: 800; border-top: 1px solid var(--border); padding-top: 4px; }
.tpl-M .sumblock .rem { color: #be123c; font-weight: 900; border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 13px; }

.tpl-M .signs { padding: 10px 32px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; font-weight: 700; border-top: 1px solid #f1f5f9; }
.tpl-M .sign { text-align: center; width: 150px; }
.tpl-M .sign span { display: block; margin-bottom: 22px; color: var(--muted); }
.tpl-M .sign .line { border-bottom: 2px dotted #94a3b8; min-height: 20px; padding-bottom: 2px; }
.tpl-M .stamp { width: 80px; height: 56px; border: 1px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; font-weight: 700; }

.tpl-M .ftr { background: var(--c-primary); color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 7px 20px; font-size: 11px; font-weight: 600; min-height: 28px; }
.tpl-M .ftr > div { display: flex; align-items: center; gap: 6px; }
.tpl-M .ftr svg { color: var(--c-accent); }

/* وصل مصغّر (نصف صفحة) */
.tpl-M.type-receipt .rbody { gap: 8px; padding: 10px 24px; }
.tpl-M.type-receipt .signs { padding: 6px 32px; }
.tpl-M.type-receipt .sign span { margin-bottom: 14px; }
`;

  const angle = `
.tpl-modern-angle .banner { position: relative; background: linear-gradient(135deg, var(--c-dark) 0%, var(--c-primary) 100%); color: #fff; padding: 18px 24px 22px; display: flex; justify-content: space-between; align-items: center; overflow: hidden; gap: 12px; }
.tpl-modern-angle .banner::after { content: ''; position: absolute; left: -40px; bottom: -50px; width: 140px; height: 140px; background: var(--c-accent); opacity: .25; transform: rotate(45deg); }
.tpl-modern-angle .banner::before { content: ''; position: absolute; right: 40%; top: -60px; width: 180px; height: 180px; background: rgba(255,255,255,.05); transform: rotate(25deg); }
.tpl-modern-angle .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
.tpl-modern-angle .mark { display: flex; align-items: center; gap: 8px; }
.tpl-modern-angle .mark-img { max-height: 48px; max-width: 130px; object-fit: contain; border-radius: 4px; }
.tpl-modern-angle .mark-symbol { width: 44px; height: 44px; border-radius: 8px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-family: serif; font-size: 22px; font-weight: 900; color: var(--c-accent); }
.tpl-modern-angle .mark-sub { font-size: 10px; letter-spacing: 2px; color: #cbd5e1; font-weight: 700; direction: ltr; max-width: 110px; }
.tpl-modern-angle h2 { margin: 0; font-size: 20px; font-weight: 800; }
.tpl-modern-angle .brand p { margin: 2px 0 0; font-size: 12px; color: #cbd5e1; }
.tpl-modern-angle .docinfo { display: flex; flex-direction: column; align-items: flex-end; position: relative; z-index: 1; }
.tpl-modern-angle .tag { padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 800; background: rgba(255,255,255,.1); color: var(--c-accent); border: 1px solid rgba(255,255,255,.2); white-space: nowrap; }
.tpl-modern-angle .docno { font-size: 14px; font-weight: 800; margin-top: 4px; }
.tpl-modern-angle .copy-tag { font-size: 10px; opacity: .7; }
`;

  const sidebar = `
.tpl-modern-sidebar .doc { flex-direction: row; }
.tpl-modern-sidebar .stripe { width: 48px; background: linear-gradient(135deg, var(--c-dark) 0%, var(--c-primary) 100%); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 20px 4px; color: #fff; position: relative; z-index: 1; }
.tpl-modern-sidebar .stripe .sym { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; font-family: serif; font-weight: 800; color: var(--c-accent); font-size: 17px; overflow: hidden; }
.tpl-modern-sidebar .stripe .sym img { max-width: 100%; max-height: 100%; }
.tpl-modern-sidebar .stripe .vtext { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; letter-spacing: 2px; font-weight: 700; color: rgba(255,255,255,.75); white-space: nowrap; }
.tpl-modern-sidebar .stripe .yr { font-size: 9px; color: var(--c-accent); }
.tpl-modern-sidebar .top { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.tpl-modern-sidebar .top .co { display: flex; align-items: center; gap: 12px; }
.tpl-modern-sidebar .top .co img { max-height: 46px; max-width: 110px; object-fit: contain; }
.tpl-modern-sidebar .top h2 { margin: 0; font-size: 20px; font-weight: 800; }
.tpl-modern-sidebar .top p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.tpl-modern-sidebar .top .docinfo { text-align: left; }
.tpl-modern-sidebar .top .docno { font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 6px; background: #f1f5f9; border: 1px solid #cbd5e1; display: inline-block; }
.tpl-modern-sidebar .top .date { font-size: 11px; color: var(--muted); margin-top: 4px; }
.tpl-modern-sidebar .top .tag { font-size: 11px; font-weight: 800; color: var(--c-primary); margin-bottom: 4px; }
.tpl-modern-sidebar .pills { grid-template-columns: 1fr 1fr; padding: 8px 20px; background: #f8fafc; }
.tpl-modern-sidebar .pills .pill { background: none; border: 0; padding: 2px 0; justify-content: flex-start; }
.tpl-modern-sidebar .pills .pill:last-child { justify-content: flex-end; }
`;

  // ---------- أجزاء مشتركة ----------
  function salesBody(ctx) {
    const { h, data, blank, currency } = ctx;
    const sym = h.esc((window.Store.CURRENCIES[currency] || {}).symbol || '');
    const minRows = blank ? 8 : 0; // أسطر فارغة للنموذج اليدوي فقط
    const items = blank ? [] : (data.items || []);
    const cc = ctx.cols;
    let rows = items.map((it, i) => `
      <tr>
        <td class="idx num">${i + 1}</td>
        ${cc.code ? `<td class="num">${h.esc(it.code)}</td>` : ''}
        <td class="name">${h.esc(it.name)}</td>
        <td class="num">${h.esc(it.qty)}</td>
        ${cc.unit ? `<td>${h.esc(it.unit)}</td>` : ''}
        <td class="num">${h.fmt(it.price, currency)}</td>
        ${cc.disc ? `<td class="num">${h.discCell(it, currency)}</td>` : ''}
        ${cc.tax ? `<td class="num">${h.num(it.taxPct) ? h.num(it.taxPct) + '%' : ''}</td>` : ''}
        <td class="num total">${h.lineFmt(it, currency)}</td>
        ${cc.notes ? `<td class="note">${h.esc(it.notes)}</td>` : ''}
      </tr>`).join('');
    const ncols = 4 + [cc.code, cc.unit, cc.disc, cc.tax, cc.notes].filter(Boolean).length;
    for (let i = items.length; i < minRows; i++) {
      const c = blank ? 'dots' : '';
      rows += `<tr><td class="idx-empty num">${i + 1}</td>${`<td class="${c}"></td>`.repeat(ncols - 1)}</tr>`;
    }
    return `
      <div class="body">
        <table class="items">
          <thead><tr>
            <th style="width:34px">#</th>${cc.code ? '<th style="width:70px">الرمز</th>' : ''}<th class="name">اسم المادة والمواصفات</th><th style="width:55px">الكمية</th>
            ${cc.unit ? '<th style="width:65px">الوحدة</th>' : ''}<th style="width:95px">المفرد (${sym})</th>
            ${cc.disc ? '<th style="width:70px">الخصم</th>' : ''}${cc.tax ? `<th style="width:55px">${h.esc((ctx.settings.tax && ctx.settings.tax.label) || 'الضريبة')}</th>` : ''}
            <th style="width:105px">الإجمالي (${sym})</th>${cc.notes ? '<th style="width:100px">ملاحظات</th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function receiptBody(ctx) {
    const { h, data, blank, currency, totals: t } = ctx;
    return `
      <div class="rbody">
        <div class="rrow"><span class="lbl">استلمت من السيد / السيدة:</span><div class="fill">${blank ? '' : h.esc(data.customer)}</div></div>
        <div class="rrow">
          <span class="lbl">مبلغاً وقدره:</span>
          <div class="amount-box num">${blank ? '' : h.money(t.total, currency)}</div>
          <span class="lbl">كتابةً:</span><div class="fill">${h.esc(ctx.words)}</div>
        </div>
        <div class="rrow"><span class="lbl">وذلك عن:</span><div class="fill">${blank ? '' : h.esc(data.purpose)}</div></div>
        <div class="rrow">
          <span class="lbl">الملاحظات:</span><div class="fill">${blank ? '' : h.esc(data.notes)}</div>
          <span class="lbl">طريقة الدفع:</span><div class="fill" style="max-width:160px">${blank ? '' : h.esc(data.paymentMethod)}</div>
        </div>
      </div>`;
  }

  function summary(ctx) {
    const { h, data, blank, currency, totals: t } = ctx;
    const v = (x) => (blank ? '' : h.money(x, currency));
    return `
      <div class="summary">
        <div>
          <div class="wlabel">المبلغ الصافي كتابةً:</div>
          <div class="words">${h.esc(ctx.words)}</div>
          ${data.terms ? `<div class="terms">${h.esc(data.terms)}</div>` : ''}
        </div>
        <div class="sumblock">
          <div><span>المجموع:</span><span class="num">${v(t.subtotal)}</span></div>
          <div><span>الخصم:</span><span class="num">${v(t.discount)}</span></div>
          ${blank ? '' : h.extraRows(t, currency, (k, x) => `<div><span>${k}:</span><span class="num">${x}</span></div>`, ctx.settings)}
          ${!blank && t.prevBalance ? `<div><span>رصيد سابق:</span><span class="num">${v(t.prevBalance)}</span></div>` : ''}
          <div class="paid"><span>الواصل (المقبوض):</span><span class="num">${v(t.paid)}</span></div>
          <div class="rem"><span>المتبقي في الذمة:</span><span class="num">${v(t.remaining)}</span></div>
        </div>
      </div>`;
  }

  function signs(ctx) {
    const { h, data, blank } = ctx;
    if (ctx.type === 'receipt') {
      return `
      <div class="signs">
        <div class="sign"><span>توقيع المستلم</span><div class="line">${blank ? '' : h.esc(data.receiver)}</div></div>
        <div class="stamp">موضع الختم</div>
      </div>`;
    }
    return `
      <div class="signs">
        <div class="sign"><span>توقيع المستلم / العميل</span><div class="line">${blank ? '' : h.esc(data.receiver)}</div></div>
        <div class="stamp">موضع الختم</div>
        <div class="sign"><span>المحاسب / المنظم</span><div class="line">${blank ? '' : h.esc(data.accountant)}</div></div>
      </div>`;
  }

  function footer(ctx) {
    const { h, company } = ctx;
    return `
      <div class="ftr">
        <div>${company.address ? h.icons.pin + '<span>' + h.esc(company.address) + '</span>' : ''}</div>
        <div class="ltr">${company.phone ? '<span>' + h.esc(company.phone) + '</span>' + h.icons.phone : ''}</div>
      </div>`;
  }

  function core(ctx) {
    return ctx.type === 'receipt'
      ? receiptBody(ctx) + signs(ctx) + footer(ctx)
      : salesBody(ctx) + summary(ctx) + signs(ctx) + footer(ctx);
  }

  // ---------- النمط المائل ----------
  function renderAngle(ctx) {
    const { h, data, blank, company } = ctx;
    const pills = ctx.type === 'receipt'
      ? ''
      : `<div class="pills">
          <div class="pill"><span class="k">الجهة / العميل:</span><span class="v">${blank ? '' : h.esc(data.customer)}</span></div>
          <div class="pill"><span class="k">التاريخ:</span><span class="v num">${blank ? '' : h.esc(ctx.doc.date)}</span></div>
          <div class="pill"><span class="k">طريقة الدفع:</span><span class="v">${blank ? '' : h.esc(data.paymentMethod)}</span></div>
        </div>`;
    const receiptDate = ctx.type === 'receipt'
      ? `<div class="pills" style="grid-template-columns:1fr 1fr">
          <div class="pill"><span class="k">التاريخ:</span><span class="v num">${blank ? '' : h.esc(ctx.doc.date)}</span></div>
          <div class="pill"><span class="k">نوع المعاملة:</span><span class="v">${blank ? '' : h.esc(data.transactionType)}</span></div>
        </div>`
      : '';
    return `
    <div class="doc">
      ${h.watermark(company, ctx.watermark)}
      <div class="flow">
        <div class="banner">
          <div class="brand">
            <div class="mark">${h.logo(company, 'mark')}</div>
            <div><h2>${h.esc(company.name)}</h2><p>${h.esc(company.subtitle)}</p></div>
          </div>
          <div class="docinfo">
            <span class="tag">${h.esc(ctx.title)}</span>
            <span class="docno num">${h.esc(ctx.number)}</span>
            ${ctx.copyLabel ? `<span class="copy-tag">${h.esc(ctx.copyLabel)}</span>` : ''}
          </div>
        </div>
        ${pills}${receiptDate}
        ${core(ctx)}
      </div>
    </div>`;
  }

  // ---------- نمط الشريط الجانبي ----------
  function renderSidebar(ctx) {
    const { h, data, blank, company } = ctx;
    const sym = company.logo ? `<img src="${h.esc(company.logo)}" alt="">` : h.esc(company.logoSymbol || '');
    const year = (ctx.doc.date || '').slice(0, 4);
    return `
    <div class="doc">
      ${h.watermark(company, ctx.watermark)}
      <div class="stripe">
        <div class="sym">${sym}</div>
        <div class="vtext">${h.esc(ctx.title)}${company.logoText ? ' • ' + h.esc(company.logoText) : ''}</div>
        <div class="yr num">${blank ? '' : h.esc(year)}</div>
      </div>
      <div class="flow">
        <div class="top">
          <div class="co">
            ${company.logo ? `<img src="${h.esc(company.logo)}" alt="">` : ''}
            <div><h2>${h.esc(company.name)}</h2><p>${h.esc(company.subtitle)}</p></div>
          </div>
          <div class="docinfo">
            <div class="tag">${h.esc(ctx.title)}${ctx.copyLabel ? ' — ' + h.esc(ctx.copyLabel) : ''}</div>
            <div class="docno num">NO: ${h.esc(ctx.number)}</div>
            <div class="date">التاريخ: <span class="num">${blank ? '' : h.esc(ctx.doc.date)}</span></div>
          </div>
        </div>
        ${ctx.type === 'receipt' ? '' : `<div class="pills">
          <div class="pill"><span class="k">السيد / الجهة:</span><span class="v">${blank ? '' : h.esc(data.customer)}</span></div>
          <div class="pill"><span class="k">الدفع:</span><span class="v">${blank ? '' : h.esc(data.paymentMethod)}</span></div>
        </div>`}
        ${core(ctx)}
      </div>
    </div>`;
  }

  const common = {
    types: ['sales', 'receipt'],
    sizes: ['A4', 'A5', 'Letter'],
    theme: { primary: '#0f172a', dark: '#1e293b', accent: '#0ea5e9' },
  };

  // نضيف الصنف tpl-M للورقة عبر CSS مشترك: نكرر القواعد تحت معرّف كل قالب
  const scoped = (id) => base.replace(/\.tpl-M/g, '.tpl-' + id);

  window.Store.registerTemplate({
    ...common,
    id: 'modern-angle',
    name: 'الحديث المائل',
    description: 'ترويسة غامقة بشكل هندسي مائل، بطاقات بيانات، وجدول حديث بدون حدود.',
    css: scoped('modern-angle') + angle,
    render: renderAngle,
  });

  window.Store.registerTemplate({
    ...common,
    id: 'modern-sidebar',
    name: 'الشريط الجانبي',
    description: 'شريط عمودي ملوّن على الجانب مع ترويسة بيضاء نظيفة.',
    css: scoped('modern-sidebar') + sidebar,
    render: renderSidebar,
  });
})();
