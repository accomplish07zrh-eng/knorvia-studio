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

export {
  buildReferencedSessionContextReminderBody,
  extractSessionReferences,
} from "./references.js";

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
  role: MessageWithParts["info"]["role"];
  content: string;
  searchText: string;
  score: number;
  references: ReadSessionContextReference[];
}

const DEFAULT_OUTPUT_CHAR_BUDGET = 24000;
const MAX_OUTPUT_CHAR_BUDGET = 48000;
const MIN_OUTPUT_CHAR_BUDGET = 4000;
const LITE_INPUT_CHAR_BUDGET = 80000;
const MAX_LITE_CHUNKS = 5;
const MAX_CHUNK_CHARS = 28000;
const FALLBACK_SNIPPET_COUNT = 12;
const SCORE_INDEX_DENOMINATOR = 10000;
const PHRASE_SCORE = 20;
const TERM_BASE_SCORE = 3;
const MAX_TERM_OCCURRENCES = 5;
const TRANSCRIPT_REMAINING_CUTOFF = 200;

export function buildSessionContextMaterial(input: {
  messages: MessageWithParts[];
  query: string;
  session: SessionInfo;
  strategy: ReadSessionContextInput["strategy"];
  outputCharBudget?: number;
}): SessionContextMaterial {
  const budget = clampOutputCharBudget(input.outputCharBudget);
  const activeMessages = activeSessionMessages(input.messages);
  const snippets = activeMessages
    .map((message, index) => formatMessageSnippet(message, index))
    .filter((snippet): snippet is MessageSnippet => snippet !== null);
  const scoredSnippets = scoreSnippets(snippets, input.query);
  const allContent = formatSessionTranscript(input.session, scoredSnippets, {
    heading: "Cleaned transcript",
    outputCharBudget: Infinity,
    query: input.query,
    strategy: input.strategy,
  });
  const chunks = buildChunks(scoredSnippets);
  const selectedChunks = selectChunks(chunks, input.strategy);
  const selectedSnippets = selectSnippets(scoredSnippets, input.strategy, budget);
  const localContent = formatSessionTranscript(input.session, selectedSnippets, {
    heading:
      input.strategy === "handoff" ? "Recent session handoff context" : "Relevant session context",
    outputCharBudget: budget,
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
      allContent.length > budget,
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
  return maxTokens === undefined
    ? DEFAULT_OUTPUT_CHAR_BUDGET
    : clampOutputCharBudget(maxTokens * 4);
}

export function liteInputCharBudget(): number {
  return LITE_INPUT_CHAR_BUDGET;
}

export function maxLiteChunks(): number {
  return MAX_LITE_CHUNKS;
}

function clampOutputCharBudget(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_OUTPUT_CHAR_BUDGET;
  return Math.min(MAX_OUTPUT_CHAR_BUDGET, Math.max(MIN_OUTPUT_CHAR_BUDGET, Math.floor(value)));
}

function formatMessageSnippet(message: MessageWithParts, index: number): MessageSnippet | null {
  if (message.info.role === "user" && message.info.visibility === "model-only") return null;
  const texts = dedupeParts(message.parts)
    .map((part) => formatPartForContext(part))
    .filter((text): text is string => Boolean(text?.trim()));
  if (texts.length === 0) return null;
  const role = message.info.role;
  const body = texts.join("\n\n");
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
    references: [{ messageId: message.info.id, index, role }],
  };
}

function scoreSnippets(snippets: MessageSnippet[], query: string): MessageSnippet[] {
  const terms = tokenizeQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  return snippets.map((snippet) => ({
    ...snippet,
    score:
      scoreSearchText(snippet.searchText, normalizedQuery, terms) +
      snippet.index / SCORE_INDEX_DENOMINATOR,
  }));
}

function tokenizeQuery(query: string): string[] {
  const matches = query.toLowerCase().match(/[a-z0-9_./-]+|[\p{Script=Han}]+/gu) ?? [];
  const terms = new Set<string>();
  for (const match of matches) {
    if (match.length < 2) continue;
    terms.add(match);
    if (/^[\p{Script=Han}]+$/u.test(match) && match.length > 2) {
      for (let index = 0; index < match.length - 1; index += 1) {
        terms.add(match.slice(index, index + 2));
      }
    }
  }
  return [...terms];
}

function scoreSearchText(searchText: string, normalizedQuery: string, terms: string[]): number {
  let score = 0;
  if (normalizedQuery && searchText.includes(normalizedQuery)) score += PHRASE_SCORE;
  for (const term of terms) {
    if (searchText.includes(term)) {
      score += TERM_BASE_SCORE + Math.min(countOccurrences(searchText, term), MAX_TERM_OCCURRENCES);
    }
  }
  return score;
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const found = text.indexOf(term, offset);
    if (found < 0) return count;
    count += 1;
    offset = found + term.length;
  }
}

