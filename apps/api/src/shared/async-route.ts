import type { NextFunction, Request, Response } from "express";

/** Express 4 لا يلتقط رفض الوعود من المعالجات غير المتزامنة — مرّرها إلى error middleware. */
export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
