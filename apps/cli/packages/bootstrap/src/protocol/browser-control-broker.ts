// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserControlListInput, BrowserControlPort } from "@knorvia/contracts";
import type { KnorviaProtocolAgentServerContext } from "./server-types.js";
import { BrowserRequestChannel } from "./browser-request-channel.js";
import {
  BrowserSessionConnections,
  type BrowserConnectionIdentity,
} from "./browser-session-connections.js";

/** 会话生命周期通知的两种载荷；两者都是「广播给该会话的全部已知连接」的请求。 */
type LifecycleNotice =
  | { readonly method: "turnEnded"; readonly turnId: string | undefined }
  | { readonly method: "closeSession" };

/**
 * 造一个走协议反向请求的浏览器控制端口。
 *
 * 结构上只做一件事：把 `BrowserControlPort` 的三个入口翻译成
 * 「按会话查连接 → 逐条发协议请求」的形态。连接的记忆与摘取交给
 * `BrowserSessionConnections`（单一所有者），本函数不持有连接状态。
 *
 * @param context - 协议 agent 侧服务上下文（提供反向请求通道）。
 * @returns `BrowserControlPort` 实现。
 */
export function createProtocolBrowserControlBroker(
  context: KnorviaProtocolAgentServerContext,
): BrowserControlPort {
  const channel = new BrowserRequestChannel(context);
  const directory = new BrowserSessionConnections();

  /**
   * 把一条生命周期通知广播给给定连接集。
   *
   * 用 `allSettled` 而非 `all`：单个连接发不出去不能阻止其余连接收到通知，
   * 而且这里没有「全部成功才算成功」的语义 —— 通知是尽力而为。
   *
   * @param input - 携带 sessionId 与 turnId 的调用输入。
   * @param targets - 已解析出的连接集（调用方决定是快照还是摘取）。
   * @param notice - 要广播的载荷。
   */
  const broadcast = async (
    input: BrowserControlListInput,
    targets: readonly BrowserConnectionIdentity[],
    notice: LifecycleNotice,
  ): Promise<void> => {
    const deliveries = targets.map((target) => channel.notify(input, target, notice));
    await Promise.allSettled(deliveries);
  };

  return {
    list: (input) => channel.list(input),
    execute: (input) => channel.execute(input, () => directory.remember(input)),
    turnEnded: (input) =>
      // 快照而不摘取：回合结束不结束这条连接，下一个回合还要用它。
      broadcast(input, directory.snapshot(input.sessionId), {
        method: "turnEnded",
        turnId: input.turnId,
      }),
    closeSession: (input) =>
      // 先摘取再等待回执：旧 close 的等待期里新建立的连接不该被它删掉。
      broadcast(input, directory.take(input.sessionId), { method: "closeSession" }),
  };
}
