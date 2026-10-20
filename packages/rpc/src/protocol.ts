// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { VSBuffer } from "./buffer.js";
import { DisposableStore, Emitter, type Event, type IDisposable } from "./foundation.js";
// 跨进程契约形状集中在 transport-contract.ts（interface.md 冻结，签名逐字不改）；
// 本文件只保留分帧、流控与两种协议实现。
import { FLOW_STATES } from "./transport-contract.js";
import type {
  ConnectionFlowControl,
  IMessagePassingProtocol,
  ISocket,
  MessagePortFlowControl,
  MessagePortFlowState,
  MessagePortLike,
  MessagePortPayload,
} from "./transport-contract.js";

export type {
  ConnectionFlowControl,
  IMessagePassingProtocol,
  ISocket,
  MessagePortFlowControl,
  MessagePortFlowState,
  MessagePortLike,
  MessagePortPayload,
};

const FLOW_VERSION = "connection-flow-v1";
const FLOW_VALUES: ReadonlySet<unknown> = new Set<unknown>(FLOW_STATES);

function borrowsFlowShape(value: unknown): value is MessagePortFlowControl {
  const usable = typeof value === "object" && value !== null && !Array.isArray(value);
  if (!usable) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  const twoKeys = Object.keys(fields).length === 2;
  const rightVersion = fields.__knorviaRpcControl === FLOW_VERSION;
  return twoKeys && rightVersion && FLOW_VALUES.has(fields.state);
}

export class ChunkStream {
  readonly #segments: VSBuffer[] = [];
  #available = 0;

  get byteLength(): number {
    return this.#available;
  }

  acceptChunk(bytes: VSBuffer): void {
    if (bytes.byteLength > 0) {
      this.#segments.push(bytes);
      this.#available += bytes.byteLength;
    }
  }

  peek(size: number): VSBuffer | null {
    return this.#window(size, false);
  }

  read(size: number): VSBuffer | null {
    return this.#window(size, true);
  }

  skip(size: number): void {
    if (this.#window(size, true) === null) {
      const complaint = `ChunkStream.skip(${size}) 超出可读范围`;
      throw new Error(complaint);
    }
  }

  #window(size: number, consume: boolean): VSBuffer | null {
    const cut = size > this.#available ? null : this.#project(size);
    if (cut !== null && consume) {
      this.#discard(size);
    }
    return cut;
  }

  #project(size: number): VSBuffer {
    const head = this.#segments[0];
    if (head !== undefined && head.byteLength >= size) {
      return head.slice(0, size);
    }
    const assembled = VSBuffer.alloc(size);
    let written = 0;
    let index = 0;
    while (written < size) {
      const segment = this.#segments[index];
      const portion = Math.min(segment.byteLength, size - written);
      const piece = portion === segment.byteLength ? segment : segment.slice(0, portion);
      assembled.set(piece, written);
      written += portion;
      index += 1;
    }
    return assembled;
  }

  #discard(size: number): void {
    let remaining = size;
    while (remaining > 0) {
      const head = this.#segments[0];
      if (head.byteLength > remaining) {
        this.#segments[0] = head.slice(remaining);
        break;
      }
      this.#segments.shift();
      remaining -= head.byteLength;
    }
    this.#available -= size;
  }
}

export enum ProtocolMessageType {
  None,
  Regular,
  Control,
  Ack,
  Disconnect = 5,
  ReplayRequest,
  Pause,
  Resume,
  KeepAlive,
}

export const HEADER_SIZE = 13;

export class ProtocolMessage {
  readonly type: ProtocolMessageType;
  readonly id: number;
  readonly ack: number;
  readonly data: VSBuffer;
  readonly byteLength: number;

  constructor(kind: ProtocolMessageType, id: number, ack: number, data: VSBuffer) {
    this.type = kind;
    this.id = id;
    this.ack = ack;
    this.data = data;
    this.byteLength = data.byteLength + HEADER_SIZE;
  }
}

export function writeProtocolMessage(source: ProtocolMessage): VSBuffer {
  const body = source.data;
  const frame = VSBuffer.alloc(HEADER_SIZE + body.byteLength);
  // 帧头布局：type:u8 | id:u32BE | ack:u32BE | length:u32BE。
  // 四个字段的**索引**（固定 0..3）与**写偏移**（0 / 1 / 5 / 9）是两件事：
  // 早先这里用同一个变量兼作两者，第三、四个字段被读成 `fields[5]`、`fields[9]`
  // （都是 undefined），长度字段因此写成 0，接收端把整帧当成空 body，
  // ChannelClient 一解帧就抛 TypeError。
  const fields: readonly number[] = [source.type, source.id, source.ack, body.byteLength];
  frame.writeUInt8(fields[0], 0);
  frame.writeUInt32BE(fields[1], 1);
  frame.writeUInt32BE(fields[2], 5);
  frame.writeUInt32BE(fields[3], 9);
  frame.set(body, HEADER_SIZE);
  return frame;
}

export class SocketProtocol implements IMessagePassingProtocol {
  readonly #inbox = new Emitter<VSBuffer>();
  readonly onMessage = this.#inbox.event;
  readonly #chunks = new ChunkStream();
  readonly #watchers = new DisposableStore();

