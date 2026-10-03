import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type {
  Hook,
  HookEvent,
  SettingsDirectoryLocation,
  SettingsDirectorySource,
} from "@knorvia/shared";
import {
  buildWorkspaceHookBundleSnapshot,
  createWorkspaceHookSourceInput,
  readWorkspaceHookProjectSources,
  resolveWorkspaceHookRuntimeRoot,
  workspaceHooksConfigSchema,
  type WorkspaceHookSourceInput,
  type WorkspaceHooksConfig,
} from "@knorvia/shared/workspace-hook-discovery";
import { parseWorkspaceHookTrustStoreContent } from "@knorvia/shared/workspace-hook-trust-store-file";

import { createServiceLogger, type ServiceLogger } from "#src/logger/serviceLogger.js";
import { getKnorviaDataRootDir } from "#src/paths.js";

import type { IHooksService } from "./hooks.js";
import { atomicWriteWorkspaceHookConfig } from "./workspaceHookConfigMutation.js";
import {
  fromLegacyHooksConfig,
  fromProjectSnapshot,
  fromUserKnorviaSource,
  resolveNextRootEnabled,
  toKnorviaHooksEvents,
  type LegacyHooksConfig,
} from "./workspaceHookSettingsModel.js";

interface KnorviaConfigFile {
  hooks?: WorkspaceHooksConfig;
  [key: string]: unknown;
}

function homeDirectory(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || homedir();
}

function sourceDirectory(source: SettingsDirectorySource, workspacePath?: string): string {
  const base = workspacePath ?? homeDirectory();
  if (source === "knorvia") {
    return workspacePath ? join(base, ".knorvia-studio") : join(getKnorviaDataRootDir(), "cli");
  }
  return join(base, source === "agents" ? ".agents" : ".claude");
}

function configPath(source: SettingsDirectorySource, workspacePath?: string): string {
  return join(
    sourceDirectory(source, workspacePath),
    source === "knorvia" ? "config.json" : "settings.json",
  );
}

