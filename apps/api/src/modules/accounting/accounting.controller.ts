import type { Response } from "express";
import { recordPaymentDto } from "./accounting.dto";
import type { AuthRequest } from "../../shared/auth";
import { accountingService } from "./accounting.service";

export const accountingController = {
  async recordPayment(req: AuthRequest, res: Response) {
    const dto = recordPaymentDto.parse(req.body);
    await accountingService.recordCommissionPayment(dto.commissionId, dto.amount, req.auth!.userId, dto.notes);
    res.status(201).json({ message: "Payment recorded" });
  }
};
