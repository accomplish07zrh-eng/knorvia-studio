// SPDX-License-Identifier: Apache-2.0

/** 后台控制项生命周期。认不出的状态词回落到 running。 */
const CONTROL_STATUSES = ["pending", "running", "completed", "failed", "killed", "lost"] as const;

export type KnorviaBackgroundTaskControlStatus = (typeof CONTROL_STATUSES)[number];

type ControlKind = "agent" | "bash";
type Dict = Record<string, unknown>;
type SlotKind = "text" | "number" | "instant" | "boolean";

interface Found<T> {
  value: T;
}

interface AliasGroup {
  kind: ControlKind;
  aliases: readonly string[];
}

interface KindProbe {
  keys: readonly string[];
  groups: readonly AliasGroup[];
  agentWord?: string;
}

interface OptionalSlot {
  field:
    | "toolCallId"
    | "title"
    | "stdoutTail"
    | "stderrTail"
    | "outputTail"
    | "startedAt"
    | "pid"
    | "elapsedMs"
    | "cancellable";
  kind: SlotKind;
  keys: readonly string[];
  presence: "truthy" | "defined";
}

type SlotValue = { text: string; number: number; instant: number; boolean: boolean };

const NAMED_KIND_GROUPS: readonly AliasGroup[] = [
  { kind: "agent", aliases: ["agent", "local_agent", "subagent", "background_agent"] },
  {
    kind: "bash",
    aliases: ["bash", "local_bash", "shell", "terminal", "background_bash", "background_shell"],
  },
];

const CATEGORY_KIND_GROUPS: readonly AliasGroup[] = [
  { kind: "agent", aliases: ["local_agent", "subagent", "background_agent", "agent_background"] },
  {
    kind: "bash",
    aliases: [
      "local_bash",
      "background_bash",
      "background_shell",
      "bash_background",
      "shell_background",
    ],
  },
];

const KIND_PROBES: readonly KindProbe[] = [
  { keys: ["taskKind", "task_kind", "taskType", "task_type"], groups: NAMED_KIND_GROUPS },
  { keys: ["toolName", "tool_name"], groups: NAMED_KIND_GROUPS, agentWord: "task" },
  { keys: ["type", "kind", "category"], groups: CATEGORY_KIND_GROUPS },
];

const STATUS_TABLE: ReadonlyArray<
  readonly [KnorviaBackgroundTaskControlStatus, readonly string[]]
> = [
  ["pending", ["queued", "scheduled", "starting", "pending"]],
  ["running", ["running", "in_progress", "started", "active"]],
  ["completed", ["completed", "complete", "success", "succeeded", "done"]],
  ["failed", ["failed", "failure", "error", "spawn_error"]],
  ["killed", ["killed", "cancelled", "canceled", "stopped", "terminated", "timed_out", "timeout"]],
  ["lost", ["lost", "unknown"]],
];

const BOOLEAN_TEXT: Readonly<Record<string, boolean>> = {
  true: true,
  yes: true,
  "1": true,
  false: false,
  no: false,
  "0": false,
};

const DISPLAY_TEXT_KEYS = ["description", "summary", "title", "label"] as const;
const COMMAND_TEXT_KEYS = ["command", "cmd", "script"] as const;
const STATUS_TEXT_KEYS = ["status", "state", "phase"] as const;
const START_KEYS = ["startedAt", "started_at", "startTime", "start_time"] as const;
const PID_KEYS = ["pid", "processId", "process_id"] as const;

/** 任务 id 族先于作业 id 族，裸 id 垫底，避免同一工具调用里的任务互相覆盖。 */
const JOB_ID_KEY_GROUPS = [
  ["taskId", "task_id", "backgroundTaskId", "background_task_id"],
  ["jobId", "job_id", "backgroundJobId", "background_job_id"],
  ["id"],
] as const;

const JOB_ID_KEYS = JOB_ID_KEY_GROUPS.flat();

