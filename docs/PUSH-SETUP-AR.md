# إعداد إشعارات Push (Android) — دليل كامل

## السبب الشائع لفشل التوكن

رفع **FCM V1** في `eas credentials` **وحده لا يكفي**.

التطبيق على الجوال يحتاج أيضاً ملف **`google-services.json`** داخل مجلد التطبيق لتهيئة Firebase.  
بدونه يفشل `getExpoPushTokenAsync` بصمت أو بخطأ:

`Default FirebaseApp is not initialized`

ولن يصل طلب `POST /api/auth/push-token` للسيرفر.

---

## 1) Firebase Console — تطبيقان أندرويد (مهم)

مشروع Firebase واحد (`taxi-pro-c3a54`) لكن **تطبيقان منفصلان**:

| التطبيق | Package name | ملف JSON |
|---------|--------------|----------|
| السائق | `com.taxioffice.driver` | `apps/driver-app/google-services.json` |
| المنسق | `com.taxioffice.coordinator` | `apps/coordinator-app/google-services.json` |

### الخطوات

1. [Firebase Console](https://console.firebase.google.com) → مشروعك
2. **Add app** → **Android**
3. أدخل package name (مثلاً `com.taxioffice.driver`)
4. نزّل **google-services.json**
5. ضعه في `apps/driver-app/google-services.json`
6. كرّر للمنسق بـ `com.taxioffice.coordinator`

تحقق داخل الملف أن `package_name` يطابق `app.json` حرفياً.

---

## 2) Google Cloud — تفعيل API

1. [Google Cloud Console](https://console.cloud.google.com) → نفس مشروع Firebase
2. **APIs & Services** → **Library**
3. ابحث عن **Firebase Cloud Messaging API**
4. اضغط **Enable** (يجب أن يكون مفعّلاً)

---

## 3) SHA-1 من EAS → Firebase

لكل تطبيق أندرويد في Firebase:

1. `cd apps/driver-app && pnpm exec eas credentials` → Android → Keystore → انسخ **SHA1**
2. Firebase → Project settings → تطبيق Android → **Add fingerprint** → الصق SHA-1
3. كرّر للمنسق (keystore مختلف)

---

## 4) FCM V1 في EAS (لكل تطبيق)

```bash
cd apps/driver-app
pnpm exec eas credentials
# Android → preview (أو production) → Push Notifications → FCM V1 → ارفع JSON
```

```bash
cd apps/coordinator-app
pnpm exec eas credentials
# نفس الخطوات — مشروع EAS منفصل
```

---

## 5) متغير API

```bash
pnpm exec eas env:list --environment preview
```

يجب أن يظهر:

`EXPO_PUBLIC_API_URL=https://taxi.qmenussy.com/api`

---

## 6) البناء

1. زِد `versionCode` في `app.json`
2. **ادفع `google-services.json` إلى Git** (آمن للنشر — ليس سراً)
3. ابنِ:

```bash
pnpm eas:driver:android:preview
```

4. ثبّت APK الجديد (ليس Expo Go)

---

## 7) التحقق

| المكان | النجاح |
|--------|--------|
| سجلات API | `POST /api/auth/push-token` → 204 |
| قاعدة البيانات | `expoPushToken` = `ExponentPushToken[...]` |
| الداشبورد | جرس أخضر في الموظفين |
| اختبار إرسال | https://expo.dev/notifications |

---

## ملاحظة

- **Firebase Console** لا يختبر Expo Push Token مباشرة — استخدم expo.dev/notifications
- ملف Service Account (`firebase-adminsdk-*.json`) يذهب لـ **EAS** فقط، وليس داخل `apps/api`
