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
import { warnConfigDiagnostics } from "./factory-diagnostics.js";
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

import {
  describePluginSources,
  readProjectDiscovery,
  selectEffectiveMcp,
  summarizeProjectFiles,
  tagHookSources,
} from "./factory-sources.js";
import type {
  McpServerConfigSource,
  PluginConfigScope,
  PluginConfigSources,
} from "./factory-sources.js";

export type {
  McpServerConfigSource,
  PluginConfigScope,
  PluginConfigSources,
} from "./factory-sources.js";

export function createConfig(options: ConfigFactoryOptions = {}): ConfigResult {
  const prioritized = [createPrioritizedConfig(DefaultRuntimeConfig, ConfigScope.System)];
  const userResult: LoadedConfig = options.skipUserConfig
    ? { config: {}, diagnostics: [], path: getDefaultConfigPath(), loaded: false }
    : loadFileConfig(options.userConfigPath);
  if (userResult.loaded) {
    prioritized.push(
      createPrioritizedConfig(
        tagHookSources(userResult.config, { kind: "user", path: userResult.path }),
        ConfigScope.User,
      ),
    );
  }
  const discovery = readProjectDiscovery(options);
  warnConfigDiagnostics({
    env: options.env,
    loggerFactory: options.loggerFactory,
    project: discovery.diagnostics,
    user: userResult.diagnostics,
  });
  const projectResult = summarizeProjectFiles(discovery.files);
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
      createPrioritizedConfig(tagHookSources(envConfig, { kind: "internal" }), ConfigScope.Env),
    );
  }
  if (options.cliOverrides) {
    prioritized.push(
      createPrioritizedConfig(
        tagHookSources(options.cliOverrides, { kind: "internal" }),
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
  const plugins = describePluginSources(
    userResult.config,
    projectResult.config,
    userResult.path,
    projectResult.path,
  );
  const mcp = selectEffectiveMcp({
    cli: options.cliOverrides,
    env: envConfig,
    project: projectResult.config,
    user: userResult.config,
  });
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
