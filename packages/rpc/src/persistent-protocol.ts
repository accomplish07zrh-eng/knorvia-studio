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

export class PersistentProtocol implements IMessagePassingProtocol, ConnectionFlowControl {
  private readonly messageEmitter = new Emitter<VSBuffer>();
  private readonly closeEmitter = new Emitter<void>();
  private readonly socketCloseEmitter = new Emitter<void>();
  private readonly saturatedEmitter = new Emitter<void>();
  private readonly drainedEmitter = new Emitter<void>();

  readonly onMessage = this.messageEmitter.event;
  readonly onClose = this.closeEmitter.event;
  readonly onSocketClose = this.socketCloseEmitter.event;
  readonly onSaturated = this.saturatedEmitter.event;
  readonly onDrained = this.drainedEmitter.event;

  private socket: ISocket;
  private stream = new ChunkStream();
  private socketListeners = new DisposableStore();
  private outgoingMsgId = 0;
  private readonly outgoingUnackMsg: Array<{ msg: ProtocolMessage; queuedAt: number }> = [];
  private incomingAckId = 0;
  private unackBytes = 0;
  private saturated = false;
  private overflowed = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private ackCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly KEEPALIVE_INTERVAL = 5000;
  private readonly ACK_TIMEOUT = 20000;
  private lastAckTime = Date.now();
  private readonly saturationHighWaterMarkBytes: number;
  private readonly saturationLowWaterMarkBytes: number;
  private readonly replayBufferMaxBytes: number;
  private readonly replayBufferGraceMs: number;

  constructor(socket: ISocket, options: PersistentProtocolOptions = {}) {
    this.saturationHighWaterMarkBytes = options.saturationHighWaterMarkBytes ?? 1024 * 1024;
    this.saturationLowWaterMarkBytes =
      options.saturationLowWaterMarkBytes ?? Math.floor(this.saturationHighWaterMarkBytes / 4);
    this.replayBufferMaxBytes = options.replayBufferMaxBytes ?? 8 * 1024 * 1024;
    this.replayBufferGraceMs = options.replayBufferGraceMs ?? 45000;
    this.socket = socket;
    this.bindSocket();
    this.startKeepalive();
    this.startAckCheck();
  }

  get unacknowledgedBytes(): number {
    return this.unackBytes;
  }

  send(buffer: VSBuffer): void {
    const msg = new ProtocolMessage(
      ProtocolMessageType.Regular,
      ++this.outgoingMsgId,
      this.incomingAckId,
      buffer,
    );
    this.outgoingUnackMsg.push({ msg, queuedAt: Date.now() });
    this.unackBytes += buffer.byteLength;
    this.writeMessage(msg);
    if (this.unackBytes > this.replayBufferMaxBytes) {
      this.abandonSession();
      return;
    }
    if (!this.saturated && this.unackBytes > this.saturationHighWaterMarkBytes) {
      this.saturated = true;
      this.saturatedEmitter.fire();
    }
  }

  replaceSocket(newSocket: ISocket): void {
    this.socketListeners.dispose();
    this.socketListeners = new DisposableStore();
    this.stream = new ChunkStream();
    this.socket = newSocket;
    this.bindSocket();
    for (const entry of this.outgoingUnackMsg) {
      this.writeMessage(entry.msg);
    }
  }

  async drain(): Promise<void> {
    return this.socket.drain();
  }

  dispose(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    if (this.ackCheckTimer) {
      clearInterval(this.ackCheckTimer);
    }
    this.socketListeners.dispose();
    this.messageEmitter.dispose();
    this.closeEmitter.dispose();
    this.socketCloseEmitter.dispose();
    this.saturatedEmitter.dispose();
    this.drainedEmitter.dispose();
    this.socket.dispose();
  }

  private bindSocket(): void {
    this.socketListeners.add(
      this.socket.onData((chunk) => {
        this.stream.acceptChunk(chunk);
        this.readMessages();
      }),
    );
    this.socketListeners.add(this.socket.onClose(() => this.socketCloseEmitter.fire()));
  }

  private writeMessage(msg: ProtocolMessage): void {
    this.socket.write(writeProtocolMessage(msg));
  }

  private abandonSession(): void {
    if (this.overflowed) {
      return;
    }
    this.overflowed = true;
    this.writeMessage(
      new ProtocolMessage(ProtocolMessageType.Disconnect, 0, this.incomingAckId, VSBuffer.alloc(0)),
    );
    this.closeEmitter.fire();
  }

  private processAck(ack: number): void {
    while (this.outgoingUnackMsg.length > 0 && this.outgoingUnackMsg[0].msg.id <= ack) {
      const entry = this.outgoingUnackMsg.shift()!;
      this.unackBytes -= entry.msg.data.byteLength;
    }
    if (this.saturated && this.unackBytes <= this.saturationLowWaterMarkBytes) {
      this.saturated = false;
      this.drainedEmitter.fire();
    }
  }

  private readMessages(): void {
    while (this.stream.byteLength >= HEADER_SIZE) {
      const header = this.stream.peek(HEADER_SIZE);
      if (header === null) {
        break;
      }
      const type = header.readUInt8(0);
      const id = header.readUInt32BE(1);
      const ack = header.readUInt32BE(5);
      const length = header.readUInt32BE(9);
      if (this.stream.byteLength < HEADER_SIZE + length) {
        break;
      }
      this.stream.skip(HEADER_SIZE);
      let body = VSBuffer.alloc(0);
      if (length > 0) {
        const readBody = this.stream.read(length);
        if (readBody === null) {
          throw new Error("PersistentProtocol 读取到完整帧长度后 body 不应为空");
        }
        body = readBody;
      }
      this.processAck(ack);
      switch (type) {
        case ProtocolMessageType.Regular:
          this.incomingAckId = id;
          this.messageEmitter.fire(body);
          break;
        case ProtocolMessageType.Ack:
        case ProtocolMessageType.KeepAlive:
          break;
        case ProtocolMessageType.Disconnect:
          this.closeEmitter.fire();
          break;
      }
      this.lastAckTime = Date.now();
    }
  }

  private startKeepalive(): void {
    this.keepAliveTimer = setInterval(() => {
      this.writeMessage(
        new ProtocolMessage(
          ProtocolMessageType.KeepAlive,
          0,
          this.incomingAckId,
          VSBuffer.alloc(0),
        ),
      );
    }, this.KEEPALIVE_INTERVAL);
  }

  private startAckCheck(): void {
    this.ackCheckTimer = setInterval(() => {
      if (this.outgoingUnackMsg.length > 0 && Date.now() - this.lastAckTime > this.ACK_TIMEOUT) {
        this.socketCloseEmitter.fire();
      }
      const oldest = this.outgoingUnackMsg[0];
      if (oldest && Date.now() - oldest.queuedAt > this.replayBufferGraceMs) {
        this.abandonSession();
      }
    }, this.ACK_TIMEOUT);
  }
}
