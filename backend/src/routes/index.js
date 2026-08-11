import { Router } from "express";
import { accountRouter } from "./account.routes.js";
import { authRouter } from "./auth.routes.js";
import { categoryRouter } from "./category.routes.js";
import { cardRouter, invoiceRouter, purchaseRouter } from "./card.routes.js";
import { transactionRouter, transferRouter } from "./transaction.routes.js";
import { recurrenceRouter, subscriptionRouter } from "./recurrence.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/accounts", accountRouter);
apiRouter.use("/categories", categoryRouter);
apiRouter.use("/cards", cardRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/card-purchases", purchaseRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/transfers", transferRouter);
apiRouter.use("/recurrences", recurrenceRouter);
apiRouter.use("/subscriptions", subscriptionRouter);
apiRouter.use("/dashboard", dashboardRouter);
