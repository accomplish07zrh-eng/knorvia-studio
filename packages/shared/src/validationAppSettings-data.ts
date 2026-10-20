// SPDX-License-Identifier: Apache-2.0
// AppSettings 校验 schema 的纯数据部分（B45）：枚举取值表、数值边界与字段名清单。
// 只放数据：取值数组逐项一行、边界对象字面量、字段名字符串。schema 组装与旧写迁移在
// validationAppSettings.ts。

/** 职业枚举 14 值（取值逐字冻结，B45）。 */
export const OCCUPATION_CHOICE_VALUES = [
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
] as const;

/** 界面语言。 */
export const LOCALE_CHOICE_VALUES = ["zh-CN", "en-US"] as const;

/** 语言偏好（多一个跟随系统）。 */
export const LOCALE_PREFERENCE_CHOICE_VALUES = ["system", "zh-CN", "en-US"] as const;

/** 交互行为（排队/引导）。 */
export const INTERACTION_BEHAVIOR_CHOICE_VALUES = ["queue", "guide"] as const;

/** 发布通道。 */
export const RELEASE_CHANNEL_CHOICE_VALUES = ["stable", "preview"] as const;

/** 供应商域名族。 */
export const PROVIDER_FAMILY_DOMAIN_CHOICE_VALUES = ["zai", "bigmodel"] as const;

/** 首次引导状态。 */
export const STUDIO_FIRST_RUN_GUIDE_STATUS_VALUES = [
  "pending",
  "deferred",
  "complete",
  "legacy",
] as const;

/** 工作区会话用途。 */
export const WORKSPACE_PURPOSE_VALUES = ["project", "conversation"] as const;

/** 远程连接结果。 */
export const CONNECTION_STATUS_VALUES = ["connected", "failed"] as const;

/** 数值边界（缩放、窗口下限、归档天数上限、SSH 端口上限）。 */
export const SETTINGS_NUMERIC_BOUNDS = {
  zoomMin: -3,
  zoomMax: 5,
  windowMinWidth: 480,
  windowMinHeight: 640,
  taskArchiveMaxDays: 365,
  sshPortMax: 65535,
  defaultTaskArchiveDays: 7,
} as const;

/** 需要「字段非法就整字段剔除」迁移的设置字段名。 */
export const SANITIZED_FIELD_NAMES = {
  endpointOrigin: "knorviaEndpointOrigin",
  desktopWindowSize: "desktopWindowSize",
  embeddedBrowserViewportPreference: "embeddedBrowserViewportPreference",
} as const;

/** 一次性默认值迁移用的标记字段名。 */
export const MIGRATION_MARKER_FIELDS = {
  closeToTrayOnWindows: "closeToTrayOnWindowsMigrationInitialized",
  messageStreamShowReasoning: "messageStreamShowReasoningMigrationInitialized",
} as const;
