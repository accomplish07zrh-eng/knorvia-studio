import {
  WorkflowNodePromptUpdateSchema,
  WorkflowNodePromptUpdateSetSchema,
  type WorkflowNodePromptUpdate,
} from "@knorvia/contracts";
import {
  isRecord,
  parsePlannerJson,
  readLooseArray,
  readLooseString,
  readLooseValue,
  stringValue,
} from "./json.js";

export function parseWorkflowNodePromptUpdateSet(response: string): {
  nodes: WorkflowNodePromptUpdate[];
  reasoning?: string;
} | null {
  let candidate: unknown;
  try {
    candidate = parsePlannerJson(response);
  } catch {
    return null;
  }
  return normalizeUpdateSet(candidate);
}

function normalizeUpdateSet(value: unknown): {
  nodes: WorkflowNodePromptUpdate[];
  reasoning?: string;
} | null {
  if (Array.isArray(value)) {
    return normalizeUpdateSet({ nodes: value });
  }
  if (!isRecord(value)) {
    return null;
  }

  const direct = WorkflowNodePromptUpdateSetSchema.safeParse(value);
  if (direct.success && direct.data.nodes.length > 0) {
    return direct.data;
  }

  const arrayCandidates = readLooseArray(value, [
    "nodes",
    "nodePrompts",
    "node_prompts",
    "nodeInstructions",
    "node_instructions",
  ]);
  const keyedCandidates = normalizeKeyedCandidates(
    readLooseValue(value, [
      "nodePrompts",
      "node_prompts",
      "nodeInstructions",
      "node_instructions",
      "prompts",
    ]),
  );
  const nodes = [...(arrayCandidates ?? []), ...keyedCandidates]
    .map(normalizeNode)
    .filter((node): node is WorkflowNodePromptUpdate => node !== null);
  const result = WorkflowNodePromptUpdateSetSchema.safeParse({
    nodes,
    reasoning: stringValue(value.reasoning),
  });
  return result.success ? result.data : null;
}

function normalizeKeyedCandidates(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([key, entry]) => {
    if (typeof entry === "string") {
      return { id: key, prompt: entry };
    }
    if (isRecord(entry)) {
      return { id: key, ...entry };
    }
    return { id: key };
  });
}

function normalizeNode(value: unknown): WorkflowNodePromptUpdate | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readLooseString(value, ["id", "name", "nodeId", "node_id", "nodeName", "node_name"]);
  if (id === undefined) {
    return null;
  }
  const prompt = readLooseString(value, [
    "prompt",
    "instructions",
    "instruction",
    "rules",
    "metaPrompt",
    "meta_prompt",
    "nodePrompt",
    "node_prompt",
  ]);
  const description = readLooseString(value, ["description", "objective", "goal", "summary"]);
  const title = readLooseString(value, ["title"]);
  const result = WorkflowNodePromptUpdateSchema.safeParse({ description, id, prompt, title });
  return result.success ? result.data : null;
}
