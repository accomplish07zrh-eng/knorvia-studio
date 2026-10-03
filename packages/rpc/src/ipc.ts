import {
  Event,
  Emitter,
  DisposableStore,
  EventMultiplexer,
  type IDisposable,
  type CancellationToken,
} from "./foundation.js";
import { BufferReader, BufferWriter, serialize, deserialize } from "./serialization.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import {
  ChannelServer,
  ChannelClient,
  getDelayedChannel,
  type IChannel,
  type IServerChannel,
  type IChannelServer,
  type IChannelClient,
} from "./channels.js";

export interface ClientConnectionEvent {
  protocol: IMessagePassingProtocol;
  readonly onDidClientDisconnect: Event<void>;
}

export interface Client<TContext> {
  readonly ctx: TContext;
}

interface Connection<TContext> extends Client<TContext> {
  readonly channelServer: ChannelServer<TContext>;
  readonly channelClient: ChannelClient;
}

export interface IConnectionHub<TContext> {
  readonly connections: Connection<TContext>[];
  readonly onDidAddConnection: Event<Connection<TContext>>;
  readonly onDidRemoveConnection: Event<Connection<TContext>>;
}

export interface IClientRouter<TContext = string> {
  routeCall(
    hub: IConnectionHub<TContext>,
    command: string,
    arg?: any,
    cancellationToken?: CancellationToken,
  ): Promise<Client<TContext>>;
  routeEvent(hub: IConnectionHub<TContext>, event: string, arg?: any): Promise<Client<TContext>>;
}

export class IPCServer<TContext = string>
  implements IChannelServer<TContext>, IConnectionHub<TContext>, IDisposable
{
  private readonly channels = new Map<string, IServerChannel<TContext>>();
  private readonly connectionSet = new Set<Connection<TContext>>();
  private readonly addEmitter = new Emitter<Connection<TContext>>();
  private readonly removeEmitter = new Emitter<Connection<TContext>>();
  private readonly disposables = new DisposableStore();

  readonly onDidAddConnection = this.addEmitter.event;
  readonly onDidRemoveConnection = this.removeEmitter.event;

  get connections(): Connection<TContext>[] {
    return Array.from(this.connectionSet);
  }

  constructor(onDidClientConnect: Event<ClientConnectionEvent>) {
    this.disposables.add(
      onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
        const onFirstMessage = Event.once(protocol.onMessage);
        this.disposables.add(
          onFirstMessage((message) => {
            const ctx = deserialize(new BufferReader(message)) as TContext;
            const channelServer = new ChannelServer(protocol, ctx);
            const channelClient = new ChannelClient(protocol);

            this.channels.forEach((channel, name) => {
              channelServer.registerChannel(name, channel);
            });

            const connection: Connection<TContext> = { channelServer, channelClient, ctx };
            this.connectionSet.add(connection);
            this.addEmitter.fire(connection);

            this.disposables.add(
              onDidClientDisconnect(() => {
                channelServer.dispose();
                channelClient.dispose();
                this.connectionSet.delete(connection);
                this.removeEmitter.fire(connection);
              }),
            );
          }),
        );
      }),
    );
  }

  getChannel<T extends IChannel>(
    channelName: string,
    routerOrFilter: IClientRouter<TContext> | ((client: Client<TContext>) => boolean),
  ): T {
    const isFilter = typeof routerOrFilter === "function";

    return {
      call: (command: string, arg?: any, cancellationToken?: CancellationToken): Promise<any> => {
        let connectionPromise: Promise<Client<TContext>>;

        if (isFilter) {
          const filter = routerOrFilter as (client: Client<TContext>) => boolean;
          const connection = this.connections.find(filter);
          connectionPromise = connection
            ? Promise.resolve(connection)
            : Event.toPromise(Event.filter(this.onDidAddConnection, filter));
        } else {
          const router = routerOrFilter as IClientRouter<TContext>;
          connectionPromise = router.routeCall(this, command, arg, cancellationToken);
        }

        const channelPromise = connectionPromise.then((connection) =>
          (connection as Connection<TContext>).channelClient.getChannel(channelName),
        );
        return getDelayedChannel(channelPromise).call(command, arg, cancellationToken);
      },
      listen: (event: string, arg?: any): Event<any> => {
        if (isFilter) {
          return this.getMulticastEvent(
            channelName,
            routerOrFilter as (client: Client<TContext>) => boolean,
            event,
            arg,
          );
        }

        const router = routerOrFilter as IClientRouter<TContext>;
        const channelPromise = router
          .routeEvent(this, event, arg)
          .then((connection) =>
            (connection as Connection<TContext>).channelClient.getChannel(channelName),
          );
        return getDelayedChannel(channelPromise).listen(event, arg);
      },
    } as T;
  }

  private getMulticastEvent<T>(
    channelName: string,
    filter: (client: Client<TContext>) => boolean,
    eventName: string,
    arg: any,
  ): Event<T> {
    let subscriptions: DisposableStore | undefined;
    const emitter = new Emitter<T>({
      onWillAddFirstListener: () => {
        subscriptions = new DisposableStore();
        const multiplexer = new EventMultiplexer<T>();
        const onAdd = (connection: Connection<TContext>): void => {
          const channel = connection.channelClient.getChannel(channelName);
          multiplexer.add(channel.listen<T>(eventName, arg));
        };

        this.connections.filter(filter).forEach(onAdd);
        subscriptions.add(Event.filter(this.onDidAddConnection, filter)(onAdd));
        subscriptions.add(multiplexer.event((value) => emitter.fire(value)));
        subscriptions.add(multiplexer);
      },
      onDidRemoveLastListener: () => {
        subscriptions?.dispose();
        subscriptions = undefined;
      },
    });
    return emitter.event;
  }

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.channels.set(channelName, channel);
    for (const connection of this.connectionSet) {
      connection.channelServer.registerChannel(channelName, channel);
    }
  }

  dispose(): void {
    this.disposables.dispose();
    for (const connection of this.connectionSet) {
      connection.channelClient.dispose();
      connection.channelServer.dispose();
    }
    this.connectionSet.clear();
    this.channels.clear();
    this.addEmitter.dispose();
    this.removeEmitter.dispose();
  }
}

export class IPCClient<TContext = string>
  implements IChannelClient, IChannelServer<TContext>, IDisposable
{
  private readonly channelClient: ChannelClient;
  private readonly channelServer: ChannelServer<TContext>;

  constructor(protocol: IMessagePassingProtocol, ctx: TContext) {
    const writer = new BufferWriter();
    serialize(writer, ctx);
    protocol.send(writer.buffer);
    this.channelClient = new ChannelClient(protocol);
    this.channelServer = new ChannelServer(protocol, ctx);
  }

  getChannel<T extends IChannel>(channelName: string): T {
    return this.channelClient.getChannel<T>(channelName);
  }

  registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
    this.channelServer.registerChannel(channelName, channel);
  }

  dispose(): void {
    this.channelClient.dispose();
    this.channelServer.dispose();
  }
}

export class StaticRouter<TContext = string> implements IClientRouter<TContext> {
  constructor(private fn: (ctx: TContext) => boolean | Promise<boolean>) {}

  async routeCall(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
    return this.route(hub);
  }

  async routeEvent(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
    return this.route(hub);
  }

  private async route(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
    for (const connection of hub.connections) {
      if (await Promise.resolve(this.fn(connection.ctx))) {
        return connection;
      }
    }

    await Event.toPromise(hub.onDidAddConnection);
    return this.route(hub);
  }
}
