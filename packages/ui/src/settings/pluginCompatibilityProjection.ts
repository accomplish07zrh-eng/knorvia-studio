// 设置页插件兼容性面板的纯投影层（无 React、无 IO）。
//
// 数据来源只有一份：插件根目录下的 `.knorvia-plugin/compatibility.json`
// （格式见 specs/knorvia-plugin-compatibility.md）。本模块把它与「当前内核」以及
// 「宿主实际上报的能力」投影成可直接渲染的视图模型；缺文件、读失败、JSON 非法、
// 字段类型不符时一律落到 unknown，绝不抛错、绝不回退成「支持」。
import type { KnorviaPluginInfo } from "@knorvia/shared";

/** 唯一的 sidecar 相对路径；不新增第二个兼容性载体。 */
export const PLUGIN_COMPATIBILITY_SIDECAR_RELATIVE_PATH = ".knorvia-plugin/compatibility.json";

/**
 * 插件管理入口里的插件清单由 Knorvia 宿主物化（`plugins/list` 由本机 Agent host 提供），
 * 因此兼容性面板评估的「当前内核」就是宿主内核 `knorvia`。
 * 其他内核只能读到 sidecar 里的作者声明，不得据此显示「可用」。
 */
export const PLUGIN_MANAGEMENT_KERNEL_ID = "knorvia";

/** 规格固定的四值枚举；多一个值都视为非法。 */
export const PLUGIN_COMPATIBILITY_STATUSES = [
  "verified",
  "declared",
  "unsupported",
  "unknown",
] as const;
export type PluginCompatibilityStatus = (typeof PLUGIN_COMPATIBILITY_STATUSES)[number];

export const PLUGIN_WHEN_MISSING_VALUES = ["report", "degrade", "refuse"] as const;
export type PluginWhenMissing = (typeof PLUGIN_WHEN_MISSING_VALUES)[number];

/** sidecar 的读取结果；"unreadable" 是读取失败，不等于文件不存在。 */
export type PluginCompatibilitySidecarInput =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable"; message: string };

export type PluginCompatibilitySidecarState = "parsed" | "missing" | "malformed" | "unreadable";

export interface PluginKernelCompatibilityEntry {
  kernel: string;
  status: PluginCompatibilityStatus;
  reason: string;
  evidence: string[];
}

export interface PluginRequiredCapability {
  capability: string;
  whenMissing: PluginWhenMissing;
}

export interface ParsedPluginCompatibility {
  compatibilityVersion: number;
  plugin: string;
  kernels: PluginKernelCompatibilityEntry[];
  requires: PluginRequiredCapability[];
}

export type PluginCompatibilityParseResult =
  | { kind: "parsed"; data: ParsedPluginCompatibility }
  | { kind: "malformed"; message: string };

export type PluginCapabilityDisposition = "available" | "unavailable" | "unverified";

/** 机器可读的诊断码；渲染层用 PLUGIN_COMPATIBILITY_REASON_MESSAGE_IDS 映射到 i18n 键。 */
export type PluginCompatibilityReasonCode =
  | "capability.hostReported"
  | "capability.kernelUnsupported"
  | "capability.kernelUnknown"
  | "capability.kernelDeclared"
  | "capability.notReported"
  | "capability.sidecarMissing"
  | "capability.sidecarMalformed";

export type PluginCompatibilityStatusReasonCode =
  | "compatibility.verified"
  | "compatibility.declared"
  | "compatibility.unsupported"
  | "compatibility.unknown"
  | "compatibility.sidecarMissing"
  | "compatibility.sidecarMalformed"
  | "compatibility.sidecarUnreadable"
  | "compatibility.kernelAbsent";

export const PLUGIN_COMPATIBILITY_REASON_MESSAGE_IDS: Readonly<
  Record<PluginCompatibilityReasonCode | PluginCompatibilityStatusReasonCode, string>
