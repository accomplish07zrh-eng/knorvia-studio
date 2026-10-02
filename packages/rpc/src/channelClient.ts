import { VSBuffer } from "./buffer.js";
import { CancellationToken, Emitter, Event, type IDisposable } from "./foundation.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  type IChannel,
  type IChannelClient,
  type IHandler,
  type IRawResponse,
  RequestType,
  ResponseType,
} from "./channels.shared.js";

enum ClientState {
  Uninitialized,
  Idle,
}

export class ChannelClient implements IChannelClient, IDisposable {
  private state = ClientState.Uninitialized;
  private disposed = false;
  private nextId = 0;
  private readonly activeRequests = new Set<IDisposable>();
  private readonly handlers = new Map<number, IHandler>();
  private readonly pendingRejections = new Map<number, (error: Error) => void>();
  private readonly initializeEmitter = new Emitter<void>();
  readonly onDidInitialize: Event<void> = this.initializeEmitter.event;
  private protocolListener: IDisposable | null;

  constructor(private readonly protocol: IMessagePassingProtocol) {
    this.protocolListener = protocol.onMessage((buffer) => this.onBuffer(buffer));
  }

  getChannel<T extends IChannel>(channelName: string): T {
    return {
      call: <R>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<R> => {
        if (this.disposed) {
          return Promise.reject(new Error("ChannelClient is disposed"));
        }
        return this.requestPromise(channelName, command, arg, cancellationToken);
      },
      listen: <R>(event: string, arg?: any): Event<R> => {
        if (this.disposed) {
          return Event.None;
        }
        return this.requestEvent(channelName, event, arg);
      },
    } as T;
  }

  private whenInitialized(): Promise<void> {
    return this.state === ClientState.Idle
      ? Promise.resolve()
      : Event.toPromise(this.onDidInitialize);
  }

  private requestPromise(
    channelName: string,
    name: string,
    arg?: any,
    token: CancellationToken = CancellationToken.None,
  ): Promise<any> {
    const id = this.nextId++;
    if (token.isCancellationRequested) {
      return Promise.reject(new Error("Cancelled"));
    }

    let cancellationListener: IDisposable | undefined;
    const result = new Promise<any>((resolve, reject) => {
      this.pendingRejections.set(id, reject);

      const doRequest = () => {
        if (this.disposed || !this.pendingRejections.has(id)) {
          return;
        }
        const handler: IHandler = (response) => {
          switch (response.type) {
            case ResponseType.PromiseSuccess:
              this.handlers.delete(id);
              this.pendingRejections.delete(id);
              resolve(response.data);
              break;
            case ResponseType.PromiseError: {
              this.handlers.delete(id);
              this.pendingRejections.delete(id);
              const payload = response.data;
              const error = new Error(payload.message);
              error.name = payload.name;
              if (payload.stack) {
                error.stack = payload.stack.join("\n");
              }
              const metadataKeys = [
                "code",
                "kind",
                "status",
                "retryAfterMs",
                "data",
                "detail",
                "details",
                "taskId",
                "traceId",
              ] as const;
              for (const key of metadataKeys) {
                const value = payload[key];
                if (value !== undefined) {
                  (error as Error & Record<string, unknown>)[key] = value;
                }
              }
              reject(error);
              break;
            }
            case ResponseType.PromiseErrorObj:
              this.handlers.delete(id);
              this.pendingRejections.delete(id);
              reject(response.data);
              break;
          }
        };

        this.handlers.set(id, handler);
        this.sendRequest(RequestType.Promise, id, channelName, name, arg);
      };

      if (this.state === ClientState.Idle) {
        doRequest();
      } else {
        this.whenInitialized().then(doRequest);
      }

      cancellationListener = token.onCancellationRequested(() => {
        if (!this.pendingRejections.has(id)) {
          return;
        }
        this.sendCancelOrDispose(RequestType.PromiseCancel, id);
        this.handlers.delete(id);
        this.pendingRejections.delete(id);
        reject(new Error("Cancelled"));
      });
      this.activeRequests.add(cancellationListener);
    });

    return result.finally(() => {
      cancellationListener?.dispose();
      if (cancellationListener) {
        this.activeRequests.delete(cancellationListener);
      }
    });
  }

  private requestEvent(channelName: string, name: string, arg?: any): Event<any> {
    const id = this.nextId++;
    const emitter = new Emitter<any>({
      onWillAddFirstListener: () => {
        const doRequest = () => {
          this.activeRequests.add(emitter);
          this.sendRequest(RequestType.EventListen, id, channelName, name, arg);
        };
        if (this.state === ClientState.Idle) {
          doRequest();
        } else {
          this.whenInitialized().then(doRequest);
        }
      },
      onDidRemoveLastListener: () => {
        this.activeRequests.delete(emitter);
        this.sendCancelOrDispose(RequestType.EventDispose, id);
        this.handlers.delete(id);
      },
    });
    this.handlers.set(id, (response) => {
      const eventResponse = response as Extract<IRawResponse, { type: ResponseType.EventFire }>;
      emitter.fire(eventResponse.data);
    });
    return emitter.event;
  }

  private sendRequest(
    type: RequestType,
    id: number,
    channelName: string,
    name: string,
    arg: any,
  ): void {
    const writer = new BufferWriter();
    serialize(writer, [type, id, channelName, name]);
    serialize(writer, arg);
    try {
      this.protocol.send(writer.buffer);
    } catch {
      // Transport send failures do not change request settlement.
    }
  }

  private sendCancelOrDispose(type: RequestType, id: number): void {
    const writer = new BufferWriter();
    serialize(writer, [type, id]);
    serialize(writer, undefined);
    try {
      this.protocol.send(writer.buffer);
    } catch {
      // Transport send failures do not change local cleanup.
    }
  }

  private onBuffer(buffer: VSBuffer): void {
    const reader = new BufferReader(buffer);
    const header = deserialize(reader);
    const body = deserialize(reader);
    const type = header[0];
    switch (type) {
      case ResponseType.Initialize:
        this.onResponse({ type });
        break;
      case ResponseType.PromiseSuccess:
      case ResponseType.PromiseError:
      case ResponseType.PromiseErrorObj:
      case ResponseType.EventFire:
        this.onResponse({ type, id: header[1], data: body });
        break;
    }
  }

  private onResponse(response: IRawResponse): void {
    if (response.type === ResponseType.Initialize) {
      this.state = ClientState.Idle;
      this.initializeEmitter.fire();
      return;
    }
    this.handlers.get(response.id)?.(response);
  }

  dispose(reason?: Error): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.protocolListener?.dispose();
    this.protocolListener = null;

    const error = reason ?? new Error("ChannelClient disposed");
    if (!reason) {
      error.name = "ConnectionClosed";
    }
    for (const [id, reject] of this.pendingRejections) {
      this.pendingRejections.delete(id);
      this.handlers.delete(id);
      reject(error);
    }
    for (const resource of this.activeRequests) {
      resource.dispose();
    }
    this.activeRequests.clear();
    this.pendingRejections.clear();
    this.initializeEmitter.dispose();
  }
}
