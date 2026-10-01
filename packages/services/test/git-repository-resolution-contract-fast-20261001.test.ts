import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve, isAbsolute } from "node:path";
import {
  resolutionFixture,
  result,
  revArgs,
  root,
  workspace,
} from "./git-repository-resolution-fixture-fast-20261001.js";
const f = await resolutionFixture();
const unavailable = (available: boolean) => ({
  workspacePath: workspace,
  repoRoot: workspace,
  workspaceInRepoPath: ".",
  autoRefreshWatchPaths: [],
  isGitAvailable: available,
  isRepository: false,
});
const fail = new Error("owned resolution rejection");
test("exact command/output key order, receivers and sequential completed reuse", async () => {
  const s = f.fixture();
  for (let i = 0; i < 2; i++) {
    const value = await s.repo.resolveRepository(workspace);
    assert.deepEqual(value, {
      workspacePath: workspace,
      repoRoot: root,
      workspaceInRepoPath: "subdir",
      autoRefreshWatchPaths: [{ path: "owned git dir", recursive: true }],
      isGitAvailable: true,
      isRepository: true,
    });
    assert.deepEqual(Object.keys(value), [
      "workspacePath",
      "repoRoot",
      "workspaceInRepoPath",
      "autoRefreshWatchPaths",
      "isGitAvailable",
      "isRepository",
    ]);
  }
  assert.deepEqual(
    s.commands,
    Array.from({ length: 2 }, () => ({ cwd: workspace, args: revArgs, timeoutMs: 15000 })),
  );
  assert.deepEqual(Object.keys(s.commands[0]!), ["cwd", "args", "timeoutMs"]);
  assert.deepEqual(s.trace, ["binary", ["run", workspace], "binary", ["run", workspace]]);
});
for (const binary of [null, undefined, "", false, 0])
  test(`falsy discovery ${String(binary)} does not execute or inspect`, async () => {
    const s = f.fixture({ binary: () => binary });
    assert.deepEqual(await s.repo.resolveRepository(workspace), unavailable(false));
    assert.deepEqual(s.trace, ["binary"]);
  });
for (const port of ["binary", "run"] as const)
  for (const mode of ["throw", "reject", "thenable"] as const)
    test(`${port} ${mode} preserves error identity and retry after cleanup`, async () => {
      let count = 0;
      const bad = () => {
        if (count++ > 0) return port === "binary" ? "owned" : result();
        if (mode === "throw") throw fail;
        if (mode === "reject") return Promise.reject(fail);
        return {
          // eslint-disable-next-line unicorn/no-thenable -- Owned fixture tests await rejection.
          then(_yes: unknown, no: (e: unknown) => void) {
            no(fail);
          },
        };
      };
      const s = f.fixture({ [port]: bad });
      await assert.rejects(s.repo.resolveRepository(workspace), (e) => e === fail);
      assert.equal((await s.repo.resolveRepository(workspace)).isRepository, true);
      assert.equal(count, 2);
    });
const classifications: [number | null, string, boolean][] = [
  [-2, "spawn ENOENT", true],
  [-1, "ENOENT", false],
  [128, "Unable To Read Current Working Directory: owned", true],
  [128, "owned No Such File Or Directory", true],
  [128, "fatal: NOT A GIT REPOSITORY", true],
  [null, "outside repository owned", true],
  [128, "no such file or directory and not a git repository", true],
  [128, "owned unrelated error", false],
];
for (const [exitCode, stderr, fallback] of classifications)
  for (const flagged of [false, true])
    test(`classification exit=${exitCode} ${stderr} flags=${flagged}`, async () => {
      const s = f.fixture({
        run: () => result({ exitCode, stderr, timedOut: flagged, outputTruncated: flagged }),
      });
      if (fallback) assert.deepEqual(await s.repo.resolveRepository(workspace), unavailable(true));
      else
        await assert.rejects(s.repo.resolveRepository(workspace), {
          message: flagged
            ? "git rev-parse timed out after 7ms (elapsed=7ms)"
            : `git rev-parse failed: ${stderr}`,
        });
      assert.equal(s.commands.length, 1);
    });
for (const flags of [
  { timedOut: true },
  { outputTruncated: true },
  { timedOut: true, outputTruncated: true },
])
  test(`zero exit preserves checker bypass ${JSON.stringify(flags)}`, async () => {
    const s = f.fixture({ run: () => result(flags) });
    assert.equal((await s.repo.resolveRepository(workspace)).isRepository, true);
  });
