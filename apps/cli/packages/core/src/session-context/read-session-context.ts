// SPDX-License-Identifier: Apache-2.0
// 会话上下文素材：把某个会话的历史消息投影成可检索、可裁剪、有界的文本素材。
// 三条产出各司其职——allContent 是全量清洗稿，localContent 是按策略与预算挑出来的一段，
// chunks 是给轻量入口用的分块索引。所有裁剪都只按字符数，不做 token 估算。
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

interface TranscriptOptions {
  heading: string;
  outputCharBudget: number;
  query: string;
  strategy: ReadSessionContextInput["strategy"];
}

// 输出预算的三个档位与轻量入口的两个上限。
const OUTPUT_BUDGET_DEFAULT = 24000;
const OUTPUT_BUDGET_MAX = 48000;
const OUTPUT_BUDGET_MIN = 4000;
const LITE_INPUT_BUDGET = 80000;
const LITE_CHUNK_LIMIT = 5;
// 分块上限与「一个词条最多计几次命中」的封顶。
const CHUNK_CHAR_LIMIT = 28000;
const TERM_COUNT_CAP = 5;
// 检索计分：整句命中给一笔，每个词条给底分再加命中次数；同分时用序号/10000 做稳定排序。
const PHRASE_BONUS = 20;
const TERM_BONUS = 3;
const INDEX_TIEBREAK_DIVISOR = 10000;
// 全量稿没有任何词条命中时，退回最近这么多条，避免给模型一段空白。
const FALLBACK_SNIPPET_LIMIT = 12;
// 尾巴只剩这么点预算时干脆不贴残句。
const TRAILING_CUTOFF_CHARS = 200;
const TRANSCRIPT_SEPARATOR = "\n\n---\n\n";
const QUERY_TOKEN_PATTERN = /[a-z0-9_./-]+|[\p{Script=Han}]+/gu;
const HAN_ONLY_PATTERN = /^[\p{Script=Han}]+$/u;
const MIN_TERM_CHARS = 2;
const MIN_HAN_BIGRAM_CHARS = 2;
const CLEANED_HEADING = "Cleaned transcript";
const HANDOFF_HEADING = "Recent session handoff context";
const RELEVANT_HEADING = "Relevant session context";
const EMPTY_TRANSCRIPT_NOTE = "No readable transcript content was found in the target session.";

export function buildSessionContextMaterial(input: {
  messages: MessageWithParts[];
  query: string;
  session: SessionInfo;
  strategy: ReadSessionContextInput["strategy"];
  outputCharBudget?: number;
}): SessionContextMaterial {
  const budget = normalizeOutputBudget(input.outputCharBudget);
  const activeMessages = activeSessionMessages(input.messages);
  const snippets = readableSnippets(activeMessages);
  const scoredSnippets = withRelevanceScores(snippets, input.query);
  const allContent = renderTranscript(input.session, scoredSnippets, {
    heading: CLEANED_HEADING,
    outputCharBudget: Infinity,
    query: input.query,
    strategy: input.strategy,
  });
  const chunks = groupIntoChunks(scoredSnippets);
  const selectedChunks = pickChunks(chunks, input.strategy);
  const selectedSnippets = pickSnippets(scoredSnippets, input.strategy, budget);
  const heading = input.strategy === "handoff" ? HANDOFF_HEADING : RELEVANT_HEADING;
  const localContent = renderTranscript(input.session, selectedSnippets, {
    heading,
    outputCharBudget: budget,
    query: input.query,
    strategy: input.strategy,
  });
  const wasTrimmed =
    selectedSnippets.length < scoredSnippets.length ||
    allContent.length > localContent.length ||
    allContent.length > budget;
  const material: SessionContextMaterial = {
    allContent: allContent,
    allContentChars: allContent.length,
    chunks: chunks,
    localContent: localContent,
    messageCount: activeMessages.length,
    readableMessageCount: scoredSnippets.length,
    references: selectedSnippets.flatMap((snippet) => snippet.references),
    selectedChunks: selectedChunks,
    selectedMessageCount: selectedSnippets.length,
    truncated: wasTrimmed,
  };
  return material;
}

