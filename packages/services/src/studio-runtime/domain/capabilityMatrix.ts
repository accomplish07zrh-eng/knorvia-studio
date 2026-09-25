/**
 * 版本化能力矩阵：五个能力的唯一来源（见 specs/knorvia-kernel-status.md）。
 *
 * 本文件属于 domain 层，只做纯计算：不导入任何其它模块（避免与 kernelTypes.ts 形成循环依赖，
 * 也避免 domain 出现 IO）。判定结果必须能区分“已核验 / 已声明 / 原生声明 / 未核验 / 不支持 /
 * 用户显式例外”，且只能如实收紧，从不静默升级能力。
 */

/** 与 `StudioKernelCapabilities` 结构一致的本地视图（domain 层不反向导入 kernelTypes）。 */
export interface StudioCapabilitySet {
  resume: boolean;
  approval: boolean;
  questions: boolean;
  readOnly: boolean;
  fullAccess: boolean;
}
export type StudioCapabilityId = keyof StudioCapabilitySet;
export const STUDIO_CAPABILITY_IDS = [
  "resume",
  "approval",
  "questions",
  "readOnly",
  "fullAccess",
] as const satisfies readonly StudioCapabilityId[];

export type StudioCapabilityEvidence =
  /** 命中版本化的已核验行。 */
  | "verified"
  /** 版本未知时适配器自身的既有声明（与今天线上行为一致）。 */
  | "declared"
  /** 探测期原生协议声明（ACP initialize 的 resume）。 */
  | "advertised"
  /** Studio 适配器自身实现（ACP 握手后的审批通道）。 */
  | "adapter"
  /** 明确不支持。 */
  | "unsupported"
  /** 版本已知但不在已核验范围内：失败关闭。 */
  | "unverified"
  /** 用户显式授权的例外，只能由调用方传入，永不自动产生。 */
  | "user-exception";

export interface StudioCapabilityDecision {
  supported: boolean;
  evidence: StudioCapabilityEvidence;
  /** 证据来源，例如 `acp-initialize`；非外部声明时为 undefined。 */
  source?: string;
}

export interface StudioCapabilityAssessment {
  kernel: string;
  version?: string;
  matrixVersion: string;
  capabilities: StudioCapabilitySet;
  decisions: Record<StudioCapabilityId, StudioCapabilityDecision>;
}

export const STUDIO_CAPABILITY_MATRIX_VERSION = "knorvia-capability-matrix/1";

interface CapabilityRow {
  id: string;
  matches(kernel: string): boolean;
  /** 已在本仓库实测过的版本下限；缺省表示该家族与版本无关。 */
  verifiedFrom?: string;
  capabilities: StudioCapabilitySet;
  evidence?: Partial<Record<StudioCapabilityId, StudioCapabilityEvidence>>;
}

function set(
  resume: boolean,
  approval: boolean,
  questions: boolean,
  readOnly: boolean,
  fullAccess: boolean,
): StudioCapabilitySet {
  return { resume, approval, questions, readOnly, fullAccess };
}

/**
 * 行表按“内核/家族 + 版本下限”组织。能力值与替换前的硬编码分支逐一等价；
 * 版本未知时使用 `declared` 证据，行为不变。
 */
const ROWS: readonly CapabilityRow[] = [
  {
    id: "knorvia",
    matches: (kernel) => kernel === "knorvia",
    capabilities: set(true, true, true, false, true),
    evidence: { readOnly: "unsupported" },
  },
  {
    id: "codex",
    matches: (kernel) => kernel === "codex",
    // 本机 0.151.0 的 app-server 沙箱策略已核验（kernels/README.md 的协议依据）。
    verifiedFrom: "0.151.0",
    capabilities: set(true, true, true, true, true),
  },
  {
    id: "claude-code",
    matches: (kernel) => kernel === "claude-code",
    verifiedFrom: "2.1.220",
    capabilities: set(true, true, true, false, true),
    evidence: { readOnly: "unsupported" },
  },
  {
    id: "grok-build",
    matches: (kernel) => kernel === "grok-build",
    verifiedFrom: "1.0.3",
    capabilities: set(true, true, true, false, true),
    evidence: { readOnly: "unsupported" },
  },
  {
    id: "antigravity",
    matches: (kernel) => kernel === "antigravity",
    verifiedFrom: "1.2.2",
    capabilities: set(true, false, false, false, true),
    evidence: { approval: "unsupported", questions: "unsupported", readOnly: "unsupported" },
  },
  {
    id: "acp-family",
    // 其余本机外部内核与自定义 `acp:<slug>`；远端 id 不在此判定（能力随远端探测结果）。
    matches: () => true,
    capabilities: set(false, false, false, false, false),
    evidence: { resume: "adapter", approval: "adapter" },
  },
];

function capabilityRow(kernel: string): CapabilityRow {
  return ROWS.find((row) => row.matches(kernel)) ?? ROWS[ROWS.length - 1]!;
}

