// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
//
// 运行环境相关的两件小事：给当前进程打上可识别的标题，以及从环境变量里
// **可选地**装配出 CUA 运行时（未配置时返回 undefined，调用方据此走无 CUA 的路径）。

import { createComputerUseRuntime, type ComputerUseRuntime } from "@knorvia/cua";

/** 进程标题：外部按它识别 node-repl 的 MCP 进程。 */
export const NODE_REPL_MCP_PROCESS_TITLE = "knorvia-node-repl-mcp";

/** 权限代理套接字的环境变量名。 */
const BROKER_SOCKET_ENV = "KNORVIA_CUA_PERMISSION_BROKER_SOCKET";

/** 刷新标记文件的环境变量名。 */
const BROKER_REFRESH_MARKER_ENV = "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER";

/** 装配结果：配好了就是运行时，没配就是 undefined（调用方据此走无 CUA 的路径）。 */
type MaybeRuntime = ComputerUseRuntime | undefined;

/** 可写标题的目标；默认就是当前进程。 */
type TitleTarget = { title: string };

/** 环境变量表（与 NodeJS.ProcessEnv 结构相容）。 */
type EnvLike = NodeJS.ProcessEnv;

/** 把目标对象的标题改成约定的进程标题。 */
export function setNodeReplMcpProcessTitle(target: TitleTarget = process): void {
  target.title = NODE_REPL_MCP_PROCESS_TITLE;
}

/**
 * 从环境里装配 CUA 运行时。
 * 只有本适配器读取既有的可选权限服务配置；套接字地址缺失即视为「未启用」，返回 undefined。
 *
 * 注意：`refreshMarkerPath` 一律照原样传出（即使值是 undefined）—— 装配对象里有没有这个键
 * 会被调用方的 `deepEqual` 断言（比较整个对象），所以这里不做「有值才放进去」的优化。
 */
export function captureComputerUseRuntimeFromEnvironment(env: EnvLike = process.env): MaybeRuntime {
  const brokerSocketPath = env[BROKER_SOCKET_ENV]?.trim();
  if (!brokerSocketPath) return undefined;

  const refreshMarkerPath = env[BROKER_REFRESH_MARKER_ENV]?.trim();
  const settings: Parameters<typeof createComputerUseRuntime>[0] = { brokerSocketPath };
  settings.refreshMarkerPath = refreshMarkerPath;
  return createComputerUseRuntime(settings);
}
