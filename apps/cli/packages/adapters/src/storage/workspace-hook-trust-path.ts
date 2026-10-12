// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import type { WorkspaceHookTrustStorePathOptions } from "./workspace-hook-trust-types.js";

const PRIVATE_DIR_NAME = ".knorvia-studio";
const PORTABLE_DIR_ENV = "KNORVIA_PORTABLE_DIR";
const CLI_DIR_NAME = "cli";
const CONFIG_FILE_NAME = "config.json";
const SECURITY_DIR_NAME = "security";
const TRUST_FILE_NAME = "workspace-hook-trust-v1.json";
const HOME_PREFIX = "~/";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  return !Array.isArray(value);
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

/** 读用户配置：文件不存在按空配置处理，其余错误补上路径后上抛。 */
async function readConfig(target: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(target, "utf8"));
    return isPlainRecord(parsed) ? parsed : {};
  } catch (cause) {
    if (isMissingFile(cause)) return {};
    const text = `Unable to read trusted user config for Workspace Hook Trust store: ${target}`;
    throw new Error(text, { cause });
  }
}

/** 私有根：给了 homeDir 就用 `<home>/.knorvia-studio`，否则用产品的数据根。 */
function privateRootFor(home: string, hasHomeOption: boolean): string {
  return hasHomeOption ? join(home, PRIVATE_DIR_NAME) : resolveKnorviaDataRoot();
}

/** 配置里的 storage.dir（trim 后）；非字符串或为空都当作「未配置」。 */
function configuredDirectory(config: Record<string, unknown>): string {
  const storage = config.storage;
  if (!isPlainRecord(storage) || typeof storage.dir !== "string") return "";
  return storage.dir.trim();
}

/**
 * 配置目录 → 实际根：
 * - `~/x` 展开到选定的 home（额外分隔符不得把路径重置为盘符根）；
 * - 绝对路径直接用，相对路径相对 home 解析；
 * - 便携模式下忽略配置（`KNORVIA_PORTABLE_DIR` 已指定数据位置）。
 */
function rootForConfigured(directory: string, home: string, portable: boolean): string {
  if (portable || directory.length === 0) return "";
  if (directory.startsWith(HOME_PREFIX)) return join(home, directory.slice(HOME_PREFIX.length));
  return isAbsolute(directory) ? resolve(directory) : resolve(home, directory);
}

export async function resolveWorkspaceHookTrustStorePath(
  options: WorkspaceHookTrustStorePathOptions = {},
): Promise<string> {
  const { homeDir, userConfigPath } = options;
  const home = resolve(homeDir ?? homedir());
  const privateRoot = privateRootFor(home, homeDir !== undefined);
  const configPath = resolve(userConfigPath ?? join(privateRoot, CLI_DIR_NAME, CONFIG_FILE_NAME));
  const config = await readConfig(configPath);
  const configured = rootForConfigured(
    configuredDirectory(config),
    home,
    Boolean(process.env[PORTABLE_DIR_ENV]),
  );
  const root = configured.length > 0 ? configured : privateRoot;
  return join(root, SECURITY_DIR_NAME, TRUST_FILE_NAME);
}
