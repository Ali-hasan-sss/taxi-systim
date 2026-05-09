/** ترجمة وتفصيل أخطاء تسجيل الدخول والمصادقة القادمة من الخادم (إنجليزي أو عربي). */

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function mapCoordinatorLoginError(httpStatus: number, serverMessage: string): string {
  const m = norm(serverMessage || "");

  if (m.includes("رقم الهاتف قصير") || (httpStatus === 400 && m.includes("phone"))) {
    return "أدخل رقم هاتف صالحًا (8 أرقام على الأقل) بدون أو مع مسافات وشرطات.";
  }
  if (m.includes("invalid email")) {
    return "صيغة البريد الإلكتروني غير صالحة. مثال: name@example.com";
  }
  if (m.includes("at least") && m.includes("character")) {
    return "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
  }
  if (m.includes("invalid credentials") || m === "invalid credentials") {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة. تأكد من لوحة المفاتيح (اللغة، المسافات) وحاول مرة أخرى.";
  }
  if (m.includes("user is inactive") || m.includes("inactive")) {
    return "تم تعطيل هذا الحساب. لا يمكن تسجيل الدخول حتى يفعّله المسؤول.";
  }
  if (m.includes("coordinator access only")) {
    return "هذا الحساب غير مسجّل كمنسق. استخدم حسابًا صالحًا لمنسقي الشركة أو تواصل مع الإدارة.";
  }
  if (m.includes("unauthorized") && httpStatus === 401) {
    return "لم يُقبل الطلب (غير مصرح). تحقق من البيانات أو من صلاحية الحساب.";
  }
  if (m.includes("forbidden") || httpStatus === 403) {
    return "الوصول مرفوض لهذا الحساب. قد يكون الحساب معطّلًا أو لا يملك صلاحية المنسق.";
  }
  if (httpStatus === 404) {
    return "عنوان تسجيل الدخول غير موجود على الخادم. تحقق من إصدار الـ API وعنوان الخادم.";
  }
  if (httpStatus === 429) {
    return "طلبات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.";
  }
  if (httpStatus >= 500) {
    return "الخادم يواجه خطأ مؤقتًا. حاول لاحقًا أو أبلغ الدعم الفني.";
  }
  if (serverMessage.trim()) {
    return serverMessage.trim();
  }
  if (httpStatus === 401) {
    return "فشل المصادقة (401). تحقق من البريد وكلمة المرور.";
  }
  return `فشل تسجيل الدخول (رمز HTTP: ${httpStatus}).`;
}

export function mapRefreshTokenError(serverMessage: string): string {
  const m = norm(serverMessage || "");
  if (m.includes("invalid refresh token")) {
    return "انتهت صلاحية الجلسة أو أُلغيت. يرجى تسجيل الدخول من جديد.";
  }
  if (serverMessage.trim()) return serverMessage.trim();
  return "تعذر تجديد الجلسة. يرجى تسجيل الدخول من جديد.";
}
