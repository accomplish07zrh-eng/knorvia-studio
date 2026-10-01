import {
  type MessageWithParts,
  type ReadSessionContextInput,
  type ReadSessionContextOutput,
  type ReadSessionContextReference,
  type SessionInfo,
} from "@knorvia/contracts";
import { activeSessionMessages } from "../agent/session-history-hydrator.js";
import { dedupeParts, formatPartForContext } from "./parts.js";
import { truncateText } from "./utils.js";
import {
  rankSessionMaterial,
  selectSessionMaterial,
  materialChunkRanges,
  selectSessionChunks,
} from "./material-selection.js";
export {
  buildReferencedSessionContextReminderBody,
  extractSessionReferences,
} from "./references.js";

const DEFAULT_OUTPUT_CHAR_BUDGET = 24_000;
const MAX_OUTPUT_CHAR_BUDGET = 48_000;
const MAX_LITE_INPUT_CHARS = 80_000;
const MAX_LITE_CHUNKS = 5;
const MAX_CHUNK_CHARS = 28_000;

export interface SessionContextMaterial {
  allContent: string;
  allContentChars: number;
  chunks: TranscriptChunk[];
  localContent: string;
  messageCount: number;
  readableMessageCount: number;
  references: ReadSessionContextReference[];
  selectedChunks: TranscriptChunk[];
  selectedMessageCount: number;
  truncated: boolean;
}

export interface TranscriptChunk {
  index: number;
  startMessageIndex: number;
  endMessageIndex: number;
  messageCount: number;
  content: string;
  searchText: string;
  score: number;
  references: ReadSessionContextReference[];
}

interface MessageSnippet {
  index: number;
  role: "user" | "assistant";
  content: string;
  searchText: string;
  score: number;
  references: ReadSessionContextReference[];
}

export function buildSessionContextMaterial(input: {
  messages: MessageWithParts[];
  query: string;
  session: SessionInfo;
  strategy: ReadSessionContextInput["strategy"];
  outputCharBudget?: number;
}): SessionContextMaterial {
  const outputCharBudget = clampOutputCharBudget(input.outputCharBudget);
  const activeMessages = activeSessionMessages(input.messages);
  const snippets = activeMessages
    .map((message, index) => formatMessageSnippet(message, index))
    .filter((snippet): snippet is MessageSnippet => snippet !== null);
  const scoredSnippets = rankSessionMaterial(snippets, input.query);
  const allContent = formatSessionTranscript(input.session, scoredSnippets, {
    budgetChars: Number.POSITIVE_INFINITY,
    heading: "Cleaned transcript",
    query: input.query,
    strategy: input.strategy,
  });
  const chunks = buildTranscriptChunks(scoredSnippets);
  const selectedChunks = selectSessionChunks(chunks, input.strategy, MAX_LITE_CHUNKS);
  const selectedSnippets = selectSessionMaterial(scoredSnippets, input.strategy, outputCharBudget);
  const localContent = formatSessionTranscript(input.session, selectedSnippets, {
    budgetChars: outputCharBudget,
    heading: localHeading(input.strategy),
    query: input.query,
    strategy: input.strategy,
  });

  return {
    allContent,
    allContentChars: allContent.length,
    chunks,
    localContent,
    messageCount: activeMessages.length,
    readableMessageCount: scoredSnippets.length,
    references: selectedSnippets.flatMap((snippet) => snippet.references),
    selectedChunks,
    selectedMessageCount: selectedSnippets.length,
    truncated:
      selectedSnippets.length < scoredSnippets.length ||
      allContent.length > localContent.length ||
      allContent.length > outputCharBudget,
  };
}

