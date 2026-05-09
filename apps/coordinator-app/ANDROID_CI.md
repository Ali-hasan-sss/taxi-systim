# بناء أندرويد (تطبيق المنسق) — GitHub Actions + EAS

الطريقة الموصى بها مع Expo SDK 54 هي **EAS Build** (بناء سحابي موقّع). لا حاجة لتشغيل Gradle يدويًا على GitHub إلا إذا اخترت مسارًا مخصصًا.

## 1) متطلبات لمرة واحدة (حساب Expo)

1. أنشئ حسابًا على [expo.dev](https://expo.dev).
2. من الجذر المونوريبو:
   ```bash
   pnpm install
   cd apps/coordinator-app
   pnpm exec eas login
   pnpm exec eas init
   ```
3. يحدّث `eas init` ملف `app.json` (يضيف `owner` و`extra.eas.projectId`). **ادفع هذه التغييرات إلى GitHub** قبل تشغيل الـ Action.

## 2) أسرار GitHub (Repository secrets)

| الاسم | مطلوب | الوصف |
|--------|--------|--------|
| `EXPO_TOKEN` | نعم | من [إعدادات الحساب → Access tokens](https://expo.dev/accounts) — صلاحية **Build** على الأقل. |

### متغيرات بيئة التطبيق (API الإنتاج)

متغيرات مثل `EXPO_PUBLIC_API_URL` **لا تُمرَّر تلقائيًا من GitHub إلى سحابة EAS**. عرّفها في مشروع Expo:

```bash
cd apps/coordinator-app
pnpm exec eas secret:create --name EXPO_PUBLIC_API_URL --value "https://your-api.example.com/api" --type string
```

أو من لوحة المشروع في expo.dev → **Environment variables**.

## 3) تشغيل البناء

- يدويًا: **Actions** → **Coordinator Android (EAS)** → **Run workflow**  
  - `production`: **AAB** لمتجر Google Play.  
  - `preview`: **APK** للتوزيع الداخلي.
- أو ادفع وسمًا: `coordinator-android-v1.0.0` لبناء **production** تلقائيًا.

## 4) التوقيع (Keystore)

### أ) الإدارة عبر EAS (الأسهل — افتراضي)

عند أول `eas build` تفاعلي، يمكن لـ Expo إنشاء keystore وتخزينه بأمان. في CI يكفي `EXPO_TOKEN`.

### ب) إنشاء keystore محليًا (للاحتفاظ بنسخة عندك)

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore coordinator-release.keystore \
  -alias coordinator \
  -keyalg RSA -keysize 2048 -validity 10000
```

- **لا ترفع** ملف `.keystore` إلى Git (مذكور في `apps/coordinator-app/.gitignore`).
- لرفعه إلى EAS:

```bash
cd apps/coordinator-app
pnpm exec eas credentials
```

اتبع خيار Android → إعداد مفتاح الإصدار (upload key).

## 5) رفع إلى Google Play

بعد نجاح البناء، نزّل **AAB** من لوحة المشروع في expo.dev، أو أضف خطوة لاحقًا:

```bash
pnpm exec eas submit --platform android --profile production
```

يتطلب إعداد **Google Service Account** في Expo (انظر وثائق `eas submit`).

## 6) رقم الإصدار (versionCode)

زِد `expo.android.versionCode` في `app.json` مع كل رفع جديد لمتجر Play (أو استخدم سياسة الإصدارات عن بُعد في EAS حسب إعدادك).

## 7) المونوريبو + pnpm

`eas.json` يستخدم ملفًا أساسيًا `monorepo` مع `pnpm` متوافق مع `packageManager` في جذر المستودع. تأكد أن **`pnpm-lock.yaml`** و **`pnpm-workspace.yaml`** مُدفوعان إلى Git.
