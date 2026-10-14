// SPDX-License-Identifier: Apache-2.0
// plugin-reference 区的公开入口：引用抽取、目录查询与提醒文案三块导出面在这里汇出。
export {
  extractPluginReferences,
  isValidPluginStableId,
  MAX_PLUGIN_REFERENCES_PER_TURN,
  type ExtractPluginReferencesResult,
} from "./references.js";
export { buildPluginReferenceCatalog, findPluginReferenceCatalogEntry } from "./catalog.js";
export {
  buildPluginReferenceReminderBody,
  MAX_PLUGIN_REFERENCE_MCP_SERVERS,
  MAX_PLUGIN_REFERENCE_REMINDER_BYTES,
  MAX_PLUGIN_REFERENCE_SKILLS,
  MAX_PLUGIN_REFERENCE_SUBAGENTS,
  type BuildPluginReferenceReminderInput,
  type BuildPluginReferenceReminderResult,
  type LivePluginMcpServer,
  type LivePluginSkill,
  type LivePluginSubagent,
  type PluginReferenceReminderDiagnostics,
  type PluginReferenceSkipReason,
} from "./reminder.js";
