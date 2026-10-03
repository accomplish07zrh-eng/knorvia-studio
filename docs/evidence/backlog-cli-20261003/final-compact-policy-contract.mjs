// Pure policy regression: synthetic messages only, no runtime/provider/storage IO.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  shouldAutoCompact,
} from "../../../apps/cli/packages/core/src/compact/policy.ts";

const messages = Object.freeze([
  Object.freeze({ role: "user", content: "fixture user one" }),
  Object.freeze({ role: "assistant", content: "fixture assistant one" }),
  Object.freeze({ role: "user", content: "fixture user two" }),
  Object.freeze({ role: "assistant", content: "fixture assistant two" }),
]);
const providerUsage = Object.freeze({
  source: "provider_usage",
  tokenCount: 0,
  baseTokenCount: 11,
  cacheReadTokens: 9,
  cacheWriteTokens: 3,
  contextUsageTokenCount: 55,
  incrementalTokenCount: 4,
  outputTokens: 12,
});

const branches = [
  ["disabled", { config: { enabled: false }, consecutiveFailures: MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES }],
  ["not_enough_messages", { messages: [], consecutiveFailures: MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES }],
  ["circuit_breaker", { consecutiveFailures: MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES }],
  ["below_threshold", {}],
  ["above_threshold", { config: { contextWindow: 0, maxOutputTokens: 0, bufferTokens: 0 } }],
];

for (const [reason, options] of branches) {
  test(`${reason} retains both token source alternatives and provider metrics`, () => {
    const estimate = shouldAutoCompact({ messages, ...options });
    const provider = shouldAutoCompact({ messages, ...options, tokenOverride: providerUsage });
    for (const decision of [estimate, provider]) {
      assert.equal(decision.reason, reason);
      assert.equal(decision.shouldCompact, reason === "above_threshold");
      assert.equal(decision.thresholdPercent, 100);
      assert.equal(decision.modelContextBudgetStrategy, "preflight-v1");
      assert.deepEqual(Object.keys(decision), [
        "contextWindow", "effectiveContextWindow", "estimatedTokenCount",
        "providerCacheReadTokens", "providerCacheWriteTokens", "maxOutputTokens",
        "modelContextBudgetStrategy", "outputReserveTokens", "providerBaseTokenCount",
        "providerContextUsageTokenCount", "providerIncrementalTokenCount", "providerOutputTokens",
        "threshold", "thresholdPercent", "tokenCount", "tokenSource", "shouldCompact", "reason",
      ]);
    }
    assert.equal(estimate.tokenSource, "estimate");
    assert.equal(estimate.tokenCount, estimate.estimatedTokenCount);
    assert.equal(estimate.providerBaseTokenCount, undefined);
    assert.equal(estimate.providerCacheReadTokens, undefined);
    assert.equal(provider.tokenSource, "provider_usage");
    assert.equal(provider.tokenCount, 0);
    assert.equal(provider.providerBaseTokenCount, 11);
    assert.equal(provider.providerCacheReadTokens, 9);
    assert.equal(provider.providerCacheWriteTokens, 3);
    assert.equal(provider.providerContextUsageTokenCount, 55);
    assert.equal(provider.providerIncrementalTokenCount, 4);
    assert.equal(provider.providerOutputTokens, 12);
    assert.deepEqual(Object.keys(providerUsage), [
      "source", "tokenCount", "baseTokenCount", "cacheReadTokens", "cacheWriteTokens",
      "contextUsageTokenCount", "incrementalTokenCount", "outputTokens",
    ]);
  });
}