const OPTIONAL_SLOTS = [
  { field: "toolCallId", kind: "text", keys: ["toolCallId", "tool_call_id"], presence: "truthy" },
  {
    field: "title",
    kind: "text",
    keys: ["title", "name", "label", "description"],
    presence: "truthy",
  },
  { field: "stdoutTail", kind: "text", keys: ["stdoutTail", "stdout_tail"], presence: "truthy" },
  { field: "stderrTail", kind: "text", keys: ["stderrTail", "stderr_tail"], presence: "truthy" },
  { field: "outputTail", kind: "text", keys: ["outputTail", "output_tail"], presence: "truthy" },
  { field: "startedAt", kind: "instant", keys: START_KEYS, presence: "defined" },
  { field: "pid", kind: "number", keys: PID_KEYS, presence: "defined" },
  {
    field: "elapsedMs",
    kind: "number",
    keys: ["elapsedMs", "elapsed_ms", "durationMs", "duration_ms"],
    presence: "defined",
  },
  { field: "cancellable", kind: "boolean", keys: ["cancellable"], presence: "defined" },
] as const satisfies readonly OptionalSlot[];

type OptionalControlFields = {
  [Slot in (typeof OPTIONAL_SLOTS)[number] as Slot["field"]]?: SlotValue[Slot["kind"]];
};

export type KnorviaBackgroundTaskControlItem = {
  jobId: string;
  command: string;
  taskKind: ControlKind;
  status: KnorviaBackgroundTaskControlStatus;
  raw?: unknown;
} & OptionalControlFields;

const DEFAULT_VISIBLE_ELAPSED_MS = 30_000;

function found<T>(value: T): Found<T> {
  return { value };
}

function asDict(value: unknown): Dict | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  return value as Dict;
}

function foldToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_");
}

function scan<T>(
  record: Dict,
  keys: readonly string[],
  accept: (value: unknown) => Found<T> | undefined,
): T | undefined {
  const accepted = keys.map((name) => accept(record[name])).find((item) => item !== undefined);
  return accepted?.value;
}

function acceptText(value: unknown): Found<string> | undefined {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  return found(trimmed);
}

function acceptNumber(value: unknown): Found<number> | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return;
  return found(numeric);
}

function acceptClock(value: unknown): Found<number> | undefined {
  if (typeof value !== "string" || value.trim() === "") return;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return;
  return found(parsed);
}

function acceptBoolean(value: unknown): Found<boolean> | undefined {
  if (typeof value === "boolean") return found(value);
  if (typeof value !== "string") return;
  const word = value.trim().toLowerCase();
  if (!Object.hasOwn(BOOLEAN_TEXT, word)) return;
  return found(BOOLEAN_TEXT[word] as boolean);
}

function readInstant(record: Dict, keys: readonly string[]): number | undefined {
  return scan(record, keys, acceptNumber) ?? scan(record, keys, acceptClock);
}

function matchAlias(token: string, groups: readonly AliasGroup[]): ControlKind | undefined {
  const group = groups.find((entry) => entry.aliases.includes(token));
  return group?.kind;
}

function probeKind(record: Dict, probe: KindProbe): ControlKind | undefined {
  const text = scan(record, probe.keys, acceptText);
  if (text === undefined) return;
  const token = foldToken(text);
  if (probe.agentWord !== undefined && token === probe.agentWord) return "agent";
  return matchAlias(token, probe.groups);
}

export function resolveKnorviaBackgroundTaskControlKind(value: unknown): ControlKind | undefined {
  const record = asDict(value);
  if (!record) return;
  for (const probe of KIND_PROBES) {
    const kind = probeKind(record, probe);
    if (kind !== undefined) return kind;
  }
  return;
}

function commandWords(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (!Array.isArray(value)) return;
  const words = value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const trimmed = entry.trim();
    return trimmed === "" ? [] : [trimmed];
  });
  return words.length === 0 ? undefined : words.join(" ");
}

function commandFromLayer(record: Dict): string | undefined {
  for (const key of COMMAND_TEXT_KEYS) {
    const words = commandWords(record[key]);
    if (words !== undefined) return words;
  }
  return;
}

function commandFromRecord(record: Dict): string | undefined {
  const direct = commandFromLayer(record);
  if (direct !== undefined) return direct;
  const nested = asDict(record.input);
  if (!nested) return;
  return commandFromLayer(nested);
}

