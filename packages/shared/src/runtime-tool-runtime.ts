// SPDX-License-Identifier: Apache-2.0
// 运行时搜索工具按目标平台取版本。Linux 是 bfs/ripgrep/ugrep，Darwin 仍只发 legacy rg。

export type RuntimeToolId = "bfs" | "ripgrep" | "ugrep";

export interface RuntimeToolRuntimeDescriptor {
  binaryEnvVar: /* 可覆盖捆绑二进制的环境变量 */ string;
  bundledResourceDir: /* 资源包目录名 */ string;
  resolveEntrySegments(platform: string): string[] /* win32 入口才带 .exe */;
}

export interface RemoteRuntimeToolDescriptor extends RuntimeToolRuntimeDescriptor {
  versions: /* 只列出有发行包的平台；ripgrep 键序是 darwin 然后 linux */ Readonly<
    Partial<Record<string, string>>
  >;
}

export interface ResolvedRemoteRuntimeTool {
  toolId: /* bfs | ripgrep | ugrep */ RuntimeToolId;
  runtime: /* 与 REMOTE 表里的描述是同一对象 */ RemoteRuntimeToolDescriptor;
  version: /* 该平台发行版本 */ string;
}

interface RuntimeToolRow {
  readonly id: RuntimeToolId;
  readonly binaryEnvVar: string;
  readonly bundledResourceDir: string;
  readonly stem: string;
  readonly versions: Readonly<Partial<Record<string, string>>>;
}

const TOOL_ROWS: readonly RuntimeToolRow[] = [
  {
    id: "bfs",
    binaryEnvVar: "KNORVIA_BFS_BINARY",
    bundledResourceDir: "bfs",
    stem: "bfs",
    versions: { linux: "v4.1.1-2" },
  },
  {
    id: "ripgrep",
    binaryEnvVar: "KNORVIA_RG_BINARY",
    bundledResourceDir: "ripgrep",
    stem: "rg",
    versions: { darwin: "v13.0.0-10", linux: "v14.1.1-1" },
  },
  {
    id: "ugrep",
    binaryEnvVar: "KNORVIA_UGREP_BINARY",
    bundledResourceDir: "ugrep",
    stem: "ugrep",
    versions: { linux: "v7.8.4-1" },
  },
];

const ROW_BY_ID = new Map<RuntimeToolId, RuntimeToolRow>(TOOL_ROWS.map((row) => [row.id, row]));

function rowById(id: RuntimeToolId): RuntimeToolRow {
  const row = ROW_BY_ID.get(id);
  if (row === undefined) throw new Error(`missing runtime tool row: ${id}`);
  return row;
}

// .exe 只属于 win32；其余平台入口名不加后缀。
function executableName(stem: string, platform: string): string {
  if (platform === "win32") return `${stem}.exe`;
  return stem;
}

function localDescriptor(id: RuntimeToolId): RuntimeToolRuntimeDescriptor {
  const row = rowById(id);
  return {
    binaryEnvVar: row.binaryEnvVar,
    bundledResourceDir: row.bundledResourceDir,
    resolveEntrySegments: (platform: string) => [executableName(row.stem, platform)],
  };
}

export const RUNTIME_TOOL_RUNTIME: Record<RuntimeToolId, RuntimeToolRuntimeDescriptor> = {
  bfs: localDescriptor("bfs"),
  ripgrep: localDescriptor("ripgrep"),
  ugrep: localDescriptor("ugrep"),
};

function remoteDescriptor(id: RuntimeToolId): RemoteRuntimeToolDescriptor {
  const local = RUNTIME_TOOL_RUNTIME[id];
  const row = rowById(id);
  return {
    binaryEnvVar: local.binaryEnvVar,
    bundledResourceDir: local.bundledResourceDir,
    resolveEntrySegments: local.resolveEntrySegments,
    versions: { ...row.versions },
  };
}

export const REMOTE_RUNTIME_TOOL_RUNTIME: Record<RuntimeToolId, RemoteRuntimeToolDescriptor> = {
  bfs: remoteDescriptor("bfs"),
  ripgrep: remoteDescriptor("ripgrep"),
  ugrep: remoteDescriptor("ugrep"),
};

export function getRemoteRuntimeToolsForPlatform(platform: string): ResolvedRemoteRuntimeTool[] {
  const resolved: ResolvedRemoteRuntimeTool[] = [];
  for (const row of TOOL_ROWS) {
    const runtime = REMOTE_RUNTIME_TOOL_RUNTIME[row.id];
    const published = runtime.versions[platform];
    if (published) resolved.push({ toolId: row.id, runtime, version: published });
  }
  return resolved;
}

export function getRuntimeToolRuntime(toolId: RuntimeToolId): RuntimeToolRuntimeDescriptor {
  const descriptor = RUNTIME_TOOL_RUNTIME[toolId];
  return descriptor;
}