> = {
  "capability.hostReported": "settings.plugins.compatibility.capability.reason.hostReported",
  "capability.kernelUnsupported":
    "settings.plugins.compatibility.capability.reason.kernelUnsupported",
  "capability.kernelUnknown": "settings.plugins.compatibility.capability.reason.kernelUnknown",
  "capability.kernelDeclared": "settings.plugins.compatibility.capability.reason.kernelDeclared",
  "capability.notReported": "settings.plugins.compatibility.capability.reason.notReported",
  "capability.sidecarMissing": "settings.plugins.compatibility.capability.reason.sidecarMissing",
  "capability.sidecarMalformed":
    "settings.plugins.compatibility.capability.reason.sidecarMalformed",
  "compatibility.verified": "settings.plugins.compatibility.status.reasonVerified",
  "compatibility.declared": "settings.plugins.compatibility.status.reasonDeclared",
  "compatibility.unsupported": "settings.plugins.compatibility.status.reasonUnsupported",
  "compatibility.unknown": "settings.plugins.compatibility.status.reasonUnknown",
  "compatibility.sidecarMissing": "settings.plugins.compatibility.sidecar.missing",
  "compatibility.sidecarMalformed": "settings.plugins.compatibility.sidecar.malformed",
  "compatibility.sidecarUnreadable": "settings.plugins.compatibility.sidecar.unreadable",
  "compatibility.kernelAbsent": "settings.plugins.compatibility.status.kernelAbsent",
};

export interface PluginCapabilityView {
  capability: string;
  whenMissing: PluginWhenMissing;
  disposition: PluginCapabilityDisposition;
  reasonCode: PluginCompatibilityReasonCode;
  /** 宿主上报「可用」时的直接依据；未上报时为空串。 */
  evidence: string;
  /** 未验证或不可用 + whenMissing=refuse：缺失时整个请求会被拒绝，面板必须显著标注。 */
  blocksRun: boolean;
}

export interface PluginCompatibilityView {
  pluginId: string;
  pluginName: string;
  kernelId: string;
  rootPath: string;
  sidecarPath: string;
  sidecarState: PluginCompatibilitySidecarState;
  /** 读取失败时的原始信息，仅在 sidecarState=unreadable 时有值。 */
  sidecarError: string;
  status: PluginCompatibilityStatus;
  statusReasonCode: PluginCompatibilityStatusReasonCode;
  /** sidecar 里作者写的理由原文（可能是英文）；诊断码另有本地化文案。 */
  authorReason: string;
  evidence: string[];
  /** 除当前内核外，sidecar 里声明的其他内核条目，只作诊断展示。 */
  otherKernels: PluginKernelCompatibilityEntry[];
  capabilities: PluginCapabilityView[];
  gapCount: number;
  /** 当前内核不是 verified（含缺文件/解析失败）——界面必须显示「未验证」。 */
  unverified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseKernelEntries(value: unknown): PluginKernelCompatibilityEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: PluginKernelCompatibilityEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const kernel = asNonEmptyString(item.kernel);
    const status = asNonEmptyString(item.status);
    const reason = asNonEmptyString(item.reason);
    if (!kernel || !status || !reason) return null;
    if (!(PLUGIN_COMPATIBILITY_STATUSES as readonly string[]).includes(status)) return null;
    const rawEvidence = item.evidence;
    const evidence: string[] = [];
    if (rawEvidence !== undefined) {
      if (!Array.isArray(rawEvidence)) return null;
      for (const entry of rawEvidence) {
        const text = asNonEmptyString(entry);
        if (!text) return null;
        evidence.push(text);
      }
    }
    entries.push({
      kernel,
      status: status as PluginCompatibilityStatus,
      reason,
      evidence,
    });
  }
  return entries.length > 0 ? entries : null;
}

function parseRequires(value: unknown): PluginRequiredCapability[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const entries: PluginRequiredCapability[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const capability = asNonEmptyString(item.capability);
    const whenMissing = asNonEmptyString(item.whenMissing);
    if (!capability || !whenMissing) return null;
    if (!(PLUGIN_WHEN_MISSING_VALUES as readonly string[]).includes(whenMissing)) return null;
    entries.push({ capability, whenMissing: whenMissing as PluginWhenMissing });
  }
  return entries;
}

