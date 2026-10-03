import { createPartId } from "../deps.js";
import type { ToolCall, ToolExecutionResult } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { projectToolNameForNonEmptyBoundary } from "./tool-part-persistence.js";
import { completedToolPartMetadata, mcpToolPartMetadata } from "./tool-part-metadata.js";
import type { persistToolResultMediaAttachments } from "../helpers/tool-result-media-persistence.js";

export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}

type Boundary = ReturnType<typeof projectToolNameForNonEmptyBoundary>;
type Media = Awaited<ReturnType<typeof persistToolResultMediaAttachments>>;

export function runningToolBatchState(
  runtime: AgentRuntimeInternal,
  call: ToolCall,
  part: ToolBatchPartFacts,
  boundary: Boundary,
) {
  return {
    status: "running" as const,
    input: part.input,
    title: boundary.toolName,
    metadata: mcpToolPartMetadata(runtime.registry.getMetadata(call.name)?.mcpPresentation) ?? {},
    time: { start: part.startedAt },
  };
}

export function completedToolBatchState(
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
  boundary: Boundary,
  media: Media,
) {
  return {
    status: "completed" as const,
    input: part.input,
    output,
    title: boundary.toolName,
    metadata: {
      ...completedToolPartMetadata(result),
      ...(media ? { modelContentLayout: media.modelContentLayout } : {}),
    },
    time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
    ...(media ? { attachments: media.attachments } : {}),
  };
}

export function failedToolBatchState(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
) {
  return {
    status: "error" as const,
    input: part.input,
    error: result.error?.message ?? output,
    metadata: {
      ...mcpToolPartMetadata(runtime.registry.getMetadata(result.toolName)?.mcpPresentation),
      ...(typeof result.modelContent === "string" ? { modelContent: result.modelContent } : {}),
    },
    time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
  };
}

export function toolBatchResultDiagnostic(results: ToolExecutionResult[]) {
  return {
    resultCount: results.length,
    results: results.map((result) => ({
      toolName: result.toolName,
      success: result.success,
      output: typeof result.output === "string" ? result.output.slice(0, 50) : "[object]",
    })),
  };
}
