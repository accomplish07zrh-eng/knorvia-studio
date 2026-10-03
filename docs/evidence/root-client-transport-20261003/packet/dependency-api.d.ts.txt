// Bounded handwritten public surfaces verified against source declarations.
// Package @knorvia/rpc:
export interface IDisposable { dispose(): void; }
export type Event<T> = (listener: (event: T) => void) => IDisposable;
export declare class Emitter<T> implements IDisposable {
  constructor(options?: { onWillAddFirstListener?: () => void; onDidRemoveLastListener?: () => void });
  get event(): Event<T>;
  fire(event: T): void;
  dispose(): void;
}
export declare class VSBuffer {
  readonly buffer: Uint8Array;
  readonly byteLength: number;
  static wrap(actual: Uint8Array): VSBuffer;
}
export interface IMessagePassingProtocol {
  send(buffer: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}
export interface ISocket extends IDisposable {
  onData: Event<VSBuffer>;
  onClose: Event<void>;
  onEnd: Event<void>;
  write(buffer: VSBuffer): void;
  end(): void;
  drain(): Promise<void>;
}
export interface IChannel {
  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
  listen<T>(event: string, arg?: any): Event<T>;
}
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: Event<void>;
}
export interface IChannelClient { getChannel<T extends IChannel>(channelName: string): T; }
export declare class ChannelClient implements IChannelClient, IDisposable {
  readonly onDidInitialize: Event<void>;
  constructor(protocol: IMessagePassingProtocol);
  getChannel<T extends IChannel>(channelName: string): T;
  dispose(reason?: Error): void;
}
export declare class MessagePortProtocol implements IMessagePassingProtocol {
  readonly onMessage: Event<VSBuffer>;
  constructor(port: MessagePortLike);
  send(buffer: VSBuffer): void;
  disconnect(): void;
}
export type MessagePortPayload = Uint8Array | { __knorviaRpcControl: "connection-flow-v1"; state: "saturated" | "drained" };
export interface MessagePortLike {
  addEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  removeEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  postMessage(message: MessagePortPayload): void;
  start(): void;
  close(): void;
}
export declare class SocketProtocol implements IMessagePassingProtocol {
  readonly onMessage: Event<VSBuffer>;
  constructor(socket: ISocket);
  send(buffer: VSBuffer): void;
  drain(): Promise<void>;
  dispose(): void;
}
export declare namespace ProxyChannel {
  function toService<T extends object>(channel: IChannel, options?: { context?: unknown }): T;
}
// Existing local logging collaborator:
export declare function isRendererProductionBuild(): boolean;
// RemoteServiceAccess public declarations are in its separate input; service fields
// use the unmodified @knorvia/services descriptors and IServiceAccessor surface.
