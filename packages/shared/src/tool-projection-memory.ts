import type { KnorviaStreamingToolInputState } from "./streaming-tool-input-preview.js";

export interface KnorviaToolProjectionMemory {
  completeToolInputById?: Map<string, unknown>;
  streamingToolInputById?: Map<string, KnorviaStreamingToolInputState>;
  toolNameById?: Map<string, string>;
}

export interface KnorviaToolProjectionMetadata {
  hasInput: boolean;
  input?: unknown;
  toolName?: string;
}

export function createKnorviaToolProjectionMemory(): KnorviaToolProjectionMemory {
  return {
    completeToolInputById: new Map<string, unknown>(),
    streamingToolInputById: new Map<string, KnorviaStreamingToolInputState>(),
    toolNameById: new Map<string, string>(),
  };
}

export function ensureKnorviaToolProjectionMemory(
  memory: KnorviaToolProjectionMemory,
): KnorviaToolProjectionMemory {
  memory.completeToolInputById ??= new Map<string, unknown>();
  memory.streamingToolInputById ??= new Map<string, KnorviaStreamingToolInputState>();
  memory.toolNameById ??= new Map<string, string>();
  return memory;
}

export function resolveKnorviaToolProjectionMetadata(
  payload: Record<string, unknown>,
  toolId: string,
  memory: KnorviaToolProjectionMemory,
): KnorviaToolProjectionMetadata {
  const toolName = readNonEmptyString(payload.toolName) ?? memory.toolNameById?.get(toolId);
  if (toolName) {
    memory.toolNameById?.set(toolId, toolName);
  }

  if ("input" in payload) {
    return {
      hasInput: payload.input !== undefined,
      input: payload.input,
      toolName,
    };
  }

  if (memory.completeToolInputById?.has(toolId)) {
    return {
      hasInput: true,
      input: memory.completeToolInputById.get(toolId),
      toolName,
    };
  }

  return {
    hasInput: false,
    toolName,
  };
}

export function finalizeKnorviaToolProjectionInput(
  toolId: string,
  input: unknown,
  memory: KnorviaToolProjectionMemory,
): void {
  memory.completeToolInputById ??= new Map<string, unknown>();
  memory.completeToolInputById.set(toolId, input);
  const streamingState = memory.streamingToolInputById?.get(toolId);
  if (streamingState) {
    streamingState.lastPreviewRawInputLength = streamingState.rawInput.length;
    streamingState.rawInput = "";
  }
}

export function forgetKnorviaToolProjectionMetadata(
  toolId: string,
  memory: KnorviaToolProjectionMemory,
): void {
  memory.completeToolInputById?.delete(toolId);
  memory.streamingToolInputById?.delete(toolId);
  memory.toolNameById?.delete(toolId);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
