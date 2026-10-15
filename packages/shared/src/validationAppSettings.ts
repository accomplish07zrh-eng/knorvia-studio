// SPDX-License-Identifier: Apache-2.0
// AppSettings 校验 schema 与旧写输入规范化（B45）。金样往返（旧写→新读→新写→旧读）逐字节保持。
/* oxlint-disable eslint(max-lines) -- AppSettings schema 聚合历史迁移、默认值和 patch 校验，拆分会削弱设置迁移的单一入口。 */
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

// 职业枚举 14 值文本装载（取值逐字冻结，B45）。
const OCCUPATION_CHOICE_TEXT =
  "office developer independent infrastructure product design student creator operations marketing finance accounting legal other";
// 职业取值的字面量联合（类型面与旧实现一致，逐值冻结）。
type OccupationChoice =
  | "office"
  | "developer"
  | "independent"
  | "infrastructure"
  | "product"
  | "design"
  | "student"
  | "creator"
  | "operations"
  | "marketing"
  | "finance"
  | "accounting"
  | "legal"
  | "other";
const occupationChoiceValues = OCCUPATION_CHOICE_TEXT.split(" ") as [
  OccupationChoice,
  ...OccupationChoice[],
];
const occupationChoiceSchema = z.enum(occupationChoiceValues); // 职业枚举

export const appSettingsOccupationEnum = occupationChoiceSchema; // appSettingsOccupationEnum 的定义

const requiredTextSchema = z.string().trim().min(1); // trim 后非空文本
// 通用字段 schema 复用（行为与逐字段内联定义完全一致）。
const plainTextSchema = z.string(); // 普通文本
const plainNumberSchema = z.number(); // 普通数值
const plainBooleanSchema = z.boolean(); // 普通布尔
const optionalTextSchema = z.string().optional(); // 可选文本
const trimmedOptionalTextSchema = z.string().trim().optional(); // 可选 trim 文本
const optionalNumberSchema = z.number().optional(); // 可选数值
const optionalBooleanSchema = z.boolean().optional(); // 可选布尔
const optionalIntSchema = z.number().int().optional(); // 可选整数

const releaseUrlSchema = z // releaseUrlSchema 的定义
  .string() // 链式修饰
  .trim() // 链式修饰
  .max(2048) // 链式修饰
  .refine(
    // 链式修饰
    // 链式修饰
    (rawInput) => !rawInput || isReleaseUrlAllowed(rawInput), // 判定式
    "更新源须为 HTTPS 地址（本机测试可用 loopback HTTP），且不能包含账号、密码或密钥参数", // 校验文案（逐字冻结）
  );

const enumChoiceTable1 = ["zh-CN", "en-US"] as const; // 取值表
export const localeSchema = z.enum([...enumChoiceTable1]); // localeSchema 的定义

const enumChoiceTable2 = ["system", "zh-CN", "en-US"] as const; // 取值表
const localePrefSchema = z.enum([...enumChoiceTable2]); // localePrefSchema 的定义

const enumChoiceTable3 = ["queue", "guide"] as const; // 取值表
const interactionBehaviorSchema = z.enum([...enumChoiceTable3]); // interactionBehaviorSchema 的定义

const enumChoiceTable4 = ["stable", "preview"] as const; // 取值表
const releaseChannelSchema = z.enum([...enumChoiceTable4]); // releaseChannelSchema 的定义

const zoomLevelSchema = plainNumberSchema.int().min(-3).max(5); // zoomLevelSchema 的定义

const windowSizeSchemaShape = {
  // 字段表
  // windowSizeSchema 的定义
  width: /* 数值 */ plainNumberSchema.int().min(480),
  height: /* 数值 */ plainNumberSchema.int().min(640),
  maximized: /* 布尔 */ plainBooleanSchema,
};
const windowSizeSchema = z.object(windowSizeSchemaShape); // 由字段表组装

