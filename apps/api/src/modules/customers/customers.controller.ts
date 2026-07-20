import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../shared/auth";
import { listCustomersQueryDto } from "./customers.dto";
import { customersService } from "./customers.service";

export const customersController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = listCustomersQueryDto.parse(req.query);
      const data = await customersService.list(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};
