import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesTargetRole, scoreJob } from "./profile-scoring.mjs";

const profile = JSON.parse(await readFile(new URL("../data/search-profile.json", import.meta.url), "utf8"));

test("scores a senior remote ASO role as a strong match", () => {
  const result = scoreJob({ title: "Senior ASO Manager", company: "Example", location: "Worldwide", mode: "remote", category: "aso" }, profile);
  assert.equal(result.fit, "Strong");
  assert.ok(result.score >= 70);
});

test("blocks excluded industries", () => {
  const result = scoreJob({ title: "ASO Manager", company: "Example Casino", location: "Remote", mode: "remote", category: "aso" }, profile);
  assert.equal(result.score, 0);
  assert.equal(result.excludedKeyword, "casino");
});

test("blocks known excluded companies when the role title is neutral", () => {
  const result = scoreJob({ title: "Senior Product Manager", company: "Product Madness", location: "Remote", mode: "remote" }, profile);
  assert.equal(result.score, 0);
  assert.equal(result.excludedKeyword, "company:Product Madness");
});

test("recognizes non-ASO target roles from the profile", () => {
  assert.equal(matchesTargetRole("Mobile Product Marketing Manager", profile), true);
  assert.equal(matchesTargetRole("Backend Engineer", profile), false);
});

test("supports an unrelated profession without hard-coded role mappings", () => {
  const genericProfile = {
    matchKeywords: ["data analyst", "sql"],
    seniorityKeywords: ["junior", "entry"],
    preferredModes: ["remote"],
    excludedKeywords: [],
    excludedCompanies: []
  };
  const result = scoreJob({ title: "Junior Data Analyst — SQL", company: "Example", location: "Remote", mode: "remote" }, genericProfile);
  assert.equal(result.fit, "Strong");
  assert.equal(matchesTargetRole("Junior Data Analyst", genericProfile), true);
});
