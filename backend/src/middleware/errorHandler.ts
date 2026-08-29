import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiError } from "../utils/apiError";
import { logger } from "../utils/logger";
import type { ErrorResponse } from "../types/profile";

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = randomUUID();
  const body: ErrorResponse = {
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: "No such endpoint.", requestId },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as Request & { id?: string }).id ?? randomUUID();

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ requestId, code: err.code, err: err.message }, "request_failed");
    } else {
      logger.info({ requestId, code: err.code }, "request_rejected");
    }
    const body: ErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message, requestId },
    };
    res.status(err.status).json(body);
    return;
  }

  logger.error({ requestId, err: err instanceof Error ? err.stack : String(err) }, "unhandled_error");
  const isDev = process.env.NODE_ENV === "development";
  const body: ErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isDev && err instanceof Error ? err.message : "Internal error.",
      requestId,
    },
  };
  res.status(500).json(body);
}
