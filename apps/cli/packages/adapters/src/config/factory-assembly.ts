// SPDX-License-Identifier: Apache-2.0
// 配置装配：按「system → user → project → env → cli」叠层，并给出各来源的归属表。
import { resolve } from "node:path";
import {
  ConfigScope,
  DefaultRuntimeConfig,
  createWorkspaceHookBundleSnapshot,
  type RuntimeConfigPatch,
} from "@knorvia/contracts";
import {
  buildWorkspaceHookBundleSnapshot,
  resolveWorkspaceHookRuntimeRoot,
} from "@knorvia/shared/workspace-hook-discovery";
import { createPrioritizedConfig, mergeConfigs } from "./config-merger.js";
import { parseEnvConfig } from "./env-config.adapter.js";
import { getDefaultConfigPath, loadFileConfig, type LoadedConfig } from "./file-config.adapter.js";
import { warnConfigDiagnostics } from "./factory-diagnostics.js";
import {
  describePluginSources,
  readProjectDiscovery,
  selectEffectiveMcp,
  summarizeProjectFiles,
  tagHookSources,
} from "./factory-sources.js";
import type { ConfigFactoryOptions, ConfigResult } from "./factory-types.js";
import type { ProjectConfigDiscovery, ProjectConfigFile } from "./project-config-types.js";
import { createConfigPort } from "./index.js";

interface UserStage {
  layer?: RuntimeConfigPatch;
  result: LoadedConfig;
}

/** 用户层：显式跳过时给出「未加载」的占位结果，其余情况按路径加载。 */
function loadUserStage(options: ConfigFactoryOptions): UserStage {
  if (options.skipUserConfig) {
    const skipped: LoadedConfig = {
      config: {},
      diagnostics: [],
      loaded: false,
      path: getDefaultConfigPath(),
    };
    return { result: skipped };
  }
  const result = loadFileConfig(options.userConfigPath);
  if (!result.loaded) return { result };
  return { layer: tagHookSources(result.config, { kind: "user", path: result.path }), result };
}

interface ProjectStage {
  discovery: ProjectConfigDiscovery;
  project: ReturnType<typeof summarizeProjectFiles>;
  uiLocalePath: string | undefined;
  uiThemePath: string | undefined;
}

/** 项目层：最后一份写过 ui.locale/ui.theme 的文件决定来源路径（倒序查找）。 */
function loadProjectStage(options: ConfigFactoryOptions): ProjectStage {
  const discovery = readProjectDiscovery(options);
  const reversed = [...discovery.files].reverse();
  return {
    discovery,
    project: summarizeProjectFiles(discovery.files),
    uiLocalePath: reversed.find((file) => file.config.ui?.locale !== undefined)?.path,
    uiThemePath: reversed.find((file) => file.config.ui?.theme !== undefined)?.path,
  };
}

interface LayerStack {
  envConfig: RuntimeConfigPatch;
  hasEnv: boolean;
  prioritized: Array<ReturnType<typeof createPrioritizedConfig>>;
}

