// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  type HookEventName,
  type HookJSONOutput,
  type HookSpecificOutput,
} from "@knorvia/contracts";
import type { HookRunResult } from "./types.js";

type EventPolicy = { permission: boolean; prevent: boolean; feedback: boolean };
const POLICIES: Record<HookEventName, EventPolicy> = {
  PreToolUse: { permission: true, prevent: true, feedback: false },
  PermissionRequest: { permission: true, prevent: true, feedback: false },
  UserPromptSubmit: { permission: false, prevent: true, feedback: false },
  SessionStart: { permission: false, prevent: false, feedback: false },
  PostToolUse: { permission: false, prevent: false, feedback: false },
  PostToolUseFailure: { permission: false, prevent: false, feedback: false },
  Stop: { permission: false, prevent: false, feedback: true },
};
type Projection = { wire: HookJSONOutput; result: HookRunResult; policy: EventPolicy };

// 字段程序保留协议求值和写入顺序；只有当前事件允许的控制字段会被物化。
const WRITERS = {
  block: ({ result }: Projection) => {
    result.blockRequested = true;
  },
  reason: ({ wire, result }: Projection) => {
    result.stopReason = wire.stopReason ?? wire.reason;
  },
  blockReason: ({ wire, result }: Projection) => {
    result.stopReason = wire.stopReason ?? wire.reason ?? wire.systemMessage;
  },
  prevent: ({ policy, result }: Projection) => {
    if (policy.prevent) result.preventContinuation = true;
  },
  deny: ({ policy, result }: Projection) => {
    if (policy.permission) result.permissionBehavior = "deny";
  },
  allow: ({ result }: Projection) => {
    result.permissionBehavior = "allow";
  },
  resume: ({ result }: Projection) => {
    result.stopShouldContinue = true;
  },
  feedback: ({ policy, wire, result }: Projection) => {
    if (!policy.feedback) return;
    result.stopShouldContinue = true;
    if (wire.systemMessage) result.additionalContexts.push(wire.systemMessage);
    if (wire.reason) result.additionalContexts.push(wire.reason);
  },
  context: ({ wire, result }: Projection) => {
    if (wire.additionalContext) result.additionalContexts.push(wire.additionalContext);
    if (wire.additional_context) result.additionalContexts.push(wire.additional_context);
  },
} satisfies Record<string, (projection: Projection) => void>;
const PROGRAM: readonly {
  when: (projection: Projection) => boolean;
  fields: readonly (keyof typeof WRITERS)[];
}[] = [
  {
    when: ({ wire, policy }) => wire.continue === false && !policy.feedback,
    fields: ["block", "reason", "prevent", "deny"],
  },
  {
    when: ({ policy, wire }) => policy.feedback && wire.continue === true,
    fields: ["resume", "reason"],
  },
  {
    when: ({ wire, policy }) => wire.decision === "approve" && policy.permission,
    fields: ["allow"],
  },
  {
    when: ({ wire }) => wire.decision === "block",
    fields: ["block", "blockReason", "deny", "prevent", "feedback"],
  },
  { when: () => true, fields: ["context"] },
];

function specificFields(result: HookRunResult, specific: HookSpecificOutput): void {
  // 回调可返回访问器：入口核验后仅再读取一次分派名，不能额外读取并丢失拒绝。
  const event = specific.hookEventName;
  if (event === "PermissionRequest") {
    if (specific.decision) result.permissionRequestResult = specific.decision;
    return;
  }
  if (event === "PreToolUse") {
    if (specific.permissionDecision) {
      result.permissionBehavior = specific.permissionDecision;
      result.hookPermissionDecisionReason = specific.permissionDecisionReason;
    }
    if ("updatedInput" in specific && specific.updatedInput !== undefined)
      result.updatedInput = specific.updatedInput;
  }
  if (specific.additionalContext) result.additionalContexts.push(specific.additionalContext);
}

export function processHookOutput(
  event: HookEventName,
  wire: HookJSONOutput | void,
): HookRunResult {
  const result: HookRunResult = { additionalContexts: [] };
  if (!wire) return result;
  const projection: Projection = { wire, result, policy: POLICIES[event] };
  for (const instruction of PROGRAM) {
    if (instruction.when(projection))
      for (const field of instruction.fields) WRITERS[field](projection);
  }
  const specific = wire.hookSpecificOutput;
  if (specific) {
    if (specific.hookEventName !== event)
      throw createCoreError(CoreErrorType.ToolExecutionFailed, "Hook returned wrong event name", {
        context: { expectedEvent: event, hookEventName: specific.hookEventName },
        recoverable: true,
      });
    specificFields(result, specific);
  }
  if (
    event === "PreToolUse" &&
    result.preventContinuation &&
    result.permissionBehavior !== "deny"
  ) {
    // stop/block 已拒绝执行；较弱 specific 决定不能把允许/询问文案变成拒绝原因。
    result.permissionBehavior = "deny";
    delete result.hookPermissionDecisionReason;
  }
  return result;
}
