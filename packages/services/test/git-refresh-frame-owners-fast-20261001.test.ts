import assert from "node:assert/strict";
import { test } from "node:test";
import {
  statusOwnerFixture,
  workspace,
  answer,
  result,
  deferred,
} from "./git-status-owner-fixture-fast-20261001.js";
import { frozenRefresh } from "./git-refresh-frame-fixture-fast-20261001.js";
const f = await statusOwnerFixture(),
  bind = await frozenRefresh(f.url);
const query = Object.freeze({
  workspacePath: workspace,
  includeIdentity: false,
  includeBranchComparison: false,
});

for (const rejected of [false, true])
  test(`actual refresh shares queued/reentrant status and retires rejection=${rejected}`, async () => {
    async function observe(legacy: boolean) {
      const gate = deferred<ReturnType<typeof result>>(),
        ready = deferred<void>(),
        events: unknown[] = [];
      const error = new Error("owned status refresh rejection");
      let armed = false,
        nested!: Promise<unknown>,
        s!: ReturnType<typeof f.fixture>;
      const settle = (label: string, p: Promise<unknown>) =>
        p.then(
          (v) => events.push([label, v]),
          (e) => {
            assert.equal(e, error);
            events.push([label, e.message]);
          },
        );
      s = f.fixture({
        run: (c) => {
          if (c.args[0] === "status" && !armed) {
            armed = true;
            nested = settle("nested", s.api.refresh(query));
            ready.resolve();
            return gate.promise;
          }
          return answer(c);
        },
      });
      if (legacy) s.api.refresh = bind(s.repo) as typeof s.api.refresh;
      const first = settle("first", s.api.refresh(query));
      await ready.promise;
      const queued = settle("queued", s.api.refresh(query));
      if (rejected) gate.reject(error);
      else gate.resolve(answer({ args: ["status"] }));
      await Promise.all([first, nested, queued]);
      await s.api.refresh(query);
      assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 2);
      return { events, commands: s.commands, trace: s.trace };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });

test("actual refresh invalidation/different-key late completion does not acquire another owner", async () => {
  async function observe(legacy: boolean) {
    const old = deferred<ReturnType<typeof result>>(),
      ready = deferred<void>(),
      events: string[] = [];
    let armed = false;
    const s = f.fixture({
      run: (c) => {
        if (c.args[0] === "status" && !armed) {
          armed = true;
          ready.resolve();
          return old.promise;
        }
        return answer(c);
      },
    });
    if (legacy) s.api.refresh = bind(s.repo) as typeof s.api.refresh;
    const first = s.api.refresh(query).then((v) => {
      events.push("old");
      return v;
    });
    await ready.promise;
    s.repo.invalidate(workspace);
    const current = await s.api.refresh(query).then((v) => {
      events.push("new");
      return v;
    });
    const other = await s.api.refresh({ ...query, workspacePath: workspace + "/" });
    old.resolve(answer({ args: ["status"] }));
    assert.deepEqual(await first, current);
    assert.equal(other.summary.workspacePath, workspace + "/");
    assert.deepEqual(events, ["new", "old"]);
    await s.api.refresh(query);
    assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 4);
    return { events, commands: s.commands, trace: s.trace };
  }
  assert.deepEqual(await observe(false), await observe(true));
});

test("actual RPC refresh uses the same scoped status owner and public frame", async (t) => {
  const s = f.fixture(),
    remote = f.remote(t, s.api);
  const value = await remote.refresh(query);
  assert.equal(value.summary.workspacePath, workspace);
  assert.equal(value.identity, null);
  assert.equal(value.branchComparison, null);
  assert.deepEqual(
    value.unstagedChanges.map((v) => [v.section, v.added, v.removed]),
    [
      ["unstaged", 4, 1],
      ["untracked", 0, 0],
    ],
  );
  assert.equal(s.commands.length, 4);
  assert.ok(s.commands.slice(1).every((c) => c.timeoutMs === 15000 && c.maxOutputBytes === 524288));
});
