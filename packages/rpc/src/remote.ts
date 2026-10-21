// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { Emitter, toDisposable, type IDisposable } from "./foundation.js";
import type { ISocket } from "./protocol.js";
import { PersistentProtocol } from "./persistent-protocol.js";
import { IPCClient } from "./ipc.js";

/**
 * 连接类型编号是线上事实：WebSocket=0、Managed=1。用冻结常量对象代替 enum，
 * 读取方式（`RemoteConnectionType.Managed`）与取值不变。
 */
export const RemoteConnectionType = Object.freeze({ WebSocket: 0 as const, Managed: 1 as const });

export type RemoteConnectionType = (typeof RemoteConnectionType)[keyof typeof RemoteConnectionType];

/** 描述串由调用方拼装：`<kind>(<part>[:<part>...])`。 */
function describe(kind: string, ...parts: Array<string | number>): string {
  return `${kind}(${parts.join(":")})`;
}

/** 直连某台主机的 socket；`host:port` 只用于描述。 */
export class WebSocketRemoteConnection {
  readonly host: string;
  readonly port: number;
  readonly type = RemoteConnectionType.WebSocket;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  toString(): string {
    return describe("WebSocket", this.host, this.port);
  }
}

/** 由服务端托管的连接，只携带一个不透明 id。 */
export class ManagedRemoteConnection {
  readonly id: number;
  readonly type = RemoteConnectionType.Managed;

  constructor(id: number) {
    this.id = id;
  }

  toString(): string {
    return describe("Managed", this.id);
  }
}

export type RemoteConnection = ManagedRemoteConnection | WebSocketRemoteConnection;

export type ResolvedAuthority = Readonly<{
  authority: string;
  connectTo: RemoteConnection;
  connectionToken: string | undefined;
}>;

export type IRemoteAuthorityResolver = {
  resolve: (authority: string) => Promise<ResolvedAuthority>;
};

/** authority 的 type 是第一个 `+` 之前的前缀；没有 `+` 时整个字符串就是 type。 */
function authorityType(authority: string): string {
  const separator = authority.indexOf("+");
  return separator === -1 ? authority : authority.slice(0, separator);
}

export class RemoteAuthorityResolverService {
  readonly #resolvers = new Map<string, IRemoteAuthorityResolver>();

  registerResolver(type: string, resolver: IRemoteAuthorityResolver): IDisposable {
    this.#resolvers.set(type, resolver);
    return toDisposable(() => {
      this.#resolvers.delete(type);
    });
  }

  resolveAuthority(authority: string): Promise<ResolvedAuthority> {
    const type = authorityType(authority);
    const resolver = this.#resolvers.get(type);
    if (resolver === undefined) {
      return Promise.reject(new Error(`No resolver registered for remote type: ${type}`));
    }
    return resolver.resolve(authority);
  }
}

export type ISocketFactory<T extends RemoteConnectionType = RemoteConnectionType> = {
  supports: (connectTo: RemoteConnection & { type: T }) => boolean;
  connect: (
    connectTo: RemoteConnection & { type: T },
    path: string,
    query: string,
  ) => Promise<ISocket>;
};

/** 注册表里保存的是擦掉类型参数后的统一视图，按 type 分派时不需要再判断具体连接子类。 */
type Registration = {
  readonly type: RemoteConnectionType;
  readonly accepts: (connectTo: RemoteConnection) => boolean;
  readonly open: (connectTo: RemoteConnection, path: string, query: string) => Promise<ISocket>;
};

export class RemoteSocketFactoryService {
  readonly #registrations: Registration[] = [];

  register<T extends RemoteConnectionType>(type: T, factory: ISocketFactory<T>): IDisposable {
    const registration: Registration = {
      type,
      accepts: (connectTo) => factory.supports(connectTo as RemoteConnection & { type: T }),
      open: (connectTo, path, query) =>
        factory.connect(connectTo as RemoteConnection & { type: T }, path, query),
    };
    this.#registrations.push(registration);
    return toDisposable(() => {
      const index = this.#registrations.indexOf(registration);
      if (index !== -1) this.#registrations.splice(index, 1);
    });
  }

