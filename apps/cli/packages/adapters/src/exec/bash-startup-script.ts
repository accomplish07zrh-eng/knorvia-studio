// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExecutionRequest, ExecutionShellDialect } from "@knorvia/contracts";
import { windowsPathToGitBashPath } from "@knorvia/contracts";
import { buildEmbeddedSearchPreludeContent } from "./embedded-search-prelude.js";
import { sanitizePathSegment } from "./execution-utils.js";

export type StartupShellDialect = ExecutionShellDialect | "legacy-shell";
interface BashSourceScript {
  path: string;
  shellPath: string;
  optional?: boolean;
}
interface ApplyBashSourcesOptions {
  leadingSources?: BashSourceScript[];
  rootDir: string;
  sessionId: string;
  shellDialect: StartupShellDialect;
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
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = undefined;
    }
  }
  if (current !== content) writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(target, 0o600);
  } catch {
    // Windows and some mounted filesystems do not implement POSIX modes.
  }
  return target;
}

export function applyBashSourcesToExecutionRequest(
  request: ExecutionRequest,
  options: ApplyBashSourcesOptions,
): ExecutionRequest {
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
  return {
    ...request,
    command: {
      ...request.command,
      command: `${commands.join("\n")}\n${request.command.command}`,
    },
  };
}
