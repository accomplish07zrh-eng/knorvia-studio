// Linear prefix planning; transition licence and source review remain unchanged.
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import { countTokenEstimateUnits, tokenEstimatePrefixLength } from "../../context/utils.js";

interface TextPrefix {
  content: string;
  numLines: number;
  firstLineOnly: boolean;
}

export function selectTextBudgetPrefix(
  content: string,
  tokenBudget: number,
): TextPrefix | undefined {
  const maximumUnits = tokenBudget * ESTIMATED_TOKEN_CHAR_DIVISOR;
  const lines = content.split(/\r?\n/);
  let consumed = 0;
  let accepted = 0;
  for (const line of lines) {
    // LF 只存在于两行之间；逐行累加等价于最终 join 的权重，不反复创建或扫描前缀。
    const next = consumed + countTokenEstimateUnits(line) + (accepted === 0 ? 0 : 1);
    if (next > maximumUnits) break;
    consumed = next;
    accepted++;
  }
  if (accepted > 0) {
    return {
      content: lines.slice(0, accepted).join("\n"),
      numLines: accepted,
      firstLineOnly: false,
    };
  }
  const end = tokenEstimatePrefixLength(content, maximumUnits);
  return end > 0 ? { content: content.slice(0, end), numLines: 1, firstLineOnly: true } : undefined;
}
