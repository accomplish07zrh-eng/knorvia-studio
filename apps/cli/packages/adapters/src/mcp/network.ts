// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 子进程的环境装配与网络 fetch 构造。
//
// 子进程网络环境下发约定：
// 一、先复制来源环境里的字符串项（保留 __proto__ 文本不生成自有键这一既有边界），
//     再走统一清洗。
// 二、出口策略（代理 / 绕过 / CA）由 applyNetworkEgressEnv 统一写入，本文件不自行拼变量名。
// 三、仅当自身可执行文件就是 node 时才补 PATH —— 否则会把无关运行时目录塞进子进程。
// 四、PATH 比较先做路径等价判断，再做可执行文件探测；两者都尽量少做访问检查。
// 五、只在确实需要补目录时创建新对象，其余情况原样返回，保证调用方可比较引用。
//
// 注意：可执行文件路径与平台**在模块加载时取一次并缓存**，这是刻意的。
// 夹具的做法是「先替换 process.execPath / process.platform，再 import 本模块，
// import 后立刻恢复真实值」—— 只有在模块求值时捕获，才能拿到注入的平台与可执行文件。
// 若改成调用时每次读 process，会读回已恢复的真实值，跨平台分支就测不到。

import { accessSync, constants } from "node:fs";
import * as path from "node:path";
import { sanitizeKnorviaRuntimeEnv } from "@knorvia/shared/runtime-env";
import { createNetworkProxyFetch } from "../network/proxy-fetch.js";
import { applyNetworkEgressEnv, type NetworkEgressEnvPolicy } from "../network/subprocess-env.js";

export type { NetworkEgressEnvPolicy };

/** 模块加载时快照的可执行文件与平台（见上方说明，不要改成调用时读取）。 */
const RUNTIME_EXEC_PATH = process.execPath;
const RUNTIME_PLATFORM = process.platform;

/** 视为「就是 node」的可执行文件名（比较前已小写化）。 */
const NODE_EXECUTABLE_NAMES = ["node", "node.exe"];

/** PATH 变量名的标准写法；实际键名可能大小写不同。 */
const PATH_KEY = "PATH";

/** 探测某路径是否可执行。 */
function executableAvailable(probePath: string): boolean {
  try {
    accessSync(probePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 当前可执行文件是否就是 node（否则不该动 PATH）。 */
function runsAsNode(paths: typeof path.win32 | typeof path.posix): boolean {
  const name = paths.basename(RUNTIME_EXEC_PATH).toLowerCase();
  return NODE_EXECUTABLE_NAMES.includes(name);
}

/** 环境里 PATH 的实际键名；找不到时用标准写法。 */
function pathKeyOf(env: Record<string, string>): string {
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === "path") return name;
  }
  return PATH_KEY;
}

/** 生成路径等价比较函数：Windows 下大小写不敏感。 */
function makeNormalizer(
  paths: typeof path.win32 | typeof path.posix,
  windows: boolean,
): (value: string) => string {
  return (value) => {
    const normalized = paths.normalize(value);
    return windows ? normalized.toLowerCase() : normalized;
  };
}

/**
 * PATH 是否已能解析到 node：先看有没有与当前目录等价的条目，再逐条探可执行文件。
 * 一旦命中就停 —— 后面的条目不再触发访问检查。
 */
function alreadyResolvable(
  entries: readonly string[],
  paths: typeof path.win32 | typeof path.posix,
  directory: string,
  nodeName: string,
  normalize: (value: string) => string,
): boolean {
  const expected = normalize(directory);
  for (const entry of entries) {
    if (normalize(entry) === expected) return true;
  }
  for (const entry of entries) {
    if (executableAvailable(paths.join(entry, nodeName))) return true;
  }
  return false;
}

/** 当前可执行文件是 node 时把它的目录补进 PATH；否则原样返回。 */
function ensureNodePath(env: Record<string, string>): Record<string, string> {
  const windows = RUNTIME_PLATFORM === "win32";
  const paths = windows ? path.win32 : path.posix;
  if (!runsAsNode(paths)) return env;

  const directory = paths.dirname(RUNTIME_EXEC_PATH);
  const key = pathKeyOf(env);
  const current = env[key] ?? "";
  const delimiter = windows ? ";" : path.delimiter;
  const entries = current.split(delimiter).filter((entry) => entry.length > 0);
  const nodeName = windows ? "node.exe" : "node";
  if (alreadyResolvable(entries, paths, directory, nodeName, makeNormalizer(paths, windows))) {
    return env;
  }

  // 只有真的补入目录时才创建新对象；保留原始 PATH 文本，不改投影结果。
  const next = { ...env };
  next[key] = current ? `${directory}${delimiter}${current}` : directory;
  return next;
}

/** 装配子进程环境的入参。 */
type StdioEnvAsk = {
  env?: NodeJS.ProcessEnv;
  network?: NetworkEgressEnvPolicy;
};

/** 装配 MCP stdio 子进程的环境：复制 → 清洗 → 出口策略 → 补 PATH。 */
export function buildMcpStdioEnv(settings: StdioEnvAsk): Record<string, string> {
  const source = settings.env ?? process.env;
  const copied: Record<string, string> = {};
  // 普通对象赋值保留「__proto__ 字符串不生成自有键」这一既有边界。
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") copied[key] = value;
  }
  const projected = applyNetworkEgressEnv(sanitizeKnorviaRuntimeEnv(copied), {
    network: settings.network,
    sourceEnv: source,
  });
  return ensureNodePath(projected);
}

/** 造一个带网络策略的 fetch（代理 / 绕过 / CA 全部来自网络策略）。 */
export function createMcpTransportFetch(settings: StdioEnvAsk): typeof globalThis.fetch {
  return createNetworkProxyFetch({
    caCertFile: settings.network?.caCertFile,
    env: settings.env ?? process.env,
    httpProxy: settings.network?.httpProxy,
    noProxy: settings.network?.noProxy,
  });
}
