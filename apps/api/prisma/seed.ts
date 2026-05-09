import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { normalizePhoneDigits } from "../src/shared/phone";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Add it to root .env before running seed.");
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@taxi.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "secret123";
  const adminFullName = process.env.SEED_ADMIN_FULL_NAME ?? "Taxi Office Admin";
  const pass = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: adminFullName,
      role: Role.ADMIN,
      isActive: true
    },
    create: {
      email: adminEmail,
      passwordHash: pass,
      fullName: adminFullName,
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

  const coordEmail = process.env.SEED_COORDINATOR_EMAIL ?? "coordinator@taxi.local";
  const coordPhone = normalizePhoneDigits(process.env.SEED_COORDINATOR_PHONE ?? "07700000001");
  const coordPassword = process.env.SEED_COORDINATOR_PASSWORD ?? "secret123";
  const coordName = process.env.SEED_COORDINATOR_FULL_NAME ?? "منسق العمليات";
  const coordHash = await bcrypt.hash(coordPassword, 10);

  let coordinatorUser = await prisma.user.findFirst({ where: { email: coordEmail } });
  if (coordinatorUser) {
    coordinatorUser = await prisma.user.update({
      where: { id: coordinatorUser.id },
      data: {
        phone: coordPhone,
        passwordHash: coordHash,
        fullName: coordName,
        role: Role.COORDINATOR,
        isActive: true
      }
    });
  } else {
    coordinatorUser = await prisma.user.findFirst({ where: { phone: coordPhone } });
    if (coordinatorUser) {
      coordinatorUser = await prisma.user.update({
        where: { id: coordinatorUser.id },
        data: {
          passwordHash: coordHash,
          fullName: coordName,
          role: Role.COORDINATOR,
          isActive: true
        }
      });
    } else {
      coordinatorUser = await prisma.user.create({
        data: {
          phone: coordPhone,
          email: null,
          passwordHash: coordHash,
          fullName: coordName,
          role: Role.COORDINATOR,
          isActive: true
        }
      });
    }
  }
  await prisma.coordinator.upsert({
    where: { userId: coordinatorUser.id },
    update: {},
    create: { userId: coordinatorUser.id }
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin: ${adminEmail}`);
  // eslint-disable-next-line no-console
  console.log(`Seeded coordinator: phone ${coordPhone} (legacy email in env: ${coordEmail})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
