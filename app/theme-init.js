// يطبّق الوضع الليلي قبل رسم الصفحة (ملف منفصل حتى تسمح به سياسة الأمان CSP)
try { var t = localStorage.getItem('im-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
