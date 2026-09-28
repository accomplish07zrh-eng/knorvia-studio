// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  CollaborationMode,
  PermissionBrokerRequest,
  PermissionBrokerResult,
  PermissionRuleset,
  TraceContext,
} from "@knorvia/contracts";
import type { PermissionDecisionResult, PermissionContext } from "../../permission/service.js";
import { activatePermissionRequest } from "../../permission/prepared-request.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import { AskProjection } from "./approval/ask-projection.js";
import { applyMemoryFilePermission, targetsMemoryFile } from "./memory-file-permission.js";
import {
  resolveRuntimePermissionCapability,
  resolveRuntimePermissionContext,
} from "./permission-capability.js";
import { buildDefaultPermissionUpdates } from "./permission-suggestions.js";
import type { ToolExecutorDeps } from "./types.js";

interface RecheckInvocation {
  deps: ToolExecutorDeps;
  entry: ToolEntry;
  mode: CollaborationMode;
  modifiedInput: unknown;
  projectRules: PermissionRuleset | null;
  requestId: string;
  signal?: AbortSignal;
  toolCall: ExecutableToolCall;
  traceContext: TraceContext;
}
interface PermissionHookInputRecheckResult {
  brokerResult?: PermissionBrokerResult;
  permissionDecision?: PermissionDecisionResult;
}
type RecheckRoute =
  | { kind: "finished"; result: PermissionHookInputRecheckResult }
  | {
      kind: "request";
      prepare: () => ReturnType<ToolExecutorDeps["permissionBroker"]["preparePermission"]>;
      decision: PermissionDecisionResult;
    };

function memoryTarget(call: RecheckInvocation) {
  return {
    executionInput: call.modifiedInput,
    memoryRoot: call.deps.getMemoryRoot?.(),
    toolName: call.toolCall.name,
    workingDirectory: call.deps.getWorkingDirectory(),
    workspaceRoot: call.deps.getWorkspaceRoot(),
  };
}

/** Evaluate once, then describe an exit; only the public adapter activates a request. */
function routeRecheck(call: RecheckInvocation): RecheckRoute {
  const runtime = resolveRuntimePermissionContext(call.deps);
  const context: PermissionContext = {
    input: call.modifiedInput,
    mode: call.mode,
    prePlanMode: call.deps.sessionModePort?.getPrePlanMode(),
    planEnabled: call.deps.sessionModePort?.isPlanEnabled?.(),
    riskLevel: call.entry.metadata.riskLevel,
    toolName: call.toolCall.name,
    workingDirectory: call.deps.getWorkingDirectory(),
  };
  const policy = call.entry.resolvePermissionRulePolicy?.(call.modifiedInput, runtime);
  const evaluated = call.deps.permissionService.checkPermission(
    context,
    resolveRuntimePermissionCapability(call.entry, call.modifiedInput, runtime),
    call.projectRules,
    policy,
  );
  const decision = applyMemoryFilePermission({ decision: evaluated, ...memoryTarget(call) });
  switch (decision.decision) {
    case "deny":
      return {
        kind: "finished",
        result: {
          brokerResult: { decision: "deny", reason: decision.reason },
          permissionDecision: decision,
        },
      };
    case "ask":
      if (decision.ruleId === "rule.project.ask" || targetsMemoryFile(memoryTarget(call))) break;
      return { kind: "finished", result: {} };
    default:
      return { kind: "finished", result: {} };
  }
  const suggestedPermissionUpdates =
    policy?.suggestedPermissionUpdates ??
    // 改写输入后的默认规则也必须带可信组，不能退化成可被同名非可信工具复用的授权。
    buildDefaultPermissionUpdates(
      call.toolCall.name,
      call.modifiedInput,
      call.entry.permissionCapabilityGroup,
    );
  // 与方法调用的参数求值边界一致；请求字段回调不能把当前请求转给另一 broker。
  const broker = call.deps.permissionBroker;
  const prepare = broker.preparePermission;
  const request: PermissionBrokerRequest = {
    input: call.modifiedInput,
    mode: call.mode,
    reason: decision.reason ?? `Tool ${call.toolCall.name} requires approval`,
    requestId: call.requestId,
    requestedAt: new Date(),
    riskLevel: decision.riskLevel,
    ruleId: decision.ruleId,
    sessionId: call.deps.sessionId,
    sideEffectScope: decision.sideEffectScope,
    suggestedPermissionUpdates,
    toolCallId: call.toolCall.id as PermissionBrokerRequest["toolCallId"],
    toolName: call.toolCall.name,
    traceId: call.traceContext.traceId,
    turnId: call.traceContext.turnId ?? call.deps.turnId,
  };
  // 只复用选项投影：二次询问不得扩大授权范围，也不能重跑有副作用的工具预览。
  const { optionsPolicy } = new AskProjection(call.entry.permission?.askOptions?.allowAlways).ask();
  if (optionsPolicy) request.optionsPolicy = optionsPolicy;
  return {
    kind: "request",
    decision,
    prepare: () =>
      Reflect.apply(prepare, broker, [
        request,
        {
          signal: call.signal,
          timeoutMs: call.deps.permissionTimeoutMs,
        },
      ]),
  };
}

export async function recheckPermissionHookModifiedInput(
  input: RecheckInvocation,
): Promise<PermissionHookInputRecheckResult> {
  const route = routeRecheck(input);
  if (route.kind === "finished") return route.result;
  const brokerResult = await activatePermissionRequest(route.prepare());
  return { brokerResult, permissionDecision: route.decision };
}
