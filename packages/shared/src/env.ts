// SPDX-License-Identifier: Apache-2.0
// 编译期环境身份与产品风味：define 注入 + 归一函数（B6）。
import type { KnorviaRuntimeEnv } from "./runtimeEnv.js";

const ENV_IDENTITY_VALUES = ["test", "production"] as const;
export type KnorviaEnv = (typeof ENV_IDENTITY_VALUES)[number];

const PRODUCT_FLAVOR_VALUES = ["production", "preview"] as const;
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境是两个轴。 */
export type KnorviaProductFlavor = (typeof PRODUCT_FLAVOR_VALUES)[number];

const ARMS_RUM_VALUES = ["local", "prod"] as const;
export type ArmsRumEnv = (typeof ARMS_RUM_VALUES)[number];

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，typeof 守卫避免 ReferenceError。
declare const __KNORVIA_ENV__: string, __KNORVIA_PRODUCT_FLAVOR__: string;

export function normalizeKnorviaEnv(raw: string | undefined): KnorviaEnv {
  const isTestScope = raw?.trim().toLowerCase() === "test";
  return isTestScope ? "test" : "production";
}

const injectedEnv = typeof __KNORVIA_ENV__ === "undefined" ? undefined : __KNORVIA_ENV__;
export const KNORVIA_ENV = normalizeKnorviaEnv(injectedEnv);

/**
 * 安装包身份缺省跟随后端环境：后端 test 给 preview、后端 production 给 production。
 * 桌面打包时用 `KNORVIA_PREVIEW_IDENTITY=1` 注入 define，得到连生产后端的 Preview 包；
 * 没有注入 define 的 bundle（web、CLI、测试）继续走上面的缺省推导。
 */
export function normalizeKnorviaProductFlavor(
  raw: string | undefined,
  backendEnv: KnorviaEnv,
): KnorviaProductFlavor {
  const requested = raw?.trim().toLowerCase();
  const requestedFlavor = PRODUCT_FLAVOR_VALUES.find((flavor) => flavor === requested);
  if (requestedFlavor !== undefined) {
    return requestedFlavor;
  }
  return backendEnv === "production" ? "production" : "preview";
}

const injectedFlavor =
  typeof __KNORVIA_PRODUCT_FLAVOR__ === "undefined" ? undefined : __KNORVIA_PRODUCT_FLAVOR__;
export const KNORVIA_PRODUCT_FLAVOR = normalizeKnorviaProductFlavor(injectedFlavor, KNORVIA_ENV);

/** 构建期身份键名：启动脚本与打包器共同约定，字面不变（known-differences §4）。 */
const BUILD_IDENTITY_ENV_KEYS = {
  appVersion: "KNORVIA_APP_VERSION",
  buildCommit: "KNORVIA_BUILD_COMMIT_ID",
} as const;

export const KNORVIA_APP_VERSION_ENV = BUILD_IDENTITY_ENV_KEYS.appVersion;
export const KNORVIA_BUILD_COMMIT_ID_ENV = BUILD_IDENTITY_ENV_KEYS.buildCommit;

// 调试模式由 KNORVIA_DEBUG=<inspect-brk 端口> 打开，这里只暴露读到的值。
const processEnvironment = typeof process !== "undefined" ? process.env : undefined;
export const RUNTIME_KNORVIA_DEBUG = processEnvironment?.KNORVIA_DEBUG;

// Knorvia 无产品遥测服务：开关恒关、上报端点恒空，任何运行时值都不能恢复上游采集。
const TELEMETRY_DISABLED_FACTS = { enabled: false, reportEndpoint: "", rumEndpoint: "" } as const;
export const KNORVIA_TELEMETRY_ENABLED: boolean = TELEMETRY_DISABLED_FACTS.enabled;
export const KNORVIA_TELEMETRY_REPORT_ENDPOINT = TELEMETRY_DISABLED_FACTS.reportEndpoint;
export const KNORVIA_ARMS_RUM_ENDPOINT = TELEMETRY_DISABLED_FACTS.rumEndpoint;

/** 把本地运行态折算成 ARMS 控制台认识的上报环境标签。 */
export function mapKnorviaEnvToArmsRumEnv(localEnv: KnorviaRuntimeEnv): ArmsRumEnv {
  const isProductionBackend = KNORVIA_ENV === "production";
  return localEnv !== "development" && isProductionBackend ? "prod" : "local";
}
