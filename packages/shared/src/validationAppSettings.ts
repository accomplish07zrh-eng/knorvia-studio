/* oxlint-disable eslint(max-lines) -- AppSettings schema 聚合历史迁移、默认值和 patch 校验，拆分会削弱设置迁移的单一入口。 */
import { z } from "zod";

import { REMOTE_ASSET_INSTALL_MODES } from "./remoteAssetInstallMode.js";

import { isKnownRemoteResourcePackageId } from "./remoteResourcePackages.js";

import { wslUserSchema } from "./wslUserValidation.js";

import { normalizeKnorviaEndpointOrigin } from "./endpoint.js";

import { validReleaseInfoUrl } from "./releaseUpdate.js";

import {
  DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE,
  embeddedBrowserViewportPreferenceSchema,
} from "./browser-use/command-metadata.js";

import { providerFamilyConnectionSelectionSettingsSchema } from "./provider-family-connection-selection.js";

const appSettingsOccupationSchema = z.enum([
  "office",
  "developer",
  "independent",
  "infrastructure",
  "product",
  "design",
  "student",
  "creator",
  "operations",
  "marketing",
  "finance",
  "accounting",
  "legal",
  "other",
]);

export const appSettingsOccupationEnum = appSettingsOccupationSchema;

const nonEmptyStringSchema = z.string().trim().min(1);

const releaseInfoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => !value || validReleaseInfoUrl(value),
    "更新源须为 HTTPS 地址（本机测试可用 loopback HTTP），且不能包含账号、密码或密钥参数",
  );

export const localeSchema = z.enum(["zh-CN", "en-US"]);

const localePreferenceSchema = z.enum(["system", "zh-CN", "en-US"]);

const knorviaInteractionBehaviorSchema = z.enum(["queue", "guide"]);

const electronReleaseChannelSchema = z.enum(["stable", "preview"]);

const desktopZoomLevelSchema = z.number().int().min(-3).max(5);

const desktopWindowSizeSchema = z.object({
  width: z.number().int().min(480),
  height: z.number().int().min(640),
  maximized: z.boolean(),
});

export const integratedTerminalShellSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("auto"),
  }),
  z.object({
    mode: z.literal("shell"),
    dialect: z.enum(["cmd", "git-bash"]),
    id: nonEmptyStringSchema,
    label: nonEmptyStringSchema,
    path: nonEmptyStringSchema,
  }),
]);

const providerFamilyDomainSchema = z.enum(["zai", "bigmodel"]);

export const postUpdateReleaseNotesPayloadSchema = z.object({
  version: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  markdown: nonEmptyStringSchema,
  releaseDate: nonEmptyStringSchema.optional(),
  releaseNotesByLocale: z
    .partialRecord(
      localeSchema,
      z.object({ title: nonEmptyStringSchema, markdown: nonEmptyStringSchema }),
    )
    .optional(),
});

const skippedElectronUpdateVersionsSchema = z
  .partialRecord(electronReleaseChannelSchema, nonEmptyStringSchema)
  .default({});

const remoteWorkspaceTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ssh"),
    host: nonEmptyStringSchema,
    port: z.number().int().positive().max(65535).optional(),
    username: nonEmptyStringSchema,
    sshConfigAlias: nonEmptyStringSchema.optional(),
    privateKeyPath: z.string().optional(),
    assetInstallMode: z.enum(REMOTE_ASSET_INSTALL_MODES).optional(),
    resourcePackages: z
      .object({
        selectedPackageIds: z.array(z.string().refine(isKnownRemoteResourcePackageId)).optional(),
      })
      .optional(),
    passwordCredentialKey: nonEmptyStringSchema.optional(),
    privateKeyPassphraseCredentialKey: nonEmptyStringSchema.optional(),
  }),
  z.object({
    kind: z.literal("wsl"),
    distro: z.string().optional(),
    user: wslUserSchema.optional(),
  }),
  z.object({
    kind: z.literal("docker"),
    container: nonEmptyStringSchema,
  }),
]);

const appWorkspaceSessionEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    workspacePath: nonEmptyStringSchema,
    workspacePurpose: z.enum(["project", "conversation"]).default("project"),
  }),
  z.object({
    kind: z.literal("remote"),
    workspacePath: nonEmptyStringSchema,
    localWorkspacePath: nonEmptyStringSchema.optional(),
    workspaceIdentity: nonEmptyStringSchema.optional(),
    target: remoteWorkspaceTargetSchema,
    lastOpenedAt: z.number().int().nonnegative(),
    lastConnectionStatus: z.enum(["connected", "failed"]),
    lastConnectionError: z.string().optional(),
  }),
]);

const knorviaEndpointOriginSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return normalizeKnorviaEndpointOrigin(trimmed);
  } catch {
    return undefined;
  }
}, z.string().optional());