function selectSnippets(
  snippets: MessageSnippet[],
  strategy: ReadSessionContextInput["strategy"],
  budget: number,
): MessageSnippet[] {
  if (snippets.length === 0) return [];
  const selected: MessageSnippet[] = [];
  let usedChars = 0;
  if (strategy === "handoff") {
    for (let index = snippets.length - 1; index >= 0; index -= 1) {
      const snippet = snippets[index]!;
      if (selected.length > 0 && usedChars + snippet.content.length > budget) break;
      selected.push(snippet);
      usedChars += snippet.content.length;
    }
    return selected.reverse();
  }
  const positive = snippets.filter((snippet) => snippet.score >= TERM_BASE_SCORE);
  const candidates = positive.length > 0 ? positive : snippets.slice(-FALLBACK_SNIPPET_COUNT);
  const ranked = [...candidates].sort((a, b) => b.score - a.score || b.index - a.index);
  for (const snippet of ranked) {
    if (usedChars > budget) break;
    selected.push(snippet);
    usedChars += snippet.content.length;
  }
  return selected.sort((a, b) => a.index - b.index);
}

function buildChunks(snippets: MessageSnippet[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: MessageSnippet[] = [];
  let currentChars = 0;
  for (const snippet of snippets) {
    if (current.length > 0 && currentChars + snippet.content.length > MAX_CHUNK_CHARS) {
      chunks.push(createChunk(current, chunks.length));
      current = [];
      currentChars = 0;
    }
    current.push(snippet);
    currentChars += snippet.content.length;
  }
  if (current.length > 0) chunks.push(createChunk(current, chunks.length));
  return chunks;
}

function createChunk(snippets: MessageSnippet[], index: number): TranscriptChunk {
  return {
    index,
    startMessageIndex: snippets[0]!.index,
    endMessageIndex: snippets[snippets.length - 1]!.index,
    messageCount: snippets.length,
    content: snippets.map((snippet) => snippet.content).join("\n\n---\n\n"),
    searchText: snippets.map((snippet) => snippet.searchText).join("\n"),
    score: snippets.reduce((sum, snippet) => sum + snippet.score, 0),
    references: snippets.flatMap((snippet) => snippet.references),
  };
}

function selectChunks(
  chunks: TranscriptChunk[],
  strategy: ReadSessionContextInput["strategy"],
): TranscriptChunk[] {
  if (chunks.length <= MAX_LITE_CHUNKS) return chunks;
  if (strategy === "handoff") return chunks.slice(-MAX_LITE_CHUNKS);
  const ranked = [...chunks].sort((a, b) => b.score - a.score || b.index - a.index);
  const selected = new Map<number, TranscriptChunk>();
  for (const chunk of ranked.slice(0, MAX_LITE_CHUNKS - 1)) selected.set(chunk.index, chunk);
  const last = chunks[chunks.length - 1]!;
  selected.set(last.index, last);
  return [...selected.values()].sort((a, b) => a.index - b.index);
}

function formatSessionTranscript(
  session: SessionInfo,
  snippets: MessageSnippet[],
  options: {
    heading: string;
    outputCharBudget: number;
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
    .filter((line) => line !== undefined)
    .join("\n");
  if (snippets.length === 0) {
    return `${header}No readable transcript content was found in the target session.`;
  }
  let remaining = Number.isFinite(options.outputCharBudget)
    ? Math.max(0, options.outputCharBudget - header.length)
    : Infinity;
  const body: string[] = [];
  for (const snippet of snippets) {
    const separator = body.length > 0 ? "\n\n---\n\n" : "";
    const next = separator + snippet.content;
    if (Number.isFinite(remaining) && next.length > remaining) {
      if (remaining > TRANSCRIPT_REMAINING_CUTOFF) body.push(truncateText(next, remaining));
      break;
    }
    body.push(next);
    remaining -= next.length;
  }
  return `${header}${body.join("")}`;
}
