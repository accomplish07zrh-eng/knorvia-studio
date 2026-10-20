// SPDX-License-Identifier: Apache-2.0
// AppSettings 校验 schema 与旧写输入规范化（B45）。金样往返（旧写→新读→新写→旧读）逐字节保持。
/* oxlint-disable eslint(max-lines) -- 设置迁移、默认值与补充校验共用同一入口，拆分会打散字段顺序。 */
import { z } from "zod";

import { REMOTE_ASSET_INSTALL_MODES } from "./remoteAssetInstallMode.js";

import { isKnownRemoteResourcePackageId } from "./remoteResourcePackages.js";

import { wslUserSchema } from "./wslUserValidation.js";

import { normalizeKnorviaEndpointOrigin } from "./endpoint.js";

import { validReleaseInfoUrl as isReleaseUrlAllowed } from "./releaseUpdate.js";

import {
  DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE,
  embeddedBrowserViewportPreferenceSchema, // 判别联合成员
} from "./browser-use/command-metadata.js";

import { providerFamilyConnectionSelectionSettingsSchema } from "./provider-family-connection-selection.js";

import {
  CONNECTION_STATUS_VALUES,
  INTERACTION_BEHAVIOR_CHOICE_VALUES,
  LOCALE_CHOICE_VALUES,
  LOCALE_PREFERENCE_CHOICE_VALUES,
  MIGRATION_MARKER_FIELDS,
  OCCUPATION_CHOICE_VALUES,
  PROVIDER_FAMILY_DOMAIN_CHOICE_VALUES,
  RELEASE_CHANNEL_CHOICE_VALUES,
  SANITIZED_FIELD_NAMES,
  SETTINGS_NUMERIC_BOUNDS,
  STUDIO_FIRST_RUN_GUIDE_STATUS_VALUES,
  WORKSPACE_PURPOSE_VALUES,
} from "./validationAppSettings-data.js";

const nonBlankText = z.string().trim().min(1);
const optionalNonBlankText = nonBlankText.optional();
const optionalText = z.string().optional();
const optionalTextList = z.array(z.string()).optional();
const optionalTextRecord = z.record(z.string(), z.string()).optional();
const shortcutBindingsSchema = z.record(z.string(), z.array(z.string())).optional();
const integer = z.number().int();
const nonNegativeInteger = integer.nonnegative();
const flagWithDefault = (fallback: boolean) => z.boolean().default(fallback);

const archiveWindowSchema = integer.positive().max(SETTINGS_NUMERIC_BOUNDS.taskArchiveMaxDays);
const remotePortSchema = integer.positive().max(SETTINGS_NUMERIC_BOUNDS.sshPortMax).optional();
const zoomSchema = integer
  .min(SETTINGS_NUMERIC_BOUNDS.zoomMin)
  .max(SETTINGS_NUMERIC_BOUNDS.zoomMax);

const updateSourceBaseSchema = z.string().trim().max(2048);
const updateSourceSchema = updateSourceBaseSchema.refine(
  (candidate) => candidate === "" || isReleaseUrlAllowed(candidate),
  "更新源须为 HTTPS 地址（本机测试可用 loopback HTTP），且不能包含账号、密码或密钥参数",
);

export const localeSchema = z.enum(LOCALE_CHOICE_VALUES);
const localePreferenceSchema = z.enum(LOCALE_PREFERENCE_CHOICE_VALUES);
const interactionModeSchema = z.enum(INTERACTION_BEHAVIOR_CHOICE_VALUES);
const updateChannelSchema = z.enum(RELEASE_CHANNEL_CHOICE_VALUES);
const providerDomainSchema = z.enum(PROVIDER_FAMILY_DOMAIN_CHOICE_VALUES);
const occupationSchema = z.enum(OCCUPATION_CHOICE_VALUES);
const firstRunGuideStatusSchema = z.enum(STUDIO_FIRST_RUN_GUIDE_STATUS_VALUES);
const workspacePurposeSchema = z.enum(WORKSPACE_PURPOSE_VALUES);
const connectionStatusSchema = z.enum(CONNECTION_STATUS_VALUES);

export const appSettingsOccupationEnum = occupationSchema;

const desktopWindowSchema = z.object({
  width: integer.min(SETTINGS_NUMERIC_BOUNDS.windowMinWidth),
  height: integer.min(SETTINGS_NUMERIC_BOUNDS.windowMinHeight),
  maximized: z.boolean(),
});

