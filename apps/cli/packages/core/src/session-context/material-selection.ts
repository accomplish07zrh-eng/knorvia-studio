import type { ReadSessionContextInput } from "@knorvia/contracts";

type Strategy = ReadSessionContextInput["strategy"];
interface Ranked {
  index: number;
  score: number;
}
interface RankedText extends Ranked {
  content: string;
  searchText: string;
}
const PHRASE_WEIGHT = 20;
const TERM_WEIGHT = 3;
const TERM_OCCURRENCE_CAP = 5;
const RECENCY_DIVISOR = 10_000;
const FALLBACK_TAIL = 12;

function queryTerms(query: string): string[] {
  const unique = new Set<string>();
  for (const token of query.toLowerCase().matchAll(/[a-z0-9_./-]+|[\p{Script=Han}]+/gu)) {
    const value = token[0];
    if (value.length < 2) continue;
    unique.add(value);
    if (value.length > 2 && /^[\p{Script=Han}]+$/u.test(value)) {
      let end = 2;
      while (end <= value.length) {
        unique.add(value.slice(end - 2, end));
        end++;
      }
    }
  }
  return Array.from(unique);
}

/** Saturating scan avoids traversing every repeated occurrence after the score is fixed. */
function termScore(text: string, term: string): number {
  let cursor = 0;
  let hits = 0;
  while (hits < TERM_OCCURRENCE_CAP) {
    const found = text.indexOf(term, cursor);
    if (found === -1) break;
    cursor = found + term.length;
    hits++;
  }
  return hits ? TERM_WEIGHT + hits : 0;
}

export function rankSessionMaterial<T extends RankedText>(records: T[], query: string): T[] {
  const terms = queryTerms(query);
  const phrase = query.trim().toLowerCase();
  return records.map((record) => {
    let score = phrase && record.searchText.includes(phrase) ? PHRASE_WEIGHT : 0;
    for (const term of terms) score += termScore(record.searchText, term);
    return { ...record, score: score + record.index / RECENCY_DIVISOR };
  });
}

function rankPositions<T extends Ranked>(records: T[]): number[] {
  return Array.from(records.keys()).sort(
    (left, right) =>
      records[right]!.score - records[left]!.score || records[right]!.index - records[left]!.index,
  );
}

export function selectSessionMaterial<T extends RankedText>(
  records: T[],
  strategy: Strategy,
  budget: number,
): T[] {
  if (strategy === "handoff") {
    let start = records.length;
    let used = 0;
    while (start > 0) {
      const size = records[start - 1]!.content.length;
      if (start !== records.length && used + size > budget) break;
      start--;
      used += size;
    }
    return records.slice(start);
  }
  const positive = records.filter((record) => record.score >= TERM_WEIGHT);
  const candidates = positive.length ? positive : records.slice(-FALLBACK_TAIL);
  const order = rankPositions(candidates);
  let used = 0;
  let count = 0;
  while (count < order.length && used <= budget) {
    used += candidates[order[count]!]!.content.length;
    count++;
  }
  return order
    .slice(0, count)
    .map((position) => candidates[position]!)
    .sort((a, b) => a.index - b.index);
}

/** Half-open ranges own chunk boundaries; projection retains the existing separators/references. */
export function materialChunkRanges(
  records: { content: string }[],
  budget: number,
): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  while (start < records.length) {
    let end = start + 1;
    let size = records[start]!.content.length;
    while (end < records.length && size + records[end]!.content.length <= budget) {
      size += records[end]!.content.length;
      end++;
    }
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

export function selectSessionChunks<T extends Ranked>(
  records: T[],
  strategy: Strategy,
  limit: number,
): T[] {
  if (records.length <= limit) return records;
  if (strategy === "handoff") return records.slice(-limit);
  const selected = rankPositions(records)
    .slice(0, limit - 1)
    .map((position) => records[position]!);
  const last = records[records.length - 1]!;
  if (!selected.some((record) => record.index === last.index)) selected.push(last);
  return selected.sort((a, b) => a.index - b.index);
}
