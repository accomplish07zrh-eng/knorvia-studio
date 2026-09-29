// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { accessSync, constants } from "node:fs";
import * as path from "node:path";
import { sanitizeKnorviaRuntimeEnv } from "@knorvia/shared/runtime-env";
import { createNetworkProxyFetch } from "../network/proxy-fetch.js";
import { applyNetworkEgressEnv, type NetworkEgressEnvPolicy } from "../network/subprocess-env.js";

export type { NetworkEgressEnvPolicy };

const capturedExecutable = process.execPath;
const capturedPlatform = process.platform;

function executableAvailable(candidate: string): boolean {
  const mode = constants.X_OK;
  try {
    accessSync(candidate, mode);
    return true;
  } catch {
    return false;
  }
}

function ensureNodePath(env: Record<string, string>): Record<string, string> {
  const windows = capturedPlatform === "win32";
  const paths = windows ? path.win32 : path.posix;
  const executableName = paths.basename(capturedExecutable).toLowerCase();
  if (executableName !== "node" && executableName !== "node.exe") return env;

  const directory = paths.dirname(capturedExecutable);
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
    const candidate = paths.join(entry, nodeName);
    if (executableAvailable(candidate)) return env;
  }

  // 只有补入目录时创建新对象；保留原始 dirname 和 PATH 文本，不改投影结果。
  return { ...env, [key]: current ? `${directory}${delimiter}${current}` : directory };
}

export function buildMcpStdioEnv(options: {
  env?: NodeJS.ProcessEnv;
  network?: NetworkEgressEnvPolicy;
}): Record<string, string> {
  const source = options.env ?? process.env;
  const copied: Record<string, string> = {};
  // 普通对象赋值保留 __proto__ 字符串不生成自有键的既有边界。
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") copied[key] = value;
  }
  const sanitized = sanitizeKnorviaRuntimeEnv(copied);
  const projected = applyNetworkEgressEnv(sanitized, {
    network: options.network,
    sourceEnv: source,
  });
  return ensureNodePath(projected);
}

export function createMcpTransportFetch(options: {
  env?: NodeJS.ProcessEnv;
  network?: NetworkEgressEnvPolicy;
}): typeof globalThis.fetch {
  return createNetworkProxyFetch({
    caCertFile: options.network?.caCertFile,
    env: options.env ?? process.env,
    httpProxy: options.network?.httpProxy,
    noProxy: options.network?.noProxy,
  });
}
