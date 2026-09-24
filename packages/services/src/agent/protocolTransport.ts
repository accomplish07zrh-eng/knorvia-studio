import type { Event, IDisposable } from "@knorvia/rpc";
import type { KnorviaProtocolMessage } from "@knorvia/shared";

export type KnorviaProtocolTransportKind = "stdio" | "websocket" | "memory";

export interface KnorviaProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}

export interface KnorviaProtocolTransport extends IDisposable {
  readonly kind: KnorviaProtocolTransportKind;
  readonly onMessage: Event<KnorviaProtocolMessage>;
  readonly onClose: Event<KnorviaProtocolTransportClosedEvent>;
  send(message: KnorviaProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
