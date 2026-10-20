// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

/**
 * 示例 4：远程连接。
 *
 * 走一遍 Remote 的装配顺序：authority 交给 resolver 解析出 host/port，
 * socket 工厂据此返回一对内存 socket，再用 SocketProtocol 给它们套上
 * 13 字节帧头，最后在上面挂 ChannelServer / ChannelClient。
 * 末尾用 URI 变换器对照客户端与服务端各自看到的路径。
 */

import { toDisposable } from "../src/index.js";
import {
  ChannelClient,
  ChannelServer,
  DisposableStore,
  Emitter,
  Event,
  ProxyChannel,
  RemoteAuthorityResolverService,
  RemoteConnectionType,
  RemoteSocketFactoryService,
  SocketProtocol,
  VSBuffer,
  WebSocketRemoteConnection,
  createURITransformer,
  type IChannel,
  type IRemoteAuthorityResolver,
  type ISocket,
  type ISocketFactory,
  type RemoteConnection,
  type ResolvedAuthority,
  type SimpleURI,
} from "../src/index.js";

type ChangeRecord = { path: string; type: "created" | "changed" };

interface RemoteFiles {
  onDidChangeFile: Event<ChangeRecord>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stat(path: string): Promise<{ size: number; isDirectory: boolean }>;
}

const PROJECT_ROOT = "/home/user/project";

const INITIAL_FILES: ReadonlyArray<readonly [string, string]> = [
  [`${PROJECT_ROOT}/main.ts`, 'console.log("Hello from remote!")'],
  [`${PROJECT_ROOT}/package.json`, '{"name": "my-project", "version": "1.0.0"}'],
  [`${PROJECT_ROOT}/README.md`, "# My Project\nRunning on remote server."],
];

/** 内存 socket：写入在一个微任务后到达对端，避免重入同一调用栈。 */
class MemorySocket implements ISocket {
  readonly #data = new Emitter<VSBuffer>();
  readonly #close = new Emitter<void>();
  readonly #end = new Emitter<void>();
  #peer: MemorySocket | undefined;
  #closed = false;

  readonly onData = this.#data.event;
  readonly onClose = this.#close.event;
  readonly onEnd = this.#end.event;

  static pair(): [MemorySocket, MemorySocket] {
    const left = new MemorySocket();
    const right = new MemorySocket();
    left.#peer = right;
    right.#peer = left;
    return [left, right];
  }

  write(buffer: VSBuffer): void {
    if (this.#closed) {
      return;
    }
    queueMicrotask(() => this.#peer?.deliver(buffer));
  }

  /** 供对端调用，绕过封闭字段的可见性限制。 */
  deliver(buffer: VSBuffer): void {
    this.#data.fire(buffer);
  }

  end(): void {
    this.#end.fire();
    const peer = this.#peer;
    if (peer) {
      peer.#end.fire();
    }
  }

  drain(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#close.fire();
    this.#data.dispose();
    this.#close.dispose();
    this.#end.dispose();
  }
}

/** SSH 风格的 authority 解析器：表里查 host/port，并回显解析过程。 */
class SshResolver implements IRemoteAuthorityResolver {
  readonly #hosts = new Map<string, { host: string; port: number }>([
    ["ssh+myserver", { host: "192.168.1.100", port: 8080 }],
    ["ssh+devbox", { host: "10.0.0.50", port: 8080 }],
  ]);

  resolve(authority: string): Promise<ResolvedAuthority> {
    const endpoint = this.#hosts.get(authority);
    if (!endpoint) {
      return Promise.reject(new Error(`Unknown SSH host: ${authority}`));
    }
    console.log(`  [SSH Resolver] Resolving "${authority}" → ${endpoint.host}:${endpoint.port}`);
    return Promise.resolve({
      authority,
      connectTo: new WebSocketRemoteConnection(endpoint.host, endpoint.port),
      connectionToken: `mock-token-${authority}`,
    });
  }
}

/** 每次 connect 都新开一对内存 socket，并把服务端那半存起来交给本示例。 */
class LoopbackSocketFactory implements ISocketFactory {
  readonly accepted: MemorySocket[] = [];

  supports(connectTo: RemoteConnection): boolean {
    return connectTo.type === RemoteConnectionType.WebSocket;
  }

  connect(connectTo: RemoteConnection, path: string, query: string): Promise<ISocket> {
    if (connectTo.type !== RemoteConnectionType.WebSocket) {
      return Promise.reject(new Error("LoopbackSocketFactory only handles WebSocket peers"));
    }
    console.log(
      `  [Socket Factory] ${connectTo.host}:${connectTo.port}${path}?${query || "(no token)"}`,
    );
    const [caller, callee] = MemorySocket.pair();
    this.accepted.push(callee);
    return Promise.resolve(caller);
  }
}

