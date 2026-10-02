import { randomUUID } from "node:crypto";
import { ChannelServer, Emitter, SocketProtocol, VSBuffer, type ISocket } from "@knorvia/rpc";
import {
  createKnorviaAgentConnectionScope,
  IKnorviaAgentService,
  type ServiceCollection,
} from "@knorvia/services";

export function wrapStdio(): ISocket {
  const received = new Emitter<VSBuffer>();
  const closed = new Emitter<void>();
  const ended = new Emitter<void>();
  const close = () => {
    closed.fire();
    ended.fire();
  };
  process.stdin.on("data", (chunk: Buffer) => {
    received.fire(VSBuffer.wrap(new Uint8Array(chunk)));
  });
  process.stdin.on("end", close);
  process.stdin.on("error", close);

  return {
    onData: received.event,
    onClose: closed.event,
    onEnd: ended.event,
    write(buffer) {
      process.stdout.write(Buffer.from(buffer.buffer));
    },
    end() {
      process.stdout.end();
    },
    drain() {
      if (!process.stdout.writableNeedDrain) return Promise.resolve();
      return new Promise<void>((resolve) => process.stdout.once("drain", resolve));
    },
    dispose() {
      process.stdin.destroy();
    },
  };
}

export function createStdioServer(services: ServiceCollection): { stop(): Promise<void> } {
  const socket = wrapStdio();
  const channelServer = new ChannelServer(new SocketProtocol(socket), "stdio");
  const agent = services.getOptional(IKnorviaAgentService);
  const scope = agent
    ? createKnorviaAgentConnectionScope(agent, {
        connectionId: `server-stdio-${randomUUID()}`,
        clientMode: "desktop-continuous",
        role: "trusted-host-relay",
      })
    : undefined;
  const overrides = new Map<string, unknown>();
  if (scope) overrides.set(IKnorviaAgentService.channelName, scope.service);
  services.exposeOnChannelServer(channelServer, overrides);

  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (!stopping) {
      channelServer.dispose();
      stopping = (async () => {
        try {
          await scope?.dispose();
        } finally {
          socket.dispose();
        }
      })();
    }
    return stopping;
  }
  socket.onClose(() => {
    void stop();
  });
  return { stop };
}
