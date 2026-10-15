import { join, resolve } from "node:path";

import type { FileSystemPort, Logger, TraceContext } from "@knorvia/contracts";

import { ensureMemoryDirectoryExists } from "../memory/directory.js";
import type { AgentRuntimeConfig, MemoryRuntimeConfig } from "../runtime/types.js";
import type { AgentProfile, AgentMemoryScope } from "./profile.js";
import { buildPersistentAgentMemoryPrompt } from "./persistent-memory-prompt.js";

const /* 允许写记忆的工具 */ PERSISTENT_MEMORY_TOOLS = ["Write", "Edit"] as const;

function /* 把 agent 名压成可作目录名的 key */ sanitizePersistentAgentMemoryKey(
  agentName: string,
): string {
  const key = /* 非字母数字下划线连字符一律替换 */ agentName.replace(/[^a-zA-Z0-9_-]/g, "-");
  return key === "" ? /* 空名兜底 */ "unknown" : key;
}

function resolvePersistentAgentMemoryRoot(input: {
  /* 子代理名 */ agentName: string;
  scope: AgentMemoryScope;
  /* 存储根 */ storageRoot: string;
  workspaceRoot: string;
}): /* 返回记忆目录 */ string {
  const agentKey = sanitizePersistentAgentMemoryKey(input.agentName);
  if (input.scope === "user") {
    return join(input.storageRoot, "agent-memory", agentKey);
  }
  const workspace = resolve(input.workspaceRoot);
  return input.scope === "project"
    ? join(workspace, ".knorvia-studio", "agent-memory", agentKey)
    : join(workspace, ".knorvia-studio", "agent-memory-local", agentKey);
}

function /* 是否启用持久记忆 */ isPersistentAgentMemoryEnabled(
  memory: MemoryRuntimeConfig | undefined,
): memory is MemoryRuntimeConfig & { storageRoot: string } {
  return memory?.enabled === true && memory.use !== false && Boolean(memory.storageRoot);
}

function withPersistentAgentMemoryTools(profile: AgentProfile): AgentProfile {
  if (!profile.memory || profile.tools === undefined) return profile;

  const tools = [...profile.tools];
  for (const tool of PERSISTENT_MEMORY_TOOLS) {
    if (!tools.includes(tool)) tools.push(tool);
  }
  return tools.length === profile.tools.length ? profile : { ...profile, tools };
}

export function projectPersistentAgentMemoryTools(config: AgentRuntimeConfig): AgentRuntimeConfig {
  const memory = config.memory;
  const profiles = config.subagents?.profiles;
  if (!profiles || !isPersistentAgentMemoryEnabled(memory)) return config;

  const projected = profiles.map(withPersistentAgentMemoryTools);
  if (projected.every((profile, index) => profile === profiles[index])) return config;
  return /* 构造返回值 */ {
    ...config,
    subagents: /* 子代理级记忆 */ {
      ...config.subagents,
      profiles: projected,
    },
  };
}

interface PersistentAgentMemory {
  rootDir: string;
  prompt: string;
}

export async function loadPersistentAgentMemory(input: {
  fileSystemPort: FileSystemPort | undefined;
  memory: MemoryRuntimeConfig | undefined;
  logger?: Logger;
  profile: AgentProfile;
  traceContext?: TraceContext;
  workspaceRoot: string;
}): Promise<PersistentAgentMemory | undefined> {
  if (!input.profile.memory || !input.fileSystemPort) return undefined;
  if (!isPersistentAgentMemoryEnabled(input.memory)) return undefined;

  const rootDir = resolvePersistentAgentMemoryRoot({
    agentName: input.profile.name,
    scope: input.profile.memory,
    storageRoot: input.memory.storageRoot,
    workspaceRoot: input.workspaceRoot,
  });
  await ensureMemoryDirectoryExists(
    input.fileSystemPort,
    rootDir,
    input.traceContext,
    input.logger,
  );

  let indexContent = "";
  try /* 读取失败按未启用处理 */ {
    indexContent = (await input.fileSystemPort.readTextFile({ path: join(rootDir, "MEMORY.md") }))
      .content;
  } catch /* 读取失败 */ {
    // 不存在或不可读的 MEMORY.md 都使用基线的 empty index 文案。
  }

  return /* 构造返回值 */ {
    rootDir,
    prompt: buildPersistentAgentMemoryPrompt({
      indexContent,
      rootDir,
      scope: input.profile.memory,
    }),
  };
}
