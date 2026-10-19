// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// @knorvia/rpc 的冻结入口：按「基础设施 → 序列化 → 传输 → channel → 连接 → 远程」分层再导出。
// 一级导出面只包含 interface.md §1.1/§1.2 的名字；RequestType/ResponseType/HEADER_SIZE/
// ClientState 是内部实现细节，不得从这里出现。

export {
  type IDisposable,
  toDisposable,
  DisposableStore,
  Event,
  Emitter,
  Relay,
  EventMultiplexer,
  type CancellationToken,
  CancellationTokenSource,
} from "./foundation.js";

export { VSBuffer } from "./buffer.js";

export {
  type IReader,
  type IWriter,
  BufferReader,
  BufferWriter,
  serialize,
  deserialize,
} from "./serialization.js";

export {
  type IMessagePassingProtocol,
  type ConnectionFlowControl,
  type MessagePortFlowControl,
  type MessagePortFlowState,
  type MessagePortPayload,
  type ISocket,
  ChunkStream,
  SocketProtocol,
  ProtocolMessageType,
  ProtocolMessage,
  MessagePortProtocol,
  type MessagePortLike,
  createQueuePair,
} from "./protocol.js";

export { PersistentProtocol, type PersistentProtocolOptions } from "./persistent-protocol.js";

export {
  type IChannel,
  type IServerChannel,
  type IChannelServer,
  type IChannelClient,
  ChannelServer,
  ChannelClient,
  getDelayedChannel,
} from "./channels.js";

export {
  type ClientConnectionEvent,
  type Client,
  type IConnectionHub,
  type IClientRouter,
  IPCServer,
  IPCClient,
  StaticRouter,
} from "./ipc.js";

export { ProxyChannel } from "./proxy-channel.js";

export { type RPCLogger, LoggingChannelServer, LoggingChannelClient } from "./logging-middleware.js";

export {
  type NetworkTransportKind,
  type NetworkObservation,
  type NetworkTelemetrySink,
  setNetworkTelemetrySink,
  emitNetworkTelemetryObservation,
  NetworkTelemetryChannelServer,
  NetworkTelemetryChannelClient,
} from "./network-telemetry-middleware.js";

export {
  RemoteConnectionType,
  WebSocketRemoteConnection,
  ManagedRemoteConnection,
  type RemoteConnection,
  type ResolvedAuthority,
  type IRemoteAuthorityResolver,
  RemoteAuthorityResolverService,
  type ISocketFactory,
  RemoteSocketFactoryService,
  type IURITransformer,
  type SimpleURI,
  createURITransformer,
  RemoteAgentConnection,
  type RemoteConnectionState,
} from "./remote.js";