// 工具回给模型的正文：按状态分三种措辞，字段缺席的那行整行不出。
export function formatReadSessionContextModelContent(output: ReadSessionContextOutput): string {
  if (output.status === "not_found") {
    const missing = `Session ${output.sessionId} was not found.`;
    return missing;
  }
  if (output.status === "failed") {
    const failure = `ReadSessionContext failed for ${output.sessionId}.`;
    const errorLine = output.error ? `Error: ${output.error}` : undefined;
    return [failure, errorLine, output.content].filter(Boolean).join("\n");
  }
  const success = `ReadSessionContext returned ${output.source} context for ${output.sessionId}.`;
  const titleLine = output.title ? `Title: ${output.title}` : undefined;
  const truncatedLine = output.truncated ? "The returned context is truncated." : undefined;
  return [success, titleLine, truncatedLine, "", output.content].filter(Boolean).join("\n");
}

export function formatLocalSessionNotFound(input: {
  query: string;
  sessionId: string;
  strategy: ReadSessionContextInput["strategy"];
}): ReadSessionContextOutput {
  const content = `No persisted session was found for ${input.sessionId}.`;
  const output: ReadSessionContextOutput = {
    status: "not_found",
    sessionId: input.sessionId,
    strategy: input.strategy,
    query: input.query,
    source: "none",
    content: content,
    messageCount: 0,
    selectedMessageCount: 0,
    truncated: false,
  };
  return output;
}

// 模型请求的 maxTokens 换算成字符预算（约 4 字符/token），同样受上下限约束。
export function outputCharBudgetFromMaxTokens(maxTokens: number | undefined): number {
  if (maxTokens === undefined) return OUTPUT_BUDGET_DEFAULT;
  return normalizeOutputBudget(maxTokens * 4);
}

export function liteInputCharBudget(): number {
  return LITE_INPUT_BUDGET;
}

export function maxLiteChunks(): number {
  return LITE_CHUNK_LIMIT;
}

// 预算是硬边界：非有限值退回默认档，其余夹在 MIN..MAX 之间并向下取整。
function normalizeOutputBudget(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return OUTPUT_BUDGET_DEFAULT;
  const floored = Math.floor(value);
  const bounded = Math.max(OUTPUT_BUDGET_MIN, floored);
  return Math.min(OUTPUT_BUDGET_MAX, bounded);
}

// 一条消息的可用正文：先把部件投影成文本，全空（或被忽略）的消息不产生片段。
function snippetTexts(message: MessageWithParts): string[] {
  const projected = dedupeParts(message.parts).map((part) => formatPartForContext(part));
  return projected.filter((text): text is string => Boolean(text?.trim()));
}

function toMessageSnippet(message: MessageWithParts, index: number): MessageSnippet | null {
  const hiddenFromModel = message.info.role === "user" && message.info.visibility === "model-only";
  if (hiddenFromModel) return null;
  const texts = snippetTexts(message);
  if (texts.length === 0) return null;
  const role = message.info.role;
  const body = texts.join("\n\n");
  const created = new Date(message.info.time.created).toISOString();
  const heading = `[${index + 1}] ${role} ${message.info.id}`;
  const content = [heading, `created: ${created}`, body].join("\n");
  const snippet: MessageSnippet = {
    index: index,
    role: role,
    content: content,
    searchText: `${role}\n${body}`.toLowerCase(),
    score: 0,
    references: [{ messageId: message.info.id, index: index, role: role }],
  };
  return snippet;
}

function readableSnippets(messages: MessageWithParts[]): MessageSnippet[] {
  const collected: MessageSnippet[] = [];
  for (const [index, message] of messages.entries()) {
    const snippet = toMessageSnippet(message, index);
    if (snippet) collected.push(snippet);
  }
  return collected;
}

