// SPDX-License-Identifier: Apache-2.0
// 上下文前缀重建、历史条目，以及自动压缩决策的日志字段。
import type { AutoCompactDecision } from "../../../compact/policy.js";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { countContextPrefixMessages, type ContextBuildResult, type Model } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";

export function autoCompactDecisionLogContext(decision: AutoCompactDecision) {
  // 日志里的 input budget 就是有效窗口，不是另一份独立计数。
  const {
    contextWindow,
    effectiveContextWindow,
    estimatedTokenCount,
    maxOutputTokens,
    modelContextBudgetStrategy,
    outputReserveTokens,
    providerBaseTokenCount,
    providerCacheReadTokens,
    providerCacheWriteTokens,
    providerContextUsageTokenCount,
    providerIncrementalTokenCount,
    providerOutputTokens,
    threshold,
    thresholdPercent,
    tokenCount,
    tokenSource,
  } = decision;
  const inputBudgetTokens = effectiveContextWindow;
  return {
    contextWindow,
    effectiveContextWindow,
    estimatedTokenCount,
    inputBudgetTokens,
    maxOutputTokens,
    modelContextBudgetStrategy,
    outputReserveTokens,
    providerBaseTokenCount,
    providerCacheReadTokens,
    providerCacheWriteTokens,
    providerContextUsageTokenCount,
    providerIncrementalTokenCount,
    providerOutputTokens,
    threshold,
    thresholdPercent,
    tokenCount,
    tokenSource,
  };
}

export function buildContextHistoryEntries(
  contextResult: ContextBuildResult,
): RuntimeMessageEntry[] {
  const systemEntries = contextResult.systemMessages.map(
    (message): RuntimeMessageEntry => ({ message }),
  );
  const reminders = contextResult.metaUserAttachments.map((attachment) =>
    systemReminderAttachmentEntry(attachment.source, attachment.content),
  );
  return systemEntries.concat(reminders);
}

function installBuilder(
  runtime: AgentRuntimeInternal,
  snapshot: NonNullable<AgentRuntimeInternal["contextSourceSnapshot"]>,
  model: Model | undefined,
  persistEnvInfo: boolean,
): void {
  runtime.contextBuilder = runtime.createContextBuilderFromSnapshot(snapshot, runtime.memoryRoot, {
    memoryIndexContent: runtime.memoryIndexContent,
    model,
    ...(persistEnvInfo ? {} : { persistEnvInfo: false }),
  });
}

export function rebuildContextPrefix(
  runtime: AgentRuntimeInternal,
  options: { model?: Model; turnRequestEntries?: readonly RuntimeMessageEntry[] } = {},
): readonly RuntimeMessageEntry[] {
  const preview = () =>
    options.turnRequestEntries ?? runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  if (!runtime.contextBuilder || !runtime.contextInitialized) {
    // 初始化前只刷新预览。把 config-only envInfo 写进 config 会让真实 source 跳过探测。
    if (runtime.contextBuilder) {
      installBuilder(
        runtime,
        runtime.createConfigOnlyContextSnapshot(runtime.workingDirectory),
        options.model,
        false,
      );
    }
    return preview();
  }

  const snapshot =
    runtime.contextSourceSnapshot ??
    runtime.createConfigOnlyContextSnapshot(runtime.workingDirectory);
  runtime.contextBuilder = runtime.createContextBuilderFromSnapshot(snapshot, runtime.memoryRoot, {
    memoryIndexContent: runtime.memoryIndexContent,
    model: options.model,
  });
  const built = runtime.contextBuilder.build();
  const contextEntries = buildContextHistoryEntries(built);
  const canonical = runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  const conversation = canonical.slice(countContextPrefixMessages(canonical));
  runtime.latestContextBuildResult = built;
  runtime.messageHistory.replaceMessages(contextEntries.concat(conversation));
  const turnEntries = options.turnRequestEntries;
  if (!turnEntries) return runtime.messageHistory.borrowReadOnlyRuntimeEntries();
  const tail = turnEntries.slice(countContextPrefixMessages(turnEntries));
  return contextEntries.concat(tail);
}
