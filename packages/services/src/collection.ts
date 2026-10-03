import { ProxyChannel, type IChannelServer } from "@knorvia/rpc";
import type { ServiceDescriptor } from "./descriptors.js";

export class ServiceCollection {
  private readonly registrations = new Map<string, unknown>();

  register<T>(descriptor: ServiceDescriptor<T>, instance: T): this {
    this.registrations.set(descriptor.channelName, instance);
    return this;
  }

  get<T>(descriptor: ServiceDescriptor<T>): T {
    const instance = this.registrations.get(descriptor.channelName);
    if (!instance) {
      throw new Error(`Service not registered: ${descriptor.channelName}`);
    }
    return instance as T;
  }

  getOptional<T>(descriptor: ServiceDescriptor<T>): T | undefined {
    return this.registrations.get(descriptor.channelName) as T | undefined;
  }

  exposeOnChannelServer(
    server: IChannelServer,
    overrides: ReadonlyMap<string, unknown> = new Map(),
  ): void {
    for (const [channelName, instance] of this.registrations) {
      const service = overrides.get(channelName) ?? instance;
      server.registerChannel(
        channelName,
        ProxyChannel.fromService(service as Record<string, unknown>),
      );
    }
  }
}
