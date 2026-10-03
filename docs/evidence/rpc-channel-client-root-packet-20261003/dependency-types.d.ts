import type { VSBuffer } from "./buffer.js";

export interface IDisposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => void) => IDisposable;

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: Event<void>;
}

export declare namespace Event {
  const None: Event<any>;
  function toPromise<T>(event: Event<T>): Promise<T>;
}

export declare namespace CancellationToken {
  const None: CancellationToken;
}

interface EmitterOptions {
  onWillAddFirstListener?: () => void;
  onDidRemoveLastListener?: () => void;
}

export declare class Emitter<T> implements IDisposable {
  constructor(options?: EmitterOptions);
  get event(): Event<T>;
  fire(event: T): void;
  dispose(): void;
}

export interface IChannel {
  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T>;
  listen<T>(event: string, arg?: any): Event<T>;
}

export const enum RequestType {
  Promise = 100,
  PromiseCancel = 101,
  EventListen = 102,
  EventDispose = 103,
}

export const enum ResponseType {
  Initialize = 200,
  PromiseSuccess = 201,
  PromiseError = 202,
  PromiseErrorObj = 203,
  EventFire = 204,
}

export type IRawResponse =
  | { type: ResponseType.Initialize }
  | { type: ResponseType.PromiseSuccess; id: number; data: any }
  | {
      type: ResponseType.PromiseError;
      id: number;
      data: {
        message: string;
        name: string;
        stack: string[] | undefined;
        code?: unknown;
        kind?: unknown;
        status?: unknown;
        retryAfterMs?: unknown;
        data?: unknown;
        detail?: unknown;
        details?: unknown;
        taskId?: unknown;
        traceId?: unknown;
      };
    }
  | { type: ResponseType.PromiseErrorObj; id: number; data: any }
  | { type: ResponseType.EventFire; id: number; data: any };

export type IHandler = (response: IRawResponse) => void;

export interface IChannelClient {
  getChannel<T extends IChannel>(channelName: string): T;
}

export interface IMessagePassingProtocol {
  send(buffer: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}

export interface IReader {
  read(bytes: number): VSBuffer;
}

export interface IWriter {
  write(buffer: VSBuffer): void;
}

export declare function serialize(writer: IWriter, data: any): void;

export declare function deserialize(reader: IReader): any;

export declare class BufferReader implements IReader {
  constructor(buffer: VSBuffer);
  read(bytes: number): VSBuffer;
}

export declare class BufferWriter implements IWriter {
  get buffer(): VSBuffer;
  write(buffer: VSBuffer): void;
}