function sanitizeKnorviaEndpointOrigin(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("knorviaEndpointOrigin" in raw)) {
    return value;
  }
  const parsed = knorviaEndpointOriginSchema.safeParse(raw.knorviaEndpointOrigin);
  if (parsed.success && typeof parsed.data === "string") {
    return { ...raw, knorviaEndpointOrigin: parsed.data };
  }
  // 单字段无效时仅移除该字段，交由原有 schema 处理其余设置。
  const { knorviaEndpointOrigin: discarded, ...remaining } = raw;
  void discarded;
  return remaining;
}

function sanitizeDesktopWindowSize(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("desktopWindowSize" in raw)) {
    return value;
  }
  if (desktopWindowSizeSchema.safeParse(raw.desktopWindowSize).success) {
    return value;
  }
  const { desktopWindowSize: discarded, ...remaining } = raw;
  void discarded;
  return remaining;
}

function sanitizeEmbeddedBrowserViewportPreference(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("embeddedBrowserViewportPreference" in raw)) {
    return value;
  }
  if (
    embeddedBrowserViewportPreferenceSchema.safeParse(raw.embeddedBrowserViewportPreference).success
  ) {
    return value;
  }
  const { embeddedBrowserViewportPreference: discarded, ...remaining } = raw;
  void discarded;
  return remaining;
}

function migrateCloseToTrayOnWindowsDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (raw.closeToTrayOnWindowsMigrationInitialized === true) {
    return value;
  }
  // 初始化标记为 true 后，用户选择继续由原始设置保留。
  return { ...raw, closeToTrayOnWindows: true, closeToTrayOnWindowsMigrationInitialized: true };
}

function migrateMessageStreamShowReasoningDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (raw.messageStreamShowReasoningMigrationInitialized === true) {
    return value;
  }
  return {
    ...raw,
    messageStreamShowReasoning: true,
    messageStreamShowReasoningMigrationInitialized: true,
  };
}

function migrateLegacyLocalePreference(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if ("localePreference" in raw || !("locale" in raw)) {
    return value;
  }
  const parsed = localeSchema.safeParse(raw.locale);
  return parsed.success ? { ...raw, localePreference: parsed.data } : value;
}

const legacyRemoteWorkspaceHistoryEntrySchema = z.object({
  id: nonEmptyStringSchema,
  workspacePath: nonEmptyStringSchema,
  localWorkspacePath: nonEmptyStringSchema.optional(),
  workspaceIdentity: nonEmptyStringSchema.optional(),
  target: remoteWorkspaceTargetSchema,
  lastOpenedAt: z.number().int().nonnegative(),
  lastConnectionStatus: z.enum(["connected", "failed"]),
  lastConnectionError: z.string().optional(),
});

function stripHistoricalRemoteResourcePackages(target: unknown): unknown {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return target;
  }
  const raw = target as Record<string, unknown>;
  if (raw.kind !== "ssh" || !("resourcePackages" in raw)) {
    return target;
  }
  // 旧资源包 ID 已退役，须在历史记录校验前移除，同时保留连接元数据。
  const { resourcePackages: discarded, ...remaining } = raw;
  void discarded;
  return remaining;
}

