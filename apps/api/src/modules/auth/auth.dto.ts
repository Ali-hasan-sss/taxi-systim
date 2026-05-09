import { z } from "zod";

const passwordField = z.string().min(6);

/** تسجيل دخول السائق (عام) والمنسق — برقم الهاتف */
export const phoneLoginDto = z.object({
  phone: z.string().min(8, "رقم الهاتف قصير جدًا"),
  password: passwordField
});

export const loginDto = phoneLoginDto;

export const refreshDto = z.object({
  refreshToken: z.string().min(10)
});

export const adminLoginDto = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(8, "رقم الهاتف قصير جدًا").optional(),
    password: passwordField
  })
  .refine((v) => Boolean(v.email || v.phone), {
    message: "يجب إدخال email أو phone",
    path: ["email"]
  });

export const coordinatorLoginDto = phoneLoginDto;

export const expoPushTokenDto = z.object({
  token: z.string().min(20, "رمز الإشعار قصير جدًا")
});
