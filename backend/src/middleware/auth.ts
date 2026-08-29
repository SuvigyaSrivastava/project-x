import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { Errors } from "../utils/apiError";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }
  const header = req.header("x-api-key");
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header ?? bearer;

  if (!provided || !constantTimeEqual(provided, env.API_KEY)) {
    next(Errors.unauthorized());
    return;
  }
  next();
}
