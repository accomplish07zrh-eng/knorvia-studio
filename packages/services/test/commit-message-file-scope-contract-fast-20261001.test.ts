import assert from "node:assert/strict";
import { test } from "node:test";
import { scopeFixture } from "./commit-message-file-scope-fixture-fast-20261001.js";
const f = await scopeFixture();
const file = (path: string, repoRelativePath = path, workspaceRelativePath = path) =>
  ({ path, repoRelativePath, workspaceRelativePath }) as any;

for (const dialect of ["posix", "win32"] as const) {
  const root = dialect === "posix" ? "/owned/repo" : "C:\\owned\\repo";
  const workspace = root + (dialect === "posix" ? "/work" : "\\work");
  const absolute = workspace + (dialect === "posix" ? "/owned.txt" : "\\owned.txt");
  const cases = [
    {
      name: "absolute aliases and outside containment",
      paths: [absolute],
      files: [
        file("owned.txt"),
        file("work/owned.txt"),
        file(absolute),
        file("../owned.txt"),
        file("other.txt"),
      ],
      kept: [0, 1, 2],
    },
    {
      name: "relative prefix and three spellings",
      paths: [" ./owned.txt/ "],
      files: [
        file("no", "work/owned.txt", "other"),
        file("no", "no", "owned.txt"),
        file("owned.txt"),
        file("other"),
      ],
      kept: [0, 1, 2],
    },
    {
      name: "exact prefixes and case Unicode",
      paths: ["work/路径.txt", "case.txt"],
      files: [
        file("work/路径.txt"),
        file("work/work/路径.txt"),
        file("CASE.txt"),
        file("case.txt"),
      ],
      kept: [0, 3],
    },
    {
      name: "internal slash and dot segments stay literal",
      paths: ["a//b", "../out", "."],
      files: [file("a/b"), file("a//b"), file("work/../out"), file("work/."), file("out")],
      kept: [1, 2, 3],
    },
    {
      name: "single leading prefix and backslashes",
      paths: [".\\owned.txt\\", ".//double", "//leading"],
      files: [
        file("owned.txt"),
        file(".//double"),
        file("/double"),
        file("//leading"),
        file("/leading"),
      ],
      kept: [0, 1, 3],
    },
    {
      name: "blank paths and duplicate file references",
      paths: ["  ", "owned.txt", "owned.txt"],
      files: [file("owned.txt"), file("other"), file("owned.txt")],
      kept: [0, 2],
    },
  ];
  for (const c of cases)
    test(`${dialect}: ${c.name}`, () => {
      const input = Object.freeze({
        workspacePath: workspace,
        repoRoot: root,
        workspaceInRepoPath: "work",
        currentSessionFilePaths: Object.freeze(c.paths),
        files: Object.freeze(c.files),
      });
      const expected = c.kept.map((i) => c.files[i]);
      for (const filter of [f.dialect(dialect), f.dialect(dialect, true)]) {
        const actual = filter(input);
        assert.deepEqual(actual, expected);
        actual.forEach((value, i) => assert.equal(value, expected[i]));
      }
    });
}

test("missing/null/blank and empty-key scope fail open, while relative ./ gains a prefix", () => {
  for (const filter of [f.current, f.legacy]) {
    const files = [file("owned"), file("work")];
    for (const paths of [undefined, null, [], ["  "], ["/"]]) {
      assert.deepEqual(
        filter({
          files,
          workspacePath: "/owned/repo/work",
          repoRoot: "/owned/repo",
          workspaceInRepoPath: "work",
          currentSessionFilePaths: paths,
        } as any),
        files,
      );
    }
    assert.deepEqual(
      filter({
        files,
        workspacePath: "/owned/repo/work",
        repoRoot: "/owned/repo",
        workspaceInRepoPath: "work",
        currentSessionFilePaths: ["./"],
      }),
      [files[1]],
    );
  }
});
test("sparse arrays retain filter traversal, order, duplicates and immutability", () => {
  const shared = Object.freeze(file("owned")),
    files = [shared, file("other"), shared];
  delete files[1];
  for (const filter of [f.current, f.legacy]) {
    assert.deepEqual(
      filter({
        files: Object.freeze(files),
        workspacePath: "/owned",
        repoRoot: "/owned",
        workspaceInRepoPath: ".",
        currentSessionFilePaths: ["owned"],
      }),
      [shared, shared],
    );
  }
});
test("caller fields are acquired before paths trim and all file getters precede lazy matching", () => {
  function observe(filter: typeof f.current) {
    const trace: string[] = [];
    const record = Object.fromEntries(
      ["path", "repoRelativePath", "workspaceRelativePath"].map((name) => [
        name,
        name === "path" ? "owned" : null,
      ]),
    );
    const files = [
      new Proxy(record, {
        get(o, k) {
          trace.push(String(k));
          return o[String(k)];
        },
      }),
    ];
    const values = {
      workspacePath: "/owned/work",
      repoRoot: "/owned",
      workspaceInRepoPath: "work",
      currentSessionFilePaths: [
        {
          trim() {
            trace.push("trim");
            return "owned";
          },
        },
      ],
      files,
    };
    const params = new Proxy(values, {
      get(o, k) {
        trace.push(String(k));
        return o[k as keyof typeof o];
      },
    });
    assert.deepEqual(filter(params as any), files);
    return trace;
  }
  const expected = [
    "workspacePath",
    "repoRoot",
    "workspaceInRepoPath",
    "currentSessionFilePaths",
    "trim",
    "files",
    "path",
    "repoRelativePath",
    "workspaceRelativePath",
  ];
  assert.deepEqual(observe(f.current), expected);
  assert.deepEqual(observe(f.legacy), expected);
});
test("malformed path/parameter errors retain type/message and admission order", () => {
  const inputs = [
    null,
    { files: [], currentSessionFilePaths: [null] },
    { files: [file(null as any)], currentSessionFilePaths: ["owned"] },
  ];
  for (const value of inputs) {
    const params =
      value === null
        ? null
        : { workspacePath: "/owned", repoRoot: "/owned", workspaceInRepoPath: ".", ...value };
    const observed = [f.current, f.legacy].map((filter) => {
      try {
        filter(params as any);
        assert.fail("expected malformed path error");
      } catch (e) {
        assert.ok(e instanceof TypeError);
        return { name: e.name, message: e.message };
      }
    });
    assert.deepEqual(observed[0], observed[1]);
  }
});
