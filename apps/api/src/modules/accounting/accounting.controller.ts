import type { NextFunction, Response } from "express";
import {
  financeExportQueryDto,
  financeReportQueryDto,
  listDriverCompensationsQueryDto,
  listDriverFinesQueryDto,
  payoutDriverCreditDto,
  recordDriverCompensationDto,
  recordDriverDeductionDto,
  recordDriverDueCreditDto,
  recordDriverExtraDebtDto,
  recordDriverFineDto,
  recordPaymentDto,
  prepaidTopupDto,
  settleDriverBalanceDto,
  settleDriverFineDto,
  settleFilteredCommissionsDto,
  settleOrderCommissionDto
} from "./accounting.dto";
import type { AuthRequest } from "../../shared/auth";
import { accountingService } from "./accounting.service";

function buildSafeContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const fallback = asciiFallback || "finance-report.xlsx";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const accountingController = {
  async report(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = financeReportQueryDto.parse(req.query);
      const data = await accountingService.financeReport(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async exportXlsx(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = financeExportQueryDto.parse(req.query);
      const file = await accountingService.buildFinanceExportXlsx(query);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", buildSafeContentDisposition(file.filename));
      res.setHeader("Cache-Control", "no-store");
      res.status(200).end(file.buffer);
    } catch (err) {
      next(err);
    }
  },

  async recordDriverCompensation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordDriverCompensationDto.parse(req.body);
      const result = await accountingService.recordDriverCompensation(dto.driverId, dto.amount, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسجيل التعويض", ...result });
    } catch (err) {
      next(err);
    }
  },

  async listDriverCompensations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = listDriverCompensationsQueryDto.parse(req.query);
      const data = await accountingService.listDriverCompensations(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async recordDriverFine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordDriverFineDto.parse(req.body);
      const result = await accountingService.recordDriverFine(dto.driverId, dto.amount, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسجيل الغرامة", ...result });
    } catch (err) {
      next(err);
    }
  },

  async listDriverFines(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = listDriverFinesQueryDto.parse(req.query);
      const data = await accountingService.listDriverFines(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async recordDriverDeduction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordDriverDeductionDto.parse(req.body);
      const result = await accountingService.recordDriverDeduction(
        dto.driverId,
        dto.amount,
        dto.reason,
        req.auth!.userId
      );
      res.status(201).json({ message: "تم تسجيل الخصم", ...result });
    } catch (err) {
      next(err);
    }
  },

  async listDriverDeductions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = listDriverFinesQueryDto.parse(req.query);
      const data = await accountingService.listDriverDeductions(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async settleDriverFine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = settleDriverFineDto.parse(req.body);
      const result = await accountingService.settleDriverFine(dto.fineId, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسديد الغرامة", ...result });
    } catch (err) {
      next(err);
    }
  },

  async recordPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordPaymentDto.parse(req.body);
      await accountingService.recordCommissionPayment(dto.commissionId, dto.amount, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "Payment recorded" });
    } catch (err) {
      next(err);
    }
  },

  async settleOrderCommission(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = settleOrderCommissionDto.parse(req.body);
      const result = await accountingService.settleOrderCommission(dto.orderId, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسديد عمولة الطلب", ...result });
    } catch (err) {
      next(err);
    }
  },

  async settleFilteredCommissions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = settleFilteredCommissionsDto.parse(req.body);
      const result = await accountingService.settleFilteredCommissions(req.auth!.userId, dto);
      res.status(201).json({ message: "تم تنفيذ التسديد الجماعي", ...result });
    } catch (err) {
      next(err);
    }
  },

  async listDriverBalances(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await accountingService.listDriverBalances();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async settleDriverBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = settleDriverBalanceDto.parse(req.body);
      const result = await accountingService.settleDriverBalance(dto.driverId, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسديد المبلغ المترتب على السائق", ...result });
    } catch (err) {
      next(err);
    }
  },

  async recordPrepaidTopup(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = prepaidTopupDto.parse(req.body);
      const result = await accountingService.recordPrepaidTopup(
        dto.driverId,
        dto.amount,
        req.auth!.userId,
        dto.notes
      );
      res.status(201).json({ message: "تم شحن رصيد السائق", ...result });
    } catch (err) {
      next(err);
    }
  },

  async listPaymentModeSettlements(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await accountingService.listPaymentModeSettlements();
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async exportDebtsDuesXlsx(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const file = await accountingService.buildDebtsDuesExportXlsx();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", buildSafeContentDisposition(file.filename));
      res.setHeader("Cache-Control", "no-store");
      res.status(200).end(file.buffer);
    } catch (err) {
      next(err);
    }
  },

  async recordDriverExtraDebt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordDriverExtraDebtDto.parse(req.body);
      const result = await accountingService.recordDriverExtraDebt(
        dto.driverId,
        dto.amount,
        dto.reason ?? "",
        req.auth!.userId
      );
      res.status(201).json({ message: "تم إضافة الدين", ...result });
    } catch (err) {
      next(err);
    }
  },

  async recordDriverDueCredit(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = recordDriverDueCreditDto.parse(req.body);
      const result = await accountingService.recordDriverDueCredit(
        dto.driverId,
        dto.amount,
        dto.reason,
        req.auth!.userId
      );
      res.status(201).json({ message: "تم إضافة المبلغ لحساب السائق", ...result });
    } catch (err) {
      next(err);
    }
  },

  async settleDriverDebt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = settleDriverBalanceDto.parse(req.body);
      const result = await accountingService.settleDriverBalance(dto.driverId, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تسديد دين السائق", ...result });
    } catch (err) {
      next(err);
    }
  },

  async payoutDriverCredit(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = payoutDriverCreditDto.parse(req.body);
      const result = await accountingService.payoutDriverCredit(dto.driverId, req.auth!.userId, dto.notes);
      res.status(201).json({ message: "تم تقبيض المبلغ للسائق", ...result });
    } catch (err) {
      next(err);
    }
  },

  async reconcileCoveredLedgersFromCompensations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await accountingService.reconcileCoveredLedgersFromCompensations(req.auth!.userId);
      res.json({
        message: `تمت مقاصة ${result.driversReconciled} سائق من أصل ${result.driversScanned}`,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
};
