import type { NextFunction, Request, Response } from "express";
import { authService } from "./auth.service";
import { adminLoginDto, coordinatorLoginDto, loginDto, refreshDto } from "./auth.dto";
import type { AuthRequest } from "../../shared/auth";

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginDto.parse(req.body);
      const result = await authService.login(input.phone, input.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async adminLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const input = adminLoginDto.parse(req.body);
      const result = await authService.adminLogin(input.email, input.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async coordinatorLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const input = coordinatorLoginDto.parse(req.body);
      const result = await authService.coordinatorLogin(input.phone, input.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const input = refreshDto.parse(req.body);
      const result = await authService.refresh(input.refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await authService.me(req.auth!.userId);
      res.json(user);
    } catch (err) {
      next(err);
    }
  },

  async coordinatorMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await authService.coordinatorMe(req.auth!.userId);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
};