// 计分 = 检索相关度 + 序号微调（同分时靠后的更新，排前面）。
function withRelevanceScores(snippets: MessageSnippet[], query: string): MessageSnippet[] {
  const terms = queryTerms(query);
  const normalizedQuery = query.trim().toLowerCase();
  return snippets.map((snippet) => {
    const relevance = relevanceOf(snippet.searchText, normalizedQuery, terms);
    return { ...snippet, score: relevance + snippet.index / INDEX_TIEBREAK_DIVISOR };
  });
}

// 检索词：拉丁片段整段入表；中文片段除整段外再拆相邻双字，保证二字词也能命中。
function queryTerms(query: string): string[] {
  const matches = query.toLowerCase().match(QUERY_TOKEN_PATTERN) ?? [];
  const usable = matches.filter((match) => match.length >= MIN_TERM_CHARS);
  return [...new Set(usable.flatMap(expandHanTerm))];
}

// 中文片段除整段外再拆相邻双字：中文查询常以二字词出现，整段匹配会漏。
function expandHanTerm(match: string): string[] {
  if (!HAN_ONLY_PATTERN.test(match) || match.length <= MIN_HAN_BIGRAM_CHARS) return [match];
  const bigrams: string[] = [];
  for (let offset = 0; offset < match.length - 1; offset += 1) {
    bigrams.push(match.slice(offset, offset + 2));
  }
  return [match, ...bigrams];
}

function relevanceOf(searchText: string, normalizedQuery: string, terms: string[]): number {
  const phraseBonus = normalizedQuery && searchText.includes(normalizedQuery) ? PHRASE_BONUS : 0;
  return terms.reduce((total, term) => total + termScore(searchText, term), phraseBonus);
}

// 单个词条的得分：没命中记 0，命中记底分加命中次数（次数封顶）。
function termScore(searchText: string, term: string): number {
  if (!searchText.includes(term)) return 0;
  return TERM_BONUS + Math.min(countTermHits(searchText, term), TERM_COUNT_CAP);
}

// 非重叠计数：每次从命中处之后继续找。
function countTermHits(text: string, term: string): number {
  let hits = 0;
  let cursor = text.indexOf(term);
  while (cursor >= 0) {
    hits += 1;
    cursor = text.indexOf(term, cursor + term.length);
  }
  return hits;
}

// handoff 取最近的一段：从末尾往前加，直到再加一条就越界（第一条无论多长都要留下）。
function pickHandoffSnippets(snippets: MessageSnippet[], budget: number): MessageSnippet[] {
  const chosen: MessageSnippet[] = [];
  let usedChars = 0;
  for (let index = snippets.length - 1; index >= 0; index -= 1) {
    const snippet = snippets[index]!;
    if (chosen.length > 0 && usedChars + snippet.content.length > budget) break;
    chosen.push(snippet);
    usedChars += snippet.content.length;
  }
  return chosen.reverse();
}

// 其余策略按相关度取：有正分词条就只从其中挑，一个都没有才退回最近若干条。
function pickRelevantSnippets(snippets: MessageSnippet[], budget: number): MessageSnippet[] {
  const positive = snippets.filter((snippet) => snippet.score >= TERM_BONUS);
  const candidates = positive.length > 0 ? positive : snippets.slice(-FALLBACK_SNIPPET_LIMIT);
  const ordered = [...candidates].sort((a, b) => b.score - a.score || b.index - a.index);
  const chosen: MessageSnippet[] = [];
  let usedChars = 0;
  for (const snippet of ordered) {
    if (usedChars > budget) break;
    chosen.push(snippet);
    usedChars += snippet.content.length;
  }
  return chosen.sort((a, b) => a.index - b.index);
}

function pickSnippets(
  snippets: MessageSnippet[],
  strategy: ReadSessionContextInput["strategy"],
  budget: number,
): MessageSnippet[] {
  if (snippets.length === 0) return [];
  if (strategy === "handoff") return pickHandoffSnippets(snippets, budget);
  return pickRelevantSnippets(snippets, budget);
}

