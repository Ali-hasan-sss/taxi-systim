import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
    const pass = await bcrypt.hash("secret123", 10);
    const admin = await prisma.user.upsert({
        where: { email: "admin@taxi.local" },
        update: {},
        create: {
            email: "admin@taxi.local",
            passwordHash: pass,
            fullName: "System Admin",
            role: Role.ADMIN
        }
    });
    await prisma.systemSettings.upsert({
        where: { key: "commission" },
        update: {},
        create: {
            key: "commission",
            commissionType: "PERCENTAGE",
            commissionValue: 10,
            updatedByUserId: admin.id
        }
    });
}
main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
