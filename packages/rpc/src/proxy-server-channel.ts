// SPDX-License-Identifier: Apache-2.0
// 服务对象 → IServerChannel 的成员路由。
//
// 判定的核心是「成员名属于哪一类」，四类各有不同的转发方式：
//   · `onDynamic*` 带参事件 —— 每次订阅调一次工厂（参数即话题）
//   · `on*` 无参事件        —— 桥接成可重复订阅的同一条流
//   · 其余函数               —— 转发成 `call`
//   · 非函数字段             —— 不参与转发
// 桥接结果按名字缓存，避免同一事件被订阅两次时各拿一份上游。
import type { IServerChannel } from "./channels.js";
import type { Event } from "./foundation.js";
import { createEventBridge } from "./proxy-event-bridge.js";

/** 带参事件的成员名模式；必须先于无参事件匹配，否则会被误当成无参。 */
const PARAMETERIZED = /^onDynamic[A-Z]/u;

/** 无参事件的成员名模式。 */
const PLAIN = /^on[A-Z]/u;

/** 判定成员是否是无参事件（排除带参事件）。 */
function isPlainEventName(name: string): boolean {
  return PLAIN.test(name) && !PARAMETERIZED.test(name);
}

/** 取一个必须可调用的成员；不可调用时按种类报错。 */
function requireCallable(
  value: unknown,
  label: "Event" | "Method",
  key: string,
): (...input: any[]) => any {
  if (typeof value !== "function") {
    throw new Error(`${label} not found: ${key}`);
  }
  return value as (...input: any[]) => any;
}

export function serverChannelFromService<TContext>(service: unknown): IServerChannel<TContext> {
  const members = service as Record<string, unknown>;
  const bridged = new Map<string, Event<unknown>>();

  // 先把全部无参事件桥接好：调用方可以在任意时刻订阅任意已声明的事件。
  for (const [name, member] of Object.entries(members)) {
    if (isPlainEventName(name) && typeof member === "function") {
      bridged.set(name, createEventBridge(member as Event<unknown>));
    }
  }

  const listen = <T>(_ctx: TContext, name: string, arg?: unknown): Event<T> => {
    const cached = bridged.get(name);
    if (cached !== undefined) {
      return cached as Event<T>;
    }
    const member = members[name];
    // 带参事件不进缓存：同名不同参数是不同话题。
    if (PARAMETERIZED.test(name)) {
      return requireCallable(member, "Event", name).call(members, arg) as Event<T>;
    }
    if (isPlainEventName(name)) {
      // 运行时才出现的事件：与构造期登记走同一条路径。
      const fresh = createEventBridge(requireCallable(member, "Event", name) as Event<unknown>);
      bridged.set(name, fresh);
      return fresh as Event<T>;
    }
    throw new Error(`Event not found: ${name}`);
  };

  const call = <T>(_ctx: TContext, command: string, args?: any[]): Promise<T> => {
    const method = requireCallable(members[command], "Method", command);
    const outcome = method.apply(members, args ?? []);
    // 同步返回值也包成 promise：调用方只面对一种结算形状。
    return (outcome instanceof Promise ? outcome : Promise.resolve(outcome)) as Promise<T>;
  };

  return { listen, call };
}
