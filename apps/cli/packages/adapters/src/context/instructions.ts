// SPDX-License-Identifier: Apache-2.0
// 用户指令文件：探测计划（用户级 → 工作区级逐级向上）、按字节读取、按顺序合并。
import { open, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ContextSourceDiagnostic,
  ResolvedUserInstructions,
  ResolvedUserInstructionSource,
  UserInstructionsOptions,
} from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { findProjectRoot } from "./project.js";

const DEFAULT_PRIORITY_FILES = ["AGENTS.md"];
const DEFAULT_MAX_BYTES = 100 * 1024;
const USER_INSTRUCTION_READ_FAILURE = "user_instructions_read_failed";
const USER_LEVEL_FILE = "AGENTS.md";
const READ_FAILURE_FALLBACK = "Failed to read user instructions";

interface InstructionProbe {
  directory: string;
  fileName: string;
  scope: ResolvedUserInstructionSource["scope"];
}

interface CollectInput {
  diagnostics: ContextSourceDiagnostic[];
  env: NodeJS.ProcessEnv;
  options: UserInstructionsOptions;
}

interface ReadInput {
  absolutePath: string;
  diagnostics: ContextSourceDiagnostic[];
  maxBytes: number;
  probe: InstructionProbe;
}

async function isRegularFile(path: string): Promise<boolean> {
  return await stat(path).then(
    (info) => info.isFile(),
    () => false,
  );
}

/** 工作区探测计划：从工作目录逐级向上到项目根（含）或文件系统根为止，每级按优先级文件顺序。 */
function workspaceProbes(
  workingDirectory: string,
  projectRoot: string | null,
  priorityFiles: readonly string[],
): InstructionProbe[] {
  const levels: string[] = [];
  let directory = resolve(workingDirectory);
  for (;;) {
    levels.push(directory);
    if (directory === projectRoot || resolve(directory, "..") === directory) break;
    directory = resolve(directory, "..");
  }
  const probes: InstructionProbe[] = [];
  for (const level of levels) {
    for (const fileName of priorityFiles) {
      probes.push({ directory: level, fileName, scope: "workspace" });
    }
  }
  return probes;
}

function userLevelProbes(
  priorityFiles: readonly string[],
  env: NodeJS.ProcessEnv,
): InstructionProbe[] {
  if (!priorityFiles.includes(USER_LEVEL_FILE)) return [];
  return [{ directory: resolveKnorviaDataRoot(env), fileName: USER_LEVEL_FILE, scope: "user" }];
}

export async function collectUserInstructions(
  input: CollectInput,
): Promise<ResolvedUserInstructions | undefined> {
  const priorityFiles = input.options.priorityFiles ?? DEFAULT_PRIORITY_FILES;
  const maxBytes = input.options.maxBytes ?? DEFAULT_MAX_BYTES;
  const projectRoot =
    input.options.projectRoot ?? (await findProjectRoot(input.options.workingDirectory));
  const plan = [
    ...userLevelProbes(priorityFiles, input.env),
    ...workspaceProbes(input.options.workingDirectory, projectRoot, priorityFiles),
  ];

  const seen = new Set<string>();
  const collected: ResolvedUserInstructionSource[] = [];
  for (const probe of plan) {
    const absolutePath = join(probe.directory, probe.fileName);
    const dedupeKey = resolve(absolutePath);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (!(await isRegularFile(absolutePath))) continue;
    const read = await readInstructionSource({
      absolutePath,
      diagnostics: input.diagnostics,
      maxBytes,
      probe,
    });
    if (read) collected.push(read);
  }
  return collected.length === 0 ? undefined : mergeInstructionSources(collected);
}

/** 只读前 min(size, maxBytes) 字节；`bytesRead` 以解码后的 UTF-8 字节数计。 */
async function readInstructionSource(
  input: ReadInput,
): Promise<ResolvedUserInstructionSource | undefined> {
  const filePath = input.absolutePath;
  try {
    const info = await stat(filePath);
    const content = await readFilePrefix(filePath, Math.min(info.size, input.maxBytes));
    const source = { scope: input.probe.scope } as ResolvedUserInstructionSource;
    source.filePath = filePath;
    source.fileName = input.probe.fileName;
    source.content = content;
    source.bytesRead = Buffer.byteLength(content);
    source.sizeBytes = info.size;
    source.truncated = info.size > input.maxBytes;
    return source;
  } catch (error) {
    input.diagnostics.push({
      code: USER_INSTRUCTION_READ_FAILURE,
      message: error instanceof Error ? error.message : READ_FAILURE_FALLBACK,
      path: filePath,
    });
    return undefined;
  }
}

async function readFilePrefix(filePath: string, byteCount: number): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.max(0, byteCount));
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** 工作区来源优先作为主来源；没有工作区来源时取第一个用户级来源。 */
function mergeInstructionSources(
  sources: ResolvedUserInstructionSource[],
): ResolvedUserInstructions {
  const workspaceSources = sources.filter((source) => source.scope === "workspace");
  const primary = workspaceSources.length > 0 ? workspaceSources[0]! : sources[0]!;
  const merged = { sources } as ResolvedUserInstructions;
  merged.filePath = primary.filePath;
  merged.fileName = primary.fileName;
  merged.content = sources.map((source) => source.content).join("\n\n");
  merged.bytesRead = sources.reduce((total, source) => total + source.bytesRead, 0);
  merged.sizeBytes = sources.reduce((total, source) => total + source.sizeBytes, 0);
  merged.truncated = sources.some((source) => source.truncated);
  return merged;
}
