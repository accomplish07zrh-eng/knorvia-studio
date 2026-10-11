// SPDX-License-Identifier: Apache-2.0
// core-tool-01 contract tests, part 1: pure helpers.
// Black box: asserts only through each module's documented exports.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  DEFAULT_BASH_MAX_TIMEOUT_MS,
  DEFAULT_BASH_TIMEOUT_MS,
  resolveBashTimeoutMs,
  resolveBashTimeoutPolicy,
} from "../../../../apps/cli/packages/core/src/tool/bash-timeout-policy.js";
import {
  TASK_TOOL_NAME,
  hookMatcherToolNamesForTool,
  isSubagentDispatchToolName,
} from "../../../../apps/cli/packages/core/src/tool/compat.js";
import {
  countPatchLines,
  createStructuredPatch,
} from "../../../../apps/cli/packages/core/src/tool/diff.js";
import { editLineDistance } from "../../../../apps/cli/packages/core/src/tool/edit-match-distance.js";
import {
  plainQuotes,
  restoreQuotes,
  stripReadNumbers,
  unicodeCharacters,
  visibleCharacters,
} from "../../../../apps/cli/packages/core/src/tool/edit-match-text.js";
import {
  findEditMatch,
  normalizeLineEndings,
  normalizeReplacementForMatch,
  preserveQuoteStyle,
} from "../../../../apps/cli/packages/core/src/tool/edit-matchers.js";
import {
  projectToolModelContract,
  resolveToolEntryModelContract,
} from "../../../../apps/cli/packages/core/src/tool/model-contract.js";
import {
  getToolPathApi,
  normalizeToolPathForComparison,
} from "../../../../apps/cli/packages/core/src/tool/path-normalization.js";
import {
  resolveToolWorkingDirectory,
  resolveWorkspacePath,
} from "../../../../apps/cli/packages/core/src/tool/path-policy.js";
import { orderProviderVisibleToolContracts } from "../../../../apps/cli/packages/core/src/tool/provider-visible-order.js";
import {
  READ_FILE_STATE_METADATA_SCHEMA_VERSION,
  createReadFileStateMetadata,
  createReadFileStateMetadataFromEntry,
  parseReadFileStateMetadata,
} from "../../../../apps/cli/packages/core/src/tool/read-file-state-metadata.js";
import {
  createReadFileStateKey,
  findEditableReadFileState,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../../../../apps/cli/packages/core/src/tool/read-file-state.js";
import {
  createToolRuleNameSet,
  filterDisallowedToolNames,
  isToolNameDisallowed,
  normalizeToolNameAlias,
} from "../../../../apps/cli/packages/core/src/tool/tool-visibility.js";
import { isWebFetchPreapprovedUrl } from "../../../../apps/cli/packages/core/src/tool/webfetch-preapproved.js";
import {
  isRecord,
  previewHookValue,
  summarizeInput,
} from "../../../../apps/cli/packages/core/src/tool/executor/utils.js";
import { isDynamicWorkflowRunDispatchToolName } from "../../../../apps/cli/packages/core/src/tool/executor/background-task-registry.js";
import { backgroundTaskOutputMetadata } from "../../../../apps/cli/packages/core/src/tool/executor/background-task-output.js";
import {
  formatPublishedArtifactLine,
  buildWorkflowArtifactsManifestSection,
  buildWorkflowArtifactsNotificationSection,
  toPublishedArtifactSummaries,
} from "../../../../apps/cli/packages/core/src/tool/executor/workflow-published-artifacts.js";
import {
  buildWorkflowReportsManifestSection,
  buildWorkflowReportsNotificationSection,
} from "../../../../apps/cli/packages/core/src/tool/executor/workflow-artifact.js";

test("B24 resolveBashTimeoutPolicy reads positive integers and falls back", () => {
  assert.equal(resolveBashTimeoutPolicy({}).defaultTimeoutMs, DEFAULT_BASH_TIMEOUT_MS);
  assert.equal(resolveBashTimeoutPolicy({}).maxTimeoutMs, DEFAULT_BASH_MAX_TIMEOUT_MS);
  assert.equal(
    resolveBashTimeoutPolicy({ BASH_DEFAULT_TIMEOUT_MS: "0" }).defaultTimeoutMs,
    DEFAULT_BASH_TIMEOUT_MS,
  );
  assert.equal(
    resolveBashTimeoutPolicy({ BASH_DEFAULT_TIMEOUT_MS: "abc" }).defaultTimeoutMs,
    DEFAULT_BASH_TIMEOUT_MS,
  );
  assert.equal(
    resolveBashTimeoutPolicy({ BASH_DEFAULT_TIMEOUT_MS: "1000ms" }).defaultTimeoutMs,
    1000,
  );
  const raised = resolveBashTimeoutPolicy({ BASH_DEFAULT_TIMEOUT_MS: "900000" });
  assert.equal(raised.defaultTimeoutMs, 900000);
  assert.equal(raised.maxTimeoutMs, 900000);
});

test("B25 resolveBashTimeoutMs clamps and treats 0/NaN as absent", () => {
  const policy = { defaultTimeoutMs: 100, maxTimeoutMs: 200 };
  assert.equal(resolveBashTimeoutMs(undefined, policy), 100);
  assert.equal(resolveBashTimeoutMs(0, policy), 100);
  assert.equal(resolveBashTimeoutMs(Number.NaN, policy), 100);
  assert.equal(resolveBashTimeoutMs(500, policy), 200);
  assert.equal(resolveBashTimeoutMs(50, policy), 50);
});

test("B26 isSubagentDispatchToolName covers Agent and Task only", () => {
  assert.equal(isSubagentDispatchToolName("Agent"), true);
  assert.equal(isSubagentDispatchToolName("Task"), true);
  assert.equal(isSubagentDispatchToolName("task"), false);
  assert.equal(isSubagentDispatchToolName(undefined), false);
  assert.equal(TASK_TOOL_NAME, "Task");
});

test("B27 hookMatcherToolNamesForTool returns fresh alias arrays", () => {
  assert.deepEqual(hookMatcherToolNamesForTool("Agent"), ["Agent", "Task"]);
  assert.deepEqual(hookMatcherToolNamesForTool("Task"), ["Task", "Agent"]);
  assert.deepEqual(hookMatcherToolNamesForTool("ApplyPatch"), ["ApplyPatch", "Write", "Edit"]);
  assert.deepEqual(hookMatcherToolNamesForTool("Unknown"), ["Unknown"]);
  assert.notEqual(hookMatcherToolNamesForTool("Agent"), hookMatcherToolNamesForTool("Agent"));
});

test("B28 createStructuredPatch yields hunks with three context lines", () => {
  assert.deepEqual(
    createStructuredPatch({ filePath: "a.ts", oldContent: "same\n", newContent: "same\n" }),
    [],
  );
  const hunks = createStructuredPatch({
    filePath: "a.ts",
    oldContent: "1\n2\n3\n4\n5\n6\n7\n",
    newContent: "1\n2\n3\nX\n5\n6\n7\n",
  });
  assert.equal(hunks.length, 1);
  assert.ok(hunks[0]!.lines.some((line) => line === "+X"));
  assert.ok(hunks[0]!.oldStart <= 4 && hunks[0]!.newStart <= 4);
});

test("B29 countPatchLines counts only +/- prefixed lines", () => {
  assert.deepEqual(countPatchLines([]), { additions: 0, deletions: 0 });
  assert.deepEqual(
    countPatchLines([{ lines: ["-y", "+x", " keep", "\\ No newline at end of file"] }] as never),
    { additions: 1, deletions: 1 },
  );
});

test("B30 editLineDistance is exact UTF-16 distance", () => {
  assert.equal(editLineDistance("", ""), 0);
  assert.equal(editLineDistance("abc", "abc"), 0);
  assert.equal(editLineDistance("abc", "abd"), 1);
  assert.equal(editLineDistance("\u{1F600}", "\u{1F601}"), 1);
  assert.equal(editLineDistance("", "abc"), 3);
});

test("B31 plainQuotes folds curly quotes", () => {
  assert.equal(plainQuotes("a\u2018b\u2019c\u201Cd\u201De"), "a'b'c\"d\"e");
});

test("B32 stripReadNumbers requires every line to carry a prefix", () => {
  assert.equal(stripReadNumbers("1: a\n2: b"), "a\nb");
  assert.equal(stripReadNumbers("1\ta"), "a");
  assert.equal(stripReadNumbers("1: a\nplain"), undefined);
  assert.equal(stripReadNumbers(""), undefined);
});

test("B33 visibleCharacters expands escapes and keeps the original reference otherwise", () => {
  assert.equal(visibleCharacters("a\\nb"), "a\nb");
  const plain = "plain";
  assert.equal(visibleCharacters(plain), plain);
  assert.equal(visibleCharacters("\\q"), "\\q");
});

test("B34 unicodeCharacters expands only 4-hex \\u escapes", () => {
  assert.equal(unicodeCharacters("\\u0041"), "A");
  assert.equal(unicodeCharacters("\\u00G1"), "\\u00G1");
  // 双反斜杠保留两个反斜杠，其余原样（B34）。
  assert.equal(unicodeCharacters("\\\\u0041"), "\\\\u0041");
});

test("B35 restoreQuotes restores curly quote style from the matched text", () => {
  const plain = "a'b";
  assert.equal(restoreQuotes("plain", plain), plain);
  assert.equal(restoreQuotes("\u2018x\u2019", "'a'"), "\u2018a\u2019");
  assert.equal(restoreQuotes("it\u2019s", "'it's'"), "\u2018it\u2019s\u2019");
});

test("B36 findEditMatch strategy order and short circuits", () => {
  const twice = findEditMatch({ content: "abXab", search: "ab", replaceAll: false });
  assert.equal(twice.status, "matched");
  assert.equal(twice.status === "matched" ? twice.strategy : "", "exact");
  assert.equal(twice.status === "matched" ? twice.candidateCount : 0, 2);

  const empty = findEditMatch({ content: "abcd", search: "", replaceAll: false });
  assert.equal(empty.status, "matched");
  assert.equal(empty.status === "matched" ? empty.strategy : "", "quote_normalized");
  assert.equal(empty.status === "matched" ? empty.candidateCount : 0, 5);
  assert.equal(empty.status === "matched" ? empty.actualString : "", "");

  const quoted = findEditMatch({ content: "a\u2018b\u2019", search: "'b'", replaceAll: false });
  assert.equal(quoted.status === "matched" ? quoted.strategy : "", "quote_normalized");
  assert.equal(quoted.status === "matched" ? quoted.actualString : "", "\u2018b\u2019");

  const replaceAll = findEditMatch({ content: "x\ny\n", search: "  y  ", replaceAll: true });
  assert.equal(replaceAll.status, "not_found");

  const trimmed = findEditMatch({ content: "a\n   y\nb\n", search: "  y  ", replaceAll: false });
  assert.equal(trimmed.status === "matched" ? trimmed.strategy : "", "line_trimmed");
  assert.equal(trimmed.status === "matched" ? trimmed.actualString : "", "   y");
});

test("B37 normalizeLineEndings folds CRLF only", () => {
  assert.equal(normalizeLineEndings("a\r\nb"), "a\nb");
  assert.equal(normalizeLineEndings("a\rb"), "a\rb");
});

test("B38 normalizeReplacementForMatch normalizes only the escape strategy", () => {
  const raw = "a\\nb";
  assert.equal(normalizeReplacementForMatch("exact", raw), raw);
  assert.equal(normalizeReplacementForMatch("escape_normalized", raw), "a\nb");
});

test("B39 preserveQuoteStyle returns the replacement when nothing was normalized", () => {
  const replacement = "new'";
  assert.equal(preserveQuoteStyle("old", "old", replacement), replacement);
  assert.equal(preserveQuoteStyle("old", "\u2018old\u2019", "'x'"), "\u2018x\u2019");
});

test("B40 resolveToolEntryModelContract projects only provided fields", () => {
  const base = { name: "T", metadata: { description: "d" }, inputSchema: { a: 1 } } as never;
  const withoutProjection = { ...base, resolveModelContract: () => undefined };
  const none = resolveToolEntryModelContract(withoutProjection as never, {} as never);
  assert.equal(none, withoutProjection);
  const empty = resolveToolEntryModelContract(
    { ...base, resolveModelContract: () => ({}) } as never,
    {} as never,
  );
  assert.notEqual(empty, base);
  assert.equal(
    (empty as never as { inputSchema: unknown }).inputSchema,
    (base as never as { inputSchema: unknown }).inputSchema,
  );
  const overwritten = resolveToolEntryModelContract(
    {
      ...base,
      metadata: { description: "d" },
      resolveModelContract: () => ({ description: undefined }),
    } as never,
    {} as never,
  );
  assert.equal(
    (overwritten as never as { metadata: { description: string } }).metadata.description,
    "d",
  );
});

test("B41 projectToolModelContract returns the original contract when nothing projects", () => {
  const contract = { name: "T", description: "d" } as never;
  assert.equal(projectToolModelContract(contract, undefined, {} as never), contract);
  assert.equal(
    projectToolModelContract(
      contract,
      { resolveModelContract: () => undefined } as never,
      {} as never,
    ),
    contract,
  );
  const projected = projectToolModelContract(
    contract,
    { resolveModelContract: () => ({ description: "x" }) } as never,
    {} as never,
  );
  assert.notEqual(projected, contract);
  assert.equal((projected as never as { description: string }).description, "x");
});

test("B42 getToolPathApi maps win32 and everything else", () => {
  assert.equal(getToolPathApi("win32"), path.win32);
  assert.equal(getToolPathApi("linux"), path.posix);
  assert.equal(getToolPathApi("darwin"), path.posix);
});

test("B43 normalizeToolPathForComparison normalizes per platform", () => {
  assert.equal(normalizeToolPathForComparison("/c/Users/a", "win32"), "C:\\Users\\a");
  assert.equal(normalizeToolPathForComparison("C:/x/../y", "win32"), "C:\\y");
  assert.equal(normalizeToolPathForComparison("\\\\?\\C:\\x", "win32"), "C:\\x");
  assert.equal(normalizeToolPathForComparison("\\\\?\\UNC\\srv\\share", "win32"), "\\\\srv\\share");
  // 非 win32 分支用的是宿主平台的 normalize（不是 path.posix.normalize）：见 known-differences.md K1。
  assert.equal(normalizeToolPathForComparison("/c/Users/a", "linux"), path.normalize("/c/Users/a"));
  assert.equal(normalizeToolPathForComparison("e\u0301", "linux").normalize("NFC"), "\u00e9");
});

test("B44 resolveWorkspacePath validates directories and joins relative paths", () => {
  const base = { workingDirectory: "/w", workspaceRoot: "/w", operation: "read" as const };
  assert.equal(resolveWorkspacePath({ ...base, inputPath: "a/b" }), path.resolve("/w", "a/b"));
  assert.equal(
    resolveWorkspacePath({ ...base, inputPath: "/etc/hosts" }),
    path.normalize("/etc/hosts"),
  );
  assert.throws(() => resolveWorkspacePath({ ...base, inputPath: "" }), /must not be empty/);
  assert.throws(
    () => resolveWorkspacePath({ ...base, workingDirectory: "relative", inputPath: "a" }),
    /must be an absolute path/,
  );
});

test("B45 resolveToolWorkingDirectory falls back to workingDirectory", () => {
  const base = { workingDirectory: "/w", workspaceRoot: "/w", operation: "execute" as const };
  assert.equal(resolveToolWorkingDirectory(undefined, base), path.normalize("/w"));
  assert.equal(resolveToolWorkingDirectory("", base), path.normalize("/w"));
  assert.equal(resolveToolWorkingDirectory("/x/y", base), path.normalize("/x/y"));
});

test("B46 orderProviderVisibleToolContracts sorts the reference set first", () => {
  const input = [{ name: "Zed" }, { name: "Bash" }, { name: "Read" }, { name: "alpha" }];
  assert.deepEqual(orderProviderVisibleToolContracts(input), [
    { name: "Bash" },
    { name: "Read" },
    { name: "Zed" },
    { name: "alpha" },
  ]);
  assert.deepEqual(input, [{ name: "Zed" }, { name: "Bash" }, { name: "Read" }, { name: "alpha" }]);
});

test("B47 createReadFileStateKey defaults offset to 1", () => {
  assert.equal(createReadFileStateKey("a", undefined, undefined, "linux"), "a\u00001\u0000");
  assert.equal(createReadFileStateKey("a", 0, undefined, "linux"), "a\u00000\u0000");
  assert.equal(createReadFileStateKey("a", 1, 0, "linux"), "a\u00001\u00000");
});

test("B48 normalizeReadFileStateMtimeMs floors", () => {
  assert.equal(normalizeReadFileStateMtimeMs(undefined), undefined);
  assert.equal(normalizeReadFileStateMtimeMs(1.9), 1);
  assert.equal(normalizeReadFileStateMtimeMs(-1.1), -2);
});

test("B49 findLatestReadFileState picks the newest matching entry", () => {
  const states = new Map([
    ["a", { path: "/a", readAt: new Date(1000) }],
    ["b", { path: "/a", readAt: new Date(2000) }],
    ["c", { path: "/b", readAt: new Date(9000) }],
  ]) as never;
  assert.equal(
    (findLatestReadFileState(states, "/a") as never as { readAt: Date }).readAt.getTime(),
    2000,
  );
  assert.equal(findLatestReadFileState(undefined, "/a"), undefined);
  const tie = new Map([
    ["x", { path: "/a", readAt: new Date(500) }],
    ["y", { path: "/a", readAt: new Date(500) }],
  ]) as never;
  assert.equal(
    (findLatestReadFileState(tie, "/a") as never as { readAt: Date }).readAt.getTime(),
    500,
  );
});

test("B50 findEditableReadFileState mirrors findLatestReadFileState", () => {
  const states = new Map([["a", { path: "/a", readAt: new Date(1000) }]]) as never;
  assert.equal(findEditableReadFileState(states, "/a"), findLatestReadFileState(states, "/a"));
});

test("B51 parseReadFileStateMetadata projects exactly eleven fields", () => {
  const good = {
    readFileState: {
      schemaVersion: READ_FILE_STATE_METADATA_SCHEMA_VERSION,
      tool: "Read",
      path: "p",
      content: "",
      isPartialView: false,
      readAtMs: 1,
      revisionId: "r",
      mtimeMs: 2,
      sizeBytes: 3,
      extra: "dropped",
    },
  };
  const parsed = parseReadFileStateMetadata(good);
  assert.ok(parsed);
  assert.equal(Object.hasOwn(parsed, "extra"), false);
  assert.equal(parsed.content, "");
  assert.equal(
    parseReadFileStateMetadata({ readFileState: { ...good.readFileState, schemaVersion: 2 } }),
    undefined,
  );
  assert.equal(parseReadFileStateMetadata(null), undefined);
  assert.equal(parseReadFileStateMetadata([]), undefined);
  const badOptional = parseReadFileStateMetadata({
    readFileState: { ...good.readFileState, offset: "1" },
  });
  assert.ok(badOptional);
  assert.equal(Object.hasOwn(badOptional, "offset"), false);
});

test("B52 createReadFileStateMetadataFromEntry refuses to invent freshness", () => {
  const completedAt = new Date(1234);
  assert.equal(createReadFileStateMetadataFromEntry({ completedAt, toolName: "Read" }), undefined);
  assert.equal(
    createReadFileStateMetadataFromEntry({
      completedAt,
      toolName: "Read",
      entry: { revisionId: "", mtimeMs: 1, sizeBytes: 1 } as never,
    }),
    undefined,
  );
  const snapshot = createReadFileStateMetadataFromEntry({
    completedAt,
    toolName: "Read",
    entry: {
      path: "p",
      content: "c",
      isPartialView: false,
      revisionId: "r",
      mtimeMs: 0,
      sizeBytes: 0,
      offset: 0,
    } as never,
  });
  assert.ok(snapshot);
  assert.equal(snapshot.readAtMs, 1234);
  assert.equal(snapshot.offset, 0);
});

test("B53 createReadFileStateMetadata gated on Read and output shape", () => {
  const readFileState = new Map([
    [
      createReadFileStateKey("p", undefined, undefined),
      { path: "p", content: "c", isPartialView: false, revisionId: "r", mtimeMs: 1, sizeBytes: 1 },
    ],
  ]) as never;
  const base = { completedAt: new Date(0), readFileState, toolInput: {}, toolName: "Read" };
  assert.equal(
    createReadFileStateMetadata({
      ...base,
      toolName: "Write",
      output: { type: "text", filePath: "p" },
    }),
    undefined,
  );
  assert.equal(createReadFileStateMetadata({ ...base, output: { type: "image" } }), undefined);
  assert.equal(
    createReadFileStateMetadata({ ...base, output: { type: "file_unchanged", filePath: "p" } })
      ?.revisionId,
    "r",
  );
  assert.equal(
    createReadFileStateMetadata({
      ...base,
      output: { type: "file_unchanged", filePath: "p" },
      readFileState: undefined,
    }),
    undefined,
  );
  assert.equal(
    createReadFileStateMetadata({
      ...base,
      toolInput: { offset: "1" },
      output: { type: "file_unchanged", filePath: "p" },
    })?.revisionId,
    "r",
  );
});

test("B54 normalizeToolNameAlias maps web_search", () => {
  assert.equal(normalizeToolNameAlias("web_search"), "WebSearch");
  assert.equal(normalizeToolNameAlias("WebSearch"), "WebSearch");
  assert.equal(normalizeToolNameAlias("web_search_extra"), "web_search_extra");
});

test("B55 createToolRuleNameSet trims and strips parameter lists", () => {
  const set = createToolRuleNameSet(["Bash(git:*)"]);
  assert.ok(set);
  assert.equal(set.has("Bash"), true);
  assert.equal(createToolRuleNameSet([""]), undefined);
  assert.equal(createToolRuleNameSet(["   "]), undefined);
  assert.equal(createToolRuleNameSet(undefined), undefined);
  const paren = createToolRuleNameSet(["(x)"]);
  assert.ok(paren);
  assert.equal(paren.has("(x)"), true);
});

test("B56 isToolNameDisallowed honours the alias", () => {
  assert.equal(isToolNameDisallowed("web_search", ["WebSearch"]), true);
  assert.equal(isToolNameDisallowed("WebSearch", ["web_search"]), true);
  assert.equal(isToolNameDisallowed("Read", []), false);
  assert.equal(isToolNameDisallowed("Read", undefined), false);
});

test("B57 filterDisallowedToolNames keeps the original array when there is no rule", () => {
  const names = ["Read", "web_search"];
  assert.equal(filterDisallowedToolNames(names, undefined), names);
  assert.deepEqual(filterDisallowedToolNames(names, ["WebSearch"]), ["Read"]);
});

test("B58 isWebFetchPreapprovedUrl checks hosts and path prefixes", () => {
  assert.equal(isWebFetchPreapprovedUrl("https://nodejs.org/api/x"), true);
  assert.equal(isWebFetchPreapprovedUrl("https://vercel.com/docs/x"), true);
  assert.equal(isWebFetchPreapprovedUrl("https://vercel.com/docsx"), false);
  assert.equal(isWebFetchPreapprovedUrl("https://vercel.com/docs/%2e%2e/secret"), false);
  assert.equal(isWebFetchPreapprovedUrl("https://vercel.com/%64ocs/x"), false);
  assert.equal(isWebFetchPreapprovedUrl("not-a-url"), false);
  assert.equal(isWebFetchPreapprovedUrl("https://example.com"), false);
});

test("B16 isRecord rejects null and arrays", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(new Date()), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord("x"), false);
  assert.equal(isRecord(1), false);
});

