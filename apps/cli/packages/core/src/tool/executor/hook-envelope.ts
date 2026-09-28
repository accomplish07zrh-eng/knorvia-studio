// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  HookEventName,
  isCoreError,
  type CollaborationMode,
  type HookInput,
  type PreToolUseHookInput,
  type PermissionRequestHookInput,
  type PostToolUseHookInput,
  type PostToolUseFailureHookInput,
  type TraceContext,
} from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";
import { hookMatcherToolNamesForTool } from "../compat.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { previewHookValue } from "./utils.js";

export type ToolHookPhase =
  | { kind: "before"; entry: ToolEntry; mode: CollaborationMode }
  | {
      kind: "approval";
      decision: PermissionDecisionResult;
      requestId: string;
      mode: CollaborationMode;
    }
  | { kind: "after"; output: unknown; artifactPath?: string }
  | { kind: "failure"; error: unknown };

const EVENTS = {
  before: HookEventName.PreToolUse,
  approval: HookEventName.PermissionRequest,
  after: HookEventName.PostToolUse,
  failure: HookEventName.PostToolUseFailure,
} as const;
const CALL_FIELDS = ["timestamp", "toolCallId", "toolInput", "toolName"] as const;
const TRACE_FIELDS = ["traceId", "turnId"] as const;
type PhaseInputs = {
  before: PreToolUseHookInput;
  approval: PermissionRequestHookInput;
  after: PostToolUseHookInput;
  failure: PostToolUseFailureHookInput;
};
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
function defineFields<
  const Layout extends { [P in keyof PhaseInputs]: readonly (keyof PhaseInputs[P])[] },
>(
  fields: Layout & {
    [P in keyof PhaseInputs]: RequiredKeys<PhaseInputs[P]> extends Layout[P][number]
      ? unknown
      : never;
  },
): Layout {
  return fields;
}
const FIELDS = defineFields({
  before: [
    "cwd",
    "hookEventName",
    "mode",
    "riskLevel",
    "sessionId",
    "sideEffectScope",
    ...CALL_FIELDS,
    ...TRACE_FIELDS,
  ],
  approval: [
    "cwd",
    "hookEventName",
    "mode",
    "reason",
    "requestId",
    "riskLevel",
    "sessionId",
    "sideEffectScope",
    ...CALL_FIELDS,
    ...TRACE_FIELDS,
  ],
  after: [
    "artifactRefs",
    "cwd",
    "hookEventName",
    "mode",
    "sessionId",
    ...CALL_FIELDS,
    "toolResponse",
    "toolResultPreview",
    ...TRACE_FIELDS,
  ],
  failure: [
    "cwd",
    "error",
    "hookEventName",
    "isInterrupt",
    "mode",
    "sessionId",
    ...CALL_FIELDS,
    ...TRACE_FIELDS,
  ],
});
type ToolHookInput = Extract<HookInput, { toolInput: unknown }>;
type FieldValue<Input, Key extends PropertyKey> = Input extends unknown
  ? Key extends keyof Input
    ? Input[Key]
    : never
  : never;
type FieldReaders = {
  [K in (typeof FIELDS)[keyof typeof FIELDS][number]]: () =>
    | FieldValue<ToolHookInput, K>
    | undefined;
};

/** Synchronous envelope projection; no runner means no field evaluation at all. */
export function invokeToolHook(
  deps: ToolExecutorDeps,
  tool: ExecutableToolCall,
  input: unknown,
  phase: ToolHookPhase,
  trace: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> | undefined {
  if (!deps.hookRunner) return undefined;
  const error =
    phase.kind === "failure"
      ? phase.error instanceof Error
        ? phase.error
        : new Error(String(phase.error))
      : undefined;
  // JS 方法调用先选 receiver/方法再求参数；cwd/mode 等回调不能换掉本次已选的 runner。
  const runner = deps.hookRunner;
  const run = runner.run;
  const readers = {
    artifactRefs: () =>
      phase.kind === "after" && phase.artifactPath ? [phase.artifactPath] : undefined,
    cwd: () => deps.getWorkingDirectory(),
    error: () => ({ message: error!.message, type: isCoreError(error) ? error.type : error!.name }),
    hookEventName: () => EVENTS[phase.kind],
    isInterrupt: () => isCoreError(error) && error.type === CoreErrorType.ToolCancelled,
    mode: () =>
      phase.kind === "before" || phase.kind === "approval" ? phase.mode : deps.getMode(),
    reason: () =>
      phase.kind === "approval"
        ? (phase.decision.reason ?? `Tool ${tool.name} requires approval`)
        : undefined,
    requestId: () => (phase.kind === "approval" ? phase.requestId : undefined),
    riskLevel: () =>
      phase.kind === "before"
        ? phase.entry.metadata.riskLevel
        : phase.kind === "approval"
          ? phase.decision.riskLevel
          : undefined,
    sessionId: () => deps.sessionId,
    sideEffectScope: () =>
      phase.kind === "before"
        ? phase.entry.metadata.sideEffectScope
        : phase.kind === "approval"
          ? phase.decision.sideEffectScope
          : undefined,
    timestamp: () => new Date().toISOString(),
    toolCallId: () => tool.id,
    toolInput: () => input,
    toolName: () => tool.name,
    toolResponse: () => (phase.kind === "after" ? phase.output : undefined),
    toolResultPreview: () => (phase.kind === "after" ? previewHookValue(phase.output) : undefined),
    traceId: () => trace.traceId,
    turnId: () => trace.turnId ?? deps.turnId,
  } satisfies FieldReaders;
  // 固定事件字段序列保留读取时点和 own undefined；不能先批量取值再过滤。
  const envelope = Object.fromEntries(
    FIELDS[phase.kind].map((key) => [key, readers[key]()]),
  ) as unknown as ToolHookInput;
  return Reflect.apply(run, runner, [
    envelope,
    {
      matchValue: tool.name,
      matchValues: hookMatcherToolNamesForTool(tool.name),
      signal,
    },
  ]);
}