function migrateLegacyWorkspaceSession(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  const migrated = { ...raw };
  delete migrated.lastOpenTabs;
  delete migrated.remoteWorkspaceHistory;

  const session = Array.isArray(raw.lastWorkspaceSession) ? raw.lastWorkspaceSession : [];
  const hasLegacyRemoteEntries = session.some(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && "historyId" in entry,
  );
  const history = Array.isArray(raw.remoteWorkspaceHistory) ? raw.remoteWorkspaceHistory : [];
  const historyById = new Map(
    history.flatMap((entry) => {
      const candidate =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? { ...entry, target: stripHistoricalRemoteResourcePackages(entry.target) }
          : entry;
      const parsed = legacyRemoteWorkspaceHistoryEntrySchema.safeParse(candidate);
      return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
    }),
  );

  const sessionEntries: Record<string, unknown>[] =
    session.length > 0
      ? session.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          if (entry.kind === "local" && typeof entry.workspacePath === "string") {
            return [
              {
                kind: "local",
                workspacePath: entry.workspacePath,
                workspacePurpose:
                  entry.workspacePurpose === "conversation" ? "conversation" : "project",
              },
            ];
          }
          if (entry.kind !== "remote") {
            return [];
          }
          if (typeof entry.workspacePath === "string" && entry.target) {
            return [{ ...entry, target: stripHistoricalRemoteResourcePackages(entry.target) }];
          }
          if (typeof entry.historyId !== "string") {
            return [];
          }
          const historical = historyById.get(entry.historyId);
          if (!historical) {
            return [];
          }
          return [
            {
              kind: "remote",
              workspacePath: historical.workspacePath,
              ...(historical.localWorkspacePath
                ? { localWorkspacePath: historical.localWorkspacePath }
                : {}),
              ...(historical.workspaceIdentity
                ? { workspaceIdentity: historical.workspaceIdentity }
                : {}),
              target: stripHistoricalRemoteResourcePackages(historical.target),
              lastOpenedAt: historical.lastOpenedAt,
              lastConnectionStatus: historical.lastConnectionStatus,
              ...(historical.lastConnectionError
                ? { lastConnectionError: historical.lastConnectionError }
                : {}),
            },
          ];
        })
      : [];
  const legacyTabs = Array.isArray(raw.lastOpenTabs)
    ? raw.lastOpenTabs.flatMap((tab) =>
        typeof tab === "string"
          ? [{ kind: "local", workspacePath: tab, workspacePurpose: "project" }]
          : [],
      )
    : [];
  const existingPaths = new Set(
    sessionEntries.flatMap((entry) =>
      entry.kind === "local" && typeof entry.workspacePath === "string"
        ? [entry.workspacePath]
        : [],
    ),
  );
  // 去重范围仅为已有本地会话；旧标签列表内部的重复项保持原样。
  const next = [
    ...sessionEntries,
    ...legacyTabs.filter((entry) => !existingPaths.has(entry.workspacePath)),
  ];
  if (next.length > 0 || hasLegacyRemoteEntries || Array.isArray(raw.lastOpenTabs)) {
    migrated.lastWorkspaceSession = next;
  }
  return migrated;
}

const appSettingsObjectSchema = z.object({
  releaseInfoUrl: releaseInfoUrlSchema.default(""),
  releaseChecksEnabled: z.boolean().default(true),
  recentProjects: z.array(z.string()).default([]),
  locale: localeSchema.default("zh-CN"),
  shortcutBindings: z.record(z.string(), z.array(z.string())).optional(),
  localePreference: localePreferenceSchema.default("system"),
  terminalInheritSystemProfile: z.boolean().default(true),
  terminalFontFamily: nonEmptyStringSchema.optional(),
  integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
  httpProxy: nonEmptyStringSchema.optional(),
  httpProxyNoProxy: nonEmptyStringSchema.optional(),
  httpProxyCaCertPath: nonEmptyStringSchema.optional(),
  embeddedBrowserAllowInsecureCertificates: z.boolean().default(false),
  embeddedBrowserViewportPreference: embeddedBrowserViewportPreferenceSchema.default(
    DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE,
  ),
  computerUseComposerEntryHidden: z.boolean().default(true),
  taskAutoArchiveEnabled: z.boolean().default(false),
  taskAutoArchiveOlderThanDays: z.number().int().positive().max(365).default(7),
  closeToTrayOnWindows: z.boolean().default(true),
  closeToTrayOnWindowsMigrationInitialized: z.boolean().default(true),
  keepAwakeWhileRunning: z.boolean().default(false),
  desktopZoomLevel: desktopZoomLevelSchema.optional(),
  desktopWindowSize: desktopWindowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: z.boolean().default(true),
  messageStreamShowReasoning: z.boolean().default(true),
  messageStreamShowReasoningMigrationInitialized: z.boolean().default(true),
  messageStreamShowTodos: z.boolean().default(false),
  toolGroupingExploreEnabled: z.boolean().default(true),
  toolGroupingTerminalEnabled: z.boolean().default(true),
  toolGroupingChangesEnabled: z.boolean().default(false),
  knorviaInteractionBehavior: knorviaInteractionBehaviorSchema.default("queue"),
  askUserQuestionAutoResolutionEnabled: z.boolean().default(true),
  modelIoFullRetentionEnabled: z.boolean().default(false),
  startPlanRecommendationDismissed: z.boolean().default(false),
  providerFamilyConnectionSelections: providerFamilyConnectionSelectionSettingsSchema.default({}),
  providerFamilyDomain: providerFamilyDomainSchema.optional(),
  providerFamilyDomainUpdatedAt: z.number().int().nonnegative().optional(),
  providerFamilyDomainMigrated: z.boolean().default(false),
  nativeSearchEnhancementsEnabled: z.boolean().default(true),
  onboardingOccupation: appSettingsOccupationSchema.nullish(),
  studioFirstRunGuideStatus: z
    .enum(["pending", "deferred", "complete", "legacy"])
    .default("pending"),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().default(false),
  lastWorkspaceSession: z.array(appWorkspaceSessionEntrySchema).default([]),
  lastActiveTabIndex: z.number().int().nonnegative().default(0),
  lastActiveTaskByWorkspace: z.record(z.string(), z.string()).optional(),
  dataBaseDir: z.string().trim().min(1).optional(),
  pendingPostUpdateReleaseNotes: postUpdateReleaseNotesPayloadSchema.optional(),
  receivePreviewUpdates: z.boolean().default(false),
  autoDownloadAndInstallUpdates: z.boolean().default(false),
  skippedElectronUpdateVersions: skippedElectronUpdateVersionsSchema,
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  knorviaEndpointOrigin: knorviaEndpointOriginSchema.optional(),
});