test("B17 summarizeInput shapes each input kind", () => {
  assert.deepEqual(summarizeInput(null), { type: "null" });
  assert.deepEqual(summarizeInput([1, 2]), { type: "array", length: 2 });
  assert.deepEqual(summarizeInput("abcd"), { type: "string", length: 4 });
  assert.deepEqual(summarizeInput(undefined), { type: "undefined" });
  assert.deepEqual(summarizeInput(true), { type: "boolean" });
  assert.deepEqual(summarizeInput(1), { type: "number" });
  const wide = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
  assert.equal(summarizeInput(wide).keys.length, 20);
  let reads = 0;
  const withGetter = Object.defineProperty({}, "a", {
    enumerable: true,
    get: () => ((reads += 1), 1),
  });
  summarizeInput(withGetter);
  assert.equal(reads, 0);
});

test("B18 previewHookValue truncates and falls back", () => {
  assert.equal(previewHookValue(""), "");
  assert.equal(previewHookValue(undefined), "");
  const exact = "x".repeat(4000);
  assert.equal(previewHookValue(exact), exact);
  const over = "x".repeat(4001);
  assert.equal(previewHookValue(over).length, 4000 + "...[truncated]".length);
  assert.ok(previewHookValue(over).endsWith("...[truncated]"));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(previewHookValue(circular), "[object Object]");
});

