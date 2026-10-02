import type { IChannelServer, IChannelClient, IChannel, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";

export type NetworkTransportKind = "http" | "websocket" | "rpc";

export interface NetworkObservation {
  transport: NetworkTransportKind;
  interface: string;
  durationMs: number;
  ok: boolean;
  statusCode?: number;
  errorKind?: string;
  attempt?: number;
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
}

export type NetworkTelemetrySink = (observation: NetworkObservation) => void;

let privateSink: NetworkTelemetrySink | null = null;

export function setNetworkTelemetrySink(sink: NetworkTelemetrySink | null): void {
  privateSink = sink;
}

export function emitNetworkTelemetryObservation(observation: NetworkObservation): void {
  privateSink?.(observation);
}

function classifyErrorKind(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("dns") || message.includes("getaddrinfo") || message.includes("enotfound")) {
    return "dns_failure";
  }
  if (
    message.includes("econnreset") ||
    message.includes("connection reset") ||
    message.includes("econnrefused")
  ) {
    return "connection_reset";
  }
  return "other";
}

function emitRpcObservation(
  channelName: string,
  command: string,
  durationMs: number,
  ok: boolean,
  error?: unknown,
): void {
  emitNetworkTelemetryObservation({
    transport: "rpc",
    interface: channelName + "." + command,
    durationMs: Math.max(0, Math.round(durationMs)),
    ok,
    errorKind: ok ? undefined : classifyErrorKind(error),
    attempt: 1,
  });
}

class NetworkTelemetryServerChannel<TContext> implements IServerChannel<TContext> {
  constructor(
    private readonly inner: IServerChannel<TContext>,
    private readonly channelName: string,
  ) {}

  async call<T>(
    ctx: TContext,
    command: string,
    arg?: unknown,
    cancellationToken?: CancellationToken,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await this.inner.call<T>(ctx, command, arg, cancellationToken);
      emitRpcObservation(this.channelName, command, performance.now() - start, true);
      return result;
    } catch (error) {
      emitRpcObservation(this.channelName, command, performance.now() - start, false, error);
      throw error;
    }
  }

  listen<T>(ctx: TContext, event: string, arg?: unknown): Event<T> {
    return this.inner.listen<T>(ctx, event, arg);
  }
}

class NetworkTelemetryChannel implements IChannel {
  constructor(
    private readonly inner: IChannel,
    private readonly channelName: string,
  ) {}

  async call<T>(command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T> {
    const start = performance.now();
    try {
      const result = await this.inner.call<T>(command, arg, cancellationToken);
      emitRpcObservation(this.channelName, command, performance.now() - start, true);
      return result;
    } catch (error) {
      emitRpcObservation(this.channelName, command, performance.now() - start, false, error);
      throw error;
    }
  }

  listen<T>(event: string, arg?: unknown): Event<T> {
    return this.inner.listen<T>(event, arg);
  }
}

export class NetworkTelemetryChannelServer<TContext = string> implements IChannelServer<TContext> {
  constructor(private readonly inner: IChannelServer<TContext>) {}

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.inner.registerChannel(
      channelName,
      new NetworkTelemetryServerChannel(channel, channelName),
    );
  }

  ready(): void {
    this.inner.ready?.();
  }
}

export class NetworkTelemetryChannelClient implements IChannelClient {
  constructor(private readonly inner: IChannelClient) {}

  getChannel<T extends IChannel>(channelName: string): T {
    const channel = this.inner.getChannel<T>(channelName);
    return new NetworkTelemetryChannel(channel as IChannel, channelName) as unknown as T;
  }
}
