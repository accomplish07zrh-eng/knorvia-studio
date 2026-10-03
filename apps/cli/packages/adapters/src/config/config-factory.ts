import { resolve } from "node:path";
import type {
  ConfigPort,
  HookConfigSource,
  LoggerFactory,
  McpServerConfig,
  RuntimeConfig,
  RuntimeConfigPatch,
  WorkspaceHookBundleSnapshot,
} from "@knorvia/contracts";
import {
  ConfigScope,
  DefaultRuntimeConfig,
  createWorkspaceHookBundleSnapshot,
} from "@knorvia/contracts";
import {
  buildWorkspaceHookBundleSnapshot,
  resolveWorkspaceHookRuntimeRoot,
  type WorkspaceHookRuntimeRoot,
} from "@knorvia/shared/workspace-hook-discovery";
import { createConfigPort } from "./index.js";
import { loadFileConfig, getDefaultConfigPath, type LoadedConfig } from "./file-config.adapter.js";
import { parseEnvConfig } from "./env-config.adapter.js";
import { mergeConfigs, createPrioritizedConfig } from "./config-merger.js";
import { createNodeLoggerFactory } from "../logging/index.js";
import {
  loadProjectConfigFile,
  loadProjectConfigs,
  summarizeProjectConfigs,
  type ProjectConfigDiscovery,
  type ProjectConfigFile,
} from "./project-config.adapter.js";

export interface ConfigFactoryOptions {
  userConfigPath?: string;
  projectConfigPath?: string;
  workingDirectory?: string;
  workspaceIdentity?: string;
  env?: Record<string, string | undefined>;
  cliOverrides?: RuntimeConfigPatch;
  skipUserConfig?: boolean;
  loggerFactory?: LoggerFactory;
}

export interface ConfigResult {
  configPort: ConfigPort;
  config: RuntimeConfig;
  sources: {
    user: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string;
      loaded: boolean;
      hasMcpServers: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      mcpServerNames: string[];
    };
    project: {
      diagnostics: LoadedConfig["diagnostics"];
      path: string | undefined;
      paths: string[];
      loaded: boolean;
      hasUiLocale: boolean;
      hasUiTheme: boolean;
      hasMcpServers: boolean;
      mcpServerNames: string[];
      uiLocalePath: string | undefined;
      uiThemePath: string | undefined;
      workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
      workspaceHookRuntimeRoot?: WorkspaceHookRuntimeRoot;
    };
    plugins: PluginConfigSources;
    mcp: { serverSources: Record<string, McpServerConfigSource> };
    env: boolean;
    cli: boolean;
  };
}

export type McpServerConfigSource = "system" | "project" | "user" | "env" | "cli";
export type PluginConfigScope = "user" | "workspace";
export interface PluginConfigSources {
  dirs: { user: string[]; workspace: string[] };
  enabled: Record<string, PluginConfigScope>;
  marketplaces: Record<string, PluginConfigScope>;
  options: Record<string, Record<string, PluginConfigScope>>;
  paths: { user: string; workspace: string | undefined };
}

const LOGGER_SCOPE = "knorvia";
const LOGGER_MODULE = "adapters.config";
const MCP_DIAGNOSTIC_CODE = "config_mcp_server_invalid";
const TRUST_DIAGNOSTIC_CODE = "config_project_hooks_pending_trust";
const MCP_WARNING = "MCP server config skipped";
const TRUST_WARNING = "Project hooks pending workspace trust";
const FILE_WARNING = "Config file failed to load";
const MCP_WARNING_EVENT = "config.mcp_server.skipped";
const TRUST_WARNING_EVENT = "config.project_hooks.pending_trust";
const FILE_WARNING_EVENT = "config.file.invalid";

function tagHooks(patch: RuntimeConfigPatch, source: HookConfigSource): RuntimeConfigPatch {
  if (!patch.hooks?.events) return patch;
  const events = Object.fromEntries(
    Object.entries(patch.hooks.events).map(([name, matchers]) => [
      name,
      matchers?.map((matcher) => ({
        ...matcher,
        hooks: matcher.hooks.map((hook) => ({ ...hook, source: hook.source ?? source })),
      })),
    ]),
  );
  return { ...patch, hooks: { ...patch.hooks, events } };
}

function readProjects(options: ConfigFactoryOptions): ProjectConfigDiscovery {
  if (options.workingDirectory) {
    return loadProjectConfigs(options.workingDirectory, options.projectConfigPath);
  }
  if (!options.projectConfigPath) return summarizeProjectConfigs([]);
  return summarizeProjectConfigs([
    loadProjectConfigFile(options.projectConfigPath, {
      discoveryOrder: 0,
      explicitProjectConfig: true,
    }),
  ]);
}

