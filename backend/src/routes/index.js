import { Router } from "express";
import { accountRouter } from "./account.routes.js";
import { authRouter } from "./auth.routes.js";
import { categoryRouter } from "./category.routes.js";
import { transactionRouter, transferRouter } from "./transaction.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/accounts", accountRouter);
apiRouter.use("/categories", categoryRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/transfers", transferRouter);
