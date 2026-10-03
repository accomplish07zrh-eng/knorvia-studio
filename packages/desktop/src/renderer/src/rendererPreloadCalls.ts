import type { IPlatformService } from "@knorvia/shared";

type Callable = (...args: never[]) => unknown;
type PreloadCallKey = {
  [Key in keyof IPlatformService]-?: NonNullable<IPlatformService[Key]> extends Callable
    ? Key
    : never;
}[keyof IPlatformService];
type PlatformCall<Key extends PreloadCallKey> = Extract<IPlatformService[Key], Callable>;
type Arity = 0 | 1 | 2 | 3;
type PreloadSurface = Partial<Record<PreloadCallKey, Callable>>;

/** Invocation policy only; native authority and all mutable state stay in preload. */
export class RendererPreloadCalls {
  required<Key extends PreloadCallKey>(key: Key, arity: Arity): PlatformCall<Key> {
    return this.route(key, arity, false);
  }

  optional<Key extends PreloadCallKey>(
    key: Key,
    arity: Arity,
    fallback?: () => ReturnType<PlatformCall<Key>>,
  ): PlatformCall<Key> {
    return this.route(key, arity, true, fallback);
  }

  capability<Key extends PreloadCallKey>(
    key: Key,
    call: PlatformCall<Key>,
  ): PlatformCall<Key> | undefined {
    const preload = window.knorvia as unknown as PreloadSurface;
    return preload[key] ? call : undefined;
  }

  private route<Key extends PreloadCallKey>(
    key: Key,
    arity: Arity,
    optional: boolean,
    fallback?: () => ReturnType<PlatformCall<Key>>,
  ): PlatformCall<Key> {
    const invoke = (args: unknown[]) => {
      const preload = window.knorvia as unknown as PreloadSurface;
      const method = preload[key];
      const value = optional && method == null
        ? undefined
        : Reflect.apply(method!, preload, args);
      return value == null && fallback ? fallback() : value;
    };
    // Fixed wrappers preserve both positional undefined and public call arity.
    switch (arity) {
      case 0: return (() => invoke([])) as PlatformCall<Key>;
      case 1: return ((first: unknown) => invoke([first])) as PlatformCall<Key>;
      case 2: return ((first: unknown, second: unknown) => invoke([first, second])) as PlatformCall<Key>;
      case 3: return ((first: unknown, second: unknown, third: unknown) => invoke([first, second, third])) as PlatformCall<Key>;
    }
  }
}
