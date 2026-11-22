# صيغة القوالب المستوردة

القالب ملف `.json` تستورده من تبويب **القوالب ← استيراد قالب**، فيُحفظ داخل `templates/` في مجلد العمل.

| الحقل | الوصف |
|---|---|
| `id` | معرّف بالإنكليزي بدون مسافات، مثل `my-invoice`. صنف الورقة يصير `.tpl-my-invoice` |
| `name`, `description` | الاسم والوصف الظاهر في البرنامج |
| `types` | `["sales"]` أو `["receipt"]` أو كلاهما |
| `sizes` | `["A4","A5"]` |
| `minRows` | أقل عدد أسطر في جدول المواد (الباقي أسطر فارغة) |
| `theme` | الألوان: `primary`, `dark`, `accent`، وتُستخدم في CSS كـ `var(--c-primary)` ... |
| `css` | تنسيق القالب، ابدأ كل قاعدة بـ `.tpl-<id>` |
| `html` | شكل المستند مع الوسوم أدناه |

## الوسوم

- `{{x}}` يكتب القيمة، و `{{{x}}}` يكتبها كـ HTML (للشعار والعلامة المائية).
- `{{#x}}...{{/x}}` يكرر لكل عنصر في قائمة، أو يظهر الجزء إذا كانت القيمة موجودة.
- `{{^x}}...{{/x}}` يظهر الجزء إذا كانت القيمة فارغة.

القيم المتاحة: `company.name`, `company.subtitle`, `company.address`, `company.phone`, `company.email`, `logo`, `watermark`,
`title`, `number`, `copyLabel`, `date`, `customer`, `customerAddress`, `customerPhone`, `paymentMethod`, `transactionType`,
`purpose`, `notes`, `terms`, `receiver`, `accountant`, `symbol`,
`items` (لكل مادة: `i`, `name`, `notes`, `unit`, `qty`, `pack`, `price`, `total`), `emptyRows` (لكل سطر: `i`، في النموذج الفارغ فقط), `itemCount`,
`subtotal`, `discount`, `net`, `prevBalance`, `hasPrev`, `grand`, `paid`, `remaining`, `amount`, `words`, `isSales`, `isReceipt`, `blank`.

مثال كامل: [simple-example.json](simple-example.json)
