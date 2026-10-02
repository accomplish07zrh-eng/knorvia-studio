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
  const suppliedName = payload.toolName;
  const toolName =
    typeof suppliedName === "string" && suppliedName.length > 0
      ? suppliedName
      : memory.toolNameById?.get(toolId);

  if (toolName) {
    memory.toolNameById?.set(toolId, toolName);
  }

  if ("input" in payload) {
    const input = payload.input;
    return { hasInput: input !== undefined, input, toolName };
  }

  const completedInputs = memory.completeToolInputById;
  if (completedInputs?.has(toolId)) {
    return { hasInput: true, input: completedInputs.get(toolId), toolName };
  }

  return { hasInput: false, toolName };
}

export function finalizeKnorviaToolProjectionInput(
  toolId: string,
  input: unknown,
  memory: KnorviaToolProjectionMemory,
): void {
  const completedInputs = (memory.completeToolInputById ??= new Map<string, unknown>());
  completedInputs.set(toolId, input);

  const streamingInput = memory.streamingToolInputById?.get(toolId);
  if (streamingInput) {
    streamingInput.lastPreviewRawInputLength = streamingInput.rawInput.length;
    streamingInput.rawInput = "";
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
