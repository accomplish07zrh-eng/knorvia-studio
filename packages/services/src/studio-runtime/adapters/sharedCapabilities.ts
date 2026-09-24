import type { NativeMcpServerRecord, SkillSummary } from "@knorvia/shared";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IMcpSyncService } from "../../mcp-sync/mcpSync.js";
import type { IPluginManagementService } from "../../plugins/pluginManagement.js";
import type { ISkillsService } from "../../skills/skills.js";
import type { StudioKernelRegistry } from "../app/ports.js";
import type {
  StudioKernelTurn,
  StudioKernelTurnResult,
  StudioSharedMcpServer,
} from "../kernelTypes.js";
import { projectStudioPluginMcp } from "./pluginMcpProjection.js";
import type { CreationAgentBridge } from "../../creation/creationAgentBridge.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";

type SharedTurn = StudioKernelTurn & {
  sharedMcpServers?: StudioSharedMcpServer[];
  sharedMcpConfigPath?: string;
};

const MAX_SKILLS = 256;
const MAX_SKILL_CATALOG_CHARS = 48_000;
const MAX_SHARED_MCP_SERVERS = 64;
const SAFE_MCP_KEYS = new Set([
  "type",
  "command",
  "args",
  "env",
  "url",
  "headers",
  "http_headers",
  "enabled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown, name: string, field: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string"))
    throw new Error(`Studio MCP「${name}」的 ${field} 必须是字符串映射`);
  return value as Record<string, string>;
}

/** Keep project names authoritative, including a disabled project entry. */
export function projectStudioMcpServers(records: NativeMcpServerRecord[]): StudioSharedMcpServer[] {
  const selected = new Map<string, NativeMcpServerRecord>();
  for (const record of records) {
    const key = record.name.trim().toLowerCase();
    if (!key || selected.has(key)) continue;
    selected.set(key, record);
  }
  const enabled = [...selected.values()].filter((record) => record.enabled !== false);
  if (enabled.length > MAX_SHARED_MCP_SERVERS)
    throw new Error(`Studio MCP 超过每次会话 ${MAX_SHARED_MCP_SERVERS} 个的上限`);
  return enabled.map((record) => {
    const { name, config } = record;
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(name) ||
      ["__proto__", "constructor", "prototype"].includes(name.toLowerCase())
    )
      throw new Error(`Studio MCP 名称不可用于外部内核：${name}`);
    for (const key of Object.keys(config))
      if (!SAFE_MCP_KEYS.has(key))
        throw new Error(`Studio MCP「${name}」的 ${key} 暂不能跨内核映射`);
    if (config.enabled !== undefined && typeof config.enabled !== "boolean")
      throw new Error(`Studio MCP「${name}」的 enabled 必须是布尔值`);
    const type = config.type ?? (config.command ? "stdio" : config.url ? "http" : undefined);
    if (type === "stdio") {
      if (typeof config.command !== "string" || !config.command.trim() || config.url)
        throw new Error(`Studio MCP「${name}」缺少有效 stdio 命令`);
      if (config.headers !== undefined || config.http_headers !== undefined)
        throw new Error(`Studio MCP「${name}」不能给 stdio 命令配置 HTTP 请求头`);
      const args = config.args ?? [];
      if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
        throw new Error(`Studio MCP「${name}」的 args 必须是字符串数组`);
      return {
        name,
        type,
        command: config.command,
        args: [...args],
        env: stringMap(config.env, name, "env"),
      };
    }
    if (
      type === "http" ||
      type === "sse" ||
      type === "streamableHttp" ||
      type === "streamable-http" ||
      type === "streamable_http"
    ) {
      if (typeof config.url !== "string" || !/^https?:\/\//i.test(config.url))
        throw new Error(`Studio MCP「${name}」缺少有效 HTTP 地址`);
      if (config.command || config.args !== undefined || config.env !== undefined)
        throw new Error(`Studio MCP「${name}」的 HTTP 配置混入了 stdio 字段`);
      return {
        name,
        type: type === "sse" ? "sse" : "http",
        url: config.url,
        headers: stringMap(config.headers ?? config.http_headers, name, "headers"),
      };
    }
    throw new Error(`Studio MCP「${name}」使用了暂不支持的传输类型`);
  });
}