test("B23 backgroundTaskOutputMetadata resolves field precedence", () => {
  assert.deepEqual(
    Object.values(backgroundTaskOutputMetadata(undefined)).every((v) => v === undefined),
    true,
  );
  const noResult = backgroundTaskOutputMetadata({ stdoutBytes: 0 });
  assert.equal(noResult.outputTruncated, undefined);
  assert.equal(noResult.outputBytes, 0);
  const fallbackTail = backgroundTaskOutputMetadata({
    result: { stdout: { text: "" } },
    stdoutTail: "tail",
  });
  assert.equal(fallbackTail.outputTail, "tail");
  const files = backgroundTaskOutputMetadata({
    result: { stdout: { artifactPath: "out.txt" }, stderr: { artifactPath: "err.txt" } },
  });
  assert.equal(files.stdoutFile, "out.txt");
  assert.equal(files.outputFile, "out.txt");
  const truncated = backgroundTaskOutputMetadata({ result: { stdout: { truncated: true } } });
  assert.equal(truncated.outputTruncated, true);
});

test("B21 buildWorkflowReportsNotificationSection charges a byte budget", () => {
  assert.equal(buildWorkflowReportsNotificationSection(undefined), undefined);
  assert.equal(buildWorkflowReportsNotificationSection([]), undefined);
  const one = buildWorkflowReportsNotificationSection(["a"]);
  assert.ok(one);
  assert.equal(one.count, 1);
  assert.equal(one.shown, 1);
  assert.equal(one.preview, "[1] a");
  const many = buildWorkflowReportsNotificationSection(
    Array.from({ length: 10 }, (_, i) => `v${i}`),
  );
  assert.equal(many?.count, 10);
});

