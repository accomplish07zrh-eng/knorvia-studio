// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserControlListInput, BrowserControlPort } from "@knorvia/contracts";
import type { KnorviaProtocolAgentServerContext } from "./server-types.js";
import { BrowserRequestChannel } from "./browser-request-channel.js";
import {
  BrowserSessionConnections,
  type BrowserConnectionIdentity,
} from "./browser-session-connections.js";

/** 协议 agent 侧上下文的简称；只在本模块内使用，便于把工厂函数签名压短。 */
type AgentSideContext = KnorviaProtocolAgentServerContext;

/** 会话生命周期通知的两种载荷；两者都是「广播给该会话的全部已知连接」的请求。 */
type LifecycleNotice =
  | { readonly method: "turnEnded"; readonly turnId: string | undefined }
  | { readonly method: "closeSession" };

/** 广播所需的三个入参；收成一个对象，让调用点的意图比三个位置参数清楚。 */
interface BroadcastRequest {
  readonly input: BrowserControlListInput;
  readonly targets: readonly BrowserConnectionIdentity[];
  readonly notice: LifecycleNotice;
}

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
export function createProtocolBrowserControlBroker(context: AgentSideContext): BrowserControlPort {
  // 两个协作者各管一件事：通道负责发请求，目录负责记连接。
  const channel = new BrowserRequestChannel(context);
  const directory = new BrowserSessionConnections();

  /**
   * 把一条生命周期通知广播给给定连接集。
   *
   * 用 `allSettled` 而非 `all`：单个连接发不出去不能阻止其余连接收到通知，
   * 而且这里没有「全部成功才算成功」的语义 —— 通知是尽力而为。
   *
   * @param request - 调用输入、已解析的连接集、要广播的载荷。
   */
  const broadcast = async ({ input, targets, notice }: BroadcastRequest): Promise<void> => {
    const deliveries = targets.map((target) => channel.notify(input, target, notice));
    await Promise.allSettled(deliveries);
  };

  // 三个入口逐个实现成一个具名函数，再组装成端口对象。
  // 分开写的好处：每个入口的「用快照还是用摘取」这类差异就在它自己的函数里，
  // 不必在一个对象字面量的四个属性之间来回对照。
  const list: BrowserControlPort["list"] = (input) => channel.list(input);

  const execute: BrowserControlPort["execute"] = (input) =>
    channel.execute(input, () => directory.remember(input));

  /** 回合结束：用快照 —— 结束回合不结束连接，下一个回合还要用它。 */
  const turnEnded: NonNullable<BrowserControlPort["turnEnded"]> = (input) =>
    broadcast({
      input,
      targets: directory.snapshot(input.sessionId),
      notice: { method: "turnEnded", turnId: input.turnId },
    });

  /** 关闭会话：先摘取再等回执 —— 旧 close 的等待期里新建的连接不该被它删掉。 */
  const closeSession: NonNullable<BrowserControlPort["closeSession"]> = (input) =>
    broadcast({
      input,
      targets: directory.take(input.sessionId),
      notice: { method: "closeSession" },
    });

  const port: BrowserControlPort = { list, execute, turnEnded, closeSession };
  return port;
}
