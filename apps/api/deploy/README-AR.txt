إعداد بروكسي Nginx لـ API على السب دومين taxi.qmenussy.com
============================================================

1) إعداد DNS أولًا
   - اجعل سجل A للسب دومين taxi.qmenussy.com يشير إلى IP الخادم.
   - تحقق: ping taxi.qmenussy.com

2) تشغيل سريع (شهادة ذاتية مؤقتة)
   - على الـ VPS:
     sudo apt install -y nginx openssl
     cd /var/www/taxi-systim/apps/api   (أو مسار مشروعك)
     sudo bash deploy/gen-ssl-selfsigned.sh عرض_IP_الخادم
     sudo cp deploy/nginx-api-selfsigned.conf /etc/nginx/sites-available/taxi-api
     sudo ln -sf /etc/nginx/sites-available/taxi-api /etc/nginx/sites-enabled/
     sudo nginx -t && sudo systemctl reload nginx
   - ستكون النتيجة: https://taxi.qmenussy.com
   - المتصفح/الجوال قد يُظهران "غير آمن" لأن الشهادة ذاتية.

3) HTTP فقط على المنفذ 80 (بدون SSL) عند الحاجة
   - sudo cp deploy/nginx-api-http-only.conf /etc/nginx/sites-available/taxi-api
   - (باقي الخطوات كما فوق)
   - عنوان الـ API للتطبيقات: http://taxi.qmenussy.com/api

4) تطبيقات الجوال مع HTTPS ذاتي
   - قد ترفض الاتصال ما لم تضف استثناء أمان أو شهادة موثوقة.
   - للإنتاج الأفضل: دومين حقيقي + Let's Encrypt.

5) الأفضل للإنتاج: شهادة موثوقة Let's Encrypt
   - sudo apt install -y certbot python3-certbot-nginx
   - ملف nginx الحالي مضبوط على taxi.qmenussy.com
   - نفّذ: sudo certbot --nginx -d taxi.qmenussy.com
