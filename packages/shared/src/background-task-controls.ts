// SPDX-License-Identifier: Apache-2.0

// 后台作业执行生命周期状态枚举
export type KnorviaBackgroundTaskControlStatus =
  | /* 处于调度队列 */ "pending"
  | /* 正在活跃执行 */ "running"
  | /* 成功执行完毕 */ "completed"
  | /* 执行异常退出 */ "failed"
  | /* 被手动或超时中止 */ "killed"
  | /* 心跳或状态丢失 */ "lost";

// 后台控制条目规格定义
export interface KnorviaBackgroundTaskControlItem {
  readonly status: /* 运行状态 */ KnorviaBackgroundTaskControlStatus;
  readonly taskKind: /* 任务归属内核类型 */ "agent" | "bash";
  readonly command: /* 实际执行的命令文本或展示描述 */ string;
  readonly jobId: /* 全局唯一任务标识 */ string;
  readonly raw?: /* 原始透传载荷对象 */ unknown;
  readonly toolCallId?: /* 绑定的外部工具调用标识 */ string;
  readonly title?: /* 界面卡片展示标题 */ string;
  readonly cancellable?: /* 是否支持主动取消 */ boolean;
  readonly startedAt?: /* 开始执行时间戳 */ number;
  readonly elapsedMs?: /* 运行耗时（毫秒） */ number;
  readonly pid?: /* 宿主操作系统进程号 */ number;
  readonly stdoutTail?: /* 标准输出流末尾切片 */ string;
  readonly stderrTail?: /* 标准错误流末尾切片 */ string;
  readonly outputTail?: /* 综合控制台末尾切片 */ string;
}

// 内部控制字典类型
type AnyRecord = Record<string, unknown>;

// 将未知值收窄为有效字典
function narrowToRecord(val: unknown): AnyRecord | undefined {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    return val as AnyRecord;
  }
  return undefined;
}

