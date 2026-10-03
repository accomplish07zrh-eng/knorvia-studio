import { RemoteServiceAccess } from "@knorvia/client";
import { ChannelClient, SocketProtocol } from "@knorvia/rpc";
import { assertSupportedRemoteEnvironment } from "@knorvia/server/remote/remotePlatformSupport.js";
import type { IServiceAccessor } from "@knorvia/services";
import {
  formatLogPrefix,
  KNORVIA_APP_VERSION_ENV,
  KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
  KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV,
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  SERVICE_AUTHORITY_MODE_ENV,
} from "@knorvia/shared";
import type { IRemoteBackend } from "./backend.js";
import { deployServer, type DeployOptions } from "./deploy.js";
import { performHandshake } from "./handshake.js";
import { quotePosixShellArg } from "./posixShell.js";
import { wrapStdioStream } from "./stdio-socket.js";
import { formatWslProxyForLog } from "./wslProxy.js";

export interface RemoteRuntimeNetworkOptions {
  httpProxy?: string;
  noProxy?: string;
  authoritative?: boolean;
}

export interface ConnectOptions extends DeployOptions {
  clientId?: string;
  handshakeTimeout?: number;
  skipDeploy?: boolean;
  appVersion?: string;
  remoteRuntimeEnv?: Record<string, string | undefined>;
  remoteRuntimeNetwork?: RemoteRuntimeNetworkOptions;
  onDidRemoteClose?: (event: { code: number }) => void;
}

export interface RemoteConnection {
  services: IServiceAccessor;
  client: ChannelClient;
  dispose(): void;
  disposeAndWait(options?: { timeoutMs?: number }): Promise<void>;
}

const remoteRuntimeEnvKeys = [
  "KNORVIA_ENV",
  "KNORVIA_BASE_URL",
  "KNORVIA_ENDPOINT_ORIGIN",
  KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
  KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV,
] as const;

export type RemoteRuntimeEnvKey = (typeof remoteRuntimeEnvKeys)[number];
export type RemoteRuntimeEnv = Partial<Record<RemoteRuntimeEnvKey, string>>;

export function pickRemoteRuntimeEnv(env: Record<string, string | undefined>): RemoteRuntimeEnv {
  const selected: RemoteRuntimeEnv = {};
  for (const key of remoteRuntimeEnvKeys) {
    const value = env[key]?.trim();
    if (value) {
      selected[key] = value;
    }
  }
  return selected;
}

