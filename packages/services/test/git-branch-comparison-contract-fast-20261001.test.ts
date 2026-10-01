import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchComparisonFixture,
  result,
  workspace,
  root,
  deferred,
  comparisonOutput,
} from "./git-branch-comparison-fixture-fast-20261001.js";
const f = await branchComparisonFixture();
for (const guard of ["git", "repo", "null-tracking", "empty-tracking"] as const)
  test(`comparison empty admission ${guard}`, async () => {
    const s = f.fixture(),
      status = f.status();
    if (guard === "git") status.resolution.isGitAvailable = false;
    if (guard === "repo") status.resolution.isRepository = false;
    if (guard === "null-tracking") status.summary.trackingBranchName = null;
    if (guard === "empty-tracking") status.summary.trackingBranchName = "";
    s.repo.getStatus = async function (w) {
      assert.equal(this, s.repo);
      assert.equal(w, workspace);
      return status;
    };
    assert.deepEqual(await s.repo.getBranchComparison(workspace), {
      resolution: status.resolution,
      baseRef: status.summary.trackingBranchName,
      headRef: "owned-main",
      comparisonLabel: null,
      changes: [],
    });
    assert.equal(s.commands.length, 0);
  });
for (const name of [null, "", "owned-main", "中 文/--head"])
  for (const tracking of ["owned-remote/main", " --tracking \n", "ref\0tail"])
    test(`exact reference/nullish label ${JSON.stringify(name)} ${JSON.stringify(tracking)}`, async () => {
      const s = f.fixture({ run: () => result({ stdout: comparisonOutput }) }),
        status = f.status();
      status.summary.branchName = name;
      status.summary.trackingBranchName = tracking;
      s.repo.getStatus = async () => status;
      Object.freeze(status);
      Object.freeze(status.resolution);
      Object.freeze(status.summary);
      const value = await s.repo.getBranchComparison(workspace);
      assert.equal(value.resolution, status.resolution);
      assert.equal(value.baseRef, tracking);
      assert.equal(value.headRef, name ?? "HEAD");
      assert.equal(value.comparisonLabel, `${name || "HEAD"} -> ${tracking}`);
      assert.deepEqual(Object.keys(value), [
        "resolution",
        "baseRef",
        "headRef",
        "comparisonLabel",
        "changes",
      ]);
      assert.deepEqual(s.commands, [
        {
          cwd: root,
          args: ["diff", "--numstat", "-z", "--find-renames", tracking + "...HEAD", "--"],
          timeoutMs: 15000,
          maxOutputBytes: 524288,
        },
      ]);
    });