const shellDialectSchema = z.enum(["cmd", "git-bash"]);
const shellSelectionVariants = [
  z.object({
    mode: z.literal("auto"),
  }),
  z.object({
    mode: z.literal("shell"),
    dialect: shellDialectSchema,
    id: nonBlankText,
    label: nonBlankText,
    path: nonBlankText,
  }),
] as const;
export const integratedTerminalShellSelectionSchema = z.discriminatedUnion(
  "mode",
  shellSelectionVariants,
);
const optionalIntegratedShellSchema = integratedTerminalShellSelectionSchema.optional();

const releaseNotesByLocaleSchema = z.partialRecord(
  localeSchema,
  z.object({ title: nonBlankText, markdown: nonBlankText }),
);
export const postUpdateReleaseNotesPayloadSchema = z.object({
  version: nonBlankText,
  title: nonBlankText,
  markdown: nonBlankText,
  releaseDate: nonBlankText.optional(),
  releaseNotesByLocale: releaseNotesByLocaleSchema.optional(),
});
const optionalReleaseNotesSchema = postUpdateReleaseNotesPayloadSchema.optional();

const skippedUpdateVersionsSchema = z.partialRecord(updateChannelSchema, nonBlankText).default({});

const remoteAssetInstallModeSchema = z.enum(REMOTE_ASSET_INSTALL_MODES).optional();
const remoteResourcePackagesSchema = z
  .object({
    selectedPackageIds: z.array(z.string().refine(isKnownRemoteResourcePackageId)).optional(),
  })
  .optional();

const remoteConnectionTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ssh"),
    host: nonBlankText,
    port: remotePortSchema,
    username: nonBlankText,
    sshConfigAlias: nonBlankText.optional(),
    privateKeyPath: optionalText,
    assetInstallMode: remoteAssetInstallModeSchema,
    resourcePackages: remoteResourcePackagesSchema,
    passwordCredentialKey: nonBlankText.optional(),
    privateKeyPassphraseCredentialKey: nonBlankText.optional(),
  }),
  z.object({
    kind: z.literal("wsl"),
    distro: optionalText,
    user: wslUserSchema.optional(),
  }),
  z.object({ kind: z.literal("docker"), container: nonBlankText }),
]);

const workspaceSessionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    workspacePath: nonBlankText,
    workspacePurpose: workspacePurposeSchema.default("project"),
  }),
  z.object({
    kind: z.literal("remote"),
    workspacePath: nonBlankText,
    localWorkspacePath: nonBlankText.optional(),
    workspaceIdentity: nonBlankText.optional(),
    target: remoteConnectionTargetSchema,
    lastOpenedAt: nonNegativeInteger,
    lastConnectionStatus: connectionStatusSchema,
    lastConnectionError: optionalText,
  }),
]);
const workspaceSessionListSchema = z.array(workspaceSessionSchema);
const workspaceSessionListDefault = workspaceSessionListSchema.default([]);

const optionalLocaleSchema = localeSchema.optional();
const defaultEmbeddedBrowserViewportSchema = embeddedBrowserViewportPreferenceSchema.default(
  DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE,
);
const optionalEmbeddedBrowserViewportSchema = embeddedBrowserViewportPreferenceSchema.optional();
const connectionSelectionsDefault = providerFamilyConnectionSelectionSettingsSchema.default({});
const connectionSelectionsOptional = providerFamilyConnectionSelectionSettingsSchema.optional();

function parseEndpointCandidate(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  if (trimmed === "") return undefined;
  return normalizeEndpointUrl(trimmed);
}

function normalizeEndpointUrl(value: string): string | undefined {
  try {
    return normalizeKnorviaEndpointOrigin(value);
  } catch {
    return undefined;
  }
}

const endpointUrlSchema = z.preprocess(parseEndpointCandidate, z.string().optional());

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function withoutField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const { [field]: _removed, ...rest } = record;
  return rest;
}

function dropInvalidField(input: unknown, field: string, validator: z.ZodType): unknown {
  const record = asRecord(input);
  if (record === null || !(field in record)) return input;
  if (validator.safeParse(record[field]).success) return input;
  return withoutField(record, field);
}

function sanitizeEndpointOrigin(input: unknown): unknown {
  const record = asRecord(input);
  if (record === null) return input;
  const field = SANITIZED_FIELD_NAMES.endpointOrigin;
  if (!(field in record)) return input;
  const parsed = endpointUrlSchema.safeParse(record[field]);
  if (!parsed.success || typeof parsed.data !== "string") return withoutField(record, field);
  return { ...record, [field]: parsed.data };
}

