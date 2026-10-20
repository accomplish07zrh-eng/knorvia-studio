// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// bash 启动脚本的物化与前缀注入。
// 两件事：把内置搜索前置段落成文件（内容寻址，避免重复写），再把它与调用方给的
// 前置脚本一起转成 `. <path>` 前缀行，接在用户命令前面。
// 只有 posix / git-bash 方言且命令声明了 posix-bash profile 才做这件事；其余原样返回。

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { windowsPathToGitBashPath } from "@knorvia/contracts";
import { buildEmbeddedSearchPreludeContent } from "./embedded-search-prelude.js";
import { sanitizePathSegment } from "./execution-utils.js";

export type StartupShellDialect = ExecutionShellDialect | "legacy-shell";

/** 前置脚本落点：输出根目录下按会话分栏。 */
type Landing = { rootDir: string; sessionId: string };

/** 注入所需的上下文：目标方言、落点与调用方给的前置脚本。 */
type SourceAsk = {
  leadingSources?: SourceEntry[];
  shellDialect: StartupShellDialect;
  landing: Landing;
};

/** 需要 source 的脚本；shellPath 是给 shell 看的写法，path 是宿主落点。 */
type SourceEntry = {
  shellPath: string;
  path: string;
  optional?: boolean;
};

/** 只有这两种方言认 `. <file>` 语法。 */
function sourcesSupported(dialect: StartupShellDialect): boolean {
  return dialect === "posix" || dialect === "git-bash";
}

/** 内容摘要取前 16 位，足够在单个会话目录里区分不同版本的前置段。 */
function contentTag(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** POSIX 单引号字面量。 */
function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * 把前置段写到会话目录下，文件名带内容摘要。
 * 内容相同且已存在就不再写；权限设置失败按非 POSIX 文件系统处理。
 */
function writePreludeFile(content: string, landing: Landing): string {
  const directory = path.join(
    landing.rootDir,
    "bash-startup",
    sanitizePathSegment(landing.sessionId),
  );
  const target = path.join(directory, `${contentTag(content)}.sh`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const existing = readExisting(target);
  if (existing !== content) writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(target, 0o600);
  } catch {
    // 部分挂载与 Windows 不实现 POSIX mode。
  }
  return target;
}

/** 读既有前置段内容；读失败等同不存在，让下一步重写。 */
function readExisting(target: string): string | undefined {
  if (!existsSync(target)) return undefined;
  try {
    return readFileSync(target, "utf8");
  } catch {
    return undefined;
  }
}

/** 把一条 source 指令渲染成前缀行；optional 的失败不影响后续命令。 */
function renderSourceLine(entry: SourceEntry, dialect: StartupShellDialect): string {
  const chosen = dialect === "git-bash" ? windowsPathToGitBashPath(entry.path) : entry.shellPath;
  const load = `. ${singleQuote(chosen)}`;
  return entry.optional ? `[ ! -r ${singleQuote(chosen)} ] || ${load}` : load;
}

/**
 * 入口：把前置段与前脚本注入请求的命令。
 * 没有可注入内容、或方言不支持时原样返回同一个请求对象。
 */
export function applyBashSourcesToExecutionRequest(
  request: ExecutionRequest,
  ask: SourceAsk,
): ExecutionRequest {
  const command = request.command;
  const eligible = command.mode === "shell" && command.shellProfile === "posix-bash";
  if (!eligible || !sourcesSupported(ask.shellDialect)) return request;
  const entries = [...(ask.leadingSources ?? [])];
  const prelude = buildEmbeddedSearchPreludeContent(request.bashPrelude, {
    shellDialect: ask.shellDialect,
  });
  if (prelude) {
    const target = writePreludeFile(prelude, ask.landing);
    entries.push({ path: target, shellPath: target });
  }
  if (entries.length === 0) return request;
  const lines: string[] = [];
  for (const entry of entries) lines.push(renderSourceLine(entry, ask.shellDialect));
  lines.push(command.command);
  return { ...request, command: { ...command, command: lines.join("\n") } };
}
