// SPDX-License-Identifier: Apache-2.0
// Property admission is one pass: undefined values are not counted, and a key can be both unknown and forbidden.

const SAMPLE_EVERY_MS = 60_000;
const PROPERTY_BUDGET = 20;

const roleToken = {
  main: "main",
  rendererMain: "renderer_main",
  rendererGuest: "renderer_guest",
  gpu: "gpu",
  chromiumOther: "chromium_other",
  host: "host",
  scheduler: "scheduler",
  cliChat: "cli_chat",
  cliAux: "cli_aux",
  mcp: "mcp",
} as const satisfies Record<string, string>;

const ROLE_ORDER = [
  roleToken.main,
  roleToken.rendererMain,
  roleToken.rendererGuest,
  roleToken.gpu,
  roleToken.chromiumOther,
  roleToken.host,
  roleToken.scheduler,
  roleToken.cliChat,
  roleToken.cliAux,
  roleToken.mcp,
] as const satisfies readonly string[];

export const PROCESS_RESOURCE_ROLES = ROLE_ORDER;
type RoleList = typeof ROLE_ORDER;
export type ProcessResourceRole = RoleList[number];

export const KNORVIA_CLI_RESOURCE_SAMPLE_INTERVAL_MS = SAMPLE_EVERY_MS;

const laneToken = {
  chat: "chat",
  plugin: "plugin",
  mcpStatus: "mcp-status",
} as const satisfies Record<string, string>;

const LANE_ORDER = [
  laneToken.chat,
  laneToken.plugin,
  laneToken.mcpStatus,
] as const satisfies readonly string[];

export const PROCESS_RESOURCE_CLI_LANES = LANE_ORDER;
type LaneList = typeof LANE_ORDER;
export type ProcessResourceCliLane = LaneList[number];

type LaneArg = ProcessResourceCliLane | undefined;
type CliResourceRole = Extract<ProcessResourceRole, "cli_chat" | "cli_aux">;

const CHAT_LANE: ProcessResourceCliLane = laneToken.chat;

export function resolveCliProcessResourceRole(lane: LaneArg): CliResourceRole {
  const absentOrChat = lane === undefined || lane === CHAT_LANE;
  return absentOrChat ? roleToken.cliChat : roleToken.cliAux;
}

const RUNTIME_SURFACES = ["local", "remote"] as const satisfies readonly string[];
export type ProcessResourceRuntimeSurface = (typeof RUNTIME_SURFACES)[number];

const PROCESS_WINDOW_EVENT = "perf_process_window";
const SYSTEM_WINDOW_EVENT = "perf_system_window";
const TOOL_EXEC_EVENT = "perf_tool_exec_resource";

export const PROCESS_RESOURCE_EVENT_NAMES = {
  processWindow: PROCESS_WINDOW_EVENT,
  systemWindow: SYSTEM_WINDOW_EVENT,
  toolExecResource: TOOL_EXEC_EVENT,
} as const satisfies Record<string, string>;

type EventNameMap = typeof PROCESS_RESOURCE_EVENT_NAMES;
export type ProcessResourceEventName = EventNameMap[keyof EventNameMap];

export const ARMS_CUSTOM_EVENT_PROPERTY_LIMIT = PROPERTY_BUDGET;

const field = {
  platform: "platform",
  appVersion: "app_version",
  armsEnv: "arms_env",
  deviceMid: "device_mid",
  processRole: "process_role",
  runtimeSurface: "runtime_surface",
  arch: "arch",
  logicalCpuCount: "logical_cpu_count",
  totalMemoryGb: "total_memory_gb",
  mcpId: "mcp_id",
  backgroundRatio: "background_ratio",
  uptimeMinutes: "uptime_minutes",
  cpuPercentP95: "cpu_percent_p95",
  cpuPercentPeak: "cpu_percent_peak",
  rssKbTotalMean: "rss_kb_total_mean",
  rssKbTotalPeak: "rss_kb_total_peak",
  rssKbMaxProcessPeak: "rss_kb_max_process_peak",
  heapUsedKbMean: "heap_used_kb_mean",
  heapUsedKbPeak: "heap_used_kb_peak",
  processCountPeak: "process_count_peak",
  sampleCount: "sample_count",
  appUptimeMinutes: "app_uptime_minutes",
  systemCpuPercentP95: "system_cpu_percent_p95",
  systemFreeMemoryKbMin: "system_free_memory_kb_min",
  appCpuPercentP95: "app_cpu_percent_p95",
  appRssKbTotalMean: "app_rss_kb_total_mean",
  appRssKbTotalPeak: "app_rss_kb_total_peak",
  processCountTotalPeak: "process_count_total_peak",
  telemetrySelfMs: "telemetry_self_ms",
  toolName: "tool_name",
  exitKind: "exit_kind",
  treeRssKbPeak: "tree_rss_kb_peak",
  treeCpuTimeMs: "tree_cpu_time_ms",
  cliRssKb: "cli_rss_kb",
  systemFreeMemoryKb: "system_free_memory_kb",
} as const satisfies Record<string, string>;

