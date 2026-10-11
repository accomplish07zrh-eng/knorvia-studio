// SPDX-License-Identifier: Apache-2.0
// 配置解析：逐条隔离 MCP 服务器、归一插件 id、把校验后的块搬进运行态补丁。
import type { RuntimeConfigPatch } from "@knorvia/contracts";
import type { ZodError } from "zod";
import { KnorviaConfigFileSchema, serverShape, type KnorviaConfigFile } from "./schema-blocks.js";
import type { ConfigDiagnostic } from "./schema-diagnostics.js";
import {
  CANONICAL_CUA_PLUGIN_ID,
  canonicalizePluginId,
  LEGACY_CUA_PLUGIN_ID,
} from "./schema-ids.js";

export interface ParseConfigFileResult {
  config: RuntimeConfigPatch;
  diagnostics: ConfigDiagnostic[];
}

type OverrideMap = Record<string, { enable?: boolean }>;
type JsonMap = Record<string, unknown>;

/** 与运行态补丁同名的顶层块：解析后原样搬运，无需二次映射。 */
const SAME_NAME_BLOCKS = [
  "modelStream",
  "permission",
  "storage",
  "network",
  "features",
  "memory",
  "mcp",
  "logging",
  "ui",
  "toolConcurrency",
  "modelAnomalyGuard",
  "hooks",
] as const satisfies readonly (keyof KnorviaConfigFile & keyof RuntimeConfigPatch)[];

/** skills 块里属于「技能系统设置」的键；其余键会被解释成单技能开关。 */
const SKILL_SETTING_KEYS = ["enabled", "includeInstructions", "metadataBudget", "roots"] as const;

