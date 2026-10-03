import { open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import ignoreFactory, { type Ignore } from "ignore";

import type { ServiceLogger } from "../logger/serviceLogger.js";

export const WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME = ".knorviaignore";

type Logger = Pick<ServiceLogger, "info" | "warn">;
type IgnoreSource =
  | "file"
  | "created-from-gitignore"
  | "created-from-template"
  | "fallback-gitignore"
  | "fallback-builtin";
type SearchIgnoreRules = { matcher: Ignore; source: IgnoreSource };
type IgnoreSections = {
  gitignoreSection: string;
  defaultsSection: string;
  customSection: string;
};

const BUILTIN_IGNORE_LINES = [
  ".git/",
  ".hg/",
  ".svn/",
  "node_modules/",
  "bower_components/",
  "jspm_packages/",
  "__pycache__/",
  "site-packages/",
  "venv/",
  "coverage/",
  "htmlcov/",
  "lcov-report/",
  "cmakefiles/",
  "cmake-build-*/",
  "bazel-*/",
  "pods/",
  "deriveddata/",
  "storybook-static/",
  "playwright-report/",
  "test-results/",
  "allure-results/",
  "allure-report/",
  "cdk.out/",
  "*.egg-info/",
  "*.dist-info/",
  "eggs/",
  "pip-wheel-metadata/",
  "wheels/",
];
const TEMPLATE_HEADER = [
  "# Knorvia Studio 工作区文件搜索忽略规则（.knorviaignore）",
  "# 语法与 .gitignore 一致，只影响 Knorvia Studio 的 @ 文件候选 / Command Center / 文件树搜索，",
  "# 不影响文件树浏览、上传或 Agent 文件访问。",
  "# 修改 .gitignore 不会自动同步到本文件；可在设置页「从 .gitignore 同步」。",
  "",
];
const WORKSPACE_FILE_SEARCH_IGNORE_SYNC_MARKER =
  "# ===== ↑ 以上同步自 .gitignore（「从 .gitignore 同步」只重写以上部分）=====";
const WORKSPACE_FILE_SEARCH_IGNORE_DEFAULTS_MARKER =
  "# ----- ↑ 以上为 Knorvia Studio 默认排除规则（自定义规则请写在本行下方，不会被同步/恢复改动）-----";
const CUSTOM_SECTION_HINT = "# 自定义规则写在下方（本行提示可删除）";

function matcherFor(content: string): Ignore {
  const createIgnore = ignoreFactory as unknown as () => Ignore;
  return createIgnore().add(content);
}

async function optionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: unknown } | null | undefined)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function saveAtomically(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  const temporaryPath = resolve(
    dir,
    `.${basename(path)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o644);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function builtinDefaults(gitignoreContent: string | null): string {
  if (gitignoreContent === null) return BUILTIN_IGNORE_LINES.join("\n");

  const declared = new Set<string>();
  for (const rawLine of gitignoreContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    declared.add(line);
    declared.add(line.replace(/\/$/, ""));
  }
  return BUILTIN_IGNORE_LINES.filter(
    (line) => !declared.has(line) && !declared.has(line.replace(/\/$/, "")),
  ).join("\n");
}

function gitignoreSection(content: string | null): string {
  if (content !== null && content.trim().length > 0) {
    return content.endsWith("\n") ? content : `${content}\n`;
  }
  return `${TEMPLATE_HEADER.join("\n")}\n`;
}

function initialTemplate(gitignoreContent: string | null): string {
  return [
    gitignoreSection(gitignoreContent),
    WORKSPACE_FILE_SEARCH_IGNORE_SYNC_MARKER,
    builtinDefaults(gitignoreContent),
    WORKSPACE_FILE_SEARCH_IGNORE_DEFAULTS_MARKER,
    CUSTOM_SECTION_HINT,
    "",
  ].join("\n");
}

function splitSections(content: string): IgnoreSections | null {
  const lines = content.split(/\r?\n/);
  const syncIndex = lines.findIndex(
    (line) => line.trim() === WORKSPACE_FILE_SEARCH_IGNORE_SYNC_MARKER,
  );
  const defaultsIndex = lines.findIndex(
    (line) => line.trim() === WORKSPACE_FILE_SEARCH_IGNORE_DEFAULTS_MARKER,
  );
  if (syncIndex < 0 || defaultsIndex <= syncIndex) return null;
  return {
    gitignoreSection: lines.slice(0, syncIndex).join("\n"),
    defaultsSection: lines
      .slice(syncIndex + 1, defaultsIndex)
      .join("\n")
      .trim(),
    customSection: lines
      .slice(defaultsIndex + 1)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}

function transformSections(
  sections: IgnoreSections,
  gitignoreContent: string | null,
  sync: boolean,
): string {
  return [
    sync ? gitignoreSection(gitignoreContent) : sections.gitignoreSection,
    WORKSPACE_FILE_SEARCH_IGNORE_SYNC_MARKER,
    sync ? sections.defaultsSection : builtinDefaults(sections.gitignoreSection),
    WORKSPACE_FILE_SEARCH_IGNORE_DEFAULTS_MARKER,
    sections.customSection,
  ]
    .join("\n")
    .replace(/\n+$/, "\n");
}

async function fallbackAfterReadFailure(
  rootPath: string,
  reason: string,
  error: unknown,
  logger?: Logger,
): Promise<SearchIgnoreRules> {
  const gitignoreContent = await optionalText(resolve(rootPath, ".gitignore")).catch(() => null);
  if (gitignoreContent !== null) {
    logger?.warn(
      undefined,
      `[workspace-file-ignore] ${reason}，降级为运行时使用 .gitignore 规则`,
      error,
    );
    return { matcher: matcherFor(gitignoreContent), source: "fallback-gitignore" };
  }
  logger?.warn(undefined, `[workspace-file-ignore] ${reason}，降级为内置默认忽略规则`, error);
  return { matcher: matcherFor(initialTemplate(null)), source: "fallback-builtin" };
}

export async function loadWorkspaceFileSearchIgnoreRules(
  rootPath: string,
  logger?: Logger,
): Promise<SearchIgnoreRules> {
  const ignorePath = resolve(rootPath, WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME);
  let existingContent: string | null;
  try {
    existingContent = await optionalText(ignorePath);
  } catch (error) {
    return fallbackAfterReadFailure(rootPath, "读取 .knorviaignore 失败", error, logger);
  }
  if (existingContent !== null) {
    return { matcher: matcherFor(existingContent), source: "file" };
  }

  const gitignoreContent = await optionalText(resolve(rootPath, ".gitignore")).catch(() => null);
  const content = initialTemplate(gitignoreContent);
  try {
    await saveAtomically(ignorePath, content);
  } catch (error) {
    logger?.warn(
      undefined,
      `[workspace-file-ignore] 自动创建 .knorviaignore 失败，降级为运行时使用${gitignoreContent !== null ? ".gitignore" : "内置默认"}规则`,
      error,
    );
    return {
      matcher: matcherFor(content),
      source: gitignoreContent !== null ? "fallback-gitignore" : "fallback-builtin",
    };
  }
  logger?.info(
    undefined,
    `[workspace-file-ignore] 已自动创建 .knorviaignore（来源：${gitignoreContent !== null ? ".gitignore 拷贝" : "默认模板"}）`,
  );
  return {
    matcher: matcherFor(content),
    source: gitignoreContent !== null ? "created-from-gitignore" : "created-from-template",
  };
}

export function isWorkspaceFileSearchPathIgnored(
  rules: SearchIgnoreRules,
  relativePath: string,
  type: "file" | "directory",
): boolean {
  return rules.matcher.ignores(type === "directory" ? `${relativePath}/` : relativePath);
}

export async function readWorkspaceFileSearchIgnore(
  rootPath: string,
): Promise<{ content: string; source: "file" | "template" }> {
  const existingContent = await optionalText(
    resolve(rootPath, WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME),
  );
  if (existingContent !== null) return { content: existingContent, source: "file" };
  const gitignoreContent = await optionalText(resolve(rootPath, ".gitignore")).catch(() => null);
  return { content: initialTemplate(gitignoreContent), source: "template" };
}

export async function transformWorkspaceFileSearchIgnore(
  rootPath: string,
  transform: "sync-gitignore" | "reset-defaults",
): Promise<{ content: string }> {
  const existingContent = await optionalText(
    resolve(rootPath, WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME),
  ).catch(() => null);
  const gitignoreContent = await optionalText(resolve(rootPath, ".gitignore")).catch(() => null);
  const currentContent = existingContent ?? initialTemplate(gitignoreContent);
  const sections = splitSections(currentContent);
  return {
    content: sections
      ? transformSections(sections, gitignoreContent, transform === "sync-gitignore")
      : initialTemplate(gitignoreContent),
  };
}

export async function writeWorkspaceFileSearchIgnore(
  rootPath: string,
  content: string,
): Promise<void> {
  await saveAtomically(resolve(rootPath, WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME), content);
}
