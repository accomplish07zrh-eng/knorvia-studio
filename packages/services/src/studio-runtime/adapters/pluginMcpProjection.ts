import type { KnorviaPluginInfo } from "@knorvia/shared";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IPluginManagementService } from "../../plugins/pluginManagement.js";
import type { StudioSharedMcpServer } from "../kernelTypes.js";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const PLUGIN_MANIFESTS = [
  join(".knorvia-plugin", "plugin.json"),
  join(".claude-plugin", "plugin.json"),
  join(".codex-plugin", "plugin.json"),
];

export interface StudioPluginMcpProjection {
  servers: StudioSharedMcpServer[];
  unavailable: Array<{ pluginId: string; serverName: string; reason: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(path: string): Promise<unknown | undefined> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (size > MAX_MANIFEST_BYTES) throw new Error("插件 MCP 配置文件过大");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function insidePluginRoot(root: string, rawPath: string): Promise<string> {
  if (isAbsolute(rawPath)) throw new Error("插件 MCP 配置路径必须在插件目录内");
  const path = resolve(root, rawPath);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("插件 MCP 配置路径越过插件目录");
  const resolvedRoot = await realpath(root);
  const resolvedPath = await realpath(path);
  const realRel = relative(resolvedRoot, resolvedPath);
  if (!realRel || realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel))
    throw new Error("插件 MCP 配置链接越过插件目录");
  return resolvedPath;
}

function definitionMap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("插件 MCP 声明格式不受支持");
  return isRecord(value.mcpServers) ? value.mcpServers : value;
}

function literalMap(value: unknown, kind: "env" | "headers"): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${kind} 必须是字符串映射`);
  const entries = Object.entries(value);
  if (entries.length > 64) throw new Error(`${kind} 项目过多`);
  const result: Array<[string, string]> = [];
  for (const [name, content] of entries) {
    if (
      typeof content !== "string" ||
      content.includes("${") ||
      (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && kind === "env") ||
      (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && kind === "headers")
    )
      throw new Error(`${kind} 包含无法安全转换的键或动态值`);
    if (kind === "env" && /^(?:KNORVIA|ZCODE)_PLUGIN_ID$/i.test(name))
      throw new Error("插件 MCP 请求宿主专用身份变量");
    result.push([name, content]);
  }
  return Object.fromEntries(result);
}

async function definitions(plugin: KnorviaPluginInfo): Promise<Record<string, unknown>> {
  if (!plugin.rootPath || !isAbsolute(plugin.rootPath)) throw new Error("插件没有本机安装目录");
  const root = plugin.rootPath;
  let manifest: Record<string, unknown> | undefined;
  for (const name of PLUGIN_MANIFESTS) {
    const parsed = await readJson(
      await insidePluginRoot(root, name).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return join(root, name);
        throw error;
      }),
    );
    if (isRecord(parsed)) {
      manifest = parsed;
      break;
    }
  }
  const defaultMcpFile = await insidePluginRoot(root, ".mcp.json").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return join(root, ".mcp.json");
    throw error;
  });
  const fromFile = await readJson(defaultMcpFile);
  let fromManifest: unknown = manifest?.mcpServers;
  if (typeof fromManifest === "string")
    fromManifest = await readJson(await insidePluginRoot(root, fromManifest));
  if (Array.isArray(fromManifest)) throw new Error("插件 MCP 多文件声明暂不能安全投影");
  return {
    ...(fromFile === undefined ? {} : definitionMap(fromFile)),
    ...(fromManifest === undefined ? {} : definitionMap(fromManifest)),
  };
}

function staticServer(plugin: KnorviaPluginInfo, key: string, raw: unknown): StudioSharedMcpServer {
  if (!isRecord(raw)) throw new Error("MCP 配置不是对象");
  if (JSON.stringify(raw).includes("${")) throw new Error("需要插件变量或私有配置");
  if (raw.auth !== undefined || raw.oauth !== undefined || raw.official !== undefined)
    throw new Error("需要插件专属认证或 broker");
  const supportedKeys = new Set([
    "type",
    "command",
    "args",
    "env",
    "url",
    "headers",
    "http_headers",
    "enabled",
  ]);
  for (const field of Object.keys(raw))
    if (!supportedKeys.has(field)) throw new Error("包含无法安全转换的插件专用配置");
  if (raw.enabled === false) throw new Error("插件 MCP 已停用");
  const name = `plugin:${plugin.name}:${key}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(name))
    throw new Error("插件 MCP 名称不能跨内核使用");
  const type = raw.type ?? (raw.command ? "stdio" : raw.url ? "http" : undefined);
  if (type === "stdio") {
    if (typeof raw.command !== "string" || !raw.command.trim()) throw new Error("缺少 stdio 命令");
    if (raw.url !== undefined || raw.headers !== undefined || raw.http_headers !== undefined)
      throw new Error("stdio MCP 包含 HTTP 字段");
    const args = raw.args ?? [];
    if (!Array.isArray(args) || args.some((item) => typeof item !== "string"))
      throw new Error("stdio 参数无效");
    return { name, type, command: raw.command, args: [...args], env: literalMap(raw.env, "env") };
  }
  if (
    type === "http" ||
    type === "streamableHttp" ||
    type === "streamable-http" ||
    type === "streamable_http"
  ) {
    if (typeof raw.url !== "string" || !/^https?:\/\//i.test(raw.url))
      throw new Error("HTTP 地址无效");
    if (raw.command !== undefined || raw.args !== undefined || raw.env !== undefined)
      throw new Error("HTTP MCP 包含 stdio 字段");
    const endpoint = new URL(raw.url);
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      (endpoint.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname))
    )
      throw new Error("HTTP 地址含私有认证信息或不安全的明文连接");
    return {
      name,
      type: "http",
      url: raw.url,
      headers: literalMap(raw.headers ?? raw.http_headers, "headers"),
    };
  }
  throw new Error("传输类型不受跨内核协议支持");
}

