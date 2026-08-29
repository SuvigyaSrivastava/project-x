import { Router } from "express";
import { z } from "zod";
import { extractPublicIdentifier } from "../linkedin/url";
import { profileService } from "../linkedin/service";
import { Errors } from "../utils/apiError";
import type { ProfileResponse } from "../types/profile";

export const profileRouter = Router();

const QuerySchema = z.object({
  url: z.string(),
  refresh: z
    .union([z.literal("true"), z.literal("false"), z.undefined()])
    .transform((v) => v === "true"),
});

async function handle(url: string | undefined, refresh: boolean, res: import("express").Response, next: import("express").NextFunction): Promise<void> {
  const startedAt = Date.now();
  try {
    if (!url) throw Errors.badRequest("`url` is required.");
    const publicIdentifier = extractPublicIdentifier(url);
    const { data, warnings, cached } = await profileService.lookup(publicIdentifier, refresh);

    const body: ProfileResponse = {
      success: true,
      meta: {
        source: process.env.MOCK_MODE === "true" ? "mock" : "linkedin",
        cached,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
      data,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}

profileRouter.get("/profile", async (req, res, next) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(Errors.badRequest("`url` is required."));
    return;
  }
  await handle(parsed.data.url, parsed.data.refresh, res, next);
});

profileRouter.post("/profile", async (req, res, next) => {
  const url = typeof req.body?.url === "string" ? req.body.url : undefined;
  const refresh = req.body?.refresh === true;
  await handle(url, refresh, res, next);
});
