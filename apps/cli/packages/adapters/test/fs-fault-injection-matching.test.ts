// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  check,
  environment,
  errorOf,
  fresh,
  rule,
  type Operation,
} from "./fs-fault-injection.fixture.js";

const operations: Operation[] = [
  "appendFile",
  "any",
  "mkdir",
  "rename",
  "rm",
  "sqliteOpen",
  "sqliteRun",
  "writeFile",
];
test("every named operation is accepted, while exact non-any filters exclude other operations", async (t) => {
  environment(t, "[]", "test");
  for (const operation of operations) {
    process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([
      rule({ operations: [operation], maxMatches: 0 }),
    ]);
    const port = await fresh();
    for (const candidate of operations) {
      if (operation === "any" || operation === candidate) {
        assert.equal(errorOf(() => check(port, candidate)).syscall, candidate);
      } else assert.equal(check(port, candidate), undefined);
    }
  }
});

test("finite ordered rules consume only matching throws and advance after exhaustion", async (t) => {
  environment(
    t,
    JSON.stringify([
      rule({ id: "first", operations: ["rename", "rename"], pathEndsWith: ".json", maxMatches: 2 }),
      rule({ id: "second", operations: ["rename"], pathEndsWith: ".json" }),
    ]),
    "test",
  );
  const port = await fresh();
  assert.equal(check(port, "writeFile", "one.json"), undefined);
  assert.equal(check(port, "rename", "one.txt"), undefined);
  assert.equal(errorOf(() => check(port, "rename", "one.json")).knorviaFsFaultId, "first");
  assert.equal(errorOf(() => check(port, "rename", "two.json")).knorviaFsFaultId, "first");
  assert.equal(errorOf(() => check(port, "rename", "three.json")).knorviaFsFaultId, "second");
  assert.equal(check(port, "rename", "four.json"), undefined);
});

test("zero is unlimited and an earlier unlimited rule keeps priority", async (t) => {
  environment(t, JSON.stringify([rule({ maxMatches: 0 }), rule({ id: "later" })]), "test");
  const port = await fresh();
  for (let i = 0; i < 20; i++)
    assert.equal(errorOf(() => check(port)).knorviaFsFaultId, "fixture-rule");
});

test("path filters normalize separators, AND predicates and preserve case and literal traversal", async (t) => {
  environment(
    t,
    JSON.stringify([
      rule({
        pathIncludes: "A\\child",
        pathEndsWith: "leaf\\out.json",
        pathRegex: "^A/child/",
        maxMatches: 0,
      }),
    ]),
    "test",
  );
  const port = await fresh();
  assert.equal(check(port, "writeFile", "A/child/leaf/out.txt"), undefined);
  assert.equal(check(port, "writeFile", "a/child/leaf/out.json"), undefined);
  assert.equal(check(port, "writeFile", "prefix/A/child/leaf/out.json"), undefined);
  assert.equal(
    errorOf(() => check(port, "writeFile", "A\\child\\leaf\\out.json")).path,
    "A\\child\\leaf\\out.json",
  );
  assert.equal(errorOf(() => check(port, "writeFile", "A/child/../leaf/out.json")).code, "EACCES");
});

test("empty literals and empty regex match and unknown configuration fields are ignored", async (t) => {
  environment(
    t,
    JSON.stringify([
      rule({
        pathIncludes: "",
        pathEndsWith: "",
        pathRegex: "",
        ignored: { anything: true },
        maxMatches: 0,
      }),
    ]),
    "test",
  );
  const port = await fresh();
  assert.equal(errorOf(() => check(port, "any", "")).code, "EACCES");
  assert.equal(errorOf(() => check(port, "mkdir", "unchanged")).code, "EACCES");
});

test("regex source retains escapes while the input uses normalized slashes", async (t) => {
  environment(
    t,
    JSON.stringify([rule({ pathRegex: String.raw`^\w+/item\.json$`, maxMatches: 0 })]),
    "test",
  );
  const port = await fresh();
  assert.equal(errorOf(() => check(port, "writeFile", "root\\item.json")).code, "EACCES");
  assert.equal(errorOf(() => check(port, "writeFile", "root/item.json")).code, "EACCES");
  assert.equal(check(port, "writeFile", "root/itemXjson"), undefined);
});

test("injected errors preserve exact message and original path with ordinary own fields", async (t) => {
  environment(t, JSON.stringify([rule({ id: " id ", code: " EROFS ", maxMatches: 0 })]), "test");
  const port = await fresh();
  const error = errorOf(() => check(port, "rename", "A\\B"));
  assert.equal(error.constructor, Error);
  assert.equal(error.message, "Injected fs fault EROFS for rename: A\\B");
  assert.deepEqual(Object.keys(error), ["code", "path", "syscall", "knorviaFsFaultId"]);
  assert.equal(error.code, "EROFS");
  assert.equal(error.path, "A\\B");
  assert.equal(error.syscall, "rename");
  assert.equal(error.knorviaFsFaultId, "id");
  assert.equal(Object.hasOwn(error, "cause"), false);
  for (const key of Object.keys(error)) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    assert.equal(descriptor?.writable, true);
    assert.equal(descriptor?.enumerable, true);
    assert.equal(descriptor?.configurable, true);
  }
});

for (const message of ["", " \n exact message \t "]) {
  test(`configured message is not trimmed or replaced: ${JSON.stringify(message)}`, async (t) => {
    environment(t, JSON.stringify([rule({ message })]), "test");
    const port = await fresh();
    assert.equal(errorOf(() => check(port)).message, message);
  });
}

test("operation mismatch and exhausted rules skip path access; a matching rule does not add validation", async (t) => {
  environment(t, JSON.stringify([rule({ operations: ["rename"] })]), "test");
  const port = await fresh();
  const missingPath = { operation: "writeFile" } as Parameters<
    typeof port.maybeThrowStorageFsFault
  >[0];
  assert.equal(port.maybeThrowStorageFsFault(missingPath), undefined);
  missingPath.operation = "rename";
  assert.equal(errorOf(() => port.maybeThrowStorageFsFault(missingPath)).constructor, TypeError);
  assert.equal(
    errorOf(() => check(port, "rename")).code,
    "EACCES",
    "invalid path did not consume the rule",
  );
  assert.equal(port.maybeThrowStorageFsFault(missingPath), undefined);
});
