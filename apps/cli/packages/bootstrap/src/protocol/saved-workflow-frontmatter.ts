// SPDX-License-Identifier: Apache-2.0
// Saved workflow 的 frontmatter 解析 / 序列化（从 core 的
// tool/handlers/saved-workflows/frontmatter.ts 内联）。
//
// kernel-switch 前置：唯一的新引擎消费者是 protocol/saved-workflows.ts。
// 这段依赖 yaml + @knorvia/contracts，而 bootstrap 已有 contracts、需要补 yaml 依赖。
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SavedWorkflowMetaSchema, type SavedWorkflowMeta } from "@knorvia/contracts";

/** 现行元数据块的开场标记。 */
export const SAVED_WORKFLOW_SENTINEL = "/* knorvia-workflow";
/** 上游遗留的元数据块标记（只读兼容，不新写）。 */
export const LEGACY_SAVED_WORKFLOW_SENTINEL = "/* zcode-workflow";

/** 某一行是否是元数据块的开场标记（两种标记都认）。 */
export function isSavedWorkflowSentinel(value: string): boolean {
  const marker = value.trim();
  return marker === SAVED_WORKFLOW_SENTINEL || marker === LEGACY_SAVED_WORKFLOW_SENTINEL;
}

/** 解析失败的四类原因。 */
export type SavedWorkflowParseErrorReason =
  | "missing_frontmatter"
  | "unterminated_frontmatter"
  | "invalid_yaml"
  | "invalid_metadata";

/** 解析结果：成功带元数据与正文，失败带原因与诊断。 */
export type SavedWorkflowParseResult =
  | {
      ok: true;
      meta: SavedWorkflowMeta;
      script: string;
      bodyLineOffset: number;
    }
  | {
      ok: false;
      reason: SavedWorkflowParseErrorReason;
      detail: string;
    };

/** 把元数据 + 正文拼成文件内容（元数据块在前，正文紧随其后）。 */
export function serializeSavedWorkflow(meta: SavedWorkflowMeta, script: string): string {
  const metadata: Record<string, unknown> = { description: meta.description };
  if (meta.whenToUse !== undefined) {
    metadata.whenToUse = meta.whenToUse;
  }
  if (meta.args !== undefined) {
    metadata.args = meta.args;
  }
  const yaml = stringifyYaml(metadata);
  return `${SAVED_WORKFLOW_SENTINEL}\n${yaml}*/\n${script}`;
}

/**
 * 解析文件内容。
 *
 * 开场标记之前的空行被跳过（手改文件常见）；结束标记之后全是正文。
 * `bodyLineOffset` 是正文起始行号，供诊断把「正文里的第 N 行」换算成文件行号。
 */
export function parseSavedWorkflow(source: string): SavedWorkflowParseResult {
  const lines = source.split("\n");
  let opening = 0;
  while (opening < lines.length && lines[opening]!.trim() === "") {
    opening += 1;
  }
  if (opening === lines.length || !isSavedWorkflowSentinel(lines[opening]!)) {
    return {
      ok: false,
      reason: "missing_frontmatter",
      detail: `file does not start with the \`${SAVED_WORKFLOW_SENTINEL}\` metadata block`,
    };
  }

  let closing = opening + 1;
  while (closing < lines.length && lines[closing]!.trim() !== "*/") {
    closing += 1;
  }
  if (closing === lines.length) {
    return {
      ok: false,
      reason: "unterminated_frontmatter",
      detail: `metadata block is never closed with \`*/\``,
    };
  }

  const yaml = lines.slice(opening + 1, closing).join("\n");
  const script = lines.slice(closing + 1).join("\n");
  let decoded: unknown;
  try {
    decoded = parseYaml(yaml);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_yaml",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = SavedWorkflowMetaSchema.safeParse(decoded);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_metadata",
      detail: parsed.error.issues
        .map((issue: { path: (string | number)[]; message: string }) => {
          const path = issue.path.join(".") || "(root)";
          return `${path}: ${issue.message}`;
        })
        .join("; "),
    };
  }
  return {
    ok: true,
    meta: parsed.data,
    script,
    bodyLineOffset: closing + 1,
  };
}