test("ordered Map duplicate last-value/first-position, rename/binary/zero semantics", async () => {
  const stdout = [
    "1\t0\tsub/a",
    "0\t2\tsub/b",
    "-\t-\tsub/binary",
    "0\t0\tsub/zero",
    "7\t4\tsub/a",
    "2\t3\t",
    "old\\name",
    "sub\\new\tname",
    "",
  ].join("\0");
  const s = f.fixture({ run: () => result({ stdout }) });
  s.repo.getStatus = async () => f.status();
  assert.deepEqual((await s.repo.getBranchComparison(workspace)).changes, [
    { path: "sub/a", originalPath: null, kind: "modified", added: 7, removed: 4 },
    { path: "sub/b", originalPath: null, kind: "deleted", added: 0, removed: 2 },
    { path: "sub/binary", originalPath: null, kind: "modified", added: 0, removed: 0 },
    { path: "sub/zero", originalPath: null, kind: "modified", added: 0, removed: 0 },
    { path: "sub/new\tname", originalPath: "old/name", kind: "renamed", added: 2, removed: 3 },
  ]);
});
const outputs = [
  "",
  "\0\0",
  "bad",
  "1\t2",
  "x\tq\tsub/a\0",
  "1tail\t-2x\tsub/a\0",
  "0\t0\t\0old\0\0",
  "1\t2\t\0old",
  "1\t2\t\0\0sub/new\0",
  "1\t2\tline\r\nname\0",
  "1\t2\t中文\x1e🚀\0",
  "1\t2\ta\tb\tc\0",
  '1\t2\tquote"path\0',
  "9".repeat(400) + "\t0\tsub/huge\0",
];
for (const stdout of outputs)
  test(`comparison retained malformed grammar ${JSON.stringify(stdout)}`, async () => {
    async function observe(legacy: boolean) {
      const s = f.fixture({ run: () => result({ stdout }) }, legacy);
      s.repo.getStatus = async () => f.status();
      return s.repo.getBranchComparison(workspace);
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
for (const [flags, message] of [
  [
    { timedOut: true, outputTruncated: true },
    "git diff --numstat upstream...HEAD timed out after 7ms (elapsed=7ms)",
  ],
  [{ outputTruncated: true }, "git diff --numstat upstream...HEAD output exceeded limit"],
  [
    { exitCode: 1, stderr: "owned stderr" },
    "git diff --numstat upstream...HEAD failed: owned stderr",
  ],
  [
    { exitCode: 128, stdout: "owned stdout" },
    "git diff --numstat upstream...HEAD failed: owned stdout",
  ],
  [
    { exitCode: null, stderr: "owned null" },
    "git diff --numstat upstream...HEAD failed: owned null",
  ],
] as const)
  test(`comparison error precedence ${message}`, async () => {
    const s = f.fixture({ run: () => result(flags) });
    s.repo.getStatus = async () => f.status();
    await assert.rejects(s.repo.getBranchComparison(workspace), { message });
  });
for (const port of ["status", "diff"] as const)
  for (const sync of [false, true])
    test(`comparison ${port} exact rejection sync=${sync}`, async () => {
      const error = new Error("owned comparison rejection"),
        fail = () => {
          if (sync) throw error;
          return Promise.reject(error);
        };
      const s = f.fixture({ run: fail });
      s.repo.getStatus = function () {
        assert.equal(this, s.repo);
        return (port === "status" ? fail() : Promise.resolve(f.status())) as never;
      };
      await assert.rejects(s.repo.getBranchComparison(workspace), (e) => e === error);
    });
test("comparison delayed command waits and does not mutate snapshot", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    start = deferred<void>(),
    s = f.fixture({
      run: () => {
        start.resolve();
        return gate.promise;
      },
    }),
    status = f.status();
  s.repo.getStatus = async () => status;
  const before = JSON.stringify(status),
    p = s.repo.getBranchComparison(workspace);
  await start.promise;
  gate.resolve(result({ stdout: comparisonOutput }));
  assert.equal((await p).changes.length, 1);
  assert.equal(JSON.stringify(status), before);
});
for (const empty of [false, true])
  test(`comparison frozen getter/receiver order empty=${empty}`, async () => {
    async function observe(legacy: boolean) {
      const trace: string[] = [],
        s = f.fixture(
          {
            run: () =>
              new Proxy(result({ stdout: comparisonOutput }), {
                get(t, k) {
                  trace.push("result:" + String(k));
                  return Reflect.get(t, k);
                },
              }),
          },
          legacy,
        ),
        status = f.status();
      if (empty) status.summary.trackingBranchName = null;
      for (const key of ["resolution", "summary"] as const)
        status[key] = new Proxy(status[key], {
          get(t, k) {
            trace.push(key + ":" + String(k));
            return Reflect.get(t, k);
          },
        }) as never;
      s.repo.getStatus = function (w) {
        assert.equal(this, s.repo);
        trace.push("status:" + w);
        return Promise.resolve(
          new Proxy(status, {
            get(t, k) {
              trace.push(String(k));
              return Reflect.get(t, k);
            },
          }),
        );
      };
      return { trace, value: await s.repo.getBranchComparison(workspace) };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
