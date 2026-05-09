-- يجب أن يُنفَّذ بعد ترحيلات مايو 2025 التي تنشئ "OrderStatus"
ALTER TYPE "OrderStatus" ADD VALUE 'EN_ROUTE_TO_CUSTOMER';
ALTER TYPE "OrderStatus" ADD VALUE 'STUCK';

-- ترحيل البيانات: المقبول/الوصل → في الطريق إلى الزبون
UPDATE "Order"
SET "status" = 'EN_ROUTE_TO_CUSTOMER'::"OrderStatus"
WHERE "status"::text IN ('ACCEPTED', 'ARRIVED');
