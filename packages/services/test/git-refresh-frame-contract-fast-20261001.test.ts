import assert from "node:assert/strict";
import { test } from "node:test";
import {
  refreshFrameFixture,
  workspace,
  deferred,
  snapshot,
  comparison,
} from "./git-refresh-frame-fixture-fast-20261001.js";
const f = await refreshFrameFixture();
const query = Object.freeze({
  workspacePath: workspace,
  includeIdentity: true,
  includeBranchComparison: true,
});

test("refresh current receiver/parameter reads precede thenable observation", async () => {
  async function observe(legacy: boolean) {
    const events: string[] = [];
    const values = { getStatus: snapshot(), getIdentity: null, getBranchComparison: comparison() };
    const s = f.fixture(
      legacy,
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          () => ({
            get then() {
              events.push(`then-get:${name}`);
              return function (this: unknown, resolve: (v: unknown) => void) {
                events.push(`then:${name}`);
                resolve(value);
              };
            },
          }),
        ]),
      ),
    );
    const params = {
      get workspacePath() {
        events.push("path");
        return workspace;
      },
      get includeIdentity() {
        events.push("identity-flag");
        return true;
      },
      get includeBranchComparison() {
        events.push("branch-flag");
        return true;
      },
    };
    const pending = s.api.refresh(params);
    assert.deepEqual(s.trace, ["getStatus", "getIdentity", "getBranchComparison"]);
    assert.deepEqual(events, [
      "path",
      "identity-flag",
      "path",
      "branch-flag",
      "path",
      "then-get:getStatus",
      "then-get:getIdentity",
      "then-get:getBranchComparison",
    ]);
    const output = await pending;
    return { events, trace: s.trace, output };
  }
  assert.deepEqual(await observe(false), await observe(true));
});

for (const name of ["getIdentity", "getBranchComparison"] as const)
  test(`refresh synchronous ${name} failure stops subsequent acquisition`, async () => {
    const error = new Error(`owned synchronous ${name}`);
    for (const legacy of [false, true]) {
      const s = f.fixture(legacy, {
        [name]: () => {
          throw error;
        },
      });
      await assert.rejects(s.api.refresh(query), (e) => e === error);
      assert.deepEqual(
        s.trace,
        name === "getIdentity"
          ? ["getStatus", "getIdentity"]
          : ["getStatus", "getIdentity", "getBranchComparison"],
      );
    }
  });

for (const first of ["status", "branch"] as const)
  test(`refresh rejection precedence and retained late reads first=${first}`, async () => {
    async function observe(legacy: boolean) {
      const status = deferred<ReturnType<typeof snapshot>>(),
        branch = deferred<ReturnType<typeof comparison>>();
      const events: string[] = [];
      const s = f.fixture(legacy, {
        getStatus: () => status.promise,
        getBranchComparison: () => branch.promise,
      });
      const failure = new Error(`owned ${first} first rejection`);
      const pending = s.api.refresh(query).then(
        () => assert.fail("unexpected refresh"),
        (e) => {
          assert.equal(e, failure);
          events.push("rejected");
        },
      );
      if (first === "status") status.reject(failure);
      else branch.reject(failure);
      await pending;
      events.push("late-settle");
      if (first === "status") branch.resolve(s.branch);
      else status.resolve(s.status);
      await Promise.resolve();
      return { events, trace: s.trace };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });

test("refresh summary failure follows comparison and precedes source projection", async () => {
  const error = new Error("owned summary projection failure");
  for (const legacy of [false, true]) {
    const status = snapshot(),
      branch = comparison(),
      events: string[] = [];
    const changes = branch.changes;
    Object.defineProperty(branch, "changes", {
      get() {
        events.push("branch");
        return changes;
      },
    });
    Object.defineProperty(status, "summary", {
      get() {
        events.push("summary");
        throw error;
      },
    });
    Object.defineProperty(status, "entries", {
      get() {
        assert.fail("source before summary");
      },
    });
    const s = f.fixture(legacy, {
      getStatus: () => Promise.resolve(status),
      getBranchComparison: () => Promise.resolve(branch),
    });
    await assert.rejects(s.api.refresh(query), (e) => e === error);
    assert.deepEqual(events, ["branch", "summary"]);
  }
});

test("refresh disabled/falsy optional values preserve null and frame property order", async () => {
  for (const legacy of [false, true]) {
    const s = f.fixture(legacy, { getBranchComparison: () => Promise.resolve(undefined) });
    const value = await s.api.refresh({ workspacePath: workspace, includeBranchComparison: true });
    assert.equal(value.identity, null);
    assert.equal(value.branchComparison, null);
    assert.deepEqual(s.trace, ["getStatus", "getBranchComparison"]);
    assert.deepEqual(Object.keys(value), [
      "summary",
      "identity",
      "unstagedChanges",
      "stagedChanges",
      "branchComparison",
    ]);
  }
});

for (const rejected of [false, true])
  test(`refresh reentrant/queued completion stays at one await rejected=${rejected}`, async () => {
    async function observe(legacy: boolean) {
      const events: unknown[] = [],
        status = snapshot(),
        ready = deferred<void>();
      const error = new Error("owned queued refresh failure");
      let armed = false,
        nested!: Promise<unknown>,
        s!: ReturnType<typeof f.fixture>;
      const settle = (label: string, p: Promise<unknown>) =>
        p.then(
          (v) => {
            events.push([label, v]);
          },
          (e) => {
            assert.equal(e, error);
            events.push([label, e.message]);
          },
        );
      s = f.fixture(legacy, {
        getStatus: () => {
          if (!armed) {
            armed = true;
            nested = settle("nested", s.api.refresh(query));
            queueMicrotask(() => {
              events.push("queued");
              ready.resolve();
            });
          }
          return rejected ? Promise.reject(error) : Promise.resolve(status);
        },
      });
      const first = settle("first", s.api.refresh(query));
      await ready.promise;
      await Promise.all([first, nested]);
      assert.deepEqual(s.trace, [
        "getStatus",
        "getStatus",
        "getIdentity",
        "getBranchComparison",
        "getIdentity",
        "getBranchComparison",
      ]);
      return { events, trace: s.trace };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