const errors: [Partial<ReturnType<typeof result>>, string][] = [
  [
    { exitCode: 2, stdout: "owned stdout", stderr: "  owned stderr \n" },
    "git rev-parse failed: owned stderr",
  ],
  [{ exitCode: null, stdout: " owned stdout " }, "git rev-parse failed: owned stdout"],
  [{ exitCode: 2, stdout: "" }, "git rev-parse failed: exitCode=2"],
  [{ exitCode: 2, outputTruncated: true }, "git rev-parse output exceeded limit"],
  [
    {
      exitCode: 2,
      timedOut: true,
      timeoutMs: 15000,
      timeoutElapsedMs: 15001,
      timeoutCloseDelayMs: 4,
      forceKillAttempted: true,
      orphaned: true,
    },
    "git rev-parse timed out after 15000ms (elapsed=7ms, killAt=15001ms, cleanup=4ms, forceKill=true, orphaned=true)",
  ],
];
for (const [values, message] of errors)
  test(`preserve checker prose ${message}`, async () => {
    await assert.rejects(
      f.fixture({ run: () => result(values) }).repo.resolveRepository(workspace),
      { message },
    );
  });
for (const stdout of ["", "\n", " \r\n", "\r\nsub/\r\n", " \t\nowned"])
  test(`missing root ${JSON.stringify(stdout)}`, async () => {
    await assert.rejects(
      f.fixture({ run: () => result({ stdout }) }).repo.resolveRepository(workspace),
      { message: "Failed to resolve Git repository root" },
    );
  });
for (const [prefix, expected] of [
  ["", "."],
  ["./", "."],
  ["./nested//", "nested"],
  ["nested\\child\\", "nested/child"],
  ["/leading/", "leading"],
  ["././owned/", "./owned"],
  ["  spaced/", "  spaced"],
  ["..\\parent/", "../parent"],
  ["a\0b/", "a\0b"],
  ["目录/🚀/", "目录/🚀"],
])
  test(`prefix ${JSON.stringify(prefix)}`, async () => {
    const s = f.fixture({
      run: () =>
        result({ stdout: `  ${root}  \r\n${prefix}\r\n owned metadata/ \r\n\r\nignored\0extra` }),
    });
    const value = await s.repo.resolveRepository(workspace);
    assert.equal(value.repoRoot, root);
    assert.equal(value.workspaceInRepoPath, expected);
    assert.deepEqual(value.autoRefreshWatchPaths, [{ path: "owned metadata", recursive: true }]);
  });
const normalizeWatch = (value: string) => {
  const t = value.trim();
  return t === "/" || /^[A-Za-z]:[\\/]?$/.test(t) ? t : t.replace(/[\\/]+$/, "");
};
const watchCases: [string, string][] = [
  ["", ""],
  ["/", "/"],
  ["///", ""],
  ["C:\\", "C:/"],
  ["C:", "C:"],
  ["owned/git///", ""],
  ["owned/git/", "../common/"],
  ["owned/git/", "./metadata\\"],
  ["/owned/.git/worktrees/one/", "/owned/.git/"],
  ["/owned/.git/", "/owned/.git//"],
  ["owned\\git\\", "owned\\git"],
  ["中文/🚀/", ""],
];
for (const [git, common] of watchCases)
  test(`watch paths ${JSON.stringify([git, common])}`, async () => {
    const resolvedCommon = common
      ? isAbsolute(common)
        ? common
        : resolve(workspace, common)
      : git;
    const paths = [git, resolvedCommon]
      .map(normalizeWatch)
      .filter((p, i, a) => p && a.indexOf(p) === i)
      .map((path) => ({ path, recursive: true }));
    const value = await f
      .fixture({ run: () => result({ stdout: `${root}\n\n${git}\n${common}\n` }) })
      .repo.resolveRepository(workspace);
    assert.deepEqual(value.autoRefreshWatchPaths, paths);
  });
test("classification and response getters retain access/evaluation order", async () => {
  const trace: string[] = [];
  const r = new Proxy(result({ exitCode: 128, stderr: "owned failure" }), {
    get(target, key) {
      trace.push(String(key));
      return Reflect.get(target, key);
    },
  });
  await assert.rejects(f.fixture({ run: () => r }).repo.resolveRepository(workspace), {
    message: "git rev-parse failed: owned failure",
  });
  assert.deepEqual(trace, [
    "then",
    "exitCode",
    "stderr",
    "exitCode",
    "stderr",
    "timedOut",
    "outputTruncated",
    "exitCode",
    "stderr",
  ]);
});
test("zero success getter failures reject without metadata fallback", async () => {
  const r = result();
  Object.defineProperty(r, "stdout", {
    get() {
      throw fail;
    },
  });
  await assert.rejects(
    f.fixture({ run: () => r }).repo.resolveRepository(workspace),
    (e) => e === fail,
  );
});
test("input/result frozen records are never mutated; extra NUL lines remain literal", async () => {
  const r = Object.freeze(result({ stdout: "owned\0root\r\n./sub/\r\n\r\n\r\nextra" }));
  const s = f.fixture({ run: () => r });
  const value = await s.repo.resolveRepository(workspace);
  assert.equal(value.repoRoot, "owned\0root");
  assert.deepEqual(value.autoRefreshWatchPaths, []);
  assert.deepEqual(r, result({ stdout: r.stdout }));
});
