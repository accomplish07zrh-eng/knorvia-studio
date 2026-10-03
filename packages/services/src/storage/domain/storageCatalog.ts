import type { StorageCategoryId, StorageCleanability, StorageRootId } from "@knorvia/shared";

export interface StorageCatalogContext {
  rootId: StorageRootId;
  hasCustomDataBaseDir: boolean;
}

export interface StorageCleanScope {
  prefix: string;
  recursive: boolean;
}

type FileRule = {
  categoryId: StorageCategoryId;
  pattern: RegExp;
  transcriptGroup?: boolean;
};

const fileRules: readonly FileRule[] = [
  {
    categoryId: "subagentTranscripts",
    pattern: /^cli\/agents\/[^/]+\/[^/]+\/transcript\.jsonl$/,
    transcriptGroup: true,
  },
  { categoryId: "sessionStore", pattern: /^v2\/[^/]+\.sqlite(?:-wal|-shm)?$/ },
  { categoryId: "sessionStore", pattern: /^cli\/db\/db\.sqlite(?:-wal|-shm)?$/ },
  { categoryId: "toolOutputs", pattern: /^v2\/checkpoints\/(?:.+\/)?(?:pending|tmp)\// },
  { categoryId: "backups", pattern: /^cli\/db\/db\.sqlite\.[^/]+$/ },
  { categoryId: "backups", pattern: /^cli\/config\.json\.bak[^/]*$/ },
  { categoryId: "backups", pattern: /^v2\/[^/]+\.bak$/ },
  { categoryId: "backups", pattern: /^v2\/[^/]+\.backup\.json$/ },
  { categoryId: "backups", pattern: /^v2\/setting\.json\.(?:corrupt-|[^/]*backup)[^/]*$/ },
  { categoryId: "backups", pattern: /^v2\/config\.json\.pre-[^/]+$/ },
  { categoryId: "toolOutputs", pattern: /^v2\/coding-plan-cache\.json$/ },
  { categoryId: "toolOutputs", pattern: /^v2\/bots-model-cache[^/]*\.json$/ },
  { categoryId: "logs", pattern: /^computer-use\/run\/[^/]+\.log$/ },
  { categoryId: "config", pattern: /^v2\/[^/]+\.json$/ },
  { categoryId: "config", pattern: /^cli\/config\.json$/ },
  { categoryId: "config", pattern: /^agents\/[^/]+\.md$/ },
  { categoryId: "config", pattern: /^AGENTS\.md$/ },
];

const directoryPrefixes: Record<StorageCategoryId, readonly string[]> = {
  sessionStore: ["v2/sessions", "v2/session-bindings", "v2/checkpoints"],
  subagentTranscripts: [],
  toolOutputs: [
    "cli/artifacts",
    "cli/agents",
    "cli/sessions",
    "cli/exec",
    "cli/image-cache",
    "cli/pdf-cache",
    "clipboard",
    "git-checkpoint-index",
    "editor-icon",
    "tmp",
    "cache",
  ],
  modelTrajectory: ["cli/debug", "cli/rollout"],
  devTraces: ["v2/dev", "v2/acp-traffic-proxy", "v2/acp-stream-diagnostics"],
  logs: ["v2/logs", "cli/log", "logs", "v2/crash", "v2/perf", "feedback/logs"],
  backups: ["backup", "v2/backup", "v2/migrations", "cli/db/backup", "cli/db/backups"],
  exports: ["export-log", "export-log-stage", "feedback"],
  runtimes: ["agents", "bundled-agents", "lite", "computer-use", "cli/plugins"],
  config: [
    "v2/agent-config",
    "v2/bots-runtime-locks",
    "v2/bot-attachments",
    "v2/certs",
    "v2/acp-auth",
    "v2/acp-config",
    "v2/provider",
    "cli/models",
    "cli/memories",
    "cli/workflows",
    "security",
    "commands",
    "skills",
    "workflows",
    "workspace",
    "mailbox",
    "server",
    "controller",
    "launcher",
    "dev-signing",
    "cua-helper-dev-identity",
    "perf-task-manifests",
    "plugin-workspace",
    "projects",
  ],
  other: [],
};

const categoryOrder: readonly StorageCategoryId[] = [
  "sessionStore",
  "subagentTranscripts",
  "toolOutputs",
  "modelTrajectory",
  "devTraces",
  "logs",
  "backups",
  "exports",
  "runtimes",
  "config",
  "other",
];

const cleanability: Record<StorageCategoryId, StorageCleanability> = {
  sessionStore: "none",
  subagentTranscripts: "safe",
  toolOutputs: "none",
  modelTrajectory: "safe",
  devTraces: "safe",
  logs: "safe",
  backups: "confirm",
  exports: "safe",
  runtimes: "none",
  config: "none",
  other: "none",
};

const protectedNames: readonly string[] = [
  "setting.json",
  "setting.json.lock",
  "credentials.json",
  ".credentials.json",
  ".tokens",
  "stdio-tap.json",
];

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function normalizeStorageRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function classifyStoragePath(
  rawPath: string,
  context: StorageCatalogContext,
): { categoryId: StorageCategoryId; entryKey: string } {
  const path = normalizeStorageRelativePath(rawPath);
  if (context.rootId === "home" && context.hasCustomDataBaseDir && isUnder(path, "v2")) {
    return { categoryId: "other", entryKey: "v2" };
  }
  if (isUnder(path, "agent")) {
    return { categoryId: "other", entryKey: "agent" };
  }
  for (const rule of fileRules) {
    if (rule.pattern.test(path)) {
      return {
        categoryId: rule.categoryId,
        entryKey: rule.transcriptGroup ? path.split("/").slice(0, 3).join("/") : path,
      };
    }
  }
  let selectedCategory: StorageCategoryId = "other";
  let selectedPrefix: string | undefined;
  for (const categoryId of categoryOrder) {
    for (const prefix of directoryPrefixes[categoryId]) {
      if (
        isUnder(path, prefix) &&
        (selectedPrefix === undefined || prefix.length > selectedPrefix.length)
      ) {
        selectedCategory = categoryId;
        selectedPrefix = prefix;
      }
    }
  }
  if (selectedPrefix !== undefined) {
    const nextSegment = path.slice(selectedPrefix.length + 1).split("/")[0];
    return {
      categoryId: selectedCategory,
      entryKey: nextSegment ? selectedPrefix + "/" + nextSegment : selectedPrefix,
    };
  }
  return { categoryId: "other", entryKey: path.split("/")[0]! };
}

export function getStorageCategoryCleanability(categoryId: StorageCategoryId): StorageCleanability {
  return cleanability[categoryId];
}

export function isProtectedStoragePath(rawPath: string): boolean {
  const path = normalizeStorageRelativePath(rawPath);
  const basename = path.split("/").pop()!;
  return protectedNames.includes(basename) || isUnder(path, "v2/crash/live");
}

export function getStorageCleanScopes(categoryId: StorageCategoryId): StorageCleanScope[] {
  if (categoryId === "other" || getStorageCategoryCleanability(categoryId) === "none") {
    return [];
  }
  const scopes: StorageCleanScope[] = [];
  for (const prefix of directoryPrefixes[categoryId]) {
    scopes.push({ prefix, recursive: true });
  }
  if (categoryId === "subagentTranscripts") {
    scopes.push({ prefix: "cli/agents", recursive: true });
  }
  if (categoryId === "backups") {
    for (const prefix of ["cli/db", "cli", "v2"]) {
      scopes.push({ prefix, recursive: false });
    }
  }
  if (categoryId === "logs") {
    scopes.push({ prefix: "computer-use/run", recursive: false });
  }
  return scopes;
}
