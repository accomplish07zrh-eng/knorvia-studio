// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 子进程网络出口：把代理/绕过/CA 三类配置写进子进程环境变量。
// 形状声明见 subprocess-env-types.ts；本文件保持既有导出面（仅再导出 policy 类型）。
//
// 写入规则：
// 一、Windows 分支下环境变量名大小写不敏感：取值取首个匹配键，删除删掉全部别名。
// 二、工具透传环境先落地，随后被显式策略覆盖；source 可以就是 env 本身。
// 三、代理缺 scheme 时补 http://，再同时写入大小写两套变量名。
// 四、no_proxy 与 CA 证书各自写两套/多套变量名，保证子进程工具链都能读到。

import {
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  readKnorviaToolEnvPassthroughEnv,
} from "@knorvia/shared/runtime-env";
import type { NetworkEgressEnvOptions, NetworkEgressEnvPolicy } from "./subprocess-env-types.js";

export type { NetworkEgressEnvPolicy } from "./subprocess-env-types.js";

/**
 * 代理相关变量名：按大小写分两组。
 * 之所以分组而不是平铺，是因为「清掉哪一组」取决于平台对变量名大小写的处理方式，
 * 保留分组语义后调用点能直接选组，不必再靠顺序约定。
 */
const PROXY_ENV_GROUPS = {
  upper: ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"],
  lower: ["http_proxy", "https_proxy", "all_proxy"],
} as const;

/** 代理变量名的平铺视图（两组按「大写后小写」拼接，与该层既有写入顺序一致）。 */
const PROXY_ENV_KEYS: readonly string[] = [...PROXY_ENV_GROUPS.upper, ...PROXY_ENV_GROUPS.lower];

/** 自定义 CA 变量的来源组：Node 一个，其余工具链各自一个。 */
const CA_ENV_GROUPS = {
  node: "NODE_EXTRA_CA_CERTS",
  openssl: "SSL_CERT_FILE",
  requests: "REQUESTS_CA_BUNDLE",
  curl: "CURL_CA_BUNDLE",
  git: "GIT_SSL_CAINFO",
} as const;

/** CA 变量名的平铺视图（顺序与声明顺序一致）。 */
const CA_ENV_KEYS: readonly string[] = Object.values(CA_ENV_GROUPS);

/** 取值：Windows 下按不区分大小写的首个匹配键，其余平台直接取同名键。 */
function sourceValue(
  origin: Record<string, string | undefined>,
  name: string,
  foldCase: boolean,
): string | undefined {
  if (!foldCase) return origin[name];
  const folded = name.toLowerCase();
  const key = Object.keys(origin).find((entry) => entry.toLowerCase() === folded);
  // Windows 首个匹配即决定结果，空值也不能跳到后面的大小写别名。
  return key === undefined ? undefined : origin[key];
}

function removeKey(target: Record<string, string>, name: string, foldCase: boolean): void {
  if (!foldCase) {
    delete target[name];
    return;
  }
  const folded = name.toLowerCase();
  for (const key of Object.keys(target)) {
    if (key.toLowerCase() === folded) delete target[key];
  }
}

function writeValue(
  target: Record<string, string>,
  name: string,
  value: string,
  foldCase: boolean,
): void {
  removeKey(target, name, foldCase);
  target[name] = value;
}

function nonblankSourceValue(
  origin: Record<string, string | undefined>,
  name: string,
  foldCase: boolean,
): string | undefined {
  const value = sourceValue(origin, name, foldCase);
  return value?.trim() ? value : undefined;
}

/** 工具透传环境 → 目标 env（可关闭）。 */
function mergeToolPassthrough(
  targetEnv: Record<string, string>,
  origin: Record<string, string | undefined>,
  foldCase: boolean,
  enabled: boolean,
): void {
  removeKey(targetEnv, KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY, foldCase);
  if (!enabled) return;
  for (const [key, value] of Object.entries(readKnorviaToolEnvPassthroughEnv(origin))) {
    writeValue(targetEnv, key, value, foldCase);
  }
}

function writeAll(
  targetEnv: Record<string, string>,
  keys: readonly string[],
  value: string,
  foldCase: boolean,
): void {
  for (const key of keys) writeValue(targetEnv, key, value, foldCase);
}

/** 代理值：显式策略优先，其次来源环境；缺 scheme 时补 http://。 */
function proxyValue(
  origin: Record<string, string | undefined>,
  policy: NetworkEgressEnvPolicy,
  foldCase: boolean,
): string | undefined {
  const raw =
    policy.httpProxy?.trim() || sourceValue(origin, KNORVIA_HTTP_PROXY_ENV_KEY, foldCase)?.trim();
  if (!raw) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
}

export function applyNetworkEgressEnv(
  targetEnv: Record<string, string>,
  options: NetworkEgressEnvOptions,
): Record<string, string> {
  const platform = options.platform ?? process.platform;
  const origin = options.sourceEnv ?? {};
  const policy = options.network ?? {};
  const foldCase = platform === "win32";

  mergeToolPassthrough(targetEnv, origin, foldCase, options.toolEnvPassthrough !== false);

  // source 可以就是 env；必须在覆盖和前序写入之后逐项取值，不能提前快照。
  const proxy = proxyValue(origin, policy, foldCase);
  if (proxy) writeAll(targetEnv, PROXY_ENV_KEYS, proxy, foldCase);

  const noProxy =
    policy.noProxy?.trim() || nonblankSourceValue(origin, KNORVIA_NO_PROXY_ENV_KEY, foldCase);
  if (noProxy) writeAll(targetEnv, ["NO_PROXY", "no_proxy"], noProxy, foldCase);

  const ca =
    policy.caCertFile?.trim() ||
    nonblankSourceValue(origin, KNORVIA_AGENT_CA_CERT_ENV_KEY, foldCase);
  if (ca) writeAll(targetEnv, CA_ENV_KEYS, ca, foldCase);

  return targetEnv;
}