  constructor(private readonly socket: ISocket) {
    const released = this.socket.onData((chunk) => {
      this.#chunks.acceptChunk(chunk);
      this.#pump();
    });
    this.#watchers.add(released);
  }

  send(payload: VSBuffer): void {
    const outgoing = new ProtocolMessage(ProtocolMessageType.Regular, 0, 0, payload);
    this.socket.write(writeProtocolMessage(outgoing));
  }

  async drain(): Promise<void> {
    await this.socket.drain();
  }

  dispose(): void {
    this.#watchers.dispose();
    this.#inbox.dispose();
  }

  /**
   * 把缓冲区里已经完整的帧逐个交付出去。
   *
   * 读取分三段，每段只做一件事：
   *   1. `#expectHeader`  —— 攒够 13 字节帧头，读出版本化的长度字段；
   *   2. `#expectBody`    —— 按长度攒够整帧载荷；
   *   3. `#deliverFrame`  —— 只把 Regular 帧交给订阅者，其余种类忽略（ack/pause 等由会话层处理）。
   * 任何一段条件不满足就返回 `false`，表示「还不够，等下一批数据」——
   * 这样分片到达时不需要维护「读到哪了」的额外状态。
   */
  #pump(): void {
    for (;;) {
      const frame = this.#nextFrame();
      if (frame === null) {
        return;
      }
      this.#deliverFrame(frame);
    }
  }

  /** 取下一帧的 {种类, 载荷}；数据不足时返回 `null`。 */
  #nextFrame(): { kind: number; body: VSBuffer } | null {
    const header = this.#expectHeader();
    if (header === null) {
      return null;
    }
    const body = this.#expectBody(header.bodySize);
    if (body === null) {
      return null;
    }
    return { kind: header.kind, body };
  }

  /** 攒够帧头；不足 13 字节返回 `null`。读取后**不**消费，由 `#expectBody` 一并推进。 */
  #expectHeader(): { kind: number; bodySize: number } | null {
    const header = this.#chunks.peek(HEADER_SIZE);
    if (header === null) {
      return null;
    }
    return { kind: header.readUInt8(0), bodySize: header.readUInt32BE(9) };
  }

  /** 按帧头给的长度取出载荷；不足时返回 `null` 且不消费任何字节。 */
  #expectBody(bodySize: number): VSBuffer | null {
    if (this.#chunks.byteLength < bodySize + HEADER_SIZE) {
      return null;
    }
    // 到这里才推进读游标：先跳帧头、再取载荷，顺序不可颠倒。
    this.#chunks.skip(HEADER_SIZE);
    if (bodySize === 0) {
      return VSBuffer.alloc(0);
    }
    const body = this.#chunks.read(bodySize);
    if (body === null) {
      throw new Error("SocketProtocol 在确认整帧长度后仍取不到 body");
    }
    return body;
  }

  /** 只有 Regular 帧承载业务载荷；其余种类（ack/pause/resume 等）在本层丢弃。 */
  #deliverFrame(frame: { kind: number; body: VSBuffer }): void {
    if (frame.kind !== ProtocolMessageType.Regular) {
      return;
    }
    this.#inbox.fire(frame.body);
  }
}

export function createQueuePair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
  const leftward = new Emitter<VSBuffer>();
  const rightward = new Emitter<VSBuffer>();
  const defer = (target: Emitter<VSBuffer>, payload: VSBuffer): void => {
    setTimeout(() => target.fire(payload), 0);
  };
  const left: IMessagePassingProtocol = {
    send(payload) {
      defer(rightward, payload);
    },
    onMessage: leftward.event,
  };
  const right: IMessagePassingProtocol = {
    send(payload) {
      defer(leftward, payload);
    },
    onMessage: rightward.event,
  };
  return [left, right];
}

export class MessagePortProtocol implements IMessagePassingProtocol {
  readonly #inbox = new Emitter<VSBuffer>();
  readonly onMessage = this.#inbox.event;
  readonly #flow = new Emitter<MessagePortFlowState>();
  readonly onFlowState = this.#flow.event;
  readonly #handler: (e: { data: MessagePortPayload }) => void;

  constructor(private readonly port: MessagePortLike) {
    this.#handler = (envelope) => this.#route(envelope.data);
    this.port.addEventListener("message", this.#handler);
    this.port.start();
  }

  send(payload: VSBuffer): void {
    this.port.postMessage(payload.buffer);
  }

  sendFlowState(state: MessagePortFlowState): void {
    const control: MessagePortFlowControl = { __knorviaRpcControl: FLOW_VERSION, state };
    this.port.postMessage(control);
  }

  disconnect(): void {
    const channel = this.port;
    channel.removeEventListener("message", this.#handler);
    channel.close();
    this.#inbox.dispose();
    this.#flow.dispose();
  }

  #route(payload: MessagePortPayload): void {
    if (borrowsFlowShape(payload)) {
      this.#flow.fire(payload.state);
    } else if (payload instanceof Uint8Array) {
      this.#inbox.fire(VSBuffer.wrap(payload));
    }
  }
}