test("B22 buildWorkflowReportsManifestSection caps at eight entries", () => {
  const items = Array.from({ length: 10 }, (_, i) => `v${i}`);
  const manifest = buildWorkflowReportsManifestSection(items);
  assert.ok(manifest);
  assert.equal(manifest.count, 10);
  assert.equal(manifest.shown, 8);
  assert.equal(manifest.preview.length, 8);
  assert.equal(Array.isArray(manifest.preview), true);
});

test("B73 isDynamicWorkflowRunDispatchToolName excludes legacy Workflow", () => {
  assert.equal(isDynamicWorkflowRunDispatchToolName("CreateWorkflow"), true);
  assert.equal(isDynamicWorkflowRunDispatchToolName("AmendWorkflow"), true);
  assert.equal(isDynamicWorkflowRunDispatchToolName("ResumeWorkflowRun"), true);
  assert.equal(isDynamicWorkflowRunDispatchToolName("Workflow"), false);
  assert.equal(isDynamicWorkflowRunDispatchToolName(""), false);
});

test("B68/B69 published artifact lines and primary ordering", () => {
  assert.equal(
    formatPublishedArtifactLine({ id: "r", kind: "file", version: 2 }),
    "- r (file, v2)",
  );
  assert.equal(
    formatPublishedArtifactLine({ id: "r", kind: "file", version: 2, primary: true }),
    "- r (file, primary, v2)",
  );
  assert.equal(
    formatPublishedArtifactLine({ id: "c", kind: "chart", version: 1, itemCount: 1 }),
    "- c (chart, v1, 1 item)",
  );
  assert.equal(
    formatPublishedArtifactLine({ id: "c", kind: "chart", version: 1, itemCount: 0 }),
    "- c (chart, v1, 0 items)",
  );
  assert.equal(
    formatPublishedArtifactLine({ id: "f", kind: "file", version: 1, bytes: 0 }),
    "- f (file, v1, 0 bytes)",
  );
  assert.equal(
    formatPublishedArtifactLine({ id: "f", kind: "file", version: 1, title: "   " }),
    "- f (file, v1)",
  );
  const section = buildWorkflowArtifactsNotificationSection(
    [
      { id: "b", kind: "file", version: 1 },
      { id: "a", kind: "file", version: 1, primary: true },
    ],
    1,
  );
  assert.ok(section);
  assert.equal(section.count, 2);
  assert.equal(section.shown, 1);
  assert.ok(section.preview.startsWith("- a ("));
});

