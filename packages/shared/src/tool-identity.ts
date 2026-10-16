// SPDX-License-Identifier: Apache-2.0
// 工具身份按目录序登记。归一化只做大小写折叠，不改写 AmendWorkflow / submit_result 的字面名。

interface ToolCatalogRow {
  readonly name: string;
  readonly family: string;
}

const TOOL_CATALOG = [
  { name: "Read", family: "file-read" },
  { name: "Write", family: "file-write" },
  { name: "Edit", family: "file-write" },
  { name: "ApplyPatch", family: "file-write" },
  { name: "Bash", family: "shell" },
  { name: "Glob", family: "search" },
  { name: "Grep", family: "search" },
  { name: "WebFetch", family: "search" },
  { name: "WebSearch", family: "search" },
  { name: "web_search", family: "search" },
  { name: "TodoRead", family: "todo" },
  { name: "TodoWrite", family: "todo" },
  { name: "GoalRead", family: "goal" },
  { name: "ReadSessionContext", family: "session-context" },
  { name: "AskUserQuestion", family: "ask-user-question" },
  { name: "SendMessage", family: "message" },
  { name: "RespondToCoordinator", family: "message" },
  { name: "TaskOutput", family: "task-control" },
  { name: "TaskStop", family: "task-control" },
  { name: "js", family: "node-repl" },
  { name: "js_reset", family: "node-repl" },
  { name: "js_add_node_module_dir", family: "node-repl" },
  { name: "mcp__node_repl__js", family: "node-repl" },
  { name: "mcp__node_repl__js_reset", family: "node-repl" },
  { name: "mcp__node_repl__js_add_node_module_dir", family: "node-repl" },
  { name: "Agent", family: "agent" },
  { name: "Task", family: "agent" },
  { name: "Skill", family: "skill" },
  { name: "CreateWorkflow", family: "workflow" },
  { name: "AmendWorkflow", family: "workflow" },
  { name: "submit_result", family: "workflow" },
] as const satisfies readonly ToolCatalogRow[];

type CatalogRow = (typeof TOOL_CATALOG)[number];

export type KnorviaKnownToolName = CatalogRow["name"];
export type KnorviaToolFamily = CatalogRow["family"];

export const KNORVIA_KNOWN_TOOL_NAMES: readonly KnorviaKnownToolName[] =
  TOOL_CATALOG.map((row) => row.name);

const FAMILY_BY_NAME: Record<KnorviaKnownToolName, KnorviaToolFamily> =
  buildFamilyTable();
const CANONICAL_BY_FOLDED = buildFoldedIndex(KNORVIA_KNOWN_TOOL_NAMES);

const FILE_CONTENT_WRITE_NAME: KnorviaKnownToolName = "Write";

function buildFamilyTable(): Record<KnorviaKnownToolName, KnorviaToolFamily> {
  const table = {} as Record<KnorviaKnownToolName, KnorviaToolFamily>;
  for (const row of TOOL_CATALOG) table[row.name] = row.family;
  return table;
}

function buildFoldedIndex(
  names: readonly KnorviaKnownToolName[],
): Map<string, KnorviaKnownToolName> {
  const index = new Map<string, KnorviaKnownToolName>();
  for (const name of names) {
    const folded = name.toLowerCase();
    const prior = index.get(folded);
    if (prior !== undefined && prior !== name) {
      throw new Error(`tool name fold collision: ${prior} vs ${name}`);
    }
    index.set(folded, name);
  }
  return index;
}

export function normalizeKnorviaToolName(
  value: string | null | undefined,
): KnorviaKnownToolName | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;
  return CANONICAL_BY_FOLDED.get(trimmed.toLowerCase()) ?? null;
}

export function getKnorviaToolFamilyForName(
  value: string | null | undefined,
): KnorviaToolFamily | null {
  const canonical = normalizeKnorviaToolName(value);
  if (canonical === null) return null;
  return FAMILY_BY_NAME[canonical];
}

export function isKnorviaToolFamily(
  value: string | null | undefined,
  family: KnorviaToolFamily,
): boolean {
  return getKnorviaToolFamilyForName(value) === family;
}

export function isKnorviaFileContentWriteToolName(
  value: string | null | undefined,
): boolean {
  return normalizeKnorviaToolName(value) === FILE_CONTENT_WRITE_NAME;
}
