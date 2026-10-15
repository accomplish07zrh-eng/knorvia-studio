// SPDX-License-Identifier: Apache-2.0
// 项目配置：发现工作区配置文件、解析相对 cwd、把钩子降级成「待信任」候选。
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { McpServerConfig, RuntimeConfigPatch } from "@knorvia/contracts";
import {
  createWorkspaceHookSourceInput,
  discoverWorkspaceHookConfigPaths,
  workspaceHooksConfigSchema,
  type WorkspaceHookSourceInput,
} from "@knorvia/shared/workspace-hook-discovery";
import { loadFileConfig, type LoadedConfig } from "./file-config.adapter.js";
import type {
  FileLoadOptions,
  ProjectConfigDiscovery,
  ProjectConfigFile,
} from "./project-config-types.js";

export type { ProjectConfigDiscovery, ProjectConfigFile } from "./project-config-types.js";

const PROJECT_CONFIG_DIR = ".knorvia-studio";
const STDIO_SERVER_TYPE = "stdio";
const FALLBACK_CWD = ".";
const FIRST_INDEX = 0;

const HOOK_TRUST_DIAGNOSTIC = {
  code: "config_project_hooks_pending_trust",
  message: "Project hooks are pending workspace trust and remain blocked",
  path: "hooks",
  severity: "warning",
} as const;

interface HookInputParts {
  hooks: unknown;
  options: FileLoadOptions;
  projectRoot: string;
  configPath: string;
}

/** stdio 服务器的相对 cwd 以配置文件所在项目目录为基准。 */
function withResolvedCwd(server: McpServerConfig, baseDir: string): McpServerConfig {
  if (server.type !== STDIO_SERVER_TYPE) return server;
  const configured = server.cwd ?? FALLBACK_CWD;
  const resolved = { ...server };
  resolved.cwd = isAbsolute(configured) ? configured : resolve(baseDir, configured);
  return resolved;
}

/** 项目层补丁：钩子由候选流程单独处理，mcp 服务器的 cwd 先归一成绝对路径。 */
function toProjectPatch(source: RuntimeConfigPatch, baseDir: string): RuntimeConfigPatch {
  const projectPatch = { ...source };
  delete projectPatch.hooks;
  const servers = projectPatch.mcp?.servers;
  if (servers) {
    const resolvedServers: Record<string, McpServerConfig> = {};
    for (const [name, server] of Object.entries(servers)) {
      resolvedServers[name] = withResolvedCwd(server, baseDir);
    }
    const mcp = { ...projectPatch.mcp };
    mcp.servers = resolvedServers;
    projectPatch.mcp = mcp;
  }
  return projectPatch;
}

/** 配置目录本身（`.knorvia-studio`）不作为项目根：项目根是它的父目录。 */
function projectBaseDir(configPath: string): string {
  const parent = dirname(configPath);
  return basename(parent) === PROJECT_CONFIG_DIR ? dirname(parent) : parent;
}

/** 用赋值构造钩子候选入参：字段顺序与来源对象一致，便于逐项核对。 */
function hookSourceInput(parts: HookInputParts): WorkspaceHookSourceInput {
  const payload = {} as Parameters<typeof createWorkspaceHookSourceInput>[0];
  payload.path = parts.configPath;
  payload.workingDirectory = resolve(parts.options.workingDirectory ?? parts.projectRoot);
  payload.hooks = workspaceHooksConfigSchema.parse(parts.hooks);
  payload.discoveryOrder = parts.options.discoveryOrder ?? FIRST_INDEX;
  payload.explicitProjectConfig = parts.options.explicitProjectConfig;
  return createWorkspaceHookSourceInput(payload);
}

function hookCandidateFor(
  result: LoadedConfig,
  baseDir: string,
  options: FileLoadOptions,
): WorkspaceHookSourceInput | undefined {
  const declared = result.loaded ? result.config.hooks : undefined;
  if (declared === undefined) return undefined;
  return hookSourceInput({
    configPath: result.path,
    hooks: declared,
    options,
    projectRoot: baseDir,
  });
}

export function loadProjectConfigFile(
  path: string,
  options: FileLoadOptions = {},
): ProjectConfigFile {
  const loadedConfig = loadFileConfig(path);
  const baseDir = projectBaseDir(loadedConfig.path);
  const collected = loadedConfig.diagnostics.slice();
  const candidate = hookCandidateFor(loadedConfig, baseDir, options);
  if (candidate !== undefined)
    collected.push({ ...HOOK_TRUST_DIAGNOSTIC, filePath: loadedConfig.path });

  const file = {} as ProjectConfigFile;
  file.baseDir = baseDir;
  file.config = loadedConfig.loaded ? toProjectPatch(loadedConfig.config, baseDir) : {};
  file.diagnostics = collected;
  if (candidate !== undefined) file.hookCandidate = candidate;
  file.loaded = loadedConfig.loaded;
  file.path = loadedConfig.path;
  return file;
}

export function loadProjectConfigs(
  workingDirectory?: string,
  explicitProjectConfigPath?: string,
): ProjectConfigDiscovery {
  const cwd = resolve(workingDirectory ?? process.cwd());
  const query = {} as Parameters<typeof discoverWorkspaceHookConfigPaths>[0];
  query.workingDirectory = cwd;
  if (explicitProjectConfigPath) query.explicitProjectConfigPath = explicitProjectConfigPath;
  const found = discoverWorkspaceHookConfigPaths(query);

  const files: ProjectConfigFile[] = [];
  for (let index = 0; index < found.length; index += 1) {
    const reference = found[index]!;
    const perFile = {} as FileLoadOptions;
    perFile.discoveryOrder = index;
    perFile.explicitProjectConfig = reference.explicitProjectConfig;
    perFile.workingDirectory = cwd;
    files.push(loadProjectConfigFile(reference.path, perFile));
  }
  return summarizeProjectConfigs(files);
}

export function summarizeProjectConfigs(discovered: ProjectConfigFile[]): ProjectConfigDiscovery {
  const loaded = discovered.filter((file) => file.loaded);
  const mcpNames = new Set<string>();
  const candidates: WorkspaceHookSourceInput[] = [];
  for (const file of loaded) {
    for (const name of Object.keys(file.config.mcp?.servers ?? {})) mcpNames.add(name);
    if (file.hookCandidate !== undefined) candidates.push(file.hookCandidate);
  }
  const discovery = {} as ProjectConfigDiscovery;
  discovery.diagnostics = discovered.flatMap((file) => file.diagnostics);
  discovery.files = loaded;
  discovery.hookCandidates = candidates;
  discovery.loaded = loaded.length > FIRST_INDEX;
  discovery.paths = loaded.map((file) => file.path);
  discovery.mcpServerNames = [...mcpNames];
  return discovery;
}
