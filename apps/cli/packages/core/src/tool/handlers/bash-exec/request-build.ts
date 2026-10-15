// SPDX-License-Identifier: Apache-2.0
// 执行请求与进度事件：把工具输入与执行上下文折算成 ExecutionRequest
// （命令行、cwd、超时、输出上限、sandbox、trace、检索前缀），并把端口的
// progress 事件转成会话层的 ToolCallProgress 事件。
import {
  SessionEventType,
  type ExecutionEvent,
  type ExecutionRequest,
  type TraceContext,
} from "@knorvia/contracts";
import {
  shouldInjectEmbeddedSearchBashPrelude,
  supportsEmbeddedSearchShellSelection,
} from "../../../embedded-search/shell.js";
import { resolveBashTimeoutMs, type BashTimeoutPolicy } from "../../bash-timeout-policy.js";
import { resolveToolWorkingDirectory } from "../../path-policy.js";
import type { BashInput } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../../types.js";

const INLINE_OUTPUT_BUDGET_BYTES = 30_000;
const PERSISTED_OUTPUT_BUDGET_BYTES = 5 * 1024 * 1024;
const TOOL_LABEL = "Bash";

export function buildExecutionRequest(
  spec: BashInput,
  ctx: ToolExecutionContext,
  timeoutPolicy: BashTimeoutPolicy,
): ExecutionRequest {
  const shellCommand: Record<string, unknown> = Object.fromEntries([
    ["mode", "shell"],
    ["command", spec.command],
    ["shellProfile", "posix-bash"],
  ]);
  const shellSelection = ctx.bashShellSelection;
  if (shellSelection) shellCommand.shellOverride = shellSelection;

  const outputLimit: Record<string, unknown> = Object.fromEntries([
    ["maxInlineBytes", INLINE_OUTPUT_BUDGET_BYTES],
    ["maxBufferBytes", INLINE_OUTPUT_BUDGET_BYTES],
    ["maxPersistedBytes", PERSISTED_OUTPUT_BUDGET_BYTES],
    ["persistOutput", spec.run_in_background ? "always" : "on_truncate"],
  ]);
  const sandbox: Record<string, unknown> = {
    enabled: !spec.dangerouslyDisableSandbox,
    dangerouslyDisableSandbox: spec.dangerouslyDisableSandbox,
  };
  const workingDirectory = resolveToolWorkingDirectory(undefined, {
    workingDirectory: ctx.workingDirectory,
    workspaceRoot: ctx.workspaceRoot,
    operation: "execute",
  });

  const request: Record<string, unknown> = {
    command: shellCommand,
    cwd: workingDirectory,
    captureCwdAfterSuccess: spec.run_in_background ? undefined : true,
    timeoutMs: resolveBashTimeoutMs(spec.timeout, timeoutPolicy),
    outputLimit,
    sandbox,
    trace: buildTrace(ctx),
  };
  const prelude = resolveSearchPrelude(ctx, shellSelection);
  if (prelude) request.bashPrelude = prelude;
  return request as unknown as ExecutionRequest;
}

export async function publishProgressEvent(
  event: Extract<ExecutionEvent, { type: "progress" }>,
  ctx: ToolExecutionContext,
): Promise<void> {
  if (!ctx.emitEvent) return;
  const progressFacts: ReadonlyArray<readonly [string, unknown]> = [
    ["toolCallId", ctx.toolCallId],
    ["toolName", TOOL_LABEL],
    ["elapsedMs", event.elapsedMs],
    ["pid", event.pid],
    ["stdoutBytes", event.stdoutBytes],
    ["stderrBytes", event.stderrBytes],
    ["outputBytes", event.stdoutBytes + event.stderrBytes],
    ["outputPreview", event.outputPreview],
    ["stdoutTail", event.stdoutTail],
    ["stderrTail", event.stderrTail],
  ];
  const envelope: Record<string, unknown> = Object.fromEntries([
    ["id", crypto.randomUUID()],
    ["sessionId", ctx.sessionId],
    ["turnId", ctx.turnId],
    ["type", SessionEventType.ToolCallProgress],
    ["timestamp", event.timestamp],
    ["traceId", ctx.traceId],
    ["sequenceNumber", 0],
    ["payload", Object.fromEntries(progressFacts)],
  ]);
  await ctx.emitEvent(envelope as any);
}

function buildTrace(ctx: ToolExecutionContext): TraceContext {
  const identifiers: ReadonlyArray<readonly [string, unknown]> = [
    ["traceId", ctx.traceId],
    ["spanId", ctx.spanId],
    ["parentSpanId", ctx.parentSpanId],
    ["sessionId", ctx.sessionId],
    ["turnId", ctx.turnId],
  ];
  const trace: Record<string, unknown> = Object.fromEntries(identifiers);
  trace.attributes = { toolCallId: ctx.toolCallId, toolName: TOOL_LABEL };
  return trace as unknown as TraceContext;
}

// 内嵌搜索开启且 shell 支持时，注入检索前缀让 find/grep 走本地索引。
function resolveSearchPrelude(
  ctx: ToolExecutionContext,
  shellSelection: ToolExecutionContext["bashShellSelection"],
): Record<string, unknown> | undefined {
  const search = ctx.embeddedSearch;
  if (!shouldInjectEmbeddedSearchBashPrelude()) return undefined;
  if (!search || search.enabled !== true || !search.backend) return undefined;
  if (!supportsEmbeddedSearchShellSelection(shellSelection)) return undefined;
  const prelude: Record<string, unknown> = { kind: "embedded-search", backend: search.backend };
  if (search.findAndGrepEnabled === false) prelude.findAndGrepEnabled = false;
  return prelude;
}
