/** أخطاء تسجيل دخول السائق والمصادقة من الخادم. */

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function mapDriverLoginError(httpStatus: number, serverMessage: string): string {
  const m = norm(serverMessage || "");

  if (m.includes("invalid credentials")) {
    return "رقم الهاتف أو كلمة المرور غير صحيحة. تحقق من البيانات وحاول مرة أخرى.";
  }
  if (m.includes("user is inactive") || m.includes("inactive")) {
    return "تم تعطيل هذا الحساب. لا يمكن تسجيل الدخول حتى يفعّله المسؤول.";
  }
  if (m.includes("هذا الحساب ليس حساب سائق") || m.includes("driver")) {
    return "هذا الحساب غير مسجّل كسائق. استخدم حساب السائق أو تواصل مع الإدارة.";
  }
  if (httpStatus === 403) {
    return "الوصول مرفوض لهذا الحساب.";
  }
  if (httpStatus === 404) {
    return "عنوان تسجيل الدخول غير موجود على الخادم. تحقق من عنوان الـ API.";
  }
  if (httpStatus === 429) {
    return "طلبات كثيرة. انتظر قليلًا ثم أعد المحاولة.";
  }
  if (httpStatus >= 500) {
    return "الخادم يواجه خطأ مؤقتًا. حاول لاحقًا.";
  }
  if (serverMessage.trim()) return serverMessage.trim();
  if (httpStatus === 401) {
    return "فشل المصادقة. تحقق من رقم الهاتف وكلمة المرور.";
  }
  return `فشل تسجيل الدخول (رمز HTTP: ${httpStatus}).`;
}

export function mapRefreshTokenError(serverMessage: string): string {
  const m = norm(serverMessage || "");
  if (m.includes("invalid refresh token")) {
    return "انتهت صلاحية الجلسة. يرجى تسجيل الدخول من جديد.";
  }
  if (serverMessage.trim()) return serverMessage.trim();
  return "تعذر تجديد الجلسة. يرجى تسجيل الدخول من جديد.";
}