test("B70 buildWorkflowArtifactsNotificationSection reports real totals", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, kind: "file", version: 1 }));
  const section = buildWorkflowArtifactsNotificationSection(items, 8);
  assert.ok(section);
  assert.equal(section.count, 10);
  assert.equal(section.shown, 8);
  assert.equal(buildWorkflowArtifactsNotificationSection([], 8), undefined);
  assert.equal(buildWorkflowArtifactsNotificationSection(undefined, 8), undefined);
});

test("B71 buildWorkflowArtifactsManifestSection drops bad rows and reports truncation", () => {
  const artifacts = [
    { id: "ok", kind: "file", version: 1 },
    { id: "bad-kind", kind: "unknown", version: 1 },
    { id: "bad-version", kind: "file", version: 0 },
    { id: "x".repeat(65), kind: "file", version: 1 },
    { id: "long-type", kind: "file", version: 1, contentType: "t".repeat(256) },
  ] as never;
  const manifest = buildWorkflowArtifactsManifestSection(artifacts);
  assert.ok(manifest);
  assert.equal(manifest.artifacts.length, 2);
  assert.equal(manifest.artifacts[0]!.id, "ok");
  assert.equal(Object.hasOwn(manifest.artifacts[1]!, "contentType"), false);
  assert.equal(manifest.artifactsTruncated, true);
  assert.equal(buildWorkflowArtifactsManifestSection([]), undefined);
});

