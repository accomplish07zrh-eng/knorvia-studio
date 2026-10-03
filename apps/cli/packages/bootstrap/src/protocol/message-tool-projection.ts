import type { ToolState } from "@knorvia/contracts";
import type { KnorviaToolState } from "@knorvia/shared";
import { omitOwnMetadata, projectRecord, type RecordRecipe } from "./message-record-projection.js";

type StoredState<Status extends ToolState["status"]> = Extract<ToolState, { status: Status }>;
type PublicState<Status extends KnorviaToolState["status"]> = Extract<
  KnorviaToolState,
  { status: Status }
>;

const PRIVATE_PART_FIELDS = ["providerToolName"] as const;
const PRIVATE_RUNNING_FIELDS = ["readFileState"] as const;
const PRIVATE_COMPLETED_FIELDS = ["readFileState", "modelContentLayout"] as const;
const PRIVATE_ERROR_FIELDS = ["readFileState", "modelContent"] as const;

export function projectToolPartMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const visible = omitOwnMetadata(metadata, PRIVATE_PART_FIELDS);
  if (visible === metadata) return metadata;
  return visible && Object.keys(visible).length > 0 ? visible : undefined;
}

function stateReader<Status extends ToolState["status"]>(
  recipe: RecordRecipe<StoredState<Status>, PublicState<Status>>,
): (state: ToolState) => KnorviaToolState {
  // dispatcher 的键就是同一 status；这里只收窄输入，不变更或校验持久化状态。
  return (state) => projectRecord(state as StoredState<Status>, recipe);
}

const TOOL_STATES: Record<ToolState["status"], (state: ToolState) => KnorviaToolState> = {
  pending: stateReader<"pending">([
    ["input", (state) => state.input],
    ["raw", (state) => state.raw],
    ["status", (): "pending" => "pending"],
  ]),
  running: stateReader<"running">([
    ["input", (state) => state.input],
    ["metadata", (state) => omitOwnMetadata(state.metadata, PRIVATE_RUNNING_FIELDS)],
    ["startedAt", (state) => state.time.start],
    ["status", (): "running" => "running"],
    ["title", (state) => state.title],
  ]),
  completed: stateReader<"completed">([
    ["completedAt", (state) => state.time.end],
    ["input", (state) => state.input],
    ["metadata", (state) => omitOwnMetadata(state.metadata, PRIVATE_COMPLETED_FIELDS) ?? {}],
    ["output", (state) => state.output],
    ["startedAt", (state) => state.time.start],
    ["status", (): "completed" => "completed"],
    ["title", (state) => state.title],
  ]),
  error: stateReader<"error">([
    ["completedAt", (state) => state.time.end],
    ["error", (state) => state.error],
    ["input", (state) => state.input],
    ["metadata", (state) => omitOwnMetadata(state.metadata, PRIVATE_ERROR_FIELDS)],
    ["startedAt", (state) => state.time.start],
    ["status", (): "error" => "error"],
  ]),
};
// 完整状态表由类型检查保证；清除原型后，非法 status 仍保持原 Map 的 undefined。
Object.setPrototypeOf(TOOL_STATES, null);

export function projectToolState(state: ToolState): KnorviaToolState {
  // 合同四种 status 已完整登记；未知非法值保持原 switch fall-through 的 undefined。
  return TOOL_STATES[state.status]?.(state);
}
