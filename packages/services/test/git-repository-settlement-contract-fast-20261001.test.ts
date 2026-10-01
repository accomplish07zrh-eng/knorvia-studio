import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deferred,
  entry,
  result,
  workspace,
} from "./git-repository-resolution-fixture-fast-20261001.js";
import { settlementFixture } from "./git-repository-settlement-fixture-fast-20261001.js";
const f = await settlementFixture();
type Boundary = "unavailable" | "run" | "binary-reject" | "run-reject" | "stat" | "read";
function queue(depth: number, callback: () => void) {
  queueMicrotask(() => (depth === 0 ? callback() : queue(depth - 1, callback)));
}
async function observe(
  legacy: boolean,
  boundary: Boundary,
  depth: number,
  invalidate = false,
  reentrant = false,
  different = false,
) {
  const trace: unknown[] = [];
  const queuedDone = deferred<void>();
  let queued!: Promise<unknown>;
  let armed = false;
  let s: ReturnType<typeof f.fixture>;
  const key = different ? workspace + "/" : workspace;
  const method =
    boundary === "stat" || boundary === "read" ? "getWorkspaceRepositoryInfo" : "resolveRepository";
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (value) => {
        trace.push([
          label,
          "resolved",
          (value as { kind?: string }).kind ?? (value as { isRepository?: boolean }).isRepository,
        ]);
      },
      (error) => {
        trace.push([label, "rejected", error.message]);
      },
    );
  const start = () => {
    trace.push("queued-start");
    if (invalidate) {
      s.repo.invalidate(workspace);
      trace.push("invalidate");
    }
    queued = settle("queued", s.repo[method](key));
    queuedDone.resolve();
  };
  const arm = () => {
    if (!armed) {
      armed = true;
      if (reentrant) start();
      else queue(depth, start);
    }
  };
  const fail = new Error("owned settlement rejection");
  s = f.fixture(legacy, {
    binary: () => {
      trace.push("binary");
      if (boundary === "unavailable" || boundary === "binary-reject") {
        arm();
        return boundary === "unavailable" ? null : Promise.reject(fail);
      }
      return "owned";
    },
    run: () => {
      trace.push("run");
      if (boundary === "run" || boundary === "run-reject") arm();
      return boundary === "run-reject" ? Promise.reject(fail) : result();
    },
    stat: () => {
      trace.push("stat");
      if (boundary === "stat") arm();
      return entry(boundary === "stat", true);
    },
    read: () => {
      trace.push("read");
      arm();
      return "gitdir: /owned/.git/worktrees/one";
    },
  });
  // Reentrant discovery requires the repo to exist before the first invocation.
  const first = settle("first", s.repo[method](workspace));
  await queuedDone.promise;
  await Promise.all([first, queued]);
  return { trace, commands: s.commands.length };
}
for (const boundary of [
  "unavailable",
  "run",
  "binary-reject",
  "run-reject",
  "stat",
  "read",
] as const)
  for (const depth of [0, 1, 2, 3, 4, 5, 6, 7])
    test(`frozen settlement ${boundary} queued depth=${depth}`, async () => {
      assert.deepEqual(await observe(false, boundary, depth), await observe(true, boundary, depth));
    });
for (const boundary of [
  "unavailable",
  "run",
  "binary-reject",
  "run-reject",
  "stat",
  "read",
] as const)
  test(`frozen synchronous reentrant ${boundary}`, async () => {
    assert.deepEqual(
      await observe(false, boundary, 0, false, true),
      await observe(true, boundary, 0, false, true),
    );
  });
for (const boundary of ["run", "run-reject", "stat", "read"] as const)
  for (const depth of [1, 3, 5])
    test(`frozen invalidation during settlement ${boundary} depth=${depth}`, async () => {
      assert.deepEqual(
        await observe(false, boundary, depth, true),
        await observe(true, boundary, depth, true),
      );
    });
for (const boundary of ["unavailable", "run", "stat", "read"] as const)
  test(`frozen different key around settlement ${boundary}`, async () => {
    assert.deepEqual(
      await observe(false, boundary, 2, false, false, true),
      await observe(true, boundary, 2, false, false, true),
    );
  });
async function late(legacy: boolean, reject: boolean) {
  const trace: string[] = [],
    old = deferred<ReturnType<typeof result>>(),
    next = deferred<ReturnType<typeof result>>(),
    started = deferred<void>(),
    nextStarted = deferred<void>();
  let n = 0;
  const s = f.fixture(legacy, {
    run: () => {
      trace.push(`run${++n}`);
      if (n === 1) {
        started.resolve();
        return old.promise;
      }
      nextStarted.resolve();
      return next.promise;
    },
  });
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      () => trace.push(label + " resolved"),
      () => trace.push(label + " rejected"),
    );
  const a = settle("old", s.repo.resolveRepository(workspace));
  await started.promise;
  s.repo.invalidate(workspace);
  const b = settle("new", s.repo.resolveRepository(workspace));
  await nextStarted.promise;
  if (reject) old.reject(new Error("owned late"));
  else old.resolve(result());
  await a;
  const c = settle("shared", s.repo.resolveRepository(workspace));
  next.resolve(result());
  await Promise.all([b, c]);
  return { trace, commands: s.commands.length };
}
for (const reject of [false, true])
  test(`frozen late old completion rejection=${reject}`, async () => {
    assert.deepEqual(await late(false, reject), await late(true, reject));
  });
