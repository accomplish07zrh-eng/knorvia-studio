// Exhaustive synthetic UTF-16 fixtures; repository transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import {
  countTokenEstimateUnits,
  estimateTokens,
  tokenEstimatePrefixLength,
} from "../src/context/utils.js";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";

test("every UTF-16 code unit retains the exact legacy CJK weight", () => {
  for (let code = 0; code <= 0xffff; code++) {
    const text = String.fromCharCode(code);
    const units = code >= 0x4e00 && code <= 0x9fff ? 2 : 1;
    assert.equal(countTokenEstimateUnits(text), units);
    assert.equal(
      estimateTokens(text + "ab"),
      Math.ceil((units + 2) / ESTIMATED_TOKEN_CHAR_DIVISOR),
    );
    assert.equal(tokenEstimatePrefixLength(text, 1), units === 1 ? 1 : 0);
  }
});

test("estimate units are additive even at surrogate and combining boundaries", () => {
  const texts = ["", "alpha", "中文", "😀", "\ud800", "\udc00", "e\u0301", "\r\n"];
  for (const left of texts)
    for (const right of texts) {
      assert.equal(
        countTokenEstimateUnits(left + right),
        countTokenEstimateUnits(left) + countTokenEstimateUnits(right),
      );
    }
});

test("selected prefix is maximal for zero, fractional, mixed and large budgets", () => {
  for (const text of ["", "abc", "中a文😀尾", "\r\n中", "a".repeat(100000)]) {
    for (const budget of [0, 0.5, 1, 2, 3, 5, 1000000]) {
      const end = tokenEstimatePrefixLength(text, budget);
      assert.ok(countTokenEstimateUnits(text.slice(0, end)) <= budget);
      if (end < text.length) assert.ok(countTokenEstimateUnits(text.slice(0, end + 1)) > budget);
    }
  }
});
