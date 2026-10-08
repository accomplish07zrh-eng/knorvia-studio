import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionEventType } from "@knorvia/contracts";
import { ProductProjection } from "../src/protocol-v4/product-projection.js";
import { event } from "./session-projection-fixture.js";

// specs/knorvia-composer-polish-20261008.md：对话底部缓存命中不应在缺少命中率的请求后变回「—」。
test("cache hit rate survives a model completion without cache data", () => {
  const projection = new ProductProjection("fixture-session", "epoch");
  const cache = {
    hitRate: 0.5,
    hitRateRequestCount: 1,
    totalInputTokens: 100,
    totalCacheReadTokens: 50,
  };
  projection.applyEvent(
    event(
      SessionEventType.ModelComplete,
      {
        querySource: "main_turn",
        contextWindow: 1000,
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 },
        cacheHit: cache,
      },
      100,
      1,
    ),
  );
  assert.deepEqual(projection.getSnapshot().usage.contextWindow?.cache, cache);
  projection.applyEvent(
    event(
      SessionEventType.ModelComplete,
      {
        querySource: "main_turn",
        contextWindow: 1000,
        usage: { inputTokens: 20, outputTokens: 5 },
      },
      200,
      2,
    ),
  );
  const usage = projection.getSnapshot().usage;
  assert.deepEqual(usage.contextWindow?.cache, cache);
  assert.equal(usage.cumulative.inputTokens, 120);
  assert.equal(usage.cumulative.outputTokens, 15);
});
