import { VSBuffer } from "./buffer.js";
import { DisposableStore, Emitter, type Event, type IDisposable } from "./foundation.js";

export interface IMessagePassingProtocol {
  send(buffer: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}

export interface ConnectionFlowControl {
  readonly unacknowledgedBytes: number;
  readonly onSaturated: Event<void>;
  readonly onDrained: Event<void>;
}

export type MessagePortFlowState = "saturated" | "drained";

export interface MessagePortFlowControl {
  __knorviaRpcControl: "connection-flow-v1";
  state: MessagePortFlowState;
}

export type MessagePortPayload = Uint8Array | MessagePortFlowControl;

export interface ISocket extends IDisposable {
  onData: Event<VSBuffer>;
  onClose: Event<void>;
  onEnd: Event<void>;
  write(buffer: VSBuffer): void;
  end(): void;
  drain(): Promise<void>;
}

function isMessagePortFlowControl(value: unknown): value is MessagePortFlowControl {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.__knorviaRpcControl === "connection-flow-v1" &&
    (record.state === "saturated" || record.state === "drained")
  );
}

export class ChunkStream {
  private readonly chunks: VSBuffer[] = [];
  private totalLength = 0;

  get byteLength(): number {
    return this.totalLength;
  }

  acceptChunk(chunk: VSBuffer): void {
    this.chunks.push(chunk);
    this.totalLength += chunk.byteLength;
  }

  peek(byteCount: number): VSBuffer | null {
    if (this.totalLength < byteCount) {
      return null;
    }

    const first = this.chunks[0];
    if (first.byteLength >= byteCount) {
      return first.slice(0, byteCount);
    }

    const result = VSBuffer.alloc(byteCount);
    let offset = 0;
    for (const chunk of this.chunks) {
      if (offset >= byteCount) {
        break;
      }

      const remaining = byteCount - offset;
      const copyLength = Math.min(chunk.byteLength, remaining);
      result.set(copyLength === chunk.byteLength ? chunk : chunk.slice(0, copyLength), offset);
      offset += copyLength;
    }
    return result;
  }

  read(byteCount: number): VSBuffer | null {
    if (this.totalLength < byteCount) {
      return null;
    }

    const first = this.chunks[0];
    if (first.byteLength === byteCount) {
      this.chunks.shift();
      this.totalLength -= byteCount;
      return first;
    }

    if (first.byteLength > byteCount) {
      const result = first.slice(0, byteCount);
      this.chunks[0] = first.slice(byteCount);
      this.totalLength -= byteCount;
      return result;
    }

    const result = VSBuffer.alloc(byteCount);
    let offset = 0;
    while (offset < byteCount) {
      const chunk = this.chunks[0];
      const needed = byteCount - offset;
      if (chunk.byteLength <= needed) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
        this.chunks.shift();
      } else {
        result.set(chunk.slice(0, needed), offset);
        this.chunks[0] = chunk.slice(needed);
        offset += needed;
      }
    }
    this.totalLength -= byteCount;
    return result;
  }

  skip(byteCount: number): void {
    const discarded = this.read(byteCount);
    if (!discarded) {
      throw new Error(`ChunkStream.skip(${byteCount}) 超出可读范围`);
    }
  }
}

export enum ProtocolMessageType {
  None = 0,
  Regular = 1,
  Control = 2,
  Ack = 3,
  Disconnect = 5,
  ReplayRequest = 6,
  Pause = 7,
  Resume = 8,
  KeepAlive = 9,
}

export const HEADER_SIZE = 13;

export class ProtocolMessage {
  constructor(
    public readonly type: ProtocolMessageType,
    public readonly id: number,
    public readonly ack: number,
    public readonly data: VSBuffer,
  ) {}

  get byteLength(): number {
    return HEADER_SIZE + this.data.byteLength;
  }
}

