/** يُصفَّر عند تسجيل الخروج لإعادة محاولة تسجيل Push للمستخدم التالي. */
let registrationEpoch = 0;
/** لا نعرض حوار الصلاحية أكثر من مرة في نفس تشغيل التطبيق. */
let permissionPromptedThisProcess = false;

export function resetPushRegistrationState(): void {
  registrationEpoch += 1;
  permissionPromptedThisProcess = false;
}

export function getPushRegistrationEpoch(): number {
  return registrationEpoch;
}

export function hasPromptedNotificationPermission(): boolean {
  return permissionPromptedThisProcess;
}

export function markNotificationPermissionPrompted(): void {
  permissionPromptedThisProcess = true;
}
