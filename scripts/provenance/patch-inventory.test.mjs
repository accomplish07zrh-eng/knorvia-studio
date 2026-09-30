// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLockedPatches, retainPatchUnion } from "./patch-inventory.mjs";

const hash = "a".repeat(64);
const record = { package: "@publisher/pkg@1.2.3", file: "patches/pkg.patch", sha256: hash };
const block = `patchedDependencies:\n  '@publisher/pkg@1.2.3':\n    hash: ${hash}\n    path: patches/pkg.patch\n`;

test("fixed lock patch records preserve exact scoped versions, hashes and paths across CRLF", () => {
  assert.deepEqual(parseLockedPatches(`lockfileVersion: '9.0'\n${block}importers:\n  .: {}\n`), [
    record,
  ]);
  assert.deepEqual(parseLockedPatches(block.replaceAll("\n", "\r\n")), [record]);
  assert.deepEqual(
    parseLockedPatches(
      block
        .replace("'@publisher/pkg@1.2.3'", '"@publisher/pkg@1.2.3"')
        .replace("path: patches/pkg.patch", 'path: "patches/pkg.patch"'),
    ),
    [record],
  );
});

test("absent or explicitly empty locked patches are valid empty sets", () => {
  assert.deepEqual(parseLockedPatches("lockfileVersion: '9.0'\nimporters:\n  .: {}\n"), []);
  assert.deepEqual(parseLockedPatches("patchedDependencies: {}\n"), []);
});

test("duplicate packages or section headers cannot silently overwrite patch records", () => {
  assert.throws(() => parseLockedPatches(`${block}${block}`), /duplicate.*section/i);
  assert.throws(
    () => parseLockedPatches(`${block}${block.split("\n").slice(1).join("\n")}`),
    /duplicate.*patch/i,
  );
});

test("unfamiliar fields, duplicate hashes and nested YAML structures require explicit review", () => {
  assert.throws(
    () => parseLockedPatches(block.replace("    hash:", "    unknown:")),
    /unsupported/i,
  );
  assert.throws(() => parseLockedPatches(`${block}    hash: ${hash}\n`), /duplicate/i);
  assert.throws(() => parseLockedPatches("patchedDependencies:\n  - unknown\n"), /unsupported/i);
  assert.throws(() => parseLockedPatches("patchedDependencies: {pkg: value}\n"), /unsupported/i);
  assert.throws(
    () => parseLockedPatches(`patchedDependencies: {}\n${block.split("\n").slice(1).join("\n")}`),
    /unsupported/i,
  );
});

test("patch versions must be pinned and paths cannot escape the repository", () => {
  assert.throws(
    () => parseLockedPatches(block.replace("pkg@1.2.3", "pkg@^1.2.3")),
    /exact.*version/i,
  );
  assert.throws(
    () => parseLockedPatches(block.replace("patches/pkg.patch", "../pkg.patch")),
    /path/i,
  );
  assert.throws(
    () => parseLockedPatches(block.replace("patches/pkg.patch", "C:\\outside.patch")),
    /path/i,
  );
  assert.throws(() => parseLockedPatches(block.replace(hash, "incomplete")), /digest/i);
});

test("a regenerated patch union retains inactive history and original provenance metadata", () => {
  const historical = {
    package: "old@0.1.0",
    file: "patches/old.patch",
    sha256: "b".repeat(64),
    source: "retained publisher reference",
  };
  const previous = { ...record, source: "original active publisher reference" };
  assert.deepEqual(retainPatchUnion([record], [historical, previous]), [historical, previous]);
  assert.throws(() => retainPatchUnion([], [previous, previous]), /duplicate.*retained/i);
});
