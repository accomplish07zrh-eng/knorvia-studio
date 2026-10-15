// SPDX-License-Identifier: Apache-2.0
// 技能元数据：前置校验（名称/描述/长度）→ 解析 frontmatter → 生成 SkillMetadata。
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { SkillDiagnostic, SkillMetadata, SkillRoot } from "@knorvia/contracts";
import { failSkill, warnSkill } from "./diagnostics.js";
import { headerFields, plainValue, readFrontmatter } from "./frontmatter.js";

/** frontmatter 里被认可的键；其余键会让技能失去「可自动加载」资格。 */
const SUPPORTED_KEYS: ReadonlySet<string> = new Set(
  "name description when_to_use license metadata".split(" "),
);
const DESCRIPTION_MAX_CHARS = 1024;
const READ_FALLBACK = "Failed to read skill: ";

/** ENOENT 判定写成单行：文件不存在是可预期结果，不是错误。 */
function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

export type LabelLookup = { pluginId?: string; pluginName?: string; qualifiedName?: string };

interface Fields {
  keys: string[];
  values: Record<string, string>;
}

interface SourceInput {
  diagnostics: SkillDiagnostic[];
  path: string;
}

interface NameInput extends SourceInput {
  fields: Fields;
  present: boolean;
}

interface DescriptionInput extends NameInput {
  name: string;
}

/** 读技能文件：ENOENT 视为「该技能不存在」，其余读取错误记 warning。 */
export async function readSkillSource(input: SourceInput): Promise<string | undefined> {
  const text = await readFile(input.path, "utf8").catch((error: unknown) => {
    if (!isMissing(error)) {
      const detail = error instanceof Error ? error.message : READ_FALLBACK + input.path;
      warnSkill(input.diagnostics, "skill_read_failed", input.path, detail);
    }
    return undefined;
  });
  return text;
}

/** 名称：显式 `name` 优先；无 frontmatter 时退回目录名；两者都缺则报错。 */
function resolveName(input: NameInput): string | undefined {
  const declared = plainValue(input.fields.values.name);
  if (declared !== undefined) return declared;
  if (!input.present) return basename(dirname(input.path));
  failSkill(
    input.diagnostics,
    "skill_missing_name",
    input.path,
    "Skill frontmatter must include a name: " + input.path,
  );
  return;
}

/** 描述：显式 `description` 优先；无 frontmatter 时允许空串；超长或缺失则报错。 */
function resolveDescription(input: DescriptionInput): string | undefined {
  const declared = plainValue(input.fields.values.description);
  if (declared === undefined && input.present) {
    const message = "Skill frontmatter must include a description: " + input.path;
    failSkill(input.diagnostics, "skill_missing_description", input.path, message, input.name);
    return;
  }
  if (declared === undefined) return "";
  if (declared.length <= DESCRIPTION_MAX_CHARS) return declared;
  failSkill(
    input.diagnostics,
    "skill_description_too_long",
    input.path,
    "Skill description is too long: " + input.name,
    input.name,
  );
  return;
}

/** 元数据组装：字段用赋值写入，别名由调用方查好后合入。 */
export async function parseSkillMetadata(input: {
  diagnostics: SkillDiagnostic[];
  labels: LabelLookup;
  path: string;
  root: SkillRoot;
  text: string;
}): Promise<SkillMetadata | null> {
  const section = readFrontmatter(input.text);
  const fields: Fields =
    section.present && section.header !== undefined
      ? headerFields(section.header, input.path, input.diagnostics)
      : { keys: [], values: {} };

  const name = resolveName({
    diagnostics: input.diagnostics,
    fields,
    path: input.path,
    present: section.present,
  });
  if (name === undefined) return null;
  const description = resolveDescription({
    diagnostics: input.diagnostics,
    fields,
    name,
    path: input.path,
    present: section.present,
  });
  if (description === undefined) return null;

  const metadata = { name, description } as SkillMetadata;
  metadata.whenToUse = plainValue(fields.values.when_to_use);
  if (input.labels.pluginId !== undefined) metadata.pluginId = input.labels.pluginId;
  if (input.labels.pluginName !== undefined) metadata.pluginName = input.labels.pluginName;
  if (input.labels.qualifiedName !== undefined) metadata.qualifiedName = input.labels.qualifiedName;
  metadata.path = input.path;
  metadata.directory = dirname(input.path);
  metadata.rootPath = input.root.path;
  metadata.scope = input.root.scope;
  metadata.source = input.root.source;
  metadata.safeToAutoLoad = fields.keys.every((key) => SUPPORTED_KEYS.has(key));
  metadata.frontmatterKeys = fields.keys;
  metadata.policy = { allowImplicitInvocation: true };
  return metadata;
}
