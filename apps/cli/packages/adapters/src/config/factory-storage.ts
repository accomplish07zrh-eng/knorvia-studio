// SPDX-License-Identifier: Apache-2.0
// 工作区存储目录解析：env 覆盖 → 最后一份写过 storage.dir 的项目文件（空串也算）→ 默认值。
import { parseEnvConfig } from "./env-config.adapter.js";
import { assembleConfig } from "./factory-assembly.js";
import { loadProjectConfigs } from "./project-config.adapter.js";
import type { ProjectConfigFile } from "./project-config-types.js";

export interface StorageDirInput {
  env?: Record<string, string | undefined>;
  workingDirectory: string;
}

/** 第一优先级：环境变量里的 storage.dir（含空串，空串也算显式覆盖）。 */
function fromEnvironment(env: Record<string, string | undefined> | undefined): string | undefined {
  return parseEnvConfig(env ?? process.env).storage?.dir;
}

/**
 * 第二优先级：项目文件里「最后一个」显式写过 storage.dir 的值。
 * 项目文件按发现顺序叠加，所以取列表尾部而非首个。
 */
function fromProjectFiles(files: readonly ProjectConfigFile[]): string | undefined {
  const configured = files.map((file) => file.config.storage?.dir);
  const present = configured.filter((dir): dir is string => dir !== null && dir !== undefined);
  return present.at(-1);
}

/** 兜底：完整装配一次配置后取 storage.dir（含内置默认值）。 */
function fromAssembledConfig(env: Record<string, string | undefined> | undefined): string {
  return assembleConfig({ env }).config.storage.dir;
}

export function resolveWorkspaceStorageDir(input: StorageDirInput): string {
  const discovery = loadProjectConfigs(input.workingDirectory);
  return (
    fromEnvironment(input.env) ??
    fromProjectFiles(discovery.files) ??
    fromAssembledConfig(input.env)
  );
}
