// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

import { Emitter, type DisposableStore, type Event, type IDisposable } from "./foundation.js";
import type { IChannel, IServerChannel } from "./channels.js";

const PLAIN_EVENT = /^on[A-Z]/u;
const PARAMETER_EVENT = /^onDynamic[A-Z]/u;

type AnyCallable = (...input: any[]) => any;

function requireCallable(value: unknown, label: "Event" | "Method", key: string): AnyCallable {
  if (typeof value !== "function") {
    throw new Error(`${label} not found: ${key}`);
  }
  return value as AnyCallable;
}

/**
 * A buffered view over an event source. Values produced while the relay is
 * still collecting are held until somebody subscribes; once the first
 * subscription has drained the queue, later values pass straight through.
 */
class BufferedEventRelay<T> {
  private readonly held: T[] = [];
  private readonly emitter: Emitter<T>;
  private upstream: IDisposable | undefined;
  private pumping = false;

  constructor(origin: Event<T>) {
    this.emitter = new Emitter<T>({
      onWillAddFirstListener: () => {
        this.upstream = origin((value) => this.receive(value));
      },
      onDidRemoveLastListener: () => {
        this.upstream?.dispose();
        this.upstream = undefined;
        this.held.length = 0;
      },
    });
  }

  readonly event: Event<T> = (listener) => {
    const handle = this.emitter.event(listener);
    if (!this.pumping) {
      this.pumping = true;
      const queued = this.held.splice(0);
      for (const value of queued) {
        this.emitter.fire(value);
      }
    }
    return handle;
  };

  private receive(value: T): void {
    if (this.pumping) {
      this.emitter.fire(value);
    } else {
      this.held.push(value);
    }
  }
}

function relayed<T>(origin: Event<T>): Event<T> {
  return new BufferedEventRelay(origin).event;
}

function serverChannelFor<TContext>(service: unknown): IServerChannel<TContext> {
  const members = service as Record<string, unknown>;
  const cachedEvents = new Map<string, Event<unknown>>();

  for (const key in members) {
    const member = members[key];
    if (typeof member === "function" && PLAIN_EVENT.test(key) && !PARAMETER_EVENT.test(key)) {
      cachedEvents.set(key, relayed(member as Event<unknown>));
    }
  }

  const listen = <T>(_ctx: TContext, name: string, arg?: unknown): Event<T> => {
    const known = cachedEvents.get(name);
    if (known !== undefined) {
      return known as Event<T>;
    }
    const member = members[name];
    if (!PARAMETER_EVENT.test(name)) {
      if (!PLAIN_EVENT.test(name)) {
        throw new Error(`Event not found: ${name}`);
      }
      const wrapped = relayed(requireCallable(member, "Event", name) as Event<unknown>);
      cachedEvents.set(name, wrapped);
      return wrapped as Event<T>;
    }
    const dynamic = requireCallable(member, "Event", name);
    return dynamic.call(members, arg) as Event<T>;
  };

  const call = <T>(_ctx: TContext, command: string, args?: any[]): Promise<T> => {
    const method = requireCallable(members[command], "Method", command);
    const outcome = method.apply(members, args || []);
    return (outcome instanceof Promise ? outcome : Promise.resolve(outcome)) as Promise<T>;
  };

  return { listen, call };
}

function createServiceProxy<T extends object>(
  channel: IChannel,
  options?: { context?: unknown },
): T {
  return new Proxy({} as T, {
    get(target, key, receiver) {
      if (typeof key !== "string") {
        return Reflect.get(target, key, receiver);
      }
      switch (key) {
        case "then":
          return undefined;
        default:
          break;
      }
      if (PARAMETER_EVENT.test(key)) {
        return (arg: unknown) => channel.listen(key, arg);
      }
      if (PLAIN_EVENT.test(key)) {
        return channel.listen(key);
      }
      return async (...args: unknown[]) => {
        const withContext = options?.context === undefined ? args : [options.context, ...args];
        return channel.call(key, withContext);
      };
    },
  });
}

export namespace ProxyChannel {
  export function fromService<TContext>(
    service: unknown,
    _disposables?: DisposableStore,
  ): IServerChannel<TContext> {
    return serverChannelFor<TContext>(service);
  }

  export function toService<T extends object>(
    channel: IChannel,
    options?: { context?: unknown },
  ): T {
    return createServiceProxy<T>(channel, options);
  }
}