function log(...args: unknown[]): void {
  console.log(formatLogPrefix("connectRemote", process.pid), ...args);
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Remote connection canceled");
  error.name = "AbortError";
  return error;
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

export async function connectRemote(
  backend: IRemoteBackend,
  options?: ConnectOptions,
): Promise<RemoteConnection> {
  const signal = options?.signal;
  let backendDisposed = false;
  const disposeBackendOnce = (): void => {
    if (backendDisposed) {
      return;
    }
    backendDisposed = true;
    backend.dispose();
  };

  if (signal?.aborted) {
    disposeBackendOnce();
    throw abortError(signal);
  }

  let removeAbortListener = (): void => {};
  try {
    const connecting = connectRemoteUnchecked(backend, options);
    if (!signal) {
      return await connecting;
    }

    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => {
        disposeBackendOnce();
        reject(abortError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    });
    const guardedConnecting = connecting.then((connection) => {
      if (signal.aborted) {
        connection.dispose();
        throw abortError(signal);
      }
      return connection;
    });
    return await Promise.race([guardedConnecting, aborted]);
  } catch (error) {
    disposeBackendOnce();
    throw error;
  } finally {
    removeAbortListener();
  }
}

async function resolveRuntimeNetwork(
  backend: IRemoteBackend,
  network: RemoteRuntimeNetworkOptions | undefined,
): Promise<RemoteRuntimeNetworkOptions | undefined> {
  if (!network || !backend.resolveRuntimeProxy) {
    return undefined;
  }
  if (!network.httpProxy?.trim()) {
    return network;
  }
  try {
    const resolved = await backend.resolveRuntimeProxy(network.httpProxy);
    if (resolved !== network.httpProxy) {
      log(
        "resolved remote runtime proxy via wsl-host-gateway",
        formatWslProxyForLog(network.httpProxy),
        "->",
        formatWslProxyForLog(resolved),
      );
    }
    return { ...network, httpProxy: resolved };
  } catch (error) {
    log(
      "remote runtime proxy resolution failed; using configured endpoint",
      error instanceof Error ? error.message : String(error),
    );
    return network;
  }
}

function launchCommand(
  options: ConnectOptions | undefined,
  network: RemoteRuntimeNetworkOptions | undefined,
): string {
  const envParts = [
    `${SERVICE_AUTHORITY_MODE_ENV}="desktop-attached-remote"`,
    'KNORVIA_SERVER_RUNTIME_ROOT="$HOME/.knorvia-studio/server"',
  ];
  for (const [key, value] of Object.entries(
    pickRemoteRuntimeEnv(options?.remoteRuntimeEnv ?? {}),
  )) {
    envParts.push(`${key}=${quotePosixShellArg(value)}`);
  }
  const appVersion = options?.appVersion?.trim();
  if (appVersion) {
    envParts.push(`${KNORVIA_APP_VERSION_ENV}=${quotePosixShellArg(appVersion)}`);
  }
  if (network?.authoritative) {
    envParts.push(`${KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY}='1'`);
    if (network.httpProxy !== undefined) {
      envParts.push(
        `${KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY}=${quotePosixShellArg(network.httpProxy)}`,
      );
    }
    if (network.noProxy !== undefined) {
      envParts.push(`${KNORVIA_REMOTE_NO_PROXY_ENV_KEY}=${quotePosixShellArg(network.noProxy)}`);
    }
  }
  return `${envParts.join(" ")} ~/.knorvia-studio/server/node ~/.knorvia-studio/server/knorvia-server.cjs`;
}

async function connectRemoteUnchecked(
  backend: IRemoteBackend,
  options: ConnectOptions | undefined,
): Promise<RemoteConnection> {
  const clientId = options?.clientId ?? `desktop-${Date.now()}`;
  log("detecting remote env...");
  const env = await backend.detect();
  checkAbort(options?.signal);
  log("detected:", env);
  assertSupportedRemoteEnvironment(env);

  const network = await resolveRuntimeNetwork(backend, options?.remoteRuntimeNetwork);
  if (!options?.skipDeploy) {
    log("deploying server...");
    await deployServer(backend, env, options);
    checkAbort(options?.signal);
    log("deploy complete");
  }

  log("launching remote server...");
  const stream = await backend.exec(launchCommand(options, network));
  checkAbort(options?.signal);
  log("remote server exec started");
  stream.stderr.on("data", (chunk: Buffer) => {
    console.log(`[remote] ${chunk.toString().trimEnd()}`);
  });
  log("performing handshake...");
  const { hello, remaining } = await performHandshake(stream, clientId, options?.handshakeTimeout);
  checkAbort(options?.signal);
  log("handshake done, server version:", hello.version);
  if (remaining && remaining.length > 0) {
    (stream.stdout as NodeJS.ReadableStream & { unshift(chunk: Buffer): void }).unshift(remaining);
  }
  const socket = wrapStdioStream(stream);
  const protocol = new SocketProtocol(socket);
  const client = new ChannelClient(protocol);
  const services = new RemoteServiceAccess(client);

  let hasReportedRemoteClose = false;
  let hasStreamClosed = false;
  let resolveStreamClosed!: () => void;
  const streamClosed = new Promise<void>((resolve) => {
    resolveStreamClosed = resolve;
  });
  const reportRemoteClose = (code: number): void => {
    if (hasReportedRemoteClose) {
      return;
    }
    hasReportedRemoteClose = true;
    options?.onDidRemoteClose?.({ code });
  };
  const backendDisconnectSubscription = backend.onDidDisconnect?.((event) => {
    const message = event.error?.message;
    log(
      message
        ? `remote backend disconnected: ${event.reason}: ${message}`
        : `remote backend disconnected: ${event.reason}`,
    );
    reportRemoteClose(-1);
  });
  const streamCloseSubscription = stream.onClose((code) => {
    hasStreamClosed = true;
    resolveStreamClosed();
    reportRemoteClose(code);
  });

  let disposalStarted = false;
  let backendDisposed = false;
  let inFlight: Promise<void> | null = null;
  const beginDisposal = (): void => {
    if (disposalStarted) {
      return;
    }
    disposalStarted = true;
    backendDisconnectSubscription?.dispose();
    client.dispose();
    protocol.dispose();
    socket.dispose();
  };
  const disposeBackend = (): void => {
    if (backendDisposed) {
      return;
    }
    backendDisposed = true;
    streamCloseSubscription.dispose();
    backend.dispose();
  };
  const disposeBackendAndWait = async (): Promise<void> => {
    if (backendDisposed) {
      return;
    }
    backendDisposed = true;
    streamCloseSubscription.dispose();
    if (backend.disposeAndWait) {
      await backend.disposeAndWait();
      return;
    }
    backend.dispose();
  };

  return {
    services,
    client,
    dispose(): void {
      beginDisposal();
      disposeBackend();
    },
    disposeAndWait(disposeOptions?: { timeoutMs?: number }): Promise<void> {
      if (inFlight) {
        return inFlight;
      }
      beginDisposal();
      if (backendDisposed || hasStreamClosed) {
        disposeBackend();
        return Promise.resolve();
      }
      const timeoutMs = Math.max(disposeOptions?.timeoutMs ?? 5000, 0);
      inFlight = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<"timed-out">((resolve) => {
          timer = setTimeout(() => resolve("timed-out"), timeoutMs);
        });
        const outcome = await Promise.race([streamClosed.then(() => "closed"), deadline]);
        if (timer) {
          clearTimeout(timer);
        }
        if (outcome === "timed-out") {
          log(`remote stdio close timed out after ${timeoutMs}ms`);
        }
        await disposeBackendAndWait();
      })();
      return inFlight;
    },
  };
}
