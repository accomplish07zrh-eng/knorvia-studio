import assert from "node:assert/strict";
import { test } from "node:test";
import { numstatParserFixture } from "./git-numstat-parser-fixture-fast-20261001.js";
const f = await numstatParserFixture();
const compare = (stdout: string) =>
  assert.deepEqual(f.parseNumstat(stdout), f.legacyNumstat(stdout));
for (const value of [
  "-",
  "",
  "0",
  "01",
  "-2",
  "+3",
  " 4x",
  "2.7",
  "0x20",
  "Infinity",
  "NaN",
  "文",
  "9".repeat(400),
])
  test(`numeric compatibility ${JSON.stringify(value)}`, () => {
    compare(`${value}\t0\towned\0`);
    compare(`0\t${value}\towned\0`);
  });
for (const path of [
  "",
  " ",
  "two spaces.txt",
  " leading",
  "trailing ",
  "C:\\owned\\文",
  "中文😀",
  "a\tb",
  "a\nb",
  "a\r\nb",
  "a\u2028b",
  "a\u2029b",
  "\t",
  "-option",
  "../owned",
])
  test(`numstat path ${JSON.stringify(path)}`, () => compare(`3\t1\t${path}\0old\0new\0`));
for (const stdout of [
  "",
  "\0\0",
  "garbage",
  "1\tpath",
  "1\t2\t",
  "1\t2\t\0old",
  "1\t2\t\0\0new",
  "1\t2\t\0old\0",
  "1\t2\t\0\0\0? next",
  "1\t2\t\0old\0new\0",
  "1\t2\t\0\0new\0",
  "1\t2\t\0old\0new\0old\0",
  "1\t2\t\0old\0new\0\0\0",
  "1\t2\t\0old\0bad\tdata\0",
  "1\t2\t\0old\0# header\0",
  "1\t2\tfirst\n4\t5\tsecond\n",
  "\t\towned\0",
  "1\t2\tpath\t\0",
])
  test(`raw record consumption ${JSON.stringify(stdout)}`, () => compare(stdout));
test("literal normalized duplicate order, property presence, kinds and rename tails", () => {
  const out = f.parseNumstat("3\t0\tb\0-\t-\ta\0\t\t\0\0c\0 7x\t-2\tb\0");
  assert.deepEqual([...out.keys()], ["b", "a", "c"]);
  assert.deepEqual(out.get("b"), { added: 7, removed: -2 });
  assert.deepEqual(out.get("a"), { added: 0, removed: 0 });
  assert.deepEqual(out.get("c"), { added: 0, removed: 0, kind: "renamed", originalPath: "" });
  assert.deepEqual(Object.keys(out.get("c")!), ["added", "removed", "kind", "originalPath"]);
  assert.equal(f.inferKind(out.get("a")!), "modified");
  assert.equal(f.inferKind(out.get("c")!), "renamed");
  const collisions = f.parseNumstat("1\t0\ta\\b\0-\t-\tz\0\t\t\0old\0a/b\0");
  assert.deepEqual([...collisions.keys()], ["a/b", "z"]);
  assert.deepEqual(collisions.get("a/b"), {
    added: 0,
    removed: 0,
    kind: "renamed",
    originalPath: "old",
  });
});
test("fresh Map/value ownership without caller input mutation", () => {
  const stdout = "1\t2\ta\0",
    a = f.parseNumstat(stdout),
    b = f.parseNumstat(stdout);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.notEqual(a.get("a"), b.get("a"));
  a.get("a")!.added = 999;
  assert.equal(b.get("a")!.added, 1);
  assert.equal(stdout, "1\t2\ta\0");
});
test("320 deterministic structured delimiter mutations against copied parser", () => {
  const alphabet = ["\0", "\t", " ", "\n", "\r", "\u2028", "\u2029", "文", "😀", "-", "0", "#"];
  let seed = 81237;
  for (let i = 0; i < 320; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const base = i % 2 ? "1\t2\towned\0-\t-\t\0old\0new\0" : "\t\t\0\0new\0 3x\t-1\towned\0";
    const at = seed % base.length,
      char = alphabet[(seed >>> 16) % alphabet.length]!;
    compare(base.slice(0, at) + char + base.slice(at + (i % 3)));
  }
});