test("B72 toPublishedArtifactSummaries defends against malformed input", () => {
  assert.equal(toPublishedArtifactSummaries(null), undefined);
  assert.equal(toPublishedArtifactSummaries([]), undefined);
  assert.equal(toPublishedArtifactSummaries("x"), undefined);
  assert.equal(toPublishedArtifactSummaries([{ id: "a" }]), undefined);
  const parsed = toPublishedArtifactSummaries([
    { id: "a", kind: "file", version: 1, primary: 1, versions: [] },
    {
      id: "b",
      kind: "file",
      version: 2,
      versions: [{ bytes: 7 }, { bytes: 9 }],
      itemCount: 3,
      title: "t",
    },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.length, 2);
  assert.equal(Object.hasOwn(parsed[1]!, "primary"), false);
  assert.equal(parsed[1]!.bytes, 9);
  assert.equal(parsed[0]!.bytes, undefined);
});

test("B86 only Workflow/Bash family produce notification text", async () => {
  const { enqueueTerminalNotification } =
    await import("../../../../apps/cli/packages/core/src/tool/executor/background-tracker-notification.js");
  const queued: unknown[] = [];
  const logs: string[] = [];
  const registry = new Map<string, Record<string, unknown>>();
  const deps = {
    sessionId: "s",
    runtimeScope: "main",
    runtimeTaskRegistry: {
      get: (id: string) => registry.get(id),
      register: (entry: Record<string, unknown>) => void registry.set(String(entry.taskId), entry),
      update: (id: string, fn: (current: Record<string, unknown>) => Record<string, unknown>) => {
        const current = registry.get(id);
        if (!current) return undefined;
        const next = fn(current);
        registry.set(id, next);
        return next;
      },
      remove: (id: string) => void registry.delete(id),
    },
    enqueueBackgroundTaskNotification: (n: unknown) => void queued.push(n),
    logger: {
      debug: (m: string) => logs.push(`debug:${m}`),
      info: (m: string) => logs.push(`info:${m}`),
      warn: (m: string) => logs.push(`warn:${m}`),
    },
  } as never;
  const trace = { traceId: "t" } as never;
  registry.set("task-bash", {
    taskId: "task-bash",
    notified: false,
    status: "running",
    taskType: "local_bash",
  });
  enqueueTerminalNotification(
    deps,
    { id: "1", name: "Read", input: {} } as never,
    "task",
    "completed",
    trace,
  );
  assert.equal(queued.length, 0);
  assert.ok(logs.some((entry) => entry.includes("debug:")));

  enqueueTerminalNotification(
    deps,
    { id: "2", name: "Bash", input: { command: "sleep 1" } } as never,
    "task-bash",
    "cancelled",
    trace,
  );
  assert.equal(queued.length, 1);
  const notification = queued[0] as { text: string; originMeta?: { backgroundSource?: string } };
  assert.ok(notification.text.includes("was stopped"));
  assert.equal(notification.originMeta?.backgroundSource, "bash");

  enqueueTerminalNotification(
    deps,
    { id: "3", name: "Bash", input: { command: "x" } } as never,
    "task-bash",
    "completed",
    trace,
  );
  assert.equal(queued.length, 1);
});

test("B85 enqueue gates and releases the claim on failure", async () => {
  const { enqueueTerminalNotification } =
    await import("../../../../apps/cli/packages/core/src/tool/executor/background-tracker-notification.js");
  const registry = new Map<string, { notified?: boolean }>();
  let calls = 0;
  const deps = {
    sessionId: "s",
    runtimeScope: "main",
    runtimeTaskRegistry: {
      get: (id: string) => registry.get(id),
      update: (id: string, fn: (current: unknown) => unknown) => {
        const current = registry.get(id) ?? {
          taskId: id,
          notified: false,
          status: "running",
          taskType: "local_bash",
        };
        const next = fn(current) as { notified?: boolean };
        registry.set(id, next);
        return next;
      },
      register: () => undefined,
      remove: (id: string) => void registry.delete(id),
    },
    enqueueBackgroundTaskNotification: () => {
      calls += 1;
      if (calls === 1) throw new Error("queue down");
    },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined },
    shouldEnqueueBackgroundTaskNotification: () => undefined,
  } as never;
  const call = { id: "1", name: "Bash", input: { command: "x" } } as never;
  const trace = { traceId: "t" } as never;
  registry.set("t1", { notified: false });
  enqueueTerminalNotification(deps, call, "t1", "completed", trace);
  assert.equal(registry.get("t1")?.notified, false);
  enqueueTerminalNotification(deps, call, "t1", "completed", trace);
  assert.equal(registry.get("t1")?.notified, true);
  assert.equal(calls, 2);

  const policyDeps = {
    ...(deps as object),
    shouldEnqueueBackgroundTaskNotification: () => false,
  } as never;
  registry.set("t2", { notified: false });
  enqueueTerminalNotification(policyDeps, call, "t2", "completed", trace);
  assert.equal(registry.get("t2")?.notified, false);
});

