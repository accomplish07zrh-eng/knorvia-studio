import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  current,
  actual,
  historical,
  currentCaller,
  historicalCaller,
  loadCurrent,
  loadHistorical,
  surface,
} from "./workflow-graph-artifacts-fixture.js";
import {
  owned,
  definition,
  seedResponse,
  promptResponse,
  observations,
  withTicks,
  gate,
} from "./workflow-graph-artifacts-ports.js";
type Owner = typeof current;
async function paired(probe: (owner: Owner) => Promise<unknown>) {
  assert.deepEqual(await probe(current), await probe(historical));
}
test(`${surface}: artifact writes preserve admission, identities, late values and settlement`, async () => {
  await paired(async (owner) => {
    const results = [];
    for (const response of ["not json", '{"edges":[{"from":"A","to":"phase:plan"}]}']) {
      const p = owned();
      p.controller.abort();
      assert.equal(
        await withTicks(p, () =>
          owner.seedGraphFromPhaseArtifact(
            p.ctx,
            p.initial,
            definition(),
            response,
            p.controller.signal,
          ),
        ),
        p.initial,
      );
      assert.deepEqual(p.trace, [["resolved", 0]]);
      results.push(observations(p));
    }
    const p = owned(),
      d = definition();
    p.hooks.record = (record) => {
      if (record.recordType === "node") {
        record.node.id = "N-late";
        p.writes[0]!.runId = "late-run";
        d.phase = "late-phase";
        d.title = "Late title";
      }
      return Promise.resolve();
    };
    const out = await withTicks(p, () =>
      owner.seedGraphFromPhaseArtifact(p.ctx, p.initial, d, seedResponse, p.controller.signal),
    );
    assert.equal(out, p.writes[0]);
    assert.equal(out.graph.nodes[0], p.initial.graph.nodes[0]);
    assert.equal(p.records[0]!.recordType, "node");
    if (p.records[0]!.recordType === "node") assert.equal(p.records[0]!.node, out.graph.nodes[2]);
    assert.deepEqual(
      p.records.map((r) => r.recordType),
      ["node", "edge", "collection", "op"],
    );
    assert.equal(p.records[3]!.recordType === "op" && p.records[3]!.phase, "plan");
    assert.equal(p.events[0]!.options.phase, "late-phase");
    assert.equal(p.events[0]!.options.message, "Workflow graph seeded from Late title.");
    assert.deepEqual(p.events[0]!.options.payload, {
      collectionIds: ["K"],
      edgeIds: ["phase:plan->N"],
      nodeIds: ["N-late"],
      sourcePhase: "late-phase",
      targetPhase: "execute",
    });
    results.push(observations(p));
    const q = owned();
    const changed = await withTicks(q, () =>
      owner.updateNodePromptsFromPhaseArtifact(
        q.ctx,
        q.initial,
        definition(),
        promptResponse,
        q.controller.signal,
      ),
    );
    assert.equal(changed, q.writes[0]);
    assert.equal(changed.graph.edges, q.initial.graph.edges);
    assert.equal(changed.graph.collections, q.initial.graph.collections);
    assert.equal(changed.graph.nodes[0], q.initial.graph.nodes[0]);
    assert.notEqual(changed.graph.nodes[1], q.initial.graph.nodes[1]);
    assert.equal(
      await owner.updateNodePromptsFromPhaseArtifact(
        q.ctx,
        changed,
        definition(),
        promptResponse,
        q.controller.signal,
      ),
      changed,
    );
    assert.equal(q.writes.length, 1);
    assert.deepEqual(
      q.records.map((r) => r.recordType),
      ["op"],
    );
    results.push(observations(q));
    return results;
  });
});
test(`${surface}: artifact publication rejects original failures and retains partial writes`, async () => {
  await paired(async (owner) => {
    const results = [];
    for (const entry of [
      "seedGraphFromPhaseArtifact",
      "updateNodePromptsFromPhaseArtifact",
    ] as const) {
      for (const stage of ["record", "event"] as const) {
        const p = owned(),
          error = new Error(`Owned ${stage} failure`);
        if (stage === "record")
          p.hooks.record = () => {
            p.controller.abort();
            throw error;
          };
        else p.hooks.event = () => Promise.reject(error);
        await assert.rejects(
          withTicks(p, () =>
            owner[entry](
              p.ctx,
              p.initial,
              definition(),
              entry === "seedGraphFromPhaseArtifact" ? seedResponse : promptResponse,
              p.controller.signal,
            ),
          ),
          (e) => e === error,
        );
        assert.equal(p.writes.length, 1);
        assert.equal(p.events.length, stage === "event" ? 1 : 0);
        results.push(observations(p));
      }
    }
    const p = owned(),
      error = new Error("Owned duplicate");
    p.hooks.write = () => ({
      get then() {
        throw error;
      },
    });
    await assert.rejects(
      owner.seedGraphFromPhaseArtifact(
        p.ctx,
        p.initial,
        definition(),
        seedResponse,
        p.controller.signal,
      ),
      (e) => e === error,
    );
    assert.equal(p.records.length, 0);
    assert.equal(p.events.length, 0);
    results.push(observations(p));
    return results;
  });
});
test(`${surface}: artifact delayed persistence and real run-loop consumer`, async () => {
  await paired(async (owner) => {
    const a = owned(),
      b = owned(),
      hold = gate<void>();
    a.hooks.write = () => hold.promise;
    const pending = owner.seedGraphFromPhaseArtifact(
      a.ctx,
      a.initial,
      definition(),
      seedResponse,
      a.controller.signal,
    );
    assert.equal(a.records.length, 0);
    const second = await owner.updateNodePromptsFromPhaseArtifact(
      b.ctx,
      b.initial,
      definition(),
      promptResponse,
      b.controller.signal,
    );
    assert.equal(second, b.writes[0]);
    assert.equal(a.records.length, 0);
    hold.resolve();
    assert.equal(await pending, a.writes[0]);
    return [observations(a), observations(b)];
  });
  async function consume(caller: typeof currentCaller) {
    const p = owned();
    const options = { abortSignal: p.controller.signal } as Parameters<
      typeof caller.continueRun
    >[2];
    const out = await caller.continueRun(p.ctx, p.initial, options);
    assert.equal(out.snapshot, p.writes[1]);
    assert.equal(p.writes.length, 2);
    assert.deepEqual(
      p.events.map((event) => event.type),
      ["graph_expanded", "graph_updated"],
    );
    assert.equal(p.writes[0]!.graph.nodes[2], p.writes[1]!.graph.nodes[2]);
    return { out, observations: observations(p) };
  }
  assert.deepEqual(await consume(currentCaller), await consume(historicalCaller));
});
test(`${surface}: artifact exact owner and historical selectors fail closed`, async () => {
  assert.equal(current.seedGraphFromPhaseArtifact, actual.seedGraphFromPhaseArtifact);
  assert.notEqual(current.seedGraphFromPhaseArtifact, historical.seedGraphFromPhaseArtifact);
  await assert.rejects(loadHistorical(async () => "wrong"));
  for (const suffix of ["expert/graph-artifacts.ts", "expert/graph-artifacts.js"]) {
    await assert.rejects(
      loadCurrent((url) =>
        url.pathname.endsWith(suffix) ? Promise.resolve("wrong") : readFile(url, "utf8"),
      ),
    );
  }
});