  connect(connectTo: RemoteConnection, path: string, query: string): Promise<ISocket> {
    const registration = this.#registrations.find(
      (candidate) => candidate.type === connectTo.type && candidate.accepts(connectTo),
    );
    return registration
      ? registration.open(connectTo, path, query)
      : Promise.reject(new Error(`No socket factory found for ${connectTo.toString()}`));
  }
}

export type SimpleURI = { scheme: string; authority: string; path: string };

export type IURITransformer = {
  transformIncoming: (uri: SimpleURI) => SimpleURI;
  transformOutgoing: (uri: SimpleURI) => SimpleURI;
};

const FILE_SCHEME = "file";
const REMOTE_SCHEME = "vscode-remote";
const LOOPBACK_SCHEME = "vscode-local";

function asLocal(uri: SimpleURI): SimpleURI {
  return { scheme: FILE_SCHEME, authority: "", path: uri.path };
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
  return {
    transformIncoming: (uri) => {
      switch (uri.scheme) {
        case REMOTE_SCHEME:
          return uri.authority === remoteAuthority ? asLocal(uri) : uri;
        case FILE_SCHEME:
          return { scheme: LOOPBACK_SCHEME, authority: "", path: uri.path };
        default:
          return uri;
      }
    },
    transformOutgoing: (uri) => {
      switch (uri.scheme) {
        case FILE_SCHEME:
          return { scheme: REMOTE_SCHEME, authority: remoteAuthority, path: uri.path };
        case LOOPBACK_SCHEME:
          return asLocal(uri);
        default:
          return uri;
      }
    },
  };
}

const RECONNECT_DELAYS = [0, 5, 5, 10, 10, 10, 10, 10, 30];

export type RemoteConnectionState = { type: "connected" | "reconnecting" | "disconnected" };

function queryFor(resolved: ResolvedAuthority): string {
  return resolved.connectionToken ? `token=${resolved.connectionToken}` : "";
}

function pause(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export class RemoteAgentConnection implements IDisposable {
  readonly #authority: string;
  readonly #resolverService: RemoteAuthorityResolverService;
  readonly #socketFactory: RemoteSocketFactoryService;
  readonly #stateEmitter = new Emitter<RemoteConnectionState>();
  #protocol: PersistentProtocol | undefined;
  #client: IPCClient<string> | undefined;

  readonly onDidStateChange = this.#stateEmitter.event;

  constructor(
    authority: string,
    resolverService: RemoteAuthorityResolverService,
    socketFactory: RemoteSocketFactoryService,
  ) {
    this.#authority = authority;
    this.#resolverService = resolverService;
    this.#socketFactory = socketFactory;
  }

  async connect(): Promise<IPCClient<string>> {
    const resolved = await this.#resolverService.resolveAuthority(this.#authority);
    const socket = await this.#socketFactory.connect(resolved.connectTo, "/", queryFor(resolved));

    const protocol = new PersistentProtocol(socket);
    const client = new IPCClient(protocol, this.#authority);
    this.#protocol = protocol;
    this.#client = client;

    protocol.onSocketClose(() => {
      this.#stateEmitter.fire({ type: "reconnecting" });
      void this.#reconnect(resolved);
    });
    this.#stateEmitter.fire({ type: "connected" });
    return client;
  }

  /** 按 RECONNECT_DELAYS 逐次尝试；全部失败才宣告 disconnected。 */
  async #reconnect(resolved: ResolvedAuthority): Promise<void> {
    for (const seconds of RECONNECT_DELAYS) {
      await pause(seconds);
      try {
        const socket = await this.#socketFactory.connect(
          resolved.connectTo,
          "/",
          queryFor(resolved),
        );
        this.#protocol?.replaceSocket(socket);
        this.#stateEmitter.fire({ type: "connected" });
        return;
      } catch {
        // 单次重连失败不改变整体状态：继续按数组里的下一档等待。
      }
    }
    this.#stateEmitter.fire({ type: "disconnected" });
  }

  dispose(): void {
    this.#client?.dispose();
    this.#protocol?.dispose();
    this.#stateEmitter.dispose();
  }
}
