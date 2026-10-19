// SPDX-License-Identifier: Apache-2.0
// 冻结导出面的声明侧辅助：直接读取入口（源码或 dist 声明）的导出名单。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

export const rpcRuntimeExports = Object.freeze([
  "BufferReader",
  "BufferWriter",
  "CancellationTokenSource",
  "ChannelClient",
  "ChannelServer",
  "ChunkStream",
  "DisposableStore",
  "Emitter",
  "Event",
  "EventMultiplexer",
  "IPCClient",
  "IPCServer",
  "LoggingChannelClient",
  "LoggingChannelServer",
  "ManagedRemoteConnection",
  "MessagePortProtocol",
  "NetworkTelemetryChannelClient",
  "NetworkTelemetryChannelServer",
  "PersistentProtocol",
  "ProtocolMessage",
  "ProtocolMessageType",
  "ProxyChannel",
  "Relay",
  "RemoteAgentConnection",
  "RemoteAuthorityResolverService",
  "RemoteConnectionType",
  "RemoteSocketFactoryService",
  "SocketProtocol",
  "StaticRouter",
  "VSBuffer",
  "WebSocketRemoteConnection",
  "createQueuePair",
  "createURITransformer",
  "deserialize",
  "emitNetworkTelemetryObservation",
  "getDelayedChannel",
  "serialize",
  "setNetworkTelemetrySink",
  "toDisposable",
]);

export const rpcTypeExports = Object.freeze([
  "CancellationToken",
  "Client",
  "ClientConnectionEvent",
  "ConnectionFlowControl",
  "Event",
  "IChannel",
  "IChannelClient",
  "IChannelServer",
  "IClientRouter",
  "IConnectionHub",
  "IDisposable",
  "IMessagePassingProtocol",
  "IRemoteAuthorityResolver",
  "IReader",
  "IServerChannel",
  "ISocket",
  "ISocketFactory",
  "IURITransformer",
  "IWriter",
  "MessagePortFlowControl",
  "MessagePortFlowState",
  "MessagePortLike",
  "MessagePortPayload",
  "NetworkObservation",
  "NetworkTelemetrySink",
  "NetworkTransportKind",
  "PersistentProtocolOptions",
  "RPCLogger",
  "RemoteConnection",
  "RemoteConnectionState",
  "ResolvedAuthority",
  "SimpleURI",
]);

export const rpcInternalNames = Object.freeze([
  "RequestType",
  "ResponseType",
  "HEADER_SIZE",
  "ClientState",
]);

export const providerNodeRuntimeExports = Object.freeze([
  "EndpointScopedKnorviaBuiltinSource",
  "KNORVIA_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV",
  "KNORVIA_BUILTIN_PROVIDER_CONFIG_FILE_ENV",
  "KNORVIA_BUILTIN_RELEASE_SCHEMA_VERSION",
  "KNORVIA_PERSONAL_PROVIDER_CONFIG_FILE_ENV",
  "KnorviaBuiltinRemoteSynchronizer",
  "NodeKnorviaBuiltinProviderConfigSource",
  "NodeModelSelectionConfigRepository",
  "NodePersonalProviderConfigRepository",
  "NodeProviderConfigRuntime",
  "NodeProviderRegistryRuntime",
  "PERSONAL_PROVIDER_CONFIG_FILE_NAME",
  "UnsupportedProviderConfigVersionError",
  "createKnorviaBuiltinEndpointKey",
  "createNodeKnorviaBuiltinProviderConfigSource",
  "createNodeModelSelectionFacade",
  "createNodePersonalProviderConfigRepository",
  "createNodeProviderConfigRuntime",
  "createNodeProviderRegistryRuntime",
  "createNodeProviderRuntimePathEnv",
  "decodeKnorviaBuiltinRelease",
  "decodeProviderConfigFile",
  "downloadKnorviaBuiltinRelease",
  "encodeKnorviaBuiltinRelease",
  "encodeProviderConfigFile",
  "materializeKnorviaBuiltinProviderConfig",
  "normalizeKnorviaBuiltinEndpointOrigin",
  "resolveKnorviaBuiltinCachePaths",
  "resolveKnorviaBuiltinClientPlatform",
  "resolveNodeProviderRuntimePaths",
  "serializeKnorviaBuiltinRelease",
]);

export const providerNodeTypeExports = Object.freeze([
  "ApplyKnorviaBuiltinReleaseResult",
  "EndpointScopedKnorviaBuiltinSourceOptions",
  "KnorviaBuiltinCachePathOptions",
  "KnorviaBuiltinCachePaths",
  "KnorviaBuiltinConfigContent",
  "KnorviaBuiltinDownloadOptions",
  "KnorviaBuiltinRefreshEvent",
  "KnorviaBuiltinRefreshResult",
  "KnorviaBuiltinRelease",
  "KnorviaBuiltinRemoteSynchronizerOptions",
  "MaterializeKnorviaBuiltinProviderConfigOptions",
  "NodeKnorviaBuiltinProviderConfigSourceOptions",
  "NodeModelSelectionConfigRepositoryOptions",
  "NodePersonalProviderConfigRepositoryOptions",
  "NodeProviderConfigRuntimeOptions",
  "NodeProviderRegistryRuntimeOptions",
  "NodeProviderRuntimePaths",
  "PersonalProviderConfigRecoveryEvent",
]);

export const providerNodeInternalNames = Object.freeze([
  "legacyReasoningLevelRenames",
  "resolveLegacyReasoningLevel",
]);

function resolveSpecifier(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  if (fromFile.endsWith(".d.ts")) return base.replace(/\.js$/u, ".d.ts");
  return base.replace(/\.js$/u, ".ts");
}

function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function collectFromFile(file, names, visited) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      } else if (!statement.exportClause && statement.moduleSpecifier) {
        collectFromFile(resolveSpecifier(file, statement.moduleSpecifier.text), names, visited);
      }
      continue;
    }
    if (!hasExportModifier(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      continue;
    }
    if (statement.name && ts.isIdentifier(statement.name)) {
      names.add(statement.name.text);
    }
  }
}

export function collectDeclaredNames(entryFile) {
  const names = new Set();
  collectFromFile(entryFile, names, new Set());
  return names;
}
