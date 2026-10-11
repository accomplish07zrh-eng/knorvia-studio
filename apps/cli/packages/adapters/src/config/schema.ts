// SPDX-License-Identifier: Apache-2.0
// 配置文件的公开面：块 schema、诊断类型与解析入口；实现见 schema-blocks / schema-runtime。
import { KnorviaConfigFileSchema, type KnorviaConfigFile } from "./schema-blocks.js";
import {
  parseConfigFile,
  type ConfigDiagnostic,
  type ConfigDiagnosticCode,
  type ConfigDiagnosticSeverity,
  type ParseConfigFileResult,
} from "./schema-runtime.js";

export {
  CANONICAL_CUA_PLUGIN_ID,
  canonicalizePluginId,
  LEGACY_CUA_PLUGIN_ID,
  pluginIdAliases,
} from "./schema-ids.js";
export { KnorviaConfigFileSchema };
export type { KnorviaConfigFile };

export type {
  ConfigDiagnostic,
  ConfigDiagnosticCode,
  ConfigDiagnosticSeverity,
} from "./schema-diagnostics.js";
export type { ParseConfigFileResult } from "./schema-runtime.js";

export function parseConfigFileToRuntimePatchWithDiagnostics(
  value: unknown,
): ParseConfigFileResult {
  return parseConfigFile(value);
}
