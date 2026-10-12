# apps-cli-packages-01 补充形状名单

用途：`specs/contracts/apps-cli-packages-01/interface.md` 未收录下列文件的形状声明，导致
`similarity.mjs --declaration` 无法剥离其声明块。本文件为该文件提供**补充计分输入**：
声明块被剥离后，残留只应是 import 与注释，用于判断「被继承文件 + 契约形状」是否达标。

用法：

```
node <tool>/scripts/provenance/similarity.mjs --repo <worktree> \
  --candidate apps/cli/packages/adapters/src/storage/workspace-hook-trust-types.ts \
  --upstream-dir <upstream> \
  --interface specs/contracts/apps-cli-packages-01/interface-supplement.md \
  --declaration
```

## `apps/cli/packages/adapters/src/storage/workspace-hook-trust-types.ts`

```ts
export type WorkspaceHookTrustStoreLoadResult =
  | { status: "missing"; records: [] }
  | { status: "ok"; records: WorkspaceHookTrustRecord[] }
  | { status: "corrupt"; records: []; recoveredCorruptPath: string };

export interface FileWorkspaceHookTrustStoreOptions {
  filePath: string;
  now?: () => number;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  beforeRename?: () => void | Promise<void>;
  renameFile?: typeof rename;
  renameRetryDelaysMs?: readonly number[];
  probeProcessStartTime?: (pid: number) => Promise<number | null>;
  writeLockOwnerMetadata?: (handle: FileHandle, content: string) => Promise<void>;
}

export interface WorkspaceHookTrustStoreCompactOptions {
  current: Array<{ workspaceIdentity: string; hookDeclarationDigest: string }>;
  maxAgeMs: number;
  maxRecords: number;
  now?: number;
}

export interface WorkspaceHookTrustStoreRevokeOptions {
  workspaceIdentity: string;
  hookDeclarationDigests?: readonly string[];
}

export interface WorkspaceHookTrustStorePathOptions {
  homeDir?: string;
  userConfigPath?: string;
}
```

约束：字段名与类型属于契约，不得为降低相似度而改名；本名单与源码形状必须保持逐字一致。
