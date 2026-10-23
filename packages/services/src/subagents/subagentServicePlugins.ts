// 插件 Subagent 发现：把插件目录里的 agent Markdown 投影成 AgentSummary。
//
// 三个消费面决定了这里的形状：
//   · 运行时按名字寻址 —— 规范名是 `<插件名>:<裸名>`，裸名在全局唯一且不撞内置/用户 profile 时
//     再额外展开一个裸名别名（与 CLI 侧的插件 profile 加载保持同一套命名规则）；
//   · 设置页要「一个文件一行」—— 所以别名只进 runtimeAgents，profiles 只给规范名；
//   · 模型覆盖按稳定 id `plugin:<插件 id>:<裸名小写>` 存进 agents-state.json，插件升级换了
//     版本目录后仍然命中，因此 id 一律用 createPluginAgentStateId 构造，不在这里手拼。
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS,
  KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID,
  createPluginAgentStateId,
  type AgentDiagnostic,
  type AgentSummary,
  type PluginSubagentModelSelectionOverrides,
} from "@knorvia/shared";
import { scanOfficialPluginCacheRoots } from "@knorvia/shared/node";
import { readInstalledPluginRoots } from "#src/plugins/installedPluginRoots.js";
import { parseSubagentMarkdown } from "./subagentMarkdown.js";
import { collectMarkdown, exists } from "./subagentServiceFiles.js";
import {
  resolveKnorviaStorageRoot,
  resolveUserDataRoot,
  type SubagentStorageOptions,
} from "./subagentStorage.js";

// 清单目录按识别顺序排列：本产品清单优先，其次兼容 Claude / Codex 布局。
const MANIFEST_DIRECTORIES = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"];
const MANIFEST_FILE = "plugin.json";
const CONFIG_FILE = "config.json";
const CLI_DIRECTORY = "cli";
const PLUGINS_DIRECTORY = "plugins";
const AGENTS_DIRECTORY = "agents";
const INLINE_MARKETPLACE = "inline";
const MARKDOWN_PATTERN = /\.(md|markdown)$/iu;
// 与 CLI 的清单校验一致：小写开头、只允许标识符字符，避免 id 里混进路径分隔符。
const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function diagnose(diagnostics: AgentDiagnostic[], message: string, path: string): void {
  diagnostics.push({ code: "agent_read_failed", message, path });
}

// 配置里的目录可以是 `~/...`；相对路径按进程 cwd 解析，与命令/技能发现保持一致。
function configuredPath(directory: string): string {
  const expanded = directory.startsWith("~/") ? join(homedir(), directory.slice(2)) : directory;
  if (isAbsolute(expanded)) return expanded;
  return resolve(expanded);
}

