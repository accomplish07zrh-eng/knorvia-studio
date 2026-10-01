import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commandResult,
  graphFixture,
  record,
  resolution,
  workspace,
} from "./git-graph-query-fixture-fast-20261001.js";
const f = await graphFixture();
const commit = (values: Record<string, unknown> = {}) => ({
  hash: "owned-hash",
  parents: [],
  refs: [],
  subject: "owned subject 🚀",
  authorName: "Owned author 中文",
  authoredAtMs: 123000,
  ...values,
});
async function parse(stdout: string, max = 200) {
  const s = f.fixture({ result: Object.freeze(commandResult({ stdout })) });
  return await s.repo.getCommitGraph(workspace, max);
}
const malformed: [string, unknown[]][] = [
  ["", []],
  [" \r\n\t\x1e \x1e", []],
  ["\0parent\0author\x001\0subject\0HEAD\x1e", []],
  ["h", [commit({ hash: "h", subject: "", authorName: null, authoredAtMs: null })]],
  [
    "\n h\0p1  p2\0  author  \0 7suffix\0 subject \0HEAD\x1e\r\n",
    [
      commit({
        hash: "h",
        parents: ["p1", "p2"],
        refs: [{ name: "HEAD", kind: "head" }],
        subject: " subject ",
        authorName: "  author  ",
        authoredAtMs: 7000,
      }),
    ],
  ],
  [
    record("not a SHA 🚀", "p p\tp p\np", "", "bad", "line1\nline2\rline3"),
    [
      commit({
        hash: "not a SHA 🚀",
        parents: ["p", "p\tp", "p\np"],
        subject: "line1\nline2\rline3",
        authorName: null,
        authoredAtMs: null,
      }),
    ],
  ],
  [
    record("h", "", "a", "1", "s", "HEAD") + "garbage\x1e",
    [
      commit({
        hash: "h",
        authorName: "a",
        authoredAtMs: 1000,
        subject: "s",
        refs: [{ name: "HEAD", kind: "head" }],
      }),
      commit({ hash: "garbage", subject: "", authorName: null, authoredAtMs: null }),
    ],
  ],
  [
    "h\0p\0a\0\0\0\x1e",
    [commit({ hash: "h", parents: ["p"], authorName: "a", authoredAtMs: null, subject: "" })],
  ],
  [
    "h\0\0a\x001\0subject\0HEAD\0ignored\0more\x1e",
    [
      commit({
        hash: "h",
        authorName: "a",
        authoredAtMs: 1000,
        subject: "subject",
        refs: [{ name: "HEAD", kind: "head" }],
      }),
    ],
  ],
  [
    "h\0\0a\x001\0s\x1eother\0\0b\0-2\0t\0refs/heads/x\x1e",
    [
      commit({ hash: "h", authorName: "a", authoredAtMs: 1000, subject: "s" }),
      commit({
        hash: "other",
        authorName: "b",
        authoredAtMs: -2000,
        subject: "t",
        refs: [{ name: "x", kind: "branch" }],
      }),
    ],
  ],
  [
    "h\0\0a\x001\0s\0tag: a,b\x1e",
    [
      commit({
        hash: "h",
        authorName: "a",
        authoredAtMs: 1000,
        subject: "s",
        refs: [
          { name: "a", kind: "tag" },
          { name: "b", kind: "branch" },
        ],
      }),
    ],
  ],
  [
    "\ufeff  h\0\0\0\0\0 \x1e",
    [commit({ hash: "h", authorName: null, authoredAtMs: null, subject: "" })],
  ],
  [
    "h\0\0a\x001\0nul\0in-subject\0HEAD\x1e",
    [
      commit({
        hash: "h",
        authorName: "a",
        authoredAtMs: 1000,
        subject: "nul",
        refs: [{ name: "in-subject", kind: "branch" }],
      }),
    ],
  ],
];
for (const [index, [stdout, expected]] of malformed.entries())
  test(`literal malformed/delimiter record #${index}`, async () => {
    const got = await parse(stdout);
    assert.deepEqual(got, { resolution, commits: expected, hasMore: false });
    for (const c of got.commits)
      assert.deepEqual(Object.keys(c), [
        "hash",
        "parents",
        "refs",
        "subject",
        "authorName",
        "authoredAtMs",
      ]);
  });
