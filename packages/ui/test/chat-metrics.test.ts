import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationSnapshot } from "@knorvia/shared/protocol-v4";
import type { SessionDebugSnapshot } from "@knorvia/shared";
import type { StudioTimeline } from "@knorvia/services";
import {
  nativeChatMetrics,
  externalChatMetrics,
  metricTotal,
  metricNumber,
} from "../src/chat-input-toolbar/chatMetrics.js";

const snapshot = () =>
  ({
    rows: {
      window: [
        {
          kind: "turnHeader",
          rowId: 1,
          turnId: "turn",
          startedAt: 1000,
          endedAt: 3000,
          executionKind: "agent",
        },
      ],
      firstRowId: 1,
    },
    usage: {
      cumulative: { inputTokens: 8000, outputTokens: 1000 },
      contextWindow: { usedTokens: 9000, maxTokens: 100000, cache: { hitRate: 0 } },
    },
  }) as unknown as ConversationSnapshot;
const round = (time: number, index = 1) =>
  ({
    recordedAt: time,
    requestIndex: index,
    tokensPerSecond: 142,
  }) as SessionDebugSnapshot["rounds"][number];

test("native footer separates cumulative tokens, current round speed and zero cache", () => {
  const metrics = nativeChatMetrics(snapshot(), { rounds: [round(500), round(2000, 2)] });
  assert.equal(metrics.rounds, 1);
  assert.equal(metrics.steps, 1);
  assert.equal(metrics.tokensPerSecond, 142);
  assert.equal(metricTotal(metrics.inputTokens, metrics.outputTokens), 9000);
  assert.equal(metrics.cacheHitRate, 0);
  assert.equal(metrics.roundsAtLeast, false);
  assert.equal(nativeChatMetrics(snapshot(), { rounds: [round(500)] }).tokensPerSecond, undefined);
});

test("truncated history and debug windows never masquerade as complete counts", () => {
  const partial = snapshot();
  partial.rows.firstRowId = 0;
  const metrics = nativeChatMetrics(partial, { rounds: [round(2000, 201)] });
  assert.equal(metrics.roundsAtLeast, true);
  assert.equal(metrics.steps, undefined);
});

test("external footer rejects stale run usage and keeps unknown cache distinct from zero", () => {
  const timeline = {
    runs: [{ id: "current" }],
    usage: { runId: "old", turnId: "turn", inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 },
  } as StudioTimeline;
  assert.equal(externalChatMetrics(timeline).inputTokens, undefined);
  timeline.usage!.runId = "current";
  assert.equal(externalChatMetrics(timeline).cacheHitRate, 0);
  delete timeline.usage!.cacheReadTokens;
  assert.equal(externalChatMetrics(timeline).cacheHitRate, undefined);
  timeline.usage!.cacheReadTokens = 200;
  assert.equal(externalChatMetrics(timeline).cacheHitRate, undefined);
  assert.equal(metricTotal(undefined, 10), undefined);
  assert.equal(metricNumber(Number.NaN), undefined);
  assert.equal(metricNumber(-10), undefined);
  assert.equal(metricTotal(Infinity, 10), undefined);
});
