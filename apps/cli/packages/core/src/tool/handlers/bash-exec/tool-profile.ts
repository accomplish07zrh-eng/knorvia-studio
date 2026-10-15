// SPDX-License-Identifier: Apache-2.0
// bash 工具画像：只读能力判定、超时预算解析、输入 schema 定制与 provider 描述。
// 这些都是「声明面」的组装，不触碰执行路径。
import { BashInputJsonSchema, BashInputSchema } from "@knorvia/contracts";
import { resolveBashTimeoutMs, type BashTimeoutPolicy } from "../../bash-timeout-policy.js";
import type {
  ToolEntry,
  ToolRuntimePermissionCapability,
  ToolRuntimePermissionCapabilityContext,
} from "../../types.js";
import { readStringProperty } from "../bash-metadata.js";
import { createBashProviderDescription } from "../bash-prompt.js";
import { isRuntimeReadOnlyBashCommand } from "../bash-semantics.js";

// 低风险画像的事实表：只读命令不需要审批，作用域收敛到 none。
const LOW_RISK_FACTS: ReadonlyArray<readonly [string, unknown]> = [
  ["destructive", false],
  ["needsApproval", false],
  ["readOnly", true],
  ["riskLevel", "low"],
  ["sideEffectScope", "none"],
];

// 只读命令给出低风险能力画像；其余交给默认（高风险、需审批）声明。
export function resolveReadOnlyCapability(
  payload: unknown,
  runtime?: ToolRuntimePermissionCapabilityContext,
): ToolRuntimePermissionCapability | undefined {
  const cmd = readStringProperty(payload, "command");
  if (!cmd || !isRuntimeReadOnlyBashCommand(cmd, runtime)) return undefined;
  const capability = Object.fromEntries(LOW_RISK_FACTS) as ToolRuntimePermissionCapability;
  capability.permission = Object.fromEntries(
    LOW_RISK_FACTS,
  ) as ToolRuntimePermissionCapability["permission"];
  return capability;
}

export function createTimeoutBudgetResolver(
  policy: BashTimeoutPolicy,
): NonNullable<ToolEntry["resolveTimeoutBudgetMs"]> {
  return (payload) => {
    const parsed = BashInputSchema.safeParse(payload);
    // 超时预算必须走和 handler 相同的策略解析：裸读入参会把 0 压成 1ms，
    // 也会让字符串数字绕过策略钳制；统一解析后再由上层叠加清理宽限。
    return resolveBashTimeoutMs(parsed.success ? parsed.data.timeout : undefined, policy);
  };
}

export function customizeInputSchema(policy: BashTimeoutPolicy): Record<string, unknown> {
  const baseSchema = BashInputJsonSchema as Record<string, unknown>;
  const baseProperties = baseSchema.properties as Record<string, unknown> | undefined;
  const declaredTimeout = baseProperties?.timeout as Record<string, unknown> | undefined;
  if (!baseProperties || !declaredTimeout) return baseSchema;
  const timeoutClone: Record<string, unknown> = { ...declaredTimeout };
  timeoutClone.description = `Optional timeout in milliseconds (max ${policy.maxTimeoutMs})`;
  const nextProperties: Record<string, unknown> = { ...baseProperties, timeout: timeoutClone };
  return { ...baseSchema, properties: nextProperties };
}

export function describeWithPolicy(policy: BashTimeoutPolicy, embeddedSearch?: boolean): string {
  const promptBudget = {
    defaultTimeoutMs: policy.defaultTimeoutMs,
    embeddedSearchEnabled: embeddedSearch,
    maxTimeoutMs: policy.maxTimeoutMs,
  };
  return createBashProviderDescription(promptBudget);
}
