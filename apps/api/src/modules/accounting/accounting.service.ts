import { CommissionPaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";

const toNum = (d: Prisma.Decimal | number) => Number(d);

export const accountingService = {
  async recordCommissionPayment(commissionId: string, amount: number, adminUserId: string, notes?: string) {
    return prisma.$transaction(async (tx) => {
      const commission = await tx.commission.findUnique({ where: { id: commissionId } });
      if (!commission) throw new AppError("Commission not found", 404);
      if (amount > toNum(commission.remainingAmount)) throw new AppError("Amount exceeds remaining", 400);

      await tx.commissionPayment.create({
        data: {
          commissionId,
          driverId: commission.driverId,
          amount,
          notes,
          paidByUserId: adminUserId
        }
      });

      const newPaid = toNum(commission.paidAmount) + amount;
      const newRemaining = toNum(commission.remainingAmount) - amount;
      const status =
        newRemaining === 0 ? CommissionPaymentStatus.PAID : newPaid > 0 ? CommissionPaymentStatus.PARTIAL : CommissionPaymentStatus.UNPAID;

      await tx.commission.update({
        where: { id: commissionId },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          paymentStatus: status,
          paidAt: newRemaining === 0 ? new Date() : null
        }
      });

      const balance = await tx.driverBalance.findUnique({ where: { driverId: commission.driverId } });
      if (balance) {
        await tx.driverBalance.update({
          where: { driverId: commission.driverId },
          data: {
            totalPaidCommissions: toNum(balance.totalPaidCommissions) + amount,
            remainingDebt: Math.max(0, toNum(balance.remainingDebt) - amount)
          }
        });
      }

      await tx.financialTransaction.create({
        data: {
          driverId: commission.driverId,
          type: "COMMISSION_PAYMENT",
          amount,
          referenceId: commissionId,
          notes: notes ?? "Commission payment"
        }
      });
    });
  }
};