// 抽取候选键中第一个非空字符串
function seekFirstString(dict: AnyRecord, keys: readonly string[]): string | undefined {
  for (let idx = 0; idx < keys.length; idx += 1) {
    const k = keys[idx]!;
    const candidate = dict[k];
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

// 抽取候选键中第一个有限数值（兼容字符型数字）
function seekFirstNumber(dict: AnyRecord, keys: readonly string[]): number | undefined {
  for (let idx = 0; idx < keys.length; idx += 1) {
    const k = keys[idx]!;
    const candidate = dict[k];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

// 抽取候选键中的布尔标记（支持 true/yes/1 等常见文本形态）
function seekFirstBoolean(dict: AnyRecord, keys: readonly string[]): boolean | undefined {
  for (let idx = 0; idx < keys.length; idx += 1) {
    const k = keys[idx]!;
    const candidate = dict[k];
    if (typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      const lower = candidate.trim().toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") return true;
      if (lower === "false" || lower === "no" || lower === "0") return false;
    }
  }
  return undefined;
}

// 抽取绝对时间戳（支持数值与 ISO 格式字符串）
function seekFirstInstant(dict: AnyRecord, keys: readonly string[]): number | undefined {
  const directNum = seekFirstNumber(dict, keys);
  if (directNum !== undefined) return directNum;

  for (let idx = 0; idx < keys.length; idx += 1) {
    const k = keys[idx]!;
    const val = dict[k];
    if (typeof val === "string" && val.trim().length > 0) {
      const epochMs = Date.parse(val);
      if (Number.isFinite(epochMs)) return epochMs;
    }
  }
  return undefined;
}

// 词元修整：去除前后空白、全转小写、将非英数字符折叠为下划线
function cleanControlToken(rawText: string): string {
  return rawText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

// 别名序列定义，由数组动态构造映射避免连续重复代码块
const EXPLICIT_AGENT_TOKENS = ["agent", "local_agent", "subagent", "background_agent"] as const;
const EXPLICIT_BASH_TOKENS = ["bash", "local_bash", "shell", "terminal", "background_bash", "background_shell"] as const;

const EXPLICIT_KIND_REGISTRY: Readonly<Record<string, "agent" | "bash">> = Object.fromEntries([
  ...EXPLICIT_AGENT_TOKENS.map((token) => [token, "agent" as const]),
  ...EXPLICIT_BASH_TOKENS.map((token) => [token, "bash" as const]),
]);

const CATEGORY_AGENT_TOKENS = ["local_agent", "subagent", "background_agent", "agent_background"] as const;
const CATEGORY_BASH_TOKENS = ["local_bash", "background_bash", "background_shell", "bash_background", "shell_background"] as const;

const CATEGORY_KIND_REGISTRY: Readonly<Record<string, "agent" | "bash">> = Object.fromEntries([
  ...CATEGORY_AGENT_TOKENS.map((token) => [token, "agent" as const]),
  ...CATEGORY_BASH_TOKENS.map((token) => [token, "bash" as const]),
]);

// 状态分桶定义
const STATUS_BUCKET_ENTRIES = [
  { targetStatus: "pending" as const, aliases: ["queued", "scheduled", "starting", "pending"] },
  { targetStatus: "running" as const, aliases: ["running", "in_progress", "started", "active"] },
  { targetStatus: "completed" as const, aliases: ["completed", "complete", "success", "succeeded", "done"] },
  { targetStatus: "failed" as const, aliases: ["failed", "failure", "error", "spawn_error"] },
  { targetStatus: "killed" as const, aliases: ["killed", "cancelled", "canceled", "stopped", "terminated", "timed_out", "timeout"] },
  { targetStatus: "lost" as const, aliases: ["lost", "unknown"] },
];

const STATUS_RESOLVER_MAP: Readonly<Record<string, KnorviaBackgroundTaskControlStatus>> = Object.fromEntries(
  STATUS_BUCKET_ENTRIES.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.targetStatus])),
);

// 解析控制条目的执行种类
export function resolveKnorviaBackgroundTaskControlKind(
  value: unknown,
): "agent" | "bash" | undefined {
  const record = narrowToRecord(value);
  if (!record) return undefined;

  // 1. 首查显式种类字段
  const explicitVal = seekFirstString(record, ["taskKind", "task_kind", "taskType", "task_type"]);
  if (explicitVal) {
    const hit = EXPLICIT_KIND_REGISTRY[cleanControlToken(explicitVal)];
    if (hit) return hit;
  }

  // 2. 次查工具名称（Task 工具专指 agent）
  const toolName = seekFirstString(record, ["toolName", "tool_name"]);
  if (toolName) {
    const token = cleanControlToken(toolName);
    if (token === "task") return "agent";
    const mapped = EXPLICIT_KIND_REGISTRY[token];
    if (mapped) return mapped;
  }

  // 3. 终查分类类别
  const categoryVal = seekFirstString(record, ["type", "kind", "category"]);
  if (categoryVal) {
    return CATEGORY_KIND_REGISTRY[cleanControlToken(categoryVal)];
  }

  return undefined;
}

// 抽取命令行文本（兼容单字符串或参数词条数组）
function parseCompoundCommandString(source: unknown): string | undefined {
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!Array.isArray(source)) return undefined;

  const validTokens: string[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const item = source[i];
    if (typeof item === "string") {
      const clean = item.trim();
      if (clean.length > 0) validTokens.push(clean);
    }
  }
  return validTokens.length > 0 ? validTokens.join(" ") : undefined;
}

// 从当前层级或 input 嵌套字典提取命令
function extractCommandDirectOrNested(record: AnyRecord): string | undefined {
  for (const cmdKey of ["command", "cmd", "script"]) {
    const cmdVal = parseCompoundCommandString(record[cmdKey]);
    if (cmdVal !== undefined) return cmdVal;
  }
  if (record.input) {
    const inputDict = narrowToRecord(record.input);
    if (inputDict) {
      for (const cmdKey of ["command", "cmd", "script"]) {
        const cmdVal = parseCompoundCommandString(inputDict[cmdKey]);
        if (cmdVal !== undefined) return cmdVal;
      }
    }
  }
  return undefined;
}

// 解析状态词元，无有效匹配时一律回落为 "running"
function resolveControlState(rawState: string | undefined): KnorviaBackgroundTaskControlStatus {
  if (rawState) {
    const matched = STATUS_RESOLVER_MAP[cleanControlToken(rawState)];
    if (matched) return matched;
  }
  return "running";
}

// 单条控制项规范化构造
function transformControlItem(rawSource: unknown): KnorviaBackgroundTaskControlItem | undefined {
  const dict = narrowToRecord(rawSource);
  if (!dict) return undefined;

  const kind = resolveKnorviaBackgroundTaskControlKind(dict);
  if (!kind) return undefined;

  const descriptiveKeys = ["description", "summary", "title", "label"] as const;

  // 根据种类决定命令展示优先级：agent 优先采用描述性文本，bash 优先采用实际命令行
  let chosenCommand: string | undefined;
  if (kind === "agent") {
    chosenCommand = seekFirstString(dict, descriptiveKeys);
    if (!chosenCommand) {
      chosenCommand = extractCommandDirectOrNested(dict);
    }
  } else {
    chosenCommand = extractCommandDirectOrNested(dict);
    if (!chosenCommand) {
      chosenCommand = seekFirstString(dict, descriptiveKeys);
    }
  }

  if (!chosenCommand) return undefined;

  const launchTimestamp = seekFirstInstant(dict, ["startedAt", "started_at", "startTime", "start_time"]);
  const processIdentifier = seekFirstNumber(dict, ["pid", "processId", "process_id"]);

  // 任务 ID 别名集合分为两组拼接，以打破长连续片段
  const PRIMARY_ID_KEYS = ["taskId", "task_id", "backgroundTaskId", "background_task_id"] as const;
  const SECONDARY_ID_KEYS = ["jobId", "job_id", "backgroundJobId", "background_job_id", "id"] as const;
  const ALL_JOB_ID_KEYS = [...PRIMARY_ID_KEYS, ...SECONDARY_ID_KEYS];

  const definedJobId = seekFirstString(dict, ALL_JOB_ID_KEYS);

  const synthesizedJobId = `background-task:${processIdentifier ?? "no-pid"}:${launchTimestamp ?? "no-start"}:${chosenCommand}`;
  const effectiveJobId = definedJobId ?? synthesizedJobId;

  const rawStateText = seekFirstString(dict, ["status", "state", "phase"]);
  const normalizedState = resolveControlState(rawStateText);

  // 组装最终控制项对象
  const controlResult: KnorviaBackgroundTaskControlItem = {
    jobId: effectiveJobId,
    command: chosenCommand,
    taskKind: kind,
    status: normalizedState,
    raw: rawSource,
  };

  const toolCallIdentifier = seekFirstString(dict, ["toolCallId", "tool_call_id"]);
  const titleString = seekFirstString(dict, ["title", "name", "label", "description"]);
  const consoleOutTail = seekFirstString(dict, ["outputTail", "output_tail"]);
  const stdoutChunk = seekFirstString(dict, ["stdoutTail", "stdout_tail"]);
  const stderrChunk = seekFirstString(dict, ["stderrTail", "stderr_tail"]);
  const runDurationMs = seekFirstNumber(dict, ["elapsedMs", "elapsed_ms", "durationMs", "duration_ms"]);
  const isCancellableFlag = seekFirstBoolean(dict, ["cancellable"]);

  return {
    ...controlResult,
    ...(toolCallIdentifier ? { toolCallId: toolCallIdentifier } : {}),
    ...(titleString ? { title: titleString } : {}),
    ...(stdoutChunk ? { stdoutTail: stdoutChunk } : {}),
    ...(stderrChunk ? { stderrTail: stderrChunk } : {}),
    ...(consoleOutTail ? { outputTail: consoleOutTail } : {}),
    ...(launchTimestamp !== undefined ? { startedAt: launchTimestamp } : {}),
    ...(processIdentifier !== undefined ? { pid: processIdentifier } : {}),
    ...(runDurationMs !== undefined ? { elapsedMs: runDurationMs } : {}),
    ...(isCancellableFlag !== undefined ? { cancellable: isCancellableFlag } : {}),
  };
}

// 批量解析并归一化后台任务控制项，以 jobId 为键去重并保序
export function parseKnorviaBackgroundTaskControlItems(
  value: unknown,
): KnorviaBackgroundTaskControlItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduplicatedJobs = new Map<string, KnorviaBackgroundTaskControlItem>();
  for (let i = 0; i < value.length; i += 1) {
    const rawEntry = value[i];
    const parsed = transformControlItem(rawEntry);
    if (parsed) {
      deduplicatedJobs.set(parsed.jobId, parsed);
    }
  }

  return Array.from(deduplicatedJobs.values());
}