const refCases: [string, { name: string; kind: string }[]][] = [
  ["HEAD", [{ name: "HEAD", kind: "head" }]],
  [
    "HEAD -> refs/heads/main,main,refs/heads/main,HEAD",
    [
      { name: "HEAD", kind: "head" },
      { name: "main", kind: "branch" },
    ],
  ],
  [
    "tag: refs/tags/v1,refs/tags/v1,tag: v1,v1",
    [
      { name: "v1", kind: "tag" },
      { name: "v1", kind: "branch" },
    ],
  ],
  [
    "refs/remotes/origin/main,origin/main,refs/heads/origin/main",
    [
      { name: "origin/main", kind: "remote" },
      { name: "origin/main", kind: "branch" },
    ],
  ],
  ["refs/heads/,refs/remotes/,refs/tags/", []],
  [
    "tag: ,HEAD -> ",
    [
      { name: "tag:", kind: "branch" },
      { name: "HEAD ->", kind: "branch" },
    ],
  ],
  ["HEAD -> refs/heads/,HEAD -> refs/tags/", [{ name: "HEAD", kind: "head" }]],
  [", , \t ,", []],
  [
    "Head,Tag: v1,Refs/heads/main",
    [
      { name: "Head", kind: "branch" },
      { name: "Tag: v1", kind: "branch" },
      { name: "Refs/heads/main", kind: "remote" },
    ],
  ],
  ["tag:   refs/tags/ 中文🚀 ", [{ name: " 中文🚀", kind: "tag" }]],
  [
    "refs/heads/ 空格 , refs/remotes/o/空格 ",
    [
      { name: " 空格", kind: "branch" },
      { name: "o/空格", kind: "remote" },
    ],
  ],
  [
    "HEAD -> tag: refs/tags/v,HEAD -> HEAD,HEAD",
    [
      { name: "HEAD", kind: "head" },
      { name: "v", kind: "tag" },
    ],
  ],
  [
    "refs/knorvia/checkpoints/x,--evil,-x",
    [
      { name: "refs/knorvia/checkpoints/x", kind: "remote" },
      { name: "--evil", kind: "branch" },
      { name: "-x", kind: "branch" },
    ],
  ],
  [
    "main,HEAD -> origin/main,tag: main,refs/heads/main",
    [
      { name: "main", kind: "branch" },
      { name: "HEAD", kind: "head" },
      { name: "origin/main", kind: "remote" },
      { name: "main", kind: "tag" },
    ],
  ],
  ["a\nb,refs/heads/a\nb", [{ name: "a\nb", kind: "branch" }]],
];
for (const [index, [raw, expected]] of refCases.entries())
  test(`decoration classification/order/dedup #${index}`, async () => {
    const got = await parse(record("h", "", "a", "1", "s", raw));
    assert.deepEqual(got.commits[0]!.refs, expected);
    for (const ref of got.commits[0]!.refs) assert.deepEqual(Object.keys(ref), ["name", "kind"]);
  });
const dates: [string, number | null][] = [
  ["", null],
  ["bad", null],
  ["NaN", null],
  ["Infinity", null],
  ["0", 0],
  ["-0", -0],
  ["-123", -123000],
  [" 12 suffix", 12000],
  ["12.9", 12000],
  ["1e6", 1000],
  ["0x10", 0],
  ["+0007", 7000],
  ["9".repeat(400), Infinity],
];
for (const [text, expected] of dates)
  test(`timestamp parseInt compatibility ${text.slice(0, 20)}`, async () => {
    const got = await parse(record("h", "", "a", text, "s"));
    assert.equal(got.commits[0]!.authoredAtMs, expected);
  });
test("parent duplicates, spaces and commit duplicates retain identity/order", async () => {
  const stdout = record("same", " p  p ", " ", "1", "s") + record("same", "q", "b", "2", "t");
  const got = await parse(stdout);
  assert.deepEqual(
    got.commits.map((c) => [c.hash, c.parents, c.authorName]),
    [
      ["same", ["p", "p"], " "],
      ["same", ["q"], "b"],
    ],
  );
  assert.notEqual(got.commits[0], got.commits[1]);
});
for (const [count, limit, hasMore] of [
  [0, 1, false],
  [1, 1, false],
  [2, 1, true],
  [3, 2, true],
  [201, 200, true],
] as const)
  test(`pagination valid count=${count} limit=${limit}`, async () => {
    const stdout = Array.from({ length: count }, (_, i) => record(`h${i}`)).join("");
    const got = await parse(stdout, limit);
    assert.equal(got.commits.length, Math.min(count, limit));
    assert.equal(got.hasMore, hasMore);
    assert.deepEqual(
      got.commits.map((c) => c.hash),
      Array.from({ length: Math.min(count, limit) }, (_, i) => `h${i}`),
    );
  });
test("hasMore counts only accepted records; projection occurs before pagination", async () => {
  const got = await parse(record() + "\0bad\x1e \x1e" + record("second"), 1);
  assert.equal(got.hasMore, true);
  assert.equal(got.commits[0]!.hash, "owned-hash");
  const onlyOne = await parse(record() + "\0bad\x1e \x1e", 1);
  assert.equal(onlyOne.hasMore, false);
});
test("immutable command response/inputs yield independently owned results", async () => {
  const result = Object.freeze(
    commandResult({ stdout: record("h", "p p", "a", "1", "s", "HEAD,tag: v") }),
  );
  const s = f.fixture({ result });
  const before = JSON.stringify(result);
  const first = await s.repo.getCommitGraph(workspace),
    second = await s.repo.getCommitGraph(workspace);
  first.commits[0]!.parents.push("owned mutation");
  first.commits[0]!.refs[0]!.name = "owned mutation";
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(second.commits[0]!.parents, ["p", "p"]);
  assert.equal(second.commits[0]!.refs[0]!.name, "HEAD");
  assert.notEqual(first.commits, second.commits);
  assert.equal(s.commands.length, 2);
});
