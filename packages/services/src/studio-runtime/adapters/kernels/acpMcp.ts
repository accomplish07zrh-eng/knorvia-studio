import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { StudioSharedMcpServer } from "../../kernelTypes.js";
import { record } from "../../domain/kernelPolicy.js";

/** ACP v1 requires name/value arrays and capability negotiation for remote transports. */
async function commandPath(command: string): Promise<string> {
  if (isAbsolute(command)) {
    try {
      if ((await stat(command)).isFile()) return await realpath(command);
    } catch {
      /* Report a bad Studio MCP configuration before submitting the user prompt. */
    }
    throw new Error(`MCP 程序 ${command} 不存在或不是普通文件`);
  }
  if (!/^[A-Za-z0-9_.+-]{1,128}$/.test(command) || command === "." || command === "..")
    throw new Error("MCP 程序名无效，请使用 PATH 命令或绝对路径");
  const dirs = [
    ...(process.env.PATH ?? process.env.Path ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((part) => part.replace(/^"|"$/g, "")),
    join(homedir(), ".local", "bin"),
    ...(process.env.APPDATA ? [join(process.env.APPDATA, "npm")] : []),
    ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, "uv", "bin")] : []),
  ];
  const suffixes =
    process.platform === "win32" && !/\.(exe|com|cmd|bat|ps1)$/i.test(command)
      ? [".exe", ".com", ".cmd", ".bat", ".ps1", ""]
      : [""];
  for (const dir of dirs)
    for (const suffix of suffixes) {
      const candidate = join(dir, command + suffix);
      try {
        if ((await stat(candidate)).isFile()) return await realpath(candidate);
      } catch {
        /* Keep scanning the bounded candidate list. */
      }
    }
  throw new Error(`MCP 程序 ${command} 未在 PATH 中找到`);
}

export async function projectAcpMcpServers(
  servers: readonly StudioSharedMcpServer[] | undefined,
  initialized: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const capabilities = record(record(initialized.agentCapabilities).mcpCapabilities);
  return Promise.all(
    (servers ?? []).map(async (server) => {
      if (server.type === "stdio") {
        return {
          name: server.name,
          command: await commandPath(server.command),
          args: [...server.args],
          env: Object.entries(server.env).map(([name, value]) => ({ name, value })),
        };
      }
      if (capabilities[server.type] !== true)
        throw new Error(`此 CLI 未声明支持 ${server.type.toUpperCase()} MCP：${server.name}`);
      return {
        type: server.type,
        name: server.name,
        url: server.url,
        headers: Object.entries(server.headers).map(([name, value]) => ({ name, value })),
      };
    }),
  );
}
