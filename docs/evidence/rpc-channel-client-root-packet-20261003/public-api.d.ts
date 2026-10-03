import type { Event, IDisposable } from "./foundation.js";
import type { IMessagePassingProtocol } from "./protocol.js";
import type { IChannel, IChannelClient } from "./channels.shared.js";

export declare class ChannelClient implements IChannelClient, IDisposable {
  readonly onDidInitialize: Event<void>;
  constructor(protocol: IMessagePassingProtocol);
  getChannel<T extends IChannel>(channelName: string): T;
  dispose(reason?: Error): void;
}
