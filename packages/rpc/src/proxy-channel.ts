import { Event, Emitter, type IDisposable, type DisposableStore } from "./foundation.js";
import type { IChannel, IServerChannel } from "./channels.js";

function isEventName(name: string): boolean {
  if (name.length < 3 || name[0] !== "o" || name[1] !== "n") {
    return false;
  }
  const initial = name.charCodeAt(2);
  return initial >= 65 && initial <= 90;
}

function isDynamicEventName(name: string): boolean {
  if (name.length < 10 || !name.startsWith("onDynamic")) {
    return false;
  }
  const initial = name.charCodeAt(9);
  return initial >= 65 && initial <= 90;
}

function bufferEvent<T>(source: Event<T>): Event<T> {
  let pending: T[] = [];
  let flushing = false;
  let upstream: IDisposable | undefined;

  const emitter = new Emitter<T>({
    onWillAddFirstListener: () => {
      upstream = source((value) => {
        if (flushing) {
          emitter.fire(value);
        } else {
          pending.push(value);
        }
      });
    },
    onDidRemoveLastListener: () => {
      upstream?.dispose();
      upstream = undefined;
      pending = [];
    },
  });

  const subscribe = emitter.event;
  return (listener) => {
    const subscription = subscribe(listener);
    if (!flushing) {
      flushing = true;
      for (const value of pending) {
        emitter.fire(value);
      }
      pending = [];
    }
    return subscription;
  };
}

export namespace ProxyChannel {
  export function fromService<TContext>(
    service: unknown,
    _disposables?: DisposableStore,
  ): IServerChannel<TContext> {
    const handler = service as { [key: string]: unknown };
    const eventMap = new Map<string, Event<unknown>>();

    for (const name in handler) {
      if (isEventName(name) && !isDynamicEventName(name) && typeof handler[name] === "function") {
        eventMap.set(name, bufferEvent(handler[name] as Event<unknown>));
      }
    }

    return {
      listen<T>(_context: TContext, name: string, arg?: unknown): Event<T> {
        const cached = eventMap.get(name);
        if (cached) {
          return cached as Event<T>;
        }

        const member = handler[name];
        if (typeof member === "function") {
          if (isDynamicEventName(name)) {
            return member.call(handler, arg) as Event<T>;
          }
          if (isEventName(name)) {
            eventMap.set(name, bufferEvent(handler[name] as Event<unknown>));
            return eventMap.get(name) as Event<T>;
          }
        }
        throw new Error("Event not found: " + name);
      },

      call<T>(_context: TContext, command: string, args?: any[]): Promise<T> {
        const member = handler[command];
        if (typeof member !== "function") {
          throw new Error("Method not found: " + command);
        }
        let result = member.apply(handler, args || []);
        if (!(result instanceof Promise)) {
          result = Promise.resolve(result);
        }
        return result as Promise<T>;
      },
    };
  }

  export function toService<T extends object>(
    channel: IChannel,
    options?: { context?: unknown },
  ): T {
    return new Proxy({} as T, {
      get(target: T, key: PropertyKey, receiver: object) {
        if (typeof key !== "string") {
          return Reflect.get(target as object, key, receiver);
        }
        if (key === "then") {
          return undefined;
        }
        if (isDynamicEventName(key)) {
          return (arg: unknown) => channel.listen(key, arg);
        }
        if (isEventName(key)) {
          return channel.listen(key);
        }
        return async (...args: unknown[]) => {
          const methodArgs = options?.context !== undefined ? [options.context, ...args] : args;
          return channel.call(key, methodArgs);
        };
      },
    });
  }
}
