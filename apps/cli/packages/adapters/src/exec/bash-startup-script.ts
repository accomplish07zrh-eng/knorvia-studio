// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { windowsPathToGitBashPath } from "@knorvia/contracts";
import { buildEmbeddedSearchPreludeContent } from "./embedded-search-prelude.js";
import { sanitizePathSegment } from "./execution-utils.js";

export type /* 启动方言：执行方言 + 遗留 shell */ StartupShellDialect =
  | ExecutionShellDialect
  | "legacy-shell";
interface /* 需 source 的脚本：路径与 shell 路径 */ BashSourceScript {
  path: string;
  shellPath: /* git-bash 下用于改写路径 */ string;
  optional?: boolean;
}
interface /* 应用 source 的选项 */ ApplyBashSourcesOptions {
  leadingSources?: /* 前置脚本（可缺省） */ BashSourceScript[];
  rootDir: string;
  sessionId: string;
  shellDialect: /* 目标方言：决定路径改写方式 */ StartupShellDialect;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function materializePrelude(content: string, rootDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(content).digest("hex");
  const directory = path.join(rootDir, "bash-startup", sanitizePathSegment(sessionId));
  const target = path.join(directory, `${digest}.sh`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let current: string | undefined;
  if (existsSync(target)) {
    try /* 读取既有文件可能失败：视为未命中缓存 */ {
      current = readFileSync(target, "utf8");
    } catch /* 读失败：按未命中处理 */ {
      current = undefined;
    }
  }
  if (current !== content) writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
  try /* 设置权限可能失败：非 POSIX 文件系统忽略 */ {
    chmodSync(target, 0o600);
  } catch /* 非 POSIX 文件系统：忽略权限设置 */ {
    // Windows and some mounted filesystems do not implement POSIX modes.
  }
  return target;
}

export function /* 入口：把 source 指令前置到命令 */ applyBashSourcesToExecutionRequest(
  request: ExecutionRequest,
  options: ApplyBashSourcesOptions,
): /* 改写后的执行请求 */ ExecutionRequest {
  if (request.command.mode !== "shell" || request.command.shellProfile !== "posix-bash")
    return request;
  if (options.shellDialect !== "posix" && options.shellDialect !== "git-bash") return request;
  const sources = [...(options.leadingSources ?? [])];
  const prelude = buildEmbeddedSearchPreludeContent(request.bashPrelude, {
    shellDialect: options.shellDialect,
  });
  if (prelude) {
    const localPath = materializePrelude(prelude, options.rootDir, options.sessionId);
    sources.push({ path: localPath, shellPath: localPath });
  }
  if (sources.length === 0) return request;
  const commands = sources.map((source) => {
    const selected =
      options.shellDialect === "git-bash"
        ? windowsPathToGitBashPath(source.path)
        : source.shellPath;
    const load = `. ${quote(selected)}`;
    return source.optional ? `[ ! -r ${quote(selected)} ] || ${load}` : load;
  });
  return /* 改写后的请求：source 前置 */ {
    ...request,
    command: {
      ...request.command,
      command: `${commands.join("\n")}\n${request.command.command}`,
    },
  };
}
