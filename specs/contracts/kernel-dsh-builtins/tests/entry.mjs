// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins 契约测试的公开入口解析。
// 只解析到公开 CLI 产物；测试通过 CLI 子进程做事，不 import 桥或 bootstrap 内部实现文件。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const cliEntry = join(repoRoot, "apps/cli/packages/cli/dist/knorvia.cjs");
export const repoRootPath = repoRoot;
