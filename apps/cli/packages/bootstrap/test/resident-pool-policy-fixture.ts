import assert from "node:assert/strict";
import { residentFixture, type PoolCase } from "./resident-pool-fixture.js";

export const residentPolicyCases: PoolCase[] = [
  {
    name: "defaults, invalid option errors and strict high-water admission",
    async run(factory) {
      const failures = [
        [{ targetCount: -1 }, "session resident targetCount must be a non-negative integer"],
        [{ targetCount: 0.5 }, "session resident targetCount must be a non-negative integer"],
        [
          { targetCount: 3, highWaterCount: 2 },
          "session resident highWaterCount must be an integer greater than or equal to targetCount",
        ],
        [
          { highWaterCount: Infinity },
          "session resident highWaterCount must be an integer greater than or equal to targetCount",
        ],
        [{ idleTimeoutMs: NaN }, "session resident idleTimeoutMs must be a non-negative number"],
        [{ idleTimeoutMs: -1 }, "session resident idleTimeoutMs must be a non-negative number"],
      ] as const;
      for (const [options, message] of failures) {
        assert.throws(() => residentFixture(factory, options), { name: "RangeError", message });
      }
      const h = residentFixture(factory);
      for (let index = 0; index < 16; index += 1) h.add(`s${index}`);
      h.pool.rebalance();
      assert.equal(h.residents.size, 16);
      h.add("s16");
      h.pool.rebalance();
      assert.equal(h.residents.size, 8);
      await h.settle();
      assert.equal(h.decisions.length, 9);
      assert.ok(
        h.decisions.every(
          ({ decision }) =>
            decision.idleTimeoutMs === 600000 &&
            decision.targetCount === 8 &&
            decision.highWaterCount === 16,
        ),
      );
      return h.decisions;
    },
  },
  {
    name: "continuous idle TTL resets on a finite earlier touch but not NaN",
    async run(factory) {
      const h = residentFixture(factory, { idleTimeoutMs: 100 });
      h.add("a");
      h.add("b");
      h.pool.rebalance();
      h.state.now = 80;
      h.pool.touch("a", -5);
      h.pool.touch("b", NaN);
      h.pool.rebalance();
      h.state.now = 99;
      h.pool.rebalance();
      assert.equal(h.residents.size, 2);
      h.state.now = 100;
      h.pool.rebalance();
      assert.deepEqual([...h.residents.keys()], ["a"]);
      await h.pool.waitForDeactivation("b");
      h.state.now = 179;
      h.pool.rebalance();
      assert.equal(h.residents.size, 1);
      h.state.now = 180;
      h.pool.rebalance();
      await h.pool.waitForDeactivation("a");
      assert.deepEqual(
        h.decisions.map(({ sessionId, decision }) => [
          sessionId,
          decision.reason,
          decision.idleMs,
          decision.residentCountBefore,
        ]),
        [
          ["b", "idle_timeout", 100, 2],
          ["a", "idle_timeout", 100, 1],
        ],
      );
      return h.decisions;
    },
  },
  {
    name: "LRU uses max activity/touch and session-id ties, then stops at target",
    async run(factory) {
      const h = residentFixture(factory, { targetCount: 1, highWaterCount: 3 });
      h.add("b");
      h.add("a");
      h.add("c", 5);
      h.pool.touch("b", 10);
      h.pool.touch("b", -10);
      h.pool.rebalance();
      assert.equal(h.residents.size, 3);
      h.add("z", 100);
      h.pool.rebalance();
      await Promise.all(["a", "b", "c"].map((id) => h.pool.waitForDeactivation(id)));
      assert.deepEqual([...h.residents.keys()], ["z"]);
      assert.deepEqual(
        h.decisions.map(({ sessionId, decision }) => [sessionId, decision.residentCountBefore]),
        [
          ["a", 4],
          ["c", 3],
          ["b", 2],
        ],
      );
      const tie = residentFixture(factory, { targetCount: 0, highWaterCount: 0 });
      tie.add("b");
      tie.add("a");
      tie.pool.rebalance();
      await Promise.all(["a", "b"].map((id) => tie.pool.waitForDeactivation(id)));
      assert.deepEqual(
        tie.decisions.map((d) => d.sessionId),
        ["a", "b"],
      );
      return { decisions: h.decisions, tie: tie.decisions };
    },
  },
  {
    name: "all residency blockers preserve runtimes, including fresh facts and touch",
    async run(factory) {
      const flags = [
        "persisted",
        "hasResidencyBlockingWork",
        "hasPendingInteractions",
        "hasQueuedCommands",
        "hasSubscribers",
        "hasLegacySubscriber",
      ] as const;
      for (const flag of flags) {
        const h = residentFixture(factory, { targetCount: 0, highWaterCount: 0, idleTimeoutMs: 0 });
        const facts = h.add("blocked");
        facts[flag] = flag !== "persisted";
        h.pool.rebalance();
        assert.equal(h.residents.size, 1, flag);
        facts[flag] = flag === "persisted";
        h.pool.rebalance();
        await h.pool.waitForDeactivation("blocked");
        assert.equal(h.decisions.length, 1, flag);
      }
      const h = residentFixture(factory, { idleTimeoutMs: 10 });
      h.add("a");
      h.add("b");
      h.pool.rebalance();
      h.state.now = 10;
      const reads = new Map<string, number>();
      h.host.readResidencyFacts = (id) => {
        const count = (reads.get(id) ?? 0) + 1;
        reads.set(id, count);
        if (count === 2 && id === "a") h.residents.get(id)!.hasSubscribers = true;
        if (count === 2 && id === "b") h.pool.touch(id);
        return h.residents.get(id) ?? null;
      };
      h.pool.rebalance();
      assert.equal(h.residents.size, 2);
      h.residents.get("a")!.hasSubscribers = false;
      h.host.readResidencyFacts = (id) => h.residents.get(id) ?? null;
      h.state.now = 11;
      h.pool.rebalance();
      h.state.now = 20;
      h.pool.rebalance();
      assert.equal(h.residents.size, 2);
      h.state.now = 21;
      h.pool.rebalance();
      await Promise.all(["a", "b"].map((id) => h.pool.waitForDeactivation(id)));
      assert.equal(h.residents.size, 0);
      return h.decisions;
    },
  },
  {
    name: "a new session lease and recursive sampler cannot bypass admission",
    async run(factory) {
      const h = residentFixture(factory, { idleTimeoutMs: 0 });
      h.add("a");
      h.add("b");
      let lease: Promise<() => void> | undefined;
      let reads = 0;
      h.host.readResidencyFacts = (id) => {
        reads += 1;
        h.pool.rebalance();
        if (reads === 3) lease = h.pool.acquireOperation("a");
        return h.residents.get(id) ?? null;
      };
      h.pool.rebalance();
      assert.equal(h.residents.size, 2);
      const release = await lease!;
      h.host.readResidencyFacts = (id) => h.residents.get(id) ?? null;
      release();
      await Promise.all(["a", "b"].map((id) => h.pool.waitForDeactivation(id)));
      assert.equal(h.residents.size, 0);
      return h.decisions;
    },
  },
  {
    name: "fact-read errors release the rebalance guard and removal resets idle metadata",
    async run(factory) {
      const h = residentFixture(factory, { idleTimeoutMs: 10 });
      h.add("a");
      h.pool.touch("a", 999);
      const error = new Error("owned facts failure");
      h.host.readResidencyFacts = () => {
        throw error;
      };
      assert.throws(
        () => h.pool.rebalance(),
        (observed) => observed === error,
      );
      h.residents.delete("a");
      h.pool.rebalance();
      h.add("a");
      h.host.readResidencyFacts = (id) => h.residents.get(id) ?? null;
      h.state.now = 20;
      h.pool.rebalance();
      h.state.now = 29;
      h.pool.rebalance();
      assert.equal(h.residents.size, 1);
      h.state.now = 30;
      h.pool.rebalance();
      await h.pool.waitForDeactivation("a");
      assert.equal(h.decisions[0]?.decision.idleMs, 10);
      return h.decisions;
    },
  },
];
