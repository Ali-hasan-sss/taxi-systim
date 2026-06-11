/** يُصفَّر عند تسجيل الخروج لإعادة محاولة تسجيل Push للمستخدم التالي. */
let registrationEpoch = 0;

export function resetPushRegistrationState(): void {
  registrationEpoch += 1;
}

export function getPushRegistrationEpoch(): number {
  return registrationEpoch;
}
