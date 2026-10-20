// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

/**
 * 示例 2：ProxyChannel。
 *
 * 普通的内存文件服务经 fromService 原样暴露成 channel，客户端再用
 * toService 拿回一个 Proxy：远程调用从调用方看和本地方法没有区别，
 * 事件订阅也照旧返回 Event。
 */

import { toDisposable } from "../src/index.js";
import {
  ChannelClient,
  ChannelServer,
  DisposableStore,
  Emitter,
  Event,
  ProxyChannel,
  createQueuePair,
  type IChannel,
} from "../src/index.js";

type FileChange = { path: string; type: "created" | "changed" };

interface FileService {
  onDidChangeFile: Event<FileChange>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(directory: string): Promise<string[]>;
}

const SEED: ReadonlyArray<readonly [string, string]> = [
  ["/src/index.ts", 'export * from "./main.js";\n'],
  ["/src/util.ts", "export const add = (a: number, b: number) => a + b;\n"],
];

class FileStore implements FileService {
  private readonly entries = new Map<string, string>(SEED);
  private readonly changes = new Emitter<FileChange>();
  readonly onDidChangeFile = this.changes.event;

  readFile(path: string): Promise<string> {
    const content = this.entries.get(path);
    return content === undefined
      ? Promise.reject(new Error(`File not found: ${path}`))
      : Promise.resolve(content);
  }

  writeFile(path: string, content: string): Promise<void> {
    const existed = this.entries.has(path);
    this.entries.set(path, content);
    this.changes.fire({ path, type: existed ? "changed" : "created" });
    return Promise.resolve();
  }

  listFiles(directory: string): Promise<string[]> {
    const prefix = directory.endsWith("/") ? directory : `${directory}/`;
    const matches = [...this.entries.keys()].filter((path) => path.startsWith(prefix));
    return Promise.resolve(matches);
  }

  dispose(): void {
    this.changes.dispose();
  }
}

function describeChange(change: FileChange): string {
  return `  [watch] ${change.type.padEnd(7)} ${change.path}`;
}

async function demo(): Promise<void> {
  console.log("--- ProxyChannel Demo ---");

  const owned = new DisposableStore();
  const store = new FileStore();
  owned.add(toDisposable(() => store.dispose()));

  const [callerEnd, calleeEnd] = createQueuePair();
  const server = new ChannelServer(calleeEnd, "file-host");
  server.registerChannel("files", ProxyChannel.fromService<string>(store, owned));
  owned.add(toDisposable(() => server.dispose()));

  const client = new ChannelClient(callerEnd);
  owned.add(toDisposable(() => client.dispose()));
  await Event.toPromise(client.onDidInitialize);

  const files = ProxyChannel.toService<FileService>(client.getChannel<IChannel>("files"));
  owned.add(files.onDidChangeFile((change) => console.log(describeChange(change))));

  await files.writeFile("/src/main.ts", 'console.log("hello")');
  await files.writeFile("/src/main.ts", 'console.log("hello world")');

  const content = await files.readFile("/src/main.ts");
  const listing = await files.listFiles("/src");
  console.log(`\nreadFile('/src/main.ts') = "${content}"`);
  console.log(`listFiles('/src') = ${JSON.stringify(listing)}`);

  try {
    await files.readFile("/nonexistent");
  } catch (error) {
    console.log(`readFile('/nonexistent') → Error: ${(error as Error).message}`);
  }

  owned.dispose();
  console.log("\nDone!");
}

demo().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
