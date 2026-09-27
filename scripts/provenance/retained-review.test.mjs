// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  BASELINE_COMMIT,
  REPORT_PATH,
  classify,
  createIndexes,
  createReport,
  equivalentReports,
  fingerprint,
  serializeReport,
} from "./model.mjs";

const file = (path, text) => ({ path, kind: "file", ...fingerprint(Buffer.from(text)) });
const baseline = (files) => ({
  schemaVersion: 1,
  commit: BASELINE_COMMIT,
  files: files.map((entry) => ({ ...entry, blob: "a".repeat(40) })),
});
const retained = (entry, nature = "functional-configuration") => ({
  path: entry.path,
  normalizedSha256: entry.normalizedSha256,
  decision: "reviewed-retained",
  nature,
  license: "NOASSERTION",
  basis: "Functional or standard text retained; no authorship or license grant inferred.",
  evidence: ["specs/knorvia-independent-implementation.md"],
});
const indexes = (files = [], reviews = [], copied = []) =>
  createIndexes(baseline(files), { schemaVersion: 1, files: reviews }, { copied });
const report = (files, reviews, upstream = []) =>
  createReport(files, baseline(upstream), { schemaVersion: 1, files: reviews }, {});

test("retained configuration preserves upstream identity, classification and third-party scope", () => {
  const entry = file("config.json", '{"strict":true}\n');
  const copied = [{ id: "fixture", roots: [entry.path], license: "MIT", scope: "partial only" }];
  const unreviewed = classify(entry, indexes([entry], [], copied));
  const reviewed = classify(entry, indexes([entry], [retained(entry)], copied));
  assert.equal(reviewed.classification, "upstream-unchanged");
  assert.equal(reviewed.license, "NOASSERTION");
  assert.equal(reviewed.defaultLicense, unreviewed.defaultLicense);
  assert.deepEqual(reviewed.upstream, unreviewed.upstream);
  assert.deepEqual(reviewed.thirdParty, unreviewed.thirdParty);
  assert.equal(reviewed.review.status, "accepted");
  assert.equal(reviewed.review.nature, "functional-configuration");
});

test("modified configuration keeps its upstream relation after nature review", () => {
  const entry = file("package.json", '{"name":"new","exports":"./src/index.js"}');
  const source = file(entry.path, '{"name":"old","exports":"./src/index.js"}');
  const reviewed = classify(entry, indexes([source], [retained(entry)]));
  assert.equal(reviewed.classification, "upstream-modified");
  assert.equal(reviewed.upstream.path, source.path);
  assert.equal(reviewed.upstream.relation, "modified");
  assert.equal(reviewed.license, "NOASSERTION");
});

test("unmatched standard license text is reviewed but never counted as original or MIT-granted", () => {
  const entry = file("docs/LICENSE.txt", "Standard license text fixture\n");
  const result = report([entry], [retained(entry, "standard-license-text")]);
  const reviewed = result.files.find((item) => item.path === entry.path);
  assert.equal(reviewed.classification, "reviewed-retained");
  assert.equal(reviewed.upstream, null);
  assert.equal(reviewed.license, "NOASSERTION");
  assert.equal(result.summary.classifications.original, undefined);
  assert.equal(result.summary.classifications["independent-replacement"], undefined);
  assert.deepEqual(result.summary.reviewedNatures, { "standard-license-text": 1 });
});

test("nature statistics are separate overlapping facts, excluding stale and missing records", () => {
  const entry = file("config.json", "{}");
  const old = file("stale.txt", "before");
  const changed = file(old.path, "after");
  const missing = file("removed.json", "removed");
  const result = report(
    [entry, changed],
    [retained(entry), retained(old, "standard-license-text"), retained(missing)],
    [entry],
  );
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.classifications["upstream-unchanged"], 1);
  assert.deepEqual(result.summary.reviewedNatures, { "functional-configuration": 1 });
  assert.equal(result.summary.reviewProblems, 2);
  assert.deepEqual(result.summary.missingReviews, [missing.path]);
  const stale = result.files.find((item) => item.path === changed.path);
  assert.equal(stale.review.status, "stale");
  assert.equal(stale.review.nature, "standard-license-text");
  assert.equal(stale.classification, "unreviewed");
  assert.equal(stale.license, "NOASSERTION");
});

test("nature review rejects authorizing licenses, absent/unknown natures and empty evidence", () => {
  const entry = retained(file("a.json", "{}"));
  const invalid = [
    { license: "MIT" },
    { license: "Apache-2.0" },
    { nature: undefined },
    { nature: "source-code" },
    { nature: "" },
    { nature: null },
    { nature: [] },
    { basis: " " },
    { evidence: [] },
    { evidence: [" "] },
    { evidence: [false] },
  ];
  for (const override of invalid)
    assert.throws(() => indexes([], [{ ...entry, ...override }]), /provenance review/);
  assert.throws(() => indexes([], [entry, entry]), /duplicate/);
});

