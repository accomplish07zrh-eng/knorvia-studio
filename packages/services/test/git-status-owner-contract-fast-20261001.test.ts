import assert from "node:assert/strict";
import { test } from "node:test";
import {
  statusOwnerFixture,
  answer,
  deferred,
  result,
  workspace,
  root,
  stdout,
  statusArgs,
  statArgs,
} from "./git-status-owner-fixture-fast-20261001.js";
const f = await statusOwnerFixture();
const modes = (commands: { args: string[] }[]) =>
  commands.filter((c) => c.args[0] === "status").map((c) => c.args[3]);
const warning = [
  undefined,
  `git status detailed output exceeded limit; collapsing untracked directories repoRoot=${root}`,
];
for (const transport of ["service", "RPC"] as const)
  test(`actual ${transport} refresh collapses once and retains parser/projector output`, async (t) => {
    const s = f.fixture({
        run: (c) =>
          c.args[0] === "status" && c.args[3] === "--untracked-files=all"
            ? result({ outputTruncated: true })
            : answer(c),
      }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    const value = await api.refresh({
      workspacePath: workspace,
      includeIdentity: false,
      includeBranchComparison: false,
    });
    assert.equal(value.summary.branchName, "owned-main");
    assert.equal(value.summary.ahead, 2);
    assert.deepEqual(
      value.stagedChanges.map((v) => [v.repoRelativePath, v.added, v.removed]),
      [["subdir/owned.txt", 3, 2]],
    );
    assert.deepEqual(
      value.unstagedChanges.map((v) => [v.repoRelativePath, v.section, v.added]),
      [
        ["subdir/owned.txt", "unstaged", 4],
        ["subdir/dir/", "untracked", 0],
      ],
    );
    assert.deepEqual(
      s.commands.slice(1),
      [statusArgs("all"), ...statArgs, statusArgs("normal")].map((args) => ({
        cwd: root,
        args,
        timeoutMs: 15000,
        maxOutputBytes: 524288,
      })),
    );
    assert.deepEqual(f.logs, [warning]);
    await api.getRepositorySummary({ workspacePath: workspace });
    assert.deepEqual(modes(s.commands), [
      "--untracked-files=all",
      "--untracked-files=normal",
      "--untracked-files=normal",
    ]);
    assert.deepEqual(f.logs, [warning]);
  });
test("unavailable resolution has fresh empty maps and no status IO", async () => {
  const s = f.fixture({ binary: () => null }),
    a = await s.repo.getStatus(workspace),
    b = await s.repo.getStatus(workspace);
  assert.equal(a.summary.isGitAvailable, false);
  assert.deepEqual(a.entries, []);
  for (const key of ["stagedStats", "unstagedStats", "untrackedStats"] as const) {
    assert.equal(a[key].size, 0);
    assert.notEqual(a[key], b[key]);
  }
  assert.deepEqual(s.commands, []);
});
test("full success remains full on later requests and does not persist snapshots", async () => {
  const s = f.fixture(),
    a = await s.repo.getStatus(workspace),
    b = await s.repo.getStatus(workspace);
  assert.notEqual(a, b);
  assert.deepEqual(modes(s.commands), ["--untracked-files=all", "--untracked-files=all"]);
  assert.deepEqual(f.logs, []);
});
test("truncated timeout still marks/falls back; invalidation retains collapse state", async () => {
  const s = f.fixture({
    run: (c) =>
      c.args[0] === "status" && c.args[3] === "--untracked-files=all"
        ? result({ timedOut: true, outputTruncated: true })
        : answer(c),
  });
  assert.equal((await s.repo.getStatus(workspace)).summary.branchName, "owned-main");
  s.repo.invalidate(workspace);
  await s.repo.getStatus(workspace);
  assert.deepEqual(modes(s.commands), [
    "--untracked-files=all",
    "--untracked-files=normal",
    "--untracked-files=normal",
  ]);
  assert.deepEqual(f.logs, [warning]);
});
for (const kind of ["truncated", "timeout", "failed", "rejected"] as const)
  test(`fallback ${kind} remains collapsed and retryable`, async () => {
    let fail = true;
    const error = new Error("owned fallback rejection"),
      s = f.fixture({
        run: (c) => {
          if (c.args[0] !== "status") return answer(c);
          if (c.args[3] === "--untracked-files=all") return result({ outputTruncated: true });
          if (!fail) return answer(c);
          if (kind === "rejected") return Promise.reject(error);
          return result({
            outputTruncated: kind === "truncated",
            timedOut: kind === "timeout",
            exitCode: kind === "failed" ? 128 : 0,
            stderr: "owned fallback failure",
          });
        },
      });
    await assert.rejects(s.repo.getStatus(workspace), (e) =>
      kind === "rejected"
        ? e === error
        : (e as Error).message ===
          (kind === "truncated"
            ? "git status output exceeded limit"
            : kind === "timeout"
              ? "git status timed out after 7ms (elapsed=7ms)"
              : "git status failed: owned fallback failure"),
    );
    fail = false;
    await s.repo.getStatus(workspace);
    assert.deepEqual(modes(s.commands), [
      "--untracked-files=all",
      "--untracked-files=normal",
      "--untracked-files=normal",
    ]);
    assert.deepEqual(f.logs, [warning]);
  });
test("warning failure marks the root before throwing and starts no fallback", async (t) => {
  const error = new Error("owned warning throw"),
    original = f.logs.push;
  Object.defineProperty(f.logs, "push", {
    configurable: true,
    value: function (...items: unknown[][]) {
      original.apply(this, items);
      throw error;
    },
  });
  t.after(() => {
    Reflect.deleteProperty(f.logs, "push");
  });
  const s = f.fixture({
    run: (c) =>
      c.args[0] === "status" && c.args[3] === "--untracked-files=all"
        ? result({ outputTruncated: true })
        : answer(c),
  });
  await assert.rejects(s.repo.getStatus(workspace), (e) => e === error);
  assert.deepEqual(modes(s.commands), ["--untracked-files=all"]);
  Reflect.deleteProperty(f.logs, "push");
  await s.repo.getStatus(workspace);
  assert.deepEqual(modes(s.commands), ["--untracked-files=all", "--untracked-files=normal"]);
});
test("nontruncated timeout does not mark collapse state", async () => {
  let fail = true;
  const s = f.fixture({
    run: (c) => (c.args[0] === "status" && fail ? result({ timedOut: true }) : answer(c)),
  });
  await assert.rejects(s.repo.getStatus(workspace), {
    message: "git status timed out after 7ms (elapsed=7ms)",
  });
  fail = false;
  await s.repo.getStatus(workspace);
  assert.deepEqual(modes(s.commands), ["--untracked-files=all", "--untracked-files=all"]);
  assert.deepEqual(f.logs, []);
});
test("cached normal bypasses collapse flag reads until ordered validation", async () => {
  const reads: string[] = [];
  let count = 0;
  const s = f.fixture({
    run: (c) => {
      if (c.args[0] !== "status") return answer(c);
      if (count++ === 0) return result({ outputTruncated: true });
      const value = answer(c);
      if (count === 2) return value;
      return new Proxy(value, {
        get(v, k) {
          reads.push(String(k));
          return Reflect.get(v, k);
        },
      });
    },
  });
  await s.repo.getStatus(workspace);
  await s.repo.getStatus(workspace);
  assert.deepEqual(reads, ["then", "then", "timedOut", "outputTruncated", "exitCode", "stdout"]);
});
for (const slot of ["cached", "unstaged"] as const)
  test(`synchronous run getter failure stops fanout at ${slot}`, async () => {
    const s = f.fixture(),
      run = s.provider.run,
      error = new Error("owned run getter throw");
    let reads = 0;
    Object.defineProperty(s.provider, "run", {
      get() {
        if (++reads === (slot === "cached" ? 3 : 4)) throw error;
        return run;
      },
    });
    await assert.rejects(s.repo.getStatus(workspace), (e) => e === error);
    assert.deepEqual(
      s.commands.slice(1).map((c) => c.args),
      [statusArgs("all"), ...(slot === "unstaged" ? [statArgs[0]!] : [])],
    );
  });
test("failed records validate status before both stat failures", async () => {
  const s = f.fixture({
    run: (c) =>
      c.args[0] === "rev-parse"
        ? answer(c)
        : result({ exitCode: 128, stderr: `owned ${c.args[0]} failure` }),
  });
  await assert.rejects(s.repo.getStatus(workspace), {
    message: "git status failed: owned status failure",
  });
  assert.deepEqual(
    s.commands.slice(1).map((c) => c.args),
    [statusArgs("all"), ...statArgs],
  );
});
test("different workspace keys capture full mode independently for one shared root", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    ready = deferred<void>();
  let count = 0;
  const s = f.fixture({
    run: (c) => {
      if (c.args[0] === "status" && c.args[3] === "--untracked-files=all") {
        if (++count === 2) ready.resolve();
        return gate.promise;
      }
      return answer(c);
    },
  });
  const a = s.repo.getStatus(workspace),
    b = s.repo.getStatus("owned other workspace");
  await ready.promise;
  gate.resolve(result({ outputTruncated: true }));
  await Promise.all([a, b]);
  await s.repo.getStatus("owned third workspace");
  assert.deepEqual(modes(s.commands), [
    "--untracked-files=all",
    "--untracked-files=all",
    "--untracked-files=normal",
    "--untracked-files=normal",
    "--untracked-files=normal",
  ]);
  assert.deepEqual(f.logs, [warning, warning]);
});
test("late collapse after a rejected sibling retains existing effect lifetime", async () => {
  const late = deferred<ReturnType<typeof result>>(),
    fallback = deferred<ReturnType<typeof result>>(),
    started = deferred<void>(),
    fallbackStarted = deferred<void>(),
    error = new Error("owned stat rejection");
  let full = 0,
    cached = 0,
    normal = 0;
  const s = f.fixture({
    run: (c) => {
      if (c.args[0] === "status") {
        if (c.args[3] === "--untracked-files=all" && full++ === 0) {
          started.resolve();
          return late.promise;
        }
        if (c.args[3] === "--untracked-files=normal" && normal++ === 0) {
          fallbackStarted.resolve();
          return fallback.promise;
        }
      }
      if (c.args.includes("--cached") && cached++ === 0) return Promise.reject(error);
      return answer(c);
    },
  });
  const first = s.repo.getStatus(workspace),
    rejected = assert.rejects(first, (e) => e === error);
  await started.promise;
  await rejected;
  await s.repo.getStatus(workspace);
  late.resolve(result({ outputTruncated: true }));
  await fallbackStarted.promise;
  await s.repo.getStatus(workspace);
  fallback.resolve(result({ stdout }));
  assert.deepEqual(modes(s.commands), [
    "--untracked-files=all",
    "--untracked-files=all",
    "--untracked-files=normal",
    "--untracked-files=normal",
  ]);
  assert.deepEqual(f.logs, [warning]);
});