function sanitizeDesktopWindowSize(input: unknown): unknown {
  return dropInvalidField(input, SANITIZED_FIELD_NAMES.desktopWindowSize, desktopWindowSchema);
}

function sanitizeBrowserViewportPreference(input: unknown): unknown {
  return dropInvalidField(
    input,
    SANITIZED_FIELD_NAMES.embeddedBrowserViewportPreference,
    embeddedBrowserViewportPreferenceSchema,
  );
}

function applyInitialBooleanDefault(
  input: unknown,
  targetField: string,
  markerField: string,
): unknown {
  const record = asRecord(input);
  if (record === null || record[markerField] === true) return input;
  return { ...record, [targetField]: true, [markerField]: true };
}

function migrateCloseToTrayDefault(input: unknown): unknown {
  return applyInitialBooleanDefault(
    input,
    "closeToTrayOnWindows",
    MIGRATION_MARKER_FIELDS.closeToTrayOnWindows,
  );
}

function migrateShowReasoningDefault(input: unknown): unknown {
  return applyInitialBooleanDefault(
    input,
    "messageStreamShowReasoning",
    MIGRATION_MARKER_FIELDS.messageStreamShowReasoning,
  );
}

function migrateLocalePreference(input: unknown): unknown {
  const record = asRecord(input);
  if (record === null || "localePreference" in record || !("locale" in record)) return input;
  const outcome = localeSchema.safeParse(record.locale);
  if (!outcome.success) return input;
  return { ...record, localePreference: outcome.data };
}

const legacyRemoteHistorySchema = z.object({
  id: nonBlankText,
  workspacePath: nonBlankText,
  localWorkspacePath: nonBlankText.optional(),
  workspaceIdentity: nonBlankText.optional(),
  target: remoteConnectionTargetSchema,
  lastOpenedAt: nonNegativeInteger,
  lastConnectionStatus: connectionStatusSchema,
  lastConnectionError: optionalText,
});

type LegacyRemoteHistoryEntry = z.infer<typeof legacyRemoteHistorySchema>;

function stripLegacyResourcePackages(candidate: unknown): unknown {
  const entry = asRecord(candidate);
  if (entry === null || entry.kind !== "ssh" || !("resourcePackages" in entry)) {
    return candidate;
  }
  return withoutField(entry, "resourcePackages");
}

