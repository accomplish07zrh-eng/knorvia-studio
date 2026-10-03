# validationAppSettings owner packet

You are a fresh complete-owner author with no inherited context. Author ONLY the named allocated shared source file. Use GPT-6.1 Sol/high as selected. Read EXACTLY this packet plus cat /workspace/knorvia-studio/AGENTS.md and cat /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect other source/tests/dependencies/history/config/environment/network/other authors/output bodies. No runtime/format/check/repository write. Fixed declaration material below includes retained schema/static-map callbacks, not substantive owner bodies or independent credit; preserve it without cosmetic rewriting. Full substantive behavior bodies must be supplied from the contract. Preserve API/dependency identity. No policy widening. Write ONE WHOLE literal heredoc or apply_patch to the designated /tmp output (no file assembly/extraction/transform, no self-inspection). Then sha256sum that output ONLY. Report hash, exact reads/write method and any access deviations. Shared filesystem is not OS isolation; do not claim independent provenance/MIT. Stop for curator freeze/review. User overrides repo broad checks and forbids live operations; you must not run any checks except SHA metadata.

Output: /tmp/knorvia-authority-validationAppSettings-authored.ts

Behavior:
Complete in-memory legacy settings migration owner with fixed schema material supplied below. Schemas and their constrained callbacks/defaults/refinements are RETAINED declarations, including release/SSH fields, not new authorship. Never import/examine release implementation, read settings, write settings, resolve actual endpoint or perform SSH. All named migration/sanitizer bodies omitted. Preserve initialized user preferences and exact existing schema pipeline; no new defaults/policy.
All named helpers first guard falsy/nonobject/array =>same value. Endpoint sanitizer if key absent via in =>same; safeParse raw endpoint with retained preprocess, success string =>spreadraw overridecanonicalendpoint; otherwise destructure/dropONLYendpoint, including validundefined. Desktop size and embedded viewport ifkey absent=>same; safeParse success=>SAME originalobject (do not replace normalizedvalue), failure =>dropONLYfield via rest. Call order fixed in appSettingsSchema initializer: legacyWorkspace,endpoint,legacyLocale,closeTray,showReasoning,window,viewport then objectparse. Keep callbacks/variables exactly as provided. One-time closeTray/reasoning only when respective MigrationInitialized!==true; spreadoriginal then set preference true and markertrue, regardless rawfalse/othermarker. legacyLocale no-op if preference in raw OR locale absent; otherwise localeSchema.safeParse, success spreads raw and adds parsedlocale aspreference, failure same.
stripHistoricalRemoteResourcePackages only recordguard, kind===ssh AND resourcePackages in raw=>restwithoutfield; allother target values same (no objectclone). This preserves metadata and clears retired IDs BEFORE legacy schema validation.
Workspace migration on record always produces shallowclone and deletes lastOpenTabs/remoteWorkspaceHistory. Read lastWorkspaceSession ifarray else[]; first .some(record&&historyId in record) (anykind) detection. Read remoteWorkspaceHistory arrayelse[]; .flatMap in nativeorder skips holes; record entry becomes spreadentry with target stripped, nonrecord stays; legacyRemoteWorkspaceHistoryEntrySchema.safeParse each; success map pairs parsed.id/data, failure omitted; native Map last duplicateID wins. Even no session needs old history validation; preserve order/no earlyreturn.
If session length>0 nativeflatMap records: local with string workspacePath =>fresh only kind/path/purpose conversation iff exactelseproject. remote with string path AND truthy target =>spreadraw entry override strippedtarget (takes priority over historyId). Otherwise remote stringhistoryId looks up Map, found=>fresh remote with path, optional truthy localWorkspacePath,optional truthyworkspaceIdentity,targetstripped, timestamp/status, optional truthylastConnectionError in that keyorder; missing=>[]. Everythingelse omitted. No dedup existing session local/remote entries. Sparse visitation native.
Legacy lastOpenTabs array nativeflatMap each string=>local path project (incl emptystrings; downstream schema mayreject), nonstrings omit. Build Set from migratedexisting LOCAL string paths only. next=session entries then legacytabs whose path NOT in existingSet; do NOT extend Set with addedlegacy entries, so repeated legacytabs remain repeated. Do not skip native array getters or reorder reads.
Assign cloned lastWorkspaceSession ONLY if next.length>0 OR hasLegacyRemoteEntries OR Array.isArray(raw.lastOpenTabs). Else preserve original lastWorkspaceSession property/value (even invalid type; schema should fail rather than silently repair). Delete twolegacyfields even no conversion. Final retained object schema removesunknown fields and validates remote entries; strictpatch has no migration. Preserve all safeparse/default behavior. Chinese rationale comments for migration/single-field tolerance may be authored from these rules. No cosmetic rewrite of schema callbacks.

Fixed declarations and body-free named signatures (declarations can be placed around implementations as needed; validation retains original max-lines waiver):
```ts
import { z } from "zod";

import { REMOTE_ASSET_INSTALL_MODES } from "./remoteAssetInstallMode.js";

import { isKnownRemoteResourcePackageId } from "./remoteResourcePackages.js";

import { wslUserSchema } from "./wslUserValidation.js";

import { normalizeKnorviaEndpointOrigin } from "./endpoint.js";

import { validReleaseInfoUrl } from "./releaseUpdate.js";

import { DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE, embeddedBrowserViewportPreferenceSchema, } from "./browser-use/command-metadata.js";

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
    .refine((value) => !value || validReleaseInfoUrl(value), "更新源须为 HTTPS 地址（本机测试可用 loopback HTTP），且不能包含账号、密码或密钥参数");

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
        .partialRecord(localeSchema, z.object({ title: nonEmptyStringSchema, markdown: nonEmptyStringSchema }))
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
    }
    catch {
        return undefined;
    }
}, z.string().optional());

function sanitizeKnorviaEndpointOrigin(value: unknown): unknown;

function sanitizeDesktopWindowSize(value: unknown): unknown;

function sanitizeEmbeddedBrowserViewportPreference(value: unknown): unknown;

function migrateCloseToTrayOnWindowsDefault(value: unknown): unknown;

function migrateMessageStreamShowReasoningDefault(value: unknown): unknown;

function migrateLegacyLocalePreference(value: unknown): unknown;

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

function stripHistoricalRemoteResourcePackages(target: unknown): unknown;

function migrateLegacyWorkspaceSession(value: unknown): unknown;

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
    embeddedBrowserViewportPreference: embeddedBrowserViewportPreferenceSchema.default(DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE),
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

export const appSettingsSchema = z.preprocess((value) => sanitizeEmbeddedBrowserViewportPreference(sanitizeDesktopWindowSize(migrateMessageStreamShowReasoningDefault(migrateCloseToTrayOnWindowsDefault(migrateLegacyLocalePreference(sanitizeKnorviaEndpointOrigin(migrateLegacyWorkspaceSession(value))))))), appSettingsObjectSchema);

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
```
