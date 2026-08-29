import { Router } from "express";
import { env } from "../config/env";
import { profileService } from "../linkedin/service";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    mode: env.MOCK_MODE ? "mock" : "live",
    linkedInCredentialsConfigured: profileService.configured,
    rateLimitPerWindow: env.RATE_LIMIT_MAX,
    corsOrigins: env.originsList.length > 0 ? env.originsList : ["*"],
    version: "2.0.0",
  });
});
