import assert from "node:assert/strict";
import { test } from "node:test";
import { orderThoughtLevelsForAxis } from "../src/chat-input-toolbar/thoughtLevelOptions.js";
import {
  latestStudioKernelDraftId,
  type StudioExternalDraft,
} from "../src/studio/agents/agentDrafts.js";

// specs/knorvia-ui-polish-20261008.md

const levels = (...values: string[]) => values.map((value) => ({ value, name: value }));

test("effort axis runs low to high even when a kernel reports levels highest first", () => {
  // Grok 按「极高→低」上报，强度轴必须反过来。
  assert.deepEqual(
    orderThoughtLevelsForAxis(levels("xhigh", "high", "medium", "low")).map((e) => e.value),
    ["low", "medium", "high", "xhigh"],
  );
  assert.deepEqual(
    orderThoughtLevelsForAxis(levels("none", "low", "high", "max")).map((e) => e.value),
    ["none", "low", "high", "max"],
  );
  // 含无法识别强弱的档位名时保留内核顺序。
  assert.deepEqual(
    orderThoughtLevelsForAxis(levels("turbo", "low")).map((e) => e.value),
    ["turbo", "low"],
  );
});

test("switching kernels restores that kernel's newest unsent draft only", () => {
  const draft = (sessionId: string, kernelId: string, text: string, updatedAt: number) =>
    ({ sessionId, kernelId, text, updatedAt }) as StudioExternalDraft;
  const drafts = {
    a: draft("a", "codex", "older", 1),
    b: draft("b", "codex", "newer", 5),
    c: draft("c", "codex", "   ", 9),
    d: draft("d", "claude-code", "other kernel", 10),
  };
  assert.equal(latestStudioKernelDraftId(drafts, "codex"), "b");
  assert.equal(latestStudioKernelDraftId(drafts, "claude-code"), "d");
  assert.equal(latestStudioKernelDraftId(drafts, "grok-build"), undefined);
});
