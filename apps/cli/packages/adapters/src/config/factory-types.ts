// SPDX-License-Identifier: Apache-2.0
// 配置工厂的公开形状：选项与结果（含来源归属表）。
import type {
  ConfigPort,
  LoggerFactory,
  RuntimeConfig,
  RuntimeConfigPatch,
  WorkspaceHookBundleSnapshot,
} from "@knorvia/contracts";
import type { WorkspaceHookRuntimeRoot } from "@knorvia/shared/workspace-hook-discovery";
import type { LoadedConfig } from "./file-config.adapter.js";
import type { McpServerConfigSource, PluginConfigSources } from "./factory-sources.js";

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
