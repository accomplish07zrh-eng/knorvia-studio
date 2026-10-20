// SPDX-License-Identifier: Apache-2.0
// 服务对象 ↔ channel 的双向适配（`ProxyChannel` 命名空间）。
//
// 结构：三段职责，全部在本文件内，因为它们是同一件事的三个面，且互相只差一步——
//   1. 名字分类：判定一个成员名是无参事件、带参事件还是方法；
//   2. 事件桥接：把上游 Event 包成本地 Event，并暂存「无人订阅时」到达的值；
//   3. 视图代理：把属性访问翻译成 call/listen。
// 早期实现把这些散成若干个内部类，读的时候必须来回跳；此处改成「一张名字表 + 两个
// 纯函数 + 一次 Proxy 构造」，三段之间没有共享可变状态。
import { Emitter, type DisposableStore, type Event, type IDisposable } from "./foundation.js";
import type { IChannel, IServerChannel } from "./channels.js";

/** 成员名分类结果。 */
const MEMBER = {
  parameterizedEvent: "parameterized-event",
  plainEvent: "plain-event",
  method: "method",
  field: "field",
} as const;

type MemberKind = (typeof MEMBER)[keyof typeof MEMBER];

/**
 * 名字分类规则（按顺序匹配，前者优先）。
 *
 * 带参事件必须先于无参事件：`onDynamicFoo` 同时也满足 `on*` 的形状，
 * 顺序反过来会把它误判成无参事件、丢掉工厂参数。
 */
const NAME_RULES: ReadonlyArray<{ readonly kind: MemberKind; readonly test: RegExp }> = [
  { kind: MEMBER.parameterizedEvent, test: /^onDynamic[A-Z]/u },
  { kind: MEMBER.plainEvent, test: /^on[A-Z]/u },
];

/** 判定一个成员属于哪一类。 */
function classifyMember(name: string, value: unknown): MemberKind {
  if (typeof value !== "function") {
    return MEMBER.field;
  }
  for (const rule of NAME_RULES) {
    if (rule.test.test(name)) {
      return rule.kind;
    }
  }
  return MEMBER.method;
}

/** 取一个必须可调用的成员；不可调用时按种类报错（文案对外可观察）。 */
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

/**
 * 事件桥：上游 Event ⇄ 本地 Event，暂存「还没人订阅时到达」的值。
 *
 * 拆成三个阶段函数，各自只做一件事：
 *   `connect`   —— 订阅上游，把值按闸门状态分流；
 *   `detach`    —— 断开上游并清空暂存；
 *   `flushInto` —— 开门并补发暂存（首次订阅时调用一次）。
 */
function bridgeEvent<T>(origin: Event<T>): Event<T> {
  const backlog: T[] = [];
  let open = false;
  let upstream: IDisposable | undefined;

  const connect = (deliver: (value: T) => void): void => {
    upstream = origin((value) => {
      if (open) {
        deliver(value);
      } else {
        backlog.push(value);
      }
    });
  };

  const detach = (): void => {
    upstream?.dispose();
    upstream = undefined;
    backlog.length = 0;
    open = false;
  };

  const flushInto = (deliver: (value: T) => void): void => {
    if (open) {
      return;
    }
    // 先开门再补发：顺序反过来时，补发过程中新到达的值会走直通分支插到队列之前。
    open = true;
    for (const value of backlog.splice(0)) {
      deliver(value);
    }
  };

  const hub = new Emitter<T>({
    onWillAddFirstListener: () => connect((value) => hub.fire(value)),
    onDidRemoveLastListener: detach,
  });

  return (listener) => {
    const subscription = hub.event(listener);
    flushInto((value) => hub.fire(value));
    return subscription;
  };
}

/**
 * 服务对象 → 服务端 channel。
 *
 * 无参事件按名字缓存桥接结果：同一个 `onFoo` 被订阅两次应拿到同一条流，
 * 每次新建会让两条订阅各收一份上游事件。
 */
function serverChannelFromService<TContext>(service: unknown): IServerChannel<TContext> {
  const members = service as Record<string, unknown>;
  const bridged = new Map<string, Event<unknown>>();

  // 先把全部无参事件桥接好：调用方可以在任意时刻订阅任意已声明事件。
  for (const [name, member] of Object.entries(members)) {
    if (classifyMember(name, member) === MEMBER.plainEvent) {
      bridged.set(name, bridgeEvent(member as Event<unknown>));
    }
  }

  const listen = <T>(_ctx: TContext, name: string, arg?: unknown): Event<T> => {
    const cached = bridged.get(name);
    if (cached !== undefined) {
      return cached as Event<T>;
    }
    const member = members[name];
    const kind = classifyMember(name, member);
    // 带参事件不缓存：同名不同参数是不同话题。
    if (kind === MEMBER.parameterizedEvent) {
      return requireCallable(member, "Event", name).call(members, arg) as Event<T>;
    }
    if (kind === MEMBER.plainEvent) {
      const fresh = bridgeEvent(requireCallable(member, "Event", name) as Event<unknown>);
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

/**
 * channel → 服务对象 Proxy。
 *
 * `then` 必须返回 `undefined`：否则 `await proxy` 会把它当 thenable 去调 `call("then")`。
 *
 * `context` **每次调用时读取**（不是在这里捕获成常量）：调用方可能传入一个可变持有者，
 * 并在构造后替换其中的 context——捕获快照会让后续调用一直用旧值（契约 B12）。
 */
function serviceViewFromChannel<T extends object>(
  channel: IChannel,
  options?: { context?: unknown },
): T {
  const withScope = (args: unknown[]): unknown[] => {
    const context = options?.context;
    return context === undefined ? args : [context, ...args];
  };

  const handler: ProxyHandler<object> = {
    get(target, key, receiver): unknown {
      if (typeof key !== "string") {
        return Reflect.get(target, key, receiver);
      }
      if (key === "then") {
        return undefined;
      }
      if (NAME_RULES[0].test.test(key)) {
        return (arg: unknown) => channel.listen(key, arg);
      }
      if (NAME_RULES[1].test.test(key)) {
        return channel.listen(key);
      }
      return (...args: unknown[]): Promise<unknown> => channel.call(key, withScope(args));
    },
  };

  return new Proxy({} as T, handler) as T;
}

/**
 * 对外入口。
 *
 * 用对象常量而不是 `namespace`：两者导出面等价（`ProxyChannel.fromService` / `toService`），
 * 但常量形式让「入口是两个函数」这件事一目了然，也避免 namespace 带来的合并语义。
 */
export const ProxyChannel = {
  /** 服务对象 → 服务端 channel；第二个参数是历史调用点留下的占位，实现不使用。 */
  fromService<TContext>(
    service: unknown,
    _disposables?: DisposableStore,
  ): IServerChannel<TContext> {
    return serverChannelFromService<TContext>(service);
  },

  /** channel → 服务对象；`options.context` 会前置到每次调用的参数前。 */
  toService<T extends object>(channel: IChannel, options?: { context?: unknown }): T {
    return serviceViewFromChannel<T>(channel, options);
  },
};
