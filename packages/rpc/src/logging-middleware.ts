// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

import type { IChannel, IChannelClient, IChannelServer, IServerChannel } from "./channels.js";
import type { CancellationToken, Event } from "./foundation.js";

export type RPCLogger = (message: string, ...args: unknown[]) => void;

function elapsedSince(origin: number): string {
  return (performance.now() - origin).toFixed(1);
}

/**
 * Times one awaited RPC invocation and writes the outcome through the caller's
 * logger. Success and failure share the same measurement window; the failure
 * path forwards the original error as the logger's second argument and then
 * rethrows it without any wrapping.
 */
async function traceCall<T>(
  logger: RPCLogger,
  headline: string,
  invoke: () => Promise<T>,
): Promise<T> {
  const origin = performance.now();
  try {
    const value = await invoke();
    logger(`${headline} OK (${elapsedSince(origin)}ms)`);
    return value;
  } catch (failure) {
    logger(`${headline} FAIL (${elapsedSince(origin)}ms)`, failure);
    throw failure;
  }
}

class AuditedServerChannel<TContext> implements IServerChannel<TContext> {
  constructor(
    private readonly delegate: IServerChannel<TContext>,
    private readonly label: string,
    private readonly write: RPCLogger,
  ) {}

  call<T>(
    ctx: TContext,
    command: string,
    arg?: any,
    cancellationToken?: CancellationToken,
  ): Promise<T> {
    return traceCall(this.write, `[rpc:call] ${this.label}.${command}`, () =>
      this.delegate.call<T>(ctx, command, arg, cancellationToken),
    );
  }

  listen<T>(ctx: TContext, event: string, arg?: any): Event<T> {
    try {
      const subscription = this.delegate.listen<T>(ctx, event, arg);
      this.write(`[rpc:listen] ${this.label}.${event} subscribed`);
      return subscription;
    } catch (failure) {
      this.write(`[rpc:listen] ${this.label}.${event} FAIL`, failure);
      throw failure;
    }
  }
}

class AuditedClientChannel implements IChannel {
  constructor(
    private readonly delegate: IChannel,
    private readonly label: string,
    private readonly write: RPCLogger,
  ) {}

  call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
    return traceCall(this.write, `[rpc:call] ${this.label}.${command} →`, () =>
      this.delegate.call<T>(command, arg, cancellationToken),
    );
  }

  listen<T>(event: string, arg?: any): Event<T> {
    this.write(`[rpc:listen] ${this.label}.${event} → subscribed`);
    return this.delegate.listen<T>(event, arg);
  }
}

export class LoggingChannelServer<TContext = string> implements IChannelServer<TContext> {
  constructor(
    private readonly inner: IChannelServer<TContext>,
    private readonly logger: RPCLogger,
  ) {}

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.logger(`[rpc:register] channel "${channelName}"`);
    this.inner.registerChannel(
      channelName,
      new AuditedServerChannel(channel, channelName, (message, ...rest) =>
        this.logger(message, ...rest),
      ),
    );
  }

  ready(): void {
    this.inner.ready?.();
  }
}

export class LoggingChannelClient implements IChannelClient {
  constructor(
    private readonly inner: IChannelClient,
    private readonly logger: RPCLogger,
  ) {}

  getChannel<T extends IChannel>(channelName: string): T {
    const channel = this.inner.getChannel<T>(channelName);
    return new AuditedClientChannel(channel as IChannel, channelName, (message, ...rest) =>
      this.logger(message, ...rest),
    ) as unknown as T;
  }
}
