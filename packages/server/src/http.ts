import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, extname, relative, resolve, sep } from "node:path";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
  ChannelServer,
  Emitter,
  LoggingChannelServer,
  ProxyChannel,
  SocketProtocol,
  VSBuffer,
  type ISocket,
} from "@knorvia/rpc";
import {
  createKnorviaAgentConnectionScope,
  IFileService,
  IGitService,
  IKnorviaAgentService,
  ISystemService,
  ITerminalService,
  IWindowControllerService,
  ServiceCollection,
} from "@knorvia/services";
import {
  formatLogPrefix,
  formatZodError,
  KNORVIA_RPC_HOST_CAPABILITY_HEADER,
  KNORVIA_VERSION,
  remoteTargetSchema,
  SERVER_REMOTE_PROTOCOL_VERSION,
  type ServerRemoteWorkspaceInfo,
} from "@knorvia/shared";
import { Hono } from "hono";
import type WebSocket from "ws";
import { createHostCapabilityStore } from "./hostCapability.js";
import { createHttpWindowController } from "./httpWindowController.js";
import { connectRemote, createRemoteBackend, type RemoteConnection } from "./remote/index.js";

interface HttpServerOptions {
  serverId?: string;
  name?: string;
  host?: string;
  authRequired?: boolean;
  authToken?: string;
  spaFallback?: boolean;
  staticRoot?: string;
  workspaces?: ServerRemoteWorkspaceInfo[];
}

type ConnectionMode = "desktop-continuous" | "web-remote-replayable";

const remoteConnections = new Map<string, RemoteConnection>();

function log(...args: unknown[]): void {
  console.log(formatLogPrefix("knorvia-server:http", process.pid), ...args);
}

function isProtectedPath(path: string): boolean {
  return path === "/ws" || path.startsWith("/ws/") || path.startsWith("/api/");
}

function tokenFromCookies(header: string | undefined): string | undefined {
  const values = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    const key = part.slice(0, equals).trim();
    if (key) values.set(key, part.slice(equals + 1).trim());
  }
  return values.get("knorvia_lite_token");
}

function socketForWebSocket(ws: WebSocket): ISocket {
  const data = new Emitter<VSBuffer>();
  const close = new Emitter<void>();
  const end = new Emitter<void>();
  ws.on("message", (raw) => {
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    data.fire(VSBuffer.wrap(new Uint8Array(bytes)));
  });
  const finish = () => {
    close.fire();
    end.fire();
  };
  ws.on("close", finish);
  ws.on("error", finish);
  return {
    onData: data.event,
    onClose: close.event,
    onEnd: end.event,
    write(buffer) {
      if (ws.readyState === ws.OPEN) ws.send(buffer.buffer);
    },
    end() {
      ws.close();
    },
    dispose() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
  };
}

function connectChannels(
  ws: WebSocket,
  services: ServiceCollection,
  mode: ConnectionMode,
  controller?: ReturnType<typeof createHttpWindowController>,
): void {
  const socket = socketForWebSocket(ws);
  const rawServer = new ChannelServer(new SocketProtocol(socket), "server");
  const channelServer = new LoggingChannelServer(rawServer, log);
  const agent = services.getOptional(IKnorviaAgentService);
  const scope = agent
    ? createKnorviaAgentConnectionScope(agent, {
        connectionId: `server-ws-${randomUUID()}`,
        clientMode: mode,
        role: mode === "desktop-continuous" ? "trusted-host-relay" : "terminal-client",
      })
    : undefined;
  const overrides = new Map<string, unknown>();
  if (scope) overrides.set(IKnorviaAgentService.channelName, scope.service);
  services.exposeOnChannelServer(channelServer, overrides);
  const controllerAttachment = controller?.createAttachmentService();
  if (controllerAttachment) {
    channelServer.registerChannel(
      IWindowControllerService.channelName,
      ProxyChannel.fromService(controllerAttachment),
    );
  }
  let closed = false;
  socket.onClose(() => {
    // WebSocket error/close 可能各触发一次；每个 attachment 只释放自己的订阅。
    if (closed) return;
    closed = true;
    controllerAttachment?.dispose();
    void scope?.dispose();
    rawServer.dispose();
  });
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function locateStaticFile(
  staticRoot: string,
  path: string,
  spaFallback: boolean,
): Promise<string | null> {
  const root = resolve(staticRoot);
  const requested = path === "/" ? "/index.html" : path;
  const candidate = resolve(root, decodeURIComponent(requested).replace(/^\/+/, ""));
  const difference = relative(root, candidate);
  if (difference && (difference.startsWith("..") || difference.includes(`..${sep}`))) return null;

  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) {
      const index = resolve(candidate, "index.html");
      return (await stat(index)).isFile() ? index : null;
    }
  } catch {
    // A missing requested file may still be served by the configured SPA entry.
  }

  if (!spaFallback || isProtectedPath(path)) return null;
  const entry = resolve(root, "index.html");
  try {
    return (await stat(entry)).isFile() ? entry : null;
  } catch {
    return null;
  }
}

