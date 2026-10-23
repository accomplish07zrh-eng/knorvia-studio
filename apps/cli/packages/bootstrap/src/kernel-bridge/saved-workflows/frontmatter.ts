import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SavedWorkflowMetaSchema, type SavedWorkflowMeta } from "@knorvia/contracts";

export const SAVED_WORKFLOW_SENTINEL = "/* knorvia-workflow";
export const LEGACY_SAVED_WORKFLOW_SENTINEL = "/* zcode-workflow";

export function isSavedWorkflowSentinel(value: string): boolean {
  const marker = value.trim();
  return marker === SAVED_WORKFLOW_SENTINEL || marker === LEGACY_SAVED_WORKFLOW_SENTINEL;
}

export type SavedWorkflowParseErrorReason =
  | "missing_frontmatter"
  | "unterminated_frontmatter"
  | "invalid_yaml"
  | "invalid_metadata";

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