function warnDiagnostics(
  options: ConfigFactoryOptions,
  user: LoadedConfig["diagnostics"],
  project: LoadedConfig["diagnostics"],
): void {
  if (user.length === 0 && project.length === 0) return;
  const factory = options.loggerFactory ?? createNodeLoggerFactory({ env: options.env });
  const logger = factory.createLogger(LOGGER_SCOPE).child({ module: LOGGER_MODULE });
  const batches: Array<["user" | "project", LoadedConfig["diagnostics"]]> = [
    ["user", user],
    ["project", project],
  ];
  for (const [scope, diagnostics] of batches) {
    for (const diagnostic of diagnostics) {
      const isMcp = diagnostic.code === MCP_DIAGNOSTIC_CODE;
      const isTrust = diagnostic.code === TRUST_DIAGNOSTIC_CODE;
      const message = isMcp ? MCP_WARNING : isTrust ? TRUST_WARNING : FILE_WARNING;
      const event = isMcp ? MCP_WARNING_EVENT : isTrust ? TRUST_WARNING_EVENT : FILE_WARNING_EVENT;
      logger.warn(message, {
        configPath: diagnostic.filePath,
        configScope: scope,
        diagnosticCode: diagnostic.code,
        diagnosticMessage: diagnostic.message,
        diagnosticPath: diagnostic.path,
        event,
        severity: diagnostic.severity,
      });
    }
  }
}

function projectSummary(files: ProjectConfigFile[]) {
  if (files.length === 0) {
    const config: RuntimeConfigPatch = {};
    return { config, diagnostics: [], path: undefined, loaded: false };
  }
  return {
    config: mergeConfigs(
      ...files.map((file) => createPrioritizedConfig(file.config, ConfigScope.Project)),
    ),
    diagnostics: files.flatMap((file) => file.diagnostics),
    path: files.at(-1)?.path,
    loaded: true,
  };
}

function describePlugins(
  user: RuntimeConfigPatch,
  project: RuntimeConfigPatch,
  userPath: string,
  projectPath: string | undefined,
): PluginConfigSources {
  const dirs = { user: user.plugins?.dirs ?? [], workspace: project.plugins?.dirs ?? [] };
  const enabled: PluginConfigSources["enabled"] = {};
  for (const name of Object.keys(user.plugins?.enabledPlugins ?? {})) enabled[name] = "user";
  for (const name of Object.keys(project.plugins?.enabledPlugins ?? {}))
    enabled[name] = "workspace";
  const marketplaces: PluginConfigSources["marketplaces"] = {};
  for (const name of Object.keys(user.plugins?.extraKnownMarketplaces ?? {}))
    marketplaces[name] = "user";
  const options: PluginConfigSources["options"] = {};
  const configs: Array<[PluginConfigScope, RuntimeConfigPatch]> = [
    ["user", user],
    ["workspace", project],
  ];
  for (const [scope, config] of configs) {
    for (const [plugin, settings] of Object.entries(config.plugins?.options ?? {})) {
      options[plugin] ??= {};
      for (const name of Object.keys(settings)) options[plugin][name] = scope;
    }
  }
  return {
    dirs,
    enabled,
    marketplaces,
    options,
    paths: { user: userPath, workspace: projectPath },
  };
}

function effectiveMcp(
  project: RuntimeConfigPatch,
  user: RuntimeConfigPatch,
  env: RuntimeConfigPatch,
  cli: RuntimeConfigPatch | undefined,
) {
  const servers: Record<string, McpServerConfig> = {};
  const serverSources: Record<string, McpServerConfigSource> = {};
  const configs: Array<[McpServerConfigSource, RuntimeConfigPatch | undefined]> = [
    ["system", DefaultRuntimeConfig],
    ["project", project],
    ["user", user],
    ["env", env],
    ["cli", cli],
  ];
  for (const [scope, config] of configs) {
    for (const [name, server] of Object.entries(config?.mcp?.servers ?? {})) {
      servers[name] = server;
      serverSources[name] = scope;
    }
  }
  return { servers, serverSources };
}

