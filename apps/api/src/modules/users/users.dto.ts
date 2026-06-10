import { z } from "zod";
import { VehicleKind } from "@prisma/client";
import { isValidPhoneDigits, normalizePhoneDigits } from "../../shared/phone";

export const roleEnum = z.enum(["ADMIN", "COORDINATOR", "DRIVER"]);

const driverProfileDto = z
  .object({
    vehicleBrand: z.string().max(120).optional().nullable(),
    vehicleKind: z.nativeEnum(VehicleKind).optional().nullable(),
    vehicleColor: z.string().max(80).optional().nullable(),
    /** رقم لوحة السيارة */
    plateNumber: z.string().max(40).optional().nullable()
  })
  .optional();

export const listUsersQueryDto = z.object({
  role: roleEnum.optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  q: z.string().trim().max(120).optional()
});

export const createUserDto = z
  .object({
    email: z.union([z.string().email(), z.literal("")]).optional(),
    password: z.string().min(6),
    fullName: z.string().min(2),
    phone: z.string().optional(),
    role: roleEnum,
    driverProfile: driverProfileDto
  })
  .superRefine((data, ctx) => {
    if (data.role === "ADMIN") {
      const em = typeof data.email === "string" ? data.email.trim() : "";
      if (!em) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "البريد مطلوب للأدمن", path: ["email"] });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "صيغة البريد غير صالحة", path: ["email"] });
      }
    } else {
      const digits = normalizePhoneDigits(data.phone ?? "");
      if (!isValidPhoneDigits(digits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "رقم الهاتف إلزامي للمنسق والسائق (8–15 رقمًا)",
          path: ["phone"]
        });
      }
    }
  });

export const updateUserDto = z
  .object({
    email: z.union([z.string().email(), z.literal("")]).optional(),
    password: z.string().min(6).optional(),
    fullName: z.string().min(2).optional(),
    phone: z.string().nullable().optional(),
    role: roleEnum.optional(),
    driverProfile: driverProfileDto
  })
  .superRefine((data, ctx) => {
    if (data.email !== undefined && data.email !== null && String(data.email).trim() !== "") {
      const em = String(data.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "صيغة البريد غير صالحة", path: ["email"] });
      }
    }
    if (data.phone !== undefined && data.phone !== null && data.phone !== "") {
      const digits = normalizePhoneDigits(data.phone);
      if (!isValidPhoneDigits(digits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "رقم هاتف غير صالح (8–15 رقمًا)",
          path: ["phone"]
        });
      }
    }
  });

export const setStatusDto = z.object({
  isActive: z.boolean()
});

const bulkDriverRowDto = z
  .object({
    fullName: z.string().trim().min(2),
    phone: z.string().trim().min(1),
    password: z.string().min(6),
    vehicleBrand: z.string().max(120).optional().nullable(),
    vehicleKind: z.nativeEnum(VehicleKind).optional().nullable(),
    vehicleColor: z.string().max(80).optional().nullable(),
    plateNumber: z.string().max(40).optional().nullable()
  })
  .superRefine((row, ctx) => {
    const digits = normalizePhoneDigits(row.phone);
    if (!isValidPhoneDigits(digits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "رقم هاتف غير صالح (8–15 رقمًا)",
        path: ["phone"]
      });
    }
  });

export const bulkCreateDriversDto = z.object({
  drivers: z.array(bulkDriverRowDto).min(1).max(500)
});
