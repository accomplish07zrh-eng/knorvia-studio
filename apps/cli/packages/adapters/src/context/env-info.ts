// SPDX-License-Identifier: Apache-2.0
// 环境信息的归一化：shell 名称来源与平台/运行时字段的唯一组装点。
import { arch, release } from "node:os";
import { basename } from "node:path";
import type { EnvInfo } from "@knorvia/contracts";

/** Windows 上通常没有 SHELL，退回 ComSpec/COMSPEC；顺序即优先级。 */
const SHELL_ENV_KEYS = ["SHELL", "ComSpec", "COMSPEC"] as const;
const UNKNOWN_SHELL = "unknown";

export function resolveShellName(
  env: Readonly<Record<string, string | undefined>>,
  effectiveShellDisplayName?: string,
): string {
  if (effectiveShellDisplayName) return effectiveShellDisplayName;
  for (const key of SHELL_ENV_KEYS) {
    const configured = env[key];
    if (configured) return basename(configured);
  }
  return UNKNOWN_SHELL;
}

export function describeEnvironment(
  workingDirectory: string,
  shell: string,
  gitSnapshot: Partial<EnvInfo>,
): EnvInfo {
  const description = { ...gitSnapshot } as EnvInfo;
  description.cwd = workingDirectory;
  description.platform = process.platform;
  description.shell = shell;
  description.osVersion = `${process.platform} ${release()} ${arch()}`;
  description.nodeVersion = process.version;
  return description;
}
