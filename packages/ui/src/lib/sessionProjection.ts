/* oxlint-disable eslint(max-lines) -- Knorvia session 到当前聊天 projection 的迁移桥需要同时保持 snapshot 和 event 映射一致。 */
// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B3 ordered projection adapters, 2026-09-30.
// Prior source was reviewed; authorship/license review remains pending.
import {
  decodeCustomModelValue,
  deriveKnorviaTaskStatusFromSessionSnapshot,
  generateTraceId,
  getKnorviaAgentModeSelectOptions,
  normalizeAvailableKnorviaMode,
  parseModelPickerValue as parseSharedModelSelection,
  formatModelPickerValue as formatSharedModelSelection,
  resolveKnorviaVisibleSessionTitle,
  KNORVIA_AGENT_PROVIDER,
  type KnorviaConfigOption,
  type KnorviaTaskGoal,
  type KnorviaTaskMeta,
  type KnorviaMessageWithParts,
  type ModelSelection,
  type KnorviaSessionMode,
  type KnorviaSessionSettingsState,
  type KnorviaSessionStateSnapshot,
} from "@knorvia/shared";

type PickerKind = "model" | "mode" | "thought_level";
type SelectChoices = NonNullable<KnorviaConfigOption["options"]>;
const pickerTitles: Record<PickerKind, string> = {
  model: "Model",
  mode: "Mode",
  thought_level: "Thought Level",
};

function selectConfiguration(
  kind: PickerKind,
  currentValue: string,
  options: SelectChoices,
): KnorviaConfigOption {
  return {
    id: kind,
    name: pickerTitles[kind],
    category: kind,
    type: "select",
    currentValue,
    options,
  };
}

export function formatModelPickerValue(ref: ModelSelection | undefined): string {
  return formatSharedModelSelection(ref);
}

export function parseModelPickerValue(value: string): ModelSelection {
  const custom = decodeCustomModelValue(value);
  if (custom?.providerId && custom.modelName) {
    // custom 展示值保持原 decoder 兼容边界；执行结构不携带 UI 字符串。
    return { providerId: custom.providerId, modelId: custom.modelName };
  }
  return parseSharedModelSelection(value);
}

function modelChoice(
  model: KnorviaSessionSettingsState["model"]["available"][number],
): SelectChoices[number] {
  const levels = model.reasoning?.levels.map((level) => level.value);
  const defaultLevel =
    model.reasoning?.defaultLevel && levels?.includes(model.reasoning.defaultLevel)
      ? model.reasoning.defaultLevel
      : undefined;
  return {
    value: formatModelPickerValue(model.ref),
    name: model.label,
    description: model.description,
    modelProviderId: model.ref.providerId,
    modelProviderName: model.providerLabel ?? model.ref.providerId,
    ...(levels ? { modelThoughtLevels: levels } : {}),
    ...(defaultLevel ? { modelDefaultThoughtLevel: defaultLevel } : {}),
  };
}

function thoughtCurrentValue(thought: KnorviaSessionSettingsState["thoughtLevel"]): string {
  const values = thought.available.map((level) => level.value);
  const current = thought.current && values.includes(thought.current) ? thought.current : undefined;
  const defaultLevel =
    thought.defaultLevel && values.includes(thought.defaultLevel)
      ? thought.defaultLevel
      : undefined;
  // current 未在目录中时才使用模型 default；meta 的原 current 由另一投影保留。
  return current ?? defaultLevel ?? values[0] ?? "";
}

export function sessionSettingsToConfigOptions(
  settings: KnorviaSessionSettingsState,
): KnorviaConfigOption[] {
  const result = [
    selectConfiguration(
      "model",
      formatModelPickerValue(settings.model.current),
      settings.model.available.map(modelChoice),
    ),
    selectConfiguration(
      "mode",
      normalizeAvailableKnorviaMode(settings.mode.current),
      getKnorviaAgentModeSelectOptions(),
    ),
  ];
  if (settings.thoughtLevel.enabled) {
    result.push(
      selectConfiguration(
        "thought_level",
        thoughtCurrentValue(settings.thoughtLevel),
        settings.thoughtLevel.available.map((level) => ({
          value: level.value,
          name: level.label,
          description: level.description,
        })),
      ),
    );
  }
  return result;
}

