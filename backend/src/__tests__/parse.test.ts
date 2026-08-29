import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMwliteHtml } from "../linkedin/parse";

const fixture = readFileSync(path.join(__dirname, "..", "..", "fixtures", "profile.html"), "utf-8");

function parseFixture() {
  return parseMwliteHtml(fixture, "ada-lovelace", "https://www.linkedin.com/in/ada-lovelace");
}

test("parses the name and headline", () => {
  const { data } = parseFixture();
  assert.equal(data.fullName, "Ada Lovelace");
  assert.equal(data.firstName, "Ada");
  assert.equal(data.lastName, "Lovelace");
  assert.match(data.headline ?? "", /Analytical Engine/);
});

test("splits location from the follower count sharing its element", () => {
  const { data } = parseFixture();
  assert.equal(data.followersCount, 12345);
  assert.match(data.location.full ?? "", /London Area, United Kingdom/);
  assert.equal(data.location.full?.includes("followers"), false);
});

test("resolves the CSS-drawn dot separator instead of leaving a run-on string", () => {
  const { data } = parseFixture();
  // The location line concatenates location text + dot-separator + a
  // follower-count span in the same element -- if the separator weren't
  // resolved first, the split logic would produce a run-on string.
  assert.match(data.location.full ?? "", /London Area, United Kingdom/);
  assert.equal(data.location.full?.includes("·"), false);
});

test("only accepts media.licdn.com as a real image, not the lazy placeholder", () => {
  const { data } = parseFixture();
  assert.ok(data.profilePicture);
  assert.match(data.profilePicture!.original, /media\.licdn\.com/);
  assert.doesNotMatch(data.profilePicture!.original, /static\.licdn\.com/);
});

test("parses all experience entries, not just the most recent", () => {
  const { data } = parseFixture();
  assert.equal(data.experience.length, 2);
  assert.equal(data.experience[1]?.title, "Collaborator");
});

test("parses a current role as isCurrent with no end date", () => {
  const { data } = parseFixture();
  const current = data.experience[0]!;
  assert.equal(current.dateRange?.isCurrent, true);
  assert.equal(current.dateRange?.end, null);
  assert.equal(current.dateRange?.start?.year, 1843);
});

test("parses education and skills", () => {
  const { data } = parseFixture();
  assert.equal(data.education.length, 1);
  assert.equal(data.education[0]?.schoolName, "Private tutoring under Mary Somerville");
  assert.equal(data.skills.length, 3);
  assert.equal(data.skills[0]?.name, "Analytical Engines");
});

test("certifications/languages/projects are unconfirmed selectors -- degrade to [] rather than guess", () => {
  const { data } = parseFixture();
  // Not present in the fixture (matching the one live capture this parser
  // was verified against, which also had none) -- see parse.ts docstring.
  assert.deepEqual(data.certifications, []);
  assert.deepEqual(data.languages, []);
  assert.deepEqual(data.projects, []);
});

test("fields absent from the fixture degrade to null/[] rather than throwing", () => {
  const { data } = parseFixture();
  assert.equal(data.industry, null);
  assert.equal(data.profileId, null);
  assert.equal(data.contactInfo, null);
  assert.deepEqual(data.honors, []);
  assert.deepEqual(data.patents, []);
});

test("a page with no profile content produces warnings but does not throw", () => {
  const { data, warnings } = parseMwliteHtml("<html><body><p>not a profile</p></body></html>", "nobody", "https://www.linkedin.com/in/nobody");
  assert.equal(data.fullName, null);
  assert.ok(warnings.length > 0);
});

test("resolves the page's own identity from its canonical link", () => {
  const html = `<html><head><link rel="canonical" href="https://www.linkedin.com/in/ada-lovelace/"></head><body><h1>Ada Lovelace</h1></body></html>`;
  const { resolvedIdentifier } = parseMwliteHtml(html, "ada-lovelace", "https://www.linkedin.com/in/ada-lovelace");
  assert.equal(resolvedIdentifier, "ada-lovelace");
});

test("resolves identity from og:url when there's no canonical link", () => {
  const html = `<html><head><meta property="og:url" content="https://www.linkedin.com/in/ada-lovelace"></head><body><h1>Ada Lovelace</h1></body></html>`;
  const { resolvedIdentifier } = parseMwliteHtml(html, "ada-lovelace", "https://www.linkedin.com/in/ada-lovelace");
  assert.equal(resolvedIdentifier, "ada-lovelace");
});

test("resolvedIdentifier is null, with a warning, when neither tag is present", () => {
  const html = `<html><body><h1>No Canonical Tag</h1></body></html>`;
  const { resolvedIdentifier, warnings } = parseMwliteHtml(html, "someone", "https://www.linkedin.com/in/someone");
  assert.equal(resolvedIdentifier, null);
  assert.ok(warnings.some((w) => w.includes("identity check skipped")));
});

test("the bundled fixture resolves its own canonical identity", () => {
  const { resolvedIdentifier } = parseFixture();
  assert.equal(resolvedIdentifier, "ada-lovelace");
});
