// SPDX-License-Identifier: Apache-2.0

/** 协议字符串登记：环境变量名只写一次。 */
const AUTHORITY_PROTOCOL = { envKey: "KNORVIA_SERVICE_AUTHORITY_MODE" } as const;

/** 选择服务权威模式的环境变量。 */
export const SERVICE_AUTHORITY_MODE_ENV = AUTHORITY_PROTOCOL.envKey;

/**
 * 权威模式登记表：模式 → 该模式下 provider registry 由谁提供。
 *
 * 键集合就是对外取值域，顺序即比较顺序：
 * - `desktop-local`：Desktop 自带 Local Host；
 * - `desktop-attached-remote`：Desktop 附着远端 Host；
 * - `standalone-server`：Server 独立运行。
 */
const AUTHORITY_MODE_REGISTRY = {
  "desktop-local": { registrySource: "local" },
  "desktop-attached-remote": { registrySource: "remote" },
  "standalone-server": { registrySource: "local" },
} as const satisfies Record<string, { registrySource: "local" | "remote" }>;

export type ServiceAuthorityMode = keyof typeof AUTHORITY_MODE_REGISTRY;

/** 对外暴露的取值域数组，由登记表投影而来。 */
export const serviceAuthorityModes: readonly ServiceAuthorityMode[] = Object.keys(
  AUTHORITY_MODE_REGISTRY,
) as ServiceAuthorityMode[];

export const isServiceAuthorityMode = (candidate: unknown): candidate is ServiceAuthorityMode =>
  typeof candidate === "string" && Object.hasOwn(AUTHORITY_MODE_REGISTRY, candidate);

/** 解析结果：键缺省表示「未配置」或「值非法」，由调用方决定如何告警。 */
export interface ParsedServiceAuthorityMode {
  mode?: ServiceAuthorityMode;
  /** 非空但不在取值域内的原始值（已 trim）。 */
  invalidRawValue?: string;
}

export function parseServiceAuthorityMode(
  env: Record<string, string | undefined>,
): ParsedServiceAuthorityMode {
  const configured = env[SERVICE_AUTHORITY_MODE_ENV]?.trim();
  if (!configured) return {};
  if (isServiceAuthorityMode(configured)) return { mode: configured };
  // 非法值原样保留（已 trim），交给上层决定告警还是回退默认。
  return { invalidRawValue: configured };
}

/** 只有登记为 remote 的模式才改由远端提供 registry；其余模式都用本机来源。 */
export const shouldUseProviderRegistrySourceForAuthorityMode = (
  mode: ServiceAuthorityMode | undefined,
): boolean => {
  if (mode === undefined) return true;
  return AUTHORITY_MODE_REGISTRY[mode].registrySource === "local";
};
