// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CoreErrorType,
  createCoreError,
  traceContextToLogContext,
  type SessionEvent,
  type SkillTelemetryMetadata,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION } from "@knorvia/cua/frame-contract";
import type { ToolExecutionResult } from "../../types.js";
import {
  mergeToolExecutionTelemetry,
  readToolExecutionTelemetry,
} from "../../handlers/tool-perf.js";
import type { BackgroundTaskTracker } from "../background-tasks.js";
import {
  createErrorResult,
  createToolHandlerFailureError,
  isToolHandlerFailure,
} from "../errors.js";
import { emitToolCallError, emitToolCallResult, emitToolCallStarted } from "../events.js";
import {
  runPreToolUseHooks,
  runPostToolUseHooks,
  runPostToolUseFailureHooks,
} from "../hook-flow.js";
import { resolveToolPermission } from "../permission-flow.js";
import { resolveToolCallCapabilityFlags } from "../permission-capability.js";
import { createMcpToolDisplay, createToolResultDisplay } from "../result-display.js";
import { appendHookAdditionalContexts, serializeOutput } from "../result-serialization.js";
import {
  ToolDeadline,
  executeWithTimeout,
  linkAbortSignal,
  observeToolAdmissionClock,
  resolveTimeoutMs,
} from "../timeout.js";
import { withTerminalToolTurnStop } from "../turn-control.js";
import { validateOutput } from "../validation.js";
import { Admission, type AdmissionExit } from "./admission.js";
import { executionContext } from "./context.js";
import type { RegisteredInvocation } from "./identity.js";
import { errorCategory, failedExecution, modelContent, serializationEntry } from "./outcome.js";

export class Invocation {
  private readonly admission: Admission;
  private stage: "handler" | "serialize" | "post_hook" = "handler";
  private readMetadata: ToolExecutionResult["readFileStateMetadata"];
  private skillMetadata?: SkillTelemetryMetadata;

  constructor(
    private readonly facts: RegisteredInvocation,
    private readonly background: BackgroundTaskTracker,
  ) {
    this.admission = new Admission(facts, facts.deps.getMode());
  }

  async run(): Promise<ToolExecutionResult> {
    const { deps, call, entry, options, trace, telemetry } = this.facts;
    if (options?.signal?.aborted) {
      const result = createErrorResult(
        call,
        createCoreError(CoreErrorType.ToolCancelled, "Tool execution cancelled"),
      );
      telemetry?.finishCancelled("abort_signal");
      return result;
    }
    const admission = this.admission;
    let exit = admission.prepare();
    if (exit) return this.finishAdmission(exit);
    if (entry.resolveInput) {
      exit = admission.acceptResolution(await admission.resolve());
      if (exit) return this.finishAdmission(exit);
    }
    exit = admission.acceptHook(
      await runPreToolUseHooks(
        deps,
        call,
        admission.input,
        entry,
        admission.mode,
        trace,
        options?.signal,
      ),
    );
    if (exit) return this.finishAdmission(exit);
    const permission = await resolveToolPermission(
      deps,
      call,
      entry,
      admission.input,
      admission.hooks,
      admission.mode,
      trace,
      options?.signal,
      telemetry,
    );
    if (!permission.allowed)
      return this.finishAdmission(admission.rejectPermission(permission.result));
    admission.input = permission.executionInput;
    admission.permissionWaitMs = permission.permissionWaitMs;
    return this.execute();
  }

  private async finishAdmission(exit: AdmissionExit): Promise<ToolExecutionResult> {
    const { deps, call, trace, turnId, telemetry } = this.facts;
    switch (exit.kind) {
      case "validation":
        if (exit.publish) await emitToolCallError(deps, call.id, trace, turnId, exit.result.error);
        telemetry?.finishFailed("validation", "parse", exit.result.error);
        break;
      case "denied":
        if (exit.reason === "policy_denied") telemetry?.setPermissionDecision("denied");
        telemetry?.finishDenied(exit.reason);
        break;
      case "permission":
        telemetry?.finishFailed(
          "permission",
          errorCategory(exit.result.error?.type),
          exit.result.error,
        );
        break;
    }
    return exit.result;
  }

