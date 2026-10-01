// Native acceptance uses only fixtures owned by this test, never user directories.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  ChannelClient,
  ChannelServer,
  Emitter,
  ProxyChannel,
  type IMessagePassingProtocol,
  type VSBuffer,
} from "@knorvia/rpc";
import type { FileWatchEvent } from "@knorvia/shared";
import type { IFileWatcherService } from "../src/fileWatcher/fileWatcher.js";

const emitted = process.env.KNORVIA_FILE_WATCHER_TARGET === "dist";
const factoryPath =
  process.env.KNORVIA_FILE_WATCHER_MODULE ??
  new URL(
    `../${emitted ? "dist" : "src"}/fileWatcher/fileWatcherService.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href;
const { createFileWatcherService }: typeof import("../src/fileWatcher/fileWatcherService.js") =
  await import(factoryPath);
const logger = { debug() {}, info() {}, warn() {}, error() {} };

async function ownedDirectory(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "knorvia-file-watcher-c-"));
  const service = createFileWatcherService({ logger });
  t.after(async () => {
    service.disposeAll();
    await rm(path, { recursive: true, force: true });
  });
  return { path, service };
}

test("native nonrecursive directory watch reports a synthetic file and closes cleanly", async (t) => {
  const { path, service } = await ownedDirectory(t);
  const { id } = await service.watch({ path });
  const observed = new Promise<FileWatchEvent>((accept) => {
    const subscription = service.onDynamicChange(id)((event) => {
      subscription.dispose();
      accept(event);
    });
  });
  const file = join(path, "synthetic.txt");
  await writeFile(file, "fixture content");
  const event = await observed;
  assert.equal(event.dirPath, path);
  assert.equal(event.changedPath, file);
  await service.unwatch({ id });
  service
    .onDynamicChange(id)(() => assert.fail("stale native subscription"))
    .dispose();
});

test("native recursive watch observes a pre-existing nested directory", async (t) => {
  const { path, service } = await ownedDirectory(t);
  const child = join(path, "nested");
  await mkdir(child);
  const { id } = await service.watch({ path, recursive: true });
  const observed = new Promise<FileWatchEvent>((accept) => {
    const subscription = service.onDynamicChange(id)((event) => {
      subscription.dispose();
      accept(event);
    });
  });
  const file = join(child, "synthetic.txt");
  await writeFile(file, "nested fixture");
  const event = await observed;
  assert.equal(event.dirPath, path);
  assert.equal(event.changedPath, file);
});

test("binary RPC channel transports native watcher events and stale-ID subscriptions", async (t) => {
  const { path, service } = await ownedDirectory(t);
  const inboundServer = new Emitter<VSBuffer>();
  const inboundClient = new Emitter<VSBuffer>();
  t.after(() => {
    inboundServer.dispose();
    inboundClient.dispose();
  });
  const serverProtocol: IMessagePassingProtocol = {
    onMessage: inboundServer.event,
    send: (data) => queueMicrotask(() => inboundClient.fire(data)),
  };
  const clientProtocol: IMessagePassingProtocol = {
    onMessage: inboundClient.event,
    send: (data) => queueMicrotask(() => inboundServer.fire(data)),
  };
  const server = new ChannelServer(serverProtocol, "synthetic-host");
  t.after(() => server.dispose());
  server.registerChannel("file-watcher", ProxyChannel.fromService(service));
  const client = new ChannelClient(clientProtocol);
  t.after(() => client.dispose());
  const remote = ProxyChannel.toService<IFileWatcherService>(client.getChannel("file-watcher"));
  const { id } = await remote.watch({ path });
  const observed = new Promise<FileWatchEvent>((accept) => {
    const subscription = remote.onDynamicChange(id)((event) => {
      subscription.dispose();
      accept(event);
    });
  });
  // A round-trip call establishes that the prior dynamic subscription reached the server.
  await remote.unwatch({ id: "not-an-owner" });
  const file = join(path, "rpc-fixture.txt");
  await writeFile(file, "binary RPC fixture");
  assert.deepEqual(await observed, { dirPath: path, changedPath: file });
  await remote.unwatch({ id });
  const stale = remote.onDynamicChange(id)(() => assert.fail("stale RPC event"));
  await remote.unwatch({ id });
  stale.dispose();
});
