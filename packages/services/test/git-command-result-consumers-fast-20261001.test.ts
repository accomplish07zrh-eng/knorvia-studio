import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commandResultFixture,
  deferred,
  result,
  revArgs,
  workspace,
} from "./git-command-result-fixture-fast-20261001.js";
const f = await commandResultFixture();
const cases = [
  {
    name: "missing directory precedes timeout",
    value: result({ exitCode: -2, stderr: "owned ENOENT", timedOut: true, outputTruncated: true }),
    kind: "not-repository",
  },
  {
    name: "nonrepo precedes timeout",
    value: result({ exitCode: 128, stderr: "Owned OUTSIDE REPOSITORY", timedOut: true }),
    kind: "not-repository",
  },
  {
    name: "timeout precedes truncation",
    value: result({
      exitCode: 128,
      stderr: "owned failure",
      timedOut: true,
      outputTruncated: true,
      timeoutMs: 15000,
      timeoutElapsedMs: 3,
    }),
    message: "git rev-parse timed out after 15000ms (elapsed=7ms, killAt=3ms)",
  },
  {
    name: "truncated failure",
    value: result({ exitCode: 128, outputTruncated: true }),
    message: "git rev-parse output exceeded limit",
  },
  {
    name: "generic failure",
    value: result({ exitCode: null, stderr: " owned fatal\r\n", signal: "SIGTERM" }),
    message: "git rev-parse failed: owned fatal",
  },
  {
    name: "zero exit bypasses checker flags",
    value: result({ timedOut: true, outputTruncated: true }),
    kind: "main-tree",
  },
];
for (const transport of ["service", "RPC"] as const)
  for (const c of cases)
    test(`actual owned result ${transport}/${c.name}`, async (t) => {
      const s = f.fixture({ run: () => Object.freeze(c.value) }),
        api = transport === "RPC" ? f.remote(t, s.api) : s.api,
        pending = api.getWorkspaceRepositoryInfo({ workspacePath: workspace });
      if (c.message) await assert.rejects(pending, { name: "Error", message: c.message });
      else
        assert.deepEqual(await pending, {
          workspacePath: workspace,
          kind: c.kind,
          isGitAvailable: true,
        });
      assert.deepEqual(s.commands, [{ cwd: workspace, args: revArgs, timeoutMs: 15000 }]);
      if (c.kind !== "main-tree")
        assert.ok(
          s.trace.every((v) => !Array.isArray(v) || !["stat", "read"].includes(String(v[0]))),
        );
    });
test("accepted config/diff consumers retain their own priority and shared detail", () => {
  assert.throws(
    () => f.helpers.parseGitConfigValue(result({ exitCode: 2, stderr: " owned config failure " })),
    { message: "git config failed: owned config failure" },
  );
  assert.deepEqual(
    f.helpers.parseGitConfigValue(result({ exitCode: 1, timedOut: true, outputTruncated: true })),
    { scope: null, source: null, value: null },
  );
  const diff = f.helpers.toDiffResult(
    "owned synthetic path",
    result({ exitCode: 2, stderr: " \t", stdout: " owned diff failure " }),
  );
  assert.equal(diff.availability, "unavailable");
  assert.equal(diff.summary, "owned diff failure");
});
test("actual owner keeps queued/reentrant failure cleanup and invalidated late outcomes", async () => {
  const gates = [
      deferred<ReturnType<typeof result>>(),
      deferred<ReturnType<typeof result>>(),
      deferred<ReturnType<typeof result>>(),
    ],
    started = [deferred<void>(), deferred<void>(), deferred<void>()],
    order: string[] = [];
  let count = 0,
    nested: ReturnType<typeof s.repo.resolveRepository> | undefined;
  const s = f.fixture({
    run: () => {
      const index = count++;
      started[index]!.resolve();
      return gates[index]!.promise;
    },
  });
  const watch = <T>(promise: Promise<T>, name: string) => {
    void promise.then(
      () => order.push(`${name}:resolve`),
      () => order.push(`${name}:reject`),
    );
    return promise;
  };
  const a = watch(s.repo.resolveRepository(workspace), "a"),
    b = watch(s.repo.resolveRepository(workspace), "b");
  await started[0]!.promise;
  assert.equal(count, 1);
  const failure = result({ exitCode: 128, stderr: "owned failure" });
  Object.defineProperty(failure, "timedOut", {
    get() {
      nested = watch(s.repo.resolveRepository(workspace), "nested");
      return false;
    },
  });
  gates[0]!.resolve(failure);
  const first = await Promise.allSettled([a, b]);
  assert.ok(
    first.every(
      (v) => v.status === "rejected" && v.reason.message === "git rev-parse failed: owned failure",
    ),
  );
  assert.ok(nested);
  await assert.rejects(nested, { message: "git rev-parse failed: owned failure" });
  assert.equal(count, 1);
  const late = watch(s.repo.resolveRepository(workspace), "late");
  await started[1]!.promise;
  s.repo.invalidate(workspace);
  const current = watch(s.repo.resolveRepository(workspace), "current");
  await started[2]!.promise;
  gates[1]!.resolve(result({ exitCode: 128, stderr: "owned late failure" }));
  await assert.rejects(late, { message: "git rev-parse failed: owned late failure" });
  const joined = watch(s.repo.resolveRepository(workspace), "joined");
  assert.equal(count, 3);
  gates[2]!.resolve(result());
  const [x, y] = await Promise.all([current, joined]);
  assert.equal(x, y);
  assert.deepEqual(order, [
    "a:reject",
    "b:reject",
    "nested:reject",
    "late:reject",
    "current:resolve",
    "joined:resolve",
  ]);
  assert.deepEqual(
    s.commands,
    Array.from({ length: 3 }, () => ({ cwd: workspace, args: revArgs, timeoutMs: 15000 })),
  );
});
