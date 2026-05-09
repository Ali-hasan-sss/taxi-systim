export type Role = "ADMIN" | "COORDINATOR" | "DRIVER";

export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export type CommissionType = "PERCENTAGE" | "FIXED";
export type CommissionPaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface JwtPayload {
  sub: string;
  role: Role;
}