function skillCatalog(skills: SkillSummary[]): string {
  const enabled = skills.filter((skill) => skill.enabled);
  if (!enabled.length) return "";
  if (enabled.length > MAX_SKILLS)
    throw new Error(`Studio 技能超过每次会话 ${MAX_SKILLS} 个的目录上限`);
  const catalog = [
    "Studio 可用技能（仅为资源目录，按任务需要读取对应 SKILL.md；外部内核的文件访问权限仍生效）：",
    ...enabled.map((skill) =>
      JSON.stringify({ name: skill.name, description: skill.description, path: skill.path }),
    ),
  ].join("\n");
  if (catalog.length > MAX_SKILL_CATALOG_CHARS)
    throw new Error("Studio 技能目录过大，请停用部分技能后重试");
  return catalog;
}

function claudeMcpConfig(servers: StudioSharedMcpServer[]): string {
  return JSON.stringify({
    mcpServers: Object.fromEntries(
      servers.map((server) => [
        server.name,
        server.type === "stdio"
          ? { command: server.command, args: server.args, env: server.env }
          : { type: server.type, url: server.url, headers: server.headers },
      ]),
    ),
  });
}

/** Project Studio-owned resources into one native turn without changing any CLI profile. */
export function withStudioSharedCapabilities(
  registry: StudioKernelRegistry,
  options: {
    skills: Pick<ISkillsService, "list" | "buildPromptContext">;
    mcp: Pick<IMcpSyncService, "loadMcpFromUserDirectory">;
    plugins: Pick<IPluginManagementService, "listPlugins">;
    dataDir: string;
    creationBridge?: CreationAgentBridge;
  },
): StudioKernelRegistry {
  async function pluginResources(workspacePath: string) {
    try {
      return await projectStudioPluginMcp(options.plugins, workspacePath);
    } catch {
      return {
        servers: [],
        unavailable: [
          {
            pluginId: "Studio",
            serverName: "插件 MCP",
            reason: "无法读取已启用插件；请检查插件服务后重试",
          },
        ],
      };
    }
  }
  function resourceWarnings(
    unavailable: Awaited<ReturnType<typeof pluginResources>>["unavailable"],
  ) {
    return unavailable.map((item) => `${item.pluginId} / ${item.serverName}：${item.reason}`);
  }
  return {
    ...registry,
    async options(params) {
      const native = (await registry.options?.(params)) ?? { models: [] };
      if (parseRemoteStudioKernelId(params.kernel)) return native;
      if (params.kernel === "knorvia" || !params.workspacePath) return native;
      const [plugin, mcp] = await Promise.all([
        pluginResources(params.workspacePath),
        options.mcp
          .loadMcpFromUserDirectory({ workspacePath: params.workspacePath })
          .catch(() => undefined),
      ]);
      const warnings = resourceWarnings(plugin.unavailable);
      if (params.kernel === "antigravity" && options.creationBridge)
        warnings.push("Antigravity CLI 尚无每会话创作工具注入入口");
      if (!mcp) warnings.push("无法读取 Studio MCP 配置；请检查设置后重试");
      else {
        try {
          const ordinary = projectStudioMcpServers(mcp.servers);
          if (params.kernel === "antigravity" && (ordinary.length || plugin.servers.length))
            warnings.push("Antigravity CLI 暂无安全的每会话 MCP 注入入口；请在原 CLI 配置所需 MCP");
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "Studio MCP 配置无法跨内核映射");
        }
      }
      return {
        ...native,
        sharedResourceWarnings: warnings,
      };
    },
    adapter(kernel) {
      const adapter = registry.adapter(kernel);
      // 远端 Host 自己投影技能/MCP；本机绝对路径不能注入 SSH CLI。
      if (parseRemoteStudioKernelId(kernel)) return adapter;
      if (kernel === "knorvia") {
        if (!options.creationBridge) return adapter;
        return {
          async run(turn, sink, signal) {
            const access = await options.creationBridge!.issue(turn, sink, signal);
            try {
              const [mcp, plugin] = await Promise.all([
                options.mcp.loadMcpFromUserDirectory({ workspacePath: turn.workspacePath }),
                pluginResources(turn.workspacePath),
              ]);
              const ordinary = projectStudioMcpServers(mcp.servers);
              const names = new Set(ordinary.map((server) => server.name.toLowerCase()));
              const shared = [
                ...ordinary,
                ...plugin.servers.filter((server) => !names.has(server.name.toLowerCase())),
              ];
              if (shared.some((server) => server.name.toLowerCase() === access.server.name))
                throw new Error("Studio 创作工具名称与已有 MCP 重复");
              shared.push(access.server);
              return await adapter.run({ ...turn, sharedMcpServers: shared }, sink, signal);
            } finally {
              access.revoke();
            }
          },
        };
      }
      return {
        async run(turn, sink, signal) {
          let temporaryDirectory: string | undefined;
          let creationAccess:
            | Awaited<ReturnType<NonNullable<typeof options.creationBridge>["issue"]>>
            | undefined;
          let handedOff = false;
          try {
            signal.throwIfAborted();
            const nativeSlash = /^\/[^\s/]+(?:\s|$)/.test(turn.text.trimStart());
            const [listed, mcp, plugin] = await Promise.all([
              options.skills.list({ workspacePath: turn.workspacePath }),
              options.mcp.loadMcpFromUserDirectory({ workspacePath: turn.workspacePath }),
              pluginResources(turn.workspacePath),
            ]);
            signal.throwIfAborted();
            // Native CLI commands must keep their exact input; skill context would turn
            // /status or /compact into an ordinary model prompt.
            const catalog = nativeSlash ? "" : skillCatalog(listed.skills);
            const activated = nativeSlash
              ? { prompt: turn.text }
              : await options.skills.buildPromptContext({
                  workspacePath: turn.workspacePath,
                  prompt: turn.text,
                });
            const ordinaryServers = projectStudioMcpServers(mcp.servers);
            const explicitNames = new Set(
              ordinaryServers.map((server) => server.name.toLowerCase()),
            );
            const servers = [
              ...ordinaryServers,
              ...plugin.servers.filter((server) => !explicitNames.has(server.name.toLowerCase())),
            ];
            if (options.creationBridge && kernel !== "antigravity") {
              creationAccess = await options.creationBridge.issue(turn, sink, signal);
              servers.push(creationAccess.server);
            }
            if (servers.length > MAX_SHARED_MCP_SERVERS)
              throw new Error(`Studio MCP 超过每次会话 ${MAX_SHARED_MCP_SERVERS} 个的上限`);
            const names = new Set<string>();
            for (const server of servers) {
              const name = server.name.toLowerCase();
              if (names.has(name)) throw new Error(`Studio MCP 名称重复：${server.name}`);
              names.add(name);
            }
            const text = catalog ? `${activated.prompt}\n\n${catalog}` : activated.prompt;
            const projected: SharedTurn = { ...turn, text, sharedMcpServers: servers };
            const warnings = resourceWarnings(plugin.unavailable);
            if (warnings.length && /^(group|workflow):/.test(turn.conversationId))
              await sink.emit({
                type: "progress",
                text: `Studio 插件 MCP 兼容提示：${warnings.join("；").slice(0, 12_000)}`,
              });
            if (kernel === "claude-code" && servers.length) {
              const root = join(options.dataDir, "shared-mcp");
              await mkdir(root, { recursive: true });
              temporaryDirectory = await mkdtemp(join(root, "turn-"));
              const file = join(temporaryDirectory, "mcp.json");
              await writeFile(file, claudeMcpConfig(servers), {
                encoding: "utf8",
                flag: "wx",
                mode: 0o600,
              });
              projected.sharedMcpConfigPath = file;
            }
            signal.throwIfAborted();
            handedOff = true;
            return await adapter.run(projected, sink, signal);
          } catch (error) {
            if (handedOff) throw error;
            const result: StudioKernelTurnResult = {
              status: signal.aborted ? "cancelled" : "failed",
              text: "",
              error: signal.aborted
                ? "Studio 共享资源准备已取消"
                : error instanceof Error
                  ? error.message
                  : "Studio 共享资源准备失败",
              resultKnown: true,
              retryable: !signal.aborted,
            };
            return result;
          } finally {
            creationAccess?.revoke();
            if (temporaryDirectory)
              await rm(temporaryDirectory, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 50,
              }).catch(async () => {
                await sink
                  .emit({
                    type: "progress",
                    text: "Studio MCP 临时配置清理失败；请检查本机 Studio 数据目录",
                  })
                  .catch(() => {});
              });
          }
        },
      };
    },
  };
}
