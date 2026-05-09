إعداد بروكسي Nginx لـ API بدون دومين
=====================================

1) لماذا لا Let's Encrypt بدون دومين؟
   - شهادات Let's Encrypt مرتبطة باسم نطاق (DNS) تثبت أنك تملكه.
   - بدون دومين: استخدم إما شهادة موقّعة ذاتيًا، أو دومين مجاني لاحقًا (DuckDNS، No-IP، إلخ) ثم certbot.

2) شهادة ذاتية (Self-signed) + HTTPS
   - على الـ VPS:
     sudo apt install -y nginx openssl
     cd /var/www/taxi-systim/apps/api   (أو مسار مشروعك)
     sudo bash deploy/gen-ssl-selfsigned.sh عرض_IP_الخادم
     sudo cp deploy/nginx-api-selfsigned.conf /etc/nginx/sites-available/taxi-api
     sudo ln -sf /etc/nginx/sites-available/taxi-api /etc/nginx/sites-enabled/
     sudo rm -f /etc/nginx/sites-enabled/default   # إن تعارض default_server
     sudo nginx -t && sudo systemctl reload nginx
   - المتصفح والتطبيقات ستُظهر "غير آمن" أو طلب قبول الشهادة — هذا متوقع.

3) HTTP فقط على المنفذ 80 (بدون SSL)
   - sudo cp deploy/nginx-api-http-only.conf /etc/nginx/sites-available/taxi-api
   - (باقي الخطوات كما فوق)
   - عنوان الـ API للتطبيقات: http://IP/api

4) تطبيقات الجوال (Expo) مع HTTPS ذاتي
   - قد ترفض الاتصال ما لم تضف استثناء أمان أو شهادة موثوقة.
   - للإنتاج الأفضل: دومين حقيقي + Let's Encrypt.

5) عندما يتوفر دومين لاحقًا
   - sudo apt install -y certbot python3-certbot-nginx
   - ضع server_name api.example.com; في ملف nginx
   - sudo certbot --nginx -d api.example.com
