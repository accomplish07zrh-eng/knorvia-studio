// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话库的路径与目录准备：默认库位于数据根下的 cli/db/db.sqlite。
//
// 约定一：默认路径由 resolveKnorviaDataRoot 决定，不读环境变量、不猜用户主目录。
// 约定二：目录创建前先existsSync 短路，避免每次都触碰文件系统。
// 约定三：创建动作会先经过故障注入钩子（operation = "mkdir"），
//         便于端到端测试在不真的造目录的情况下验证错误分支。

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { maybeThrowStorageFsFault } from "../fs-fault-injection.js";

const CLI_DIR = "cli";
const DB_DIR = "db";
const DB_FILE = "db.sqlite";
const MKDIR_OPERATION = "mkdir";

export function getDefaultSessionDbPath(): string {
  const dataRoot = resolveKnorviaDataRoot();
  return join(dataRoot, CLI_DIR, DB_DIR, DB_FILE);
}

/** 目标文件的父目录不存在时才创建；已存在时不做任何文件系统写入。 */
export function ensureParentDir(target: string): void {
  const parent = dirname(target);
  if (existsSync(parent)) return;
  maybeThrowStorageFsFault({ operation: MKDIR_OPERATION, path: parent });
  mkdirSync(parent, { recursive: true });
}
