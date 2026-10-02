export const PROCESS_RESOURCE_ROLES = [
  "main",
  "renderer_main",
  "renderer_guest",
  "gpu",
  "chromium_other",
  "host",
  "scheduler",
  "cli_chat",
  "cli_aux",
  "mcp",
] as const;

export type ProcessResourceRole = (typeof PROCESS_RESOURCE_ROLES)[number];

export const KNORVIA_CLI_RESOURCE_SAMPLE_INTERVAL_MS = 60000;

export const PROCESS_RESOURCE_CLI_LANES = ["chat", "plugin", "mcp-status"] as const;

export type ProcessResourceCliLane = (typeof PROCESS_RESOURCE_CLI_LANES)[number];

export function resolveCliProcessResourceRole(
  lane: ProcessResourceCliLane | undefined,
): Extract<ProcessResourceRole, "cli_chat" | "cli_aux"> {
  return lane === undefined || lane === "chat" ? "cli_chat" : "cli_aux";
}

export type ProcessResourceRuntimeSurface = "local" | "remote";

export const PROCESS_RESOURCE_EVENT_NAMES = {
  processWindow: "perf_process_window",
  systemWindow: "perf_system_window",
  toolExecResource: "perf_tool_exec_resource",
} as const;

export type ProcessResourceEventName =
  (typeof PROCESS_RESOURCE_EVENT_NAMES)[keyof typeof PROCESS_RESOURCE_EVENT_NAMES];

export const ARMS_CUSTOM_EVENT_PROPERTY_LIMIT = 20;

const PROCESS_RESOURCE_GLOBAL_PROPERTY_KEYS = [
  "platform",
  "app_version",
  "arms_env",
  "device_mid",
] as const;

export const PERF_PROCESS_WINDOW_PROPERTY_KEYS = [
  ...PROCESS_RESOURCE_GLOBAL_PROPERTY_KEYS,
  "process_role",
  "runtime_surface",
  "arch",
  "logical_cpu_count",
  "total_memory_gb",
  "mcp_id",
  "background_ratio",
  "uptime_minutes",
  "cpu_percent_p95",
  "cpu_percent_peak",
  "rss_kb_total_mean",
  "rss_kb_total_peak",
  "rss_kb_max_process_peak",
  "heap_used_kb_mean",
  "heap_used_kb_peak",
  "process_count_peak",
  "sample_count",
] as const;

export const PERF_SYSTEM_WINDOW_PROPERTY_KEYS = [
  ...PROCESS_RESOURCE_GLOBAL_PROPERTY_KEYS,
  "arch",
  "logical_cpu_count",
  "total_memory_gb",
  "background_ratio",
  "app_uptime_minutes",
  "system_cpu_percent_p95",
  "system_free_memory_kb_min",
  "app_cpu_percent_p95",
  "app_rss_kb_total_mean",
  "app_rss_kb_total_peak",
  "process_count_total_peak",
  "sample_count",
  "telemetry_self_ms",
] as const;

export const PERF_TOOL_EXEC_RESOURCE_PROPERTY_KEYS = [
  ...PROCESS_RESOURCE_GLOBAL_PROPERTY_KEYS,
  "runtime_surface",
  "tool_name",
  "exit_kind",
  "tree_rss_kb_peak",
  "tree_cpu_time_ms",
  "sample_count",
  "cli_rss_kb",
  "system_free_memory_kb",
] as const;

const PROPERTY_KEY_WHITELIST: Record<ProcessResourceEventName, readonly string[]> = {
  [PROCESS_RESOURCE_EVENT_NAMES.processWindow]: PERF_PROCESS_WINDOW_PROPERTY_KEYS,
  [PROCESS_RESOURCE_EVENT_NAMES.systemWindow]: PERF_SYSTEM_WINDOW_PROPERTY_KEYS,
  [PROCESS_RESOURCE_EVENT_NAMES.toolExecResource]: PERF_TOOL_EXEC_RESOURCE_PROPERTY_KEYS,
};

export const PROCESS_RESOURCE_FORBIDDEN_PROPERTY_KEY_PATTERN =
  /pid|path|workspace|session|task|command/i;

export interface ProcessResourceEventPropertyCheck {
  ok: boolean;
  count: number;
  overLimit: boolean;
  unknownKeys: string[];
  forbiddenKeys: string[];
}

export function checkProcessResourceEventProperties(
  eventName: ProcessResourceEventName,
  properties: Record<string, string | number | boolean | undefined>,
): ProcessResourceEventPropertyCheck {
  const whitelist = new Set(PROPERTY_KEY_WHITELIST[eventName]);
  const presentKeys = Object.entries(properties)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const unknownKeys = presentKeys.filter((key) => !whitelist.has(key));
  const forbiddenKeys = presentKeys.filter((key) =>
    PROCESS_RESOURCE_FORBIDDEN_PROPERTY_KEY_PATTERN.test(key),
  );
  const count = presentKeys.length;
  const overLimit = count > ARMS_CUSTOM_EVENT_PROPERTY_LIMIT;

  return {
    ok: unknownKeys.length === 0 && forbiddenKeys.length === 0 && !overLimit,
    count,
    overLimit,
    unknownKeys,
    forbiddenKeys,
  };
}
