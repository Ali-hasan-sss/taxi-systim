import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { accountingRouter } from "./modules/accounting/accounting.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { usersRouter } from "./modules/users/users.routes";
import { driversRouter } from "./modules/drivers/drivers.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { publicRouter } from "./modules/public/public.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { promotionsRouter } from "./modules/promotions/promotions.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/public", publicRouter);
apiRouter.use("/drivers", driversRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/promotions", promotionsRouter);
apiRouter.use("/accounting", accountingRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/admin", adminRouter);
