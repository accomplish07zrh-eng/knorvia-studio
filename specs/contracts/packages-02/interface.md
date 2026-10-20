# packages-02 冻结导出面

两个入口均为 re-export 桶。下表是旧实现的**实际导出面**，替换阶段不得增删；
纯类型必须继续可被 `import type`，运行时值的类型（class/function/enum/const/namespace）
必须保持。清单可用 `node --import tsx` 加载入口后与运行时 `Object.keys` 交叉核对（B20/B29）。

## 一、`@knorvia/rpc`

- 源入口：`packages/rpc/src/index.ts`
- dist 入口：`packages/rpc/dist/index.js`（`npx tsc -p packages/rpc`）
- 旧实现：70 条导出、70 个唯一名；其中运行时值 **39** 个、纯类型名 **31** 个
  （`Event` 同名同时提供命名空间值与类型；`CancellationToken` 在入口只有 `type` 导出，
  运行时没有该值）。

### 1.1 运行时值（按源模块分组）

| 源模块                            | 运行时值                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foundation.ts`                   | `toDisposable`、`DisposableStore`、`Event`（命名空间）、`Emitter`、`Relay`、`EventMultiplexer`、`CancellationTokenSource`                                                                               |
| `buffer.ts`                       | `VSBuffer`                                                                                                                                                                                              |
| `serialization.ts`                | `BufferReader`、`BufferWriter`、`serialize`、`deserialize`                                                                                                                                              |
| `protocol.ts`                     | `ChunkStream`、`SocketProtocol`、`ProtocolMessage`、`MessagePortProtocol`、`ProtocolMessageType`（enum）、`createQueuePair`                                                                             |
| `persistent-protocol.ts`          | `PersistentProtocol`                                                                                                                                                                                    |
| `channels.ts`                     | `ChannelServer`、`ChannelClient`、`getDelayedChannel`                                                                                                                                                   |
| `ipc.ts`                          | `IPCServer`、`IPCClient`、`StaticRouter`                                                                                                                                                                |
| `proxy-channel.ts`                | `ProxyChannel`（命名空间）                                                                                                                                                                              |
| `logging-middleware.ts`           | `LoggingChannelServer`、`LoggingChannelClient`                                                                                                                                                          |
| `network-telemetry-middleware.ts` | `setNetworkTelemetrySink`、`emitNetworkTelemetryObservation`、`NetworkTelemetryChannelServer`、`NetworkTelemetryChannelClient`                                                                          |
| `remote.ts`                       | `RemoteConnectionType`（enum）、`WebSocketRemoteConnection`、`ManagedRemoteConnection`、`RemoteAuthorityResolverService`、`RemoteSocketFactoryService`、`createURITransformer`、`RemoteAgentConnection` |

### 1.2 纯类型（按源模块分组）

| 源模块                            | 类型                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `foundation.ts`                   | `IDisposable`、`Event`（类型别名）、`CancellationToken`（接口）                                                                                |
| `serialization.ts`                | `IReader`、`IWriter`                                                                                                                           |
| `protocol.ts`                     | `IMessagePassingProtocol`、`ConnectionFlowControl`、`MessagePortFlowControl`、`ISocket`、`MessagePortPayload`、`MessagePortLike`               |
| `persistent-protocol.ts`          | `PersistentProtocolOptions`                                                                                                                    |
| `channels.shared.ts`              | `IChannel`、`IServerChannel`、`IChannelServer`、`IChannelClient`                                                                               |
| `ipc.ts`                          | `ClientConnectionEvent`、`Client`、`IConnectionHub`、`IClientRouter`                                                                           |
| `logging-middleware.ts`           | `RPCLogger`                                                                                                                                    |
| `network-telemetry-middleware.ts` | `NetworkTransportKind`、`NetworkTelemetrySink`、`NetworkObservation`                                                                           |
| `remote.ts`                       | `RemoteConnection`、`ResolvedAuthority`、`IRemoteAuthorityResolver`、`ISocketFactory`、`IURITransformer`、`SimpleURI`、`RemoteConnectionState` |

### 1.3 一级导出面之外的名字（不得新增）

`RequestType`、`ResponseType`（`channels.shared.ts` 的 `const enum`，内部协议编号）、
`HEADER_SIZE`（`protocol.ts`）、`ClientState`、`legacyReasoningLevelRenames` 等内部名
**不在一级导出面**。替换实现可以改变内部模块布局，但不得让这些名字出现在 `index.ts`。

### 1.4 合同写死的纯数据常量表（声明模式计分）

以下两张表**键名与形状都由协议规定、不含逻辑**，按计划书「合同写死的纯数据常量表」口径处理：
集中在 `packages/rpc/src/channel-protocol-declaration.ts`，**用声明模式计分**；
该文件不含任何运行时逻辑，表中的转换逻辑在 `channel-codec.ts` 内按普通模式计分。

**（1）错误元数据搬运白名单** —— `TRANSFERABLE_ERROR_KEYS`，九个键（服务端写入、客户端还原）：

|  #  | 键名           | 说明                     |
| :-: | -------------- | ------------------------ |
|  1  | `code`         | 业务错误码               |
|  2  | `data`         | 附带的业务数据           |
|  3  | `detail`       | 单条明细                 |
|  4  | `details`      | 多条明细                 |
|  5  | `kind`         | 错误种类（如 `timeout`） |
|  6  | `retryAfterMs` | 建议重试间隔             |
|  7  | `status`       | 上游状态码               |
|  8  | `taskId`       | 关联任务                 |
|  9  | `traceId`      | 关联追踪                 |

**（2）五种响应种类的判别式与载荷形状** —— `IRawResponse`：

|  #  | 种类              | 判别键 `type` | `id` | 载荷形状                                                                                |
| :-: | ----------------- | ------------- | :--: | --------------------------------------------------------------------------------------- |
|  1  | `Initialize`      | `200`         |  无  | 无（全局就绪信号）                                                                      |
|  2  | `PromiseSuccess`  | `201`         |  有  | `data: any`                                                                             |
|  3  | `PromiseError`    | `202`         |  有  | `data: IRawErrorData`（`message` / `name` / `stack: string[] \| undefined` + 上述九键） |
|  4  | `PromiseErrorObj` | `203`         |  有  | `data: any`（非 `Error` 的原值）                                                        |
|  5  | `EventFire`       | `204`         |  有  | `data: any`                                                                             |

编号 `200`–`204` 与 `101`–`103` 属线格式，逐字固定；`IRawErrorData` 的 `stack`
以**行数组**传输（跨进程传整串会被序列化层转义）。

## 二、`@knorvia/provider-node`

- 源入口：`packages/provider-node/src/index.ts`
- dist 入口：`packages/provider-node/dist/index.js`（`npx tsc -p packages/provider-node`）
- 旧实现：49 条导出；运行时值 **31** 个、纯类型 **18** 个。`index.ts` 自身是 14 行
  `export *` 桶，不是重写目标，但导出面冻结。

### 2.1 运行时值（按源模块分组）

| 源模块                                    | 运行时值                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builtin-cache-paths.ts`                  | `resolveKnorviaBuiltinClientPlatform`、`resolveKnorviaBuiltinCachePaths`、`createKnorviaBuiltinEndpointKey`、`normalizeKnorviaBuiltinEndpointOrigin`                                                                                                     |
| `builtin-download.ts`                     | `downloadKnorviaBuiltinRelease`                                                                                                                                                                                                                          |
| `builtin-provider-config-materializer.ts` | `materializeKnorviaBuiltinProviderConfig`                                                                                                                                                                                                                |
| `builtin-provider-config-source.ts`       | `NodeKnorviaBuiltinProviderConfigSource`、`createNodeKnorviaBuiltinProviderConfigSource`                                                                                                                                                                 |
| `builtin-release.ts`                      | `KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION`、`decodeKnorviaBuiltinRelease`、`encodeKnorviaBuiltinRelease`、`serializeKnorviaBuiltinRelease`                                                                                                                 |
| `builtin-remote-synchronizer.ts`          | `KnorviaBuiltinRemoteSynchronizer`                                                                                                                                                                                                                       |
| `endpoint-scoped-builtin-source.ts`       | `EndpointScopedKnorviaBuiltinSource`                                                                                                                                                                                                                     |
| `model-selection-config-repository.ts`    | `NodeModelSelectionConfigRepository`                                                                                                                                                                                                                     |
| `personal-provider-config-repository.ts`  | `NodePersonalProviderConfigRepository`、`createNodePersonalProviderConfigRepository`                                                                                                                                                                     |
| `provider-config-file-codec.ts`           | `UnsupportedProviderConfigVersionError`、`decodeProviderConfigFile`、`encodeProviderConfigFile`                                                                                                                                                          |
| `provider-config-runtime.ts`              | `NodeProviderConfigRuntime`、`createNodeProviderConfigRuntime`                                                                                                                                                                                           |
| `provider-registry-runtime.ts`            | `NodeProviderRegistryRuntime`、`createNodeProviderRegistryRuntime`                                                                                                                                                                                       |
| `model-selection-facade.ts`               | `createNodeModelSelectionFacade`                                                                                                                                                                                                                         |
| `runtime-paths.ts`                        | `KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV`、`KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV`、`KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV`、`PERSONAL_PROVIDER_CONFIG_FILE_NAME`、`createNodeProviderRuntimePathEnv`、`resolveNodeProviderRuntimePaths` |

