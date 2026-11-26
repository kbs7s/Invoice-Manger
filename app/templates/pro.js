/*
 * قوالب احترافية إضافية:
 *  - minimal:   بسيط أنيق — أبيض، خطوط رفيعة، عنوان كبير ولون إبراز واحد
 *  - corporate: رسمي للشركات — شريط ترويسة ملوّن بعرض الصفحة، مربعات "إلى" و"تفاصيل"، بطاقة مجاميع
 *  - thermal:   وصل كاشير للطابعات الحرارية 80 ملم و58 ملم
 * كلها تدعم الأعمدة الاختيارية (الرمز، الخصم، الضريبة...) من إعدادات التصميم.
 */
(function () {
  'use strict';
  const Store = window.Store;

  // أدوات مشتركة
  const V = (ctx, x) => (ctx.blank ? '' : ctx.h.money(x, ctx.currency));
  const T = (ctx, x) => (ctx.blank ? '' : ctx.h.esc(x));
  const taxLabel = (ctx) => (ctx.settings.tax && ctx.settings.tax.label) || 'الضريبة';

  /** أسطر المجاميع للفاتورة: [عنوان، قيمة، صنف] — تظهر فقط الأسطر التي فيها قيمة */
  function totalsRows(ctx) {
    const t = ctx.totals;
    if (ctx.blank) return [['المجموع', '', ''], ['الخصم', '', ''], ['الصافي', '', 'net'], ['الواصل', '', ''], ['المتبقي', '', '']];
    const r = [['المجموع', V(ctx, t.subtotal), '']];
    if (t.discount) r.push(['الخصم', '− ' + V(ctx, t.discount), '']);
    if (t.charges) r.push(['أجور / إضافات', V(ctx, t.charges), '']);
    if (t.tax) r.push([taxLabel(ctx), V(ctx, t.tax), '']);
    r.push(['الصافي', V(ctx, t.net), 'net']);
    if (t.prevBalance) { r.push(['رصيد سابق', V(ctx, t.prevBalance), '']); r.push(['المطلوب الكلي', V(ctx, t.grand), '']); }
    r.push(['الواصل', V(ctx, t.paid), 'paid']);
    r.push(['المتبقي', V(ctx, t.remaining), t.remaining > 0.0001 ? 'rem' : 'ok']);
    return r;
  }

  /** تفاصيل الدفع إذا كانت بأكثر من طريقة */
  function paySplit(ctx) {
    const p = (ctx.data.payments || []).filter((x) => x && x.amount !== '' && x.amount != null && Number(x.amount));
    if (ctx.blank || p.length < 2) return '';
    return `<div class="split">${p.map((x) => `<span>${ctx.h.esc(x.method)}: <b class="num">${ctx.h.money(x.amount, ctx.currency)}</b>${x.ref ? ` <small>(${ctx.h.esc(x.ref)})</small>` : ''}</span>`).join('')}</div>`;
  }

  // ================= 1) بسيط أنيق =================
  const minimalCSS = `
.tpl-minimal { color: #1e293b; }
.tpl-minimal .doc { display: flex; flex-direction: column; position: relative; background: #fff; }
.tpl-minimal .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }
.tpl-minimal .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 14px; border-bottom: 3px solid var(--c-accent); }
.tpl-minimal .co { display: flex; align-items: center; gap: 14px; }
.tpl-minimal .logo-img { max-height: 64px; max-width: 140px; object-fit: contain; }
.tpl-minimal .logo-symbol { width: 58px; height: 58px; border-radius: 14px; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font: 900 24px serif; }
.tpl-minimal .logo-sub { display: none; }
.tpl-minimal .co h2 { margin: 0; font-size: 21px; font-weight: 900; color: var(--c-dark); }
.tpl-minimal .co p { margin: 2px 0 0; font-size: 12px; color: #64748b; font-weight: 600; }
.tpl-minimal .ttl { text-align: left; }
.tpl-minimal .ttl h1 { margin: 0; font-size: 30px; font-weight: 900; color: var(--c-primary); letter-spacing: -.5px; text-align: right; }
.tpl-minimal .ttl .no { font-size: 13px; color: #64748b; font-weight: 700; direction: ltr; text-align: right; }
.tpl-minimal .ttl .copy-tag { display: inline-block; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 8px; margin-top: 3px; }
.tpl-minimal .meta { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; padding: 14px 0; font-size: 12.5px; }
.tpl-minimal .meta h4 { margin: 0 0 3px; font-size: 10.5px; letter-spacing: .5px; color: var(--c-accent); font-weight: 800; }
.tpl-minimal .meta .who { font-size: 16px; font-weight: 900; color: var(--c-dark); min-height: 22px; }
.tpl-minimal .meta .kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; }
.tpl-minimal .meta .kv span:nth-child(odd) { color: #64748b; font-weight: 600; }
.tpl-minimal .meta .kv span:nth-child(even) { font-weight: 800; }
.tpl-minimal .body { flex: 1; }
.tpl-minimal table.items { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tpl-minimal .items th { text-align: right; font-size: 11px; color: #64748b; font-weight: 800; padding: 8px 6px; border-bottom: 1.5px solid var(--c-dark); white-space: nowrap; }
.tpl-minimal .items td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; font-weight: 600; height: 30px; }
.tpl-minimal .items td.name { font-weight: 800; color: var(--c-dark); }
.tpl-minimal .items td.name small { display: block; font-weight: 500; color: #64748b; }
.tpl-minimal .items td.idx { color: #94a3b8; width: 26px; }
.tpl-minimal .items .num { text-align: left; }
.tpl-minimal .items td.total { font-weight: 800; }
.tpl-minimal .items td.note { color: #64748b; font-size: 11px; }
.tpl-minimal .end { display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; padding-top: 14px; align-items: start; }
.tpl-minimal .words { font-size: 12px; font-weight: 700; color: #334155; background: #f8fafc; border-radius: 8px; padding: 8px 12px; }
.tpl-minimal .terms { font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.6; }
.tpl-minimal .split { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; margin-top: 8px; color: #334155; }
.tpl-minimal .sum div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; font-weight: 700; border-bottom: 1px dashed #e2e8f0; }
.tpl-minimal .sum div.net { font-size: 17px; font-weight: 900; color: var(--c-dark); border-bottom: 2px solid var(--c-dark); padding: 7px 0; }
.tpl-minimal .sum div.paid b { color: #047857; } .tpl-minimal .sum div.rem b { color: #b91c1c; }
.tpl-minimal .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; padding: 26px 10px 10px; }
.tpl-minimal .sign { width: 160px; text-align: center; font-size: 11.5px; color: #64748b; font-weight: 700; }
.tpl-minimal .sign .line { border-top: 1.5px solid #cbd5e1; margin-top: 30px; padding-top: 3px; color: #1e293b; min-height: 18px; }
.tpl-minimal .stamp { width: 80px; height: 80px; border-radius: 50%; border: 1.5px dashed #cbd5e1; color: #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.tpl-minimal .ftr { display: flex; justify-content: center; gap: 22px; flex-wrap: wrap; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 11.5px; color: #64748b; font-weight: 600; }
.tpl-minimal .ftr span { display: inline-flex; align-items: center; gap: 5px; }
.tpl-minimal .ftr svg { color: var(--c-accent); }
/* الوصل */
.tpl-minimal .rbody { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 14px 0; font-size: 14px; }
.tpl-minimal .amount { display: flex; align-items: center; gap: 16px; }
.tpl-minimal .amount b { font-size: 26px; font-weight: 900; color: var(--c-dark); border-bottom: 3px solid var(--c-accent); padding: 0 6px; min-width: 180px; text-align: center; }
.tpl-minimal .rrow { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: end; }
.tpl-minimal .rrow > span { color: #64748b; font-weight: 700; font-size: 12.5px; }
.tpl-minimal .rrow > div { border-bottom: 1px solid #cbd5e1; font-weight: 800; min-height: 24px; padding: 0 4px; }
.tpl-minimal.type-receipt .top { padding-bottom: 8px; }
.tpl-minimal.type-receipt .signs { padding-top: 8px; }
`;

  function contactBar(ctx) {
    const { h, company } = ctx;
    return [company.address && `<span>${h.icons.pin}${h.esc(company.address)}</span>`,
      company.phone && `<span class="ltr">${h.icons.phone}${h.esc(company.phone)}</span>`,
      company.email && `<span class="ltr">✉ ${h.esc(company.email)}</span>`].filter(Boolean).join('');
  }

  function renderMinimal(ctx) {
    const { h, data, company, blank } = ctx;
    const top = `
      <div class="top">
        <div class="co">${company.logo || company.logoSymbol ? h.logo(company, 'logo') : ''}<div><h2>${h.esc(company.name)}</h2><p>${h.esc(company.subtitle)}</p></div></div>
        <div class="ttl"><h1>${h.esc(ctx.title)}</h1><div class="no num">${h.esc(ctx.number)}</div>${ctx.copyLabel ? `<span class="copy-tag">${h.esc(ctx.copyLabel)}</span>` : ''}</div>
      </div>`;
    const signs = (a, b) => `<div class="signs"><div class="sign">${a[0]}<div class="line">${T(ctx, a[1])}</div></div><div class="stamp">الختم</div>${b ? `<div class="sign">${b[0]}<div class="line">${T(ctx, b[1])}</div></div>` : '<div style="width:160px"></div>'}</div>`;
    if (ctx.type === 'receipt') {
      return `
      <div class="doc">${h.watermark(company, ctx.watermark)}<div class="flow">${top}
        <div class="rbody">
          <div class="amount"><span>المبلغ</span><b class="num">${V(ctx, ctx.totals.total)}</b><span class="muted">${T(ctx, data.paymentMethod)}${!blank && data.ref ? ' · ' + h.esc(data.ref) : ''}</span></div>
          <div class="rrow"><span>استلمنا من</span><div>${T(ctx, data.customer)}</div></div>
          <div class="rrow"><span>مبلغاً وقدره</span><div>${h.esc(ctx.words)}</div></div>
          <div class="rrow"><span>وذلك عن</span><div>${T(ctx, data.purpose)}</div></div>
          <div class="rrow"><span>التاريخ</span><div class="num" style="text-align:right">${T(ctx, ctx.doc.date)}</div></div>
          ${data.notes || blank ? `<div class="rrow"><span>ملاحظات</span><div>${T(ctx, data.notes)}</div></div>` : ''}
        </div>
        ${signs(['توقيع المستلم', data.receiver])}
        <div class="ftr">${contactBar(ctx)}</div>
      </div></div>`;
    }
    const kv = [['التاريخ', ctx.doc.date, 1], data.dueDate && ['الاستحقاق', data.dueDate, 1], data.reference && ['المرجع', data.reference, 1], ['الدفع', data.paymentMethod]].filter(Boolean);
    return `
    <div class="doc">${h.watermark(company, ctx.watermark)}<div class="flow">${top}
      <div class="meta">
        <div><h4>فاتورة إلى</h4><div class="who">${T(ctx, data.customer)}</div>
          <div style="color:#64748b">${T(ctx, data.customerAddress)}${!blank && data.customerPhone ? ` · <span class="ltr">${h.esc(data.customerPhone)}</span>` : ''}</div></div>
        <div class="kv">${kv.map(([k, v, n]) => `<span>${k}</span><span class="${n ? 'num' : ''}" style="text-align:right">${T(ctx, v)}</span>`).join('')}</div>
      </div>
      <div class="body">${h.itemsTable(ctx, { minRows: 12, notesInName: true })}</div>
      <div class="end">
        <div><div class="words">${h.esc(ctx.words)}</div>${paySplit(ctx)}${data.terms ? `<div class="terms">${h.esc(data.terms)}</div>` : ''}</div>
        <div class="sum">${totalsRows(ctx).map(([k, v, c]) => `<div class="${c}"><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
      </div>
      ${signs(['توقيع المستلم', data.receiver], ['المحاسب', data.accountant])}
      <div class="ftr">${contactBar(ctx)}</div>
    </div></div>`;
  }

  // ================= 2) رسمي للشركات =================
  const corporateCSS = `
.tpl-corporate { color: #0f172a; }
.tpl-corporate .doc { display: flex; flex-direction: column; position: relative; background: #fff; }
.tpl-corporate .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }
.tpl-corporate .band { background: linear-gradient(135deg, var(--c-dark), var(--c-primary)); color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.tpl-corporate .band .co { display: flex; align-items: center; gap: 14px; }
.tpl-corporate .band .logo-img { max-height: 62px; max-width: 130px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
.tpl-corporate .band .logo-symbol { width: 60px; height: 60px; border-radius: 12px; background: rgba(255,255,255,.15); border: 1.5px solid rgba(255,255,255,.4); display: flex; align-items: center; justify-content: center; font: 900 24px serif; }
.tpl-corporate .band .logo-sub { display: none; }
.tpl-corporate .band h2 { margin: 0; font-size: 20px; font-weight: 900; }
.tpl-corporate .band p { margin: 2px 0 0; font-size: 12px; opacity: .85; }
.tpl-corporate .band .doc-t { text-align: left; }
.tpl-corporate .band .doc-t b { display: block; font-size: 22px; font-weight: 900; text-align: right; }
.tpl-corporate .band .doc-t span { font-size: 13px; font-weight: 700; opacity: .9; direction: ltr; display: block; text-align: right; }
.tpl-corporate .band .doc-t small { display: inline-block; margin-top: 3px; font-size: 10px; background: rgba(255,255,255,.2); border-radius: 10px; padding: 0 8px; }
.tpl-corporate .boxes { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin: 14px 0; }
.tpl-corporate .box { border: 1px solid #dbe3ea; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; }
.tpl-corporate .box h4 { margin: 0 0 6px; font-size: 11px; color: var(--c-primary); font-weight: 800; border-bottom: 1px solid #e8eef3; padding-bottom: 4px; }
.tpl-corporate .box .who { font-size: 15px; font-weight: 900; min-height: 20px; }
.tpl-corporate .box .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; }
.tpl-corporate .box .kv span:nth-child(odd) { color: #64748b; font-weight: 600; }
.tpl-corporate .box .kv span:nth-child(even) { font-weight: 800; }
.tpl-corporate .body { flex: 1; }
.tpl-corporate table.items { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; border: 1px solid #dbe3ea; border-radius: 10px; overflow: hidden; }
.tpl-corporate .items th { background: color-mix(in srgb, var(--c-primary) 12%, #fff); color: var(--c-dark); font-weight: 800; padding: 8px 6px; font-size: 11.5px; white-space: nowrap; border-bottom: 1.5px solid var(--c-primary); }
.tpl-corporate .items td { padding: 6px; border-bottom: 1px solid #edf2f6; font-weight: 600; height: 28px; text-align: center; }
.tpl-corporate .items tbody tr:last-child td { border-bottom: 0; }
.tpl-corporate .items td.name { text-align: right; font-weight: 800; }
.tpl-corporate .items td.name small { display: block; font-weight: 500; color: #64748b; }
.tpl-corporate .items .num { text-align: left; }
.tpl-corporate .items td.total { font-weight: 800; color: var(--c-dark); }
.tpl-corporate .items td.note { font-size: 11px; color: #64748b; }
.tpl-corporate .end { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-top: 14px; align-items: start; }
.tpl-corporate .words { border-right: 4px solid var(--c-accent); background: #f8fafc; padding: 8px 12px; font-size: 12px; font-weight: 700; border-radius: 4px; }
.tpl-corporate .terms { font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.6; }
.tpl-corporate .split { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; margin-top: 8px; }
.tpl-corporate .card { border: 1px solid #dbe3ea; border-radius: 10px; overflow: hidden; }
.tpl-corporate .card div { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 12.5px; font-weight: 700; border-bottom: 1px solid #edf2f6; }
.tpl-corporate .card div.net { background: var(--c-primary); color: #fff; font-size: 15px; font-weight: 900; }
.tpl-corporate .card div.paid b { color: #047857; } .tpl-corporate .card div.rem b { color: #b91c1c; }
.tpl-corporate .card div:last-child { border-bottom: 0; }
.tpl-corporate .signs { display: flex; justify-content: space-between; align-items: flex-end; padding: 22px 10px 10px; }
.tpl-corporate .sign { width: 150px; text-align: center; font-size: 11.5px; font-weight: 800; color: #475569; }
.tpl-corporate .sign .line { border-bottom: 1.5px dotted #94a3b8; min-height: 30px; color: #0f172a; }
.tpl-corporate .stamp { width: 90px; height: 60px; border: 1.5px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px; font-weight: 700; }
.tpl-corporate .ftr { background: var(--c-dark); color: #fff; border-radius: 8px; display: flex; justify-content: center; gap: 22px; flex-wrap: wrap; padding: 6px 12px; font-size: 11.5px; font-weight: 700; }
.tpl-corporate .ftr span { display: inline-flex; align-items: center; gap: 5px; }
.tpl-corporate .rbody { flex: 1; display: grid; grid-template-columns: 1fr 200px; gap: 14px; margin: 12px 0; align-items: start; }
.tpl-corporate .rbody .rows { display: flex; flex-direction: column; gap: 9px; font-size: 13.5px; }
.tpl-corporate .rrow { display: grid; grid-template-columns: 105px 1fr; gap: 8px; align-items: end; }
.tpl-corporate .rrow > span { color: #64748b; font-weight: 700; font-size: 12.5px; }
.tpl-corporate .rrow > div { border-bottom: 1px solid #cbd5e1; font-weight: 800; min-height: 22px; }
.tpl-corporate .amtbox { border-radius: 10px; background: color-mix(in srgb, var(--c-primary) 10%, #fff); border: 1.5px solid var(--c-primary); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px; }
.tpl-corporate .amtbox span { font-size: 11.5px; font-weight: 800; color: var(--c-primary); }
.tpl-corporate .amtbox b { font-size: 22px; font-weight: 900; color: var(--c-dark); }
.tpl-corporate .amtbox small { font-size: 11px; color: #475569; font-weight: 700; }
.tpl-corporate.type-receipt .band { padding: 10px 16px; }
.tpl-corporate.type-receipt .signs { padding-top: 6px; }
`;

  function renderCorporate(ctx) {
    const { h, data, company, blank } = ctx;
    const band = `
      <div class="band">
        <div class="co">${company.logo || company.logoSymbol ? h.logo(company, 'logo') : ''}<div><h2>${h.esc(company.name)}</h2><p>${h.esc(company.subtitle)}</p></div></div>
        <div class="doc-t"><b>${h.esc(ctx.title)}</b><span class="num">${h.esc(ctx.number)}</span>${ctx.copyLabel ? `<small>${h.esc(ctx.copyLabel)}</small>` : ''}</div>
      </div>`;
    const sg = (k, v) => `<div class="sign">${k}<div class="line">${T(ctx, v)}</div></div>`;
    if (ctx.type === 'receipt') {
      return `
      <div class="doc">${h.watermark(company, ctx.watermark)}<div class="flow">${band}
        <div class="rbody">
          <div class="rows">
            <div class="rrow"><span>استلمنا من</span><div>${T(ctx, data.customer)}</div></div>
            <div class="rrow"><span>مبلغاً وقدره</span><div>${h.esc(ctx.words)}</div></div>
            <div class="rrow"><span>وذلك عن</span><div>${T(ctx, data.purpose)}</div></div>
            <div class="rrow"><span>ملاحظات</span><div>${T(ctx, data.notes)}</div></div>
          </div>
          <div class="amtbox"><span>المبلغ</span><b class="num">${V(ctx, ctx.totals.total)}</b>
            <small>${T(ctx, data.paymentMethod)}${!blank && data.ref ? ' · ' + h.esc(data.ref) : ''}</small>
            <small class="num">${T(ctx, ctx.doc.date)}</small></div>
        </div>
        <div class="signs">${sg('توقيع المستلم', data.receiver)}<div class="stamp">الختم</div>${sg('المحاسب', data.accountant)}</div>
        <div class="ftr">${contactBar(ctx)}</div>
      </div></div>`;
    }
    const kv = [['التاريخ', ctx.doc.date, 1], ['الاستحقاق', data.dueDate, 1], ['المرجع', data.reference], ['طريقة الدفع', data.paymentMethod]]
      .filter((x) => blank || x[1]);
    return `
    <div class="doc">${h.watermark(company, ctx.watermark)}<div class="flow">${band}
      <div class="boxes">
        <div class="box"><h4>إلى السيد / الجهة</h4><div class="who">${T(ctx, data.customer)}</div>
          <div class="kv" style="margin-top:4px">${blank || data.customerPhone ? `<span>الهاتف</span><span class="ltr" style="text-align:right">${T(ctx, data.customerPhone)}</span>` : ''}${blank || data.customerAddress ? `<span>العنوان</span><span>${T(ctx, data.customerAddress)}</span>` : ''}</div></div>
        <div class="box"><h4>تفاصيل المستند</h4><div class="kv">${kv.map(([k, v, n]) => `<span>${k}</span><span class="${n ? 'num' : ''}" style="text-align:right">${T(ctx, v)}</span>`).join('')}</div></div>
      </div>
      <div class="body">${h.itemsTable(ctx, { minRows: 12, notesInName: true })}</div>
      <div class="end">
        <div><div class="words">${h.esc(ctx.words)}</div>${paySplit(ctx)}${data.terms ? `<div class="terms"><b>الشروط:</b> ${h.esc(data.terms)}</div>` : ''}</div>
        <div class="card">${totalsRows(ctx).map(([k, v, c]) => `<div class="${c}"><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
      </div>
      <div class="signs">${sg('توقيع المستلم', data.receiver)}<div class="stamp">الختم</div>${sg('المنظم / المحاسب', data.accountant)}</div>
      <div class="ftr">${contactBar(ctx)}</div>
    </div></div>`;
  }

  // ================= 3) وصل كاشير حراري =================
  const thermalCSS = `
.tpl-thermal { color: #000; font-size: 12px; }
.tpl-thermal.size-T58 { font-size: 10.5px; }
.tpl-thermal .doc { display: flex; flex-direction: column; gap: 4px; }
.tpl-thermal .c { text-align: center; }
.tpl-thermal .logo-img { max-height: 46px; max-width: 70%; object-fit: contain; filter: grayscale(1); }
.tpl-thermal .logo-symbol { font: 900 22px serif; }
.tpl-thermal .logo-sub { font-size: 9px; letter-spacing: 1px; }
.tpl-thermal h2 { margin: 2px 0 0; font-size: 1.35em; font-weight: 900; }
.tpl-thermal .sub { font-size: .9em; }
.tpl-thermal hr { border: 0; border-top: 1px dashed #000; margin: 3px 0; width: 100%; }
.tpl-thermal hr.solid { border-top: 1.5px solid #000; }
.tpl-thermal .ttl { font-weight: 900; font-size: 1.15em; }
.tpl-thermal .kv { display: flex; justify-content: space-between; gap: 6px; }
.tpl-thermal .kv b { font-weight: 800; }
.tpl-thermal table { width: 100%; border-collapse: collapse; }
.tpl-thermal th { font-size: .9em; font-weight: 800; border-bottom: 1px solid #000; padding: 1px 0; text-align: right; }
.tpl-thermal td { padding: 1px 0; vertical-align: top; }
.tpl-thermal td.n { font-weight: 800; }
.tpl-thermal td.n small { display: block; font-weight: 400; font-size: .85em; }
.tpl-thermal .num { text-align: left; white-space: nowrap; }
.tpl-thermal .big { font-size: 1.35em; font-weight: 900; }
.tpl-thermal .split div { display: flex; justify-content: space-between; font-size: .92em; }
.tpl-thermal .words { font-size: .88em; text-align: center; }
.tpl-thermal .thanks { text-align: center; font-weight: 800; margin-top: 4px; }
.tpl-thermal .wm { display: none; }
`;
  function renderThermal(ctx) {
    const { h, data, company, blank, currency: cur } = ctx;
    const t = ctx.totals;
    const head = `
      <div class="c">${company.logo || company.logoSymbol ? h.logo(company, 'logo') : ''}<h2>${h.esc(company.name)}</h2>
        ${company.subtitle ? `<div class="sub">${h.esc(company.subtitle)}</div>` : ''}
        ${company.address ? `<div class="sub">${h.esc(company.address)}</div>` : ''}
        ${company.phone ? `<div class="sub ltr">${h.esc(company.phone)}</div>` : ''}</div>
      <hr class="solid">
      <div class="c ttl">${h.esc(ctx.title)}</div>
      <div class="kv"><span>الرقم</span><b class="num">${h.esc(ctx.number)}</b></div>
      <div class="kv"><span>التاريخ</span><b class="num">${T(ctx, ctx.doc.date)}</b></div>
      ${blank || data.customer ? `<div class="kv"><span>${ctx.type === 'receipt' ? 'من' : 'الزبون'}</span><b>${T(ctx, data.customer)}</b></div>` : ''}`;
    const msg = (ctx.design && ctx.design.footerText) || 'شكراً لتعاملكم معنا';
    if (ctx.type === 'receipt') {
      return `<div class="doc">${head}<hr>
        <div class="kv"><span>المبلغ</span><b class="num big">${V(ctx, t.total)}</b></div>
        <div class="words">${h.esc(ctx.words)}</div>
        ${data.purpose ? `<div class="kv"><span>عن</span><b>${h.esc(data.purpose)}</b></div>` : ''}
        <div class="kv"><span>الدفع</span><b>${T(ctx, data.paymentMethod)}${!blank && data.ref ? ' · ' + h.esc(data.ref) : ''}</b></div>
        <hr><div class="thanks">${h.esc(msg)}</div></div>`;
    }
    const its = blank ? [] : (data.items || []);
    const rows = its.map((it) => {
      const l = h.line(it);
      const extra = [it.code && h.esc(it.code), l.disc && 'خصم ' + h.discCell(it, cur), h.num(it.taxPct) && h.esc(taxLabel(ctx)) + ' ' + h.num(it.taxPct) + '%'].filter(Boolean).join(' · ');
      return `<tr><td class="n" colspan="3">${h.esc(it.name)}${extra ? `<small>${extra}</small>` : ''}</td></tr>
        <tr><td class="num" style="text-align:right">${h.esc(it.qty)} × ${h.fmt(it.price, cur)}</td><td></td><td class="num">${h.fmt(l.total, cur)}</td></tr>`;
    }).join('');
    const sums = totalsRows(ctx).filter(([, v]) => v !== '' || blank);
    const pays = (data.payments || []).filter((x) => x && x.amount !== '' && x.amount != null && Number(x.amount));
    return `<div class="doc">${head}<hr>
      <table><thead><tr><th>المادة</th><th></th><th class="num">المجموع</th></tr></thead><tbody>${rows}</tbody></table>
      <hr>
      ${sums.map(([k, v, c]) => `<div class="kv ${c === 'net' ? 'big' : ''}"><span>${k}</span><b class="num">${v}</b></div>`).join('')}
      ${pays.length > 1 ? `<hr><div class="split">${pays.map((x) => `<div><span>${h.esc(x.method)}</span><b class="num">${h.money(x.amount, cur)}</b></div>`).join('')}</div>` : (!blank && data.paymentMethod ? `<div class="kv"><span>الدفع</span><b>${h.esc(data.paymentMethod)}</b></div>` : '')}
      <hr><div class="words">${h.esc(ctx.words)}</div>
      <div class="thanks">${h.esc(msg)}</div></div>`;
  }

  const reg = (o) => Store.registerTemplate({ types: ['sales', 'receipt'], ...o });
  reg({ id: 'minimal', name: 'بسيط أنيق', description: 'أبيض نظيف بخطوط رفيعة، عنوان كبير ولون إبراز واحد. يناسب الخدمات والشركات الصغيرة.',
    sizes: ['A4', 'A5', 'Letter'], theme: { primary: '#0f766e', dark: '#0f172a', accent: '#14b8a6' }, css: minimalCSS, render: renderMinimal });
  reg({ id: 'corporate', name: 'رسمي للشركات', description: 'شريط ترويسة ملوّن، مربعات بيانات الزبون والمستند، وبطاقة مجاميع واضحة.',
    sizes: ['A4', 'A5', 'Letter'], theme: { primary: '#1d4ed8', dark: '#172554', accent: '#f59e0b' }, css: corporateCSS, render: renderCorporate });
  reg({ id: 'thermal', name: 'وصل كاشير (حراري)', description: 'للطابعات الحرارية 80 ملم و58 ملم: نقاط البيع والمحلات والصيدليات.',
    sizes: ['T80', 'T58'], theme: { primary: '#000000', dark: '#000000', accent: '#000000' }, css: thermalCSS, render: renderThermal, ownFooterText: true });
})();
