import { disposeServiceResourcesAndWait, getAppConfigDir } from "@knorvia/services/node";
import {
  formatLogPrefix,
  formatZodError,
  helloAckMessageSchema,
  KNORVIA_VERSION,
  SERVICE_AUTHORITY_MODE_ENV,
  type HelloAckMessage,
  type HelloMessage,
} from "@knorvia/shared";
import {
  materializeBundledKnorviaBuiltinProviderConfig,
  readBundledKnorviaBuiltinProviderConfig,
} from "./bundledBuiltinProviderConfig.js";
import { registerStdioProcessLifecycle } from "./stdio-lifecycle.js";
import { createStdioServer } from "./stdio.js";
import { createStdioServices } from "./stdioServices.js";

const forwardToStderr = (...args: unknown[]) => console.error(...args);
for (const method of ["log", "info", "warn", "debug"] as const) {
  console[method] = forwardToStderr;
}

function log(...args: unknown[]): void {
  console.error(formatLogPrefix("knorvia-server:stdio", process.pid), ...args);
}

function receiveAcknowledgement(): Promise<HelloAckMessage> {
  return new Promise((resolve, reject) => {
    let pending = "";
    const timeout = setTimeout(() => {
      reject(new Error("Handshake timeout: no hello-ack received within 10s"));
    }, 10_000);
    const onData = (chunk: Buffer) => {
      pending += chunk.toString("utf-8");
      const lineEnd = pending.indexOf("\n");
      if (lineEnd < 0) return;
      process.stdin.removeListener("data", onData);
      clearTimeout(timeout);
      const firstLine = pending.slice(0, lineEnd).trim();
      const remaining = pending.slice(lineEnd + 1);
      try {
        const parsed = helloAckMessageSchema.safeParse(JSON.parse(firstLine));
        if (!parsed.success) {
          reject(new Error(`Invalid hello-ack: ${formatZodError(parsed.error)}`));
          return;
        }
        if (remaining) process.stdin.unshift(Buffer.from(remaining, "utf-8"));
        resolve(parsed.data);
      } catch (error) {
        reject(new Error(`Failed to parse hello-ack: ${error}`));
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--version")) {
    process.stdout.write(`${KNORVIA_VERSION}\n`);
    process.exit(0);
  }

  const hello: HelloMessage = {
    type: "knorvia-hello",
    version: KNORVIA_VERSION,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
  };
  process.stdout.write(`${JSON.stringify(hello)}\n`);
  const ack = await receiveAcknowledgement();
  log(`client connected: ${ack.clientId} (v${ack.version})`);
  const knorviaBuiltinProviderConfigFilePath = await materializeBundledKnorviaBuiltinProviderConfig(
    {
      environmentConfigRoot: getAppConfigDir(),
      content: readBundledKnorviaBuiltinProviderConfig(),
    },
  );
  const { services, authorityModeParseResult } = createStdioServices({
    env: process.env,
    knorviaBuiltinProviderConfigFilePath,
  });
  if (authorityModeParseResult.invalidRawValue) {
    log(
      `${SERVICE_AUTHORITY_MODE_ENV}=${authorityModeParseResult.invalidRawValue} 非法，按默认本机 Environment 权威模式启动`,
    );
  }
  const server = createStdioServer(services);
  registerStdioProcessLifecycle({
    stdin: process.stdin,
    signalSource: process,
    log,
    stopRpc: server.stop,
    dispose: () => disposeServiceResourcesAndWait(services),
    exit: (code) => process.exit(code),
  });
  log("stdio mode ready");
}

main().catch((error: unknown) => {
  log("fatal:", error);
  process.exit(1);
});