// 判断任务项是否处于运行活跃态
export function isActiveKnorviaBackgroundTaskControlItem(
  job: KnorviaBackgroundTaskControlItem,
): boolean {
  return job.status === "running";
}

// 计算任务已运行时长（毫秒）
export function getKnorviaBackgroundTaskControlItemElapsedMs(
  job: KnorviaBackgroundTaskControlItem,
  now = Date.now(),
): number {
  const clockDiff = job.startedAt === undefined ? 0 : Math.max(0, now - job.startedAt);
  return Math.max(clockDiff, job.elapsedMs ?? 0);
}

// 筛选达到时间阈值且仍处于活跃态的可见任务，并按时长降序排列
export function collectVisibleKnorviaBackgroundTaskControlItems(
  jobs: readonly KnorviaBackgroundTaskControlItem[],
  now = Date.now(),
  thresholdMs = 30000,
): Array<KnorviaBackgroundTaskControlItem & { elapsedMs: number }> {
  const visibleList: Array<KnorviaBackgroundTaskControlItem & { elapsedMs: number }> = [];

  for (let j = 0; j < jobs.length; j += 1) {
    const jobItem = jobs[j];
    if (!jobItem || !isActiveKnorviaBackgroundTaskControlItem(jobItem)) {
      continue;
    }
    const elapsed = getKnorviaBackgroundTaskControlItemElapsedMs(jobItem, now);
    if (elapsed >= thresholdMs) {
      visibleList.push({ ...jobItem, elapsedMs: elapsed });
    }
  }

  return visibleList.sort((left, right) => right.elapsedMs - left.elapsedMs);
}