/** 严格解析 sidecar；任何偏差都返回 malformed，由调用方按 unknown 渲染。 */
export function parsePluginCompatibilitySidecar(text: string): PluginCompatibilityParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      kind: "malformed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (!isRecord(value)) return { kind: "malformed", message: "root value must be a JSON object" };
  if (value.compatibilityVersion !== 1) {
    return { kind: "malformed", message: "compatibilityVersion must be 1" };
  }
  const plugin = asNonEmptyString(value.plugin);
  if (!plugin) return { kind: "malformed", message: "plugin must be a non-empty string" };
  const kernels = parseKernelEntries(value.kernels);
  if (!kernels) return { kind: "malformed", message: "kernels must be a non-empty array" };
  const requires = parseRequires(value.requires);
  if (!requires) return { kind: "malformed", message: "requires must be an array" };
  return { kind: "parsed", data: { compatibilityVersion: 1, plugin, kernels, requires } };
}

/** 兼容性 sidecar 的绝对路径；只做字符串拼接，路径分隔符跟随 rootPath 的形态。 */
export function pluginCompatibilitySidecarPath(rootPath: string): string {
  const trimmed = rootPath.trim().replace(/[\\/]+$/u, "");
  if (!trimmed) return PLUGIN_COMPATIBILITY_SIDECAR_RELATIVE_PATH;
  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  return `${trimmed}${separator}${PLUGIN_COMPATIBILITY_SIDECAR_RELATIVE_PATH.replaceAll("/", separator)}`;
}

/** 精确内核条目优先；没有精确条目时回退通配 `*`；两者都没有返回 null。 */
export function pickKernelCompatibilityEntry(
  entries: readonly PluginKernelCompatibilityEntry[],
  kernelId: string,
): PluginKernelCompatibilityEntry | null {
  return (
    entries.find((entry) => entry.kernel === kernelId) ??
    entries.find((entry) => entry.kernel === "*") ??
    null
  );
}

export interface PluginHostCapabilityReport {
  capabilities: string[];
  evidence: Record<string, string>;
}

/**
 * 宿主实际可观察到的能力。只上报能由现有插件投影直接核实的事实：
 * 插件已启用且宿主枚举到至少一个技能时，`skills.enabled-catalog` 才成立
 * （依据 specs/knorvia-shared-capabilities.md「已启用技能按内核有界投影」）。
 * 其余能力（文件读取、文档抽取等）宿主今天没有上报通道，一律不上报，界面按未验证渲染。
 */
export function reportHostCapabilitiesForPlugin(
  plugin: Pick<KnorviaPluginInfo, "enabled" | "skillRootCount" | "components">,
): PluginHostCapabilityReport {
  const enumeratedSkills =
    plugin.components?.find((group) => group.kind === "skill")?.items.length ??
    plugin.skillRootCount;
  if (!plugin.enabled || enumeratedSkills <= 0) return { capabilities: [], evidence: {} };
  return {
    capabilities: ["skills.enabled-catalog"],
    evidence: {
      "skills.enabled-catalog": `host enumerated ${enumeratedSkills} skill(s) for the enabled plugin`,
    },
  };
}

interface CapabilityResolution {
  disposition: PluginCapabilityDisposition;
  reasonCode: PluginCompatibilityReasonCode;
  evidence: string;
}

function resolveCapability(
  capability: string,
  kernelEntry: PluginKernelCompatibilityEntry | null,
  sidecarState: PluginCompatibilitySidecarState,
  hostReport: PluginHostCapabilityReport,
): CapabilityResolution {
  if (sidecarState === "missing") {
    return { disposition: "unverified", reasonCode: "capability.sidecarMissing", evidence: "" };
  }
  if (sidecarState !== "parsed") {
    return { disposition: "unverified", reasonCode: "capability.sidecarMalformed", evidence: "" };
  }
  if (!kernelEntry || kernelEntry.status === "unknown") {
    return { disposition: "unverified", reasonCode: "capability.kernelUnknown", evidence: "" };
  }
  if (kernelEntry.status === "unsupported") {
    // 内核明确不支持时，作者声明的能力要求在这台内核上无法满足；理由用作者原文。
    return { disposition: "unavailable", reasonCode: "capability.kernelUnsupported", evidence: "" };
  }
  const reported = hostReport.capabilities.includes(capability);
  if (reported) {
    return {
      disposition: "available",
      reasonCode: "capability.hostReported",
      evidence: hostReport.evidence[capability] ?? "",
    };
  }
  return {
    disposition: "unverified",
    reasonCode:
      kernelEntry.status === "declared" ? "capability.kernelDeclared" : "capability.notReported",
    evidence: "",
  };
}