function makeChunk(snippets: MessageSnippet[], index: number): TranscriptChunk {
  const first = snippets[0]!;
  const last = snippets[snippets.length - 1]!;
  return {
    index,
    startMessageIndex: first.index,
    endMessageIndex: last.index,
    messageCount: snippets.length,
    content: snippets.map((snippet) => snippet.content).join(TRANSCRIPT_SEPARATOR),
    searchText: snippets.map((snippet) => snippet.searchText).join("\n"),
    score: snippets.reduce((sum, snippet) => sum + snippet.score, 0),
    references: snippets.flatMap((snippet) => snippet.references),
  };
}

// 按字符上限切块：超限就先收掉当前块再开新块，最后一块也要收。
function groupIntoChunks(snippets: MessageSnippet[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let openChunk: MessageSnippet[] = [];
  let openChars = 0;
  for (const snippet of snippets) {
    const wouldOverflow = openChars + snippet.content.length > CHUNK_CHAR_LIMIT;
    if (openChunk.length > 0 && wouldOverflow) {
      chunks.push(makeChunk(openChunk, chunks.length));
      openChunk = [];
      openChars = 0;
    }
    openChunk.push(snippet);
    openChars += snippet.content.length;
  }
  if (openChunk.length > 0) chunks.push(makeChunk(openChunk, chunks.length));
  return chunks;
}

// 轻量入口的分块选择：块数不超上限就全给；handoff 给最后几块；其余按相关度取前几块并保底带上最后一块。
function pickChunks(
  chunks: TranscriptChunk[],
  strategy: ReadSessionContextInput["strategy"],
): TranscriptChunk[] {
  if (chunks.length <= LITE_CHUNK_LIMIT) return chunks;
  if (strategy === "handoff") return chunks.slice(-LITE_CHUNK_LIMIT);
  const ranked = [...chunks].sort((a, b) => b.score - a.score || b.index - a.index);
  const selected = new Map<number, TranscriptChunk>();
  for (const chunk of ranked.slice(0, LITE_CHUNK_LIMIT - 1)) selected.set(chunk.index, chunk);
  const newest = chunks[chunks.length - 1]!;
  selected.set(newest.index, newest);
  return [...selected.values()].sort((a, b) => a.index - b.index);
}

// 头部固定行：path 缺席整行不出。
function transcriptHeaderLines(session: SessionInfo, options: TranscriptOptions): string[] {
  const lines = [
    `# ${options.heading}`,
    `Session: ${session.title} (${session.id})`,
    `Directory: ${session.directory}`,
  ];
  if (session.path) lines.push(`Path: ${session.path}`);
  lines.push(`Strategy: ${options.strategy}`, `Query: ${options.query}`, "");
  return lines;
}

// 正文：逐条拼，预算不够时要么贴一段截断文本要么整条不贴。
function transcriptBody(snippets: MessageSnippet[], remainingBudget: number): string {
  let budgetLeft = remainingBudget;
  const segments: string[] = [];
  for (const snippet of snippets) {
    const separator = segments.length > 0 ? TRANSCRIPT_SEPARATOR : "";
    const next = separator + snippet.content;
    if (Number.isFinite(budgetLeft) && next.length > budgetLeft) {
      if (budgetLeft > TRAILING_CUTOFF_CHARS) segments.push(truncateText(next, budgetLeft));
      break;
    }
    segments.push(next);
    budgetLeft -= next.length;
  }
  return segments.join("");
}

function renderTranscript(
  session: SessionInfo,
  snippets: MessageSnippet[],
  options: TranscriptOptions,
): string {
  const headerText = transcriptHeaderLines(session, options).join("\n");
  if (snippets.length === 0) return `${headerText}${EMPTY_TRANSCRIPT_NOTE}`;
  const remainingBudget = Number.isFinite(options.outputCharBudget)
    ? Math.max(0, options.outputCharBudget - headerText.length)
    : Infinity;
  return `${headerText}${transcriptBody(snippets, remainingBudget)}`;
}
