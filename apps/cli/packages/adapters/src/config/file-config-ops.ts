// SPDX-License-Identifier: Apache-2.0
// 配置文件读写实现：JSON 容器操作、CUA 插件 id 迁移、按插件维度的补丁写入。
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import type { RuntimeConfigPatch, UiLocale } from "@knorvia/contracts";
import { z } from "zod";
import {
  CANONICAL_CUA_PLUGIN_ID,
  canonicalizePluginId,
  LEGACY_CUA_PLUGIN_ID,
  parseConfigFileToRuntimePatchWithDiagnostics,
  pluginIdAliases,
} from "./schema.js";
import type { ConfigDiagnostic } from "./schema.js";

type JsonMap = Record<string, unknown>;

const HOME_PREFIX = "~/";
const CONFIG_FILENAME = "config.json";
const UTF8 = "utf-8";
const PRIVATE_MODE = 0o600;
const MISSING_CODE = "ENOENT";
const READ_FAILED = "Unable to read config file: ";
const PARSE_FAILED = "Unable to parse config file as JSON: ";
const NOT_OBJECT = "Config file must contain a JSON object: ";
const WRITE_FAILED = "Unable to write config file: ";
const UNABLE_TO_PARSE = "Unable to parse config file.";
const INVALID_FILE_CODE = "config_file_invalid";
const JSON_INDENT = 2;

function isJsonMap(value: unknown): value is JsonMap {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

/** 非对象一律当空对象处理：调用方只需要一个安全的写入口。 */
function asObject(value: unknown): JsonMap {
  return isJsonMap(value) ? value : {};
}

function hasOwn(value: JsonMap, key: string): boolean {
  return Object.hasOwn(value, key);
}

/** 复制一份并删掉所有别名键，用于「同一插件的旧 id 不能与新 id 共存」。 */
function withoutAliases(value: JsonMap, aliases: readonly string[]): JsonMap {
  const aliasSet = new Set(aliases);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !aliasSet.has(key)));
}

function onlyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") kept.push(entry);
  }
  return kept;
}

export function resolvePath(path: string): string {
  if (path.startsWith(HOME_PREFIX)) return join(homedir(), path.slice(HOME_PREFIX.length));
  return resolve(path);
}

export function getDefaultConfigPath(): string {
  return join(resolvePath(join(resolveKnorviaDataRoot(), "cli")), CONFIG_FILENAME);
}

export function hasDefaultConfigFile(): boolean {
  return existsSync(getDefaultConfigPath());
}

// ---------------------------------------------------------------- 读取

async function readJsonObject(target: string): Promise<JsonMap> {
  const text = await readFile(target, UTF8).catch((cause: unknown) => {
    throw new Error(READ_FAILED + target, { cause });
  });
  const parsed = parseJsonText(target, text);
  if (!isJsonMap(parsed)) throw new Error(NOT_OBJECT + target);
  return parsed;
}

/** JSON.parse 失败时统一抛带路径的错误；把 try/catch 收敛到这一处。 */
function parseJsonText(target: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(PARSE_FAILED + target, { cause });
  }
}

/** 文件不存在视为空配置；其它错误（含解析失败）继续上抛。 */
async function readJsonOrEmpty(target: string): Promise<JsonMap> {
  return await readJsonObject(target).catch((error: unknown) => {
    const cause = error instanceof Error ? error.cause : undefined;
    const absent = cause instanceof Error && "code" in cause && cause.code === MISSING_CODE;
    if (absent) return {} as JsonMap;
    throw error;
  });
}

