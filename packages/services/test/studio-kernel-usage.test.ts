import assert from "node:assert/strict";
import test from "node:test";
import type { StudioKernelEvent } from "../src/studio-runtime/kernelTypes.js";
import { mergeKernelUsage, claudeInputTokens } from "../src/studio-runtime/domain/kernelUsage.js";
import { KernelRun } from "../src/studio-runtime/adapters/kernels/kernelRun.js";
import { codexMessage } from "../src/studio-runtime/adapters/kernels/codexProtocol.js";
import { claudeMessage } from "../src/studio-runtime/adapters/kernels/claudeProtocol.js";
import { acpMessage } from "../src/studio-runtime/adapters/kernels/acpProtocol.js";

function fixture() {
  const events: StudioKernelEvent[] = [];
  const run = new KernelRun(
    {
      runId: "run",
      turnId: "turn",
      conversationId: "chat",
      kernel: "codex",
      workspacePath: "D:/fixture",
      permission: "ask",
      text: "offline",
    },
    {
      emit: async (event) => {
        events.push(event);
      },
      ask: async () => {
        throw new Error("unexpected interaction");
      },
    },
  );
  return { run, events };
}

test("partial and repeated native snapshots preserve context without double-counting", () => {
  const usage = {
    scope: "request" as const,
    inputTokens: 900,
    outputTokens: 100,
    cacheReadTokens: 0,
  };
  const first = mergeKernelUsage({ contextUsedTokens: 1000, contextMaxTokens: 100000 }, usage);
  assert.deepEqual(mergeKernelUsage(first, usage), first);
  assert.equal(mergeKernelUsage(first, { contextUsedTokens: 1200 }).inputTokens, 900);
  assert.equal(
    mergeKernelUsage(first, { scope: "request", inputTokens: 1000, outputTokens: 200 })
      .cacheReadTokens,
    undefined,
  );
  assert.equal(
    mergeKernelUsage(first, { contextUsedTokens: NaN, contextMaxTokens: -1 }).contextMaxTokens,
    100000,
  );
  assert.equal(
    claudeInputTokens({
      input_tokens: 10,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 10,
    }),
    100,
  );
});

test("Codex uses last request for usage and its explicit context capacity", async () => {
  const { run, events } = fixture();
  await codexMessage(run, {
    method: "thread/tokenUsage/updated",
    params: {
      tokenUsage: {
        last: { inputTokens: 90, outputTokens: 10, totalTokens: 100, cachedInputTokens: 50 },
        total: { inputTokens: 9999 },
        modelContextWindow: 10000,
      },
    },
  });
  await run.flush();
  assert.deepEqual(events[0], {
    type: "usage",
    scope: "request",
    inputTokens: 90,
    outputTokens: 10,
    cacheReadTokens: 50,
    contextUsedTokens: 100,
    contextMaxTokens: 10000,
  });
});

test("ACP used/size are context, never billed input or output", async () => {
  const { run, events } = fixture();
  await acpMessage(run, {
    method: "session/update",
    params: { update: { sessionUpdate: "usage_update", used: 9000, size: 100000 } },
  });
  await run.flush();
  const usage = events[0];
  assert.equal(usage.type, "usage");
  if (usage.type !== "usage") throw new Error("missing usage");
  assert.equal(usage.contextUsedTokens, 9000);
  assert.equal(usage.contextMaxTokens, 100000);
  assert.equal(usage.inputTokens, undefined);
  assert.equal(usage.outputTokens, undefined);
});

test("Claude normalizes cache input and exposes model steps without inventing throughput", async () => {
  const { run, events } = fixture();
  await claudeMessage(run, {
    type: "assistant",
    message: {
      content: [],
      usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 90 },
    },
  });
  await claudeMessage(run, {
    type: "result",
    subtype: "success",
    num_turns: 2,
    usage: {
      input_tokens: 20,
      output_tokens: 8,
      cache_read_input_tokens: 180,
      cache_creation_input_tokens: 0,
    },
    modelUsage: { fixture: { contextWindow: 100000 } },
  });
  await run.flush();
  const usages = events.filter((event) => event.type === "usage");
  const final = usages.reduce((previous, next) => mergeKernelUsage(previous, next), {});
  assert.deepEqual(final, {
    contextUsedTokens: 104,
    contextMaxTokens: 100000,
    scope: "turn",
    inputTokens: 200,
    outputTokens: 8,
    cacheReadTokens: 180,
    cacheWriteTokens: 0,
    modelSteps: 2,
  });
});
