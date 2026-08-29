import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPublicIdentifier } from "../linkedin/url";

test("accepts a standard profile URL", () => {
  assert.equal(extractPublicIdentifier("https://www.linkedin.com/in/williamhgates"), "williamhgates");
});

test("accepts a trailing slash", () => {
  assert.equal(extractPublicIdentifier("https://www.linkedin.com/in/williamhgates/"), "williamhgates");
});

test("accepts a regional subdomain", () => {
  assert.equal(extractPublicIdentifier("https://in.linkedin.com/in/williamhgates"), "williamhgates");
});

test("accepts a bare host with query param", () => {
  assert.equal(
    extractPublicIdentifier("linkedin.com/in/williamhgates?originalSubdomain=in"),
    "williamhgates"
  );
});

test("accepts a sub-path after the slug", () => {
  assert.equal(
    extractPublicIdentifier("https://www.linkedin.com/in/williamhgates/details/experience/"),
    "williamhgates"
  );
});

test("accepts a percent-encoded name and re-encodes it", () => {
  const result = extractPublicIdentifier("https://www.linkedin.com/in/%C3%A9lodie-martin");
  assert.equal(decodeURIComponent(result), "élodie-martin");
});

test("accepts a bare slug with no URL wrapper", () => {
  assert.equal(extractPublicIdentifier("williamhgates"), "williamhgates");
});

test("rejects a company URL", () => {
  assert.throws(() => extractPublicIdentifier("https://www.linkedin.com/company/microsoft"), /BAD_REQUEST|url/i);
});

test("rejects a non-LinkedIn host", () => {
  assert.throws(() => extractPublicIdentifier("https://evil.example.com/in/williamhgates"));
});

test("rejects path traversal in the slug", () => {
  assert.throws(() => extractPublicIdentifier("https://www.linkedin.com/in/..%2f..%2fetc%2fpasswd"));
});

test("rejects an empty url", () => {
  assert.throws(() => extractPublicIdentifier(""));
});

test("rejects a url over 500 chars", () => {
  assert.throws(() => extractPublicIdentifier("https://www.linkedin.com/in/" + "a".repeat(600)));
});
