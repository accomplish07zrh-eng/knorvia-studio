import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityReadFixture,
  identityAnswer,
  result,
  deferred,
  workspace,
  revOutput,
} from "./git-identity-read-fixture-fast-20261001.js";
const f = await identityReadFixture();
type Phase = "resolve" | "resolve-reject" | "config" | "config-reject";
function queue(depth: number, fn: () => void) {
  queueMicrotask(() => (depth ? queue(depth - 1, fn) : fn()));
}
async function observe(
  legacy: boolean,
  phase: Phase,
  mode: "queued" | "reentrant" | "invalidate" | "different",
  depth: number,
) {
  const events: unknown[] = [],
    ready = deferred<void>();
  let armed = false,
    queued!: Promise<unknown>,
    s!: ReturnType<typeof f.fixture>;
  const settle = (label: string, p: Promise<unknown>) =>
    p.then(
      (v) => events.push([label, v]),
      (e) => events.push([label, e.message]),
    );
  const start = () => {
    events.push("start");
    if (mode === "invalidate") {
      s.repo.invalidate(workspace);
      events.push("invalidate");
    }
    queued = settle(
      "queued",
      s.api.getIdentity({ workspacePath: mode === "different" ? workspace + "/" : workspace }),
    );
    ready.resolve();
  };
  s = f.fixture(
    {
      run: (c) => {
        if (
          (phase.startsWith("resolve") ? c.args[0] === "rev-parse" : c.args[0] === "config") &&
          !armed
        ) {
          armed = true;
          if (mode === "reentrant") start();
          else queue(depth, start);
          if (phase.endsWith("reject"))
            return Promise.reject(new Error("owned identity settlement rejection"));
        }
        return identityAnswer(c);
      },
    },
    legacy,
  );
  const first = settle("first", s.api.getIdentity({ workspacePath: workspace }));
  await ready.promise;
  await Promise.all([first, queued]);
  return { events, effects: s.trace, commands: s.commands };
}
for (const phase of ["resolve", "resolve-reject", "config", "config-reject"] as const)
  test(`frozen identity queued/reentrant ${phase}`, async () => {
    for (const depth of [0, 2, 4])
      assert.deepEqual(
        await observe(false, phase, "queued", depth),
        await observe(true, phase, "queued", depth),
      );
    assert.deepEqual(
      await observe(false, phase, "reentrant", 0),
      await observe(true, phase, "reentrant", 0),
    );
  });
for (const mode of ["invalidate", "different"] as const)
  test(`frozen identity ${mode} resolution settlement`, async () => {
    for (const depth of [0, 2, 4])
      assert.deepEqual(
        await observe(false, "resolve", mode, depth),
        await observe(true, "resolve", mode, depth),
      );
  });
for (const reject of [false, true])
  test(`frozen identity late resolution reject=${reject}`, async () => {
    async function observe(legacy: boolean) {
      const old = deferred<ReturnType<typeof result>>(),
        next = deferred<ReturnType<typeof result>>(),
        oldStart = deferred<void>(),
        newStart = deferred<void>(),
        events: unknown[] = [];
      let n = 0;
      const s = f.fixture(
        {
          run: (c) => {
            if (c.args[0] === "rev-parse") {
              if (++n === 1) {
                oldStart.resolve();
                return old.promise;
              }
              if (n === 2) {
                newStart.resolve();
                return next.promise;
              }
            }
            return identityAnswer(c);
          },
        },
        legacy,
      );
      const settle = (label: string, p: Promise<unknown>) =>
        p.then(
          (v) => events.push([label, v]),
          (e) => events.push([label, e.message]),
        );
      const a = settle("old", s.api.getIdentity({ workspacePath: workspace }));
      await oldStart.promise;
      s.repo.invalidate(workspace);
      const b = settle("new", s.api.getIdentity({ workspacePath: workspace }));
      await newStart.promise;
      if (reject) old.reject(new Error("owned late resolution"));
      else old.resolve(result({ stdout: revOutput }));
      await a;
      const c = settle("shared", s.api.getIdentity({ workspacePath: workspace }));
      next.resolve(result({ stdout: revOutput }));
      await Promise.all([b, c]);
      assert.equal(n, 2);
      assert.equal(s.commands.filter((c) => c.args[0] === "config").length, reject ? 4 : 6);
      return { events, effects: s.trace };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
test("frozen identity retains live other read after rejection and admits a fresh read", async () => {
  async function observe(legacy: boolean) {
    const live = deferred<ReturnType<typeof result>>(),
      started = deferred<void>(),
      events: unknown[] = [];
    let n = 0;
    const s = f.fixture(
      {
        run: (c) => {
          if (c.args[0] !== "config") return identityAnswer(c);
          if (++n === 1) return Promise.reject(new Error("owned early name rejection"));
          if (n === 2) {
            started.resolve();
            return live.promise;
          }
          return identityAnswer(c);
        },
      },
      legacy,
    );
    const first = s.api.getIdentity({ workspacePath: workspace });
    await started.promise;
    try {
      await first;
    } catch (e) {
      events.push((e as Error).message);
    }
    events.push(await s.api.getIdentity({ workspacePath: workspace }));
    live.resolve(result({ stdout: "global\towned-source\towned@example.invalid\n" }));
    await Promise.resolve();
    assert.equal(n, 4);
    return { events, effects: s.trace };
  }
  assert.deepEqual(await observe(false), await observe(true));
});
test("frozen synchronous command getters and returned thenables retain receiver/read order", async () => {
  async function observe(legacy: boolean) {
    const events: string[] = [],
      s = f.fixture(
        {
          run: (c) => {
            if (c.args[0] !== "config") return identityAnswer(c);
            const label = c.args.at(-1)!;
            events.push(label + "-run");
            const value = identityAnswer(c);
            const thenable = {
              // eslint-disable-next-line unicorn/no-thenable -- Owned fake Promise-like port tests real Promise.all order.
              get then() {
                events.push(label + "-then-get");
                return function (this: unknown, resolve: (r: typeof value) => void) {
                  assert.equal(this, thenable);
                  events.push(label + "-then-call");
                  resolve(value);
                };
              },
            };
            return thenable;
          },
        },
        legacy,
      );
    const original = s.repo.resolveRepository;
    Object.defineProperty(s.repo, "resolveRepository", {
      get() {
        events.push("resolve-get");
        return function (this: unknown, p: string) {
          assert.equal(this, s.repo);
          events.push("resolve-call");
          return original.call(s.repo, p);
        };
      },
    });
    const query = {
      get workspacePath() {
        events.push("workspace");
        return workspace;
      },
    };
    const output = await s.api.getIdentity(query);
    assert.ok(events.indexOf("user.email-run") < events.indexOf("user.name-then-get"));
    return { output, events, effects: s.trace };
  }
  assert.deepEqual(await observe(false), await observe(true));
});
