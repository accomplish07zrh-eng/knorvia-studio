// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// core-01 契约测试：compact 块（C1–C6）。入口用本区公开桶 `src/compact/index.ts`
// （包根在 tsx 下不可加载，见 known-differences.md §2）。
//
// 实测语义备忘（写进 behavior.md）：`groupByAssistantStartedRounds` 把"助手起始的轮"计为一组，
// 首个助手之前的 user 自成一组，因此 `[user, assistant]` 就是 **2 组** → `hasEnoughMessagesToCompact`
// 为 true；该分组函数本身不经桶导出，只能经 `hasEnoughMessagesToCompact` 间接覆盖。
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFile } from "./entry.mjs";

const compact = await loadFile("compact/index");

const user = (text) => ({ role: "user", content: text });
const assistant = (text) => ({ role: "assistant", content: text });
const enoughMessages = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];

test("C1 自动压缩阈值常量与计算（逐字冻结）", () => {
  assert.equal(compact.DEFAULT_COMPACT_CONTEXT_WINDOW, 200000);
  assert.equal(compact.DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS, 32000);
  assert.equal(compact.MAX_OUTPUT_TOKENS_FOR_SUMMARY, 20000);
  assert.equal(compact.AUTOCOMPACT_BUFFER_TOKENS, 13000);
  assert.equal(compact.DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT, 100);
  assert.equal(compact.MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES, 3);

  assert.equal(compact.getAutoCompactOutputReserveTokens({}), 21000);
  assert.equal(compact.getAutoCompactOutputReserveTokens({ maxOutputTokens: 5000 }), 5000);
  assert.equal(compact.getAutoCompactOutputReserveTokens({ maxOutputTokens: 999999 }), 21000);
  assert.equal(compact.getEffectiveContextWindowSize({}), 179000);
  assert.equal(
    compact.getEffectiveContextWindowSize({ contextWindow: 100000, maxOutputTokens: 5000 }),
    95000,
  );
  assert.equal(compact.getEffectiveContextWindowSize({ contextWindow: 1000 }), 0);
  assert.equal(compact.getAutoCompactThreshold({}), 166000);
  assert.equal(
    compact.getAutoCompactThreshold({ contextWindow: 100000, maxOutputTokens: 5000, bufferTokens: 1000 }),
    94000,
  );
});

test("C2 shouldAutoCompact 五分支与决策字段", () => {
  const { shouldAutoCompact } = compact;

  const notEnough = shouldAutoCompact({ messages: [user("u1")] });
  assert.equal(notEnough.shouldCompact, false);
  assert.equal(notEnough.reason, "not_enough_messages");

  const disabled = shouldAutoCompact({
    messages: enoughMessages,
    config: { enabled: false },
  });
  assert.equal(disabled.reason, "disabled", "enabled=false 优先于消息数量判定");

  const breaker = shouldAutoCompact({ messages: enoughMessages, consecutiveFailures: 3 });
  assert.equal(breaker.reason, "circuit_breaker");
  assert.equal(breaker.shouldCompact, false);

  const below = shouldAutoCompact({
    messages: enoughMessages,
    tokenOverride: { source: "provider_usage", tokenCount: 165999 },
  });
  assert.equal(below.reason, "below_threshold");
  assert.equal(below.tokenSource, "provider_usage");
  assert.equal(below.tokenCount, 165999);

  const above = shouldAutoCompact({
    messages: enoughMessages,
    tokenOverride: { source: "provider_usage", tokenCount: 166000 },
  });
  assert.equal(above.reason, "above_threshold");
  assert.equal(above.shouldCompact, true, "达到阈值即压缩（>= 阈值）");

  assert.equal(above.thresholdPercent, 100);
  assert.equal(above.contextWindow, 200000);
  assert.equal(above.effectiveContextWindow, 179000);
  assert.equal(above.threshold, 166000);
  assert.equal(above.outputReserveTokens, 21000);
  assert.equal(typeof above.modelContextBudgetStrategy, "string");
  assert.equal(typeof above.estimatedTokenCount, "number");
  assert.equal(above.providerBaseTokenCount, undefined);

  const withProviderFields = shouldAutoCompact({
    messages: enoughMessages,
    tokenOverride: {
      baseTokenCount: 10,
      cacheReadTokens: 20,
      cacheWriteTokens: 30,
      contextUsageTokenCount: 40,
      incrementalTokenCount: 50,
      outputTokens: 60,
      source: "provider_usage",
      tokenCount: 166000,
    },
  });
  assert.equal(withProviderFields.providerBaseTokenCount, 10);
  assert.equal(withProviderFields.providerCacheReadTokens, 20);
  assert.equal(withProviderFields.providerCacheWriteTokens, 30);
  assert.equal(withProviderFields.providerContextUsageTokenCount, 40);
  assert.equal(withProviderFields.providerIncrementalTokenCount, 50);
  assert.equal(withProviderFields.providerOutputTokens, 60);
});