### 2.2 纯类型（按源模块分组）

| 源模块                                    | 类型                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `builtin-cache-paths.ts`                  | `KnorviaBuiltinCachePathOptions`、`KnorviaBuiltinCachePaths`                                           |
| `builtin-download.ts`                     | `KnorviaBuiltinDownloadOptions`                                                                        |
| `builtin-provider-config-materializer.ts` | `MaterializeKnorviaBuiltinProviderConfigOptions`                                                       |
| `builtin-provider-config-source.ts`       | `NodeKnorviaBuiltinProviderConfigSourceOptions`、`ApplyKnorviaBuiltinReleaseResult`                    |
| `builtin-release.ts`                      | `KnorviaBuiltinConfigContent`、`KnorviaBuiltinRelease`                                                 |
| `builtin-remote-synchronizer.ts`          | `KnorviaBuiltinRefreshResult`、`KnorviaBuiltinRemoteSynchronizerOptions`、`KnorviaBuiltinRefreshEvent` |
| `endpoint-scoped-builtin-source.ts`       | `EndpointScopedKnorviaBuiltinSourceOptions`                                                            |
| `model-selection-config-repository.ts`    | `NodeModelSelectionConfigRepositoryOptions`                                                            |
| `personal-provider-config-repository.ts`  | `NodePersonalProviderConfigRepositoryOptions`、`PersonalProviderConfigRecoveryEvent`                   |
| `provider-config-runtime.ts`              | `NodeProviderConfigRuntimeOptions`                                                                     |
| `provider-registry-runtime.ts`            | `NodeProviderRegistryRuntimeOptions`                                                                   |
| `runtime-paths.ts`                        | `NodeProviderRuntimePaths`                                                                             |