/** 远端机器上的文件系统实现。 */
class RemoteFileSystem implements RemoteFiles {
  readonly #files = new Map<string, string>(INITIAL_FILES);
  readonly #changes = new Emitter<ChangeRecord>();
  readonly onDidChangeFile = this.#changes.event;

  readFile(path: string): Promise<string> {
    const body = this.#files.get(path);
    return body === undefined
      ? Promise.reject(new Error(`ENOENT: ${path}`))
      : Promise.resolve(body);
  }

  writeFile(path: string, content: string): Promise<void> {
    const type = this.#files.has(path) ? "changed" : "created";
    this.#files.set(path, content);
    this.#changes.fire({ path, type });
    return Promise.resolve();
  }

  stat(path: string): Promise<{ size: number; isDirectory: boolean }> {
    const body = this.#files.get(path);
    return body === undefined
      ? Promise.reject(new Error(`ENOENT: ${path}`))
      : Promise.resolve({ size: body.length, isDirectory: false });
  }

  dispose(): void {
    this.#changes.dispose();
  }
}

function renderUri(uri: SimpleURI): string {
  return `${uri.scheme}://${uri.authority}${uri.path}`;
}

function showTransformations(remoteAuthority: string): void {
  console.log("\n[5] URI transformation (client ⇄ server)");
  const transform = createURITransformer(remoteAuthority);

  const remoteView: SimpleURI = {
    scheme: "vscode-remote",
    authority: remoteAuthority,
    path: "/home/user/file.txt",
  };
  const serverView = transform.transformIncoming(remoteView);
  console.log(`  client: ${renderUri(remoteView)}`);
  console.log(`  server: ${renderUri(serverView)}`);

  const serverFile: SimpleURI = { scheme: "file", authority: "", path: "/home/user/file.txt" };
  const clientFile = transform.transformOutgoing(serverFile);
  console.log(`  server: ${renderUri(serverFile)}`);
  console.log(`  client: ${renderUri(clientFile)}`);
}

async function demo(): Promise<void> {
  console.log("=== Remote connection Demo ===");

  const owned = new DisposableStore();
  const resolvers = new RemoteAuthorityResolverService();
  const factories = new RemoteSocketFactoryService();
  const loopback = new LoopbackSocketFactory();

  owned.add(resolvers.registerResolver("ssh", new SshResolver()));
  owned.add(factories.register(RemoteConnectionType.WebSocket, loopback));

  const authority = "ssh+myserver";
  console.log(`\n[1] Resolving "${authority}"...`);
  const resolved = await resolvers.resolveAuthority(authority);
  console.log(`  resolved: ${String(resolved.connectTo)}, token: ${resolved.connectionToken}`);

  console.log("\n[2] Opening transport...");
  const query = resolved.connectionToken ? `token=${resolved.connectionToken}` : "";
  const callerSocket = await factories.connect(resolved.connectTo, "/", query);
  const calleeSocket = loopback.accepted.shift()!;

  const callerSide = new SocketProtocol(callerSocket);
  const calleeSide = new SocketProtocol(calleeSocket);
  owned.add(toDisposable(() => callerSide.dispose()));
  owned.add(toDisposable(() => calleeSide.dispose()));

  console.log("\n[3] Wiring both ends...");
  const files = new RemoteFileSystem();
  owned.add(toDisposable(() => files.dispose()));

  const client = new ChannelClient(callerSide);
  owned.add(toDisposable(() => client.dispose()));

  const server = new ChannelServer(calleeSide, authority);
  server.registerChannel("remoteFilesystem", ProxyChannel.fromService<string>(files, owned));
  owned.add(toDisposable(() => server.dispose()));

  await Event.toPromise(client.onDidInitialize);

  console.log("\n[4] Calling the remote filesystem...");
  const remoteFs = ProxyChannel.toService<RemoteFiles>(
    client.getChannel<IChannel>("remoteFilesystem"),
  );
  owned.add(
    remoteFs.onDidChangeFile(({ path, type }) => console.log(`  [remote] ${type}: ${path}`)),
  );

  const mainPath = `${PROJECT_ROOT}/main.ts`;
  console.log(`  readFile → "${await remoteFs.readFile(mainPath)}"`);

  const meta = await remoteFs.stat(`${PROJECT_ROOT}/package.json`);
  console.log(`  stat → size: ${meta.size}, isDirectory: ${meta.isDirectory}`);

  await remoteFs.writeFile(mainPath, 'console.log("Updated from local VS Code!")');
  console.log(`  readFile after write → "${await remoteFs.readFile(mainPath)}"`);

  showTransformations(authority);

  owned.dispose();
  callerSocket.dispose();
  calleeSocket.dispose();
  console.log("\nDone!");
}

demo().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
