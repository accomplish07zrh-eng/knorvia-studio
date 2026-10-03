export type KnorviaBackgroundTaskControlStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "killed"
  | "lost";

export interface KnorviaBackgroundTaskControlItem {
  jobId: string;
  toolCallId?: string;
  command: string;
  taskKind: "agent" | "bash";
  cancellable?: boolean;
  title?: string;
  status: KnorviaBackgroundTaskControlStatus;
  startedAt?: number;
  elapsedMs?: number;
  pid?: number;
  stdoutTail?: string;
  stderrTail?: string;
  outputTail?: string;
  raw?: unknown;
}

type BackgroundTaskControlKind = KnorviaBackgroundTaskControlItem["taskKind"];
type ControlRecord = Record<string, unknown>;

function controlRecord(value: unknown): ControlRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ControlRecord;
}

function firstText(record: ControlRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      const text = candidate.trim();
      if (text.length > 0) return text;
    }
  }
  return undefined;
}

function firstNumber(record: ControlRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const candidate = record[key];
    let number: number;
    if (typeof candidate === "number") {
      number = candidate;
    } else if (typeof candidate === "string" && candidate.trim().length > 0) {
      number = Number(candidate);
    } else {
      continue;
    }
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function firstBoolean(record: ControlRecord, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "boolean") return candidate;
    if (typeof candidate !== "string") continue;
    switch (candidate.trim().toLowerCase()) {
      case "true":
      case "yes":
      case "1":
        return true;
      case "false":
      case "no":
      case "0":
        return false;
    }
  }
  return undefined;
}

function firstInstant(record: ControlRecord, keys: readonly string[]): number | undefined {
  const numeric = firstNumber(record, keys);
  if (numeric !== undefined) return numeric;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return undefined;
}

function controlToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_");
}

const namedKinds: Readonly<Record<string, BackgroundTaskControlKind>> = {
  agent: "agent",
  local_agent: "agent",
  subagent: "agent",
  background_agent: "agent",
  bash: "bash",
  local_bash: "bash",
  shell: "bash",
  terminal: "bash",
  background_bash: "bash",
  background_shell: "bash",
};

const backgroundKinds: Readonly<Record<string, BackgroundTaskControlKind>> = {
  local_agent: "agent",
  subagent: "agent",
  background_agent: "agent",
  agent_background: "agent",
  local_bash: "bash",
  background_bash: "bash",
  background_shell: "bash",
  bash_background: "bash",
  shell_background: "bash",
};

function kindFromText(
  text: string | undefined,
  aliases: Readonly<Record<string, BackgroundTaskControlKind>>,
): BackgroundTaskControlKind | undefined {
  if (text === undefined) return undefined;
  const token = controlToken(text);
  return Object.prototype.hasOwnProperty.call(aliases, token) ? aliases[token] : undefined;
}

export function resolveKnorviaBackgroundTaskControlKind(
  value: unknown,
): BackgroundTaskControlKind | undefined {
  const record = controlRecord(value);
  if (record === undefined) return undefined;

  const explicit = kindFromText(
    firstText(record, ["taskKind", "task_kind", "taskType", "task_type"]),
    namedKinds,
  );
  if (explicit !== undefined) return explicit;

  const tool = firstText(record, ["toolName", "tool_name"]);
  if (tool !== undefined && controlToken(tool) === "task") return "agent";
  const toolKind = kindFromText(tool, namedKinds);
  if (toolKind !== undefined) return toolKind;

  return kindFromText(firstText(record, ["type", "kind", "category"]), backgroundKinds);
}

function commandValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const words: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const word = entry.trim();
    if (word.length > 0) words.push(word);
  }
  return words.length > 0 ? words.join(" ") : undefined;
}

function recordCommand(record: ControlRecord): string | undefined {
  for (const key of ["command", "cmd", "script"]) {
    const command = commandValue(record[key]);
    if (command !== undefined) return command;
  }
  return undefined;
}

function controlCommand(record: ControlRecord): string | undefined {
  const direct = recordCommand(record);
  if (direct !== undefined) return direct;
  const input = controlRecord(record.input);
  return input === undefined ? undefined : recordCommand(input);
}

const statusGroups: ReadonlyArray<{
  status: KnorviaBackgroundTaskControlStatus;
  tokens: readonly string[];
}> = [
  { status: "pending", tokens: ["queued", "scheduled", "starting", "pending"] },
  { status: "running", tokens: ["running", "in_progress", "started", "active"] },
  { status: "completed", tokens: ["completed", "complete", "success", "succeeded", "done"] },
  { status: "failed", tokens: ["failed", "failure", "error", "spawn_error"] },
  {
    status: "killed",
    tokens: ["killed", "cancelled", "canceled", "stopped", "terminated", "timed_out", "timeout"],
  },
  { status: "lost", tokens: ["lost", "unknown"] },
];

