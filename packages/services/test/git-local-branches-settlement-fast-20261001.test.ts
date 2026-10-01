import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localBranchesFixture,
  result,
  revOutput,
  workspace,
  statusOutput,
  branchOutput,
  deferred,
} from "./git-local-branches-fixture-fast-20261001.js";
const f = await localBranchesFixture();
type Boundary = "binary" | "resolve" | "status" | "status-reject" | "refs" | "refs-reject";
function queue(depth: number, fn: () => void) {
  queueMicrotask(() => (depth === 0 ? fn() : queue(depth - 1, fn)));
}
async function observe(
  legacy: boolean,
  boundary: Boundary,
  depth: number,
  invalidate = false,
  reentrant = false,
  different = false,
) {
  const trace: unknown[] = [],
    done = deferred<void>();
  let queued!: Promise<unknown>,
    armed = false,
    s: ReturnType<typeof f.fixture>;
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => trace.push([label, v]),
      (e) => trace.push([label, e.message]),
    );
  const start = () => {
    trace.push("queued-start");
    if (invalidate) {
      s.repo.invalidate(workspace);
      trace.push("invalidate");
    }
    queued = settle("queued", s.repo.listLocalBranches(different ? workspace + "/" : workspace));
    done.resolve();
  };
  const arm = () => {
    if (!armed) {
      armed = true;
      if (reentrant) start();
      else queue(depth, start);
    }
  };
  const error = new Error("owned branches timing rejection");
  s = f.fixture(
    {
      binary: () => {
        trace.push("binary");
        if (boundary === "binary") arm();
        return "owned";
      },
      run: (c) => {
        const op = c.args[0];
        trace.push([op, c.cwd]);
        if (op === "rev-parse") {
          if (boundary === "resolve") arm();
          return result({ stdout: revOutput });
        }
        if (op === "status") {
          if (boundary === "status" || boundary === "status-reject") arm();
          return boundary === "status-reject"
            ? Promise.reject(error)
            : result({ stdout: statusOutput });
        }
        if (op === "diff") return result({ stdout: "" });
        if (boundary === "refs" || boundary === "refs-reject") arm();
        return boundary === "refs-reject"
          ? Promise.reject(error)
          : result({ stdout: branchOutput });
      },
    },
    legacy,
  );
  const first = settle("first", s.repo.listLocalBranches(workspace));
  await done.promise;
  await Promise.all([first, queued]);
  return { trace, commands: s.commands, effects: s.trace };
}
const boundaries: Boundary[] = [
  "binary",
  "resolve",
  "status",
  "status-reject",
  "refs",
  "refs-reject",
];
for (const b of boundaries)
  for (const d of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    test(`local branches frozen queued ${b} depth=${d}`, async () => {
      assert.deepEqual(await observe(false, b, d), await observe(true, b, d));
    });
for (const b of boundaries)
  test(`local branches frozen reentrant ${b}`, async () => {
    assert.deepEqual(
      await observe(false, b, 0, false, true),
      await observe(true, b, 0, false, true),
    );
  });
for (const b of ["status", "status-reject", "refs"] as const)
  for (const d of [1, 3, 5])
    test(`local branches frozen invalidation ${b} depth=${d}`, async () => {
      assert.deepEqual(await observe(false, b, d, true), await observe(true, b, d, true));
    });
for (const b of boundaries)
  test(`local branches frozen different key ${b}`, async () => {
    assert.deepEqual(
      await observe(false, b, 3, false, false, true),
      await observe(true, b, 3, false, false, true),
    );
  });
async function late(legacy: boolean, rejected: boolean, phase: "status" | "refs") {
  const old = deferred<ReturnType<typeof result>>(),
    next = deferred<ReturnType<typeof result>>(),
    start = deferred<void>(),
    nextStart = deferred<void>(),
    trace: unknown[] = [];
  let n = 0;
  const s = f.fixture(
    {
      run: (c) => {
        const op = c.args[0];
        trace.push(op);
        if (op === (phase === "status" ? "status" : "for-each-ref")) {
          if (++n === 1) {
            start.resolve();
            return old.promise;
          }
          if (n === 2) {
            nextStart.resolve();
            return next.promise;
          }
        }
        return result({
          stdout:
            op === "rev-parse"
              ? revOutput
              : op === "status"
                ? statusOutput
                : op === "for-each-ref"
                  ? branchOutput
                  : "",
        });
      },
    },
    legacy,
  );
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => trace.push([label, v]),
      (e) => trace.push([label, e.message]),
    );
  const a = settle("old", s.repo.listLocalBranches(workspace));
  await start.promise;
  s.repo.invalidate(workspace);
  const b = settle("new", s.repo.listLocalBranches(workspace));
  await nextStart.promise;
  if (rejected) old.reject(new Error("owned late branches"));
  else old.resolve(result({ stdout: phase === "status" ? statusOutput : branchOutput }));
  await a;
  const c = settle("shared-or-new", s.repo.listLocalBranches(workspace));
  next.resolve(result({ stdout: phase === "status" ? statusOutput : branchOutput }));
  await Promise.all([b, c]);
  return { trace, commands: s.commands, effects: s.trace };
}
for (const phase of ["status", "refs"] as const)
  for (const rejected of [false, true])
    test(`local branches frozen late ${phase} rejection=${rejected}`, async () => {
      assert.deepEqual(await late(false, rejected, phase), await late(true, rejected, phase));
    });