function buildHistoryIndex(history: readonly unknown[]): Map<string, LegacyRemoteHistoryEntry> {
  const index = new Map<string, LegacyRemoteHistoryEntry>();
  for (const rawEntry of history) {
    const entry = asRecord(rawEntry);
    if (entry === null) continue;
    const parsed = legacyRemoteHistorySchema.safeParse({
      ...entry,
      target: stripLegacyResourcePackages(entry.target),
    });
    if (parsed.success) index.set(parsed.data.id, parsed.data);
  }
  return index;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

type LocalSessionEntry = {
  kind: "local";
  workspacePath: string;
  workspacePurpose: string;
};

function localSessionEntry(workspacePath: string, workspacePurpose: unknown): LocalSessionEntry {
  return {
    kind: "local",
    workspacePath,
    workspacePurpose: workspacePurpose === "conversation" ? "conversation" : "project",
  };
}

function migrateSessionEntry(
  rawEntry: unknown,
  historyById: Map<string, LegacyRemoteHistoryEntry>,
): Record<string, unknown>[] {
  const entry = asRecord(rawEntry);
  if (entry === null) return [];
  const workspacePath = entry.workspacePath;
  if (entry.kind === "local" && typeof workspacePath === "string") {
    return [localSessionEntry(workspacePath, entry.workspacePurpose)];
  }
  if (entry.kind !== "remote") return [];
  if (typeof workspacePath === "string" && entry.target) {
    return [{ ...entry, target: stripLegacyResourcePackages(entry.target) }];
  }
  if (typeof entry.historyId !== "string") return [];
  const known = historyById.get(entry.historyId);
  if (known === undefined) return [];

  const restored: Record<string, unknown> = {
    kind: "remote",
    workspacePath: known.workspacePath,
    target: stripLegacyResourcePackages(known.target),
    lastOpenedAt: known.lastOpenedAt,
    lastConnectionStatus: known.lastConnectionStatus,
  };
  if (known.localWorkspacePath) restored.localWorkspacePath = known.localWorkspacePath;
  if (known.workspaceIdentity) restored.workspaceIdentity = known.workspaceIdentity;
  if (known.lastConnectionError) restored.lastConnectionError = known.lastConnectionError;
  return [restored];
}

function migrateLegacyWorkspaceSession(input: unknown): unknown {
  const record = asRecord(input);
  if (record === null) return input;

  const session = arrayOrEmpty(record.lastWorkspaceSession);
  const history = arrayOrEmpty(record.remoteWorkspaceHistory);
  const historyById = buildHistoryIndex(history);
  const sessionEntries =
    session.length > 0 ? session.flatMap((entry) => migrateSessionEntry(entry, historyById)) : [];
  const hasLegacyRemoteEntries = session.some((entry) => {
    const candidate = asRecord(entry);
    return candidate !== null && "historyId" in candidate;
  });
  const legacyTabs = arrayOrEmpty(record.lastOpenTabs).flatMap((tab) =>
    typeof tab === "string" ? [localSessionEntry(tab, "project")] : [],
  );
  const knownPaths = new Set<string>();
  for (const entry of sessionEntries) {
    const knownPath = entry.workspacePath;
    if (entry.kind === "local" && typeof knownPath === "string") knownPaths.add(knownPath);
  }
  const merged = sessionEntries.concat(
    legacyTabs.filter((tab) => !knownPaths.has(tab.workspacePath)),
  );

  const {
    lastOpenTabs: _legacyTabs,
    remoteWorkspaceHistory: _legacyHistory,
    ...preserved
  } = record;
  if (merged.length > 0 || hasLegacyRemoteEntries || Array.isArray(record.lastOpenTabs)) {
    return { ...preserved, lastWorkspaceSession: merged };
  }
  return preserved;
}

const APP_SETTINGS_INPUT_STEPS: ReadonlyArray<(input: unknown) => unknown> = [
  migrateLegacyWorkspaceSession,
  sanitizeEndpointOrigin,
  migrateLocalePreference,
  migrateCloseToTrayDefault,
  migrateShowReasoningDefault,
  sanitizeDesktopWindowSize,
  sanitizeBrowserViewportPreference,
];

function normalizeAppSettingsInput(input: unknown): unknown {
  return APP_SETTINGS_INPUT_STEPS.reduce((current, step) => step(current), input);
}

const appSettingsObjectSchema = z.object({
  releaseInfoUrl: updateSourceSchema.default(""),
  releaseChecksEnabled: flagWithDefault(true),
  recentProjects: z.array(z.string()).default([]),
  locale: localeSchema.default("zh-CN"),
  shortcutBindings: shortcutBindingsSchema,
  localePreference: localePreferenceSchema.default("system"),
  terminalInheritSystemProfile: flagWithDefault(true),
  terminalFontFamily: optionalNonBlankText,
  integratedTerminalShell: optionalIntegratedShellSchema,
  httpProxy: optionalNonBlankText,
  httpProxyNoProxy: optionalNonBlankText,
  httpProxyCaCertPath: optionalNonBlankText,
  embeddedBrowserAllowInsecureCertificates: flagWithDefault(false),
  embeddedBrowserViewportPreference: defaultEmbeddedBrowserViewportSchema,
  computerUseComposerEntryHidden: flagWithDefault(true),
  taskAutoArchiveEnabled: flagWithDefault(false),
  taskAutoArchiveOlderThanDays: archiveWindowSchema.default(
    SETTINGS_NUMERIC_BOUNDS.defaultTaskArchiveDays,
  ),
  closeToTrayOnWindows: flagWithDefault(true),
  closeToTrayOnWindowsMigrationInitialized: flagWithDefault(true),
  keepAwakeWhileRunning: flagWithDefault(false),
  desktopZoomLevel: zoomSchema.optional(),
  desktopWindowSize: desktopWindowSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: flagWithDefault(true),
  messageStreamShowReasoning: flagWithDefault(true),
  messageStreamShowReasoningMigrationInitialized: flagWithDefault(true),
  messageStreamShowTodos: flagWithDefault(false),
  toolGroupingExploreEnabled: flagWithDefault(true),
  toolGroupingTerminalEnabled: flagWithDefault(true),
  toolGroupingChangesEnabled: flagWithDefault(false),
  knorviaInteractionBehavior: interactionModeSchema.default("queue"),
  askUserQuestionAutoResolutionEnabled: flagWithDefault(true),
  modelIoFullRetentionEnabled: flagWithDefault(false),
  startPlanRecommendationDismissed: flagWithDefault(false),
  providerFamilyConnectionSelections: connectionSelectionsDefault,
  providerFamilyDomain: providerDomainSchema.optional(),
  providerFamilyDomainUpdatedAt: nonNegativeInteger.optional(),
  providerFamilyDomainMigrated: flagWithDefault(false),
  nativeSearchEnhancementsEnabled: flagWithDefault(true),
  onboardingOccupation: occupationSchema.nullish(),
  studioFirstRunGuideStatus: firstRunGuideStatusSchema.default("pending"),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: flagWithDefault(false),
  lastWorkspaceSession: workspaceSessionListDefault,
  lastActiveTabIndex: nonNegativeInteger.default(0),
  lastActiveTaskByWorkspace: optionalTextRecord,
  dataBaseDir: optionalNonBlankText,
  pendingPostUpdateReleaseNotes: optionalReleaseNotesSchema,
  receivePreviewUpdates: flagWithDefault(false),
  autoDownloadAndInstallUpdates: flagWithDefault(false),
  skippedElectronUpdateVersions: skippedUpdateVersionsSchema,
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  knorviaEndpointOrigin: endpointUrlSchema.optional(),
});
export const appSettingsSchema = z.preprocess(normalizeAppSettingsInput, appSettingsObjectSchema);

export const appSettingsPatchSchema = z.object({
  releaseInfoUrl: updateSourceSchema.optional(),
  releaseChecksEnabled: z.boolean().optional(),
  recentProjects: optionalTextList,
  locale: optionalLocaleSchema,
  shortcutBindings: shortcutBindingsSchema,
  localePreference: localePreferenceSchema.optional(),
  terminalInheritSystemProfile: z.boolean().optional(),
  terminalFontFamily: optionalNonBlankText,
  integratedTerminalShell: optionalIntegratedShellSchema,
  httpProxy: optionalNonBlankText,
  httpProxyNoProxy: optionalNonBlankText,
  httpProxyCaCertPath: optionalNonBlankText,
  embeddedBrowserAllowInsecureCertificates: z.boolean().optional(),
  embeddedBrowserViewportPreference: optionalEmbeddedBrowserViewportSchema,
  computerUseComposerEntryHidden: z.boolean().optional(),
  taskAutoArchiveEnabled: z.boolean().optional(),
  taskAutoArchiveOlderThanDays: archiveWindowSchema.optional(),
  closeToTrayOnWindows: z.boolean().optional(),
  keepAwakeWhileRunning: z.boolean().optional(),
  closeToTrayOnWindowsMigrationInitialized: z.boolean().optional(),
  desktopZoomLevel: zoomSchema.optional(),
  desktopWindowSize: desktopWindowSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: z.boolean().optional(),
  messageStreamShowReasoning: z.boolean().optional(),
  messageStreamShowReasoningMigrationInitialized: z.boolean().optional(),
  messageStreamShowTodos: z.boolean().optional(),
  toolGroupingExploreEnabled: z.boolean().optional(),
  toolGroupingTerminalEnabled: z.boolean().optional(),
  toolGroupingChangesEnabled: z.boolean().optional(),
  knorviaInteractionBehavior: interactionModeSchema.optional(),
  askUserQuestionAutoResolutionEnabled: z.boolean().optional(),
  modelIoFullRetentionEnabled: z.boolean().optional(),
  startPlanRecommendationDismissed: z.boolean().optional(),
  providerFamilyConnectionSelections: connectionSelectionsOptional,
  providerFamilyDomain: z.union([providerDomainSchema, z.literal("")]).optional(),
  providerFamilyDomainUpdatedAt: nonNegativeInteger.optional(),
  providerFamilyDomainMigrated: z.boolean().optional(),
  nativeSearchEnhancementsEnabled: z.boolean().optional(),
  onboardingOccupation: occupationSchema.nullish(),
  studioFirstRunGuideStatus: firstRunGuideStatusSchema.optional(),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  lastWorkspaceSession: workspaceSessionListSchema.optional(),
  lastActiveTabIndex: nonNegativeInteger.optional(),
  lastActiveTaskByWorkspace: optionalTextRecord,
  dataBaseDir: optionalNonBlankText,
  pendingPostUpdateReleaseNotes: optionalReleaseNotesSchema,
  receivePreviewUpdates: z.boolean().optional(),
  autoDownloadAndInstallUpdates: z.boolean().optional(),
  skippedElectronUpdateVersions: z.partialRecord(updateChannelSchema, nonBlankText).optional(),
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  knorviaEndpointOrigin: endpointUrlSchema.optional(),
});
