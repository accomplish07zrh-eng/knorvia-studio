// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, type CollaborationMode } from "@knorvia/contracts";
import type { HookRunResult } from "../../../hooks/index.js";
import {
  normalizeToolExecutionInput,
  prepareInitialToolExecutionInput,
} from "../../input-normalization.js";
import type { ToolExecutionResult, ToolInputResolutionResult } from "../../types.js";
import {
  createErrorResult,
  createPermissionErrorResult,
  createToolHandlerFailureError,
  isToolHandlerFailure,
} from "../errors.js";
import { validateInitialModelToolInput, validateInput } from "../validation.js";
import { withPlanExitDeniedTurnStop, withWorkflowRefineDeniedFollowUp } from "../turn-control.js";
import { formatHookAdditionalContexts } from "../hook-flow.js";
import type { RegisteredInvocation } from "./identity.js";

export type AdmissionExit =
  | { kind: "validation"; result: ToolExecutionResult; publish: boolean }
  | { kind: "denied"; result: ToolExecutionResult; reason: "policy_denied" | "user_denied" }
  | { kind: "permission"; result: ToolExecutionResult };

export class Admission {
  input: unknown;
  hooks: HookRunResult = { additionalContexts: [] };
  permissionWaitMs?: number;
  constructor(
    readonly facts: RegisteredInvocation,
    readonly mode: CollaborationMode,
  ) {}

  prepare(): AdmissionExit | undefined {
    const { entry, call, deps } = this.facts;
    const prepared = prepareInitialToolExecutionInput({
      entry,
      input: call.input,
      logger: deps.logger,
    });
    this.input = prepared.input;
    const schemaError = validateInitialModelToolInput(
      this.input,
      entry,
      prepared.runtimeValidationIssues,
    );
    if (schemaError) return this.invalid(schemaError, true);
    const semantic = entry.validateInput?.(this.input, {
      runtimeTaskRegistry: deps.runtimeTaskRegistry,
    });
    return semantic && isToolHandlerFailure(semantic)
      ? this.invalid(createToolHandlerFailureError(call, semantic), true)
      : undefined;
  }

  resolve(): ToolInputResolutionResult | Promise<ToolInputResolutionResult> {
    const { deps, entry } = this.facts;
    const workingDirectory = deps.getWorkingDirectory?.();
    return entry.resolveInput!(this.input, {
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
      runtimeTaskRegistry: deps.runtimeTaskRegistry,
      ...(deps.dynamicWorkflowRunPort === undefined
        ? {}
        : { dynamicWorkflowRunPort: deps.dynamicWorkflowRunPort }),
      ...(deps.modelCatalogPort === undefined ? {} : { modelCatalogPort: deps.modelCatalogPort }),
      sessionId: deps.sessionId,
    });
  }
  acceptResolution(resolution: ToolInputResolutionResult): AdmissionExit | undefined {
    if (isToolHandlerFailure(resolution))
      return this.invalid(createToolHandlerFailureError(this.facts.call, resolution), true);
    this.input = resolution.input;
  }

  acceptHook(hooks: HookRunResult): AdmissionExit | undefined {
    this.hooks = hooks;
    const { call, entry, deps } = this.facts;
    if (hooks.permissionBehavior === "deny" || hooks.preventContinuation) {
      const reason = hooks.hookPermissionDecisionReason ?? hooks.stopReason;
      const denied = createPermissionErrorResult(call, reason ?? "Blocked by PreToolUse hook", {
        decision: "deny",
        mode: this.mode,
        // 消息与结构化原因分别读取；可注入 Hook 的第二次读取异常仍须向外传播。
        reason: hooks.hookPermissionDecisionReason ?? hooks.stopReason,
        source: "hook.PreToolUse",
      });
      return {
        kind: "denied",
        reason: "policy_denied",
        result: this.withContexts(this.planDenial(denied)),
      };
    }
    if (hooks.updatedInput !== undefined) {
      this.input = normalizeToolExecutionInput({
        entry,
        input: hooks.updatedInput,
        logger: deps.logger,
        source: "hook",
      });
      const error = validateInput(this.input, entry);
      if (error) return this.invalid(error, false);
    }
  }

  rejectPermission(result: ToolExecutionResult): AdmissionExit {
    const wrapped = this.withContexts(
      withWorkflowRefineDeniedFollowUp(this.planDenial(result), { toolName: this.facts.call.name }),
    );
    return wrapped.error?.type === CoreErrorType.PermissionDenied
      ? { kind: "denied", reason: "user_denied", result: wrapped }
      : { kind: "permission", result: wrapped };
  }

  private invalid(error: Error, publish: boolean): AdmissionExit {
    const result = createErrorResult(this.facts.call, error);
    return { kind: "validation", publish, result: publish ? result : this.withContexts(result) };
  }
  private planDenial(result: ToolExecutionResult) {
    return withPlanExitDeniedTurnStop(result, {
      mode: this.mode,
      planEnabled: this.facts.deps.sessionModePort?.isPlanEnabled?.(),
      toolName: this.facts.call.name,
    });
  }
  private withContexts(result: ToolExecutionResult): ToolExecutionResult {
    const contexts = this.hooks.additionalContexts;
    if (result.success || !result.error || !contexts.length) return result;
    const body =
      typeof result.modelContent === "string" ? result.modelContent : result.error.message;
    return { ...result, modelContent: `${body}\n\n${formatHookAdditionalContexts(contexts)}` };
  }
}
