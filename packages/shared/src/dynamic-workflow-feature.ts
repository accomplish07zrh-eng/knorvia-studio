// SPDX-License-Identifier: Apache-2.0
// Dynamic Workflow 灰度：服务端 feature key 的取值域与客户端快照。
// 这里只放三端（Host services、Desktop main、UI）共用的取值域、归一化与快照形状；
// 远端读取、覆盖与下发都在各自的 owner 里，shared 层不发请求。

/** 三态登记表：enabled 由「是否等于 disabled」投影，避免每个消费者各写一份折叠规则。 */
const MODE_REGISTRY = [
  { id: "disabled", enabled: false },
  { id: "onDemand", enabled: true },
  { id: "alwaysOn", enabled: true },
] as const;

export const DYNAMIC_WORKFLOW_MODES = MODE_REGISTRY.map((entry) => entry.id) as [
  "disabled",
  "onDemand",
  "alwaysOn",
];

export type DynamicWorkflowMode = (typeof MODE_REGISTRY)[number]["id"];

const MODE_LOOKUP = new Set<string>(DYNAMIC_WORKFLOW_MODES);

/**
 * 本地覆盖用的环境变量。语义按构建档位分三层，由 Desktop main 在 fork Host 前改写或删除
 * （desktopRuntimeEnv.ts 的 buildHostProcessEnv），Host 只消费不再分辨来源：
 *   - 未打包 dev：透传开发者 shell 里的合法取值；
 *   - 打包 preview：固定写入 alwaysOn，忽略 shell；
 *   - 打包 production：删除继承值，永不写入。
 * 没有 main 的 Web/server Host 直接读进程环境（运维/开发者设置）。
 */
export const KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV = "KNORVIA_DYNAMIC_WORKFLOW_MODE";

/** 服务端缺省、格式非法或请求失败时的取值：fail-closed。 */
export const DEFAULT_DYNAMIC_WORKFLOW_MODE: DynamicWorkflowMode = MODE_REGISTRY[0].id;

/** 字符串先裁掉首尾空白再精确匹配登记表；非字符串一律视作未配置。 */
export const normalizeDynamicWorkflowMode = (value: unknown): DynamicWorkflowMode | undefined => {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  return MODE_LOOKUP.has(candidate) ? (candidate as DynamicWorkflowMode) : undefined;
};

/**
 * 解析保留服务端契约的三态，消费侧统一转换为布尔开关。
 * 未知字符串不属于 DynamicWorkflowMode 的合法输入，但仍按「非 disabled 即开启」处理。
 */
export const isDynamicWorkflowModeEnabled = (mode: DynamicWorkflowMode): boolean =>
  mode !== "disabled";

type SnapshotSource = "remote" | "override" | "default";

/** 快照的来源：观测用，UI 与日志据此区分「服务端关」与「本地覆盖」。 */
export type DynamicWorkflowClientConfigSource = SnapshotSource;

type ModeAndEnabled = {
  readonly mode: DynamicWorkflowMode;
  readonly enabled: boolean;
};

export type DynamicWorkflowClientConfig = ModeAndEnabled & {
  /** 等于 isDynamicWorkflowModeEnabled(mode)；单独落字段免得每个消费者各写一遍。 */
  readonly source?: SnapshotSource;
};

export function createDynamicWorkflowClientConfig(
  mode: DynamicWorkflowMode,
  source?: SnapshotSource,
): DynamicWorkflowClientConfig {
  const base = { mode, enabled: isDynamicWorkflowModeEnabled(mode) };
  return source === undefined ? base : { ...base, source };
}

type ResolveInput = {
  remote: unknown;
  env?: Record<string, string | undefined>;
};

/** 远端 envelope 的对象判定：数组、null 与原始值都按「未下发」处理。 */
function remoteModeValue(remote: unknown): unknown {
  const isPlainRecord = typeof remote === "object" && remote !== null && !Array.isArray(remote);
  return isPlainRecord ? (remote as { mode?: unknown }).mode : undefined;
}

/**
 * 纯函数：把远端 envelope 的 `configs.dynamicWorkflow` 与本地覆盖环境变量折叠成一个快照。
 * 优先级：覆盖 > 远端合法值 > 缺省。远端成功但未下发该 key 也视为 disabled——
 * 服务端撤掉 key 等于关闭，不能沿用旧快照。
 */
export function resolveDynamicWorkflowClientConfig(
  input: ResolveInput,
): DynamicWorkflowClientConfig {
  const override = normalizeDynamicWorkflowMode(
    input.env ? input.env[KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV] : undefined,
  );
  if (override !== undefined) {
    return createDynamicWorkflowClientConfig(override, "override");
  }

  const remote = normalizeDynamicWorkflowMode(remoteModeValue(input.remote));
  if (remote !== undefined) {
    return createDynamicWorkflowClientConfig(remote, "remote");
  }

  const fallback = DEFAULT_DYNAMIC_WORKFLOW_MODE;
  return createDynamicWorkflowClientConfig(fallback, "default");
}
