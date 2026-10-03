import assert from "node:assert/strict";
import { deferred, residentFixture, type PoolCase } from "./resident-pool-fixture.js";

export const residentLifecycleCases: PoolCase[] = [
  {
    name: "duplicate, overlapping and process-only leases release exactly once",
    async run(factory) {
      const h = residentFixture(factory, { targetCount: 0, highWaterCount: 0 });
      h.add("a");
      h.add("b");
      const firstPending = h.pool.acquireOperation(["a", "a", "", "b"]);
      h.pool.rebalance();
      assert.equal(h.state.reads, 0);
      const first = await firstPending;
      const second = await h.pool.acquireOperation("a");
      const global = await h.pool.acquireOperation();
      const initialClocks = h.state.clocks;
      first();
      first();
      assert.equal(h.state.clocks, initialClocks + 2);
      second();
      assert.equal(h.residents.size, 2);
      global();
      global();
      await Promise.all(["a", "b"].map((id) => h.pool.waitForDeactivation(id)));
      assert.equal(h.residents.size, 0);
      return { clocks: h.state.clocks, decisions: h.decisions };
    },
  },
  {
    name: "synchronous removal precedes a shared gate covering close and notification",
    async run(factory) {
      const h = residentFixture(factory, { idleTimeoutMs: 0 });
      h.add("a");
      const close = deferred();
      const notified = deferred();
      const events: string[] = [];
      h.host.deactivate = (id) => {
        events.push("removed");
        h.residents.delete(id);
        return close.promise;
      };
      h.host.onDeactivated = () => {
        events.push("notified");
        return notified.promise;
      };
      h.pool.rebalance();
      assert.equal(h.residents.size, 0);
      const gate = h.pool.waitForDeactivation("a");
      assert.equal(h.pool.waitForDeactivation("a"), gate);
      let acquired = false;
      const next = h.pool.acquireOperation("a").then((release) => {
        acquired = true;
        events.push("acquired");
        return release;
      });
      await Promise.resolve();
      assert.equal(acquired, false);
      close.resolve();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(events, ["removed", "notified"]);
      assert.equal(acquired, false);
      notified.resolve();
      const release = await next;
      assert.notEqual(h.pool.waitForDeactivation("a"), gate);
      release();
      assert.deepEqual(events, ["removed", "notified", "acquired"]);
      return events;
    },
  },
  {
    name: "sync failures do not decrement capacity and successful notices can fail",
    async run(factory) {
      const h = residentFixture(factory, { targetCount: 0, highWaterCount: 0 });
      h.add("a");
      h.add("b");
      const syncError = new Error("owned sync failure");
      const noticeError = new Error("owned notice failure");
      const errors: { id: string; message: string; count: number }[] = [];
      h.host.deactivate = (id) => {
        if (id === "a") throw syncError;
        h.residents.delete(id);
        return Promise.resolve();
      };
      h.host.onDeactivated = () => {
        throw noticeError;
      };
      h.host.onError = (id, error, decision) => {
        assert.equal(error, id === "a" ? syncError : noticeError);
        errors.push({ id, message: (error as Error).message, count: decision.residentCountBefore });
      };
      h.pool.rebalance();
      await h.pool.waitForDeactivation("b");
      assert.deepEqual(errors, [
        { id: "a", message: syncError.message, count: 2 },
        { id: "b", message: noticeError.message, count: 2 },
      ]);
      assert.deepEqual([...h.residents.keys()], ["a"]);
      return errors;
    },
  },
  {
    name: "gate rejection cleans ownership and a failed acquisition releases process lease",
    async run(factory) {
      const h = residentFixture(factory, { idleTimeoutMs: 0 });
      h.add("a");
      const close = deferred();
      const closeError = new Error("owned close failure");
      const noticeError = new Error("owned error-handler failure");
      const events: string[] = [];
      h.host.deactivate = (id) => {
        h.residents.delete(id);
        return id === "a" ? close.promise : Promise.resolve();
      };
      h.host.onError = (id, error) => {
        assert.equal(id, "a");
        assert.equal(error, closeError);
        events.push("error");
        throw noticeError;
      };
      h.pool.rebalance();
      const gate = h.pool.waitForDeactivation("a");
      const acquired = h.pool.acquireOperation("a");
      const rejectedGate = assert.rejects(gate, (error) => error === noticeError);
      const rejectedAcquire = assert.rejects(acquired, (error) => error === noticeError);
      h.add("b");
      close.reject(closeError);
      await Promise.all([rejectedGate, rejectedAcquire]);
      await h.pool.waitForDeactivation("b");
      assert.notEqual(h.pool.waitForDeactivation("a"), gate);
      assert.equal(h.residents.size, 0);
      assert.equal(h.decisions.length, 1);
      return { events, decisions: h.decisions };
    },
  },
];
