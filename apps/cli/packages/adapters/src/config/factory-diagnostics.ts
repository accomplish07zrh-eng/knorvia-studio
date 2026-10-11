// SPDX-License-Identifier: Apache-2.0
// 配置诊断的告警日志：诊断码 → 文案/事件 的映射表，按「用户 → 项目」顺序逐条上报。
import type { LoggerFactory } from "@knorvia/contracts";
import { createNodeLoggerFactory } from "../logging/index.js";
import type { LoadedConfig } from "./file-config.adapter.js";

const LOGGER_SCOPE = "knorvia";
const LOGGER_MODULE = "adapters.config";

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
  env?: Record<string, string | undefined>;
  loggerFactory?: LoggerFactory;
  project: LoadedConfig["diagnostics"];
  user: LoadedConfig["diagnostics"];
}

/** 没有任何诊断时连 logger 都不创建（B42 要求惰性）。 */
export function warnConfigDiagnostics(input: WarningInput): void {
  if (input.user.length === 0 && input.project.length === 0) return;
  const factory = input.loggerFactory ?? createNodeLoggerFactory({ env: input.env });
  const logger = factory.createLogger(LOGGER_SCOPE).child({ module: LOGGER_MODULE });

  const batches: ReadonlyArray<readonly [string, LoadedConfig["diagnostics"]]> = [
    ["user", input.user],
    ["project", input.project],
  ];
  for (const [configScope, diagnostics] of batches) {
    for (const diagnostic of diagnostics) {
      const shape = WARNING_BY_CODE.get(diagnostic.code) ?? FILE_WARNING;
      logger.warn(shape.message, {
        configPath: diagnostic.filePath,
        configScope,
        diagnosticCode: diagnostic.code,
        diagnosticMessage: diagnostic.message,
        diagnosticPath: diagnostic.path,
        event: shape.event,
        severity: diagnostic.severity,
      });
    }
  }
}
