// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

/**
 * 示例 3：IPCServer + IPCClient。
 *
 * 一个 hub 管住两条窗口连接。上行方向是两个窗口读写同一份偏好设置，
 * 下行方向是服务端用 StaticRouter 挑中 window-1 反向查询窗口标题。
 * 断开由连接自带的 onDidClientDisconnect 事件驱动，hub 随即更新连接集。
 */

import { toDisposable } from "../src/index.js";
import {
  DisposableStore,
  Emitter,
  Event,
  IPCClient,
  IPCServer,
  ProxyChannel,
  StaticRouter,
  createQueuePair,
  type ClientConnectionEvent,
  type IChannel,
} from "../src/index.js";

type Preference = { key: string; value: unknown };

class PreferenceStore {
  private readonly entries = new Map<string, unknown>();
  private readonly changed = new Emitter<Preference>();
  readonly onDidChange = this.changed.event;

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.entries.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
    this.changed.fire({ key, value });
    return Promise.resolve();
  }

  dispose(): void {
    this.changed.dispose();
  }
}

class WindowSurface {
  constructor(private readonly windowId: string) {}

  getTitle(): Promise<string> {
    return Promise.resolve(`Window ${this.windowId}`);
  }

  getBounds(): Promise<{ width: number; height: number }> {
    return Promise.resolve({ width: 1280, height: 800 });
  }
}

interface WindowLink {
  readonly client: IPCClient<string>;
  readonly disconnect: () => void;
}

/** 建立一条“窗口 → hub”的连接：先登记服务端 socket，再拉起客户端端点。 */
function attachWindow(
  inbound: Emitter<ClientConnectionEvent>,
  channels: DisposableStore,
  id: string,
): WindowLink {
  const [clientSide, serverSide] = createQueuePair();
  const closing = new Emitter<void>();
  inbound.fire({ protocol: serverSide, onDidClientDisconnect: closing.event });

  const client = new IPCClient<string>(clientSide, id);
  client.registerChannel(
    "windowSurface",
    ProxyChannel.fromService<string>(new WindowSurface(id), channels),
  );

  return { client, disconnect: () => closing.fire() };
}

async function untilConnections(hub: IPCServer<string>, expected: number): Promise<void> {
  while (hub.connections.length !== expected) {
    await Event.toPromise(
      hub.connections.length < expected ? hub.onDidAddConnection : hub.onDidRemoveConnection,
    );
  }
}

function asRemote<T extends object>(client: IPCClient<string>, channel: string): T {
  return ProxyChannel.toService<T>(client.getChannel<IChannel>(channel));
}

async function demo(): Promise<void> {
  console.log("--- IPCServer + IPCClient Demo ---");

  const resources = new DisposableStore();
  const inbound = new Emitter<ClientConnectionEvent>();
  const hub = new IPCServer<string>(inbound.event);
  const preferences = new PreferenceStore();

  resources.add(toDisposable(() => preferences.dispose()));
  resources.add(toDisposable(() => hub.dispose()));
  resources.add(toDisposable(() => inbound.dispose()));

  hub.registerChannel("preferences", ProxyChannel.fromService<string>(preferences, resources));

  console.log('[1] Client "window-1" connecting...');
  const first = attachWindow(inbound, resources, "window-1");
  resources.add(toDisposable(() => first.client.dispose()));

  console.log('[2] Client "window-2" connecting...');
  const second = attachWindow(inbound, resources, "window-2");
  resources.add(toDisposable(() => second.client.dispose()));

  await untilConnections(hub, 2);

  const firstPreferences = asRemote<PreferenceStore>(first.client, "preferences");
  await firstPreferences.set("theme", "dark");
  console.log('client1: set theme = "dark"');

  const secondPreferences = asRemote<PreferenceStore>(second.client, "preferences");
  const theme = await secondPreferences.get("theme");
  console.log(`client2: get theme = "${String(theme)}" (via a different window)`);

  const windowOne = hub.getChannel<IChannel>(
    "windowSurface",
    new StaticRouter<string>((ctx) => ctx === "window-1"),
  );
  const title = await ProxyChannel.toService<WindowSurface>(windowOne).getTitle();
  console.log(`server → window-1: title = "${title}"`);

  console.log(`Active connections: ${hub.connections.length}`);

  console.log('\n[3] Client "window-1" disconnecting...');
  first.disconnect();
  await untilConnections(hub, 1);
  console.log(`Active connections after disconnect: ${hub.connections.length}`);

  resources.dispose();
  console.log("\nDone!");
}

demo().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
