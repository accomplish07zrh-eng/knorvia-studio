// Exposed-source behavioral replacement. Exact wrapper text and substitution
// semantics are retained compatibility material; see the Skill execution spec.
import type { SkillContent } from "@knorvia/contracts";

const DIRECTORY_VARIABLES = ["CLAUDE_SKILL_DIR", "KNORVIA_SKILL_DIR"] as const;
const VARIABLE_START = "${";
const VARIABLE_END = "}";
const RELATIVE_PATH_NOTE = "Relative paths in this skill are relative to this base directory.";
const TRUNCATION_NOTE = "[Skill content truncated]";
const CONTENT_END = "</skill_content>";

/** Preserve the single capture's JavaScript replacement-string dollar behavior. */
function directoryAtSpan(
  directory: string,
  source: string,
  start: number,
  end: number,
  variable: string,
): string {
  const parts: string[] = [];
  for (let index = 0; index < directory.length; index++) {
    const character = directory[index];
    if (character !== "$") {
      parts.push(character);
      continue;
    }
    const next = directory[index + 1];
    switch (next) {
      case "$":
        parts.push("$");
        break;
      case "&":
        parts.push(source.slice(start, end));
        break;
      case "`":
        parts.push(source.slice(0, start));
        break;
      case "'":
        parts.push(source.slice(end));
        break;
      case "1":
        parts.push(variable);
        break;
      case "0":
        if (directory[index + 2] === "1") {
          parts.push(variable);
          index += 2;
          continue;
        }
        parts.push("$");
        continue;
      default:
        parts.push("$");
        continue;
    }
    index++;
  }
  return parts.join("");
}

/** Scan original spans only; inserted directories never become new matches. */
function expandDirectorySpans(source: string, directory: string): string {
  const parts: string[] = [];
  let consumed = 0;
  let searching = 0;
  for (;;) {
    const start = source.indexOf(VARIABLE_START, searching);
    if (start < 0) break;
    const variable = DIRECTORY_VARIABLES.find((name) =>
      source.startsWith(`${VARIABLE_START}${name}${VARIABLE_END}`, start),
    );
    if (variable === undefined) {
      searching = start + VARIABLE_START.length;
      continue;
    }
    const end = start + VARIABLE_START.length + variable.length + VARIABLE_END.length;
    parts.push(
      source.slice(consumed, start),
      directoryAtSpan(directory, source, start, end, variable),
    );
    consumed = end;
    searching = end;
  }
  parts.push(source.slice(consumed));
  return parts.join("");
}

/** Pure projection of the adapter result into the frozen model-facing text. */
export function projectSkillInstructions(loaded: SkillContent): string {
  let instructions = `<skill_content name="${loaded.metadata.name}">`;
  instructions += `\n# Skill: ${loaded.metadata.name}`;
  const body = expandDirectorySpans(loaded.content, loaded.baseDirectory);
  if (body.length > 0) instructions += `\n${body}`;
  instructions += `\nBase directory for this skill: ${loaded.baseDirectory}`;
  instructions += `\n${RELATIVE_PATH_NOTE}`;
  if (loaded.truncated) instructions += `\n${TRUNCATION_NOTE}`;
  return `${instructions}\n${CONTENT_END}`;
}
