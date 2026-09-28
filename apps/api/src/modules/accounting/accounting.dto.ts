import { z } from "zod";

const ymdField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ يجب أن تكون YYYY-MM-DD");

export const recordPaymentDto = z.object({
  commissionId: z.string().cuid(),
  amount: z.number().positive(),
  notes: z.string().optional()
});

export const recordDriverCompensationDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive(),
  notes: z.string().max(1000).optional()
});

export const recordDriverFineDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive(),
  notes: z.string().max(1000).optional()
});

export const recordDriverDeductionDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive().max(99_999_999.99),
  reason: z.string().trim().min(2).max(1000)
});

export const listDriverFinesQueryDto = z.object({
  driverId: z.string().cuid().optional(),
  from: ymdField.optional(),
  to: ymdField.optional()
});

export const listDriverCompensationsQueryDto = listDriverFinesQueryDto;

export const financeReportQueryDto = z.object({
  from: ymdField.optional(),
  to: ymdField.optional(),
  driverId: z.string().cuid().optional(),
  coordinatorId: z.string().cuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const financeExportQueryDto = z.object({
  from: ymdField.optional(),
  to: ymdField.optional(),
  driverId: z.string().cuid().optional(),
  coordinatorId: z.string().cuid().optional()
});

export const settleOrderCommissionDto = z.object({
  orderId: z.string().cuid(),
  notes: z.string().optional()
});

export const settleDriverFineDto = z.object({
  fineId: z.string().cuid(),
  notes: z.string().max(1000).optional()
});

export const settleFilteredCommissionsDto = z.object({
  from: ymdField.optional(),
  to: ymdField.optional(),
  driverId: z.string().cuid().optional(),
  coordinatorId: z.string().cuid().optional(),
  notes: z.string().optional()
});

export const settleDriverBalanceDto = z.object({
  driverId: z.string().cuid(),
  notes: z.string().optional()
});

export const prepaidTopupDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive().max(99_999_999.99),
  notes: z.string().max(1000).optional()
});

export const recordDriverExtraDebtDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive().max(99_999_999.99),
  reason: z.string().max(1000).optional()
});

export const recordDriverDueCreditDto = z.object({
  driverId: z.string().cuid(),
  amount: z.number().positive().max(99_999_999.99),
  reason: z.string().trim().min(2).max(1000)
});

export const payoutDriverCreditDto = z.object({
  driverId: z.string().cuid(),
  notes: z.string().max(1000).optional()
});