export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult {
  const prioritized = [createPrioritizedConfig(DefaultRuntimeConfig, ConfigScope.System)];
  const userResult: LoadedConfig = options.skipUserConfig
    ? { config: {}, diagnostics: [], path: getDefaultConfigPath(), loaded: false }
    : loadFileConfig(options.userConfigPath);
  if (userResult.loaded) {
    prioritized.push(
      createPrioritizedConfig(
        tagHooks(userResult.config, { kind: "user", path: userResult.path }),
        ConfigScope.User,
      ),
    );
  }
  const discovery = readProjects(options);
  warnDiagnostics(options, userResult.diagnostics, discovery.diagnostics);
  const projectResult = projectSummary(discovery.files);
  const uiLocalePath = [...discovery.files]
    .reverse()
    .find((file) => file.config.ui?.locale !== undefined)?.path;
  const uiThemePath = [...discovery.files]
    .reverse()
    .find((file) => file.config.ui?.theme !== undefined)?.path;
  for (const file of discovery.files) {
    prioritized.push(createPrioritizedConfig(file.config, ConfigScope.Project));
  }
  const envConfig = parseEnvConfig(options.env ?? process.env);
  const hasEnv = Object.keys(envConfig).length > 0;
  if (hasEnv) {
    prioritized.push(
      createPrioritizedConfig(tagHooks(envConfig, { kind: "internal" }), ConfigScope.Env),
    );
  }
  if (options.cliOverrides) {
    prioritized.push(
      createPrioritizedConfig(
        tagHooks(options.cliOverrides, { kind: "internal" }),
        ConfigScope.Cli,
      ),
    );
  }
  const runtimeRoot = resolveWorkspaceHookRuntimeRoot([
    DefaultRuntimeConfig.hooks,
    userResult.config.hooks,
    ...discovery.hookCandidates.map((candidate) => candidate.hooks),
    envConfig.hooks,
    options.cliOverrides?.hooks,
  ]);
  const workspacePath = resolve(options.workingDirectory ?? process.cwd());
  const workspaceIdentity = options.workspaceIdentity?.trim() || workspacePath;
  const snapshotData = buildWorkspaceHookBundleSnapshot({
    workspaceIdentity,
    workspacePath,
    sources: discovery.hookCandidates,
    runtimeRoot,
  });
  const workspaceHookSnapshot = snapshotData
    ? createWorkspaceHookBundleSnapshot(snapshotData)
    : undefined;
  const merged = mergeConfigs(...prioritized);
  const plugins = describePlugins(
    userResult.config,
    projectResult.config,
    userResult.path,
    projectResult.path,
  );
  const mcp = effectiveMcp(
    projectResult.config,
    userResult.config,
    envConfig,
    options.cliOverrides,
  );
  merged.mcp = { ...merged.mcp, servers: mcp.servers };
  const configPort = createConfigPort(merged);
  return {
    configPort,
    config: configPort.getAll(),
    sources: {
      user: {
        diagnostics: userResult.diagnostics,
        path: userResult.path,
        loaded: userResult.loaded,
        hasMcpServers: userResult.config.mcp?.servers !== undefined,
        hasUiLocale: userResult.config.ui?.locale !== undefined,
        hasUiTheme: userResult.config.ui?.theme !== undefined,
        mcpServerNames: Object.keys(userResult.config.mcp?.servers ?? {}),
      },
      project: {
        diagnostics: discovery.diagnostics,
        path: projectResult.path,
        paths: discovery.paths,
        loaded: projectResult.loaded,
        hasUiLocale: projectResult.config.ui?.locale !== undefined,
        hasUiTheme: projectResult.config.ui?.theme !== undefined,
        hasMcpServers: projectResult.config.mcp?.servers !== undefined,
        mcpServerNames: discovery.mcpServerNames,
        uiLocalePath,
        uiThemePath,
        ...(workspaceHookSnapshot ? { workspaceHookSnapshot } : {}),
        workspaceHookRuntimeRoot: runtimeRoot,
      },
      plugins,
      mcp: { serverSources: mcp.serverSources },
      env: hasEnv,
      cli: !!options.cliOverrides,
    },
  };
}

export function resolveWorkspaceStorageDir(input: {
  env?: Record<string, string | undefined>;
  workingDirectory: string;
}): string {
  const base = createConfig({ env: input.env }).config.storage.dir;
  const discovery = loadProjectConfigs(input.workingDirectory);
  let project: string | undefined;
  for (const file of discovery.files) {
    const directory = file.config.storage?.dir;
    if (directory !== null && directory !== undefined) project = directory;
  }
  const env = parseEnvConfig(input.env ?? process.env).storage?.dir;
  return env ?? project ?? base;
}