### 2.3 一级导出面之外的名字（不得新增）

`legacyReasoningLevelRenames`、`resolveLegacyReasoningLevel` 从各自模块 `export`，
但 `index.ts` **没有** re-export；替换实现必须保持「模块内可用、包入口不可见」。
`index.ts` 的 14 个 `export *` 源路径属于模块路径兼容面（B29）。

### 2.4 合同写死的纯类型/常量表（声明模式计分）

按计划书「合同写死的纯数据常量表 → 在 interface.md 逐条列名、集中放进声明文件、
用声明模式计分」的口径，下列形状由合同规定、不含逻辑，集中在各自声明文件：

**（1）`NodeProviderConfigRuntimeOptions` 的 11 个字段**
（`config-runtime-options.ts`）

|  #  | 字段                            | 类型                                                                                          | 说明                          |
| :-: | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
|  1  | `knorviaBuiltinFilePath`        | `string`                                                                                      | Built-in 配置文件路径（必填） |
|  2  | `knorviaBuiltinActiveFilePath?` | `string`                                                                                      | 生效路径（缺省同 bundled）    |
|  3  | `knorviaBuiltinRemote?`         | `Omit<KnorviaBuiltinRemoteSynchronizerOptions, "source">`                                     | 远端同步参数                  |
|  4  | `knorviaBuiltinEnvironment?`    | `Omit<EndpointScopedKnorviaBuiltinSourceOptions, "bundledFilePath">`                          | 端点范围来源参数              |
|  5  | `onKnorviaBuiltinRefreshError?` | `(error: unknown) => void`                                                                    | 刷新失败回调                  |
|  6  | `onPersonalConfigRecovery?`     | `(event: PersonalProviderConfigRecoveryEvent) => void`                                        | 个人配置恢复回调              |
|  7  | `onPersonalConfigPollingError?` | `(error: unknown) => void`                                                                    | 轮询失败回调                  |
|  8  | `personalFilePath`              | `string`                                                                                      | Personal 配置文件路径（必填） |
|  9  | `personalPollingIntervalMs?`    | `number \| false`                                                                             | 轮询间隔；`false` 关闭        |
| 10  | `importLegacy?`                 | `(knorviaBuiltin: ProviderConfigLayerSnapshot) => Promise<ProviderConfigLayerUpdate \| null>` | 旧配置导入                    |
| 11  | `watch?`                        | `boolean`                                                                                     | 是否监视文件变化              |

**（2）`channel-protocol-declaration.ts` 的常量表**：见 §1.4（九个错误元数据键 + 五种响应形状）。