/** 叠层顺序即优先级顺序：system 起底，user/project 逐份加入，env 与 cli 收尾。 */
function buildLayerStack(
  user: UserStage,
  project: ProjectStage,
  options: ConfigFactoryOptions,
): LayerStack {
  const prioritized = [createPrioritizedConfig(DefaultRuntimeConfig, ConfigScope.System)];
  if (user.layer !== undefined)
    prioritized.push(createPrioritizedConfig(user.layer, ConfigScope.User));
  for (const file of project.discovery.files) {
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
  return { envConfig, hasEnv, prioritized };
}

/** hooks 运行时根按同一叠层顺序取；快照只在有来源候选时生成。 */
function buildHookStage(input: {
  envConfig: RuntimeConfigPatch;
  files: ProjectConfigFile[];
  hookCandidates: ProjectConfigDiscovery["hookCandidates"];
  options: ConfigFactoryOptions;
  user: UserStage;
}) {
  const runtimeRoot = resolveWorkspaceHookRuntimeRoot([
    DefaultRuntimeConfig.hooks,
    input.user.result.config.hooks,
    ...input.hookCandidates.map((candidate) => candidate.hooks),
    input.envConfig.hooks,
    input.options.cliOverrides?.hooks,
  ]);
  const workspacePath = resolve(input.options.workingDirectory ?? process.cwd());
  const workspaceIdentity = input.options.workspaceIdentity?.trim() || workspacePath;
  const snapshotData = buildWorkspaceHookBundleSnapshot({
    runtimeRoot,
    sources: input.hookCandidates,
    workspaceIdentity,
    workspacePath,
  });
  return {
    runtimeRoot,
    snapshot: snapshotData ? createWorkspaceHookBundleSnapshot(snapshotData) : undefined,
  };
}

interface SourceTableInput {
  discovery: ProjectConfigDiscovery;
  envConfig: RuntimeConfigPatch;
  hasEnv: boolean;
  hookRuntimeRoot: ReturnType<typeof buildHookStage>["runtimeRoot"];
  hookSnapshot: ReturnType<typeof buildHookStage>["snapshot"];
  options: ConfigFactoryOptions;
  project: ProjectStage;
  servers: ReturnType<typeof selectEffectiveMcp>;
  user: UserStage;
}

/** 来源归属表：每项都回答「这个值来自哪一层」。 */
function describeSourceTable(input: SourceTableInput): ConfigResult["sources"] {
  const userConfig = input.user.result.config;
  const projectConfig = input.project.project.config;
  const plugins = describePluginSources({
    projectConfig,
    projectConfigPath: input.project.project.path,
    userConfig,
    userConfigPath: input.user.result.path,
  });
  const projectSources: ConfigResult["sources"]["project"] = {
    diagnostics: input.discovery.diagnostics,
    hasMcpServers: projectConfig.mcp?.servers !== undefined,
    hasUiLocale: projectConfig.ui?.locale !== undefined,
    hasUiTheme: projectConfig.ui?.theme !== undefined,
    loaded: input.project.project.loaded,
    mcpServerNames: input.discovery.mcpServerNames,
    path: input.project.project.path,
    paths: input.discovery.paths,
    uiLocalePath: input.project.uiLocalePath,
    uiThemePath: input.project.uiThemePath,
    workspaceHookRuntimeRoot: input.hookRuntimeRoot,
  };
  if (input.hookSnapshot !== undefined) projectSources.workspaceHookSnapshot = input.hookSnapshot;
  return {
    cli: Boolean(input.options.cliOverrides),
    env: input.hasEnv,
    mcp: { serverSources: input.servers.serverSources },
    plugins,
    project: projectSources,
    user: {
      diagnostics: input.user.result.diagnostics,
      hasMcpServers: userConfig.mcp?.servers !== undefined,
      hasUiLocale: userConfig.ui?.locale !== undefined,
      hasUiTheme: userConfig.ui?.theme !== undefined,
      loaded: input.user.result.loaded,
      mcpServerNames: Object.keys(userConfig.mcp?.servers ?? {}),
      path: input.user.result.path,
    },
  };
}

export function assembleConfig(options: ConfigFactoryOptions = {}): ConfigResult {
  const user = loadUserStage(options);
  const project = loadProjectStage(options);
  warnConfigDiagnostics({
    env: options.env,
    loggerFactory: options.loggerFactory,
    project: project.discovery.diagnostics,
    user: user.result.diagnostics,
  });
  const stack = buildLayerStack(user, project, options);
  const hooks = buildHookStage({
    envConfig: stack.envConfig,
    files: project.discovery.files,
    hookCandidates: project.discovery.hookCandidates,
    options,
    user,
  });

  const merged = mergeConfigs(...stack.prioritized);
  const servers = selectEffectiveMcp({
    cli: options.cliOverrides,
    env: stack.envConfig,
    project: project.project.config,
    user: user.result.config,
  });
  merged.mcp = { ...merged.mcp, servers: servers.servers };

  const configPort = createConfigPort(merged);
  return {
    config: configPort.getAll(),
    configPort,
    sources: describeSourceTable({
      discovery: project.discovery,
      envConfig: stack.envConfig,
      hasEnv: stack.hasEnv,
      hookRuntimeRoot: hooks.runtimeRoot,
      hookSnapshot: hooks.snapshot,
      options,
      project,
      servers,
      user,
    }),
  };
}
