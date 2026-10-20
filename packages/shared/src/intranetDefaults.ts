// SPDX-License-Identifier: Apache-2.0

/*
 * 内网镜像地址的默认值。所有取值要么来自环境变量，要么由本文件的端口常量拼出，
 * 调用方不再自己拼 host/port。
 */

/** 未配置内网机器时的主机名。 */
const FALLBACK_MACHINE_HOST = "";

/** 内网环境只读取这两个变量。 */
interface IntranetEnvironment {
  INTRANET_MACHINE_HOST?: string;
  KNORVIA_DEPS_BASE_URL?: string;
}

/** 资产服务与探测服务的端口 + 探测路径。 */
const ASSET_SERVICE_PORT = 12345;
const PROBE_SERVICE_PORT = 3850;
const PROBE_SERVICE_PATH = "/api/intranet/probe";

/** 资产服务挂载根（镜像站自身路径）。 */
const ASSET_SERVICE_ROOT = "/knorvia";
const DEPS_SERVICE_SUFFIX = "/deps";

const EMPTY = "";

function processEnvironment(): IntranetEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: IntranetEnvironment };
  };
  return runtime.process?.env ?? {};
}

/** 主机名统一 trim；缺省或全空白时返回空串。 */
export const resolveIntranetMachineHost = (
  env: IntranetEnvironment = processEnvironment(),
): string => env.INTRANET_MACHINE_HOST?.trim() || FALLBACK_MACHINE_HOST;

const machineHost = resolveIntranetMachineHost();

/** 由主机名拼出 `http://host:port/path`；主机为空时返回空串。 */
function serviceUrl(host: string, port: number, path: string): string {
  if (host === EMPTY) return EMPTY;
  return `http://${host}:${port}${path}`;
}

export const DEFAULT_INTRANET_MACHINE_HOST = FALLBACK_MACHINE_HOST;
export const INTRANET_MACHINE_HOST = machineHost;
export const INTRANET_ASSET_SERVICE_PORT = ASSET_SERVICE_PORT;
export const INTRANET_PROBE_SERVICE_PORT = PROBE_SERVICE_PORT;
export const INTRANET_PROBE_SERVICE_PATH = PROBE_SERVICE_PATH;

export const INTRANET_ASSET_BASE_URL = serviceUrl(
  machineHost,
  ASSET_SERVICE_PORT,
  ASSET_SERVICE_ROOT,
);

export const INTRANET_PROBE_SERVICE_URL = serviceUrl(
  machineHost,
  PROBE_SERVICE_PORT,
  PROBE_SERVICE_PATH,
);

export const INTRANET_DEPS_BASE_URL =
  INTRANET_ASSET_BASE_URL === EMPTY ? EMPTY : `${INTRANET_ASSET_BASE_URL}${DEPS_SERVICE_SUFFIX}`;

/** 缺参时抛出的文案：调用方按整句匹配，改动会破坏契约。 */
const MISSING_DEPS_CONFIGURATION_MESSAGE =
  "Configure KNORVIA_DEPS_BASE_URL or INTRANET_MACHINE_HOST in .env before downloading internal dependencies";

export function resolveIntranetDepsBaseUrl(
  env: IntranetEnvironment = processEnvironment(),
): string {
  const configuredBase = env.KNORVIA_DEPS_BASE_URL?.trim();
  if (configuredBase) {
    // 尾部斜杠全部去掉，调用方可以无条件拼 `/` 再接路径。
    return configuredBase.replace(/\/+$/u, "");
  }

  const host = resolveIntranetMachineHost(env);
  if (host === EMPTY) throw new Error(MISSING_DEPS_CONFIGURATION_MESSAGE);

  return `${serviceUrl(host, ASSET_SERVICE_PORT, ASSET_SERVICE_ROOT)}${DEPS_SERVICE_SUFFIX}`;
}
