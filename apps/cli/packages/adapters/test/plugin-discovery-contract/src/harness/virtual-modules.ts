// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const CONTRACTS_MODULE = String.raw`
const HookEventName = Object.freeze({
  SessionStart: "SessionStart",
  UserPromptSubmit: "UserPromptSubmit",
  PreToolUse: "PreToolUse",
  PermissionRequest: "PermissionRequest",
  PostToolUse: "PostToolUse",
  PostToolUseFailure: "PostToolUseFailure",
  Stop: "Stop",
});
const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE = "knorvia-plugins-bundled";
const KNORVIA_INLINE_PLUGIN_MARKETPLACE = "inline";
const validEvents = new Set(Object.values(HookEventName));
const hookMatcherIssues = (value) => {
  const issue = (path, message) => ({ code: "custom", message, path });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [issue([], "Hook matcher config must be an object")];
  }
  if (value.matcher !== undefined && typeof value.matcher !== "string") {
    return [issue(["matcher"], "Hook matcher must be a string")];
  }
  if (!Array.isArray(value.hooks)) {
    return [issue(["hooks"], "Hook matcher hooks must be an array")];
  }
  const issues = [];
  value.hooks.forEach((hook, index) => {
    if (hook === null || typeof hook !== "object" || Array.isArray(hook)) {
      issues.push(issue(["hooks", index], "Hook config must be an object"));
    } else if (hook.type !== "command" && hook.type !== "process") {
      issues.push(issue(["hooks", index, "type"], "Hook type must be command or process"));
    } else if (typeof hook.command !== "string") {
      issues.push(issue(["hooks", index, "command"], "Hook command must be a string"));
    } else if (hook.args !== undefined && (!Array.isArray(hook.args) || hook.args.some((v) => typeof v !== "string"))) {
      issues.push(issue(["hooks", index, "args"], "Hook args must be strings"));
    }
  });
  return issues;
};
const validateMatcher = (value) => hookMatcherIssues(value).length === 0;
const hookValidationError = (value) => {
  const issues = hookMatcherIssues(value);
  const error = new Error("Invalid hook matcher config");
  error.name = "ZodError";
  error.issues = issues;
  error.errors = issues;
  return error;
};
const HookMatcherConfigSchema = Object.freeze({
  parse(value) {
    if (!validateMatcher(value)) throw hookValidationError(value);
    return value;
  },
  safeParse(value) {
    return validateMatcher(value)
      ? { success: true, data: value }
      : { success: false, error: hookValidationError(value) };
  },
});
const isOfficialMarketplaceId = (id) => id === KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE || id.startsWith("knorvia-plugins-");
export { HookEventName, HookMatcherConfigSchema, KNORVIA_INLINE_PLUGIN_MARKETPLACE, KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE, isOfficialMarketplaceId };
`;

export const SHARED_MODULE = String.raw`
const KNORVIA_PLUGIN_ID_ENV_KEY = "KNORVIA_PLUGIN_ID";
const sanitizeKnorviaRuntimeEnv = (env) => Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === "string"));
const OFFICIAL_MCP_RESERVED_HEADER_NAMES = [
  "authorization",
  "x-bigmodel-authorization",
  "bigmodel-target-type",
  "bigmodel-organization",
  "bigmodel-project",
  "x-coding-plan-api-key",
  "mcp-session-id",
  "mcp-protocol-version",
];
const OFFICIAL_MCP_RESERVED_HEADER_SET = new Set(OFFICIAL_MCP_RESERVED_HEADER_NAMES);
const findOfficialMcpReservedHeaders = (headers) => [...new Set(
  Object.keys(headers ?? {})
    .map((key) => key.trim().toLowerCase())
    .filter((key) => OFFICIAL_MCP_RESERVED_HEADER_SET.has(key)),
)].sort();
export { KNORVIA_PLUGIN_ID_ENV_KEY, findOfficialMcpReservedHeaders, sanitizeKnorviaRuntimeEnv };
`;

const PORT_ACCESS = String.raw`
const state = () => {
  const value = globalThis[Symbol.for("knorvia.pluginDiscoveryTestPort.v1")];
  if (!value) throw new Error("Plugin-discovery test port state is not installed");
  return value;
};
const call = (name, ...args) => state().calls.push({ name, args });
`;

export const MARKETPLACE_MODULE = String.raw`
${PORT_ACCESS}
import { join, resolve } from "node:path";
const unsupported = (name) => async (...args) => { call(name, ...args); throw new Error("Unconfigured retained marketplace port: " + name); };
export const listInstalledPluginRecords = (storageRoot) => { call("listInstalledPluginRecords", storageRoot); return state().installedRecords; };
export const resolveInstalledPluginRoot = (storageRoot, record) => {
  call("resolveInstalledPluginRoot", storageRoot, record);
  return state().resolvedInstalledRoots.get(record.id) ?? resolve(storageRoot, record.installPath);
};
export const getPluginDataDir = (storageRoot, pluginId) => {
  call("getPluginDataDir", storageRoot, pluginId);
  return state().dataDirByPluginId.get(pluginId) ?? join(storageRoot, "data", pluginId.replace(/[^A-Za-z0-9_.@-]/g, "-"));
};
export const loadKnownMarketplacesSync = (storageRoot) => { call("loadKnownMarketplacesSync", storageRoot); return []; };
export const loadMarketplaceManifestSync = (storageRoot, marketplace) => { call("loadMarketplaceManifestSync", storageRoot, marketplace); return null; };
export const ensureDefaultPluginMarketplaces = (storageRoot) => { call("ensureDefaultPluginMarketplaces", storageRoot); return []; };
export const parseMarketplaceSourceInput = unsupported("parseMarketplaceSourceInput");
export const ensureMarketplaceManifestAvailable = unsupported("ensureMarketplaceManifestAvailable");
export const addMarketplace = unsupported("addMarketplace");
export const updateMarketplace = unsupported("updateMarketplace");
export const removeMarketplace = unsupported("removeMarketplace");
export const installMarketplacePlugin = unsupported("installMarketplacePlugin");
export const uninstallMarketplacePlugin = unsupported("uninstallMarketplacePlugin");
export const validateMarketplacePlugin = unsupported("validateMarketplacePlugin");
export const describeMarketplacePlugin = unsupported("describeMarketplacePlugin");
export const validateMarketplaceSource = unsupported("validateMarketplaceSource");
export const validateLocalPluginPath = unsupported("validateLocalPluginPath");
export const readPluginSourceSha = () => undefined;
export const readPluginSourceIdentityPin = () => undefined;
export const parseEntryStoreListing = () => undefined;
export const normalizeAuthorValue = () => undefined;
`;

export const OFFICIAL_MARKETPLACE_MODULE = String.raw`
${PORT_ACCESS}
export const loadBundledOfficialPluginRootsSync = (storageRoot) => {
  call("loadBundledOfficialPluginRootsSync", storageRoot);
  const roots = state().bundledRoots;
  return roots === undefined ? undefined : [...roots];
};
export const writeBundledOfficialMarketplacePartitionSync = (input) => { call("writeBundledOfficialMarketplacePartitionSync", input); return input.manifest; };
export const writeCdnOfficialMarketplacePartitionSync = (input) => { call("writeCdnOfficialMarketplacePartitionSync", input); return input.manifest; };
`;

export const SKILL_SCAN_MODULE = String.raw`
${PORT_ACCESS}
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
export const scanSkillFilesUnderRootSync = (rootPath) => {
  call("scanSkillFilesUnderRootSync", rootPath);
  const fault = state().scanFaults.get(resolve(rootPath));
  if (fault) throw fault;
  const found = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile() && entry.name === "SKILL.md") found.set(realpathSync(path), path);
    }
  };
  visit(rootPath);
  return [...found.values()].sort();
};
`;

export const HELPERS_MODULE = String.raw`
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
export const resolveInside = (rootPath, rawPath) => {
  const root = resolve(rootPath);
  const target = resolve(root, rawPath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)) ? target : null;
};
export const sanitizePluginId = (pluginId) => pluginId.replace(/[^A-Za-z0-9_.@-]/g, "-");
export const parsePathList = (value) => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
export const isPluginOptionValue = (value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean";
export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const directoryExists = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };
export const isMissingPath = (path) => !existsSync(path);
export const fileExists = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
export const isNotFoundError = (error) => error?.code === "ENOENT" || error?.code === "ENOTDIR";
export const cleanupPluginSourceBestEffort = async (cleanup) => { try { await cleanup?.(); return undefined; } catch (error) { return error; } };
export const appendPluginSourceCleanupError = (primaryError) => primaryError;
export const throwIfAborted = (options) => { if (options?.signal?.aborted) throw options.signal.reason ?? new Error("Aborted"); };
`;

export const SOURCE_ERRORS_MODULE = String.raw`
export const createGitUnavailableError = (source, reason) => Object.assign(new Error(reason ?? "Git unavailable: " + source), { code: "plugin_git_unavailable" });
export const createArchiveFetchError = (source, cause) => Object.assign(new Error("Archive fetch failed: " + source, { cause }), { code: "plugin_archive_fetch_failed" });
export const getPluginSourceDiagnosticCode = (error) => error?.code;
export const isCommandUnavailableError = (error) => error?.code === "ENOENT";
`;

export const VERSION_COMPARE_MODULE = String.raw`
const comparePluginVersions = ({ installed, latest }) => {
  if (installed === undefined || latest === undefined || installed === latest) return "none";
  return "version-changed";
};
const comparePluginUpdate = ({ installedVersion, installedSha, latestVersion, latestSha }) => latestVersion !== undefined
  ? comparePluginVersions({ installed: installedVersion, latest: latestVersion })
  : installedSha !== undefined && latestSha !== undefined && installedSha !== latestSha ? "version-changed" : "none";
