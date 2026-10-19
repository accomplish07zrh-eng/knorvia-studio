// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
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

let sinkInUse: NetworkTelemetrySink | null = null;

export function setNetworkTelemetrySink(sink: NetworkTelemetrySink | null): void {
  sinkInUse = sink;
}

export function emitNetworkTelemetryObservation(observation: NetworkObservation): void {
  const sink = sinkInUse;
  if (sink !== null) {
    sink(observation);
  }
}

const FAILURE_KINDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["timeout", ["timeout", "timed out"]],
  ["dns_failure", ["dns", "getaddrinfo", "enotfound"]],
  ["connection_reset", ["econnreset", "connection reset", "econnrefused"]],
];

function failureKind(failure: unknown): string {
  const text =
    failure instanceof Error ? failure.message.toLowerCase() : String(failure).toLowerCase();
  for (const [kind, needles] of FAILURE_KINDS) {
    if (needles.some((needle) => text.includes(needle))) {
      return kind;
    }
  }
  return "other";
}

function report(
  channelName: string,
  command: string,
  startedAt: number,
  failure?: { reason: unknown },
): void {
  const observation: NetworkObservation = {
    transport: "rpc",
    interface: channelName + "." + command,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ok: failure === undefined,
    errorKind: failure === undefined ? undefined : failureKind(failure.reason),
    attempt: 1,
  };
  emitNetworkTelemetryObservation(observation);
}

async function observeInvocation<T>(
  channelName: string,
  command: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  let value: T;
  try {
    value = await invoke();
  } catch (reason) {
    report(channelName, command, startedAt, { reason });
    throw reason;
  }
  report(channelName, command, startedAt);
  return value;
}

class ObservedServerChannel<TContext> implements IServerChannel<TContext> {
  constructor(
    private readonly target: IServerChannel<TContext>,
    private readonly prefix: string,
  ) {}

  call<T>(
    ctx: TContext,
    command: string,
    arg?: unknown,
    cancellationToken?: CancellationToken,
  ): Promise<T> {
    return observeInvocation(this.prefix, command, () =>
      this.target.call<T>(ctx, command, arg, cancellationToken),
    );
  }

  listen<T>(ctx: TContext, event: string, arg?: unknown): Event<T> {
    return this.target.listen<T>(ctx, event, arg);
  }
}

class ObservedClientChannel implements IChannel {
  constructor(
    private readonly target: IChannel,
    private readonly prefix: string,
  ) {}

  call<T>(command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T> {
    return observeInvocation(this.prefix, command, () =>
      this.target.call<T>(command, arg, cancellationToken),
    );
  }

  listen<T>(event: string, arg?: unknown): Event<T> {
    return this.target.listen<T>(event, arg);
  }
}

export class NetworkTelemetryChannelServer<TContext = string> implements IChannelServer<TContext> {
  constructor(private readonly inner: IChannelServer<TContext>) {}

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.inner.registerChannel(channelName, new ObservedServerChannel(channel, channelName));
  }

  ready(): void {
    this.inner.ready?.();
  }
}

export class NetworkTelemetryChannelClient implements IChannelClient {
  constructor(private readonly inner: IChannelClient) {}

  getChannel<T extends IChannel>(channelName: string): T {
    const channel = this.inner.getChannel<T>(channelName);
    return new ObservedClientChannel(channel as IChannel, channelName) as unknown as T;
  }
}
