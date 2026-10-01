import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchIssuesFixture,
  result,
  tracked,
  untracked,
} from "./git-branch-issues-fixture-fast-20261001.js";
const f = await branchIssuesFixture();
const plain = [
  ["already exists", "branch-already-exists", "Branch already exists."],
  ["invalid reference:", "target-branch-not-found", "Target branch was not found."],
  [
    "is already used by worktree at",
    "branch-in-other-worktree",
    "Branch is already checked out in another worktree.",
  ],
  [
    "resolve your current index first",
    "conflicts-present",
    "Repository still has unresolved conflicts.",
  ],
  [
    "cannot switch branch while merging",
    "operation-in-progress",
    "Another Git operation is still in progress.",
  ],
] as const;
for (const [token, code, message] of plain)
  test(`plain issue ${code}`, () => {
    const input = Object.freeze(
      result({
        stderr: `  Owned prefix ${token.toUpperCase()} suffix \r\n`,
        stdout: "already exists",
      }),
    );
    const expected = [{ code, message, detail: input.stderr.trim() }];
    assert.deepEqual(f.parse(input), expected);
    assert.deepEqual(f.parse(input), f.legacy(input));
  });
for (let index = 0; index < plain.length; index++)
  test(`plain collision priority ${index}`, () => {
    const detail = plain
        .slice(index)
        .map((x) => x[0])
        .reverse()
        .join("\n"),
      expected = plain[index]!;
    assert.deepEqual(f.parse(result({ stderr: detail })), [
      { code: expected[1], message: expected[2], detail },
    ]);
    assert.deepEqual(f.parse(result({ stderr: detail })), f.legacy(result({ stderr: detail })));
  });
for (const op of [
  "merging",
  "rebasing",
  "cherry-picking",
  "reverting",
  "bisecting",
  "you have not concluded your merge",
  "rebase in progress",
])
  test(`operation spelling ${op}`, () => {
    const detail = op.includes(" ") ? op : `cannot switch branch while ${op}`;
    assert.deepEqual(f.parse(result({ stderr: detail })), [
      {
        code: "operation-in-progress",
        message: "Another Git operation is still in progress.",
        detail,
      },
    ]);
  });
const samples: [string, string, string[] | undefined][] = [
  [`${tracked}\n\towned.txt\nStop`, "tracked-changes-would-be-overwritten", ["owned.txt"]],
  [`${untracked}\n  owned.txt\nStop`, "untracked-changes-would-be-overwritten", ["owned.txt"]],
  [
    `${untracked}\n\ttwo\nStop\n${tracked}\n\tone\nStop\nalready exists`,
    "tracked-changes-would-be-overwritten",
    ["one"],
  ],
  [
    `${tracked}\nStop\n${untracked}\n\ttwo\nStop\nalready exists`,
    "untracked-changes-would-be-overwritten",
    ["two"],
  ],
  [`${tracked}\nStop\n${tracked}\n\tignored\nStop`, "unknown", undefined],
  [`${tracked}\nStop\nalready exists`, "branch-already-exists", undefined],
  [
    `${tracked}\r\n\t"C:\\owned\\文 file"  \r\n  duplicate\t\r\n\r\n\tduplicate\r\nStop`,
    "tracked-changes-would-be-overwritten",
    ['"C:/owned/文 file"', "duplicate", "duplicate"],
  ],
  [
    `${tracked}\n\tfirst\n\t \n\tsecond\nnot-indented\n\tignored`,
    "tracked-changes-would-be-overwritten",
    ["first", "second"],
  ],
  [
    `${tracked}\n\tPlease commit your changes\n\t'quoted path'\nStop`,
    "tracked-changes-would-be-overwritten",
    ["Please commit your changes", "'quoted path'"],
  ],
  [`${tracked}\n\tNUL\0owned\nStop`, "tracked-changes-would-be-overwritten", ["NUL\0owned"]],
  [`${tracked}\n\tfirst\ronly\nStop`, "tracked-changes-would-be-overwritten", ["first\ronly"]],
  [
    `Owned prefix ${tracked.toUpperCase()}extra\n\tpath\nStop`,
    "tracked-changes-would-be-overwritten",
    ["path"],
  ],
];
for (const [detail, code, paths] of samples)
  test(`path block ${JSON.stringify(detail)}`, () => {
    const input = Object.freeze(
      result({
        stderr: detail,
        stdout: "ignored stdout",
        timedOut: true,
        outputTruncated: true,
        exitCode: 0,
      }),
    );
    const value = f.parse(input);
    assert.deepEqual(value, f.legacy(input));
    assert.equal(value[0]!.code, code);
    assert.deepEqual(value[0]!.paths, paths);
    assert.equal(Object.hasOwn(value[0]!, "paths"), paths !== undefined);
    assert.equal(value[0]!.detail, detail.trim());
    assert.equal(value.length, 1);
  });
for (const white of [
  "\t",
  " ",
  "\v",
  "\f",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2007",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
])
  test(`JS whitespace indent/trailing ${JSON.stringify(white)}`, () => {
    const input = result({
      stderr: `${tracked}\r\n${white}owned${white}\r\n${white}\r\n\tsecond\r\nStop`,
    });
    assert.deepEqual(f.parse(input)[0]!.paths, ["owned", "second"]);
    assert.deepEqual(f.parse(input), f.legacy(input));
  });
for (const [stderr, stdout, detail] of [
  ["  ", " invalid reference: owned ", "invalid reference: owned"],
  ["", "", null],
  ["  Unrecognized 文  ", "already exists", "Unrecognized 文"],
] as const)
  test(`detail selection ${JSON.stringify([stderr, stdout])}`, () => {
    const input = result({ stderr, stdout });
    assert.deepEqual(f.parse(input), f.legacy(input));
    assert.equal(f.parse(input)[0]!.detail, detail);
  });
for (const source of ["stderr", "stdout"] as const)
  test(`lazy source getter/failure ${source}`, () => {
    const error = new Error("owned issue getter failure");
    function observe(parse: typeof f.parse, throws: boolean) {
      const events: string[] = [],
        r = {} as ReturnType<typeof result>;
      Object.defineProperty(r, "stderr", {
        get() {
          events.push("stderr");
          if (throws && source === "stderr") throw error;
          return source === "stderr" ? "already exists" : " ";
        },
      });
      Object.defineProperty(r, "stdout", {
        get() {
          events.push("stdout");
          if (throws && source === "stdout") throw error;
          return "invalid reference: owned";
        },
      });
      for (const field of ["exitCode", "timedOut", "outputTruncated"])
        Object.defineProperty(r, field, {
          get() {
            assert.fail("issue parser must not read command metadata");
          },
        });
      try {
        return { output: parse(r), events };
      } catch (e) {
        assert.equal(e, error);
        return { failed: true, events };
      }
    }
    for (const throws of [false, true])
      assert.deepEqual(observe(f.parse, throws), observe(f.legacy, throws));
  });
test("reentrant parser and repeated calls own fresh issues/paths", () => {
  const r = result({ stderr: "" });
  let nested: unknown;
  Object.defineProperty(r, "stderr", {
    get() {
      nested = f.parse(result({ stderr: "already exists" }));
      return `${tracked}\n\towned\nStop`;
    },
  });
  const a = f.parse(r),
    b = f.parse(r);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.notEqual(a[0], b[0]);
  assert.notEqual(a[0]!.paths, b[0]!.paths);
  assert.deepEqual(nested, f.legacy(result({ stderr: "already exists" })));
});