  private async execute(): Promise<ToolExecutionResult> {
    const { deps, call, entry, trace, turnId, options, initialModel, totalStartedAt, telemetry } =
      this.facts;
    const admission = this.admission;
    const started = Date.now();
    await emitToolCallStarted(
      deps,
      call,
      trace,
      turnId,
      started,
      createMcpToolDisplay(entry.metadata.mcpPresentation),
      resolveToolCallCapabilityFlags(deps, entry, admission.input),
    );
    deps.logger?.info("Tool call started", this.logFacts("started"));
    const timeout = resolveTimeoutMs(entry, admission.input, deps.defaultTimeoutMs, {
      model: initialModel,
    });
    const controller = new AbortController();
    const unlink = linkAbortSignal(options?.signal, controller);
    const deadline = new ToolDeadline(timeout);
    const emitEvent =
      deps.emitEvent === undefined
        ? undefined
        : async (event: SessionEvent) => {
            observeToolAdmissionClock(event, call.id, deadline);
            await deps.emitEvent(event);
          };
    // Started 和计时设置属于准入后设置区，不能把它们的异常归进 handler Failure Hook。
    try {
      const context = executionContext(this.facts, controller.signal, emitEvent, {
        recordReadFileStateMetadata: (metadata) => {
          this.readMetadata = metadata;
        },
        recordSkillTelemetryMetadata: (metadata) => {
          this.skillMetadata = metadata;
        },
      });
      const output = await executeWithTimeout(
        entry.handler,
        admission.input,
        context,
        deadline,
        controller,
        entry,
      );
      const duration = Date.now() - started;
      if (isToolHandlerFailure(output)) throw createToolHandlerFailureError(call, output);
      validateOutput(output, entry);
      const projectionEntry = serializationEntry(entry, output);

      this.stage = "serialize";
      let serialization = await serializeOutput(
        deps,
        output,
        projectionEntry,
        trace,
        call.id,
        controller.signal,
      );
      this.stage = "post_hook";
      const post = await runPostToolUseHooks(
        deps,
        call,
        admission.input,
        output,
        serialization.artifactPath,
        trace,
        options?.signal,
      );
      serialization = appendHookAdditionalContexts(
        serialization,
        [...admission.hooks.additionalContexts, ...post.additionalContexts],
        projectionEntry,
      );
      const display = createToolResultDisplay(call.name, output, {
        mcp: entry.metadata.mcpPresentation,
        officialCua: entry.modelContentProtection === OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
      });
      const performance = mergeToolExecutionTelemetry(readToolExecutionTelemetry(output), {
        permissionWaitMs: admission.permissionWaitMs,
        totalMs: Date.now() - totalStartedAt,
      });
      const content = modelContent(serialization, projectionEntry);
      const result = withTerminalToolTurnStop(
        {
          toolCallId: call.id,
          toolName: call.name,
          success: true,
          output,
          display,
          modelContent: content,
          ...(this.readMetadata ? { readFileStateMetadata: this.readMetadata } : {}),
          performance,
          serialization,
          durationMs: duration,
          startedAt: new Date(started),
          completedAt: new Date(),
        },
        { entry },
      );
      await emitToolCallResult(
        deps,
        call,
        trace,
        turnId,
        serialization,
        duration,
        display,
        performance,
        this.skillMetadata,
      );
      await this.background.trackBackgroundTask(call, output, trace, turnId);
      deps.logger?.info("Tool call completed", this.logFacts("completed", duration));
      telemetry?.setOutputBytes(serialization.returnedBytes);
      telemetry?.setOutputTruncated(serialization.truncated);
      telemetry?.finishCompleted();
      return result;
    } catch (error) {
      const duration = Date.now() - started;
      const failure = await runPostToolUseFailureHooks(
        deps,
        call,
        admission.input,
        error,
        trace,
        options?.signal,
      );
      const result = failedExecution(call, error, duration, admission.hooks, failure);
      await emitToolCallError(deps, call.id, trace, turnId, result.error, this.skillMetadata);
      deps.logger?.error(
        "Tool call failed",
        error instanceof Error ? error : new Error(String(error)),
        this.logFacts("failed", duration),
      );
      if (options?.signal?.aborted || result.error?.type === CoreErrorType.ToolCancelled)
        telemetry?.finishCancelled("abort_signal");
      else telemetry?.finishFailed(this.stage, errorCategory(result.error?.type), error);
      // 终态遥测与 finally 之间不能增加 await，否则下一微任务的父取消会污染已结束的子调用。
      return result;
    } finally {
      unlink();
    }
  }

  private logFacts(status: "started" | "completed" | "failed", duration?: number) {
    return {
      ...traceContextToLogContext(this.facts.trace),
      ...(duration === undefined ? {} : { durationMs: duration }),
      event: `tool.call.${status}`,
      module: "core.tool.executor",
      status,
      toolCallId: this.facts.call.id,
      toolName: this.facts.call.name,
    };
  }
}
