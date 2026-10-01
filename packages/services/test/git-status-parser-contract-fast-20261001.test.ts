import assert from "node:assert/strict";
import { test } from "node:test";
import { ordinary, statusParserFixture } from "./git-status-parser-fixture-fast-20261001.js";
const f = await statusParserFixture();
const compare = (stdout: string) => assert.deepEqual(f.parse(stdout), f.legacy(stdout));
for (const stdout of [
  "",
  "\0\0",
  "\n",
  "# branch.oid owned",
  "# branch.head ",
  "# branch.head (detached)",
  "# branch.head 中文\n\0# branch.upstream \0# branch.ab noise+004x-03",
  "# branch.head (detached)\0# branch.head owned\0# branch.head (detached)",
  "# branch.upstream one\0# branch.upstream two",
  "# branch.ab +2 -3\0# branch.ab nonsense",
  "# branch.ab ++17 --5 +2 -9",
  `# branch.ab +${"9".repeat(400)} -0002`,
])
  test(`legacy header grammar ${JSON.stringify(stdout)}`, () => compare(stdout));
for (const tag of ["1", "2", "u"] as const)
  for (const path of [
    "owned.txt",
    "two spaces.txt",
    " leading",
    "trailing ",
    "C:\\owned\\文",
    "中文😀",
    "\t",
    "a\tb",
    "a\nb",
    "a\rb",
    "a\u2028b",
    "a\u2029b",
    "p\n",
    "p\r\n",
    "",
  ])
    test(`legacy ${tag} path grammar ${JSON.stringify(path)}`, () =>
      compare(ordinary(tag, "MM", path) + "\0owned-original\0? after"));
for (const xy of ["A.", ".D", "R.", "C.", "..", "M", "MMM", "M\n", "M\t", "🧪"])
  test(`XY code units ${JSON.stringify(xy)}`, () => {
    for (const tag of ["1", "2", "u"] as const) compare(ordinary(tag, xy) + "\0old");
  });
for (const stdout of [
  ordinary("2") + "\0\0\0? swallowed\0? after",
  ordinary("2"),
  ordinary("2") + "\0# branch.head swallowed\0# branch.head after",
  "2 broken\0? retained",
  ordinary("2") + "\0\0",
  ordinary("u").replace(" owned owned ", " owned  owned "),
  ordinary("1").replace(" owned ", " \t\n "),
  "? \0? C:\\owned\0! ignored\0? owned\n",
  ordinary("1").replace("1 ", "1  "),
])
  test(`record consumption ${JSON.stringify(stdout)}`, () => compare(stdout));
test("literal output defaults/property order/kinds and duplicate headers", () => {
  const p = f.parse(
    [
      "# branch.head owned",
      "# branch.upstream remote/main",
      "# branch.ab +4 -2",
      ordinary("1", "A.", "sub\\a"),
      ordinary("u", "UU", "sub/c"),
      "? sub/u",
      "",
    ].join("\0"),
  );
  assert.deepEqual(Object.keys(p), [
    "branchName",
    "trackingBranchName",
    "headRefType",
    "ahead",
    "behind",
    "entries",
  ]);
  assert.deepEqual(
    { ...p, entries: undefined },
    {
      branchName: "owned",
      trackingBranchName: "remote/main",
      headRefType: "branch",
      ahead: 4,
      behind: 2,
      entries: undefined,
    },
  );
  assert.deepEqual(
    p.entries.map((x) => [x.path, x.kind, x.x, x.y, x.isUntracked, x.isConflicted]),
    [
      ["sub/a", "added", "A", ".", false, false],
      ["sub/c", "modified", "U", "U", false, true],
      ["sub/u", "added", null, "?", true, false],
    ],
  );
  assert.deepEqual(Object.keys(p.entries[0]!), [
    "path",
    "originalPath",
    "kind",
    "x",
    "y",
    "isUntracked",
    "isConflicted",
  ]);
});
test("fresh result independence and exact rename consumption", () => {
  const stdout = ordinary("2", ".R", "sub/new") + "\0\0# branch.head old\0? sub/u";
  const a = f.parse(stdout),
    b = f.parse(stdout);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.notEqual(a.entries, b.entries);
  assert.equal(a.entries[0]!.originalPath, "# branch.head old");
  assert.equal(a.branchName, null);
  a.entries[0]!.path = "owned changed result";
  assert.equal(b.entries[0]!.path, "sub/new");
});
test("320 deterministic owned structural mutations versus exact copied baseline", () => {
  const alphabet = ["\0", " ", "\t", "\n", "\r", "\u2028", "\u2029", "文", "😀", ".", "#", "?"];
  let seed = 71421;
  for (let i = 0; i < 320; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const base = [
      "# branch.head own\0",
      ordinary((["1", "2", "u"] as const)[i % 3]!, ["MM", "A.", ".R", "UU"][i % 4]!),
      "\0old\0? last",
    ].join("");
    const at = seed % base.length,
      char = alphabet[(seed >>> 16) % alphabet.length]!;
    compare(base.slice(0, at) + char + base.slice(at + (i % 3)) + "\0");
  }
});