test("authoring/third-party decisions cannot hide behind a nature label; old conflict guards remain", () => {
  const entry = file("copied.txt", "same");
  for (const decision of ["original", "independent-replacement", "third-party"]) {
    assert.throws(
      () => indexes([entry], [{ ...retained(entry), decision, license: "MIT" }]),
      /provenance review/,
    );
  }
  for (const decision of ["original", "independent-replacement"]) {
    const { nature: _nature, ...review } = retained(entry);
    const result = classify(entry, indexes([entry], [{ ...review, decision, license: "MIT" }]));
    assert.equal(result.review.status, "conflict");
    assert.equal(result.classification, "upstream-unchanged");
    assert.equal(result.license, "NOASSERTION");
  }
});

test("retained report round-trips, excludes self-hash and permits CRLF only", () => {
  const lf = file("settings.txt", "one\ntwo\n");
  const crlf = file(lf.path, "one\r\ntwo\r\n");
  const left = report([lf], [retained(lf)]);
  assert.deepEqual(JSON.parse(serializeReport(left)), left);
  assert.equal(equivalentReports(left, report([crlf], [retained(lf)])), true);
  assert.equal(left.files.find((entry) => entry.path === REPORT_PATH).sha256, undefined);
  const modified = report([file(lf.path, "changed")], [retained(lf)]);
  assert.equal(equivalentReports(left, modified), false);
  const nature = report([lf], [retained(lf, "standard-license-text")]);
  assert.equal(equivalentReports(left, nature), false);
  const evidence = report([lf], [{ ...retained(lf), evidence: ["different-evidence"] }]);
  assert.equal(equivalentReports(left, evidence), false);
});

test("verified host manifest rename preserves a modified upstream link without guessing other aliases", () => {
  const oldPath = "apps/zcode-cli/packages/node-repl-host/.zcode-plugin/plugin.json";
  const newPath = "apps/cli/packages/node-repl-host/.knorvia-plugin/plugin.json";
  const source = file(oldPath, '{"name":"node-repl-host","version":"0.6.0"}');
  const entry = file(newPath, '{"name":"node-repl-host","version":"0.8.0"}');
  const result = classify(entry, indexes([source], [retained(entry)]));
  assert.equal(result.classification, "upstream-modified");
  assert.equal(result.upstream.path, oldPath);
  assert.equal(result.upstream.blob, "a".repeat(40));
  assert.equal(result.upstream.normalizedSha256, source.normalizedSha256);
  const unknown = file("other/.knorvia-plugin/plugin.json", entry.normalizedSha256);
  const otherSource = file("other/.zcode-plugin/plugin.json", "different");
  assert.equal(classify(unknown, indexes([otherSource])).classification, "unreviewed");
});

test("verified rename refuses ambiguous baseline aliases and still recognizes byte-identical copies", () => {
  const oldPath = "apps/zcode-cli/packages/node-repl-host/.zcode-plugin/plugin.json";
  const newPath = "apps/cli/packages/node-repl-host/.knorvia-plugin/plugin.json";
  const source = file(oldPath, '{"name":"fixture"}');
  const entry = file(newPath, '{"name":"fixture"}');
  const result = classify(entry, indexes([source], [retained(entry)]));
  assert.equal(result.classification, "upstream-unchanged");
  assert.deepEqual(result.upstream.contentMatchedPaths, [oldPath]);
  assert.throws(() => indexes([source, file(newPath, "different")]), /duplicate baseline/);
});

test("verified alias retains third-party reference matching at its original declared path", () => {
  const oldPath = "apps/zcode-cli/packages/node-repl-host/.zcode-plugin/plugin.json";
  const newPath = "apps/cli/packages/node-repl-host/.knorvia-plugin/plugin.json";
  const entry = file(newPath, '{"name":"fixture"}');
  const copied = [
    {
      id: "manifest-fixture",
      license: "MIT",
      scope: "Fixture reference, not a whole-package authorship claim",
      files: [{ file: oldPath, sha256: entry.normalizedSha256 }],
    },
  ];
  const result = classify(entry, indexes([], [retained(entry)], copied));
  assert.equal(result.thirdParty.length, 1);
  assert.equal(result.thirdParty[0].id, "manifest-fixture");
  assert.equal(result.thirdParty[0].recordedContentMatches, true);
  assert.equal(result.license, "NOASSERTION");
});
