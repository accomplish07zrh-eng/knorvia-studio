// Shared estimate units: specs/knorvia-read-text-budget.md.
// The repository's transition licence remains applicable.
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";

const CJK_FIRST = 0x4e00;
const CJK_LAST = 0x9fff;
const ORDINARY_UNIT_WEIGHT = 1;
const CJK_UNIT_WEIGHT = 2;
const CJK_CHARACTER = new RegExp(
  `[${String.fromCharCode(CJK_FIRST)}-${String.fromCharCode(CJK_LAST)}]`,
);

function unitWeight(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code >= CJK_FIRST && code <= CJK_LAST ? CJK_UNIT_WEIGHT : ORDINARY_UNIT_WEIGHT;
}

export function countTokenEstimateUnits(text: string): number {
  const first = text.search(CJK_CHARACTER);
  if (first < 0) return text.length;
  // 无中文文本保留原生字符类别探测的快路径，避免对常见 ASCII 内容做逐字 JS 扫描。
  let total = text.length;
  for (let index = first; index < text.length; index++) {
    total += unitWeight(text, index) - ORDINARY_UNIT_WEIGHT;
  }
  return total;
}

export function tokenEstimatePrefixLength(text: string, maximumUnits: number): number {
  let total = 0;
  for (let index = 0; index < text.length; index++) {
    total += unitWeight(text, index);
    if (total > maximumUnits) return index;
  }
  return text.length;
}

export function estimateTokens(text: string): number {
  // 单一权重来源保持 UTF-16 和中文边界；不再分配与中文字符数量等大的 match 数组。
  return Math.ceil(countTokenEstimateUnits(text) / ESTIMATED_TOKEN_CHAR_DIVISOR);
}