export const appSettingsSchema = z.preprocess(
  (value) =>
    sanitizeEmbeddedBrowserViewportPreference(
      sanitizeDesktopWindowSize(
        migrateMessageStreamShowReasoningDefault(
          migrateCloseToTrayOnWindowsDefault(
            migrateLegacyLocalePreference(
              sanitizeKnorviaEndpointOrigin(migrateLegacyWorkspaceSession(value)),
            ),
          ),
        ),
      ),
    ),
  appSettingsObjectSchema,
);

export const appSettingsPatchSchema = z.object({
  releaseInfoUrl: releaseInfoUrlSchema.optional(),
  releaseChecksEnabled: z.boolean().optional(),
  recentProjects: z.array(z.string()).optional(),
  locale: localeSchema.optional(),
  shortcutBindings: z.record(z.string(), z.array(z.string())).optional(),
  localePreference: localePreferenceSchema.optional(),
  terminalInheritSystemProfile: z.boolean().optional(),
  terminalFontFamily: nonEmptyStringSchema.optional(),
  integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
  httpProxy: nonEmptyStringSchema.optional(),
  httpProxyNoProxy: nonEmptyStringSchema.optional(),
  httpProxyCaCertPath: nonEmptyStringSchema.optional(),
  embeddedBrowserAllowInsecureCertificates: z.boolean().optional(),
  embeddedBrowserViewportPreference: embeddedBrowserViewportPreferenceSchema.optional(),
  computerUseComposerEntryHidden: z.boolean().optional(),
  taskAutoArchiveEnabled: z.boolean().optional(),
  taskAutoArchiveOlderThanDays: z.number().int().positive().max(365).optional(),
  closeToTrayOnWindows: z.boolean().optional(),
  keepAwakeWhileRunning: z.boolean().optional(),
  closeToTrayOnWindowsMigrationInitialized: z.boolean().optional(),
  desktopZoomLevel: desktopZoomLevelSchema.optional(),
  desktopWindowSize: desktopWindowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: z.boolean().optional(),
  messageStreamShowReasoning: z.boolean().optional(),
  messageStreamShowReasoningMigrationInitialized: z.boolean().optional(),
  messageStreamShowTodos: z.boolean().optional(),
  toolGroupingExploreEnabled: z.boolean().optional(),
  toolGroupingTerminalEnabled: z.boolean().optional(),
  toolGroupingChangesEnabled: z.boolean().optional(),
  knorviaInteractionBehavior: knorviaInteractionBehaviorSchema.optional(),
  askUserQuestionAutoResolutionEnabled: z.boolean().optional(),
  modelIoFullRetentionEnabled: z.boolean().optional(),
  startPlanRecommendationDismissed: z.boolean().optional(),
  providerFamilyConnectionSelections: providerFamilyConnectionSelectionSettingsSchema.optional(),
  providerFamilyDomain: z.union([providerFamilyDomainSchema, z.literal("")]).optional(),
  providerFamilyDomainUpdatedAt: z.number().int().nonnegative().optional(),
  providerFamilyDomainMigrated: z.boolean().optional(),
  nativeSearchEnhancementsEnabled: z.boolean().optional(),
  onboardingOccupation: z
    .enum([
      "office",
      "developer",
      "independent",
      "infrastructure",
      "product",
      "design",
      "student",
      "creator",
      "operations",
      "marketing",
      "finance",
      "accounting",
      "legal",
      "other",
    ])
    .nullish(),
  studioFirstRunGuideStatus: z.enum(["pending", "deferred", "complete", "legacy"]).optional(),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  lastWorkspaceSession: z.array(appWorkspaceSessionEntrySchema).optional(),
  lastActiveTabIndex: z.number().int().nonnegative().optional(),
  lastActiveTaskByWorkspace: z.record(z.string(), z.string()).optional(),
  dataBaseDir: z.string().trim().min(1).optional(),
  pendingPostUpdateReleaseNotes: postUpdateReleaseNotesPayloadSchema.optional(),
  receivePreviewUpdates: z.boolean().optional(),
  autoDownloadAndInstallUpdates: z.boolean().optional(),
  skippedElectronUpdateVersions: z
    .partialRecord(electronReleaseChannelSchema, nonEmptyStringSchema)
    .optional(),
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  knorviaEndpointOrigin: knorviaEndpointOriginSchema.optional(),
});
