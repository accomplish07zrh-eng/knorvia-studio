// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { resolve } from "node:path";
import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
  SdkError,
  SdkErrorCode,
  UnsupportedProtocolVersionError,
  type VersionNegotiationOptions,
} from "@modelcontextprotocol/client";
import type { McpServerConfig } from "@knorvia/contracts";
import { authProvider } from "./client-auth.js";
import { officialHttpFetch, officialStdioMeta, usesOfficialAuth } from "./client-official.js";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { buildMcpStdioEnv, createMcpTransportFetch } from "./network.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

const PINNED_PROTOCOL = "2026-07-28";
const MAX_AUTO_PROBE_MS = 5_000;

// 传输装配约定（实现侧）：
// 一、stdio：命令/参数/工作目录来自配置，cwd 相对路径按「调用方工作目录 → 客户端状态 → 进程 cwd」逐级兜底。
// 二、stdio 环境变量由 buildMcpStdioEnv 统一装配，再被配置里的 env 覆盖。
// 三、HTTP/SSE：先建带网络策略的 fetch，官方鉴权时再包一层 officialHttpFetch。
// 四、请求头只在配置提供时透传，避免把空对象塞给 SDK。
// 五、协议协商：固定版本走 pin、sse 或 legacy 走 legacy、其余走 auto 探测，探测超时取一半且不超过 5s。
// 六、协议失败判定递归向下找 cause，识别 SDK 时代协商失败与不支持版本两类。
// 七、generation 参与官方 HTTP 鉴权包装，重连换代时旧请求会被识别并丢弃。
// 八、signal 透传给 stdio 的 requestMetaProvider，取消时元数据提供者随之失效。
// 九、传输对象本身不带重试：重连由上层池按 generation 决策。
export function negotiation(
  serverConfig: McpServerConfig,
  timeoutMs: number,
): VersionNegotiationOptions {
  if (serverConfig.protocolVersion === PINNED_PROTOCOL)
    return {
      mode: { pin: PINNED_PROTOCOL },
      probe: { timeoutMs: Math.max(1, Math.floor(timeoutMs)) },
    };
  if (serverConfig.type === "sse" || serverConfig.protocolVersion === "legacy")
    return { mode: "legacy" };
  return {
    mode: "auto",
    probe: { timeoutMs: Math.max(1, Math.min(MAX_AUTO_PROBE_MS, Math.floor(timeoutMs / 2))) },
  };
}

export function createTransport(
  clientState: McpClientState,
  serverName: string,
  serverConfig: McpServerConfig,
  generation: number,
  signal: AbortSignal | undefined,
  workingDirectory: string | undefined,
): ProtocolTransport {
  if (serverConfig.type === "stdio") {
    return new ProcessTreeStdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      cwd: serverConfig.cwd
        ? resolve(
            workingDirectory ?? clientState.workingDirectory ?? process.cwd(),
            serverConfig.cwd,
          )
        : (workingDirectory ?? clientState.workingDirectory),
      env: {
        ...buildMcpStdioEnv({ env: clientState.env, network: clientState.network }),
        ...serverConfig.env,
      },
      stderr: "pipe",
      ...(usesOfficialAuth(serverConfig)
        ? {
            requestMetaProvider: () =>
              officialStdioMeta(clientState, serverName, serverConfig, signal),
          }
        : {}),
    });
  }
  const plainFetch = createMcpTransportFetch({
    env: clientState.env,
    network: clientState.network,
  });
  if (serverConfig.type === "http") {
    const fetch = officialHttpFetch(clientState, serverName, serverConfig, generation, plainFetch);
    return new StreamableHTTPClientTransport(new URL(serverConfig.url), {
      authProvider: authProvider(clientState, serverName, serverConfig),
      fetch,
      requestInit: serverConfig.headers ? { headers: serverConfig.headers } : undefined,
    });
  }
  return new SSEClientTransport(new URL(serverConfig.url), {
    authProvider: authProvider(clientState, serverName, serverConfig),
    fetch: plainFetch,
    requestInit: serverConfig.headers ? { headers: serverConfig.headers } : undefined,
  });
}

export function protocolFailure(error: unknown): boolean {
  if (error instanceof SdkError && error.code === SdkErrorCode.EraNegotiationFailed) return true;
  if (UnsupportedProtocolVersionError.isInstance(error)) return true;
  if (error !== null && typeof error === "object" && "cause" in error) {
    const cause = error.cause;
    if (cause !== undefined && cause !== error) return protocolFailure(cause);
  }
  return false;
}
