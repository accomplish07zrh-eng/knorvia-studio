// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { VSBuffer } from "./buffer.js";
import { DisposableStore, Emitter } from "./foundation.js";
import {
  ChunkStream,
  HEADER_SIZE,
  ProtocolMessage,
  ProtocolMessageType,
  writeProtocolMessage,
  type ConnectionFlowControl,
  type IMessagePassingProtocol,
  type ISocket,
} from "./protocol.js";

export interface PersistentProtocolOptions {
  saturationHighWaterMarkBytes?: number;
  saturationLowWaterMarkBytes?: number;
  replayBufferMaxBytes?: number;
  replayBufferGraceMs?: number;
}

interface OutstandingFrame {
  message: ProtocolMessage;
  sentAt: number;
}

const DEFAULT_HIGH_WATER = 1024 * 1024;
const DEFAULT_REPLAY_LIMIT = 8 * 1024 * 1024;
const DEFAULT_REPLAY_GRACE_MS = 45_000;
const KEEPALIVE_PERIOD_MS = 5_000;
const ACK_WATCH_PERIOD_MS = 20_000;
const EMPTY = VSBuffer.alloc(0);

export class PersistentProtocol implements IMessagePassingProtocol, ConnectionFlowControl {
  readonly #incoming = new Emitter<VSBuffer>();
  readonly #closed = new Emitter<void>();
  readonly #socketClosed = new Emitter<void>();
  readonly #saturated = new Emitter<void>();
  readonly #drained = new Emitter<void>();

  readonly onMessage = this.#incoming.event;
  readonly onClose = this.#closed.event;
  readonly onSocketClose = this.#socketClosed.event;
  readonly onSaturated = this.#saturated.event;
  readonly onDrained = this.#drained.event;

  #socket: ISocket;
  #framing = new ChunkStream();
  #socketBindings = new DisposableStore();

  #sentId = 0;
  #awaitingAck: OutstandingFrame[] = [];
  #seenId = 0;
  #pendingBytes = 0;
  #isSaturated = false;
  #isAbandoned = false;

  #keepAliveHandle: ReturnType<typeof setInterval> | null = null;
  #ackWatchHandle: ReturnType<typeof setInterval> | null = null;
  #lastInboundAt = Date.now();

  readonly #highWater: number;
  readonly #lowWater: number;
  readonly #replayLimit: number;
  readonly #replayGraceMs: number;

  constructor(socket: ISocket, options: PersistentProtocolOptions = {}) {
    this.#highWater = options.saturationHighWaterMarkBytes ?? DEFAULT_HIGH_WATER;
    this.#lowWater = options.saturationLowWaterMarkBytes ?? Math.floor(this.#highWater / 4);
    this.#replayLimit = options.replayBufferMaxBytes ?? DEFAULT_REPLAY_LIMIT;
    this.#replayGraceMs = options.replayBufferGraceMs ?? DEFAULT_REPLAY_GRACE_MS;
    this.#socket = socket;
    this.#attachSocket();
    this.#startKeepAlive();
    this.#startAckWatch();
  }

  get unacknowledgedBytes(): number {
    return this.#pendingBytes;
  }

  send(buffer: VSBuffer): void {
    const message = new ProtocolMessage(
      ProtocolMessageType.Regular,
      ++this.#sentId,
      this.#seenId,
      buffer,
    );
    this.#awaitingAck.push({ message, sentAt: Date.now() });
    this.#pendingBytes += buffer.byteLength;
    this.#emitMessage(message);

    if (this.#pendingBytes > this.#replayLimit) {
      this.#abandon();
      return;
    }
    if (!this.#isSaturated && this.#pendingBytes > this.#highWater) {
      this.#isSaturated = true;
      this.#saturated.fire();
    }
  }

  replaceSocket(newSocket: ISocket): void {
    this.#socketBindings.dispose();
    this.#socketBindings = new DisposableStore();
    this.#framing = new ChunkStream();
    this.#socket = newSocket;
    this.#attachSocket();
    for (const outstanding of this.#awaitingAck) {
      this.#emitMessage(outstanding.message);
    }
  }

