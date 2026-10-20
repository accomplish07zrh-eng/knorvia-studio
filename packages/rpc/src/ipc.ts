// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import {
  DisposableStore,
  Emitter,
  Event,
  toDisposable,
  type CancellationToken,
  type IDisposable,
} from "./foundation.js";
import { BufferReader, BufferWriter, deserialize, serialize } from "./serialization.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  ChannelClient,
  ChannelServer,
  getDelayedChannel,
  type IChannel,
  type IChannelClient,
  type IChannelServer,
  type IServerChannel,
} from "./channels.js";

export type ClientConnectionEvent = Readonly<{
  protocol: IMessagePassingProtocol;
  onDidClientDisconnect: Event<void>;
}>;

export type Client<Peer> = Readonly<{ ctx: Peer }>;

/** 一条已建立的连接：两个端点共享同一个 protocol，服务端与客户端各自的 channel 表独立。 */
type Connection<Peer> = Client<Peer> &
  Readonly<{
    channelServer: ChannelServer<Peer>;
    channelClient: ChannelClient;
  }>;

export type IConnectionHub<Peer> = Readonly<{
  connections: Connection<Peer>[];
  onDidAddConnection: Event<Connection<Peer>>;
  onDidRemoveConnection: Event<Connection<Peer>>;
}>;

export interface IClientRouter<Peer = string> {
  routeCall(
    hub: IConnectionHub<Peer>,
    name: string,
    data?: any,
    token?: CancellationToken,
  ): Promise<Client<Peer>>;
  routeEvent(hub: IConnectionHub<Peer>, name: string, data?: any): Promise<Client<Peer>>;
}

type ClientFilter<Peer> = (client: Client<Peer>) => boolean;

export class IPCServer<Peer = string>
  implements IChannelServer<Peer>, IConnectionHub<Peer>, IDisposable
{
  readonly #channels = new Map<string, IServerChannel<Peer>>();
  readonly #connections = new Set<Connection<Peer>>();
  readonly #added = new Emitter<Connection<Peer>>();
  readonly #removed = new Emitter<Connection<Peer>>();
  readonly #subscriptions = new DisposableStore();

  readonly onDidAddConnection = this.#added.event;
  readonly onDidRemoveConnection = this.#removed.event;

  get connections(): Connection<Peer>[] {
    return [...this.#connections];
  }

  constructor(connect: Event<ClientConnectionEvent>) {
    this.#subscriptions.add(connect((event) => this.#admit(event)));
  }

  /** 首条消息即握手：反序列化出 ctx 后建立双向端点。 */
  #admit({ protocol, onDidClientDisconnect }: ClientConnectionEvent): void {
    this.#subscriptions.add(
      Event.once(protocol.onMessage)((message) => {
        const ctx = deserialize(new BufferReader(message)) as Peer;
        const server = new ChannelServer(protocol, ctx);
        const client = new ChannelClient(protocol);
        for (const [name, channel] of this.#channels) server.registerChannel(name, channel);

        const connection: Connection<Peer> = { channelServer: server, channelClient: client, ctx };
        this.#connections.add(connection);
        this.#added.fire(connection);

        this.#subscriptions.add(
          onDidClientDisconnect(() => {
            const owned = this.#connections.delete(connection);
            server.dispose();
            client.dispose();
            if (owned) this.#removed.fire(connection);
          }),
        );
      }),
    );
  }

  getChannel<T extends IChannel>(
    channelName: string,
    routerOrFilter: IClientRouter<Peer> | ClientFilter<Peer>,
  ): T {
    const filter = typeof routerOrFilter === "function" ? routerOrFilter : undefined;
    const router = filter ? undefined : (routerOrFilter as IClientRouter<Peer>);

    const channelFor = (client: Client<Peer>): IChannel =>
      (client as Connection<Peer>).channelClient.getChannel(channelName);

    return {
      call: (name: string, data?: any, token?: CancellationToken) => {
        const peer: Promise<Client<Peer>> = filter
          ? this.#awaitMatch(filter)
          : router!.routeCall(this, name, data, token);
        return getDelayedChannel(peer.then(channelFor)).call(name, data, token);
      },
      listen: (name: string, data?: any): Event<any> => {
        if (filter) return this.#fanOut(channelName, filter, name, data);
        const peer = router!.routeEvent(this, name, data).then(channelFor);
        return getDelayedChannel(peer).listen(name, data);
      },
    } as T;
  }

  #awaitMatch(filter: ClientFilter<Peer>): Promise<Client<Peer>> {
    const existing = this.connections.find(filter);
    return existing
      ? Promise.resolve(existing)
      : Event.toPromise(Event.filter(this.onDidAddConnection, filter));
  }

  /**
   * 多播：现有连接逐个订阅，后续连接加入时补订阅；最后一个监听器离开时全部释放。
   * 连接的生命周期由 onDidAddConnection 驱动，因此后加入的连接也会被覆盖。
   */
  #fanOut<T>(channelName: string, filter: ClientFilter<Peer>, name: string, data: any): Event<T> {
    let active = 0;
    let attached: DisposableStore | undefined;
    const emitter = new Emitter<T>();

    const attach = (connection: Connection<Peer>): void => {
      const channel = connection.channelClient.getChannel(channelName);
      const subscription = channel.listen<T>(
        name,
        data,
      )((value) => {
        emitter.fire(value);
      });
      attached?.add(subscription);
    };

    const event_ = emitter.event;
    return (listener: (value: T) => void): IDisposable => {
      if (active === 0) {
        const subscriptions = new DisposableStore();
        attached = subscriptions;
        for (const connection of this.connections.filter(filter)) attach(connection);
        subscriptions.add(
          Event.filter(
            this.onDidAddConnection,
            filter,
          )((connection) => {
            attach(connection);
          }),
        );
      }
      active += 1;
      const subscription = event_(listener);
      return toDisposable(() => {
        subscription.dispose();
        active -= 1;
        if (active > 0) return;
        const subscriptions = attached;
        attached = undefined;
        subscriptions?.dispose();
      });
    };
  }

  registerChannel(channelName: string, channel: IServerChannel<Peer>): void {
    this.#channels.set(channelName, channel);
    for (const connection of this.#connections) {
      connection.channelServer.registerChannel(channelName, channel);
    }
  }

  dispose(): void {
    this.#subscriptions.dispose();
    for (const connection of this.#connections) {
      connection.channelClient.dispose();
      connection.channelServer.dispose();
    }
    this.#connections.clear();
    this.#channels.clear();
    this.#added.dispose();
    this.#removed.dispose();
  }
}