export function formatReadSessionContextModelContent(output: ReadSessionContextOutput): string {
  if (output.status === "not_found") {
    return `Session ${output.sessionId} was not found.`;
  }
  if (output.status === "failed") {
    return [
      `ReadSessionContext failed for ${output.sessionId}.`,
      output.error ? `Error: ${output.error}` : undefined,
      output.content,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `ReadSessionContext returned ${output.source} context for ${output.sessionId}.`,
    output.title ? `Title: ${output.title}` : undefined,
    output.truncated ? "The returned context is truncated." : undefined,
    "",
    output.content,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatLocalSessionNotFound(input: {
  query: string;
  sessionId: string;
  strategy: ReadSessionContextInput["strategy"];
}): ReadSessionContextOutput {
  return {
    status: "not_found",
    sessionId: input.sessionId,
    strategy: input.strategy,
    query: input.query,
    source: "none",
    content: `No persisted session was found for ${input.sessionId}.`,
    messageCount: 0,
    selectedMessageCount: 0,
    truncated: false,
  };
}

export function outputCharBudgetFromMaxTokens(maxTokens: number | undefined): number {
  if (maxTokens === undefined) return DEFAULT_OUTPUT_CHAR_BUDGET;
  return clampOutputCharBudget(maxTokens * 4);
}

export function liteInputCharBudget(): number {
  return MAX_LITE_INPUT_CHARS;
}

export function maxLiteChunks(): number {
  return MAX_LITE_CHUNKS;
}

function formatMessageSnippet(message: MessageWithParts, index: number): MessageSnippet | null {
  if (message.info.role === "user" && message.info.visibility === "model-only") {
    return null;
  }

  const partTexts = dedupeParts(message.parts)
    .map((part) => formatPartForContext(part))
    .filter((text): text is string => Boolean(text?.trim()));
  if (partTexts.length === 0) return null;

  const role = message.info.role;
  const body = partTexts.join("\n\n");
  const content = [
    `[${index + 1}] ${role} ${message.info.id}`,
    `created: ${new Date(message.info.time.created).toISOString()}`,
    body,
  ].join("\n");

  return {
    index,
    role,
    content,
    searchText: `${role}\n${body}`.toLowerCase(),
    score: 0,
    references: [
      {
        messageId: message.info.id,
        index,
        role,
      },
    ],
  };
}

function buildTranscriptChunks(snippets: MessageSnippet[]): TranscriptChunk[] {
  return materialChunkRanges(snippets, MAX_CHUNK_CHARS).map(([start, end], index) =>
    createChunk(index, snippets.slice(start, end)),
  );
}

function createChunk(index: number, snippets: MessageSnippet[]): TranscriptChunk {
  const content = snippets.map((snippet) => snippet.content).join("\n\n---\n\n");
  return {
    index,
    startMessageIndex: snippets[0]!.index,
    endMessageIndex: snippets[snippets.length - 1]!.index,
    messageCount: snippets.length,
    content,
    searchText: snippets.map((snippet) => snippet.searchText).join("\n"),
    score: snippets.reduce((sum, snippet) => sum + snippet.score, 0),
    references: snippets.flatMap((snippet) => snippet.references),
  };
}

function formatSessionTranscript(
  session: SessionInfo,
  snippets: MessageSnippet[],
  options: {
    budgetChars: number;
    heading: string;
    query: string;
    strategy: ReadSessionContextInput["strategy"];
  },
): string {
  const header = [
    `# ${options.heading}`,
    `Session: ${session.title} (${session.id})`,
    `Directory: ${session.directory}`,
    session.path ? `Path: ${session.path}` : undefined,
    `Strategy: ${options.strategy}`,
    `Query: ${options.query}`,
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  if (snippets.length === 0) {
    return `${header}No readable transcript content was found in the target session.`;
  }

  let remaining = Number.isFinite(options.budgetChars)
    ? Math.max(0, options.budgetChars - header.length)
    : Number.POSITIVE_INFINITY;
  const body: string[] = [];
  for (const snippet of snippets) {
    const separator = body.length > 0 ? "\n\n---\n\n" : "";
    const next = separator + snippet.content;
    if (Number.isFinite(remaining) && next.length > remaining) {
      if (remaining > 200) {
        body.push(truncateText(next, remaining));
      }
      break;
    }
    body.push(next);
    remaining -= next.length;
  }

  return `${header}${body.join("")}`;
}

function localHeading(strategy: ReadSessionContextInput["strategy"]): string {
  return strategy === "handoff" ? "Recent session handoff context" : "Relevant session context";
}

function clampOutputCharBudget(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_OUTPUT_CHAR_BUDGET;
  return Math.max(4000, Math.min(MAX_OUTPUT_CHAR_BUDGET, Math.floor(value)));
}