function stagingPath(path: string): string {
  const suffix = Math.random().toString(16).slice(2);
  return join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${suffix}.tmp`);
}

/** 原子写入：同目录临时文件 + rename，权限 0600，末尾补换行。 */
async function saveJson(path: string, value: JsonMap): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const staging = stagingPath(path);
  const content = JSON.stringify(value, null, JSON_INDENT) + "\n";
  try {
    await writeFile(staging, content, { mode: PRIVATE_MODE });
    await rename(staging, path);
  } catch (cause) {
    await unlink(staging).catch(() => undefined);
    throw new Error(WRITE_FAILED + path, { cause });
  }
}

function invalidMessage(error: unknown): string {
  if (!(error instanceof z.ZodError)) {
    return error instanceof Error ? error.message : UNABLE_TO_PARSE;
  }
  const issues = error.issues.map((issue) => {
    const location = issue.path.length ? issue.path.join(".") : "<config>";
    return location + ": " + issue.message;
  });
  return issues.join("; ");
}

// ---------------------------------------------------------------- 迁移

/** 旧 CUA 插件 id 迁移成规范 id：enabledPlugins/options 归一，suppressedBuiltins 替换。 */
function migrateSection(section: unknown): JsonMap | undefined {
  if (!isJsonMap(section) || !hasOwn(section, LEGACY_CUA_PLUGIN_ID)) return undefined;
  const migrated: JsonMap = { ...section };
  if (migrated[CANONICAL_CUA_PLUGIN_ID] === undefined) {
    migrated[CANONICAL_CUA_PLUGIN_ID] = migrated[LEGACY_CUA_PLUGIN_ID];
  }
  delete migrated[LEGACY_CUA_PLUGIN_ID];
  return migrated;
}

/** 旧 CUA 插件 id 迁移成规范 id：enabledPlugins/options 归一，suppressedBuiltins 替换。 */
function migrateLegacyCuaIds(value: unknown): JsonMap | undefined {
  if (!isJsonMap(value) || !isJsonMap(value.plugins)) return undefined;
  const plugins: JsonMap = { ...value.plugins };
  let edited = false;
  for (const field of ["enabledPlugins", "options"] as const) {
    const migrated = migrateSection(plugins[field]);
    if (migrated === undefined) continue;
    plugins[field] = migrated;
    edited = true;
  }
  const legacySuppressed = plugins.suppressedBuiltins;
  if (Array.isArray(legacySuppressed)) {
    const replaced = legacySuppressed.map((entry) =>
      entry === LEGACY_CUA_PLUGIN_ID ? CANONICAL_CUA_PLUGIN_ID : entry,
    );
    const sameList = JSON.stringify(replaced) === JSON.stringify(legacySuppressed);
    if (!sameList) {
      plugins.suppressedBuiltins = replaced;
      edited = true;
    }
  }
  if (!edited) return undefined;
  return { ...value, plugins };
}

/** 迁移落盘是尽力而为：失败只清理临时文件，不打断加载。 */
function persistMigration(path: string, value: JsonMap): void {
  const staging = path + ".migrate." + process.pid + "." + Date.now() + ".tmp";
  try {
    writeFileSync(staging, JSON.stringify(value, null, JSON_INDENT) + "\n", {
      encoding: UTF8,
      mode: PRIVATE_MODE,
    });
    renameSync(staging, path);
  } catch {
    try {
      unlinkSync(staging);
    } catch {
      /* 迁移落盘失败不影响本次读取结果。 */
    }
  }
}

// ---------------------------------------------------------------- 加载

export interface FileLoadOptions {
  baseDir?: string;
  configFileName?: string;
}

export interface FileLoadResult {
  config: RuntimeConfigPatch;
  diagnostics: ConfigDiagnostic[];
  loaded: boolean;
  path: string;
}

function configPathFor(filePath: string | undefined, options: FileLoadOptions): string {
  if (filePath) return resolvePath(filePath);
  const base = options.baseDir ?? join(resolveKnorviaDataRoot(), "cli");
  return join(resolvePath(base), options.configFileName ?? CONFIG_FILENAME);
}

export function loadConfigFile(filePath?: string, options: FileLoadOptions = {}): FileLoadResult {
  const path = configPathFor(filePath, options);
  if (!existsSync(path)) return { config: {}, diagnostics: [], loaded: false, path };
  try {
    const original: unknown = JSON.parse(readFileSync(path, UTF8));
    const migrated = migrateLegacyCuaIds(original);
    if (migrated !== undefined) persistMigration(path, migrated);
    const parsed = parseConfigFileToRuntimePatchWithDiagnostics(original);
    const diagnostics = parsed.diagnostics.map((diagnostic: ConfigDiagnostic) => ({
      ...diagnostic,
      filePath: diagnostic.filePath ?? path,
    }));
    return { config: parsed.config, diagnostics, loaded: true, path };
  } catch (error) {
    const diagnostic: ConfigDiagnostic = {
      code: INVALID_FILE_CODE,
      filePath: path,
      message: invalidMessage(error),
      severity: "error",
    };
    return { config: {}, diagnostics: [diagnostic], loaded: false, path };
  }
}

// ---------------------------------------------------------------- 写入

interface StateEdit {
  filePath: string;
  plugins: JsonMap;
  value: JsonMap;
}

function stateFor(filePath: string, value: JsonMap): StateEdit {
  return { filePath, plugins: asObject(value.plugins), value };
}

/** 唯一的落盘入口：把新的 plugins 段写回原文件结构。 */
async function commitPlugins(edit: StateEdit, plugins: JsonMap): Promise<void> {
  await saveJson(edit.filePath, { ...edit.value, plugins });
}

export async function patchUiLocale(input: {
  filePath: string;
  locale: UiLocale;
}): Promise<{ locale: UiLocale; path: string }> {
  const path = resolvePath(input.filePath);
  const value = await readJsonOrEmpty(path);
  const ui = { ...asObject(value.ui), locale: input.locale };
  await saveJson(path, { ...value, ui });
  return { locale: input.locale, path };
}

export async function patchPluginEnabled(input: {
  enabled: boolean;
  filePath: string;
  pluginId: string;
}): Promise<{ enabled: boolean; path: string; pluginId: string }> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const canonical = canonicalizePluginId(input.pluginId);
  const enabledPlugins = withoutAliases(
    asObject(edit.plugins.enabledPlugins),
    pluginIdAliases(canonical),
  );
  enabledPlugins[canonical] = input.enabled;
  await commitPlugins(edit, { ...edit.plugins, enabledPlugins });
  return { enabled: input.enabled, path, pluginId: input.pluginId };
}

export async function enablePluginIdsByDefault(input: {
  filePath: string;
  pluginIds: readonly string[];
}): Promise<{ enabledIds: string[]; path: string }> {
  const path = resolvePath(input.filePath);
  if (input.pluginIds.length === 0) return { enabledIds: [], path };
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const current = asObject(edit.plugins.enabledPlugins);
  const enabledIds = input.pluginIds.filter((id) => !hasOwn(current, id));
  if (enabledIds.length > 0) {
    const added: JsonMap = {};
    for (const id of enabledIds) added[id] = true;
    await commitPlugins(edit, { ...edit.plugins, enabledPlugins: { ...current, ...added } });
  }
  return { enabledIds, path };
}

export async function patchPluginOptions(input: {
  clearOptionKeys?: string[];
  filePath: string;
  options: Record<string, string | number | boolean>;
  pluginId: string;
}): Promise<{
  clearedOptionKeys: string[];
  options: Record<string, string | number | boolean>;
  path: string;
  pluginId: string;
}> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const canonical = canonicalizePluginId(input.pluginId);
  const aliases = pluginIdAliases(canonical);
  const outer = asObject(edit.plugins.options);
  const legacyAlias = aliases[1];
  const preferred = outer[canonical];
  const current = isJsonMap(preferred)
    ? preferred
    : asObject(legacyAlias === undefined ? undefined : outer[legacyAlias]);
  const cleared = new Set(input.clearOptionKeys ?? []);
  const retained: JsonMap = {};
  for (const [key, entry] of Object.entries(current)) {
    if (!cleared.has(key)) retained[key] = entry;
  }
  const next = withoutAliases(outer, aliases);
  next[canonical] = { ...retained, ...input.options };
  await commitPlugins(edit, { ...edit.plugins, options: next });
  return {
    clearedOptionKeys: input.clearOptionKeys ?? [],
    options: input.options,
    path,
    pluginId: input.pluginId,
  };
}

/** 删除插件：可选字段与配置项同时清掉，返回各自是否真的删到东西。 */
export async function deletePlugin(input: {
  filePath: string;
  pluginId: string;
}): Promise<{ path: string; pluginId: string; removedEnabled: boolean; removedOptions: boolean }> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const aliases = pluginIdAliases(input.pluginId);
  const enabled = asObject(edit.plugins.enabledPlugins);
  const options = asObject(edit.plugins.options);
  const removedEnabled = aliases.some((alias) => alias in enabled);
  const removedOptions = aliases.some((alias) => alias in options);
  if (removedEnabled || removedOptions) {
    await commitPlugins(edit, {
      ...edit.plugins,
      enabledPlugins: withoutAliases(enabled, aliases),
      options: withoutAliases(options, aliases),
    });
  }
  return { path, pluginId: input.pluginId, removedEnabled, removedOptions };
}

export async function deletePluginEnabled(input: {
  filePath: string;
  pluginId: string;
}): Promise<{ path: string; pluginId: string; removedEnabled: boolean }> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const aliases = pluginIdAliases(input.pluginId);
  const current = asObject(edit.plugins.enabledPlugins);
  const removedEnabled = aliases.some((alias) => hasOwn(current, alias));
  if (removedEnabled) {
    await commitPlugins(edit, {
      ...edit.plugins,
      enabledPlugins: withoutAliases(current, aliases),
    });
  }
  return { path, pluginId: input.pluginId, removedEnabled };
}

export async function addSuppressedBuiltin(input: {
  filePath: string;
  pluginId: string;
}): Promise<{ path: string; pluginId: string; suppressed: boolean }> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const canonical = canonicalizePluginId(input.pluginId);
  const aliases = pluginIdAliases(canonical);
  const current = onlyStrings(edit.plugins.suppressedBuiltins);
  const retained = current.filter((id) => !aliases.includes(id));
  const alreadyPresent = retained.length === current.length && current.includes(canonical);
  if (!alreadyPresent) {
    await commitPlugins(edit, { ...edit.plugins, suppressedBuiltins: [...retained, canonical] });
  }
  return { path, pluginId: input.pluginId, suppressed: true };
}

export async function removeSuppressedBuiltin(input: {
  filePath: string;
  pluginId: string;
}): Promise<{ path: string; pluginId: string; suppressed: boolean }> {
  const path = resolvePath(input.filePath);
  const edit = stateFor(path, await readJsonOrEmpty(path));
  const aliases = pluginIdAliases(input.pluginId);
  const current = onlyStrings(edit.plugins.suppressedBuiltins);
  const next = current.filter((id) => !aliases.includes(id));
  if (next.length !== current.length) {
    await commitPlugins(edit, { ...edit.plugins, suppressedBuiltins: next });
  }
  return { path, pluginId: input.pluginId, suppressed: false };
}