function versionParts(version: string): [number, number, number] | undefined {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** 语义化版本比较；任一侧不可解析时返回 undefined（调用方按未核验处理）。 */
function compareVersions(left: string, right: string): number | undefined {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return undefined;
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! < b[index]! ? -1 : 1;
  }
  return 0;
}

/** 支持 `*`、`>=x.y.z`、`>x.y.z`、`<=x.y.z`、`<x.y.z`、`=x.y.z` 与裸版本号。 */
export function versionSatisfies(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "*") return versionParts(version) !== undefined;
  const match = trimmed.match(/^(>=|>|<=|<|=)?\s*(.+)$/);
  if (!match) return false;
  const comparison = compareVersions(version, match[2]!);
  if (comparison === undefined) return false;
  switch (match[1] ?? "=") {
    case ">=":
      return comparison >= 0;
    case ">":
      return comparison > 0;
    case "<=":
      return comparison <= 0;
    case "<":
      return comparison < 0;
    default:
      return comparison === 0;
  }
}

function baseEvidence(row: CapabilityRow): Record<StudioCapabilityId, StudioCapabilityEvidence> {
  const evidence = {} as Record<StudioCapabilityId, StudioCapabilityEvidence>;
  for (const id of STUDIO_CAPABILITY_IDS)
    evidence[id] = row.evidence?.[id] ?? (row.capabilities[id] ? "declared" : "unsupported");
  return evidence;
}

function assessmentFrom(
  kernel: string,
  version: string | undefined,
  capabilities: StudioCapabilitySet,
  evidence: Record<StudioCapabilityId, StudioCapabilityEvidence>,
  sources?: Partial<Record<StudioCapabilityId, string>>,
): StudioCapabilityAssessment {
  const decisions = {} as Record<StudioCapabilityId, StudioCapabilityDecision>;
  for (const id of STUDIO_CAPABILITY_IDS)
    decisions[id] = {
      supported: capabilities[id],
      evidence: evidence[id],
      ...(sources?.[id] ? { source: sources[id] } : {}),
    };
  return {
    kernel,
    ...(version ? { version } : {}),
    matrixVersion: STUDIO_CAPABILITY_MATRIX_VERSION,
    capabilities,
    decisions,
  };
}

/**
 * 评估某个内核（可选版本）的能力。
 * - 版本未知或家族无下限：使用既有声明，行为不变。
 * - 版本已知且满足下限：该行原本为真的能力升级为 `verified`。
 * - 版本已知但低于下限或不可解析：原本为真的能力降级为 `unverified` 且布尔值为 false（失败关闭）。
 * - `exception` 只能由调用方显式传入用户授权；矩阵自身永不产生例外。
 */
export function assessKernelCapabilities(input: {
  kernel: string;
  version?: string;
  exception?: { capability: StudioCapabilityId; reason?: string };
}): StudioCapabilityAssessment {
  const row = capabilityRow(input.kernel);
  const capabilities = { ...row.capabilities };
  const evidence = baseEvidence(row);
  if (input.version && row.verifiedFrom) {
    if (versionSatisfies(input.version, `>=${row.verifiedFrom}`)) {
      for (const id of STUDIO_CAPABILITY_IDS)
        if (capabilities[id] && evidence[id] === "declared") evidence[id] = "verified";
    } else {
      for (const id of STUDIO_CAPABILITY_IDS) {
        if (evidence[id] === "unsupported") continue;
        capabilities[id] = false;
        evidence[id] = "unverified";
      }
    }
  }
  const sources: Partial<Record<StudioCapabilityId, string>> = {};
  if (input.exception) {
    capabilities[input.exception.capability] = true;
    evidence[input.exception.capability] = "user-exception";
    sources[input.exception.capability] = input.exception.reason ?? "user-exception";
  }
  return assessmentFrom(input.kernel, input.version, capabilities, evidence, sources);
}

/** 只有这些证据允许被原生声明或适配器事实升级；`unsupported`/`unverified` 一律拒绝。 */
export function capabilityAdvertisable(evidence: StudioCapabilityEvidence): boolean {
  return (
    evidence === "verified" ||
    evidence === "declared" ||
    evidence === "adapter" ||
    evidence === "advertised"
  );
}

/**
 * ACP initialize 成功后按原生声明升级能力：只允许 `resume`（原生声明）与 `approval`
 * （适配器可路由 session/request_permission）。readOnly/fullAccess/questions 永不被升级。
 */
export function mergeAdvertisedCapabilities(
  assessment: StudioCapabilityAssessment,
  advertised: Partial<StudioCapabilitySet>,
  source: string,
): StudioCapabilityAssessment {
  const capabilities = { ...assessment.capabilities };
  const decisions = { ...assessment.decisions };
  const upgrade = (id: "resume" | "approval", evidence: StudioCapabilityEvidence) => {
    if (advertised[id] !== true || !capabilityAdvertisable(decisions[id].evidence)) return;
    capabilities[id] = true;
    decisions[id] = { supported: true, evidence, source };
  };
  upgrade("resume", "advertised");
  upgrade("approval", "adapter");
  return { ...assessment, capabilities, decisions };
}
