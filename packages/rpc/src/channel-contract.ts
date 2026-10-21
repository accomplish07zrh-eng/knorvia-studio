// SPDX-License-Identifier: Apache-2.0
// channel 层两个方向的接口定义。
//
// 调用方持 IChannel（不知道上下文），实现方持 IServerChannel（多一个 ctx）。
// 把它们放在独立模块是为了让「契约形状」与「线上编号」各自演进：
// 编号是线格式（改动即破坏互通），接口是本进程内的类型约束，两者的变更风险不同。
import type { CancellationToken, Event } from "./foundation.js";

/** 调用方视角的远端 channel：一个方法对应一条命令。 */
export interface IChannel {
  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
  listen<T>(event: string, arg?: any): Event<T>;
}

/** 实现方视角的 channel：比 IChannel 多一个服务端上下文参数。 */
export interface IServerChannel<TContext = string> {
  call<T>(
    ctx: TContext,
    command: string,
    arg?: any,
    cancellationToken?: CancellationToken,
  ): Promise<T>;
  listen<T>(ctx: TContext, event: string, arg?: any): Event<T>;
}

/** 服务端需要实现的最小面：注册 channel，并可选地再宣告一次就绪。 */
export interface IChannelServer<TContext = string> {
  registerChannel(channelName: string, channel: IServerChannel<TContext>): void;
  ready?(): void;
}

/** 客户端需要实现的最小面：按名字取一个 channel 句柄。 */
export interface IChannelClient {
  getChannel<T extends IChannel>(channelName: string): T;
}
