import type { NextFunction, Response } from "express";
import {
  financeExportQueryDto,
  financeReportQueryDto,
  recordDriverCompensationDto,
  recordPaymentDto,
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
  }
};
