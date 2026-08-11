import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { notFound } from "./middlewares/not-found.middleware.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);