export function createHttpServer(
  services: ServiceCollection,
  port = 3030,
  options: HttpServerOptions = {},
) {
  const app = new Hono();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
  const capabilities = createHostCapabilityStore();
  const controller = createHttpWindowController(services, (_scope, operation, error) => {
    log("window-controller source failed", {
      operation,
      message: error instanceof Error ? error.message : String(error),
    });
  });
  const configuredToken = options.authToken?.trim();

  if (configuredToken) {
    app.use("*", async (c, next) => {
      const url = new URL(c.req.url);
      const queryMatches = url.searchParams.get("token") === configuredToken;
      if (queryMatches) {
        c.header(
          "Set-Cookie",
          `knorvia_lite_token=${encodeURIComponent(configuredToken)}; Path=/; HttpOnly; SameSite=Lax`,
        );
      }
      const authorized =
        queryMatches || tokenFromCookies(c.req.header("Cookie")) === configuredToken;
      if (isProtectedPath(url.pathname) && !authorized)
        return c.json({ error: "Unauthorized" }, 401);
      await next();
    });
  }

  app.get("/api/server-info", (c) => {
    const serverId =
      options.serverId?.trim() ||
      process.env.KNORVIA_SERVER_ID?.trim() ||
      hostname() ||
      "knorvia-server";
    const name = options.name?.trim() || process.env.KNORVIA_SERVER_NAME?.trim();
    const workspaces =
      options.workspaces ??
      (() => {
        const path = process.env.KNORVIA_SERVER_WORKSPACE?.trim() || process.cwd();
        return [{ path, label: basename(path) || path }];
      })();
    return c.json({
      serverId,
      ...(name ? { name } : {}),
      version: KNORVIA_VERSION,
      protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
      authRequired: options.authRequired ?? Boolean(process.env.KNORVIA_SERVER_TOKEN?.trim()),
      workspaces,
      capabilities: {
        desktopContinuous: true,
        websocketRpc: true,
        processResourceTelemetry: true,
      },
    });
  });

  app.post("/api/rpc-host-capability", (c) => c.json(capabilities.issue()));

  const upgradeLocal = (mode: ConnectionMode) =>
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        connectChannels(ws.raw as WebSocket, services, mode, controller);
      },
    }));
  app.get("/ws", upgradeLocal("web-remote-replayable"));
  app.use("/ws/host", async (c, next) => {
    if (!capabilities.consume(c.req.header(KNORVIA_RPC_HOST_CAPABILITY_HEADER))) {
      return c.json({ error: "Invalid or expired host capability" }, 401);
    }
    await next();
  });
  app.get("/ws/host", upgradeLocal("desktop-continuous"));

  app.post("/api/connect-remote", async (c) => {
    const parsed = remoteTargetSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: `Invalid request body: ${formatZodError(parsed.error)}` }, 400);
    }
    try {
      const backend = await createRemoteBackend(parsed.data);
      const connection = await connectRemote(backend);
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      remoteConnections.set(id, connection);
      return c.json({ id });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.get(
    "/ws/remote/:id",
    upgradeWebSocket((c) => {
      const id = c.req.param("id");
      return {
        onOpen(_event, ws) {
          if (!id) {
            ws.close(4000, "Missing remote connection id");
            return;
          }
          const connection = remoteConnections.get(id);
          if (!connection) {
            ws.close(4004, "Remote connection not found");
            return;
          }
          remoteConnections.delete(id);
          const remoteServices = new ServiceCollection()
            .register(IFileService, connection.services.fileService)
            .register(IGitService, connection.services.gitService)
            .register(ISystemService, connection.services.systemService)
            .register(ITerminalService, connection.services.terminalService);
          connectChannels(ws.raw as WebSocket, remoteServices, "web-remote-replayable");
        },
      };
    }),
  );

  const staticRoot = options.staticRoot?.trim();
  if (staticRoot) {
    app.get("*", async (c) => {
      const file = await locateStaticFile(
        staticRoot,
        new URL(c.req.url).pathname,
        options.spaFallback ?? true,
      );
      if (!file) return c.notFound();
      const body = await readFile(file);
      c.header(
        "Content-Type",
        mimeTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
      c.header(
        "Cache-Control",
        file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
      );
      return c.body(body, 200);
    });
  }

  const server = serve({ fetch: app.fetch, hostname: options.host, port }, () => {
    const address = server.address();
    const boundPort = address && typeof address === "object" ? address.port : port;
    log(`http://${options.host?.trim() || "localhost"}:${boundPort}`);
  });
  injectWebSocket(server);
  server.once("close", () => controller?.dispose());
  return server;
}
