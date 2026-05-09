#!/usr/bin/env bash
# شهادة SSL موقّعة ذاتيًا بدون دومين (مناسبة للاختبار أو الشبكة الداخلية).
# الاستخدام: sudo bash gen-ssl-selfsigned.sh 72.62.157.251
# يُنشئ الملفات تحت /etc/nginx/ssl/ (أنشئ المجلد إن لم يوجد).

set -euo pipefail

IP="${1:-}"
if [ -z "$IP" ]; then
  echo "الاستخدام: sudo $0 <72.62.157.251>"
  echo "مثال: sudo 72.62.157.251"
  exit 1
fi

SSL_DIR="${SSL_DIR:-/etc/nginx/ssl}"
mkdir -p "$SSL_DIR"
KEY="$SSL_DIR/taxi-api.key"
CRT="$SSL_DIR/taxi-api.crt"
CNF="$(mktemp)"

cleanup() { rm -f "$CNF"; }
trap cleanup EXIT

cat >"$CNF" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = taxi-api-local

[v3_req]
subjectAltName = @san
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[san]
IP.1 = $IP
DNS.1 = localhost
EOF

openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "$KEY" -out "$CRT" -config "$CNF" -extensions v3_req

chmod 640 "$KEY"
chmod 644 "$CRT"
echo "تم."
echo "  المفتاح: $KEY"
echo "  الشهادة: $CRT"
echo ""
echo "تطبيقات الجوال/المتصفح ستُظهر تحذير أمان (طبيعي للشهادات الذاتية)."
echo "لاحقًا: احصل على دومين مجاني (مثل DuckDNS) واستخدم Let's Encrypt بدل هذا."
