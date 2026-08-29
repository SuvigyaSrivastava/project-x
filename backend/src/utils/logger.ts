import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.cookie", "req.headers['x-api-key']", "cookie", "LINKEDIN_COOKIE"],
    censor: "[redacted]",
  },
});
