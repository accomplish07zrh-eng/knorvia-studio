import { Emitter, toDisposable, type IDisposable } from "./foundation.js";
import type { ISocket } from "./protocol.js";
import { PersistentProtocol } from "./persistent-protocol.js";
import { IPCClient } from "./ipc.js";

export enum RemoteConnectionType {
  WebSocket = 0,
  Managed = 1,
}

export class WebSocketRemoteConnection {
  readonly type = RemoteConnectionType.WebSocket;

  constructor(
    public readonly host: string,
    public readonly port: number,
  ) {}

  toString(): string {
    return `WebSocket(${this.host}:${this.port})`;
  }
}

export class ManagedRemoteConnection {
  readonly type = RemoteConnectionType.Managed;

  constructor(public readonly id: number) {}

  toString(): string {
    return `Managed(${this.id})`;
  }
}

export type RemoteConnection = WebSocketRemoteConnection | ManagedRemoteConnection;

export interface ResolvedAuthority {
  readonly authority: string;
  readonly connectTo: RemoteConnection;
  readonly connectionToken: string | undefined;
}

export interface IRemoteAuthorityResolver {
  resolve(authority: string): Promise<ResolvedAuthority>;
}

export class RemoteAuthorityResolverService {
  private readonly resolvers = new Map<string, IRemoteAuthorityResolver>();

  registerResolver(type: string, resolver: IRemoteAuthorityResolver): IDisposable {
    this.resolvers.set(type, resolver);
    return toDisposable(() => this.resolvers.delete(type));
  }

  async resolveAuthority(authority: string): Promise<ResolvedAuthority> {
    const separator = authority.indexOf("+");
    const type = separator >= 0 ? authority.substring(0, separator) : authority;
    const resolver = this.resolvers.get(type);
    if (!resolver) {
      throw new Error(`No resolver registered for remote type: ${type}`);
    }
    return resolver.resolve(authority);
  }
}

export interface ISocketFactory<T extends RemoteConnectionType = RemoteConnectionType> {
  supports(connectTo: RemoteConnection & { type: T }): boolean;
  connect(connectTo: RemoteConnection & { type: T }, path: string, query: string): Promise<ISocket>;
}

export class RemoteSocketFactoryService {
  private readonly factories = new Map<RemoteConnectionType, ISocketFactory[]>();

  register<T extends RemoteConnectionType>(type: T, factory: ISocketFactory<T>): IDisposable {
    if (!this.factories.has(type)) {
      this.factories.set(type, []);
    }
    this.factories.get(type)!.push(factory as ISocketFactory);
    return toDisposable(() => {
      const current = this.factories.get(type);
      if (current) {
        const index = current.indexOf(factory as ISocketFactory);
        if (index >= 0) {
          current.splice(index, 1);
        }
      }
    });
  }

  async connect(connectTo: RemoteConnection, path: string, query: string): Promise<ISocket> {
    const candidates = this.factories.get(connectTo.type) || [];
    const factory = candidates.find((candidate) => candidate.supports(connectTo as any));
    if (!factory) {
      throw new Error(`No socket factory found for ${connectTo}`);
    }
    return factory.connect(connectTo as any, path, query);
  }
}

export interface SimpleURI {
  scheme: string;
  authority: string;
  path: string;
}

export interface IURITransformer {
  transformIncoming(uri: SimpleURI): SimpleURI;
  transformOutgoing(uri: SimpleURI): SimpleURI;
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
  return {
    transformIncoming(uri: SimpleURI): SimpleURI {
      if (uri.scheme === "vscode-remote" && uri.authority === remoteAuthority) {
        return { scheme: "file", authority: "", path: uri.path };
      } else if (uri.scheme === "file") {
        return { scheme: "vscode-local", authority: "", path: uri.path };
      }
      return uri;
    },
    transformOutgoing(uri: SimpleURI): SimpleURI {
      if (uri.scheme === "file") {
        return { scheme: "vscode-remote", authority: remoteAuthority, path: uri.path };
      } else if (uri.scheme === "vscode-local") {
        return { scheme: "file", authority: "", path: uri.path };
      }
      return uri;
    },
  };
}

const RECONNECT_DELAYS = [0, 5, 5, 10, 10, 10, 10, 10, 30];

export interface RemoteConnectionState {
  type: "connected" | "reconnecting" | "disconnected";
}

export class RemoteAgentConnection implements IDisposable {
  private protocol: PersistentProtocol | null = null;
  private client: IPCClient<string> | null = null;
  private readonly stateEmitter = new Emitter<RemoteConnectionState>();
  readonly onDidStateChange = this.stateEmitter.event;

  constructor(
    private readonly authority: string,
    private readonly resolverService: RemoteAuthorityResolverService,
    private readonly socketFactory: RemoteSocketFactoryService,
  ) {}

  async connect(): Promise<IPCClient<string>> {
    const resolved = await this.resolverService.resolveAuthority(this.authority);
    const query = resolved.connectionToken ? `token=${resolved.connectionToken}` : "";
    const socket = await this.socketFactory.connect(resolved.connectTo, "/", query);
    this.protocol = new PersistentProtocol(socket);
    this.client = new IPCClient(this.protocol, this.authority);
    this.protocol.onSocketClose(() => {
      this.stateEmitter.fire({ type: "reconnecting" });
      this.reconnect(resolved, 0);
    });
    this.stateEmitter.fire({ type: "connected" });
    return this.client;
  }

  private async reconnect(resolved: ResolvedAuthority, attempt: number): Promise<void> {
    if (attempt >= RECONNECT_DELAYS.length) {
      this.stateEmitter.fire({ type: "disconnected" });
      return;
    }
    const delay = RECONNECT_DELAYS[attempt] * 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    try {
      const query = resolved.connectionToken ? `token=${resolved.connectionToken}` : "";
      const newSocket = await this.socketFactory.connect(resolved.connectTo, "/", query);
      this.protocol!.replaceSocket(newSocket);
      this.stateEmitter.fire({ type: "connected" });
    } catch {
      this.reconnect(resolved, attempt + 1);
    }
  }

  dispose(): void {
    this.client?.dispose();
    this.protocol?.dispose();
    this.stateEmitter.dispose();
  }
}