// 读不到或不是 JSON 对象时返回 undefined，由调用方决定是跳过还是留诊断。
async function readJsonRecord(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// 插件目录挂在 `<数据根>/cli/plugins`；数据根本身已经是 cli 目录时不再叠加一层。
function pluginStorageRoot(storageRoot: string): string {
  const cliRoot =
    basename(storageRoot) === CLI_DIRECTORY ? storageRoot : join(storageRoot, CLI_DIRECTORY);
  return join(cliRoot, PLUGINS_DIRECTORY);
}

// 启停/抑制/自定义目录都在 CLI 配置的 plugins 段；缺失即「全用默认值」。
function pluginSettings(config: Record<string, unknown> | undefined) {
  const plugins = isRecord(config?.plugins) ? config.plugins : {};
  const enabledPlugins: Record<string, boolean> = {};
  if (isRecord(plugins.enabledPlugins)) {
    for (const [id, enabled] of Object.entries(plugins.enabledPlugins)) {
      if (typeof enabled === "boolean") enabledPlugins[id] = enabled;
    }
  }
  const enabled = typeof plugins.enabled === "boolean" ? plugins.enabled : true;
  return {
    enabled,
    enabledPlugins,
    directories: stringList(plugins.dirs),
    suppressedBuiltins: stringList(plugins.suppressedBuiltins),
  };
}

type PluginSettings = ReturnType<typeof pluginSettings>;

// 清单只为拿到插件身份（名字 + agents 组件路径）。没有清单的候选不是插件，静默跳过；
// 有清单却读不动/名字不可用时留诊断，避免静默少一批 agent。
async function readManifest(rootPath: string, diagnostics: AgentDiagnostic[]) {
  for (const directory of MANIFEST_DIRECTORIES) {
    const manifestPath = join(rootPath, directory, MANIFEST_FILE);
    if (!(await exists(manifestPath))) continue;
    const parsed = await readJsonRecord(manifestPath);
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
    if (PLUGIN_NAME_PATTERN.test(name)) return { name, agents: parsed?.agents };
    diagnose(
      diagnostics,
      `Plugin manifest is unreadable or has no usable name: ${manifestPath}`,
      manifestPath,
    );
    return undefined;
  }
  return undefined;
}

// 清单里的 agents 是组件路径（字符串或数组）；绝对路径与越界路径一律忽略。
function declaredAgentRoots(rootPath: string, declared: unknown): string[] {
  const values = typeof declared === "string" ? [declared] : stringList(declared);
  return values.flatMap((value) => {
    if (isAbsolute(value)) return [];
    const candidate = resolve(rootPath, value);
    const distance = relative(rootPath, candidate);
    const inside =
      distance === "" || (!distance.startsWith("..") && !distance.includes(`..${sep}`));
    return inside ? [candidate] : [];
  });
}

async function pluginAgentPaths(rootPath: string, declared: unknown): Promise<string[]> {
  const locations = [...declaredAgentRoots(rootPath, declared), join(rootPath, AGENTS_DIRECTORY)];
  const files = new Set<string>();
  for (const location of locations) {
    // 声明项允许直接指向单个 Markdown 文件；目录则递归收集。
    if (MARKDOWN_PATTERN.test(location) && (await exists(location))) {
      files.add(location);
      continue;
    }
    for (const path of await collectMarkdown(location)) files.add(path);
  }
  return [...files];
}

async function readPluginAgent(
  path: string,
  diagnostics: AgentDiagnostic[],
): Promise<AgentSummary | undefined> {
  try {
    const parsed = parseSubagentMarkdown({
      content: await readFile(path, "utf-8"),
      path,
      scope: "user",
    });
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    return parsed.agent;
  } catch {
    diagnose(diagnostics, `Failed to read plugin agent Markdown: ${path}`, path);
    return undefined;
  }
}

// 候选顺序与命令/技能发现一致：显式配置目录 → 官方缓存 → 安装记录；
// 同一插件 id 先到先得，因此官方缓存里较新的版本目录会胜出。
async function pluginCandidates(storageRoot: string, settings: PluginSettings) {
  const configured = settings.directories.map((directory) => ({
    rootPath: configuredPath(directory),
    marketplace: INLINE_MARKETPLACE,
    defaultEnabled: true,
  }));
  const cached = await scanOfficialPluginCacheRoots(storageRoot);
  const official = cached.flatMap((plugin) =>
    plugin.versionRoots.map((rootPath) => ({
      rootPath,
      marketplace: KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID,
      defaultEnabled: false,
    })),
  );
  return [...configured, ...official, ...(await readInstalledPluginRoots(storageRoot))];
}

function pluginIdOf(name: string, marketplace: string): string {
  return `${name}@${marketplace}`;
}

async function discoverPluginAgents(
  storageRoot: string,
  settings: PluginSettings,
  diagnostics: AgentDiagnostic[],
) {
  const discovered: Array<{
    path: string;
    pluginId: string;
    pluginName: string;
    bareName: string;
    summary: AgentSummary;
  }> = [];
  const seenIds = new Set<string>();
  for (const candidate of await pluginCandidates(storageRoot, settings)) {
    const manifest = await readManifest(candidate.rootPath, diagnostics);
    if (!manifest) continue;
    const pluginId = pluginIdOf(manifest.name, candidate.marketplace);
    const suppressed =
      candidate.marketplace === KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID &&
      settings.suppressedBuiltins.includes(pluginId);
    if (suppressed || seenIds.has(pluginId)) continue;
    seenIds.add(pluginId);
    const defaultEnabled =
      candidate.defaultEnabled || DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(pluginId);
    if (!(settings.enabledPlugins[pluginId] ?? defaultEnabled)) continue;
    for (const path of await pluginAgentPaths(candidate.rootPath, manifest.agents)) {
      const summary = await readPluginAgent(path, diagnostics);
      if (!summary) continue;
      discovered.push({
        path,
        pluginId,
        pluginName: manifest.name,
        bareName: summary.name.trim(),
        summary,
      });
    }
  }
  return discovered.sort(
    (left, right) =>
      left.pluginName.localeCompare(right.pluginName) ||
      left.bareName.localeCompare(right.bareName),
  );
}

// 插件 md 属于插件安装目录，升级会覆写，因此只读；覆盖只写用户 state。
function projectPluginAgent(
  agent: Awaited<ReturnType<typeof discoverPluginAgents>>[number],
  name: string,
  overrides: PluginSubagentModelSelectionOverrides,
): AgentSummary {
  const override = overrides[createPluginAgentStateId(agent.pluginId, agent.bareName)];
  const declared = agent.summary.modelSelection;
  const selection = override ?? declared;
  return {
    ...agent.summary,
    id: createPluginAgentStateId(agent.pluginId, agent.bareName),
    name,
    path: agent.path,
    scope: "user",
    source: "plugin",
    enabled: true,
    readOnly: true,
    pluginId: agent.pluginId,
    pluginName: agent.pluginName,
    ...(declared ? { defaultModelSelection: declared } : {}),
    ...(selection ? { modelSelection: selection } : {}),
    ...(override ? { modelSelectionOverride: override } : {}),
  };
}

export async function discoverPlugins(
  options: SubagentStorageOptions,
  overrides: PluginSubagentModelSelectionOverrides,
  reservedNames: Iterable<string>,
  diagnostics: AgentDiagnostic[],
): Promise<{ profiles: AgentSummary[]; runtimeAgents: AgentSummary[] }> {
  const config = await readJsonRecord(
    join(resolveUserDataRoot(options), CLI_DIRECTORY, CONFIG_FILE),
  );
  const settings = pluginSettings(config);
  if (!settings.enabled) return { profiles: [], runtimeAgents: [] };

  const discovered = await discoverPluginAgents(
    pluginStorageRoot(await resolveKnorviaStorageRoot(options)),
    settings,
    diagnostics,
  );
  const reserved = new Set(reservedNames);
  const bareNameCounts = new Map<string, number>();
  for (const agent of discovered) {
    bareNameCounts.set(agent.bareName, (bareNameCounts.get(agent.bareName) ?? 0) + 1);
  }

  const profiles: AgentSummary[] = [];
  const runtimeAgents: AgentSummary[] = [];
  for (const agent of discovered) {
    const canonicalName = `${agent.pluginName}:${agent.bareName}`;
    const canonical = projectPluginAgent(agent, canonicalName, overrides);
    profiles.push(canonical);
    runtimeAgents.push(canonical);
    // 裸名别名只在全局唯一且不撞内置/用户 profile 时展开，否则运行时会调错 agent。
    if (bareNameCounts.get(agent.bareName) === 1 && !reserved.has(agent.bareName)) {
      runtimeAgents.push({ ...canonical, name: agent.bareName });
      continue;
    }
    const takenBy = reserved.has(agent.bareName)
      ? "is already taken by a built-in or user agent"
      : "is used by several plugins";
    diagnostics.push({
      code: "agent_ambiguous_name",
      message: `Plugin agent name "${agent.bareName}" ${takenBy}; call it as ${canonicalName}`,
      path: agent.path,
    });
  }
  return { profiles, runtimeAgents };
}
