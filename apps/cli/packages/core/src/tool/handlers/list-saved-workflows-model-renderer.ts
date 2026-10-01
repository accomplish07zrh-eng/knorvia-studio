// Source-exposed rendering decisions; inherited model syntax/prose retain attribution.
import type {
  ListSavedWorkflowsOutput,
  SavedWorkflowArgDeclaration,
  SavedWorkflowEntry,
} from "@knorvia/contracts";

type NoteReader = (spec: SavedWorkflowArgDeclaration) => string | undefined;
const ARGUMENT_NOTES: readonly NoteReader[] = [
  (spec) => spec.type,
  (spec) => (spec.required === true ? "required" : undefined),
  (spec) => (spec.default === undefined ? undefined : `default ${JSON.stringify(spec.default)}`),
];
function argumentLine(key: string, spec: SavedWorkflowArgDeclaration): string {
  const notes = ARGUMENT_NOTES.map((read) => read(spec)).filter((note) => note !== undefined);
  const description = spec.description === undefined ? "" : ` — ${spec.description}`;
  return `  arg ${key} (${notes.join(", ")})${description}`;
}
function* workflowLines(
  workflow: SavedWorkflowEntry,
  escape: (value: string) => string,
): Generator<string> {
  yield `<workflow name="${escape(workflow.name)}" scope="${workflow.scope}">`;
  yield `  ${workflow.description}`;
  if (workflow.whenToUse !== undefined) yield `  When to use: ${workflow.whenToUse}`;
  for (const [key, spec] of Object.entries(workflow.args ?? {})) yield argumentLine(key, spec);
  yield "</workflow>";
}
export function renderSavedWorkflowListing(
  data: ListSavedWorkflowsOutput,
  escape: (value: string) => string,
): string {
  // Assemble rows first: JSON default callbacks precede invalid rows and the final count read.
  const blocks = data.workflows.map((workflow) =>
    Array.from(workflowLines(workflow, escape)).join("\n"),
  );
  const invalidLines = (data.invalid ?? []).map(
    (entry) => `<invalid path="${escape(entry.path)}">${entry.reason}</invalid>`,
  );
  return [
    `<saved_workflows count="${data.workflows.length}">`,
    ...blocks,
    ...invalidLines,
    "</saved_workflows>",
  ].join("\n");
}
