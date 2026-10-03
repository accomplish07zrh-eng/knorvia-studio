export interface KnorviaStreamingToolInputState {
  deltaCount?: number;
  lastPreviewAt?: number;
  lastPreviewRawInputLength?: number;
  rawInput: string;
}

export interface KnorviaStreamingToolInputPreview {
  complete: boolean;
  input: unknown;
  rawInput: string;
}

export type KnorviaStreamingToolInputPreviewMode = "active-live" | "background-summary";

export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT = 1;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS = 750;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH = 8 * 1024;
export const KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS = 1000;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT =
  KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH;

const partialStringFields = [
  "file_path",
  "filePath",
  "path",
  "target_path",
  "targetPath",
  "filename",
  "file",
  "content",
  "new_string",
  "newString",
  "new_text",
  "newText",
  "old_string",
  "oldString",
  "old_text",
  "oldText",
  "command",
  "description",
  "title",
  "pattern",
  "replacement",
  "plan",
  "name",
  "script",
];

function readPartialStringFields(rawInput: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const field of partialStringFields) {
    const match = new RegExp(`"${field}"\\s*:\\s*"`).exec(rawInput);
    if (match === null) {
      continue;
    }

    let segment = "";
    let escaped = false;
    let closed = false;
    for (let index = match.index + match[0].length; index < rawInput.length; index += 1) {
      const character = rawInput[index];
      if (!escaped && character === '"') {
        closed = true;
        break;
      }
      segment += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      }
    }

    if (!closed) {
      segment = segment.replace(/\\u[0-9a-fA-F]{0,3}$/, "").replace(/\\$/, "");
    }

    try {
      fields[field] = JSON.parse(`"${segment}"`) as string;
    } catch {
      fields[field] = segment
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }

  return fields;
}

export function appendKnorviaStreamingToolInputDelta(
  state: KnorviaStreamingToolInputState | undefined,
  delta: string,
): KnorviaStreamingToolInputState {
  return {
    ...state,
    deltaCount: (state?.deltaCount ?? 0) + 1,
    rawInput: `${state?.rawInput ?? ""}${delta}`,
  };
}

export function buildKnorviaStreamingToolInputPreview(
  rawInput: string,
  completeInput?: unknown,
): KnorviaStreamingToolInputPreview {
  if (completeInput !== undefined) {
    return { complete: true, input: completeInput, rawInput };
  }

  try {
    return { complete: true, input: JSON.parse(rawInput), rawInput };
  } catch {
    return { complete: false, input: readPartialStringFields(rawInput), rawInput };
  }
}

export function isKnorviaFileStreamingToolInputPreviewTool(toolName?: string): boolean {
  const normalizedToolName = toolName?.trim().toLowerCase();
  return normalizedToolName === "write" || normalizedToolName === "edit";
}

export function shouldMaterializeKnorviaStreamingToolInputPreview(
  state: KnorviaStreamingToolInputState,
  options: {
    mode?: KnorviaStreamingToolInputPreviewMode;
    now?: number;
    toolName?: string;
  } = {},
): boolean {
  if (options.mode === "background-summary") {
    return false;
  }
  if ((state.deltaCount ?? 0) <= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT) {
    return true;
  }

  const lastPreviewAt = state.lastPreviewAt ?? 0;
  if (isKnorviaFileStreamingToolInputPreviewTool(options.toolName)) {
    return (
      (options.now ?? Date.now()) - lastPreviewAt >=
      KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS
    );
  }

  const rawGrowth = state.rawInput.length - (state.lastPreviewRawInputLength ?? 0);
  if (rawGrowth >= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH) {
    return true;
  }
  const enoughTimeElapsed =
    (options.now ?? Date.now()) - lastPreviewAt >=
    KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS;
  if (!enoughTimeElapsed) {
    return false;
  }
  return state.rawInput.length <= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT;
}

export function markKnorviaStreamingToolInputPreviewMaterialized(
  state: KnorviaStreamingToolInputState,
  now = Date.now(),
): void {
  state.lastPreviewAt = now;
  state.lastPreviewRawInputLength = state.rawInput.length;
}
