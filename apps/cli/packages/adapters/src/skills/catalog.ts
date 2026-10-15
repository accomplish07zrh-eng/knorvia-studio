// SPDX-License-Identifier: Apache-2.0
// 技能目录编排：按根优先级扫描 → 解析元数据 → 屏蔽禁用路径 → 去重排序。
import { open, readFile, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  SkillContent,
  SkillDiagnostic,
  SkillLoadOutcome,
  SkillMetadata,
  SkillOperationOptions,
  SkillRoot,
} from "@knorvia/contracts";
import type { SkillRootResolutionOptions } from "./roots.js";
import { skillBody } from "./frontmatter.js";
import { parseSkillMetadata, readSkillSource, type LabelLookup } from "./metadata.js";
import { resolvePluginName } from "./plugin-name.js";
import { resolveDefaultSkillRoots } from "./roots.js";
import { scanSkillFilesUnderRoot } from "./scan.js";

const DEFAULT_READ_LIMIT = 100000;
const SCAN_FAILED = "skill_scan_failed";
const SCAN_FALLBACK = "Failed to scan skill root: ";
const CANCELLED = "Skill operation cancelled";
const NOT_FOUND = "Skill not found: ";

export interface DiscoveryRequest {
  roots?: SkillRoot[];
  workingDirectory: string;
}

export interface DiscoveryContext {
  blocked: ReadonlySet<string>;
  options?: SkillOperationOptions;
  pluginNameCache: Map<string, Promise<string | undefined>>;
  rootOptions: SkillRootResolutionOptions;
}

function assertActive(options?: SkillOperationOptions): void {
  if (options?.signal?.aborted) throw new Error(CANCELLED);
}

function warnScan(diagnostics: SkillDiagnostic[], rootPath: string, error: unknown): void {
  const message = error instanceof Error ? error.message : SCAN_FALLBACK + rootPath;
  diagnostics.push({ code: SCAN_FAILED, message, path: rootPath, severity: "warning" });
}

/** 插件来源才做别名解析：先查缓存，命中清单后生成限定名。 */
async function labelFor(
  root: SkillRoot,
  skillName: string,
  cache: Map<string, Promise<string | undefined>>,
): Promise<LabelLookup> {
  if (root.source !== "plugin") return {};
  const key = resolve(root.path);
  const cached = cache.get(key);
  const pending = cached ?? resolvePluginName(key);
  if (cached === undefined) cache.set(key, pending);
  const pluginName = await pending;
  if (pluginName === undefined) return {};
  const labels = { pluginName, qualifiedName: pluginName + ":" + skillName } as LabelLookup;
  if (root.pluginId !== undefined) labels.pluginId = root.pluginId;
  return labels;
}

/** 单条技能：读文件 → 解析元数据 → 合并插件别名 → 应用禁用名单（含 realpath 别名）。 */
async function admitSkill(candidate: {
  context: DiscoveryContext;
  diagnostics: SkillDiagnostic[];
  path: string;
  root: SkillRoot;
}): Promise<SkillMetadata | null> {
  const text = await readSkillSource({ diagnostics: candidate.diagnostics, path: candidate.path });
  if (text === undefined) return null;
  const metadata = await parseSkillMetadata({
    diagnostics: candidate.diagnostics,
    labels: {},
    path: candidate.path,
    root: candidate.root,
    text,
  });
  if (metadata === null) return null;

  const labels = await labelFor(candidate.root, metadata.name, candidate.context.pluginNameCache);
  if (labels.pluginId !== undefined) metadata.pluginId = labels.pluginId;
  if (labels.pluginName !== undefined) metadata.pluginName = labels.pluginName;
  if (labels.qualifiedName !== undefined) metadata.qualifiedName = labels.qualifiedName;

  const resolved = resolve(metadata.path);
  if (candidate.context.blocked.has(resolved)) return null;
  const canonical = await realpath(resolved).catch(() => resolved);
  return candidate.context.blocked.has(canonical) ? null : metadata;
}

export async function discoverSkillCatalog(
  request: DiscoveryRequest,
  context: DiscoveryContext,
): Promise<SkillLoadOutcome> {
  assertActive(context.options);
  const cwd = resolve(request.workingDirectory);
  const roots = request.roots ?? (await resolveDefaultSkillRoots(cwd, context.rootOptions));
  const diagnostics: SkillDiagnostic[] = [];
  const chosen = new Map<string, SkillMetadata>();
  let totalDiscovered = 0;

  for (const root of roots.toSorted((left, right) => left.priority - right.priority)) {
    assertActive(context.options);
    const paths = await scanSkillFilesUnderRoot(root.path, {
      followSymbolicLinks: root.source !== "plugin",
    }).catch((error: unknown) => {
      warnScan(diagnostics, root.path, error);
      return [] as string[];
    });
    for (const path of paths) {
      assertActive(context.options);
      const metadata = await admitSkill({ context, diagnostics, path, root });
      if (metadata === null) continue;
      totalDiscovered += 1;
      if (!chosen.has(metadata.path)) chosen.set(metadata.path, metadata);
    }
  }

  const outcome = {} as SkillLoadOutcome;
  outcome.skills = Array.from(chosen.values()).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
  outcome.diagnostics = diagnostics;
  outcome.totalDiscovered = totalDiscovered;
  return outcome;
}

async function readPrefix(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const allocated = Buffer.alloc(Math.max(0, maxBytes));
    const { bytesRead } = await handle.read(allocated, 0, allocated.byteLength, 0);
    return allocated.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function loadSkillContent(
  metadata: SkillMetadata,
  requestedName: string,
  maxBytes: number | undefined,
): Promise<SkillContent> {
  if (metadata === undefined) throw new Error(NOT_FOUND + requestedName);
  const limit = maxBytes ?? DEFAULT_READ_LIMIT;
  const info = await stat(metadata.path);
  const truncated = info.size > limit;
  const bytes = truncated ? await readPrefix(metadata.path, limit) : await readFile(metadata.path);
  const content = {} as SkillContent;
  content.metadata = metadata;
  content.content = skillBody(bytes.toString("utf8")).trim();
  content.baseDirectory = metadata.directory;
  content.bytesRead = bytes.byteLength;
  content.sizeBytes = info.size;
  content.truncated = truncated;
  return content;
}