test("B75/B76/B77/B78 registry lifecycle through the public helpers", async () => {
  const mod =
    await import("../../../../apps/cli/packages/core/src/tool/executor/background-task-registry.js");
  const entries = new Map<string, Record<string, unknown>>();
  const registered: Record<string, unknown>[] = [];
  const deps = {
    runtimeTaskRegistry: {
      get: (id: string) => entries.get(id),
      register: (entry: Record<string, unknown>) => {
        registered.push(entry);
        entries.set(String(entry.taskId), entry);
      },
      update: (id: string, fn: (current: Record<string, unknown>) => Record<string, unknown>) => {
        const current = entries.get(id);
        if (!current) return undefined;
        const next = fn(current);
        entries.set(id, next);
        return next;
      },
      remove: (id: string) => void entries.delete(id),
    },
  } as never;
  const bash = { id: "call-1", name: "Bash", input: { command: "sleep" } } as never;
  mod.registerRuntimeBackgroundTask(deps, bash, "t1", { stdoutBytes: 0 });
  assert.equal(registered.length, 1);
  assert.equal(Object.hasOwn(registered[0]!, "branchGeneration"), false);
  assert.equal(entries.get("t1")!.status, "running");
  assert.equal(entries.get("t1")!.taskType, "local_bash");
  mod.registerRuntimeBackgroundTask(deps, bash, "t1", { stdoutBytes: 0 });
  assert.equal(registered.length, 1);

  mod.updateRuntimeBackgroundTask(deps, bash, "t1", "timed_out", { pid: 7 });
  assert.equal(entries.get("t1")!.status, "killed");
  assert.equal(entries.get("t1")!.pid, 7);
  const terminalSnapshot = { ...entries.get("t1")! };
  mod.updateRuntimeBackgroundTask(deps, bash, "t1", "completed");
  assert.equal(entries.get("t1")!.status, terminalSnapshot.status);

  assert.equal(mod.claimRuntimeBackgroundTaskNotification(deps, bash, "t1"), true);
  assert.equal(mod.claimRuntimeBackgroundTaskNotification(deps, bash, "t1"), false);
  mod.releaseRuntimeBackgroundTaskNotification(deps, bash, "t1");
  assert.equal(mod.claimRuntimeBackgroundTaskNotification(deps, bash, "t1"), true);

  const unknown = { id: "call-2", name: "Read", input: {} } as never;
  assert.equal(mod.claimRuntimeBackgroundTaskNotification(deps, unknown, "missing"), true);

  mod.registerRuntimeBackgroundTask(
    deps,
    { id: "call-3", name: "CreateWorkflow", input: {} } as never,
    "t1",
    {},
  );
  assert.equal(entries.get("t1")!.notified, false);
  assert.equal(entries.get("t1")!.taskType, "local_dynamic_workflow");
  mod.removeRuntimeBackgroundTask(deps, bash, "t1");
  assert.equal(entries.has("t1"), false);
});
