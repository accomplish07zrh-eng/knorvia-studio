import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ignoreFixture,
  workspace,
  result,
  revOutput,
  deferred,
} from "./git-ignore-fixture-fast-20261001.js";
const f = await ignoreFixture();
type Boundary =
  | "unavailable"
  | "resolve"
  | "resolve-reject"
  | "realpath"
  | "check"
  | "check-reject";
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
    queuedDone = deferred<void>();
  let queued!: Promise<unknown>,
    armed = false,
    s: ReturnType<typeof f.fixture>;
  const settle = (label: string, promise: Promise<unknown>) =>
    promise.then(
      (value) => trace.push([label, "resolved", value]),
      (error) => trace.push([label, "rejected", error.message]),
    );
  const start = () => {
    trace.push("queued-start");
    if (invalidate) {
      s.repo.invalidate(workspace);
      trace.push("invalidate");
    }
    queued = settle(
      "queued",
      s.repo.getIgnoredPaths(different ? workspace + "/" : workspace, ["item"]),
    );
    queuedDone.resolve();
  };
  const arm = () => {
    if (!armed) {
      armed = true;
      if (reentrant) start();
      else queue(depth, start);
    }
  };
  const error = new Error("owned timing rejection");
  s = f.fixture(
    {
      binary: () => {
        trace.push("binary");
        if (boundary === "unavailable") {
          arm();
          return null;
        }
        return "owned";
      },
      run: (c) => {
        trace.push(["run", c.args[0], c.cwd]);
        if (c.args[0] === "rev-parse") {
          if (boundary === "resolve" || boundary === "resolve-reject") arm();
          return boundary === "resolve-reject"
            ? Promise.reject(error)
            : result({ stdout: revOutput });
        }
        if (boundary === "check" || boundary === "check-reject") arm();
        return boundary === "check-reject"
          ? Promise.reject(error)
          : result({ stdout: "sub/item\n" });
      },
      realpath: (path) => {
        trace.push(["realpath", path]);
        if (boundary === "realpath") arm();
        return path;
      },
    },
    legacy,
  );
  const first = settle("first", s.repo.getIgnoredPaths(workspace, ["item"]));
  await queuedDone.promise;
  await Promise.all([first, queued]);
  return { trace, commands: s.commands.map((c) => c.args), effects: s.trace };
}
const boundaries: Boundary[] = [
  "unavailable",
  "resolve",
  "resolve-reject",
  "realpath",
  "check",
  "check-reject",
];
for (const boundary of boundaries)
  for (const depth of [0, 1, 2, 3, 4, 5, 6, 7])
    test(`ignored frozen settlement ${boundary} depth=${depth}`, async () => {
      assert.deepEqual(await observe(false, boundary, depth), await observe(true, boundary, depth));
    });
for (const boundary of boundaries)
  test(`ignored frozen reentrant ${boundary}`, async () => {
    assert.deepEqual(
      await observe(false, boundary, 0, false, true),
      await observe(true, boundary, 0, false, true),
    );
  });
for (const boundary of ["resolve", "resolve-reject", "realpath", "check"] as const)
  for (const depth of [1, 3, 5])
    test(`ignored frozen invalidation ${boundary} depth=${depth}`, async () => {
      assert.deepEqual(
        await observe(false, boundary, depth, true),
        await observe(true, boundary, depth, true),
      );
    });
for (const boundary of boundaries)
  test(`ignored frozen different-key ${boundary}`, async () => {
    assert.deepEqual(
      await observe(false, boundary, 2, false, false, true),
      await observe(true, boundary, 2, false, false, true),
    );
  });
async function late(legacy: boolean, reject: boolean, boundary: "resolve" | "check") {
  const old = deferred<ReturnType<typeof result>>(),
    next = deferred<ReturnType<typeof result>>(),
    started = deferred<void>(),
    nextStarted = deferred<void>(),
    trace: unknown[] = [];
  let n = 0;
  const s = f.fixture(
    {
      run: (c) => {
        trace.push(c.args[0]);
        if (c.args[0] !== (boundary === "resolve" ? "rev-parse" : "check-ignore"))
          return result({ stdout: revOutput });
        if (++n === 1) {
          started.resolve();
          return old.promise;
        }
        if (n === 2) {
          nextStarted.resolve();
          return next.promise;
        }
        return result({ stdout: "sub/item\n" });
      },
    },
    legacy,
  );
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => trace.push([label, v]),
      (e) => trace.push([label, e.message]),
    );
  const a = settle("old", s.repo.getIgnoredPaths(workspace, ["item"]));
  await started.promise;
  s.repo.invalidate(workspace);
  const b = settle("new", s.repo.getIgnoredPaths(workspace, ["item"]));
  await nextStarted.promise;
  if (reject) old.reject(new Error("owned late reject"));
  else old.resolve(result({ stdout: boundary === "resolve" ? revOutput : "sub/item\n" }));
  await a;
  const c = settle("shared-or-new", s.repo.getIgnoredPaths(workspace, ["item"]));
  next.resolve(result({ stdout: boundary === "resolve" ? revOutput : "sub/item\n" }));
  await Promise.all([b, c]);
  return { trace, commands: s.commands.map((c) => c.args), effects: s.trace };
}
for (const boundary of ["resolve", "check"] as const)
  for (const reject of [false, true])
    test(`ignored frozen late ${boundary} rejection=${reject}`, async () => {
      assert.deepEqual(await late(false, reject, boundary), await late(true, reject, boundary));
    });
