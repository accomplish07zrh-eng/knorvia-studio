import type { VSBuffer } from "./buffer.js";
import { CancellationTokenSource, toDisposable, type IDisposable } from "./foundation.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  RequestType,
  ResponseType,
  type IChannelServer,
  type IRawResponse,
  type IServerChannel,
} from "./channels.shared.js";

export class ChannelServer<TContext = string> implements IChannelServer<TContext>, IDisposable {
  private readonly channels = new Map<string, IServerChannel<TContext>>();
  private readonly activeRequests = new Map<number, IDisposable>();
  private readonly pendingRequests = new Map<
    string,
    Array<{ request: any; timer: ReturnType<typeof setTimeout> }>
  >();
  private protocolListener: IDisposable | null;

  constructor(
    private readonly protocol: IMessagePassingProtocol,
    private readonly ctx: TContext,
    private readonly timeoutDelay = 1000,
    deferInit = false,
  ) {
    this.protocolListener = protocol.onMessage((message) => this.onRawMessage(message));
    if (!deferInit) {
      this.sendResponse({ type: ResponseType.Initialize });
    }
  }

  ready(): void {
    this.sendResponse({ type: ResponseType.Initialize });
  }

  registerChannel(name: string, channel: IServerChannel<TContext>): void {
    this.channels.set(name, channel);
    setTimeout(() => this.flushPendingRequests(name), 0);
  }

  private sendResponse(response: IRawResponse): void {
    switch (response.type) {
      case ResponseType.Initialize:
        this.send([response.type]);
        break;
      case ResponseType.PromiseSuccess:
      case ResponseType.PromiseError:
      case ResponseType.PromiseErrorObj:
      case ResponseType.EventFire:
        this.send([response.type, response.id], response.data);
        break;
    }
  }

  private send(header: any, body: any = undefined): void {
    const writer = new BufferWriter();
    serialize(writer, header);
    serialize(writer, body);
    try {
      this.protocol.send(writer.buffer);
    } catch {
      // Transport send failures are intentionally ignored.
    }
  }

  private onRawMessage(message: VSBuffer): void {
    const reader = new BufferReader(message);
    const header = deserialize(reader);
    const body = deserialize(reader);
    switch (header[0]) {
      case RequestType.Promise:
        this.onPromise({
          type: header[0],
          id: header[1],
          channelName: header[2],
          name: header[3],
          arg: body,
        });
        break;
      case RequestType.EventListen:
        this.onEventListen({
          type: header[0],
          id: header[1],
          channelName: header[2],
          name: header[3],
          arg: body,
        });
        break;
      case RequestType.PromiseCancel:
      case RequestType.EventDispose:
        this.disposeActiveRequest(header[1]);
        break;
    }
  }

  private onPromise(request: any): void {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }

    const cancellation = new CancellationTokenSource();
    let promise: Promise<any>;
    try {
      promise = channel.call(this.ctx, request.name, request.arg, cancellation.token);
    } catch (error) {
      promise = Promise.reject(error);
    }

    const disposable = toDisposable(() => cancellation.cancel());
    this.activeRequests.set(request.id, disposable);
    promise
      .then(
        (data) => {
          this.sendResponse({ type: ResponseType.PromiseSuccess, id: request.id, data });
        },
        (error) => {
          if (error instanceof Error) {
            const data: {
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
            } = {
              message: error.message,
              name: error.name,
              stack: error.stack ? error.stack.split("\n") : undefined,
            };
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
            const extendedError = error as Error & Record<string, unknown>;
            for (const key of metadataKeys) {
              const value = extendedError[key];
              if (value !== undefined) {
                data[key] = value;
              }
            }
            this.sendResponse({ type: ResponseType.PromiseError, id: request.id, data });
            return;
          }
          this.sendResponse({ type: ResponseType.PromiseErrorObj, id: request.id, data: error });
        },
      )
      .finally(() => {
        disposable.dispose();
        this.activeRequests.delete(request.id);
      });
  }

  private onEventListen(request: any): void {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }

    const disposable = channel.listen(
      this.ctx,
      request.name,
      request.arg,
    )((data) => {
      this.sendResponse({ type: ResponseType.EventFire, id: request.id, data });
    });
    this.activeRequests.set(request.id, disposable);
  }

  private disposeActiveRequest(id: number): void {
    const disposable = this.activeRequests.get(id);
    if (!disposable) {
      return;
    }
    disposable.dispose();
    this.activeRequests.delete(id);
  }

  private collectPendingRequest(request: any): void {
    const pending = this.pendingRequests.get(request.channelName) ?? [];
    if (pending.length === 0) {
      this.pendingRequests.set(request.channelName, pending);
    }
    const timer = setTimeout(() => {
      console.error(`Unknown channel: ${request.channelName}`);
      if (request.type !== RequestType.Promise) {
        return;
      }
      this.sendResponse({
        type: ResponseType.PromiseError,
        id: request.id,
        data: {
          name: "Unknown channel",
          message: `Channel name '${request.channelName}' timed out after ${this.timeoutDelay}ms`,
          stack: undefined,
        },
      });
    }, this.timeoutDelay);
    pending.push({ request, timer });
  }

  private flushPendingRequests(name: string): void {
    const pending = this.pendingRequests.get(name);
    if (!pending) {
      return;
    }
    for (const { request, timer } of pending) {
      clearTimeout(timer);
      switch (request.type) {
        case RequestType.Promise:
          this.onPromise(request);
          break;
        case RequestType.EventListen:
          this.onEventListen(request);
          break;
      }
    }
    this.pendingRequests.delete(name);
  }

  dispose(): void {
    this.protocolListener?.dispose();
    this.protocolListener = null;
    for (const disposable of this.activeRequests.values()) {
      disposable.dispose();
    }
    this.activeRequests.clear();
  }
}
