export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

export const Errors = {
  badRequest: (message: string) => new ApiError(400, "BAD_REQUEST", message),
  unauthorized: (message = "Missing or invalid API key.") => new ApiError(401, "UNAUTHORIZED", message),
  profileNotFound: (message = "No such profile, or not visible to the logged-in account.") =>
    new ApiError(404, "PROFILE_NOT_FOUND", message),
  routeNotFound: () => new ApiError(404, "ROUTE_NOT_FOUND", "No such endpoint."),
  rateLimited: (message = "You hit this API's per-IP limit.") => new ApiError(429, "RATE_LIMITED", message),
  linkedInRateLimited: (message = "LinkedIn is throttling this account. Back off.") =>
    new ApiError(429, "LINKEDIN_RATE_LIMITED", message),
  linkedInError: (message: string) => new ApiError(502, "LINKEDIN_ERROR", message),
  notConfigured: (message = "No LinkedIn credentials configured and MOCK_MODE is off.") =>
    new ApiError(503, "NOT_CONFIGURED", message),
  circuitOpen: (message = "Too many recent auth-shaped failures -- pausing calls to LinkedIn to avoid making it worse.") =>
    new ApiError(503, "UPSTREAM_UNAVAILABLE", message),
  internal: (message = "Internal error.") => new ApiError(500, "INTERNAL_ERROR", message),
};
