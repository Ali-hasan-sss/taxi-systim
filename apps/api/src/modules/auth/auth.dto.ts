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

export const adminLoginDto = z.object({
  email: z.string().email(),
  password: passwordField
});

export const coordinatorLoginDto = phoneLoginDto;
