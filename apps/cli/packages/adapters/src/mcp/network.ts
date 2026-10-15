// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { accessSync, constants } from "node:fs";
import * as path from "node:path";
import { sanitizeKnorviaRuntimeEnv } from "@knorvia/shared/runtime-env";
import { createNetworkProxyFetch } from "../network/proxy-fetch.js";
import { applyNetworkEgressEnv, type NetworkEgressEnvPolicy } from "../network/subprocess-env.js";

export type { NetworkEgressEnvPolicy };

const runtimeExecPath = process.execPath;
const runtimePlatform = process.platform;

function executableAvailable(probePath: string): boolean {
  const mode = constants.X_OK;
  try {
    accessSync(probePath, mode);
    return true;
  } catch {
    return false;
  }
}

function ensureNodePath(env: Record<string, string>): Record<string, string> {
  const windows = runtimePlatform === "win32";
  const paths = windows ? path.win32 : path.posix;
  const executableName = paths.basename(runtimeExecPath).toLowerCase();
  if (executableName !== "node" && executableName !== "node.exe") return env;

  const directory = paths.dirname(runtimeExecPath);
  const key = Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
  const current = env[key] ?? "";
  const delimiter = windows ? ";" : path.delimiter;
  const entries = current.split(delimiter).filter((entry) => entry.length > 0);
  const normalize = (value: string): string => {
    const normalized = paths.normalize(value);
    return windows ? normalized.toLowerCase() : normalized;
  };
  const expected = normalize(directory);

  // 先完成路径等价判断；后面的匹配项也必须避免触发前面项的访问检查。
  if (entries.some((entry) => normalize(entry) === expected)) return env;
  const nodeName = windows ? "node.exe" : "node";
  for (const entry of entries) {
    const probePath = paths.join(entry, nodeName);
    if (executableAvailable(probePath)) return env;
  }

  // 只有补入目录时创建新对象；保留原始 dirname 和 PATH 文本，不改投影结果。
  return { ...env, [key]: current ? `${directory}${delimiter}${current}` : directory };
}

// 子进程网络环境下发约定：
// 一、先复制来源环境里的字符串项（保留 __proto__ 文本这一既有边界），再走统一清洗。
// 二、出口策略（代理/绕过/CA）由 applyNetworkEgressEnv 统一写入，本文件不自行拼变量。
// 三、仅当自身可执行文件就是 node 时才补 PATH：避免把无关运行时目录塞进子进程环境。
// 四、PATH 比较先做路径等价判断，再做可执行文件探测；两者都避免不必要的访问检查。
// 五、只在确实需要补目录时创建新对象，其余情况原样返回，保证调用方可比较引用。
export function buildMcpStdioEnv(settings: {
  env?: NodeJS.ProcessEnv;
  network?: NetworkEgressEnvPolicy;
}): Record<string, string> {
  const source = settings.env ?? process.env;
  const copied: Record<string, string> = {};
  // 普通对象赋值保留 __proto__ 字符串不生成自有键的既有边界。
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") copied[key] = value;
  }
  const sanitized = sanitizeKnorviaRuntimeEnv(copied);
  const projected = applyNetworkEgressEnv(sanitized, {
    network: settings.network,
    sourceEnv: source,
  });
  return ensureNodePath(projected);
}

export function createMcpTransportFetch(settings: {
  env?: NodeJS.ProcessEnv;
  network?: NetworkEgressEnvPolicy;
}): typeof globalThis.fetch {
  return createNetworkProxyFetch({
    caCertFile: settings.network?.caCertFile,
    env: settings.env ?? process.env,
    httpProxy: settings.network?.httpProxy,
    noProxy: settings.network?.noProxy,
  });
}
