/**
 * Architecture test: fails the build if a browser-automation dependency
 * sneaks into package.json. This project's stated boundary is "no CAPTCHA
 * bypass, no browser automation to evade detection" -- a puppeteer/
 * playwright/selenium dependency showing up would be a silent violation of
 * that, not just a style nit, so it's enforced here rather than trusted to
 * code review alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const BANNED = ["puppeteer", "playwright", "selenium-webdriver", "webdriverio", "nightmare", "phantomjs"];

test("no browser-automation dependency is present in package.json", () => {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = BANNED.filter((name) => name in allDeps);
  assert.deepEqual(found, [], `Browser automation dependency found: ${found.join(", ")} -- this project fetches HTML directly, it doesn't drive a browser.`);
});

test("no browser-automation package is referenced in source", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const srcDir = path.join(__dirname, "..");
  const offenders: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts")) {
        const content = fs.readFileSync(full, "utf-8");
        for (const name of BANNED) {
          if (content.includes(`from "${name}"`) || content.includes(`require("${name}")`)) {
            offenders.push(`${full}: ${name}`);
          }
        }
      }
    }
  }
  walk(srcDir);
  assert.deepEqual(offenders, []);
});