export function writeProtocolMessage(message: ProtocolMessage): VSBuffer {
  const encoded = VSBuffer.alloc(HEADER_SIZE + message.data.byteLength);
  encoded.writeUInt8(message.type, 0);
  encoded.writeUInt32BE(message.id, 1);
  encoded.writeUInt32BE(message.ack, 5);
  encoded.writeUInt32BE(message.data.byteLength, 9);
  encoded.set(message.data, HEADER_SIZE);
  return encoded;
}

export class SocketProtocol implements IMessagePassingProtocol {
  private readonly messageEmitter = new Emitter<VSBuffer>();
  readonly onMessage = this.messageEmitter.event;
  private readonly chunkStream = new ChunkStream();
  private readonly subscriptions = new DisposableStore();

  constructor(private socket: ISocket) {
    this.subscriptions.add(
      this.socket.onData((chunk) => {
        this.chunkStream.acceptChunk(chunk);
        this.readMessages();
      }),
    );
  }

  send(buffer: VSBuffer): void {
    this.write(new ProtocolMessage(ProtocolMessageType.Regular, 0, 0, buffer));
  }

  private write(message: ProtocolMessage): void {
    this.socket.write(writeProtocolMessage(message));
  }

  private readMessages(): void {
    while (true) {
      const header = this.chunkStream.peek(HEADER_SIZE);
      if (!header) {
        break;
      }

      const type = header.readUInt8(0);
      header.readUInt32BE(1);
      header.readUInt32BE(5);
      const length = header.readUInt32BE(9);
      const total = HEADER_SIZE + length;
      if (this.chunkStream.byteLength < total) {
        break;
      }

      this.chunkStream.skip(HEADER_SIZE);
      if (length === 0) {
        if (type === ProtocolMessageType.Regular) {
          this.messageEmitter.fire(VSBuffer.alloc(0));
        }
        continue;
      }

      const body = this.chunkStream.read(length);
      if (!body) {
        throw new Error("SocketProtocol 读取到完整帧长度后 body 不应为空");
      }
      if (type === ProtocolMessageType.Regular) {
        this.messageEmitter.fire(body);
      }
    }
  }

  async drain(): Promise<void> {
    return this.socket.drain();
  }

  dispose(): void {
    this.subscriptions.dispose();
    this.messageEmitter.dispose();
  }
}

export function createQueuePair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
  const emitterA = new Emitter<VSBuffer>();
  const emitterB = new Emitter<VSBuffer>();
  const protocolA: IMessagePassingProtocol = {
    send: (buffer) => {
      setTimeout(() => emitterB.fire(buffer), 0);
    },
    onMessage: emitterA.event,
  };
  const protocolB: IMessagePassingProtocol = {
    send: (buffer) => {
      setTimeout(() => emitterA.fire(buffer), 0);
    },
    onMessage: emitterB.event,
  };
  return [protocolA, protocolB];
}

export interface MessagePortLike {
  addEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  removeEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  postMessage(message: MessagePortPayload): void;
  start(): void;
  close(): void;
}

export class MessagePortProtocol implements IMessagePassingProtocol {
  private readonly binaryEmitter = new Emitter<VSBuffer>();
  readonly onMessage = this.binaryEmitter.event;
  private readonly flowEmitter = new Emitter<MessagePortFlowState>();
  readonly onFlowState = this.flowEmitter.event;
  private readonly handler: (e: { data: MessagePortPayload }) => void;

  constructor(private port: MessagePortLike) {
    this.handler = (e) => {
      if (isMessagePortFlowControl(e.data)) {
        this.flowEmitter.fire(e.data.state);
        return;
      }

      if (e.data instanceof Uint8Array) {
        this.binaryEmitter.fire(VSBuffer.wrap(e.data));
      }
    };
    this.port.addEventListener("message", this.handler);
    this.port.start();
  }

  send(buffer: VSBuffer): void {
    this.port.postMessage(buffer.buffer);
  }

  sendFlowState(state: MessagePortFlowState): void {
    this.port.postMessage({ __knorviaRpcControl: "connection-flow-v1", state });
  }

  disconnect(): void {
    this.port.removeEventListener("message", this.handler);
    this.port.close();
    this.binaryEmitter.dispose();
    this.flowEmitter.dispose();
  }
}