function commandForKind(record: Dict, kind: ControlKind): string | undefined {
  const display = () => scan(record, DISPLAY_TEXT_KEYS, acceptText);
  const shell = () => commandFromRecord(record);
  const order = kind === "agent" ? [display, shell] : [shell, display];
  for (const read of order) {
    const picked = read();
    if (picked !== undefined) return picked;
  }
  return;
}

function statusFromText(text: string | undefined): KnorviaBackgroundTaskControlStatus {
  if (text === undefined) return "running";
  const token = foldToken(text);
  const row = STATUS_TABLE.find(([, aliases]) => aliases.includes(token));
  return row?.[0] ?? "running";
}

function synthesizedJobId(
  pid: number | undefined,
  startedAt: number | undefined,
  command: string,
): string {
  const pidLabel = pid === undefined ? "no-pid" : String(pid);
  const startLabel = startedAt === undefined ? "no-start" : String(startedAt);
  return `background-task:${pidLabel}:${startLabel}:${command}`;
}

function readSlot(record: Dict, slot: OptionalSlot): unknown {
  switch (slot.kind) {
    case "text":
      return scan(record, slot.keys, acceptText);
    case "number":
      return scan(record, slot.keys, acceptNumber);
    case "instant":
      return readInstant(record, slot.keys);
    case "boolean":
      return scan(record, slot.keys, acceptBoolean);
    default:
      return;
  }
}

function fillOptional(item: KnorviaBackgroundTaskControlItem, record: Dict): void {
  for (const slot of OPTIONAL_SLOTS) {
    const value = readSlot(record, slot);
    const present = slot.presence === "truthy" ? Boolean(value) : value !== undefined;
    if (!present) continue;
    Object.assign(item, { [slot.field]: value });
  }
}

function buildControlItem(payload: unknown): KnorviaBackgroundTaskControlItem | undefined {
  const record = asDict(payload);
  if (!record) return;
  const taskKind = resolveKnorviaBackgroundTaskControlKind(record);
  if (taskKind === undefined) return;
  const command = commandForKind(record, taskKind);
  if (command === undefined) return;
  const startedAt = readInstant(record, START_KEYS);
  const pid = scan(record, PID_KEYS, acceptNumber);
  const chosenId =
    scan(record, JOB_ID_KEYS, acceptText) ?? synthesizedJobId(pid, startedAt, command);
  const item: KnorviaBackgroundTaskControlItem = {
    jobId: chosenId,
    command,
    taskKind,
    status: statusFromText(scan(record, STATUS_TEXT_KEYS, acceptText)),
    raw: payload,
  };
  fillOptional(item, record);
  return item;
}

export function parseKnorviaBackgroundTaskControlItems(
  payload: unknown,
): KnorviaBackgroundTaskControlItem[] {
  if (!Array.isArray(payload)) return [];
  const byId = new Map<string, KnorviaBackgroundTaskControlItem>();
  for (const entry of payload) {
    const item = buildControlItem(entry);
    if (item) byId.set(item.jobId, item);
  }
  return [...byId.values()];
}

export function isActiveKnorviaBackgroundTaskControlItem(
  item: KnorviaBackgroundTaskControlItem,
): boolean {
  return item.status === "running";
}

export function getKnorviaBackgroundTaskControlItemElapsedMs(
  item: KnorviaBackgroundTaskControlItem,
  clock = Date.now(),
): number {
  const sinceStart = item.startedAt === undefined ? 0 : Math.max(0, clock - item.startedAt);
  const recorded = item.elapsedMs ?? 0;
  return sinceStart > recorded ? sinceStart : recorded;
}

export function collectVisibleKnorviaBackgroundTaskControlItems(
  items: readonly KnorviaBackgroundTaskControlItem[],
  clock = Date.now(),
  thresholdMs = DEFAULT_VISIBLE_ELAPSED_MS,
): Array<KnorviaBackgroundTaskControlItem & { elapsedMs: number }> {
  return items
    .filter((item) => isActiveKnorviaBackgroundTaskControlItem(item))
    .map((item) => ({
      ...item,
      elapsedMs: getKnorviaBackgroundTaskControlItemElapsedMs(item, clock),
    }))
    .filter((item) => item.elapsedMs >= thresholdMs)
    .sort((left, right) => right.elapsedMs - left.elapsedMs);
}
