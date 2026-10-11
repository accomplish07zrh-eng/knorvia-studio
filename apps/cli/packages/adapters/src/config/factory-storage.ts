// SPDX-License-Identifier: Apache-2.0
// 工作区存储目录解析：env 覆盖 → 最后一份写过 storage.dir 的项目文件（空串也算）→ 默认值。
import { parseEnvConfig } from "./env-config.adapter.js";
import { assembleConfig } from "./factory-assembly.js";
import { loadProjectConfigs } from "./project-config.adapter.js";

export interface StorageDirInput {
  env?: Record<string, string | undefined>;
  workingDirectory: string;
}

export function resolveWorkspaceStorageDir(input: StorageDirInput): string {
  const fallback = assembleConfig({ env: input.env }).config.storage.dir;
  const discovery = loadProjectConfigs(input.workingDirectory);

  // 项目文件按发现顺序叠加：后出现的覆盖先出现的，因此取「最后一个有值的」。
  let fromProject: string | undefined;
  for (const file of discovery.files) {
    const configured = file.config.storage?.dir;
    if (configured !== null && configured !== undefined) fromProject = configured;
  }
  const fromEnv = parseEnvConfig(input.env ?? process.env).storage?.dir;
  return fromEnv ?? fromProject ?? fallback;
}
