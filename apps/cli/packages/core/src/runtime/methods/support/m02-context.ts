// SPDX-License-Identifier: Apache-2.0
// 上下文前缀重建、历史条目，以及自动压缩决策的日志字段。
import type { AutoCompactDecision } from "../../../compact/policy.js";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { countContextPrefixMessages, type ContextBuildResult, type Model } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { assignKeys } from "./m02-record.js";

export function autoCompactDecisionLogContext(decision: AutoCompactDecision) {
  return assignKeys<{
    contextWindow: number;
    effectiveContextWindow: number;
    estimatedTokenCount: number;
    inputBudgetTokens: number;
    maxOutputTokens: number | undefined;
    modelContextBudgetStrategy: AutoCompactDecision["modelContextBudgetStrategy"];
    outputReserveTokens: number;
    providerBaseTokenCount: number | undefined;
    providerCacheReadTokens: number | undefined;
    providerCacheWriteTokens: number | undefined;
    providerContextUsageTokenCount: number | undefined;
    providerIncrementalTokenCount: number | undefined;
    providerOutputTokens: number | undefined;
    threshold: number;
    thresholdPercent: number;
    tokenCount: number;
    tokenSource: AutoCompactDecision["tokenSource"];
  }>([
    ["contextWindow", decision.contextWindow],
    ["effectiveContextWindow", decision.effectiveContextWindow],
    ["estimatedTokenCount", decision.estimatedTokenCount],
    ["inputBudgetTokens", decision.effectiveContextWindow],
    ["maxOutputTokens", decision.maxOutputTokens],
    ["modelContextBudgetStrategy", decision.modelContextBudgetStrategy],
    ["outputReserveTokens", decision.outputReserveTokens],
    ["providerBaseTokenCount", decision.providerBaseTokenCount],
    ["providerCacheReadTokens", decision.providerCacheReadTokens],
    ["providerCacheWriteTokens", decision.providerCacheWriteTokens],
    ["providerContextUsageTokenCount", decision.providerContextUsageTokenCount],
    ["providerIncrementalTokenCount", decision.providerIncrementalTokenCount],
    ["providerOutputTokens", decision.providerOutputTokens],
    ["threshold", decision.threshold],
    ["thresholdPercent", decision.thresholdPercent],
    ["tokenCount", decision.tokenCount],
    ["tokenSource", decision.tokenSource],
  ]);
}

export function buildContextHistoryEntries(contextResult: ContextBuildResult): RuntimeMessageEntry[] {
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
