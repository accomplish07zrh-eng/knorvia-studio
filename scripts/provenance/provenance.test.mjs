// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BASELINE_COMMIT,
  classify,
  createIndexes,
  createReport,
  equivalentReports,
  fingerprint,
  serializeReport,
} from "./model.mjs";
import { git, readCurrentFiles, readRepositoryFile } from "./git.mjs";

const file = (path, content) => ({ path, kind: "file", ...fingerprint(Buffer.from(content)) });
const baseline = (files) => ({
  schemaVersion: 1,
  commit: BASELINE_COMMIT,
  files: files.map((entry) => ({ ...entry, blob: "a".repeat(40) })),
});
const review = (entry, decision = "original") => ({
  path: entry.path,
  normalizedSha256: entry.normalizedSha256,
  decision,
  license: "MIT",
  basis: "Independently authored from the functional spec",
  evidence: ["specs/knorvia-independent-implementation.md"],
});
const indexes = (files = [], reviews = [], copied = []) =>
  createIndexes(baseline(files), { schemaVersion: 1, files: reviews }, { copied });

test("newline normalization does not treat renaming or byte changes as original work", () => {
  const original = file("apps/zcode-cli/a.ts", "export const name = 'old';\n");
  const candidate = file("apps/cli/a.ts", "export const name = 'old';\r\n");
  assert.equal(classify(candidate, indexes([original])).classification, "upstream-unchanged");
  assert.equal(
    classify(file(candidate.path, "export const name = 'new';\n"), indexes([original]))
      .classification,
    "upstream-modified",
  );
  assert.equal(
    classify(file("elsewhere/copied.ts", "export const name = 'old';\n"), indexes([original]))
      .upstream.path,
    original.path,
  );
});

test("new paths require review; matching original-review digests grant only their exact file scope", () => {
  const entry = file("new.ts", "export const meaning = 42;");
  assert.equal(classify(entry, indexes()).classification, "unreviewed");
  assert.equal(classify(entry, indexes([], [review(entry)])).license, "MIT");
  const stale = classify(file(entry.path, "changed"), indexes([], [review(entry)]));
  assert.equal(stale.review.status, "stale");
  assert.equal(stale.license, "NOASSERTION");
});

test("unchanged upstream content cannot be claimed as an independently authored replacement", () => {
  const entry = file("a.ts", "upstream");
  const result = classify(entry, indexes([entry], [review(entry, "independent-replacement")]));
  assert.equal(result.review.status, "conflict");
  assert.equal(result.classification, "upstream-unchanged");
});

test("third-party scope remains separate from upstream relation and records stale license inventory bytes", () => {
  const entry = file("ui/button.ts", "modified mixed-source button");
  const copied = [
    {
      id: "ui-library",
      roots: ["ui"],
      files: [{ file: entry.path, sha256: "f".repeat(64) }],
      license: "MIT",
      scope: "Only upstream portions",
    },
  ];
  const result = classify(entry, indexes([file(entry.path, "old")], [], copied));
  assert.equal(result.classification, "upstream-modified");
  assert.equal(result.license, "NOASSERTION");
  assert.equal(result.thirdParty[0].scope, "Only upstream portions");
  assert.equal(result.thirdParty[0].recordedContentMatches, false);
});

test("invalid UTF-8 and NUL-containing input are fingerprinted as binary without lossy decoding", () => {
  const a = fingerprint(Buffer.from([0xff, 13, 10]));
  const b = fingerprint(Buffer.from([0xfe, 13, 10]));
  assert.equal(a.encoding, "binary");
  assert.equal(a.sha256, a.normalizedSha256);
  assert.notEqual(a.sha256, b.sha256);
  assert.equal(fingerprint(Buffer.from([0, 13, 10])).encoding, "binary");
});

test("malformed pins, traversal, duplicate and empty review evidence are rejected", () => {
  assert.throws(
    () => createIndexes({ ...baseline([]), commit: "other" }, { schemaVersion: 1, files: [] }, {}),
    /baseline/,
  );
  assert.throws(() => indexes([file("../escape", "a")]), /relative path/);
  const entry = review(file("a.ts", "test"));
  assert.throws(() => indexes([], [entry, entry]), /duplicate/);
  assert.throws(() => indexes([], [{ ...entry, evidence: [] }]), /review/);
});

test("report serialization round-trips, discloses self-hash exclusion and catches reviews of missing files", () => {
  const report = createReport(
    [file("a.ts", "a")],
    baseline([]),
    { schemaVersion: 1, files: [review(file("deleted.ts", "b"))] },
    {},
  );
  assert.deepEqual(JSON.parse(serializeReport(report)), report);
  assert.equal(report.summary.reviewProblems, 1);
  assert.deepEqual(report.summary.missingReviews, ["deleted.ts"]);
  assert.equal(report.files.at(-1).kind, "generated-report");
});

test("cross-platform inventory validation permits only newline normalization, not content or binary changes", () => {
  const report = (content) =>
    createReport([file("a.txt", content)], baseline([]), { schemaVersion: 1, files: [] }, {});
  assert.equal(equivalentReports(report("first\nsecond\n"), report("first\r\nsecond\r\n")), true);
  assert.equal(equivalentReports(report("first\n"), report("changed\n")), false);
  assert.equal(
    equivalentReports(report(Buffer.from([0, 13, 10])), report(Buffer.from([0, 10]))),
    false,
  );
});

test("real Git enumeration includes untracked sources, excludes ignored/deleted files and never follows a junction", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "knorvia-provenance-test-"));
  try {
    const root = join(fixture, "repo");
    const external = join(fixture, "outside");
    await mkdir(root);
    await mkdir(external);
    await git(root, ["init", "-q"]);
    await writeFile(join(root, ".gitignore"), "data/\n");
    await writeFile(join(root, "tracked.txt"), "safe");
    await writeFile(join(root, "removed.txt"), "removed");
    await git(root, ["add", "."]);
    await rm(join(root, "removed.txt"));
    await writeFile(join(root, "new.txt"), "new");
    await mkdir(join(root, "data"));
    await writeFile(join(root, "data", "private.txt"), "ignored");
    await writeFile(join(external, "outside.txt"), "must not be read");
    await symlink(external, join(root, "link"), process.platform === "win32" ? "junction" : "dir");
    const result = await readCurrentFiles(root);
    assert.deepEqual(
      result.map((entry) => entry.path),
      [".gitignore", "link", "new.txt", "tracked.txt"],
    );
    assert.equal(result.find((entry) => entry.path === "link").kind, "symlink");
    await assert.rejects(readRepositoryFile(root, "link/outside.txt"), /escapes repository/);
    assert.equal(await readFile(join(external, "outside.txt"), "utf8"), "must not be read");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
