import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { accountingRouter } from "./modules/accounting/accounting.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { usersRouter } from "./modules/users/users.routes";
import { driversRouter } from "./modules/drivers/drivers.routes";
import { chatRouter } from "./modules/chat/chat.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/drivers", driversRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/accounting", accountingRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/chat", chatRouter);
