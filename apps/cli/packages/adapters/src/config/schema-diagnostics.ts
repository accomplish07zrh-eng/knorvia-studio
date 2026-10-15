// SPDX-License-Identifier: Apache-2.0
// 配置诊断的公开形状：解析层与工厂层共用。
export type ConfigDiagnosticSeverity = "warning" | "error";

export type ConfigDiagnosticCode =
  | "config_file_invalid"
  | "config_mcp_server_invalid"
  | "config_project_hooks_pending_trust";

export interface ConfigDiagnostic {
  code: ConfigDiagnosticCode;
  filePath?: string;
  message: string;
  path?: string;
  severity: ConfigDiagnosticSeverity;
}
