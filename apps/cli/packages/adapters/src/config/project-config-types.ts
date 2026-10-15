// SPDX-License-Identifier: Apache-2.0
// 项目配置的形状：单文件结果与一次发现汇总。
import type { RuntimeConfigPatch } from "@knorvia/contracts";
import type { WorkspaceHookSourceInput } from "@knorvia/shared/workspace-hook-discovery";
import type { LoadedConfig } from "./file-config.adapter.js";

export interface ProjectConfigFile {
  baseDir: string;
  config: RuntimeConfigPatch;
  diagnostics: LoadedConfig["diagnostics"];
  hookCandidate?: WorkspaceHookSourceInput;
  loaded: boolean;
  path: string;
}

export interface ProjectConfigDiscovery {
  files: ProjectConfigFile[];
  diagnostics: LoadedConfig["diagnostics"];
  hookCandidates: WorkspaceHookSourceInput[];
  loaded: boolean;
  paths: string[];
  mcpServerNames: string[];
}

/** 单文件加载选项：只在包内使用，调用方通过位置参数传入。 */
export interface FileLoadOptions {
  discoveryOrder?: number;
  explicitProjectConfig?: boolean;
  workingDirectory?: string;
}
