import {
  READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS,
  type ReadSessionContextInput,
} from "@knorvia/contracts";
import {
  liteInputCharBudget,
  maxLiteChunks,
  type SessionContextMaterial,
} from "../../session-context/read-session-context.js";

const MIN_CHUNK_TOKENS = 800;
const MAX_CHUNK_TOKENS = 2500;
const EMPTY_CONTEXT_MARKER = "NO_RELEVANT_CONTEXT";

export interface SessionExtractionRequest {
  material: string;
  maxOutputTokens: number;
  sourceLabel: string;
  synthesize?: boolean;
}
interface ExtractionInput {
  material: SessionContextMaterial;
  outputCharBudget: number;
  parsed: ReadSessionContextInput;
}

/** One interpreter owns the effect boundary; the plan never invokes a model itself. */
export async function runSessionExtraction(
  input: ExtractionInput,
  extract: (request: SessionExtractionRequest) => Promise<string>,
): Promise<string> {
  const plan = extractionPlan(input);
  let step = plan.next();
  while (!step.done) {
    const text = await extract(step.value);
    step = plan.next(text);
  }
  return step.value;
}

function* extractionPlan(
  input: ExtractionInput,
): Generator<SessionExtractionRequest, string, string> {
  const { material, parsed } = input;
  if (material.allContentChars <= liteInputCharBudget()) {
    return yield {
      material: material.allContent,
      maxOutputTokens: parsed.maxTokens ?? READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS,
      sourceLabel: "full cleaned transcript",
    };
  }

  const selected = material.selectedChunks.slice(0, maxLiteChunks());
  const tokenLimit = Math.min(
    MAX_CHUNK_TOKENS,
    Math.max(
      MIN_CHUNK_TOKENS,
      Math.floor((parsed.maxTokens ?? READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS) / 2),
    ),
  );
  let notes = "";
  let accepted = 0;
  for (const chunk of selected) {
    const text = yield {
      material: `# Transcript chunk ${chunk.index + 1}\nMessages: ${chunk.startMessageIndex + 1}-${chunk.endMessageIndex + 1}\nReadable messages in chunk: ${chunk.messageCount}\n\n${chunk.content}`,
      maxOutputTokens: tokenLimit,
      sourceLabel: `transcript chunk ${chunk.index + 1}`,
    };
    const normalized = text.trim();
    if (!normalized || normalized.toUpperCase() === EMPTY_CONTEXT_MARKER) continue;
    // 兼容已冻结的异步边界：响应后读取编号，选择列表本身仅在开始时快照。
    notes += `${accepted ? "\n\n" : ""}## Chunk ${chunk.index + 1}\n${text}`;
    accepted += 1;
  }
  if (!accepted) return "";
  if (accepted === 1 && notes.length <= input.outputCharBudget) return notes;
  return yield {
    material: notes,
    maxOutputTokens: parsed.maxTokens ?? READ_SESSION_CONTEXT_DEFAULT_MAX_TOKENS,
    sourceLabel: "extracted chunk notes",
    synthesize: true,
  };
}
