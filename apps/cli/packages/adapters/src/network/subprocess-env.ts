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

/**
 * 一次写入所需的两侧字典与大小写策略。
 *
 * 原先每个辅助函数都要重复收 `origin` / `target` / `foldCase` 三件套，
 * 参数表比函数体还长；收成一个上下文后，辅助函数只剩「做什么」这一层信息。
 */
interface EnvWriteContext {
  /** 大小写不敏感平台（Windows）为 true：取值取首个匹配键，删除删掉全部别名。 */
  foldCase: boolean;
  /** 来源环境：可能是 process.env，也可能是另一份待合并的字典。 */
  origin: Record<string, string | undefined>;
  /** 目标环境：最终要交给子进程的那一份。 */
  target: Record<string, string>;
}

/** 取值：不区分大小写时取首个匹配键，否则直接取同名键。 */
function sourceValue(context: EnvWriteContext, name: string): string | undefined {
  if (!context.foldCase) return context.origin[name];
  const folded = name.toLowerCase();
  const key = Object.keys(context.origin).find((entry) => entry.toLowerCase() === folded);
  // Windows 首个匹配即决定结果，空值也不能跳到后面的大小写别名。
  return key === undefined ? undefined : context.origin[key];
}

/** 删除一个键；大小写不敏感时删掉全部别名。 */
function removeKey(context: EnvWriteContext, name: string): void {
  if (!context.foldCase) {
    delete context.target[name];
    return;
  }
  const folded = name.toLowerCase();
  for (const key of Object.keys(context.target)) {
    if (key.toLowerCase() === folded) delete context.target[key];
  }
}

/** 写一个键：先按大小写策略清掉旧值，再落新值。 */
function writeValue(context: EnvWriteContext, name: string, value: string): void {
  removeKey(context, name);
  context.target[name] = value;
}

/** 取值但要求非空白：把「空串等于没配」的约定收在一处。 */
function nonblankSourceValue(context: EnvWriteContext, name: string): string | undefined {
  const value = sourceValue(context, name);
  return value?.trim() ? value : undefined;
}

/** 工具透传环境 → 目标 env（可关闭）。 */
function mergeToolPassthrough(context: EnvWriteContext, enabled: boolean): void {
  removeKey(context, KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY);
  if (!enabled) return;
  for (const [key, value] of Object.entries(readKnorviaToolEnvPassthroughEnv(context.origin))) {
    writeValue(context, key, value);
  }
}

/** 同一取值写到多个变量名（大小写两套 / 各工具链的 CA 变量）。 */
function writeAll(context: EnvWriteContext, keys: readonly string[], value: string): void {
  for (const key of keys) writeValue(context, key, value);
}

/** 代理值：显式策略优先，其次来源环境；缺 scheme 时补 http://。 */
function proxyValue(context: EnvWriteContext, policy: NetworkEgressEnvPolicy): string | undefined {
  const raw = policy.httpProxy?.trim() || sourceValue(context, KNORVIA_HTTP_PROXY_ENV_KEY)?.trim();
  if (!raw) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
}

export function applyNetworkEgressEnv(
  targetEnv: Record<string, string>,
  options: NetworkEgressEnvOptions,
): Record<string, string> {
  const platform = options.platform ?? process.platform;
  const context: EnvWriteContext = {
    foldCase: platform === "win32",
    origin: options.sourceEnv ?? {},
    target: targetEnv,
  };
  const policy = options.network ?? {};

  mergeToolPassthrough(context, options.toolEnvPassthrough !== false);

  // source 可以就是 env；必须在覆盖和前序写入之后逐项取值，不能提前快照。
  const proxy = proxyValue(context, policy);
  if (proxy) writeAll(context, PROXY_ENV_KEYS, proxy);

  const noProxy = policy.noProxy?.trim() || nonblankSourceValue(context, KNORVIA_NO_PROXY_ENV_KEY);
  if (noProxy) writeAll(context, ["NO_PROXY", "no_proxy"], noProxy);

  const ca =
    policy.caCertFile?.trim() || nonblankSourceValue(context, KNORVIA_AGENT_CA_CERT_ENV_KEY);
  if (ca) writeAll(context, CA_ENV_KEYS, ca);

  return targetEnv;
}
