// SPDX-License-Identifier: Apache-2.0
// 服务对象 Proxy：把属性访问翻译成 channel 调用或订阅。
//
// 规则很短但有三处容易踩：
//   1. `then` 必须返回 `undefined`，否则 `await proxy` 会把普通对象当 thenable；
//   2. 带参事件（`onDynamic*`）访问时返回工厂，由调用方传参后订阅；
//   3. 其余函数一律转成 `call`，参数前可选地补一个 context。
import type { IChannel } from "./channels.js";

/** 带参事件的成员名模式（优先级高于下面的无参事件）。 */
const PARAMETERIZED_EVENT = /^onDynamic[A-Z]/u;

/** 无参事件的成员名模式。 */
const PLAIN_EVENT = /^on[A-Z]/u;

/**
 * 建一个服务对象 Proxy。
 *
 * 每次属性访问都即时构造，不缓存：channel 是无状态的转发面，
 * 缓存会让「换 channel 实例」这种操作后的旧句柄继续活着。
 */
export function createServiceProxy<T extends object>(
  channel: IChannel,
  options?: { context?: unknown },
): T {
  const prependContext = (args: unknown[]): unknown[] =>
    options?.context === undefined ? args : [options.context, ...args];

  const handler: ProxyHandler<object> = {
    get(target, key, receiver): unknown {
      // 符号键（`Symbol.iterator` 等）交给目标对象，不做翻译。
      if (typeof key !== "string") {
        return Reflect.get(target, key, receiver);
      }
      // 见文件头第 1 条：阻止 await 把 Proxy 当 thenable。
      if (key === "then") {
        return undefined;
      }
      if (PARAMETERIZED_EVENT.test(key)) {
        return (arg: unknown) => channel.listen(key, arg);
      }
      if (PLAIN_EVENT.test(key)) {
        return channel.listen(key);
      }
      return (...args: unknown[]): Promise<unknown> => channel.call(key, prependContext(args));
    },
  };

  // `Proxy` 的返回类型是 `object`，而 T 受限于 `object` 的具体子类型，
  // 因此这里必须显式断言：Proxy 的形态由 handler 决定，编译期无法表达。
  return new Proxy({} as T, handler) as T;
}
