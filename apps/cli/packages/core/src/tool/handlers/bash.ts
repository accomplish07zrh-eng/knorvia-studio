// SPDX-License-Identifier: Apache-2.0
// bash 工具入口：把元数据、schema、权限解析与执行处理器装配成 ToolEntry。
// 执行编排在 bash-exec/handler-run.ts，描述投影复用 bash-metadata。
import {
  BashInputJsonSchema,
  BashInputSchema,
  BashOutputJsonSchema,
  BashOutputSchema,
} from "@knorvia/contracts";
import { DEFAULT_BASH_TIMEOUT_POLICY, type BashTimeoutPolicy } from "../bash-timeout-policy.js";
import type { ToolEntry } from "../types.js";
import { resolveBashPermissionRulePolicy } from "./bash-command-permission-policy.js";
import {
  createBashToolHandler,
  createTimeoutBudgetResolver,
  customizeInputSchema,
  describeWithPolicy,
  resolveReadOnlyCapability,
} from "./bash-exec/handler-run.js";
import { formatBashModelContent, formatPersistedBashModelContent } from "./bash-model-content.js";

export {
  getBashActivityDescription,
  getBashAutoClassifierInput,
  getBashDescription,
  getBashToolUseSummary,
  getBashUserFacingName,
} from "./bash-metadata.js";

const INLINE_OUTPUT_BUDGET_BYTES = 30_000;
const MODEL_OUTPUT_BUDGET_BYTES = 30_000;
const PERSISTED_OUTPUT_CAP_BYTES = 10_000_000;
const CLEANUP_GRACE_MS = 6_000;
const ENTRY_DESCRIPTION = describeWithPolicy(DEFAULT_BASH_TIMEOUT_POLICY);

export const bashToolEntry: ToolEntry = {
  capability: "Execute platform shell commands through the execution adapter",
  metadata: {
    name: "Bash",
    description: ENTRY_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: DEFAULT_BASH_TIMEOUT_POLICY.defaultTimeoutMs,
    maxOutputBytes: PERSISTED_OUTPUT_CAP_BYTES,
    sideEffectScope: "system",
    riskLevel: "high",
    needsApproval: true,
  },
  formatModelContent: formatBashModelContent,
  formatPersistedModelContent: formatPersistedBashModelContent,
  handler: createBashToolHandler(DEFAULT_BASH_TIMEOUT_POLICY),
  resolveTimeoutBudgetMs: createTimeoutBudgetResolver(DEFAULT_BASH_TIMEOUT_POLICY),
  resolvePermissionCapability: resolveReadOnlyCapability,
  resolvePermissionRulePolicy: resolveBashPermissionRulePolicy,
  inputSchema: BashInputJsonSchema,
  outputSchema: BashOutputJsonSchema,
  runtimeInputSchema: BashInputSchema,
  runtimeOutputSchema: BashOutputSchema,
  permission: {
    permission: "bash",
    reason: "Bash can run subprocesses and may affect workspace, git, network, or system state",
    riskLevel: "high",
    sideEffectScope: "system",
    needsApproval: true,
    patternSources: ["command"],
    alwaysAllowPatternSources: ["command"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: INLINE_OUTPUT_BUDGET_BYTES,
    maxModelBytes: MODEL_OUTPUT_BUDGET_BYTES,
    strategy: "artifact",
    preview: {
      maxBytes: MODEL_OUTPUT_BUDGET_BYTES,
      direction: "tail",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  timeout: {
    defaultMs: DEFAULT_BASH_TIMEOUT_POLICY.defaultTimeoutMs,
    maxMs: DEFAULT_BASH_TIMEOUT_POLICY.maxTimeoutMs,
    allowCallOverride: true,
    cleanupGraceMs: CLEANUP_GRACE_MS,
  },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "Bash was cancelled and the child process was asked to stop",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

export function createBashToolEntry(
  options: {
    bashTimeoutPolicy?: BashTimeoutPolicy;
    embeddedSearchEnabled?: boolean;
  } = {},
): ToolEntry {
  const timeoutPolicy = options.bashTimeoutPolicy ?? DEFAULT_BASH_TIMEOUT_POLICY;
  return {
    ...bashToolEntry,
    handler: createBashToolHandler(timeoutPolicy),
    inputSchema: customizeInputSchema(timeoutPolicy),
    resolveTimeoutBudgetMs: createTimeoutBudgetResolver(timeoutPolicy),
    metadata: {
      ...bashToolEntry.metadata,
      description: describeWithPolicy(timeoutPolicy, options.embeddedSearchEnabled),
      timeoutMs: timeoutPolicy.defaultTimeoutMs,
    },
    timeout: {
      defaultMs: timeoutPolicy.defaultTimeoutMs,
      maxMs: timeoutPolicy.maxTimeoutMs,
      allowCallOverride: true,
      cleanupGraceMs: CLEANUP_GRACE_MS,
    },
  };
}