test("C3 轮次分组语义（经 hasEnoughMessagesToCompact 间接覆盖）", () => {
  const { hasEnoughMessagesToCompact } = compact;
  // 分组规则：助手起始新组；首个助手之前的 user 自成一组。
  assert.equal(hasEnoughMessagesToCompact([]), false);
  assert.equal(hasEnoughMessagesToCompact([user("u1")]), false, "只有一个 user：1 组");
  assert.equal(hasEnoughMessagesToCompact([user("u1"), assistant("a1")]), true, "user+assistant：2 组");
  assert.equal(hasEnoughMessagesToCompact([assistant("a1")]), false, "只有一个 assistant：1 组");
  assert.equal(hasEnoughMessagesToCompact(enoughMessages), true);
  assert.equal(
    hasEnoughMessagesToCompact([user("u1"), assistant("a1"), user("u2"), assistant("a2"), user("u3")]),
    true,
  );
});

test("C4 可摘要消息与 token 估算", () => {
  const { estimateMessageTokens, getMessagesToSummarize } = compact;

  const system = { role: "system", content: "s" };
  const reminder = user("<system-reminder>noise</system-reminder>");
  const kept = getMessagesToSummarize([system, reminder, user("u"), assistant("a")]);
  assert.deepEqual(
    kept.map((message) => message.content),
    ["u", "a"],
  );
  const source = user("u");
  assert.notEqual(getMessagesToSummarize([source])[0], source, "返回浅拷贝，不共享引用");

  assert.equal(estimateMessageTokens([]), 0);
  const one = estimateMessageTokens([user("x".repeat(100))]);
  const two = estimateMessageTokens([user("x".repeat(100)), user("x".repeat(100))]);
  assert.equal(two, one * 2, "估算按消息累加");
  assert.ok(estimateMessageTokens([user("x".repeat(400))]) > one);
  assert.ok(
    estimateMessageTokens([{ role: "assistant", content: "hi", toolCalls: [{ name: "Read", input: { p: 1 } }] }]) >
      estimateMessageTokens([{ role: "assistant", content: "hi" }]),
    "工具调用参数计入估算",
  );
});

test("C5 压缩提示词与摘要格式化", () => {
  const { buildCompactPrompt, formatCompactSummary } = compact;

  const plain = buildCompactPrompt(undefined);
  assert.equal(plain, buildCompactPrompt("   "), "只有空白视同未提供自定义指令");
  assert.ok(plain.length > 0);
  const custom = buildCompactPrompt("focus on tests");
  assert.ok(custom.includes("\n\nAdditional Instructions:\nfocus on tests"));
  assert.equal(custom.replace("\n\nAdditional Instructions:\nfocus on tests", ""), plain);

  assert.equal(formatCompactSummary(undefined), "");
  assert.equal(formatCompactSummary("   "), "");
  assert.equal(
    formatCompactSummary("<analysis>hidden</analysis><summary>  keep me  </summary>"),
    "Summary:\nkeep me",
  );
  assert.equal(formatCompactSummary("a\n\n\n\nb"), "a\n\nb");
  assert.equal(formatCompactSummary("  plain  "), "plain");
});

test("C6 microcompact 阈值与常量（逐字冻结）", () => {
  assert.equal(compact.MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX, "[Old tool result content cleared]");
  assert.equal(compact.MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE, "[Old tool result content cleared]");
  assert.equal(compact.DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS, 5);
  assert.equal(compact.DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS, 256);
  assert.equal(compact.DEFAULT_MICROCOMPACT_THRESHOLD_RATIO, 0.9);
  assert.equal(compact.DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS, 2000);
  assert.deepEqual(
    [...compact.DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS],
    ["Read", "Bash", "Grep", "Glob", "WebFetch", "WebSearch", "Edit", "Write", "ApplyPatch"],
  );
  assert.equal(compact.MAX_COMPACT_PROMPT_TOO_LONG_RETRIES, 3);
  assert.equal(
    compact.COMPACT_PROMPT_TOO_LONG_RETRY_MARKER,
    "[earlier conversation truncated for compaction retry]",
  );
  assert.equal(
    compact.COMPACT_PROMPT_TOO_LONG_USER_MESSAGE,
    "Conversation too long to compact automatically. Try /compact again after narrowing the active context.",
  );

  const { buildDefaultMicrocompactThreshold } = compact;
  assert.equal(buildDefaultMicrocompactThreshold(166000), 149400);
  assert.equal(buildDefaultMicrocompactThreshold(20000), 18000);
  assert.equal(buildDefaultMicrocompactThreshold(1000), 0, "永不为负");
});
