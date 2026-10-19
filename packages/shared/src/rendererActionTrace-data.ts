// SPDX-License-Identifier: Apache-2.0

/*
 * 渲染器动作追踪的纯数据表：OTLP 导出常量、目录分组与各字段的枚举取值。
 * schema 构造与跨字段校验在 rendererActionTrace.ts。
 */

/** OTLP resource 的固定服务名。 */
export const RENDERER_ACTION_TRACE_SERVICE_NAME = "knorvia-desktop-renderer";

/** 采样比例上限。 */
export const RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO = 0.2;

/** 单批 span 上限。 */
export const RENDERER_ACTION_TRACE_MAX_BATCH_SPANS = 32;

/** 单批字节上限（256 KiB）。 */
export const RENDERER_ACTION_TRACE_MAX_BATCH_BYTES = 262144;

/** 目录组是 UI 侧的稳定分区；新增分组要同时改采样配置的默认值。 */
export const RENDERER_ACTION_TRACE_GROUPS = [
  "core",
  "settings",
  "workbench",
  "extensions",
  "automation",
  "account",
] as const;

/** 结果来源。 */
export const RENDERER_ACTION_TRACE_RESULT_SOURCES = [
  "local_commit",
  "shared_settings",
  "setting_service",
  "platform_result",
  "authority_ack",
  "optimistic_projection",
] as const;

/** 动作后的状态。 */
export const RENDERER_ACTION_TRACE_STATE_AFTER = ["enabled", "disabled"] as const;

/** 工作区类型。 */
export const RENDERER_ACTION_TRACE_WORKSPACE_KINDS = ["local", "remote"] as const;

/** 远程工作区的连接类型。 */
export const RENDERER_ACTION_TRACE_REMOTE_KINDS = ["ssh", "wsl", "docker", "server"] as const;

/** 输入准入结果。 */
export const RENDERER_ACTION_TRACE_ADMISSION_RESULTS = [
  "accepted",
  "rejected",
  "stale",
  "duplicate",
  "noop",
  "not_applicable",
] as const;

/** 自动化任务类型。 */
export const RENDERER_ACTION_TRACE_AUTOMATION_KINDS = ["scheduled", "off_peak"] as const;

/** 操作种类。 */
export const RENDERER_ACTION_TRACE_OPERATION_KINDS = [
  "navigation",
  "preference",
  "command",
  "management",
  "destructive",
] as const;

/** 触发方式。 */
export const RENDERER_ACTION_TRACE_TRIGGERS = [
  "button",
  "keyboard",
  "shortcut",
  "menu",
  "switch",
  "select",
  "drag",
] as const;

/** 动作结果。 */
export const RENDERER_ACTION_TRACE_OUTCOMES = [
  "completed",
  "failed",
  "rejected",
  "cancelled",
  "noop",
  "abandoned",
] as const;

/** span 状态。 */
export const RENDERER_ACTION_TRACE_SPAN_STATUSES = ["unset", "ok", "error"] as const;

/** 部署环境。 */
export const RENDERER_ACTION_TRACE_DEPLOYMENT_ENVIRONMENTS = [
  "development",
  "test",
  "production",
] as const;

/** 关闭采样时的固定配置。 */
export const DISABLED_RENDERER_ACTION_TRACE_CONFIG = {
  enabled: false,
  sampleRatio: 0,
  enabledGroups: [],
  configVersion: "disabled",
};