function location(
  source: SettingsDirectorySource,
  workspacePath?: string,
): SettingsDirectoryLocation {
  return {
    source,
    scope: workspacePath ? "project" : "user",
    directoryPath: sourceDirectory(source, workspacePath),
    ...(workspacePath ? { projectPath: workspacePath } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    if (!existsSync(path)) return null;
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

const hookEvents: ReadonlySet<string> = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
]);

function isHookEvent(value: string): value is HookEvent {
  return hookEvents.has(value);
}

async function userSource(): Promise<WorkspaceHookSourceInput | undefined> {
  const path = configPath("knorvia");
  const config = await readJson<Record<string, unknown>>(path);
  const parsed = workspaceHooksConfigSchema.safeParse(config?.hooks);
  if (!parsed.success) return undefined;
  return {
    ...createWorkspaceHookSourceInput({
      path,
      workingDirectory: homeDirectory(),
      hooks: parsed.data,
      discoveryOrder: 0,
      explicitProjectConfig: true,
    }),
    editable: true,
  };
}

async function persistentTrust(
  workspaceIdentity: string,
  logger: ServiceLogger,
): Promise<{ digests: Set<string>; corrupt: boolean }> {
  const config = (await readJson<Record<string, unknown>>(configPath("knorvia"))) ?? {};
  const storage: Record<string, unknown> = isRecord(config.storage) ? config.storage : {};
  const configured = typeof storage.dir === "string" ? storage.dir.trim() : "";
  const home = homeDirectory();
  const storageRoot =
    configured && !process.env.KNORVIA_PORTABLE_DIR?.trim()
      ? configured.startsWith("~/")
        ? join(home, configured.slice(2))
        : isAbsolute(configured)
          ? resolve(configured)
          : resolve(home, configured)
      : getKnorviaDataRootDir();
  const path = join(storageRoot, "security", "workspace-hook-trust-v1.json");
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { digests: new Set(), corrupt: false };
    }
    logger.warn(
      undefined,
      "Workspace Hook Trust store 不可读，已 fail-closed 忽略全部持久信任记录",
      {
        path,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return { digests: new Set(), corrupt: true };
  }
  const parsed = parseWorkspaceHookTrustStoreContent(content);
  if (parsed.status === "invalid") {
    logger.warn(
      undefined,
      "Workspace Hook Trust store 结构不符合 schema，已 fail-closed 忽略全部持久信任记录",
      {
        path,
      },
    );
    return { digests: new Set(), corrupt: true };
  }
  return {
    digests: new Set(
      parsed.file.records
        .filter((record) => record.workspaceIdentity === workspaceIdentity)
        .map((record) => record.hookDeclarationDigest),
    ),
    corrupt: false,
  };
}

async function legacyHooks(source: "agents" | "claude", workspacePath?: string): Promise<Hook[]> {
  const legacyConfig = await readJson<LegacyHooksConfig>(configPath(source, workspacePath));
  return fromLegacyHooksConfig({
    legacyConfig,
    location: location(source, workspacePath),
    isHookEvent,
  });
}

async function loadHooks(
  params: Parameters<IHooksService["loadHooks"]>[0],
  logger: ServiceLogger,
): ReturnType<IHooksService["loadHooks"]> {
  const workspacePath = resolve(params.workspacePath);
  const workspaceIdentity = params.workspaceIdentity?.trim() || workspacePath;
  const [project, user] = await Promise.all([
    readWorkspaceHookProjectSources({ workingDirectory: workspacePath }),
    userSource(),
  ]);
  const sources = project.sources;
  const runtimeRoot = resolveWorkspaceHookRuntimeRoot([
    user?.hooks,
    ...sources.map((source) => source.hooks),
  ]);
  const snapshot = buildWorkspaceHookBundleSnapshot({
    workspaceIdentity,
    workspacePath,
    sources,
    runtimeRoot,
  });
  const trust = await persistentTrust(workspaceIdentity, logger);
  const hooks: Hook[] = [
    ...fromProjectSnapshot({
      sources,
      snapshot,
      workspaceIdentity,
      workspacePath,
      persistentTrustedDigests: trust.digests,
    }),
    ...(await legacyHooks("agents", workspacePath)),
    ...(await legacyHooks("claude", workspacePath)),
    ...fromUserKnorviaSource({
      source: user,
      runtimeRoot,
      workspacePath,
      location: location("knorvia"),
    }),
    ...(await legacyHooks("agents")),
    ...(await legacyHooks("claude")),
  ];
  return {
    hooks,
    hooksEnabled: hooks.some((hook) => hook.enabled),
    ...(snapshot ? { workspaceHookSnapshot: snapshot } : {}),
    ...(trust.corrupt ? { trustStoreCorrupt: true } : {}),
  };
}

async function writeConfig(workspacePath: string | undefined, hooks: Hook[]): Promise<void> {
  const path = configPath("knorvia", workspacePath);
  const config = (await readJson<KnorviaConfigFile>(path)) ?? {};
  const enabled = resolveNextRootEnabled(config.hooks?.enabled, hooks);
  await atomicWriteWorkspaceHookConfig(path, {
    ...config,
    hooks: {
      ...config.hooks,
      ...(enabled !== undefined ? { enabled } : {}),
      events: toKnorviaHooksEvents(hooks),
    },
  });
}

async function saveHooks(params: Parameters<IHooksService["saveHooks"]>[0]): Promise<void> {
  const currentProjectConfigPath = resolve(params.workspacePath, ".knorvia-studio", "config.json");
  const user = params.hooks.filter(
    (hook) =>
      hook.editable !== false &&
      (!hook.location || (hook.location.source === "knorvia" && hook.location.scope === "user")),
  );
  const project = params.hooks.filter(
    (hook) =>
      hook.editable !== false &&
      hook.location?.source === "knorvia" &&
      hook.location.scope === "project" &&
      (!hook.configuredState ||
        resolve(hook.configuredState.sourcePath) === currentProjectConfigPath),
  );
  await writeConfig(undefined, user);
  await writeConfig(params.workspacePath, project);
}

export function createHooksService(
  options: {
    logger?: ServiceLogger;
    grantWorkspaceHookTrust?: NonNullable<IHooksService["grantWorkspaceHookTrust"]>;
  } = {},
): IHooksService {
  const logger = options.logger ?? createServiceLogger("hooks-service");
  return {
    loadHooks: (params) => loadHooks(params, logger),
    saveHooks,
    ...(options.grantWorkspaceHookTrust
      ? { grantWorkspaceHookTrust: options.grantWorkspaceHookTrust }
      : {}),
  };
}
