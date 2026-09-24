import type { KnorviaRuntimeEnv } from "./runtimeEnv.js";

export type KnorviaEnv = "test" | "production";
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境 `KnorviaEnv` 是两个轴。 */
export type KnorviaProductFlavor = "production" | "preview";
export type ArmsRumEnv = "local" | "prod";

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，用 typeof 检查 + fallback 避免 ReferenceError
declare const __KNORVIA_ENV__: string;
declare const __KNORVIA_PRODUCT_FLAVOR__: string;

export function normalizeKnorviaEnv(value: string | undefined): KnorviaEnv {
  return value?.trim().toLowerCase() === "test" ? "test" : "production";
}

export const KNORVIA_ENV = normalizeKnorviaEnv(
  typeof __KNORVIA_ENV__ !== "undefined" ? __KNORVIA_ENV__ : undefined,
);

/**
 * 身份缺省跟随后端环境（test → preview，production → production）。
 * 桌面构建通过 `KNORVIA_PREVIEW_IDENTITY=1` 显式注入 preview，得到连接生产后端的 Preview 包；
 * 未注入 define 的 bundle（web、CLI、测试）沿用旧的单轴语义。
 */
export function normalizeKnorviaProductFlavor(
  value: string | undefined,
  knorviaEnv: KnorviaEnv,
): KnorviaProductFlavor {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview") {
    return normalized;
  }
  return knorviaEnv === "production" ? "production" : "preview";
}

export const KNORVIA_PRODUCT_FLAVOR = normalizeKnorviaProductFlavor(
  typeof __KNORVIA_PRODUCT_FLAVOR__ !== "undefined" ? __KNORVIA_PRODUCT_FLAVOR__ : undefined,
  KNORVIA_ENV,
);
export const KNORVIA_APP_VERSION_ENV = "KNORVIA_APP_VERSION" as const;
export const KNORVIA_BUILD_COMMIT_ID_ENV = "KNORVIA_BUILD_COMMIT_ID" as const;

// ── 运行时环境变量（不经过编译打包，启动时从 process.env 读取） ──
// 启用调试模式，值为 inspect-brk 的端口号，如 KNORVIA_DEBUG=9230
export const RUNTIME_KNORVIA_DEBUG =
  typeof process !== "undefined" ? process.env.KNORVIA_DEBUG : undefined;

// Knorvia 无产品遥测服务；任何运行时环境值都不能恢复上游采集。
export const KNORVIA_TELEMETRY_ENABLED: boolean = false;
export const KNORVIA_TELEMETRY_REPORT_ENDPOINT = "";
export const KNORVIA_ARMS_RUM_ENDPOINT = "";

/** 将本地运行态与编译期 KNORVIA_ENV 映射为 ARMS 控制台识别的上报环境标签 */
export function mapKnorviaEnvToArmsRumEnv(runtimeEnv: KnorviaRuntimeEnv): ArmsRumEnv {
  return runtimeEnv !== "development" && KNORVIA_ENV === "production" ? "prod" : "local";
}
