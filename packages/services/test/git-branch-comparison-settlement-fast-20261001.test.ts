import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchComparisonFixture,
  result,
  revOutput,
  workspace,
  statusOutput,
  comparisonOutput,
  isComparison,
  deferred,
} from "./git-branch-comparison-fixture-fast-20261001.js";
const f = await branchComparisonFixture();
type Boundary =
  | "unavailable"
  | "binary"
  | "resolve"
  | "status"
  | "status-reject"
  | "comparison"
  | "comparison-reject";
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
    queued = settle("queued", s.repo.getBranchComparison(different ? workspace + "/" : workspace));
    done.resolve();
  };
  const arm = () => {
    if (!armed) {
      armed = true;
      if (reentrant) start();
      else queue(depth, start);
    }
  };
  const error = new Error("owned comparison timing rejection");
  s = f.fixture(
    {
      binary: () => {
        trace.push("binary");
        if (boundary === "binary" || boundary === "unavailable") arm();
        return boundary === "unavailable" ? null : "owned";
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
        if (op === "diff" && !isComparison(c.args)) return result({ stdout: "" });
        if (boundary === "comparison" || boundary === "comparison-reject") arm();
        return boundary === "comparison-reject"
          ? Promise.reject(error)
          : result({ stdout: comparisonOutput });
      },
    },
    legacy,
  );
  const first = settle("first", s.repo.getBranchComparison(workspace));
  await done.promise;
  await Promise.all([first, queued]);
  return { trace, commands: s.commands, effects: s.trace };
}
const boundaries: Boundary[] = [
  "unavailable",
  "binary",
  "resolve",
  "status",
  "status-reject",
  "comparison",
  "comparison-reject",
];
for (const b of boundaries)
  for (const d of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    test(`branch comparison frozen queued ${b} depth=${d}`, async () => {
      assert.deepEqual(await observe(false, b, d), await observe(true, b, d));
    });
for (const b of boundaries)
  test(`branch comparison frozen reentrant ${b}`, async () => {
    assert.deepEqual(
      await observe(false, b, 0, false, true),
      await observe(true, b, 0, false, true),
    );
  });
for (const b of ["status", "status-reject", "comparison"] as const)
  for (const d of [1, 3, 5])
    test(`branch comparison frozen invalidation ${b} depth=${d}`, async () => {
      assert.deepEqual(await observe(false, b, d, true), await observe(true, b, d, true));
    });
for (const b of boundaries)
  test(`branch comparison frozen different key ${b}`, async () => {
    assert.deepEqual(
      await observe(false, b, 3, false, false, true),
      await observe(true, b, 3, false, false, true),
    );
  });
async function late(legacy: boolean, rejected: boolean, phase: "status" | "comparison") {
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
        if (phase === "status" ? op === "status" : isComparison(c.args)) {
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
                : isComparison(c.args)
                  ? comparisonOutput
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
  const a = settle("old", s.repo.getBranchComparison(workspace));
  await start.promise;
  s.repo.invalidate(workspace);
  const b = settle("new", s.repo.getBranchComparison(workspace));
  await nextStart.promise;
  if (rejected) old.reject(new Error("owned late comparison"));
  else old.resolve(result({ stdout: phase === "status" ? statusOutput : comparisonOutput }));
  await a;
  const c = settle("shared-or-new", s.repo.getBranchComparison(workspace));
  next.resolve(result({ stdout: phase === "status" ? statusOutput : comparisonOutput }));
  await Promise.all([b, c]);
  return { trace, commands: s.commands, effects: s.trace };
}
for (const phase of ["status", "comparison"] as const)
  for (const rejected of [false, true])
    test(`branch comparison frozen late ${phase} rejection=${rejected}`, async () => {
      assert.deepEqual(await late(false, rejected, phase), await late(true, rejected, phase));
    });