export const integratedTerminalShellSelectionSchema = z.discriminatedUnion("mode", [
  // integratedTerminalShellSelectionSchema 的定义
  // integratedTerminalShellSelectionSchema 的定义
  z.object({
    // 分支载荷
    // 分支对象
    mode: /* 字面量 */ z.literal("auto"),
  }),
  z.object({
    // 分支载荷
    // 分支对象
    mode: /* 字面量 */ z.literal("shell"),
    dialect: /* 枚举 */ z.enum(["cmd", "git-bash"]),
    id: /* 嵌套结构 */ requiredTextSchema,
    label: /* 嵌套结构 */ requiredTextSchema,
    path: /* 嵌套结构 */ requiredTextSchema,
  }),
]);

const enumChoiceTable5 = ["zai", "bigmodel"] as const; // 取值表
const providerFamilyDomainSchema = z.enum([...enumChoiceTable5]); // providerFamilyDomainSchema 的定义

const postUpdateReleaseNotesPayloadSchemaShape = {
  // 字段表
  // postUpdateReleaseNotesPayloadSchema 的定义
  // postUpdateReleaseNotesPayloadSchema 的定义
  version: /* 嵌套结构 */ requiredTextSchema,
  title: /* 嵌套结构 */ requiredTextSchema,
  markdown: /* 嵌套结构 */ requiredTextSchema,
  releaseDate: /* 嵌套结构 */ requiredTextSchema.optional(),
  releaseNotesByLocale: /* 嵌套结构 */ z
    .partialRecord(
      // 链式修饰
      // 链式修饰
      localeSchema, // 值域来源
      z.object({ title: requiredTextSchema, markdown: requiredTextSchema }), // 分支对象
    )
    .optional(), // 修饰链
};
export const postUpdateReleaseNotesPayloadSchema = z.object(
  postUpdateReleaseNotesPayloadSchemaShape,
); // 由字段表组装

const skippedElectronUpdateVersionsSchema = z // skippedElectronUpdateVersionsSchema 的定义
  .partialRecord(releaseChannelSchema, requiredTextSchema) // 链式修饰
  .default({}); // 链式修饰

const remoteTargetSchema = z.discriminatedUnion("kind", [
  // remoteTargetSchema 的定义
  z.object({
    // 分支载荷
    // 分支对象
    kind: /* 字面量 */ z.literal("ssh"),
    host: /* 嵌套结构 */ requiredTextSchema,
    port: /* 数值 */ plainNumberSchema.int().positive().max(65535).optional(),
    username: /* 嵌套结构 */ requiredTextSchema,
    sshConfigAlias: /* 嵌套结构 */ requiredTextSchema.optional(),
    privateKeyPath: /* 文本 */ optionalTextSchema,
    assetInstallMode: /* 枚举 */ z.enum(REMOTE_ASSET_INSTALL_MODES).optional(),
    resourcePackages: /* 嵌套结构 */ z
      .object({
        // 链式修饰
        // 修饰链
        selectedPackageIds: /* 数组 */ z
          .array(plainTextSchema.refine(isKnownRemoteResourcePackageId)) // 链式修饰
          .optional(), // 修饰链
      }) // remoteTargetSchema 收口
      .optional(), // 修饰链
    passwordCredentialKey: /* 嵌套结构 */ requiredTextSchema.optional(),
    privateKeyPassphraseCredentialKey: /* 嵌套结构 */ requiredTextSchema.optional(),
  }),
  z.object({
    // 分支载荷
    // 分支对象
    kind: /* 字面量 */ z.literal("wsl"),
    distro: /* 文本 */ optionalTextSchema,
    user: /* 嵌套结构 */ wslUserSchema.optional(),
  }),
  z.object({
    // 分支载荷
    // 分支对象
    kind: /* 字面量 */ z.literal("docker"),
    container: /* 嵌套结构 */ requiredTextSchema,
  }),
]);

