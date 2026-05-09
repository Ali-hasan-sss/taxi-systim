-- DropNotNull on email (تسجيل منسق/سائق بدون بريد)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- فهرس فريد على الهاتف (قيم NULL متعددة مسموحة في PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
