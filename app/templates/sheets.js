/*
 * قوالب مأخوذة من ملفات الإكسل (بدون أسماء المكاتب):
 *  - banner:    "المختص" — ترويسة بالشعار وشريط تواصل، جدول بعناوين زرقاء، مربع مجموع
 *  - bilingual: "Receipt وصولات" — عنوان وسطي، بيانات بعناوين إنكليزية، جدول رمادي، فوتر بالعنوان والمجاميع
 *  - boxed:     "الشراع" — ترويسة بإطار مدوّر، مربعات بيانات، عمود التعبئة، خلاصة مزدوجة وتواقيع
 * الثلاثة لفواتير المبيعات (قوائم المواد).
 */
(function () {
  'use strict';
  const Store = window.Store;

  function sym(ctx) { return (Store.CURRENCIES[ctx.currency] || {}).symbol || ''; }
  function items(ctx) { return ctx.blank ? [] : (ctx.data.items || []); }
  function v(ctx, x) { return ctx.blank ? '' : ctx.h.money(x, ctx.currency); }
  function t(ctx, x) { return ctx.blank ? '' : ctx.h.esc(x); }

  // ================= 1) الترويسة بالشعار (المختص) =================
  const bannerCSS = `
.tpl-banner { --b: #2f5f8f; --line: #9fb7cf; font-family: 'Cairo', sans-serif; color: #1f2937; }
.tpl-banner .doc { display: flex; flex-direction: column; position: relative; }
.tpl-banner .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }
.tpl-banner .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 4px 6px 8px; }
.tpl-banner .head .ar { display: flex; align-items: center; gap: 12px; }
.tpl-banner .head .ar img { max-height: 90px; max-width: 150px; object-fit: contain; }
.tpl-banner .head .ar .sym { width: 74px; height: 74px; border-radius: 50%; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font: 900 28px serif; }
.tpl-banner .head h1 { margin: 0; font-size: 30px; font-weight: 900; color: var(--c-primary); line-height: 1.15; }
.tpl-banner .head .sub { font-size: 14px; font-weight: 700; color: var(--c-dark); }
.tpl-banner .head .en { text-align: left; direction: ltr; }
.tpl-banner .head .en b { display: block; font: 900 26px 'Readex Pro', sans-serif; letter-spacing: 1px; color: var(--c-dark); text-transform: uppercase; }
.tpl-banner .head .en span { font-size: 12px; font-weight: 700; color: var(--c-primary); }
.tpl-banner .contact { border-top: 2.5px solid var(--c-primary); border-bottom: 2.5px solid var(--c-primary); display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; font-weight: 800; font-size: 13.5px; gap: 12px; flex-wrap: wrap; }
.tpl-banner .contact > span { display: inline-flex; align-items: center; gap: 6px; }
.tpl-banner .contact svg { color: var(--c-primary); }
.tpl-banner .info { display: grid; grid-template-columns: 1.6fr 1fr; gap: 0 24px; padding: 10px 14px; font-size: 13px; border-left: 1px solid #333; border-right: 1px solid #333; }
.tpl-banner .info .r { display: grid; grid-template-columns: 110px 1fr; padding: 2px 0; }
.tpl-banner .info .k { font-weight: 800; }
.tpl-banner table.items { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tpl-banner .items th { background: var(--c-primary); color: #fff; font-weight: 700; padding: 6px; border: 1px solid #fff; }
.tpl-banner .items td { border: 1px solid #cfd8e3; padding: 3px 6px; text-align: center; height: 22px; }
.tpl-banner .items td.num { text-align: left; }
.tpl-banner .grow { flex: 1; border-left: 1px solid #333; border-right: 1px solid #333; }
.tpl-banner .bottom { display: grid; grid-template-columns: 1fr 150px 160px; border: 1px solid #333; min-height: 64px; }
.tpl-banner .bottom .words { padding: 8px 12px; font-size: 12px; font-weight: 700; color: #374151; }
.tpl-banner .bottom .words small { display: block; color: #6b7280; font-weight: 600; margin-top: 4px; }
.tpl-banner .bottom .lbl { background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
.tpl-banner .bottom .amt { display: flex; flex-direction: column; justify-content: center; padding: 4px 10px; font-weight: 900; font-size: 15px; }
.tpl-banner .bottom .amt small { font-size: 11px; font-weight: 700; color: #4b5563; display: flex; justify-content: space-between; }
`;

  function renderBanner(ctx) {
    const { h, company, data } = ctx;
    const its = items(ctx);
    const minRows = ctx.blank ? 24 : 0; // أسطر فارغة للنموذج اليدوي فقط
    let rows = its.map((it) => `
      <tr><td>${h.esc(it.name)}</td><td>${h.esc(it.notes)}</td><td>${h.esc(it.qty)}</td>
      <td class="num">${h.fmt(it.price, ctx.currency)}</td><td class="num">${h.lineFmt(it, ctx.currency)}</td></tr>`).join('');
    for (let i = its.length; i < minRows; i++) rows += '<tr><td></td><td></td><td></td><td></td><td></td></tr>';
    const tt = ctx.totals;
    const extra = !ctx.blank && (tt.discount || tt.prevBalance || tt.charges || tt.tax || tt.paid !== tt.grand);
    return `
    <div class="doc">
      ${h.watermark(company, ctx.watermark)}
      <div class="flow">
        <div class="head">
          <div class="ar">
            ${company.logo ? `<img src="${h.esc(company.logo)}" alt="">` : (company.logoSymbol ? `<div class="sym">${h.esc(company.logoSymbol)}</div>` : '')}
            <div><h1>${h.esc(company.name)}</h1><div class="sub">${h.esc(company.subtitle)}</div></div>
          </div>
          <div class="en">${company.logoText ? `<b>${h.esc(company.logoText)}</b>` : ''}<span>${h.esc(ctx.title)}</span></div>
        </div>
        <div class="contact">
          <span>${company.address ? h.icons.pin + h.esc(company.address) : ''}</span>
          <span class="ltr">${company.email ? h.esc(company.email) : ''}</span>
          <span class="ltr">${company.phone ? h.icons.phone + h.esc(company.phone) : ''}</span>
        </div>
        <div class="info">
          <div>
            <div class="r"><span class="k">اسم الزبون</span><span>${t(ctx, data.customer)}</span></div>
            <div class="r"><span class="k">عنوان التوصيل</span><span>${t(ctx, data.customerAddress)}</span></div>
            <div class="r"><span class="k">رقم الهاتف</span><span class="num" style="text-align:right">${t(ctx, data.customerPhone)}</span></div>
          </div>
          <div>
            <div class="r"><span class="k">رقم الوصل</span><span class="num" style="text-align:right">${h.esc(ctx.number)}</span></div>
            <div class="r"><span class="k">تاريخ الوصل</span><span class="num" style="text-align:right">${t(ctx, ctx.doc.date)}</span></div>
            <div class="r"><span class="k">طريقة الدفع</span><span>${t(ctx, data.paymentMethod)}</span></div>
          </div>
        </div>
        <table class="items">
          <thead><tr><th style="width:24%">الاسم</th><th>الوصف</th><th style="width:9%">الكمية</th><th style="width:12%">سعر المفرد</th><th style="width:15%">السعر الكلي</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="grow"></div>
        <div class="bottom">
          <div class="words">${h.esc(ctx.words)}${data.terms ? `<small>${h.esc(data.terms)}</small>` : ''}</div>
          <div class="lbl">المجموع</div>
          <div class="amt">
            <span class="num">${v(ctx, tt.net)}</span>
            ${extra ? `<small><span>الخصم</span><span class="num">${v(ctx, tt.discount)}</span></small>
              ${h.extraRows(tt, ctx.currency, (k, x) => `<small><span>${k}</span><span class="num">${x}</span></small>`, ctx.settings)}
              ${tt.prevBalance ? `<small><span>رصيد سابق</span><span class="num">${v(ctx, tt.prevBalance)}</span></small>` : ''}
              <small><span>الواصل</span><span class="num">${v(ctx, tt.paid)}</span></small>
              <small><span>الباقي</span><span class="num">${v(ctx, tt.remaining)}</span></small>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ================= 2) ثنائي اللغة (Receipt وصولات) =================
  const bilingualCSS = `
.tpl-bilingual { font-family: 'Cairo', sans-serif; color: #111; }
.tpl-bilingual .doc { border: 1.5px solid #111; display: flex; flex-direction: column; position: relative; }
.tpl-bilingual .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; }
.tpl-bilingual .head { display: grid; grid-template-columns: 120px 1fr 120px; align-items: center; padding: 14px 16px 6px; }
.tpl-bilingual .head img { max-height: 90px; max-width: 120px; object-fit: contain; }
.tpl-bilingual .head .sym { width: 80px; height: 80px; border-radius: 12px; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font: 900 30px serif; }
.tpl-bilingual .head .mid { text-align: center; }
.tpl-bilingual .head h1 { margin: 0; font-size: 28px; font-weight: 900; color: var(--c-dark); }
.tpl-bilingual .head .sub { font-size: 18px; font-weight: 800; color: var(--c-dark); }
.tpl-bilingual .head .tag { text-align: left; font: 800 13px 'Readex Pro', sans-serif; color: var(--c-primary); direction: ltr; }
.tpl-bilingual .cats { border-bottom: 1.5px solid #111; text-align: center; font-size: 12.5px; font-weight: 700; padding: 4px 10px; }
.tpl-bilingual .info { display: grid; grid-template-columns: 1.7fr 1fr; padding: 8px 16px; font-size: 13px; gap: 0 20px; }
.tpl-bilingual .info .r { display: grid; grid-template-columns: 100px 1fr; padding: 1px 0; }
.tpl-bilingual .info .k { font: 800 12.5px 'Readex Pro', sans-serif; direction: ltr; text-align: left; padding-left: 10px; }
.tpl-bilingual table.items { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tpl-bilingual .items th { background: var(--c-accent); color: #fff; font: 700 12.5px 'Readex Pro', sans-serif; padding: 5px; border: 1px solid #fff; }
.tpl-bilingual .items td { border-bottom: 1px solid #ddd; padding: 3px 8px; text-align: center; height: 22px; }
.tpl-bilingual .items td.name { text-align: right; }
.tpl-bilingual .items td.num { text-align: left; }
.tpl-bilingual .grow { flex: 1; }
.tpl-bilingual .foot { display: grid; grid-template-columns: 1fr 230px; border-top: 1.5px solid #111; }
.tpl-bilingual .foot .addr { display: flex; flex-direction: column; justify-content: center; align-items: center; font-weight: 800; font-size: 13.5px; padding: 6px; gap: 2px; }
.tpl-bilingual .foot .addr .ph { font-style: italic; direction: ltr; }
.tpl-bilingual .foot .addr .words { font-size: 11.5px; font-weight: 700; color: #444; }
.tpl-bilingual .foot table { border-collapse: collapse; width: 100%; border-right: 1.5px solid #111; font-size: 13px; }
.tpl-bilingual .foot td { border-bottom: 1px solid #111; padding: 3px 8px; }
.tpl-bilingual .foot tr:last-child td { border-bottom: 0; font-weight: 900; }
.tpl-bilingual .foot td.k { font: 800 12.5px 'Readex Pro', sans-serif; direction: ltr; text-align: left; border-left: 1px solid #111; width: 95px; }
`;

  function renderBilingual(ctx) {
    const { h, company, data } = ctx;
    const its = items(ctx);
    const minRows = ctx.blank ? 26 : 0; // أسطر فارغة للنموذج اليدوي فقط
    let rows = its.map((it) => `
      <tr><td class="name">${h.esc(it.name)}</td><td>${h.esc(it.notes)}</td><td>${h.esc(it.qty)}</td>
      <td class="num">${h.fmt(it.price, ctx.currency)}</td><td class="num">${h.lineFmt(it, ctx.currency)}</td></tr>`).join('');
    for (let i = its.length; i < minRows; i++) rows += '<tr><td></td><td></td><td></td><td></td><td></td></tr>';
    const tt = ctx.totals;
    return `
    <div class="doc">
      ${h.watermark(company, ctx.watermark)}
      <div class="flow">
        <div class="head">
          <div>${company.logo ? `<img src="${h.esc(company.logo)}" alt="">` : (company.logoSymbol ? `<div class="sym">${h.esc(company.logoSymbol)}</div>` : '')}</div>
          <div class="mid"><h1>${h.esc(company.name)}</h1><div class="sub">${h.esc(ctx.title)}</div></div>
          <div class="tag">${h.esc(company.logoText || '')}</div>
        </div>
        <div class="cats">${h.esc(company.subtitle)}</div>
        <div class="info">
          <div>
            <div class="r"><span class="k">Customer</span><span>${t(ctx, data.customer)}</span></div>
            <div class="r"><span class="k">Location</span><span>${t(ctx, data.customerAddress)}</span></div>
            <div class="r"><span class="k">Phone N.</span><span class="num" style="text-align:right">${t(ctx, data.customerPhone)}</span></div>
          </div>
          <div>
            <div class="r"><span class="k">Receipt #</span><span class="num" style="text-align:right">${h.esc(ctx.number)}</span></div>
            <div class="r"><span class="k">Rec. Date</span><span class="num" style="text-align:right">${t(ctx, ctx.doc.date)}</span></div>
            <div class="r"><span class="k">Payment</span><span>${t(ctx, data.paymentMethod)}</span></div>
          </div>
        </div>
        <table class="items">
          <thead><tr><th style="width:25%">Item Name</th><th>Description</th><th style="width:9%">Qty</th><th style="width:12%">Unit Price</th><th style="width:15%">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="grow"></div>
        <div class="foot">
          <div class="addr">
            ${company.address ? `<span>العنوان : ${h.esc(company.address)}</span>` : ''}
            ${company.phone ? `<span class="ph">${h.esc(company.phone)}</span>` : ''}
            <span class="words">${h.esc(ctx.words)}</span>
          </div>
          <table>
            <tr><td class="k">Price</td><td class="num">${v(ctx, tt.subtotal)}</td></tr>
            <tr><td class="k">Discount</td><td class="num">${v(ctx, tt.discount)}</td></tr>
            ${ctx.blank ? '' : h.extraRows(tt, ctx.currency, (k, x) => `<tr><td class="k">${k}</td><td class="num">${x}</td></tr>`, ctx.settings)}
            ${tt.prevBalance ? `<tr><td class="k">Prev. Balance</td><td class="num">${v(ctx, tt.prevBalance)}</td></tr>` : ''}
            <tr><td class="k">Paid</td><td class="num">${v(ctx, tt.paid)}</td></tr>
            <tr><td class="k">Total cost</td><td class="num">${v(ctx, tt.grand)}</td></tr>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ================= 3) المربعات (الشراع) =================
  const boxedCSS = `
.tpl-boxed { --g: #d9d9d9; font-family: 'Cairo', sans-serif; color: #111; font-weight: 700; }
.tpl-boxed .doc { display: flex; flex-direction: column; position: relative; }
.tpl-boxed .flow { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; gap: 7px; }
.tpl-boxed .hero { border: 2px solid var(--c-dark); border-radius: 12px; background: #dbeaf7; padding: 8px 16px; display: flex; align-items: center; gap: 14px; }
.tpl-boxed .hero img { max-height: 80px; max-width: 120px; object-fit: contain; }
.tpl-boxed .hero .txt { flex: 1; text-align: center; }
.tpl-boxed .hero h1 { margin: 0; font-size: 36px; font-weight: 900; color: var(--c-primary); line-height: 1.2; }
.tpl-boxed .hero .sub { font-size: 20px; font-weight: 900; }
.tpl-boxed .hero .ph { font-size: 17px; font-weight: 900; color: var(--c-dark); }
.tpl-boxed table { border-collapse: collapse; width: 100%; }
.tpl-boxed .box td, .tpl-boxed .items td, .tpl-boxed .items th { border: 1.5px solid #222; padding: 4px 8px; text-align: center; font-size: 13px; }
.tpl-boxed .box td.k, .tpl-boxed .items th { background: var(--g); }
.tpl-boxed .box td.k.plain { background: none; }
.tpl-boxed .box td.gap { border: 0; width: 14px; }
.tpl-boxed .items th { font-size: 14.5px; font-weight: 900; padding: 6px; }
.tpl-boxed table.items { table-layout: fixed; }
.tpl-boxed .items td { height: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tpl-boxed .items td.name { text-align: right; }
.tpl-boxed .grow { flex: 1; }
.tpl-boxed .words { text-align: center; font-size: 13px; padding: 2px; }
.tpl-boxed .stamp { display: flex; justify-content: space-between; font-size: 10px; color: #555; font-weight: 600; padding: 0 4px; }
`;

  function renderBoxed(ctx) {
    const { h, company, data } = ctx;
    const its = items(ctx);
    const minRows = ctx.blank ? 14 : 0; // أسطر فارغة للنموذج اليدوي فقط
    let rows = its.map((it, i) => `
      <tr><td>${i + 1}</td><td class="name">${h.esc(it.name)}</td><td class="num">${h.esc(it.qty)}</td><td class="num">${h.esc(it.pack)}</td>
      <td class="num">${h.fmt(it.price, ctx.currency)}</td><td class="num">${h.lineFmt(it, ctx.currency)}</td><td>${h.esc(it.notes)}</td></tr>`).join('');
    for (let i = its.length; i < minRows; i++) rows += `<tr><td>${ctx.blank ? i + 1 : ''}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    const tt = ctx.totals;
    const count = its.reduce((s, it) => s + h.num(it.qty), 0);
    const now = new Date();
    return `
    <div class="doc">
      ${h.watermark(company, ctx.watermark)}
      <div class="flow">
        <div class="hero">
          ${company.logo ? `<img src="${h.esc(company.logo)}" alt="">` : ''}
          <div class="txt">
            <h1>${h.esc(company.name)}</h1>
            <div class="sub">${h.esc(company.subtitle)}</div>
            ${company.phone ? `<div class="ph">هاتف / <span class="num">${h.esc(company.phone)}</span></div>` : ''}
          </div>
        </div>
        <table class="box">
          <tr>
            <td class="k" style="width:16%">${h.esc(ctx.title)}</td><td style="width:26%">${t(ctx, data.paymentMethod)}</td>
            <td class="gap" rowspan="2"></td>
            <td class="k plain" rowspan="2" style="width:10%">المحترم</td>
            <td class="gap" rowspan="2"></td>
            <td class="k" style="width:16%">رقم القائمة</td><td class="num">${h.esc(ctx.number)}</td>
          </tr>
          <tr>
            <td class="k">حضرة السيد :</td><td>${t(ctx, data.customer)}</td>
            <td class="k">تاريخ القائمة</td><td class="num">${t(ctx, ctx.doc.date)}</td>
          </tr>
        </table>
        <table class="items">
          <thead><tr><th style="width:5%">ت</th><th>المادة</th><th style="width:9%">العدد</th><th style="width:9%">التعبئة</th><th style="width:11%">السعر</th><th style="width:13%">المجموع</th><th style="width:15%">الملاحظات</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <table class="box">
          <tr><td class="k" style="width:16%">عدد المواد</td><td style="width:26%" class="num">${ctx.blank ? '' : h.fmt(count, 'IQD')}</td><td class="gap"></td>
              <td class="k" style="width:16%">مجموع المبلغ</td><td class="num">${v(ctx, tt.net)}</td></tr>
          <tr><td class="k">الطلب السابق</td><td class="num">${v(ctx, tt.prevBalance)}</td><td class="gap"></td>
              <td class="k">المبلغ الواصل</td><td class="num">${v(ctx, tt.paid)}</td></tr>
          <tr><td class="k">الطلب الكلي</td><td class="num">${v(ctx, tt.grand)}</td><td class="gap"></td>
              <td class="k">المبلغ الباقي</td><td class="num">${v(ctx, tt.remaining)}</td></tr>
        </table>
        <div class="words">${h.esc(ctx.words)}</div>
        <table class="box">
          <tr><td class="k" style="width:16%">منظم القائمة</td><td style="width:26%">${t(ctx, data.accountant)}</td><td class="gap"></td>
              <td class="k" style="width:16%">المجهز</td><td style="width:18%">${t(ctx, data.receiver)}</td><td class="k plain">المخزن</td></tr>
        </table>
        <div class="grow"></div>
        <div class="stamp"><span>${h.esc(company.name)}</span><span class="num">${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}</span><span>صفحة 1 من 1</span></div>
      </div>
    </div>`;
  }

  Store.registerTemplate({
    id: 'banner', name: 'الترويسة بالشعار',
    description: 'من ملف "المختص": شعار كبير وشريط تواصل، بيانات الزبون والتوصيل، وجدول بعناوين ملوّنة.',
    types: ['sales'], sizes: ['A4', 'A5', 'Letter'],
    theme: { primary: '#2f5f8f', dark: '#1e3a5f', accent: '#2f5f8f' },
    css: bannerCSS, render: renderBanner,
  });
  Store.registerTemplate({
    id: 'bilingual', name: 'ثنائي اللغة',
    description: 'من ملف "Receipt وصولات": عنوان وسطي، عناوين حقول بالإنكليزي، وفوتر بالعنوان والمجاميع.',
    types: ['sales'], sizes: ['A4', 'A5', 'Letter'],
    theme: { primary: '#1f2937', dark: '#111111', accent: '#7f7f7f' },
    css: bilingualCSS, render: renderBilingual,
  });
  Store.registerTemplate({
    id: 'boxed', name: 'المربعات',
    description: 'من ملف "الشراع": ترويسة بإطار مدوّر، عمود التعبئة، الطلب السابق والكلي، وتواقيع المجهز والمخزن.',
    types: ['sales'], sizes: ['A4', 'A5', 'Letter'],
    itemFields: ['pack'],
    theme: { primary: '#e0141e', dark: '#1d4f91', accent: '#d9d9d9' },
    css: boxedCSS, render: renderBoxed,
  });
})();
