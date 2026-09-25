/**
 * 内核分层探测的结果契约（浏览器安全：只有类型与纯函数，不导入任何 Node 模块）。
 *
 * 一次探测固定四段：locate → version → protocol → auth。每段独立捕获，前段已取得的证据
 * 不被后段失败抹掉；auth 永不自动执行（见 specs/knorvia-kernel-status.md）。
 */
export const PROBE_STAGES = ["locate", "version", "protocol", "auth"] as const;
export type ProbeStage = (typeof PROBE_STAGES)[number];
export type ProbeStageStatus = "ok" | "failed" | "skipped" | "cancelled" | "timeout";

/** 机器可读的失败/跳过原因；自由文本只放在 `reason`。 */
export type ProbeCode =
  | "locate.ok"
  | "locate.registry-closed"
  | "locate.manager-unavailable"
  | "locate.path-invalid"
  | "locate.launcher-unresolved"
  | "locate.missing"
  | "locate.failed"
  | "version.ok"
  | "version.spawn"
  | "version.exit"
  | "version.timeout"
  | "version.cancelled"
  | "version.output-invalid"
  | "version.unparsable"
  | "version.failed"
  | "protocol.ok"
  | "protocol.unavailable"
  | "protocol.mismatch"
  | "protocol.rpc"
  | "protocol.transport"
  | "protocol.timeout"
  | "protocol.cancelled"
  | "protocol.failed"
  | "auth.ok"
  | "auth.not-requested"
  | "auth.unavailable"
  | "auth.failed"
  | "auth.timeout"
  | "auth.cancelled"
  | "stage.not-reached";

export interface ProbeStageResult {
  status: ProbeStageStatus;
  /** 人读原因；非 ok 状态必须给出。 */
  reason?: string;
  /** 机器可读代码；非 ok 状态必须给出。 */
  code?: ProbeCode;
  /** 该段实际耗时（毫秒）；未执行的段为 0。 */
  ms: number;
}

export interface StudioKernelProbe {
  stages: Record<ProbeStage, ProbeStageResult>;
  durationMs: number;
  /** 探测时刻（Unix 毫秒）。 */
  probedAt: number;
  /** 协议段来自短时缓存时为 true；其余阶段仍是本次真实执行的结果。 */
  cached?: boolean;
}

/** 带稳定代码的探测异常；取消/超时/协议不匹配必须用它抛出，避免退化成自由文本。 */
export class ProbeError extends Error {
  constructor(
    readonly code: ProbeCode,
    message: string,
  ) {
    super(message);
    this.name = "ProbeError";
  }
}

export function probeErrorCode(error: unknown): ProbeCode | undefined {
  return error instanceof ProbeError ? error.code : undefined;
}

export function probeErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function probeStageOk(code: ProbeCode, startedAt: number): ProbeStageResult {
  return { status: "ok", code, ms: elapsed(startedAt) };
}

export function probeStageSkipped(
  code: ProbeCode,
  reason: string,
  startedAt = Date.now(),
): ProbeStageResult {
  return { status: "skipped", code, reason, ms: elapsed(startedAt) };
}

/** 前序阶段未通过，本段根本没有执行；与“按规则跳过”区分开。 */
export function probeStageNotReached(): ProbeStageResult {
  return { status: "skipped", code: "stage.not-reached", reason: "前序阶段未通过，未执行", ms: 0 };
}

/**
 * 把某段的异常归一为阶段结果：信号已中止一律记 cancelled；
 * 否则按 ProbeError 代码后缀区分 timeout，其余记 failed。
 */
export function probeStageFailure(options: {
  error: unknown;
  signal?: AbortSignal;
  startedAt: number;
  reason?: string;
  fallback?: ProbeCode;
}): ProbeStageResult {
  const code = probeErrorCode(options.error) ?? options.fallback ?? "locate.failed";
  const status: ProbeStageStatus =
    options.signal?.aborted || code.endsWith(".cancelled")
      ? "cancelled"
      : code.endsWith(".timeout")
        ? "timeout"
        : "failed";
  return {
    status,
    code,
    reason: options.reason ?? probeErrorText(options.error),
    ms: elapsed(options.startedAt),
  };
}

export function buildProbe(options: {
  stages: Partial<Record<ProbeStage, ProbeStageResult>>;
  startedAt: number;
  cached?: boolean;
}): StudioKernelProbe {
  const stages = {} as Record<ProbeStage, ProbeStageResult>;
  for (const stage of PROBE_STAGES) stages[stage] = options.stages[stage] ?? probeStageNotReached();
  return {
    stages,
    durationMs: elapsed(options.startedAt),
    probedAt: Date.now(),
    ...(options.cached ? { cached: true } : {}),
  };
}

/** `installed` 的唯一来源：定位、版本通过，且协议段通过或按规则跳过。 */
export function probeInstalled(probe: StudioKernelProbe): boolean {
  const { locate, version, protocol } = probe.stages;
  return (
    locate.status === "ok" &&
    version.status === "ok" &&
    (protocol.status === "ok" || protocol.status === "skipped")
  );
}

/** 第一条真正失败的阶段；全通过（含按规则跳过）时为 undefined。 */
export function probeSummary(
  probe: StudioKernelProbe,
): { stage: ProbeStage; result: ProbeStageResult } | undefined {
  for (const stage of PROBE_STAGES) {
    const result = probe.stages[stage];
    if (result.status !== "ok" && result.status !== "skipped") return { stage, result };
  }
  return undefined;
}

export const PROBE_CACHE_TTL_MS = 5 * 60_000;
export const PROBE_CACHE_MAX_ENTRIES = 32;

/** 参与缓存键的环境变量；顺序固定以保证指纹稳定。 */
export const PROBE_ENVIRONMENT_KEYS = [
  "PATH",
  "Path",
  "SystemRoot",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOME",
  "DSH_HOME",
  "NODE_OPTIONS",
] as const;

export function environmentFingerprint(
  environment: Record<string, string | undefined> = {},
): string {
  return PROBE_ENVIRONMENT_KEYS.map((key) => `${key}=${environment[key] ?? ""}`).join("\u0000");
}

/** 缓存键五元组：内核、可执行文件路径、版本、环境指纹、工作区标识。 */
export function probeCacheKey(input: {
  kernel: string;
  executablePath: string;
  version: string;
  environment?: Record<string, string | undefined>;
  workspaceIdentity: string;
}): string {
  return [
    input.kernel,
    input.executablePath,
    input.version,
    environmentFingerprint(input.environment),
    input.workspaceIdentity,
  ].join("\u0001");
}

/** 有界、带 TTL 的探测结果缓存；只缓存成功结果，读命中同时刷新最近使用顺序。 */
export class ProbeCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(
    private readonly ttlMs: number = PROBE_CACHE_TTL_MS,
    private readonly maxEntries: number = PROBE_CACHE_MAX_ENTRIES,
  ) {}
  read(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  write(key: string, value: T): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
  clear(): void {
    this.entries.clear();
  }
  get size(): number {
    return this.entries.size;
  }
}
