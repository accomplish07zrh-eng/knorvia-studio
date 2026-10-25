// SPDX-License-Identifier: Apache-2.0
import { ProxyChannel, type IChannelServer } from "@knorvia/rpc";
import type { ServiceDescriptor } from "./descriptors.js";

/** 频道没有注册时抛出的错误；消息里带频道名，便于定位漏注册的服务。 */
function notRegisteredError(channelName: string): Error {
  return new Error(`Service not registered: ${channelName}`);
}

/**
 * 取覆写表里某个频道的值。
 *
 * 覆写表可以整体缺省，也可以只覆盖部分频道；两种「没有该项」都返回 `undefined`，
 * 由调用方决定回退。`false` / `0` / 空串是有效覆写值，因此读取侧不做真值判断。
 */
function overrideFor(overrides: ReadonlyMap<string, unknown> | undefined, channelName: string) {
  return overrides === undefined ? undefined : overrides.get(channelName);
}

/** 把一个实例适配成 server channel，并挂到目标服务器的指定频道名上。 */
function publishChannel(server: IChannelServer, channelName: string, instance: unknown): void {
  server.registerChannel(channelName, ProxyChannel.fromService(instance));
}

/**
 * 以频道名为键的服务注册表。
 *
 * 只保存实例引用，不复制也不包装；同一频道重复注册时后者覆盖前者。
 * 覆写只作用于「暴露」这一次动作，不写回注册表，也不改变已注册实例的读取结果。
 */
export class ServiceCollection {
  readonly #byChannelName = new Map<string, unknown>();

  register<T>(key: ServiceDescriptor<T>, value: T): this {
    this.#byChannelName.set(key.channelName, value);
    return this;
  }

  get<T>(key: ServiceDescriptor<T>): T {
    const found = this.getOptional(key);
    if (!found) throw notRegisteredError(key.channelName);
    return found as T;
  }

  getOptional<T>(key: ServiceDescriptor<T>): T | undefined {
    return this.#byChannelName.get(key.channelName) as T | undefined;
  }

  exposeOnChannelServer(server: IChannelServer, overrides?: ReadonlyMap<string, unknown>): void {
    for (const [channelName, registered] of this.#byChannelName) {
      publishChannel(server, channelName, overrideFor(overrides, channelName) ?? registered);
    }
  }
}