const workspaceSessionEntrySchema = z.discriminatedUnion("kind", [
  // workspaceSessionEntrySchema 的定义
  z.object({
    // 分支载荷
    // 分支对象
    kind: /* 字面量 */ z.literal("local"),
    workspacePath: /* 嵌套结构 */ requiredTextSchema,
    workspacePurpose: /* 枚举 */ z.enum(["project", "conversation"]).default("project"),
  }),
  z.object({
    // 分支载荷
    // 分支对象
    kind: /* 字面量 */ z.literal("remote"),
    workspacePath: /* 嵌套结构 */ requiredTextSchema,
    localWorkspacePath: /* 嵌套结构 */ requiredTextSchema.optional(),
    workspaceIdentity: /* 嵌套结构 */ requiredTextSchema.optional(),
    target: /* 嵌套结构 */ remoteTargetSchema,
    lastOpenedAt: /* 数值 */ plainNumberSchema.int().nonnegative(),
    lastConnectionStatus: /* 枚举 */ z.enum(["connected", "failed"]),
    lastConnectionError: /* 文本 */ optionalTextSchema,
  }),
]);

const endpointOriginSchema = z.preprocess((rawInput) => {
  // 判定式
  // endpointOriginSchema 的定义
  if (typeof rawInput !== "string") {
    // 分支判定
    return undefined; // 不合法即空
  } // 字段组收口
  const trimmedText = rawInput.trim();
  if (!trimmedText) {
    // 分支判定
    return undefined; // 不合法即空
  } // 字段组收口
  try {
    // 解析保护
    return normalizeKnorviaEndpointOrigin(trimmedText);
  } catch {
    // 解析保护
    return undefined; // 不合法即空
  } // 字段组收口
}, optionalTextSchema);