export class IPCClient<Peer = string> implements IChannelClient, IChannelServer<Peer>, IDisposable {
  readonly #channelClient: ChannelClient;
  readonly #channelServer: ChannelServer<Peer>;

  constructor(protocol: IMessagePassingProtocol, ctx: Peer) {
    const handshake = new BufferWriter();
    serialize(handshake, ctx);
    protocol.send(handshake.buffer);
    this.#channelClient = new ChannelClient(protocol);
    this.#channelServer = new ChannelServer(protocol, ctx);
  }

  getChannel<T extends IChannel>(channelName: string): T {
    return this.#channelClient.getChannel<T>(channelName);
  }

  registerChannel(channelName: string, channel: IServerChannel<Peer>): void {
    this.#channelServer.registerChannel(channelName, channel);
  }

  dispose(): void {
    this.#channelClient.dispose();
    this.#channelServer.dispose();
  }
}

export class StaticRouter<Peer = string> implements IClientRouter<Peer> {
  readonly #accepts: (ctx: Peer) => boolean | Promise<boolean>;

  constructor(accepts: (ctx: Peer) => boolean | Promise<boolean>) {
    this.#accepts = accepts;
  }

  routeCall(hub: IConnectionHub<Peer>): Promise<Client<Peer>> {
    return this.#pick(hub);
  }

  routeEvent(hub: IConnectionHub<Peer>): Promise<Client<Peer>> {
    return this.#pick(hub);
  }

  async #pick(hub: IConnectionHub<Peer>): Promise<Client<Peer>> {
    for (;;) {
      for (const connection of hub.connections) {
        if (await this.#accepts(connection.ctx)) return connection;
      }
      await Event.toPromise(hub.onDidAddConnection);
    }
  }
}
