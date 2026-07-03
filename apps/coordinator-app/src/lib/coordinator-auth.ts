/** أخطاء تستدعي تسجيل الخروج فعليًا — وليس انقطاع شبكة أو ازدحام مؤقت */
export function isCoordinatorAuthFailureMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return (
    /invalid refresh token/i.test(m) ||
    /انتهت صلاحية الجلسة|تسجيل الدخول من جديد|أعد تسجيل الدخول/i.test(m) ||
    (/غير مصرح/i.test(m) && !/كثيرة|بعد قليل|429/i.test(m)) ||
    (/Unauthorized/i.test(m) && !/429/i.test(m))
  );
}

export function isPermanentRefreshFailure(message: string): boolean {
  return /invalid refresh token/i.test(message) || /تسجيل الدخول من جديد/i.test(message);
}
