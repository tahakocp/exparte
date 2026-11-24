import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RULES } from "../src/rules.js";

const dir = new URL("../../sources/", import.meta.url);

test("every rule quote appears verbatim in its pinned source", () => {
  for (const [key, rule] of Object.entries(RULES)) {
    const text = readFileSync(new URL(rule.file, dir), "utf8");
    assert.ok(text.includes(rule.quote), `${key}: quote not found in ${rule.file}: "${rule.quote.slice(0, 60)}..."`);
  }
});

test("source files match SHA256SUMS", () => {
  const sums = readFileSync(new URL("SHA256SUMS", dir), "utf8").trim().split("\n");
  for (const line of sums) {
    const [hash, name] = line.split(/\s+/);
    const got = createHash("sha256").update(readFileSync(new URL(name, dir))).digest("hex");
    assert.equal(got, hash, `${name} changed; re-pin it on purpose`);
  }
});