/** Only explicit standard MCP fields leave the Knorvia plugin runtime for one turn. */
export async function projectStudioPluginMcp(
  management: Pick<IPluginManagementService, "listPlugins">,
  workspacePath: string,
): Promise<StudioPluginMcpProjection> {
  const listed = await management.listPlugins({ workspacePath });
  const result: StudioPluginMcpProjection = { servers: [], unavailable: [] };
  for (const plugin of listed.plugins.filter((item) => item.enabled)) {
    const prefix = `plugin:${plugin.name}:`;
    const declared =
      plugin.declaredMcpServerNames ??
      plugin.mcpServerNames
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length));
    for (const name of plugin.mcpServerNames.filter((name) => !name.startsWith(prefix)))
      result.unavailable.push({
        pluginId: plugin.id,
        serverName: name,
        reason: "插件 MCP 名称不符合本机运行时命名空间",
      });
    if (!declared.length) continue;
    let map: Record<string, unknown>;
    try {
      map = await definitions(plugin);
    } catch {
      for (const serverName of declared)
        result.unavailable.push({
          pluginId: plugin.id,
          serverName,
          reason: "配置无法从插件安装目录安全读取；仅 Knorvia 内核可用",
        });
      continue;
    }
    for (const serverName of declared) {
      const nativeName = `plugin:${plugin.name}:${serverName}`;
      if (!plugin.mcpServerNames.includes(nativeName)) {
        result.unavailable.push({
          pluginId: plugin.id,
          serverName,
          reason: "Knorvia 插件运行时未启用此 MCP",
        });
        continue;
      }
      try {
        result.servers.push(staticServer(plugin, serverName, map[serverName]));
      } catch (error) {
        result.unavailable.push({
          pluginId: plugin.id,
          serverName,
          reason: error instanceof Error ? error.message : "配置无法安全转换",
        });
      }
    }
  }
  return result;
}
