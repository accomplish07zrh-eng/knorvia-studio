import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diffReadFixture,
  answer,
  result,
  revOutput,
  statusOutput,
  workspace,
  deferred,
} from "./git-diff-read-fixture-fast-20261001.js";
const f = await diffReadFixture();
type Boundary =
  | "resolve"
  | "resolve-reject"
  | "status"
  | "status-reject"
  | "diff"
  | "diff-reject"
  | "show";
const boundaries: Boundary[] = [
  "resolve",
  "resolve-reject",
  "status",
  "status-reject",
  "diff",
  "diff-reject",
  "show",
];
const mainDiff = (c: Parameters<typeof answer>[0]) =>
  c.args[0] === "diff" && !c.args.includes("--numstat");
function queue(depth: number, fn: () => void) {
  queueMicrotask(() => (depth ? queue(depth - 1, fn) : fn()));
}
async function observe(
  legacy: boolean,
  boundary: Boundary,
  depth: number,
  kind: "queued" | "reentrant" | "invalidate" | "different",
) {
  const events: unknown[] = [],
    ready = deferred<void>();
  let queued!: Promise<unknown>,
    armed = false,
    s!: ReturnType<typeof f.fixture>;
  const query = (key = workspace) => ({
    workspacePath: key,
    path: "owned.txt",
    sourceId: "branch" as const,
  });
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => events.push([label, v]),
      (e) => events.push([label, e.name, e.message]),
    );
  const start = () => {
    events.push("queued-start");
    if (kind === "invalidate") {
      s.repo.invalidate(workspace);
      events.push("invalidate");
    }
    queued = settle(
      "queued",
      s.api.getDiff(query(kind === "different" ? workspace + "/" : workspace)),
    );
    ready.resolve();
  };
  const arm = () => {
    if (!armed) {
      armed = true;
      kind === "reentrant" ? start() : queue(depth, start);
    }
  };
  const e = new Error("owned settlement failure");
  s = f.fixture(
    {
      run: (c) => {
        const hit = boundary.startsWith("resolve")
          ? c.args[0] === "rev-parse"
          : boundary.startsWith("status")
            ? c.args[0] === "status"
            : boundary === "show"
              ? c.args[0] === "show"
              : mainDiff(c);
        if (hit) {
          arm();
          if (boundary.endsWith("reject")) return Promise.reject(e);
        }
        return answer(c);
      },
    },
    legacy,
  );
  const first = settle("first", s.api.getDiff(query()));
  await ready.promise;
  await Promise.all([first, queued]);
  return { events, effects: s.trace, commands: s.commands };
}
for (const b of boundaries)
  test(`frozen diff queued settlement ${b}`, async () => {
    for (const depth of [0, 1, 2, 3, 4, 5, 6])
      assert.deepEqual(
        await observe(false, b, depth, "queued"),
        await observe(true, b, depth, "queued"),
      );
  });
for (const b of boundaries)
  test(`frozen diff reentrant settlement ${b}`, async () => {
    assert.deepEqual(
      await observe(false, b, 0, "reentrant"),
      await observe(true, b, 0, "reentrant"),
    );
  });
for (const kind of ["invalidate", "different"] as const)
  for (const b of ["resolve", "status", "diff"] as const)
    test(`frozen diff ${kind} settlement ${b}`, async () => {
      for (const depth of [0, 2, 4, 6])
        assert.deepEqual(await observe(false, b, depth, kind), await observe(true, b, depth, kind));
    });
async function late(legacy: boolean, phase: "resolve" | "status" | "diff", rejected: boolean) {
  const old = deferred<ReturnType<typeof result>>(),
    next = deferred<ReturnType<typeof result>>(),
    oldStart = deferred<void>(),
    newStart = deferred<void>(),
    events: unknown[] = [];
  let n = 0;
  const s = f.fixture(
    {
      run: (c) => {
        if (
          phase === "resolve"
            ? c.args[0] === "rev-parse"
            : phase === "status"
              ? c.args[0] === "status"
              : mainDiff(c)
        ) {
          if (++n === 1) {
            oldStart.resolve();
            return old.promise;
          }
          if (n === 2) {
            newStart.resolve();
            return next.promise;
          }
        }
        return answer(c);
      },
    },
    legacy,
  );
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => events.push([label, v]),
      (e) => events.push([label, e.message]),
    );
  // resolution 的旧结果若再次进入 branch/status，会合法复用新 gate；本例单独检查清理。
  const query = {
    workspacePath: workspace,
    path: "owned.txt",
    sourceId: phase === "resolve" ? ("staged" as const) : ("branch" as const),
  };
  const a = settle("old", s.api.getDiff(query));
  await oldStart.promise;
  s.repo.invalidate(workspace);
  events.push("invalidate");
  const b = settle("new", s.api.getDiff(query));
  await newStart.promise;
  const value = result({
    stdout: phase === "resolve" ? revOutput : phase === "status" ? statusOutput : "owned patch\n",
  });
  rejected ? old.reject(new Error("owned late outcome")) : old.resolve(value);
  await a;
  const c = settle("shared-or-new", s.api.getDiff(query));
  next.resolve(value);
  await Promise.all([b, c]);
  assert.equal(s.commands.filter(mainDiff).length, rejected && phase !== "diff" ? 2 : 3);
  return { events, effects: s.trace, commands: s.commands, phaseEffects: n };
}
for (const phase of ["resolve", "status", "diff"] as const)
  for (const rejected of [false, true])
    test(`frozen diff late ${phase} rejected=${rejected}`, async () => {
      assert.deepEqual(await late(false, phase, rejected), await late(true, phase, rejected));
    });
