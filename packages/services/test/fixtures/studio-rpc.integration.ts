import { ChannelClient, ChannelServer, Emitter, ProxyChannel, type VSBuffer } from "@knorvia/rpc";
import type { IStudioRuntimeService } from "../../src/studio-runtime/contract.js";

// 完整二进制 RPC 与两个独立 Host，不用直接调用 mock timeline 代替跨连接证明。
export function connectStudioRpc(owner: IStudioRuntimeService) {
  const incomingHost = new Emitter<VSBuffer>();
  const incomingClient = new Emitter<VSBuffer>();
  const client = new ChannelClient({
    onMessage: incomingClient.event,
    send: (frame) => incomingHost.fire(frame),
  });
  const server = new ChannelServer(
    { onMessage: incomingHost.event, send: (frame) => incomingClient.fire(frame) },
    "synthetic-integration-host",
    1000,
    true,
  );
  server.registerChannel("studio-runtime", ProxyChannel.fromService(owner));
  server.ready();
  return {
    service: ProxyChannel.toService<IStudioRuntimeService>(client.getChannel("studio-runtime")),
    close() {
      client.dispose();
      server.dispose();
      incomingHost.dispose();
      incomingClient.dispose();
    },
  };
}