const MCP_CODE = "config_mcp_server_invalid";
const SERVERS_NOT_OBJECT = "mcp.servers must be a JSON object; ignoring all MCP servers.";
/** 绝对路径的三种写法：POSIX、Windows UNC、Windows 盘符。 */
const ABSOLUTE_PATH_FORMS = [/^\//u, /^\\\\/u, /^[A-Za-z]:[\\/]/u] as const;

function looksLikeMap(value: unknown): value is JsonMap {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

/** 诊断只在这里构造：字段写全之后再入队，调用方不必关心 severity 字面量。 */
function noteWarning(sink: ConfigDiagnostic[], path: string, text: string): void {
  const diagnostic = { message: text, path } as ConfigDiagnostic;
  diagnostic.code = MCP_CODE;
  diagnostic.severity = "warning";
  sink.push(diagnostic);
}

function describeIssues(error: ZodError): string {
  const parts: string[] = [];
  for (const issue of error.issues) {
    const where = issue.path.length === 0 ? "<server>" : issue.path.join(".");
    parts.push(where + ": " + issue.message);
  }
  return parts.join("; ");
}

function serverPath(name: string): string {
  return "mcp.servers." + name;
}

/**
 * 逐条校验服务器：通过的进保留表，失败的只记一条警告
 * （单个 server 出错不该拖垮整份配置）。
 */
function partitionServers(servers: JsonMap, sink: ConfigDiagnostic[]): JsonMap {
  const accepted: [string, unknown][] = [];
  for (const [name, raw] of Object.entries(servers)) {
    const checked = serverShape.safeParse(raw);
    if (checked.success) {
      accepted.push([name, checked.data]);
      continue;
    }
    noteWarning(sink, serverPath(name), describeIssues(checked.error));
  }
  return Object.fromEntries(accepted);
}

/** 解析前的输入归一：只有 mcp.servers 需要单独处理，其它块交给顶层 schema 报错。 */
export function normalizeConfigFileInput(value: unknown, sink: ConfigDiagnostic[]): unknown {
  if (!looksLikeMap(value)) return value;
  const root: JsonMap = { ...value };
  const mcp = root.mcp;
  if (!looksLikeMap(mcp)) return root;
  const servers = mcp.servers;
  if (servers === undefined) return root;
  if (!looksLikeMap(servers)) {
    noteWarning(sink, "mcp.servers", SERVERS_NOT_OBJECT);
    root.mcp = { ...mcp, servers: {} };
    return root;
  }
  root.mcp = { ...mcp, servers: partitionServers(servers, sink) };
  return root;
}

/** 把映射里的旧 CUA id 提升成规范 id：规范键已存在时以规范键为准。 */
function hoistLegacyKey<T>(section: Record<string, T> | undefined): Record<string, T> | undefined {
  if (section === undefined) return undefined;
  if (!(LEGACY_CUA_PLUGIN_ID in section)) return { ...section };
  const hoisted = { ...section };
  const legacyValue = hoisted[LEGACY_CUA_PLUGIN_ID];
  delete hoisted[LEGACY_CUA_PLUGIN_ID];
  if (hoisted[CANONICAL_CUA_PLUGIN_ID] === undefined)
    hoisted[CANONICAL_CUA_PLUGIN_ID] = legacyValue;
  return hoisted;
}

/** 停用清单：归一 id 并去重（保持首次出现顺序）。 */
function dedupeSuppressed(ids: readonly string[] | undefined): string[] | undefined {
  if (ids === undefined) return undefined;
  const seen = new Set<string>();
  const listed: string[] = [];
  for (const id of ids) {
    const normalized = canonicalizePluginId(id);
    if (seen.has(normalized) && normalized === CANONICAL_CUA_PLUGIN_ID) continue;
    seen.add(normalized);
    listed.push(normalized);
  }
  return listed;
}

function toPluginsPatch(
  plugins: KnorviaConfigFile["plugins"],
): NonNullable<RuntimeConfigPatch["plugins"]> {
  if (!plugins) return {};
  const patch = { ...plugins } as NonNullable<RuntimeConfigPatch["plugins"]>;
  const enabled = hoistLegacyKey(plugins.enabledPlugins);
  const suppressed = dedupeSuppressed(plugins.suppressedBuiltins);
  const options = hoistLegacyKey(plugins.options);
  if (enabled !== undefined) patch.enabledPlugins = enabled;
  if (suppressed !== undefined) patch.suppressedBuiltins = suppressed;
  if (options !== undefined) patch.options = options;
  return patch;
}

/** 技能系统设置：白名单键逐个搬运，一个都没写就返回 undefined。 */
function toSkillsPatch(
  skills: KnorviaConfigFile["skills"],
): RuntimeConfigPatch["skills"] | undefined {
  if (!skills) return undefined;
  const settings = {} as NonNullable<RuntimeConfigPatch["skills"]>;
  let written = 0;
  for (const key of SKILL_SETTING_KEYS) {
    const value = skills[key];
    if (value === undefined) continue;
    Object.assign(settings, { [key]: value });
    written += 1;
  }
  return written === 0 ? undefined : settings;
}

function isAbsolutePath(path: string): boolean {
  return ABSOLUTE_PATH_FORMS.some((form) => form.test(path));
}

function looksLikeOverride(value: unknown): value is { enable?: boolean } {
  if (!looksLikeMap(value)) return false;
  if (!("enable" in value)) return true;
  return typeof value.enable === "boolean";
}

/** 复数 skills 里的绝对路径键来自设置页的单技能开关，映射成运行态 skillOverrides。 */
function overridesFromPluralSkills(skills: KnorviaConfigFile["skills"]): OverrideMap | undefined {
  if (!skills) return undefined;
  const picked: [string, { enable?: boolean }][] = [];
  for (const [path, value] of Object.entries(skills)) {
    if (isAbsolutePath(path) && looksLikeOverride(value))
      picked.push([path, { enable: value.enable }]);
  }
  return picked.length === 0 ? undefined : Object.fromEntries(picked);
}

function mergeOverrides(...sources: Array<OverrideMap | undefined>): OverrideMap | undefined {
  let merged: OverrideMap | undefined;
  for (const source of sources) {
    if (source === undefined) continue;
    merged = { ...merged, ...source };
  }
  return merged;
}

/** 校验后的配置 → 运行态补丁：同名块按表搬运，插件/技能走专用映射。 */
function toRuntimePatch(parsed: KnorviaConfigFile): RuntimeConfigPatch {
  const patch: RuntimeConfigPatch = {};
  for (const block of SAME_NAME_BLOCKS) {
    const value = parsed[block];
    if (value !== undefined) Object.assign(patch, { [block]: value });
  }
  if (parsed.plugins) patch.plugins = toPluginsPatch(parsed.plugins);

  const skills = toSkillsPatch(parsed.skills);
  if (skills) patch.skills = skills;
  const overrides = mergeOverrides(parsed.skill, overridesFromPluralSkills(parsed.skills));
  if (overrides) patch.skillOverrides = overrides;
  if (parsed.command) patch.commandOverrides = parsed.command;
  return patch;
}

export function parseConfigFile(value: unknown): ParseConfigFileResult {
  const diagnostics: ConfigDiagnostic[] = [];
  const prepared = normalizeConfigFileInput(value, diagnostics);
  const parsed = KnorviaConfigFileSchema.parse(prepared);
  const outcome = {} as ParseConfigFileResult;
  outcome.config = toRuntimePatch(parsed);
  outcome.diagnostics = diagnostics;
  return outcome;
}
