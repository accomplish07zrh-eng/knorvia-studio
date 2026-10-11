// SPDX-License-Identifier: Apache-2.0
// 命令元数据：名称校验、头部字段解析、元数据组装与诊断收集。
import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import type {
  CustomCommandDiagnostic,
  CustomCommandMetadata,
  CustomCommandRoot,
} from "@knorvia/contracts";
import { failInvalid, warnInvalid } from "./diagnostics.js";
import {
  bodyDescription,
  DESCRIPTION_LIMIT,
  enabled,
  frontmatterLines,
  list,
  parseHeader,
  removeFrontmatter,
  scalar,
} from "./frontmatter.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,63}$/u;
const KNOWN_KEYS: ReadonlySet<string> = new Set(
  "allowed-tools argument-hint description disable-noninteractive model skills".split(" "),
);
const READ_FAILED = "custom_command_read_failed";
const INVALID_NAME = "custom_command_invalid_name";
const INVALID_FRONTMATTER = "custom_command_invalid_frontmatter";
const UNKNOWN_FRONTMATTER = "custom_command_unknown_frontmatter";
const READ_FALLBACK = "Failed to read custom command: ";
const DESCRIPTION_REQUIRED = "Custom command must include a description or non-empty body: ";

interface HeaderFields {
  keys: string[];
  values: Record<string, string>;
}

interface NameInput {
  diagnostics: CustomCommandDiagnostic[];
  name: string;
  path: string;
}

interface FieldsInput {
  content: string;
  diagnostics: CustomCommandDiagnostic[];
  path: string;
}

interface DescriptionInput extends FieldsInput {
  fields: HeaderFields;
  name: string;
}

const EMPTY_FIELDS: HeaderFields = { keys: [], values: {} };

function isMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "ENOENT";
}

/** 文件名 → 命令名：去扩展名、目录分隔符变 `:`、去前导 `/`、小写。 */
export function commandName(rootPath: string, path: string): string {
  const segments = relative(rootPath, path)
    .slice(0, -3)
    .split(/[\\/]+/u);
  const joined = segments.join(":").trim();
  return (joined.startsWith("/") ? joined.replace(/^\/+/u, "") : joined).toLowerCase();
}

/** 头部文本（不含两行围栏）；没有合法围栏时返回 undefined。 */
function headerOf(content: string): string | undefined {
  const section = frontmatterLines(content, true);
  if (section === undefined) return undefined;
  return section.lines.slice(1, section.end).join("\n");
}

/** 名称合法性：非法时记 error 并返回 false。 */
function validateName(input: NameInput): boolean {
  if (NAME_PATTERN.test(input.name)) return true;
  failInvalid(
    input.diagnostics,
    INVALID_NAME,
    input.path,
    "Invalid custom command name: " + input.name,
    input.name,
  );
  return false;
}

/** 头部字段：没有围栏时返回空表；缺冒号的行按行号记 warning。 */
function parseFields(input: FieldsInput): HeaderFields {
  const header = headerOf(input.content);
  if (header === undefined) return EMPTY_FIELDS;
  return parseHeader(header, (lineNumber) => {
    warnInvalid(
      input.diagnostics,
      INVALID_FRONTMATTER,
      input.path,
      "Invalid frontmatter line " + lineNumber + " in " + basename(input.path),
    );
  });
}

/** 描述：显式 `description` 优先，其次正文首个非空行；两者都空时记 error。 */
function resolveDescription(input: DescriptionInput): string | undefined {
  const explicit = scalar(input.fields.values.description);
  const description = explicit ?? bodyDescription(removeFrontmatter(input.content).trim());
  if (description.length > 0) return description;
  failInvalid(
    input.diagnostics,
    INVALID_FRONTMATTER,
    input.path,
    DESCRIPTION_REQUIRED + input.path,
    input.name,
  );
  return undefined;
}

function reportUnknownKeys(input: DescriptionInput): void {
  for (const key of input.fields.keys) {
    if (KNOWN_KEYS.has(key)) continue;
    warnInvalid(
      input.diagnostics,
      UNKNOWN_FRONTMATTER,
      input.path,
      "Unknown custom command frontmatter key: " + key,
      input.name,
    );
  }
}

/** 元数据构造：字段一次性赋值，调用方只读。 */
function buildMetadata(
  name: string,
  path: string,
  root: CustomCommandRoot,
  description: string,
  fields: HeaderFields,
): CustomCommandMetadata {
  const metadata = { name } as CustomCommandMetadata;
  metadata.path = path;
  metadata.rootPath = root.path;
  metadata.scope = root.scope;
  metadata.source = root.source;
  metadata.plugin = root.plugin;
  metadata.description = description.slice(0, DESCRIPTION_LIMIT);
  metadata.argumentHint = scalar(fields.values["argument-hint"]);
  metadata.model = scalar(fields.values.model);
  metadata.allowedTools = list(fields.values["allowed-tools"]);
  metadata.skills = list(fields.values.skills);
  metadata.disableNonInteractive = enabled(fields.values["disable-noninteractive"]);
  metadata.frontmatterKeys = fields.keys;
  return metadata;
}

export async function readMetadata(
  path: string,
  root: CustomCommandRoot,
  diagnostics: CustomCommandDiagnostic[],
): Promise<CustomCommandMetadata | null> {
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (!isMissing(error)) {
      warnInvalid(
        diagnostics,
        READ_FAILED,
        path,
        error instanceof Error ? error.message : READ_FALLBACK + path,
      );
    }
    return undefined;
  });
  if (content === undefined) return null;

  const name = commandName(root.path, path);
  if (!validateName({ diagnostics, name, path })) return null;
  const fields = parseFields({ content, diagnostics, path });
  const description = resolveDescription({ content, diagnostics, fields, name, path });
  if (description === undefined) return null;
  reportUnknownKeys({ content, diagnostics, fields, name, path });
  return buildMetadata(name, path, root, description, fields);
}