  async drain(): Promise<void> {
    return this.#socket.drain();
  }

  dispose(): void {
    if (this.#keepAliveHandle !== null) {
      clearInterval(this.#keepAliveHandle);
      this.#keepAliveHandle = null;
    }
    if (this.#ackWatchHandle !== null) {
      clearInterval(this.#ackWatchHandle);
      this.#ackWatchHandle = null;
    }
    this.#socketBindings.dispose();
    this.#incoming.dispose();
    this.#closed.dispose();
    this.#socketClosed.dispose();
    this.#saturated.dispose();
    this.#drained.dispose();
    this.#socket.dispose();
  }

  #attachSocket(): void {
    this.#socketBindings.add(
      this.#socket.onData((chunk) => {
        this.#framing.acceptChunk(chunk);
        this.#pumpFrames();
      }),
    );
    this.#socketBindings.add(this.#socket.onClose(() => this.#socketClosed.fire()));
  }

  #emitMessage(message: ProtocolMessage): void {
    this.#socket.write(writeProtocolMessage(message));
  }

  #abandon(): void {
    if (this.#isAbandoned) {
      return;
    }
    this.#isAbandoned = true;
    this.#emitMessage(
      new ProtocolMessage(ProtocolMessageType.Disconnect, 0, this.#seenId, VSBuffer.alloc(0)),
    );
    this.#closed.fire();
  }

  #acknowledge(upTo: number): void {
    while (this.#awaitingAck.length > 0 && this.#awaitingAck[0].message.id <= upTo) {
      const settled = this.#awaitingAck.shift() as OutstandingFrame;
      this.#pendingBytes -= settled.message.data.byteLength;
    }
    if (this.#isSaturated && this.#pendingBytes <= this.#lowWater) {
      this.#isSaturated = false;
      this.#drained.fire();
    }
  }

  #pumpFrames(): void {
    for (;;) {
      const header = this.#framing.peek(HEADER_SIZE);
      if (header === null) {
        break;
      }
      const payloadLength = header.readUInt32BE(9);
      const frameSize = HEADER_SIZE + payloadLength;
      if (this.#framing.byteLength < frameSize) {
        break;
      }
      const read = header.readUInt8(0);
      const id = header.readUInt32BE(1);
      const ack = header.readUInt32BE(5);
      this.#framing.skip(HEADER_SIZE);
      const payload = payloadLength === 0 ? EMPTY : this.#takePayload(payloadLength);
      this.#acknowledge(ack);
      this.#lastInboundAt = Date.now();
      if (read === ProtocolMessageType.Regular) {
        this.#seenId = id;
        this.#incoming.fire(payload);
      } else if (read === ProtocolMessageType.Disconnect) {
        this.#closed.fire();
        break;
      }
    }
  }

  #takePayload(payloadLength: number): VSBuffer {
    const consumed = this.#framing.read(payloadLength);
    if (consumed === null) {
      throw new Error("PersistentProtocol 读取到完整帧长度后 body 不应为空");
    }
    return consumed;
  }

  #startKeepAlive(): void {
    this.#keepAliveHandle = setInterval(() => {
      this.#emitMessage(
        new ProtocolMessage(ProtocolMessageType.KeepAlive, 0, this.#seenId, VSBuffer.alloc(0)),
      );
    }, KEEPALIVE_PERIOD_MS);
  }

  #startAckWatch(): void {
    this.#ackWatchHandle = setInterval(() => {
      if (this.#awaitingAck.length > 0 && Date.now() - this.#lastInboundAt > ACK_WATCH_PERIOD_MS) {
        this.#socketClosed.fire();
      }
      const oldest = this.#awaitingAck[0];
      if (oldest !== undefined && Date.now() - oldest.sentAt > this.#replayGraceMs) {
        this.#abandon();
      }
    }, ACK_WATCH_PERIOD_MS);
  }
}
