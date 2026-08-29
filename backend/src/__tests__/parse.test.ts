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
  // The headline/subtitle text should not contain the raw run-on that a
  // literal `.dot-separator` (empty in the DOM) would otherwise produce.
  const exp = data.experience[0];
  assert.ok(exp);
  assert.match(exp.companyName ?? "", /Analytical Engine Project/);
  assert.equal(exp.employmentType, "Full-time");
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

test("parses education, skills, certifications, languages, and projects", () => {
  const { data } = parseFixture();
  assert.equal(data.education.length, 1);
  assert.equal(data.education[0]?.schoolName, "Private tutoring under Mary Somerville");
  assert.equal(data.skills.length, 3);
  assert.equal(data.skills[0]?.name, "Analytical Engines");
  assert.equal(data.certifications.length, 1);
  assert.equal(data.languages.length, 2);
  assert.equal(data.languages[1]?.name, "French");
  assert.equal(data.projects.length, 1);
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
