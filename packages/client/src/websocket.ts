import {
  ChannelClient,
  Emitter,
  SocketProtocol,
  VSBuffer,
  type IMessagePassingProtocol,
  type ISocket,
} from "@knorvia/rpc";
import type { IServiceAccessor } from "@knorvia/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";

export interface WebSocketConnectionCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

interface WebSocketConnectionOptions {
  onClose?: (event: WebSocketConnectionCloseEvent) => void;
  onOpenSocket?: (socket: WebSocket) => void;
}

function socketPort(ws: WebSocket): ISocket {
  const data = new Emitter<VSBuffer>();
  const closed = new Emitter<void>();
  const ended = new Emitter<void>();
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (event) => {
    data.fire(VSBuffer.wrap(new Uint8Array(event.data as ArrayBuffer)));
  });
  const finish = () => {
    closed.fire(undefined);
    ended.fire(undefined);
  };
  ws.addEventListener("close", finish);
  ws.addEventListener("error", finish);
  return {
    onData: data.event,
    onClose: closed.event,
    onEnd: ended.event,
    write(buffer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(buffer.buffer as Uint8Array<ArrayBuffer>);
    },
    end() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
    dispose() {
      ws.close();
    },
  };
}

export function connectViaWebSocket(
  wsUrl: string,
  options?: WebSocketConnectionOptions,
): Promise<IServiceAccessor> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let opened = false;
    ws.addEventListener("error", () => {
      if (!opened) reject(new Error(`WebSocket connection failed: ${wsUrl}`));
    });
    ws.addEventListener("close", (event) => {
      options?.onClose?.({ code: event.code, reason: event.reason, wasClean: event.wasClean });
      if (!opened) {
        reject(
          new Error(
            event.reason
              ? `WebSocket closed before ready: ${event.reason}`
              : `WebSocket closed before ready (${event.code})`,
          ),
        );
      }
    });
    ws.addEventListener("open", () => {
      opened = true;
      options?.onOpenSocket?.(ws);
      resolve(connectViaProtocol(new SocketProtocol(socketPort(ws))));
    });
  });
}

export function connectViaProtocol(protocol: IMessagePassingProtocol): IServiceAccessor {
  return new RemoteServiceAccess(new ChannelClient(protocol));
}
