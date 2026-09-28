// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import type { WorkspaceHookTrustStorePathOptions } from "./workspace-hook-trust-types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const decoded: unknown = JSON.parse(await readFile(path, "utf8"));
    return isObject(decoded) ? decoded : {};
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new Error(`Unable to read trusted user config for Workspace Hook Trust store: ${path}`, {
      cause: error,
    });
  }
}

export async function resolveWorkspaceHookTrustStorePath(
  options: WorkspaceHookTrustStorePathOptions = {},
): Promise<string> {
  const home = resolve(options.homeDir ?? homedir());
  const privateRoot = options.homeDir ? join(home, ".knorvia-studio") : resolveKnorviaDataRoot();
  const configPath = resolve(options.userConfigPath ?? join(privateRoot, "cli", "config.json"));
  const config = await readConfig(configPath);
  const directory =
    isObject(config.storage) && typeof config.storage.dir === "string"
      ? config.storage.dir.trim()
      : "";
  let root = privateRoot;
  if (!process.env.KNORVIA_PORTABLE_DIR && directory) {
    // 展开 ~/ 后仍连接到选定的 home，额外分隔符不能重置为盘符根。
    if (directory.startsWith("~/")) root = join(home, directory.slice(2));
    else root = isAbsolute(directory) ? resolve(directory) : resolve(home, directory);
  }
  return join(root, "security", "workspace-hook-trust-v1.json");
}
