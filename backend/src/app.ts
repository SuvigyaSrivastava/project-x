import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { env } from "./config/env";
import { healthRouter } from "./routes/health";
import { profileRouter } from "./routes/profile";
import { apiKeyAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { Errors } from "./utils/apiError";
import { logger } from "./utils/logger";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.originsList.includes("*") ? "*" : env.originsList,
    })
  );
  app.use(express.json({ limit: "16kb" }));

  app.use((req, _res, next) => {
    (req as express.Request & { id: string }).id = randomUUID();
    next();
  });

  // Per-IP limit on callers of this API. Separate from the outbound
  // LinkedIn-call pacing in ProfileService/TokenBucket -- two different
  // things being paced for two different reasons shouldn't share one knob.
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.RATE_LIMIT_MAX === 0,
    handler: (_req, _res, next) => next(Errors.rateLimited()),
  });

  // Health check: no rate limit, no API key -- it's a liveness probe.
  app.use("/api", healthRouter);
  app.use("/api", limiter, apiKeyAuth, profileRouter);

  app.use((req, _res, next) => {
    next(Errors.routeNotFound());
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info({ mockMode: env.MOCK_MODE, port: env.PORT }, "app_created");
  return app;
}
