// SPDX-License-Identifier: Apache-2.0
// 命令元数据：名称规范化与校验、frontmatter 字段抽取、诊断收集。
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
const KNOWN_KEYS: readonly string[] = [
  "allowed-tools",
  "argument-hint",
  "description",
  "disable-noninteractive",
  "model",
  "skills",
];
const READ_FAILED = "custom_command_read_failed";
const INVALID_NAME = "custom_command_invalid_name";
const INVALID_FRONTMATTER = "custom_command_invalid_frontmatter";
const UNKNOWN_FRONTMATTER = "custom_command_unknown_frontmatter";
const READ_FALLBACK = "Failed to read custom command: ";
const DESCRIPTION_REQUIRED = "Custom command must include a description or non-empty body: ";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** 文件名 → 命令名：去扩展名、目录分隔符变 `:`、去前导 `/`、小写。 */
export function commandName(rootPath: string, path: string): string {
  const stem = relative(rootPath, path).slice(0, -3);
  return stem
    .split(/[\\/]+/u)
    .join(":")
    .trim()
    .replace(/^\/+/u, "")
    .toLowerCase();
}

function headerText(content: string): string | undefined {
  const section = frontmatterLines(content, true);
  return section?.lines.slice(1, section.end).join("\n");
}

/** 元数据构造：字段一次性赋值，调用方只读。 */
function buildMetadata(
  name: string,
  path: string,
  root: CustomCommandRoot,
  fields: { description: string; header: ReturnType<typeof parseHeader> },
): CustomCommandMetadata {
  const metadata = { name } as CustomCommandMetadata;
  metadata.path = path;
  metadata.rootPath = root.path;
  metadata.scope = root.scope;
  metadata.source = root.source;
  metadata.plugin = root.plugin;
  metadata.description = fields.description.slice(0, DESCRIPTION_LIMIT);
  metadata.argumentHint = scalar(fields.header.values["argument-hint"]);
  metadata.model = scalar(fields.header.values.model);
  metadata.allowedTools = list(fields.header.values["allowed-tools"]);
  metadata.skills = list(fields.header.values.skills);
  metadata.disableNonInteractive = enabled(fields.header.values["disable-noninteractive"]);
  metadata.frontmatterKeys = fields.header.keys;
  return metadata;
}

export async function readMetadata(
  path: string,
  root: CustomCommandRoot,
  diagnostics: CustomCommandDiagnostic[],
): Promise<CustomCommandMetadata | null> {
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (!isMissing(error)) {
      warnInvalid(diagnostics, {
        code: READ_FAILED,
        message: error instanceof Error ? error.message : READ_FALLBACK + path,
        path,
      });
    }
    return undefined;
  });
  if (content === undefined) return null;

  const name = commandName(root.path, path);
  if (!NAME_PATTERN.test(name)) {
    failInvalid(diagnostics, {
      code: INVALID_NAME,
      commandName: name,
      message: "Invalid custom command name: " + name,
      path,
    });
    return null;
  }

  const header = headerText(content);
  const parsed =
    header === undefined
      ? { keys: [] as string[], values: {} as Record<string, string> }
      : parseHeader(header, (lineNumber) => {
          warnInvalid(diagnostics, {
            code: INVALID_FRONTMATTER,
            message: "Invalid frontmatter line " + lineNumber + " in " + basename(path),
            path,
          });
        });

  const description =
    scalar(parsed.values.description) ?? bodyDescription(removeFrontmatter(content).trim());
  if (!description) {
    failInvalid(diagnostics, {
      code: INVALID_FRONTMATTER,
      commandName: name,
      message: DESCRIPTION_REQUIRED + path,
      path,
    });
    return null;
  }
  for (const key of parsed.keys) {
    if (KNOWN_KEYS.includes(key)) continue;
    warnInvalid(diagnostics, {
      code: UNKNOWN_FRONTMATTER,
      commandName: name,
      message: "Unknown custom command frontmatter key: " + key,
      path,
    });
  }
  return buildMetadata(name, path, root, { description, header: parsed });
}
