import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.MOCK_MODE = "true";
process.env.API_KEY = "";
process.env.RATE_LIMIT_MAX = "0";

// Imported after env vars are set, since config/env.ts reads process.env at import time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../app") as typeof import("../app");

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("GET /api/health returns ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, "ok");
  assert.equal(body.mode, "mock");
});

test("GET /api/profile returns mock profile data", async () => {
  const res = await fetch(`${baseUrl}/api/profile?url=${encodeURIComponent("https://www.linkedin.com/in/ada-lovelace")}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.fullName, "Ada Lovelace");
  assert.equal(body.meta.source, "mock");
});

test("POST /api/profile works the same as GET", async () => {
  const res = await fetch(`${baseUrl}/api/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://www.linkedin.com/in/ada-lovelace" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.fullName, "Ada Lovelace");
});

test("GET /api/profile with missing url returns 400 BAD_REQUEST", async () => {
  const res = await fetch(`${baseUrl}/api/profile`);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("GET /api/profile with a company URL returns 400 BAD_REQUEST", async () => {
  const res = await fetch(`${baseUrl}/api/profile?url=${encodeURIComponent("https://www.linkedin.com/company/microsoft")}`);
  assert.equal(res.status, 400);
});

test("unknown route returns 404 ROUTE_NOT_FOUND with the standard envelope", async () => {
  const res = await fetch(`${baseUrl}/api/nope`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "ROUTE_NOT_FOUND");
  assert.ok(body.error.requestId);
});

test("requesting a different slug than the page's own canonical identity is rejected, not silently returned", async () => {
  // The bundled fixture's canonical link resolves to 'ada-lovelace'.
  // Requesting a different slug against it (MOCK_MODE always serves the
  // same fixture) must be rejected rather than silently handed back as if
  // it were the right person's data.
  const res = await fetch(`${baseUrl}/api/profile?url=${encodeURIComponent("https://www.linkedin.com/in/someone-else")}&refresh=true`);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "LINKEDIN_ERROR");
  assert.match(body.error.message, /[Ii]dentity check failed/);
});

test("repeated calls for the same profile are served from cache", async () => {
  const first = await fetch(`${baseUrl}/api/profile?url=${encodeURIComponent("https://www.linkedin.com/in/ada-lovelace")}&refresh=true`);
  const firstBody = await first.json();
  const second = await fetch(`${baseUrl}/api/profile?url=${encodeURIComponent("https://www.linkedin.com/in/ada-lovelace")}`);
  const secondBody = await second.json();
  assert.equal(firstBody.meta.cached, false);
  assert.equal(secondBody.meta.cached, true);
});