export interface ResolvePluginCompatibilityInput {
  pluginId: string;
  pluginName: string;
  rootPath: string;
  sidecar: PluginCompatibilitySidecarInput;
  kernelId?: string;
  hostReport?: PluginHostCapabilityReport;
}

export function resolvePluginCompatibilityView(
  input: ResolvePluginCompatibilityInput,
): PluginCompatibilityView {
  const kernelId = input.kernelId ?? PLUGIN_MANAGEMENT_KERNEL_ID;
  const hostReport = input.hostReport ?? { capabilities: [], evidence: {} };
  const sidecarPath = pluginCompatibilitySidecarPath(input.rootPath);
  const base = {
    pluginId: input.pluginId,
    pluginName: input.pluginName,
    kernelId,
    rootPath: input.rootPath,
    sidecarPath,
  };

  if (input.sidecar.kind === "missing") {
    return {
      ...base,
      sidecarState: "missing",
      sidecarError: "",
      status: "unknown",
      statusReasonCode: "compatibility.sidecarMissing",
      authorReason: "",
      evidence: [],
      otherKernels: [],
      capabilities: [],
      gapCount: 0,
      unverified: true,
    };
  }
  if (input.sidecar.kind === "unreadable") {
    return {
      ...base,
      sidecarState: "unreadable",
      sidecarError: input.sidecar.message,
      status: "unknown",
      statusReasonCode: "compatibility.sidecarUnreadable",
      authorReason: "",
      evidence: [],
      otherKernels: [],
      capabilities: [],
      gapCount: 0,
      unverified: true,
    };
  }

  const parsed = parsePluginCompatibilitySidecar(input.sidecar.text);
  if (parsed.kind === "malformed") {
    return {
      ...base,
      sidecarState: "malformed",
      sidecarError: parsed.message,
      status: "unknown",
      statusReasonCode: "compatibility.sidecarMalformed",
      authorReason: "",
      evidence: [],
      otherKernels: [],
      capabilities: [],
      gapCount: 0,
      unverified: true,
    };
  }

  const { kernels, requires } = parsed.data;
  // 声明的 plugin 名与 manifest 不一致时按未验证处理：sidecar 与包身份不符，不能采信。
  const pluginNameMatches = parsed.data.plugin === input.pluginName;
  const kernelEntry = pluginNameMatches ? pickKernelCompatibilityEntry(kernels, kernelId) : null;
  const status: PluginCompatibilityStatus = kernelEntry?.status ?? "unknown";
  const statusReasonCode: PluginCompatibilityStatusReasonCode = !pluginNameMatches
    ? "compatibility.sidecarMalformed"
    : kernelEntry
      ? (`compatibility.${status}` as PluginCompatibilityStatusReasonCode)
      : "compatibility.kernelAbsent";
  const capabilities = requires.map((entry) => {
    const resolution = resolveCapability(entry.capability, kernelEntry, "parsed", hostReport);
    return {
      capability: entry.capability,
      whenMissing: entry.whenMissing,
      disposition: resolution.disposition,
      reasonCode: resolution.reasonCode,
      evidence: resolution.evidence,
      blocksRun: resolution.disposition !== "available" && entry.whenMissing === "refuse",
    };
  });

  return {
    ...base,
    sidecarState: "parsed",
    sidecarError: "",
    status,
    statusReasonCode,
    authorReason: kernelEntry?.reason ?? "",
    evidence: status === "verified" ? (kernelEntry?.evidence ?? []) : [],
    otherKernels: kernels.filter((entry) => entry.kernel !== kernelId),
    capabilities,
    gapCount: capabilities.filter((entry) => entry.disposition === "unavailable").length,
    unverified: status !== "verified",
  };
}
