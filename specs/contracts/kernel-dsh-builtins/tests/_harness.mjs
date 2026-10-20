// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins 契约测试的共享脚手架。
//
// 只经公开入口做事：内核走 `@knorvia/bootstrap/kernel` 子路径（dist 或源码，由
// KNORVIA_KERNEL_ENTRY 选），DSH 侧只用它自己导出的服务与 npm 公开导出。
// 不 import 任何 bootstrap 内部实现文件，也不 import 桥。

/** 沉默 logger：契约测试只关心可观察行为，不关心日志行。 */
export const QUIET_LOGGER = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * 造一份干净的环境：去掉宿主继承的 DSH_*，避免开发机上的残留影响断言。
 *
 * @param extra - 要额外注入的变量。
 * @returns 可直接传给 `bootKernel` 的环境对象。
 */
export function isolatedEnvironment(extra) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (name.toUpperCase().startsWith("DSH_")) continue;
    if (name === "KNORVIA_KERNEL_ENGINE") continue;
    environment[name] = value;
  }
  return Object.assign(environment, extra);
}

/**
 * 读一条工具结果的文本正文。DSH 的工具结果里 `content` 是内容块数组，
 * 契约断言只看人类可读的那段文本。
 *
 * @param result - `tools.execute()` 的返回值。
 * @returns 拼接后的文本。
 */
function toolResultText(result) {
  const blocks = result?.content;
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const block of blocks) {
    if (typeof block?.text === "string") parts.push(block.text);
  }
  return parts.join("\n");
}

/**
 * 在给定 context 上跑一次工具调用。`callId` 只需在本进程内唯一，
 * 用于把结果与调用对上。
 *
 * @param ctx - 内核的根 context。
 * @param name - 工具名。
 * @param args - 工具参数。
 * @param options.agent - 需要的调用者 Agent（目标、todo 一类工具要求）。
 * @param options.seq - 调用序号，避免两条调用撞同一个 callId。
 * @returns `{ result, text, isError }`。
 */
export async function runTool(ctx, name, args, options = {}) {
  const controller = new AbortController();
  const execution = {
    callId: `builtins-${options.seq ?? 1}-${name}`,
    name,
    arguments: args,
    signal: controller.signal,
  };
  if (options.agent !== undefined) execution.agent = options.agent;
  const result = await ctx.get("tools").execute(execution);
  return { result, text: toolResultText(result), isError: result?.isError === true };
}