const HOST_GLOBALS = [
  field.platform,
  field.appVersion,
  field.armsEnv,
  field.deviceMid,
] as const satisfies readonly string[];

const MACHINE_SHAPE = [
  field.arch,
  field.logicalCpuCount,
  field.totalMemoryGb,
] as const satisfies readonly string[];

const processWindowKeys = [
  ...HOST_GLOBALS,
  field.processRole,
  field.runtimeSurface,
  ...MACHINE_SHAPE,
  field.mcpId,
  field.backgroundRatio,
  field.uptimeMinutes,
  field.cpuPercentP95,
  field.cpuPercentPeak,
  field.rssKbTotalMean,
  field.rssKbTotalPeak,
  field.rssKbMaxProcessPeak,
  field.heapUsedKbMean,
  field.heapUsedKbPeak,
  field.processCountPeak,
  field.sampleCount,
] as const satisfies readonly string[];

const systemWindowKeys = [
  ...HOST_GLOBALS,
  ...MACHINE_SHAPE,
  field.backgroundRatio,
  field.appUptimeMinutes,
  field.systemCpuPercentP95,
  field.systemFreeMemoryKbMin,
  field.appCpuPercentP95,
  field.appRssKbTotalMean,
  field.appRssKbTotalPeak,
  field.processCountTotalPeak,
  field.sampleCount,
  field.telemetrySelfMs,
] as const satisfies readonly string[];

const toolExecKeys = [
  ...HOST_GLOBALS,
  field.runtimeSurface,
  field.toolName,
  field.exitKind,
  field.treeRssKbPeak,
  field.treeCpuTimeMs,
  field.sampleCount,
  field.cliRssKb,
  field.systemFreeMemoryKb,
] as const satisfies readonly string[];

export const PERF_PROCESS_WINDOW_PROPERTY_KEYS = processWindowKeys;
export const PERF_SYSTEM_WINDOW_PROPERTY_KEYS = systemWindowKeys;
export const PERF_TOOL_EXEC_RESOURCE_PROPERTY_KEYS = toolExecKeys;

const ADMISSION: Record<ProcessResourceEventName, readonly string[]> = {
  [PROCESS_WINDOW_EVENT]: processWindowKeys,
  [SYSTEM_WINDOW_EVENT]: systemWindowKeys,
  [TOOL_EXEC_EVENT]: toolExecKeys,
};

// `pid` is a substring match; `device_mid` and `mcp_id` are intentionally outside it.
const PRIVACY_KEY = /pid|path|workspace|session|task|command/i;
export const PROCESS_RESOURCE_FORBIDDEN_PROPERTY_KEY_PATTERN = PRIVACY_KEY;

type Flag = boolean;
type Names = string[];

export type ProcessResourceEventPropertyCheck = {
  ok: Flag;
  count: number;
  overLimit: Flag;
  unknownKeys: Names;
  forbiddenKeys: Names;
};

type PropertyBag = Record<string, string | number | boolean | undefined>;

export function checkProcessResourceEventProperties(
  name: ProcessResourceEventName,
  bag: PropertyBag,
): ProcessResourceEventPropertyCheck {
  const allowed = new Set<string>(ADMISSION[name]);
  const unknownKeys: Names = [];
  const forbiddenKeys: Names = [];
  let count = 0;
  for (const key of Object.keys(bag)) {
    if (bag[key] === undefined) continue;
    count += 1;
    if (!allowed.has(key)) unknownKeys.push(key);
    if (PRIVACY_KEY.test(key)) forbiddenKeys.push(key);
  }
  const overLimit = count > PROPERTY_BUDGET;
  const ok = unknownKeys.length === 0 && forbiddenKeys.length === 0 && !overLimit;
  return { ok, count, overLimit, unknownKeys, forbiddenKeys };
}
