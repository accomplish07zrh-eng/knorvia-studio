// SPDX-License-Identifier: Apache-2.0
// RPC 日志装饰器：在 channel 的调用与订阅路径上打一条耗时记录。
//
// 设计取向是「统一成一个装饰函数 + 一张描述表」，而不是给客户端/服务端各写一套
// 同构的包装类。两类 channel 的差别只有三处——日志前缀、是否带箭头后缀、
// 调用参数形状——把这三处抽成表项后，装饰逻辑只写一遍。
import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";

export type RPCLogger = (message: string, ...args: unknown[]) => void;

/**
 * 一条调用结束后要写进日志的文案。
 *
 * 耗时统一保留一位小数：调用方拿日志做前后对比时，
 * 位数不一致会让肉眼比对齐变得麻烦。
 */
function stamp(outcome: "OK" | "FAIL", startedAt: number): string {
  return `${outcome} (${(performance.now() - startedAt).toFixed(1)}ms)`;
}

/**
 * 统一的装饰骨架：包住一次 awaited 调用，成功与失败共用同一个计时窗口。
 *
 * 失败时把原始错误作为日志的第二参数传出，然后**原样重抛**——
 * 装饰器不该改变错误的类型或身份，否则调用方的错误分类逻辑会失效。
 */
async function observe<T>(write: RPCLogger, scope: string, body: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    const value = await body();
    write(`${scope} ${stamp("OK", startedAt)}`);
    return value;
  } catch (failure) {
    write(`${scope} ${stamp("FAIL", startedAt)}`, failure);
    throw failure;
  }
}

/** 订阅是同步操作：只记一条事件，不做计时。 */
function noteSubscription(write: RPCLogger, scope: string, tail: string): void {
  write(`${scope}${tail} subscribed`);
}

/**
 * 两端 channel 的差异集中在这张表里。
 *
 * `prefix` 是日志前缀（`[rpc:call]` / `[rpc:listen]`），
 * `arrow` 是客户端侧特有的方向标记（服务端没有对端概念，不加）。
 */
const SIDE = {
  server: { callPrefix: "[rpc:call]", listenPrefix: "[rpc:listen]", arrow: "" },
  client: { callPrefix: "[rpc:call]", listenPrefix: "[rpc:listen]", arrow: " →" },
} as const;

/** 包一层服务端的 channel 实现。 */
function wrapServerChannel<TContext>(
  delegate: IServerChannel<TContext>,
  label: string,
  write: RPCLogger,
): IServerChannel<TContext> {
  const side = SIDE.server;
  return {
    call: <T>(ctx: TContext, command: string, arg?: any, token?: CancellationToken): Promise<T> =>
      observe(write, `${side.callPrefix} ${label}.${command}`, () =>
        delegate.call<T>(ctx, command, arg, token),
      ),
    listen: <T>(ctx: TContext, event: string, arg?: any): Event<T> => {
      const scope = `${side.listenPrefix} ${label}.${event}`;
      try {
        const subscription = delegate.listen<T>(ctx, event, arg);
        noteSubscription(write, scope, "");
        return subscription;
      } catch (failure) {
        write(`${scope} FAIL`, failure);
        throw failure;
      }
    },
  };
}

/** 包一层客户端 channel 句柄。 */
function wrapClientChannel(delegate: IChannel, label: string, write: RPCLogger): IChannel {
  const side = SIDE.client;
  return {
    call: <T>(command: string, arg?: any, token?: CancellationToken): Promise<T> =>
      observe(write, `${side.callPrefix} ${label}.${command}${side.arrow}`, () =>
        delegate.call<T>(command, arg, token),
      ),
    listen: <T>(event: string, arg?: any): Event<T> => {
      noteSubscription(write, `${side.listenPrefix} ${label}.${event}`, side.arrow);
      return delegate.listen<T>(event, arg);
    },
  };
}

export class LoggingChannelServer<TContext = string> implements IChannelServer<TContext> {
  readonly #inner: IChannelServer<TContext>;
  readonly #logger: RPCLogger;

  constructor(inner: IChannelServer<TContext>, logger: RPCLogger) {
    this.#inner = inner;
    this.#logger = logger;
  }

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.#logger(`[rpc:register] channel "${channelName}"`);
    // 每个 channel 一个独立的写日志闭包：日志里始终带得上自己的名字，
    // 不必在下游再传一遍 channelName。
    const write: RPCLogger = (message, ...rest) => this.#logger(message, ...rest);
    this.#inner.registerChannel(channelName, wrapServerChannel(channel, channelName, write));
  }

  ready(): void {
    this.#inner.ready?.();
  }
}

export class LoggingChannelClient implements IChannelClient {
  readonly #inner: IChannelClient;
  readonly #logger: RPCLogger;

  constructor(inner: IChannelClient, logger: RPCLogger) {
    this.#inner = inner;
    this.#logger = logger;
  }

  getChannel<T extends IChannel>(channelName: string): T {
    const delegate = this.#inner.getChannel<T>(channelName);
    const write: RPCLogger = (message, ...rest) => this.#logger(message, ...rest);
    return wrapClientChannel(delegate as IChannel, channelName, write) as unknown as T;
  }
}