export { comparePluginUpdate, comparePluginVersions };
`;

export const ATOMIC_DIRECTORY_MODULE = String.raw`
export const recoverAtomicTargetSync = (targetPath) => targetPath;
export const activateDirectoryAtomically = async () => { throw new Error("Atomic-directory product behavior is outside discovery tests"); };
export const writeFileAtomically = async () => { throw new Error("Atomic-directory product behavior is outside discovery tests"); };
`;

export const ZIP_SOURCE_MODULE = String.raw`
export class PluginZipDownloadError extends Error { constructor(message, url, status) { super(message); this.url = url; this.status = status; } }
export const resolveZipPluginSource = async () => { throw new Error("ZIP product behavior is outside discovery tests"); };
export const resolveHttpZipSource = resolveZipPluginSource;
export const readZipPluginSourceSha256 = () => undefined;
export const isZipPluginUrlSource = () => false;
`;

export const GITHUB_ARCHIVE_MODULE = String.raw`
export const resolveGitHubArchiveSource = async () => { throw new Error("GitHub archive product behavior is outside discovery tests"); };
export const shouldFallbackGitHubArchiveToGit = () => false;
`;

export const HTTP_MODULE = String.raw`
export const createNodeWebFetchHttpClientAdapter = () => { throw new Error("Network is forbidden in discovery behavior tests"); };
`;

export const NETWORK_ENV_MODULE = String.raw`
export const applyNetworkEgressEnv = (env) => ({ ...env });
`;
