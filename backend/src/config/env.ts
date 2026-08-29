/**
 * Environment loaded once at process start, validated with zod so bad
 * config fails at startup with a readable message instead of at the first
 * request.
 */
import { z } from "zod";

const boolFromString = z
  .union([z.literal("true"), z.literal("false"), z.undefined()])
  .transform((v) => v === "true");

const EnvSchema = z.object({
  LINKEDIN_COOKIE: z.string().optional(),
  LINKEDIN_LI_AT: z.string().optional(),
  LINKEDIN_JSESSIONID: z.string().optional(),
  MOCK_MODE: boolFromString.default("false"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default("*"),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(900),
  CACHE_STALE_SECONDS: z.coerce.number().int().nonnegative().default(3600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(20),
  LINKEDIN_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(1200),
  LINKEDIN_BURST: z.coerce.number().int().positive().default(2),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_RESET_SECONDS: z.coerce.number().int().positive().default(30),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  LOG_LEVEL: z.string().default("info"),
  SERVICE_NAME: z.string().default("linkedin-profile-api"),
});

export type Env = z.infer<typeof EnvSchema> & { originsList: string[] };

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:\n" + parsed.error.toString());
    process.exit(1);
  }
  const env = parsed.data;

  if (!env.MOCK_MODE && !env.LINKEDIN_COOKIE && !(env.LINKEDIN_LI_AT && env.LINKEDIN_JSESSIONID)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] No LINKEDIN_COOKIE (or LI_AT+JSESSIONID) set and MOCK_MODE is off -- " +
        "the API will start but every /api/profile call will return 503 NOT_CONFIGURED."
    );
  }

  const originsList = env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return { ...env, originsList };
}

export const env: Env = loadEnv(process.env);
