// SPDX-License-Identifier: Apache-2.0
// 配置诊断的告警日志：诊断码 → 文案/事件 的映射表，按「用户 → 项目」顺序逐条上报。
import type { LoggerFactory } from "@knorvia/contracts";
import { createNodeLoggerFactory } from "../logging/index.js";
import type { LoadedConfig } from "./file-config.adapter.js";

const LOG_SCOPE = "knorvia";
const LOG_MODULE = "adapters.config";

interface WarningShape {
  event: string;
  message: string;
}

/** 已知诊断码的映射；未列出的码按「配置文件加载失败」处理。 */
const WARNING_BY_CODE: ReadonlyMap<string, WarningShape> = new Map([
  [
    "config_mcp_server_invalid",
    { event: "config.mcp_server.skipped", message: "MCP server config skipped" },
  ],
  [
    "config_project_hooks_pending_trust",
    {
      event: "config.project_hooks.pending_trust",
      message: "Project hooks pending workspace trust",
    },
  ],
]);

const FILE_WARNING: WarningShape = {
  event: "config.file.invalid",
  message: "Config file failed to load",
};

export interface WarningInput {
  envOverrides?: Record<string, string | undefined>;
  logger?: LoggerFactory;
  project: LoadedConfig["diagnostics"];
  user: LoadedConfig["diagnostics"];
}

/** 没有任何诊断时连 logger 都不创建（B42 要求惰性）。 */
export function warnConfigDiagnostics(input: WarningInput): void {
  if (input.user.length === 0 && input.project.length === 0) return;
  const factory = input.logger ?? createNodeLoggerFactory({ env: input.envOverrides });
  const target = factory.createLogger(LOG_SCOPE).child({ module: LOG_MODULE });

  const batches: ReadonlyArray<readonly [string, LoadedConfig["diagnostics"]]> = [
    ["user", input.user],
    ["project", input.project],
  ];
  for (const [configScope, entries] of batches) {
    for (const entry of entries) {
      const shape = WARNING_BY_CODE.get(entry.code) ?? FILE_WARNING;
      // 字段名是 B42 冻结的日志载荷契约，因此用赋值构造而不是字面量。
      const payload = {} as Record<string, unknown>;
      payload.configPath = entry.filePath;
      payload.configScope = configScope;
      payload.diagnosticCode = entry.code;
      payload.diagnosticMessage = entry.message;
      payload.diagnosticPath = entry.path;
      payload.event = shape.event;
      payload.severity = entry.severity;
      target.warn(shape.message, payload);
    }
  }
}
