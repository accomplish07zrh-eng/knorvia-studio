import { createConfig } from "@knorvia/adapters/config";
import { getSessionDbPath } from "./app/session-store.js";
import { prepareProtocolStartupStorage } from "./protocol/storage-startup.js";

export interface PrepareKnorviaStorageOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** 存储预检只依赖配置和存储；不能先求值 Agent/Provider/MCP 的通用 bootstrap。 */
export async function prepareKnorviaStorage(
  options: PrepareKnorviaStorageOptions = {},
): Promise<void> {
  const config = createConfig({ env: options.env });
  await prepareProtocolStartupStorage({
    dbPath: getSessionDbPath(config, options.cwd),
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
  });
}