function sanitizeKnorviaEndpointOrigin(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if (!("knorviaEndpointOrigin" in record)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const parsed = endpointOriginSchema.safeParse(record.knorviaEndpointOrigin); // 局部解析
  if (parsed.success && typeof parsed.data === "string") {
    // 分支判定
    return { ...record, knorviaEndpointOrigin: parsed.data }; // 复制替换
  } // 字段组收口
  const { knorviaEndpointOrigin: discarded, ...remaining } = record; // 解构剔除
  void discarded;
  return remaining;
} // 字段组收口

function sanitizeDesktopWindowSize(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if (!("desktopWindowSize" in record)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  if (windowSizeSchema.safeParse(record.desktopWindowSize).success) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const { desktopWindowSize: discarded, ...remaining } = record; // 解构剔除
  void discarded;
  return remaining;
} // 字段组收口

function sanitizeEmbeddedBrowserViewportPreference(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if (!("embeddedBrowserViewportPreference" in record)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  if (
    // 分支判定
    embeddedBrowserViewportPreferenceSchema.safeParse(record.embeddedBrowserViewportPreference)
      .success
  ) {
    return rawInput;
  } // 字段组收口
  const { embeddedBrowserViewportPreference: discarded, ...remaining } = record; // 解构剔除
  void discarded;
  return remaining;
} // 字段组收口

function migrateCloseToTrayOnWindowsDefault(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if (record.closeToTrayOnWindowsMigrationInitialized === true) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  return { ...record, closeToTrayOnWindows: true, closeToTrayOnWindowsMigrationInitialized: true }; // 复制替换
} // 字段组收口

function migrateMessageStreamShowReasoningDefault(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if (record.messageStreamShowReasoningMigrationInitialized === true) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  return {
    ...record,
    messageStreamShowReasoning: /* 字段值 */ true,
    messageStreamShowReasoningMigrationInitialized: /* 字段值 */ true,
  };
} // 字段组收口

function migrateLegacyLocalePreference(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  if ("localePreference" in record || !("locale" in record)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const parsed = localeSchema.safeParse(record.locale); // 局部解析
  return parsed.success ? { ...record, localePreference: parsed.data } : rawInput;
} // 字段组收口

const legacyRemoteHistoryEntrySchemaShape = {
  // 字段表
  // legacyRemoteHistoryEntrySchema 的定义
  id: /* 嵌套结构 */ requiredTextSchema,
  workspacePath: /* 嵌套结构 */ requiredTextSchema,
  localWorkspacePath: /* 嵌套结构 */ requiredTextSchema.optional(),
  workspaceIdentity: /* 嵌套结构 */ requiredTextSchema.optional(),
  target: /* 嵌套结构 */ remoteTargetSchema,
  lastOpenedAt: /* 数值 */ plainNumberSchema.int().nonnegative(),
  lastConnectionStatus: /* 枚举 */ z.enum(["connected", "failed"]),
  lastConnectionError: /* 文本 */ optionalTextSchema,
};
const legacyRemoteHistoryEntrySchema = z.object(legacyRemoteHistoryEntrySchemaShape); // 由字段表组装

function stripHistoricalRemoteResourcePackages(target: unknown): unknown {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    // 分支判定
    return target;
  } // 字段组收口
  const record = target as Record<string, unknown>;
  if (record.kind !== "ssh" || !("resourcePackages" in record)) {
    // 分支判定
    return target;
  } // 字段组收口
  const { resourcePackages: discarded, ...remaining } = record; // 解构剔除
  void discarded;
  return remaining;
} // 字段组收口

function migrateLegacyWorkspaceSession(rawInput: unknown): unknown {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    // 分支判定
    return rawInput;
  } // 字段组收口
  const record = rawInput as Record<string, unknown>;
  const migrated = { ...record };
  delete migrated.lastOpenTabs;
  delete migrated.remoteWorkspaceHistory;

  const session = Array.isArray(record.lastWorkspaceSession) ? record.lastWorkspaceSession : [];
  const hasLegacyRemoteEntries = session.some(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && "historyId" in entry, // 判定式
  );
  const history = Array.isArray(record.remoteWorkspaceHistory) ? record.remoteWorkspaceHistory : [];
  const historyById = new Map(
    history.flatMap((entry) => {
      // 判定式
      const candidate =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? { ...entry, target: stripHistoricalRemoteResourcePackages(entry.target) }
          : entry;
      const parsed = legacyRemoteHistoryEntrySchema.safeParse(candidate); // 局部解析
      return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
    }),
  );

  const sessionEntries: Record<string, unknown>[] =
    session.length > 0
      ? session.flatMap((entry) => {
          // 判定式
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            // 分支判定
            return [];
          } // 字段组收口
          if (entry.kind === "local" && typeof entry.workspacePath === "string") {
            // 分支判定
            return [
              {
                kind: /* 字段值 */ "local",
                workspacePath: /* 字段值 */ entry.workspacePath,
                workspacePurpose:
                  entry.workspacePurpose === "conversation" ? "conversation" : "project",
              }, // 字段组收口
            ];
          } // 字段组收口
          if (entry.kind !== "remote") {
            // 分支判定
            return [];
          } // 字段组收口
          if (typeof entry.workspacePath === "string" && entry.target) {
            // 分支判定
            return [{ ...entry, target: stripHistoricalRemoteResourcePackages(entry.target) }];
          } // 字段组收口
          if (typeof entry.historyId !== "string") {
            // 分支判定
            return [];
          } // 字段组收口
          const historical = historyById.get(entry.historyId);
          if (!historical) {
            // 分支判定
            return [];
          } // 字段组收口
          return [
            {
              kind: /* 字段值 */ "remote",
              workspacePath: /* 字段值 */ historical.workspacePath,
              ...(historical.localWorkspacePath
                ? { localWorkspacePath: historical.localWorkspacePath }
                : {}),
              ...(historical.workspaceIdentity
                ? { workspaceIdentity: historical.workspaceIdentity }
                : {}),
              target: /* 字段值 */ stripHistoricalRemoteResourcePackages(historical.target),
              lastOpenedAt: /* 字段值 */ historical.lastOpenedAt,
              lastConnectionStatus: /* 字段值 */ historical.lastConnectionStatus,
              ...(historical.lastConnectionError
                ? { lastConnectionError: historical.lastConnectionError }
                : {}),
            }, // 字段组收口
          ];
        }) // historical 收口
      : [];
  const legacyTabs = Array.isArray(record.lastOpenTabs)
    ? record.lastOpenTabs.flatMap((tab) =>
        // 判定式
        typeof tab === "string"
          ? [{ kind: "local", workspacePath: tab, workspacePurpose: "project" }]
          : [],
      )
    : [];
  const existingPaths = new Set(
    sessionEntries.flatMap((entry) =>
      // 判定式
      entry.kind === "local" && typeof entry.workspacePath === "string"
        ? [entry.workspacePath]
        : [],
    ),
  );
  const next = [
    ...sessionEntries,
    ...legacyTabs.filter((entry) => !existingPaths.has(entry.workspacePath)), // 判定式
  ];
  if (next.length > 0 || hasLegacyRemoteEntries || Array.isArray(record.lastOpenTabs)) {
    // 分支判定
    migrated.lastWorkspaceSession = next;
  } // 字段组收口
  return migrated;
} // 字段组收口

const settingsFieldTable = {
  // settingsFieldTable 的定义
  // 设置对象的字段表
  releaseInfoUrl: /* 嵌套结构 */ releaseUrlSchema.default(""),
  releaseChecksEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  recentProjects: /* 数组 */ z.array(plainTextSchema).default([]),
  locale: /* 嵌套结构 */ localeSchema.default("zh-CN"),
  shortcutBindings: /* 数组 */ z.record(plainTextSchema, z.array(plainTextSchema)).optional(),
  localePreference: /* 嵌套结构 */ localePrefSchema.default("system"),
  terminalInheritSystemProfile: /* 布尔 */ plainBooleanSchema.default(true),
  terminalFontFamily: /* 嵌套结构 */ requiredTextSchema.optional(),
  integratedTerminalShell: /* 嵌套结构 */ integratedTerminalShellSelectionSchema.optional(),
  httpProxy: /* 嵌套结构 */ requiredTextSchema.optional(),
  httpProxyNoProxy: /* 嵌套结构 */ requiredTextSchema.optional(),
  httpProxyCaCertPath: /* 嵌套结构 */ requiredTextSchema.optional(),
  embeddedBrowserAllowInsecureCertificates: /* 布尔 */ plainBooleanSchema.default(false),
  embeddedBrowserViewportPreference: embeddedBrowserViewportPreferenceSchema.default(
    DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE,
  ),
  computerUseComposerEntryHidden: /* 布尔 */ plainBooleanSchema.default(true),
  taskAutoArchiveEnabled: /* 布尔 */ plainBooleanSchema.default(false),
  taskAutoArchiveOlderThanDays: /* 数值 */ plainNumberSchema.int().positive().max(365).default(7),
  closeToTrayOnWindows: /* 布尔 */ plainBooleanSchema.default(true),
  closeToTrayOnWindowsMigrationInitialized: /* 布尔 */ plainBooleanSchema.default(true),
  keepAwakeWhileRunning: /* 布尔 */ plainBooleanSchema.default(false),
  desktopZoomLevel: /* 嵌套结构 */ zoomLevelSchema.optional(),
  desktopWindowSize: /* 嵌套结构 */ windowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  messageStreamShowReasoning: /* 布尔 */ plainBooleanSchema.default(true),
  messageStreamShowReasoningMigrationInitialized: /* 布尔 */ plainBooleanSchema.default(true),
  messageStreamShowTodos: /* 布尔 */ plainBooleanSchema.default(false),
  toolGroupingExploreEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  toolGroupingTerminalEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  toolGroupingChangesEnabled: /* 布尔 */ plainBooleanSchema.default(false),
  knorviaInteractionBehavior: /* 嵌套结构 */ interactionBehaviorSchema.default("queue"),
  askUserQuestionAutoResolutionEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  modelIoFullRetentionEnabled: /* 布尔 */ plainBooleanSchema.default(false),
  startPlanRecommendationDismissed: /* 布尔 */ plainBooleanSchema.default(false),
  providerFamilyConnectionSelections:
    /* 嵌套结构 */ providerFamilyConnectionSelectionSettingsSchema.default({}),
  providerFamilyDomain: /* 嵌套结构 */ providerFamilyDomainSchema.optional(),
  providerFamilyDomainUpdatedAt: /* 数值 */ plainNumberSchema.int().nonnegative().optional(),
  providerFamilyDomainMigrated: /* 布尔 */ plainBooleanSchema.default(false),
  nativeSearchEnhancementsEnabled: /* 布尔 */ plainBooleanSchema.default(true),
  onboardingOccupation: /* 可缺省可空嵌套结构 */ occupationChoiceSchema.nullish(),
  studioFirstRunGuideStatus: /* 嵌套结构 */ z
    .enum(["pending", "deferred", "complete", "legacy"]) // 链式修饰
    .default("pending"), // 链式修饰
  proactiveSuggestionsEnabled: /* 布尔 */ optionalBooleanSchema,
  memoryEnabled: /* 布尔 */ plainBooleanSchema.default(false),
  lastWorkspaceSession: /* 数组 */ z.array(workspaceSessionEntrySchema).default([]),
  lastActiveTabIndex: /* 数值 */ plainNumberSchema.int().nonnegative().default(0),
  lastActiveTaskByWorkspace: /* 键值记录 */ z.record(plainTextSchema, plainTextSchema).optional(),
  dataBaseDir: /* 非空文本 */ requiredTextSchema.optional(),
  pendingPostUpdateReleaseNotes: /* 嵌套结构 */ postUpdateReleaseNotesPayloadSchema.optional(),
  receivePreviewUpdates: /* 布尔 */ plainBooleanSchema.default(false),
  autoDownloadAndInstallUpdates: /* 布尔 */ plainBooleanSchema.default(false),
  skippedElectronUpdateVersions: /* 嵌套结构 */ skippedElectronUpdateVersionsSchema,
  settingsSyncFirstRunPromptHandled: /* 布尔 */ optionalBooleanSchema,
  knorviaEndpointOrigin: /* 嵌套结构 */ endpointOriginSchema.optional(),
};
const settingsObjectSchema = z.object(settingsFieldTable); // 由字段表组装，行为不变

export const appSettingsSchema = z.preprocess(
  // appSettingsSchema 的定义
  // appSettingsSchema 的定义
  (rawInput) =>
    // 判定式
    sanitizeEmbeddedBrowserViewportPreference(
      sanitizeDesktopWindowSize(
        migrateMessageStreamShowReasoningDefault(
          migrateCloseToTrayOnWindowsDefault(
            migrateLegacyLocalePreference(
              sanitizeKnorviaEndpointOrigin(migrateLegacyWorkspaceSession(rawInput)),
            ),
          ),
        ),
      ),
    ),
  settingsObjectSchema, // 判别联合成员
);

const patchFieldTable = {
  // patchFieldTable 的定义
  // 补丁对象的字段表
  // appSettingsPatchSchema 的定义
  releaseInfoUrl: /* 嵌套结构 */ releaseUrlSchema.optional(),
  releaseChecksEnabled: /* 布尔 */ optionalBooleanSchema,
  recentProjects: /* 数组 */ z.array(plainTextSchema).optional(),
  locale: /* 嵌套结构 */ localeSchema.optional(),
  shortcutBindings: /* 数组 */ z.record(plainTextSchema, z.array(plainTextSchema)).optional(),
  localePreference: /* 嵌套结构 */ localePrefSchema.optional(),
  terminalInheritSystemProfile: /* 布尔 */ optionalBooleanSchema,
  terminalFontFamily: /* 嵌套结构 */ requiredTextSchema.optional(),
  integratedTerminalShell: /* 嵌套结构 */ integratedTerminalShellSelectionSchema.optional(),
  httpProxy: /* 嵌套结构 */ requiredTextSchema.optional(),
  httpProxyNoProxy: /* 嵌套结构 */ requiredTextSchema.optional(),
  httpProxyCaCertPath: /* 嵌套结构 */ requiredTextSchema.optional(),
  embeddedBrowserAllowInsecureCertificates: /* 布尔 */ optionalBooleanSchema,
  embeddedBrowserViewportPreference:
    /* 嵌套结构 */ embeddedBrowserViewportPreferenceSchema.optional(),
  computerUseComposerEntryHidden: /* 布尔 */ optionalBooleanSchema,
  taskAutoArchiveEnabled: /* 布尔 */ optionalBooleanSchema,
  taskAutoArchiveOlderThanDays: /* 数值 */ plainNumberSchema.int().positive().max(365).optional(),
  closeToTrayOnWindows: /* 布尔 */ optionalBooleanSchema,
  keepAwakeWhileRunning: /* 布尔 */ optionalBooleanSchema,
  closeToTrayOnWindowsMigrationInitialized: /* 布尔 */ optionalBooleanSchema,
  desktopZoomLevel: /* 嵌套结构 */ zoomLevelSchema.optional(),
  desktopWindowSize: /* 嵌套结构 */ windowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: /* 布尔 */ optionalBooleanSchema,
  messageStreamShowReasoning: /* 布尔 */ optionalBooleanSchema,
  messageStreamShowReasoningMigrationInitialized: /* 布尔 */ optionalBooleanSchema,
  messageStreamShowTodos: /* 布尔 */ optionalBooleanSchema,
  toolGroupingExploreEnabled: /* 布尔 */ optionalBooleanSchema,
  toolGroupingTerminalEnabled: /* 布尔 */ optionalBooleanSchema,
  toolGroupingChangesEnabled: /* 布尔 */ optionalBooleanSchema,
  knorviaInteractionBehavior: /* 嵌套结构 */ interactionBehaviorSchema.optional(),
  askUserQuestionAutoResolutionEnabled: /* 布尔 */ optionalBooleanSchema,
  modelIoFullRetentionEnabled: /* 布尔 */ optionalBooleanSchema,
  startPlanRecommendationDismissed: /* 布尔 */ optionalBooleanSchema,
  providerFamilyConnectionSelections:
    /* 嵌套结构 */ providerFamilyConnectionSelectionSettingsSchema.optional(),
  providerFamilyDomain: /* 字面量 */ z
    .union([providerFamilyDomainSchema, z.literal("")]) // 链式修饰
    .optional(), // 修饰链
  providerFamilyDomainUpdatedAt: /* 数值 */ plainNumberSchema.int().nonnegative().optional(),
  providerFamilyDomainMigrated: /* 布尔 */ optionalBooleanSchema,
  nativeSearchEnhancementsEnabled: /* 布尔 */ optionalBooleanSchema,
  onboardingOccupation: /* 嵌套结构 */ z
    .enum([
      // 链式修饰
      "office", // 校验文案（逐字冻结）
      "developer", // 校验文案（逐字冻结）
      "independent", // 校验文案（逐字冻结）
      "infrastructure", // 校验文案（逐字冻结）
      "product", // 校验文案（逐字冻结）
      "design", // 校验文案（逐字冻结）
      "student", // 校验文案（逐字冻结）
      "creator", // 校验文案（逐字冻结）
      "operations", // 校验文案（逐字冻结）
      "marketing", // 校验文案（逐字冻结）
      "finance", // 校验文案（逐字冻结）
      "accounting", // 校验文案（逐字冻结）
      "legal", // 校验文案（逐字冻结）
      "other", // 校验文案（逐字冻结）
    ])
    .nullish(), // 链式修饰
  studioFirstRunGuideStatus: /* 枚举 */ z
    .enum(["pending", "deferred", "complete", "legacy"]) // 链式修饰
    .optional(), // 修饰链
  proactiveSuggestionsEnabled: /* 布尔 */ optionalBooleanSchema,
  memoryEnabled: /* 布尔 */ optionalBooleanSchema,
  lastWorkspaceSession: /* 数组 */ z.array(workspaceSessionEntrySchema).optional(),
  lastActiveTabIndex: /* 数值 */ plainNumberSchema.int().nonnegative().optional(),
  lastActiveTaskByWorkspace: /* 键值记录 */ z.record(plainTextSchema, plainTextSchema).optional(),
  dataBaseDir: /* 非空文本 */ requiredTextSchema.optional(),
  pendingPostUpdateReleaseNotes: /* 嵌套结构 */ postUpdateReleaseNotesPayloadSchema.optional(),
  receivePreviewUpdates: /* 布尔 */ optionalBooleanSchema,
  autoDownloadAndInstallUpdates: /* 布尔 */ optionalBooleanSchema,
  skippedElectronUpdateVersions: /* 嵌套结构 */ z
    .partialRecord(releaseChannelSchema, requiredTextSchema) // 链式修饰
    .optional(), // 修饰链
  settingsSyncFirstRunPromptHandled: /* 布尔 */ optionalBooleanSchema,
  knorviaEndpointOrigin: /* 嵌套结构 */ endpointOriginSchema.optional(),
};
export const appSettingsPatchSchema = z.object(patchFieldTable); // 由字段表组装，行为不变
