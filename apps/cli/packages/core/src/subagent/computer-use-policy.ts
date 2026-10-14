import { relative, isAbsolute } from "node:path";
import {
  KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME as KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME,
  KNORVIA_CUA_OFFICIAL_PLUGIN_ID,
} from "@knorvia/shared";
import type { McpToolDescriptor, PluginReferenceCatalog, SkillMetadata } from "@knorvia/contracts";
import { toMcpToolName, toModelVisibleMcpNamePart } from "../mcp/name.js";

export const SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE = "SUBAGENT_COMPUTER_USE_UNAVAILABLE" as const;
export const SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE =
  "Computer Use is not available in subagent" as const;

const OFFICIAL_CUA_CANONICAL_PREFIX = "mcp__computer-use__";
const OFFICIAL_CUA_ALIAS_PREFIX = "mcp__computer_use__";
const OFFICIAL_CUA_SERVER_PARTS = new Set([
  "computer-use",
  "computer_use",
  toModelVisibleMcpNamePart(KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME),
]);

export interface OfficialCuaPolicy {
  readonly serverNames: ReadonlySet<string>;
  isOfficialToolRequest(name: string): boolean;
  isOfficialServerSelector(name: string): boolean;
  isOfficialSkillRequest(name: string): boolean;
  isOfficialSkill(metadata: SkillMetadata): boolean;
}

export function createOfficialCuaPolicy(
  officialServerNames: ReadonlySet<string>,
  descriptors: readonly McpToolDescriptor[],
  catalog: PluginReferenceCatalog | undefined,
): OfficialCuaPolicy {
  const toolNames = new Set<string>();
  let cuaDescriptorCount = 0;
  for (const descriptor of descriptors) {
    if (!officialServerNames.has(descriptor.serverName)) continue; // 该描述符不属于官方 CUA，跳过
    cuaDescriptorCount += 1;
    toolNames.add(toMcpToolName(descriptor));
    if (descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME) {
      const suffix = toModelVisibleMcpNamePart(descriptor.toolName);
      toolNames.add(`${OFFICIAL_CUA_CANONICAL_PREFIX}${suffix}`);
      toolNames.add(`${OFFICIAL_CUA_ALIAS_PREFIX}${suffix}`);
    }
  }

  const cuaToolPrefixes = new Set<string>();
  for (const serverName of officialServerNames) {
    cuaToolPrefixes.add(`mcp__${toModelVisibleMcpNamePart(serverName)}__`);
  }
  if (officialServerNames.has(KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME)) {
    cuaToolPrefixes.add(OFFICIAL_CUA_CANONICAL_PREFIX);
    cuaToolPrefixes.add(OFFICIAL_CUA_ALIAS_PREFIX);
  }

  const cuaServerSelectorParts = new Set<string>();
  for (const serverName of officialServerNames) {
    if (serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME) {
      for (const part of OFFICIAL_CUA_SERVER_PARTS) cuaServerSelectorParts.add(part);
      continue; // 该描述符不属于官方 CUA，跳过
    }
    cuaServerSelectorParts.add(toModelVisibleMcpNamePart(serverName));
  }

  const officialPlugin = catalog?.plugins.find(
    (plugin) => plugin.pluginId === KNORVIA_CUA_OFFICIAL_PLUGIN_ID,
  );
  const qualifiedSkillNames = new Set(officialPlugin?.skillQualifiedNames ?? []);
  const bareSkillNames = new Set(
    [...qualifiedSkillNames]
      .map((name) => name.slice(name.indexOf(":") + 1))
      .filter((name) => name.length > 0),
  );
  const cuaRootPath = officialPlugin?.rootPath;
  const cuaPluginName = officialPlugin?.name;

  return {
    // 判定所需的官方 CUA 视图
    // 判定所需的官方 CUA 视图
    serverNames: new Set(officialServerNames),
    isOfficialToolRequest(name) {
      const toolName = name.trim();
      if (toolNames.has(toolName)) return true;
      // 父进程 MCP 还没有启动快照时，只能靠已认证 server 的命名空间来认；一旦拿到
      // descriptor，就收窄成精确工具集合，免得同名的第三方工具被当成官方 CUA。
      if (cuaDescriptorCount > 0 || cuaToolPrefixes.size === 0) return false;
      return [...cuaToolPrefixes].some(
        (toolPrefix) => toolName.startsWith(toolPrefix) && toolName.length > toolPrefix.length,
      );
    },
    isOfficialServerSelector(name) {
      const toolName = name.trim();
      if (officialServerNames.size === 0) return false;
      if (!toolName.startsWith("mcp__") || !toolName.endsWith("__*")) return false;
      const serverSegment = toolName.slice("mcp__".length, -"__*".length);
      return cuaServerSelectorParts.has(serverSegment);
    },
    isOfficialSkillRequest(name) {
      const toolName = name.trim();
      // 裸名要在下面的实时 Skill 元数据里再解析一次；只凭裸名判断会漏判。
      // name as official here would reject a third-party Skill with the same name.
      return qualifiedSkillNames.has(toolName);
    },
    isOfficialSkill(metadata) {
      // 该 Skill 是否属于官方 CUA
      if (metadata.source !== "plugin") return false;
      if (!cuaPluginName || !cuaRootPath) return false;
      if (metadata.pluginName !== cuaPluginName) return false;
      if (!isUnderRoot(cuaRootPath, metadata.rootPath)) return false;
      return metadata.qualifiedName !== undefined
        ? qualifiedSkillNames.has(metadata.qualifiedName)
        : bareSkillNames.has(metadata.name);
    },
  };
}

function isUnderRoot(rootPath: string, candidatePath: string): boolean {
  const pathFromRoot = relative(rootPath, candidatePath);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}