function controlStatus(text: string | undefined): KnorviaBackgroundTaskControlStatus {
  if (text !== undefined) {
    const token = controlToken(text);
    for (const group of statusGroups) {
      if (group.tokens.includes(token)) return group.status;
    }
  }
  return "running";
}

function normalizeControl(value: unknown): KnorviaBackgroundTaskControlItem | undefined {
  const record = controlRecord(value);
  if (record === undefined) return undefined;
  const taskKind = resolveKnorviaBackgroundTaskControlKind(record);
  if (taskKind === undefined) return undefined;

  const displayKeys = ["description", "summary", "title", "label"];
  const command =
    taskKind === "agent"
      ? (firstText(record, displayKeys) ?? controlCommand(record))
      : (controlCommand(record) ?? firstText(record, displayKeys));
  if (command === undefined) return undefined;

  const startedAt = firstInstant(record, ["startedAt", "started_at", "startTime", "start_time"]);
  const pid = firstNumber(record, ["pid", "processId", "process_id"]);
  // 任务标识优先于工具调用标识：兼容旧后台任务记录，避免同一工具调用下的任务相互覆盖。
  const jobId =
    firstText(record, [
      "taskId",
      "task_id",
      "backgroundTaskId",
      "background_task_id",
      "jobId",
      "job_id",
      "backgroundJobId",
      "background_job_id",
      "id",
    ]) ?? `background-task:${pid ?? "no-pid"}:${startedAt ?? "no-start"}:${command}`;
  const job: KnorviaBackgroundTaskControlItem = {
    jobId,
    command,
    taskKind,
    status: controlStatus(firstText(record, ["status", "state", "phase"])),
    raw: value,
  };

  const toolCallId = firstText(record, ["toolCallId", "tool_call_id"]);
  const elapsedMs = firstNumber(record, ["elapsedMs", "elapsed_ms", "durationMs", "duration_ms"]);
  const title = firstText(record, ["title", "name", "label", "description"]);
  const cancellable = firstBoolean(record, ["cancellable"]);
  const stdoutTail = firstText(record, ["stdoutTail", "stdout_tail"]);
  const stderrTail = firstText(record, ["stderrTail", "stderr_tail"]);
  const outputTail = firstText(record, ["outputTail", "output_tail"]);

  if (toolCallId) job.toolCallId = toolCallId;
  if (title) job.title = title;
  if (stdoutTail) job.stdoutTail = stdoutTail;
  if (stderrTail) job.stderrTail = stderrTail;
  if (outputTail) job.outputTail = outputTail;
  if (startedAt !== undefined) job.startedAt = startedAt;
  if (pid !== undefined) job.pid = pid;
  if (elapsedMs !== undefined) job.elapsedMs = elapsedMs;
  if (cancellable !== undefined) job.cancellable = cancellable;
  return job;
}

export function parseKnorviaBackgroundTaskControlItems(
  value: unknown,
): KnorviaBackgroundTaskControlItem[] {
  if (!Array.isArray(value)) return [];
  const jobs = new Map<string, KnorviaBackgroundTaskControlItem>();
  for (const entry of value) {
    const job = normalizeControl(entry);
    if (job !== undefined) jobs.set(job.jobId, job);
  }
  return Array.from(jobs.values());
}

export function isActiveKnorviaBackgroundTaskControlItem(
  job: KnorviaBackgroundTaskControlItem,
): boolean {
  return job.status === "running";
}

export function getKnorviaBackgroundTaskControlItemElapsedMs(
  job: KnorviaBackgroundTaskControlItem,
  now = Date.now(),
): number {
  const clockElapsed = job.startedAt === undefined ? 0 : Math.max(0, now - job.startedAt);
  return Math.max(clockElapsed, job.elapsedMs ?? 0);
}

export function collectVisibleKnorviaBackgroundTaskControlItems(
  jobs: readonly KnorviaBackgroundTaskControlItem[],
  now = Date.now(),
  thresholdMs = 30000,
): Array<KnorviaBackgroundTaskControlItem & { elapsedMs: number }> {
  const visible: Array<KnorviaBackgroundTaskControlItem & { elapsedMs: number }> = [];
  for (const job of jobs) {
    if (!isActiveKnorviaBackgroundTaskControlItem(job)) continue;
    const elapsedMs = getKnorviaBackgroundTaskControlItemElapsedMs(job, now);
    if (elapsedMs >= thresholdMs) visible.push({ ...job, elapsedMs });
  }
  return visible.sort((left, right) => right.elapsedMs - left.elapsedMs);
}
