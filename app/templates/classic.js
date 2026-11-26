/*
 * القالب الكلاسيكي — مأخوذ من "فاتورة مبيعات" و"وصولات قبض v1"
 * مربع شعار غامق، ترويسة بإطار، جدول بحدود كاملة، وشريط سفلي ملوّن.
 */
(function () {
  'use strict';

  const css = `
.tpl-classic { --line: #637887; --tb: #9cb1bf; --red: #c02626; }
.tpl-classic .doc { border: 2px solid var(--c-primary); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; position: relative; background: #fff; }
.tpl-classic .inner { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }

.tpl-classic .hdr { display: flex; align-items: stretch; border-bottom: 2px solid var(--c-primary); min-height: 82px; }
.tpl-classic .logo { background: var(--c-dark); color: #fff; width: 140px; min-width: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 10px; text-align: center; }
.tpl-classic .logo-img { max-height: 60px; max-width: 120px; object-fit: contain; }
.tpl-classic .logo-symbol { font-size: 32px; font-weight: 900; line-height: 1; font-family: serif; width: 100%; padding-bottom: 2px; }
.tpl-classic .logo-sub { font-size: 8px; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; border-top: 1px solid rgba(255,255,255,.35); padding-top: 3px; margin-top: 3px; width: 100%; }
.tpl-classic .titles { flex: 1; padding: 6px 16px; display: flex; flex-direction: column; justify-content: center; }
.tpl-classic .titles h1 { color: var(--c-primary); font-size: 26px; font-weight: 900; line-height: 1.2; margin: 0; }
.tpl-classic .titles p { font-size: 13px; font-weight: 700; margin: 2px 0 0; }
.tpl-classic .dbadge-holder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 16px; border-right: 1.5px solid #d1dbe0; }
.tpl-classic .dbadge { background: var(--c-primary); color: #fff; font-size: 15px; font-weight: 800; padding: 4px 20px; border-radius: 20px; white-space: nowrap; }
.tpl-classic .docno { font-size: 14px; font-weight: 800; color: var(--red); margin-top: 5px; direction: ltr; letter-spacing: .5px; }

.tpl-classic .meta { display: grid; grid-template-columns: 2fr 1.2fr 1fr; gap: 8px; padding: 7px 16px; background: #f8fafc; border-bottom: 1.5px solid var(--tb); font-size: 13px; font-weight: 800; }
.tpl-classic .meta > div { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.tpl-classic .meta .val { border-bottom: 1.5px dashed var(--line); flex: 1; padding: 0 4px; min-height: 20px; white-space: normal; text-align: center; }
.tpl-classic .meta .val.start { text-align: right; }

.tpl-classic .table-wrap { flex: 1; }
.tpl-classic table.items { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tpl-classic .items th { background: var(--c-primary); color: #fff; font-weight: 800; padding: 5px 6px; border: 1px solid var(--c-primary); text-align: center; white-space: nowrap; }
.tpl-classic .items td { border: 1px solid var(--tb); padding: 4px 6px; text-align: center; font-weight: 700; height: 26px; }
.tpl-classic .items td.name { text-align: right; padding-right: 8px; font-weight: 800; }
.tpl-classic .items td.note { font-size: 11px; color: #4b6373; }
.tpl-classic .items td.total { color: var(--c-primary); font-weight: 800; }
.tpl-classic .items td.idx-empty { color: #cbd5e1; }
.tpl-classic .items tbody tr:nth-child(even) { background: #fbfdfe; }

.tpl-classic .calc { display: grid; grid-template-columns: 1.8fr 1.2fr; border-top: 1.5px solid var(--c-primary); }
.tpl-classic .terms { padding: 8px 14px; font-size: 11px; border-left: 1.5px solid var(--tb); }
.tpl-classic .words { font-size: 12.5px; font-weight: 800; color: var(--c-primary); background: #f0f6fa; border-radius: 6px; padding: 5px 10px; border: 1px dashed var(--c-primary); margin-bottom: 6px; min-height: 30px; }
.tpl-classic .words small { display: block; font-size: 12px; margin-top: 2px; }
.tpl-classic .terms .note { color: #475569; line-height: 1.5; }
.tpl-classic .terms .note b { color: #11222d; }
.tpl-classic table.totals { width: 100%; border-collapse: collapse; font-size: 12.5px; font-weight: 800; }
.tpl-classic .totals td { padding: 4px 10px; border-bottom: 1px solid #d5e0e8; }
.tpl-classic .totals td.v { text-align: left; }
.tpl-classic .totals tr:last-child td { border-bottom: 0; background: #f1f6f9; color: var(--c-primary); font-size: 13.5px; }
.tpl-classic .green { color: #047857; } .tpl-classic .red { color: #b91c1c; }

.tpl-classic .signs { display: flex; justify-content: space-between; align-items: flex-end; padding: 10px 25px 8px; }
.tpl-classic .sign { text-align: center; width: 130px; font-size: 12px; font-weight: 800; }
.tpl-classic .sign span { display: block; margin-bottom: 25px; }
.tpl-classic .sign .line { border-bottom: 1.5px dotted var(--line); min-height: 18px; font-weight: 700; }
.tpl-classic .stamp { width: 85px; height: 55px; border: 1.5px dashed #a0b2be; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #93a5b2; font-size: 11px; font-weight: 700; }

.tpl-classic .ftr { background: var(--c-primary); color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 5px 16px; font-size: 12px; font-weight: 700; min-height: 26px; }
.tpl-classic .ftr > div { display: flex; align-items: center; gap: 6px; }

/* وصل القبض */
.tpl-classic .rmeta { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px 4px; }
.tpl-classic .rmeta .docno { margin: 0; font-size: 15px; letter-spacing: 1px; min-width: 120px; }
.tpl-classic .rmeta .copy-tag { font-size: 10px; color: #94a3b8; font-weight: 700; display: block; }
.tpl-classic .amounts { display: flex; border: 2px solid var(--c-primary); border-radius: 18px; overflow: hidden; width: 210px; text-align: center; }
.tpl-classic .amounts > div { flex: 1; }
.tpl-classic .amounts > div:first-child { border-left: 2px solid var(--c-primary); }
.tpl-classic .amounts .lbl { font-size: 12px; font-weight: 800; color: var(--c-primary); border-bottom: 1.5px solid var(--c-primary); padding: 1px 0; }
.tpl-classic .amounts .fld { height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; padding: 0 5px; }
.tpl-classic .rbody { padding: 10px 20px; display: flex; flex-direction: column; justify-content: space-around; gap: 11px; flex: 1; }
.tpl-classic .rrow { display: flex; align-items: flex-end; font-size: 14.5px; font-weight: 800; line-height: 1.3; }
.tpl-classic .rrow .lbl { white-space: nowrap; margin-left: 8px; }
.tpl-classic .rrow .fill { flex: 1; border-bottom: 1.5px dashed var(--line); min-height: 22px; padding: 0 8px; font-size: 14px; color: #0d2836; }
.tpl-classic .rrow .date { display: flex; align-items: flex-end; margin-right: 15px; white-space: nowrap; }
.tpl-classic .rrow .date .fill { width: 130px; flex: none; text-align: center; }
.tpl-classic .rsign { display: flex; justify-content: flex-end; padding: 4px 45px 8px 0; }
.tpl-classic .rsign .sign { width: 140px; font-size: 14px; }
.tpl-classic .rsign .sign span { margin-bottom: 22px; }
`;

  function header(ctx, withBadge) {
    const { h, company } = ctx;
    return `
      <div class="hdr">
        <div class="logo">${h.logo(company, 'logo')}</div>
        <div class="titles">
          <h1>${h.esc(company.name)}</h1>
          <p>${h.esc(company.subtitle)}</p>
        </div>
        ${withBadge ? `<div class="dbadge-holder">
          <div class="dbadge">${h.esc(ctx.title)}</div>
          <div class="docno">NO: ${h.esc(ctx.number)}</div>
        </div>` : ''}
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

  function sales(ctx) {
    const { h, data, blank, currency, totals: t } = ctx;
    const sym = h.esc((window.Store.CURRENCIES[currency] || {}).symbol || '');
    const minRows = blank ? 10 : 0; // أسطر فارغة للنموذج اليدوي فقط
    const items = blank ? [] : (data.items || []);
    const c = ctx.cols;
    let rows = items.map((it, i) => `
      <tr>
        <td style="width:32px">${i + 1}</td>
        ${c.code ? `<td style="width:70px" class="num">${h.esc(it.code)}</td>` : ''}
        <td class="name">${h.esc(it.name)}</td>
        <td style="width:50px" class="num">${h.esc(it.qty)}</td>
        ${c.unit ? `<td style="width:60px">${h.esc(it.unit)}</td>` : ''}
        <td style="width:95px" class="num">${h.fmt(it.price, currency)}</td>
        ${c.disc ? `<td style="width:70px" class="num">${h.discCell(it, currency)}</td>` : ''}
        ${c.tax ? `<td style="width:55px" class="num">${h.num(it.taxPct) ? h.num(it.taxPct) + '%' : ''}</td>` : ''}
        <td style="width:105px" class="num total">${h.lineFmt(it, currency)}</td>
        ${c.notes ? `<td class="note">${h.esc(it.notes)}</td>` : ''}
      </tr>`).join('');
    const ncols = 4 + [c.code, c.unit, c.disc, c.tax, c.notes].filter(Boolean).length;
    for (let i = items.length; i < minRows; i++) {
      rows += `<tr><td class="idx-empty">${i + 1}</td>${'<td></td>'.repeat(ncols - 1)}</tr>`;
    }
    const v = (x) => (blank ? '' : h.money(x, currency));
    return `
    <div class="doc">
      ${h.watermark(ctx.company, ctx.watermark)}
      <div class="inner">
        ${header(ctx, true)}
        <div class="meta">
          <div><span>المجهز إليه:</span><div class="val start">${blank ? '' : h.esc(data.customer)}</div></div>
          <div><span>التاريخ:</span><div class="val num">${blank ? '' : h.esc(ctx.doc.date)}</div></div>
          <div><span>الدفع:</span><div class="val">${blank ? '' : h.esc(data.paymentMethod)}</div></div>
        </div>
        <div class="table-wrap">
          <table class="items">
            <thead><tr>
              <th style="width:32px">ت</th>${c.code ? '<th style="width:70px">الرمز</th>' : ''}<th>اسم المادة والمواصفات</th><th style="width:50px">الكمية</th>
              ${c.unit ? '<th style="width:60px">الوحدة</th>' : ''}<th style="width:95px">السعر المفرد (${sym})</th>
              ${c.disc ? '<th style="width:70px">الخصم</th>' : ''}${c.tax ? `<th style="width:55px">${h.esc((ctx.settings.tax && ctx.settings.tax.label) || 'الضريبة')}</th>` : ''}
              <th style="width:105px">المجموع (${sym})</th>${c.notes ? '<th style="width:110px">ملاحظات</th>' : ''}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="calc">
          <div class="terms">
            <div class="words">المبلغ كتابةً:<small>${h.esc(ctx.words)}</small></div>
            ${data.terms ? `<div class="note"><b>شروط وملاحظات:</b> ${h.esc(data.terms)}</div>` : ''}
          </div>
          <table class="totals">
            <tr><td>المجموع الكلي:</td><td class="v num">${v(t.subtotal)}</td></tr>
            <tr><td>الخصم:</td><td class="v num">${v(t.discount)}</td></tr>
            ${blank ? '' : h.extraRows(t, currency, (k, x) => `<tr><td>${k}:</td><td class="v num">${x}</td></tr>`, ctx.settings)}
            ${!blank && t.prevBalance ? `<tr><td>رصيد سابق:</td><td class="v num">${v(t.prevBalance)}</td></tr>` : ''}
            <tr><td>الواصل (المستلم):</td><td class="v num green">${v(t.paid)}</td></tr>
            <tr><td>المتبقي (آجل):</td><td class="v num red">${v(t.remaining)}</td></tr>
          </table>
        </div>
        <div class="signs">
          <div class="sign"><span>توقيع المستلم</span><div class="line">${blank ? '' : h.esc(data.receiver)}</div></div>
          <div class="stamp">الختم</div>
          <div class="sign"><span>المنظم / الحسابات</span><div class="line">${blank ? '' : h.esc(data.accountant)}</div></div>
        </div>
        ${footer(ctx)}
      </div>
    </div>`;
  }

  function receipt(ctx) {
    const { h, data, blank, currency, totals: t } = ctx;
    const iqd = !blank && currency === 'IQD' ? h.money(t.total, 'IQD') : '';
    const usd = !blank && currency === 'USD' ? h.money(t.total, 'USD') : '';
    return `
    <div class="doc">
      ${h.watermark(ctx.company, ctx.watermark)}
      <div class="inner">
        ${header(ctx, false)}
        <div class="rmeta">
          <div class="docno">NO: ${h.esc(ctx.number)}${ctx.copyLabel ? `<span class="copy-tag">${h.esc(ctx.copyLabel)}</span>` : ''}</div>
          <div class="dbadge">${h.esc(ctx.title)}</div>
          <div class="amounts">
            <div><div class="lbl">دينار</div><div class="fld num">${iqd}</div></div>
            <div><div class="lbl">$</div><div class="fld num">${usd}</div></div>
          </div>
        </div>
        <div class="rbody">
          <div class="rrow">
            <span class="lbl">استلمت من السيد /ة:</span><div class="fill">${blank ? '' : h.esc(data.customer)}</div>
            <div class="date"><span class="lbl">التاريخ:</span><div class="fill num">${blank ? '' : h.esc(ctx.doc.date)}</div></div>
          </div>
          <div class="rrow"><span class="lbl">مبلغاً وقدره:</span><div class="fill">${h.esc(ctx.words)}</div></div>
          <div class="rrow"><span class="lbl">وذلك عن:</span><div class="fill">${blank ? '' : h.esc(data.purpose)}</div></div>
          <div class="rrow"><span class="lbl">الملاحظات:</span><div class="fill">${blank ? '' : h.esc(data.notes)}</div></div>
        </div>
        <div class="rsign">
          <div class="sign"><span>التوقيع</span><div class="line">${blank ? '' : h.esc(data.receiver)}</div></div>
        </div>
        ${footer(ctx)}
      </div>
    </div>`;
  }

  window.Store.registerTemplate({
    id: 'classic',
    name: 'الكلاسيكي',
    description: 'ترويسة بمربع شعار غامق، جدول بحدود كاملة، وشريط سفلي ملوّن.',
    types: ['sales', 'receipt'],
    sizes: ['A4', 'A5', 'Letter'],
    theme: { primary: '#174257', dark: '#0d2836', accent: '#245b73' },
    css,
    render: (ctx) => (ctx.type === 'receipt' ? receipt(ctx) : sales(ctx)),
  });
})();