export function knorviaWorkspacePresentationToConfigOptions(
  mode: KnorviaSessionMode,
): KnorviaConfigOption[] {
  return [
    selectConfiguration(
      "mode",
      normalizeAvailableKnorviaMode(mode),
      getKnorviaAgentModeSelectOptions(),
    ),
  ];
}

function messageModel(messages: readonly KnorviaMessageWithParts[]): ModelSelection | undefined {
  // 冷恢复 hint 取最后消息的真实模型，包括隐藏消息；不按时间或可见性重排。
  for (let index = messages.length - 1; index >= 0; index--) {
    const model = messages[index]?.info.model;
    if (model) return model;
  }
  return undefined;
}

function lastErrorMetadata(
  error: KnorviaSessionStateSnapshot["projection"]["lastError"],
): KnorviaTaskMeta["lastError"] {
  if (!error) return undefined;
  return {
    code: error.code ?? error.type,
    ...(error.detail ? { detail: error.detail } : {}),
    ...(error.attribution ? { attribution: error.attribution } : {}),
    message: error.message,
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function textField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function finiteField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function goalStatus(value: string | undefined): KnorviaTaskGoal["status"] {
  switch (value) {
    case "active":
    case "paused":
    case "budget_limited":
    case "complete":
      return value;
    default:
      return "active";
  }
}

function goalMetadata(
  value: KnorviaSessionStateSnapshot["projection"]["target"],
): KnorviaTaskMeta["target"] {
  if (!value) return value;
  const record = objectRecord(value);
  const time = objectRecord(record.time);
  const status = textField(record, "status");
  // 仅访问合同字段，未知/循环 payload 不递归；tokenBudget 的旧非有限数边界不统一到计数规则。
  return {
    sessionID: textField(record, "sessionID", "sessionId") ?? "",
    targetID: textField(record, "targetID", "targetId") ?? "",
    objective: textField(record, "objective") ?? "",
    summaryTitle: textField(record, "summaryTitle") ?? null,
    status: goalStatus(status),
    tokenBudget: typeof record.tokenBudget === "number" ? record.tokenBudget : null,
    tokensUsed: finiteField(record, "tokensUsed") ?? 0,
    timeUsedSeconds: finiteField(record, "timeUsedSeconds") ?? 0,
    activeInputId: textField(record, "activeInputId") ?? null,
    activeRunStartedAtMs: finiteField(record, "activeRunStartedAtMs") ?? null,
    activeRunLastSeenAtMs: finiteField(record, "activeRunLastSeenAtMs") ?? null,
    time: {
      created: finiteField(time, "created") ?? finiteField(record, "createdAt") ?? 0,
      updated: finiteField(time, "updated") ?? finiteField(record, "updatedAt") ?? 0,
    },
  };
}

export function sessionSnapshotToTaskMeta(snapshot: KnorviaSessionStateSnapshot): KnorviaTaskMeta {
  // 按公共键序求值：trace 副作用必须在 title/status 或 malformed payload 抛错之前。
  return {
    taskId: snapshot.session.sessionId,
    traceId: generateTraceId(snapshot.session.sessionId),
    title: resolveKnorviaVisibleSessionTitle({
      title: snapshot.session.title,
      messages: snapshot.messages,
      target: snapshot.projection.target,
    }),
    workspacePath: snapshot.session.workspace.workspacePath,
    workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt,
    mode: snapshot.session.mode,
    model: formatModelPickerValue(
      messageModel(snapshot.messages) ?? snapshot.settings.model.current,
    ),
    thoughtLevel: snapshot.settings.thoughtLevel.current,
    provider: KNORVIA_AGENT_PROVIDER,
    status: deriveKnorviaTaskStatusFromSessionSnapshot(snapshot),
    lastError: lastErrorMetadata(snapshot.projection.lastError),
    target: goalMetadata(snapshot.projection.target),
  };
}
