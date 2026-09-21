import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../shared/auth";
import { listCustomerOrdersQueryDto, listCustomersQueryDto } from "./customers.dto";
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
  },

  async listOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = listCustomerOrdersQueryDto.parse(req.query);
      const data = await customersService.listOrders(req.params.customerId, query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async markContacted(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await customersService.markContacted(req.params.customerId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
};
