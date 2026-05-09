#!/usr/bin/env bash
# إنشاء keystore لتوقيع إصدار أندرويد (تشغيل محلي — لا ترفع الملف إلى Git).
set -euo pipefail
OUT="${1:-coordinator-release.keystore}"
ALIAS="${2:-coordinator}"
echo "سيُنشأ: $OUT | alias: $ALIAS"
keytool -genkeypair -v -storetype PKCS12 \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000
echo "تم. احفظ كلمة مرور المتجر والاسم المستعار في مدير كلمات مرور آمن."
