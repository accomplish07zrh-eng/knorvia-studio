// SPDX-License-Identifier: Apache-2.0
// shared-types（B1/B2）与 i18n（B3–B8）合同测试。
//
// 纯类型包没有可失败的运行期用例，B1/B2 的运行期断言并入本文件的 i18n 调用：
// 桩替换后 getKnorviaCopy 抛错，整条用例失败（known-differences.md §二.1）。
import assert from "node:assert/strict";
import test from "node:test";
import { declarationText, load } from "./entry.mjs";

const supportedTypeNames = [
  "GlobalDetectedLocale",
  "GlobalLocale",
  "GlobalOptions",
  "GlobalOutputFormat",
  "JsonValue",
  "RunContext",
  "RuntimeInfo",
];

test("B1 shared-types 运行期面为空且类型名固定", async () => {
  const sharedTypes = await load("shared-types");
  assert.deepEqual(Object.keys(sharedTypes), []);

  const declared = [...declarationText("shared-types").matchAll(/export type\s+(\w+)\s*=/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(declared, supportedTypeNames);

  const i18n = await load("i18n");
  assert.equal(i18n.getKnorviaCopy().locale, "en-US");
});

test("B2 shared-types 结构与可选性", async () => {
  const text = declarationText("shared-types");
  for (const fragment of [
    "argv: string[]",
    "stderr: NodeJS.WriteStream",
    "stdin: NodeJS.ReadStream",
    "stdout: NodeJS.WriteStream",
    'GlobalLocale = "auto" | "en-US" | "zh-CN"',
    'Exclude<GlobalLocale, "auto">',
    'GlobalOutputFormat = "text" | "json" | "stream-json"',
    "force: boolean",
    "json: boolean",
    "noColor: boolean",
    "verbose: boolean",
    "browserExecutable?: string",
    'browserUse?: "headless"',
    "detectedLocale?: GlobalDetectedLocale",
    "locale?: GlobalLocale",
    "memoryBench?: boolean",
    "outputFormat?: GlobalOutputFormat",
    "arch: NodeJS.Architecture",
    "cwd: string",
    "execPath: string",
    "node: string",
    "platform: NodeJS.Platform",
    "sea: boolean",
    "versions: NodeJS.ProcessVersions",
    "JsonValue[]",
  ]) {
    assert.ok(text.includes(fragment), `missing type fragment: ${fragment}`);
  }
});

test("B3 locale 常量与大小写敏感谓词", async () => {
  const { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, isUiLocale } = await load("i18n");
  assert.equal(DEFAULT_LOCALE, "en-US");
  assert.deepEqual([...SUPPORTED_LOCALES], ["en-US", "zh-CN"]);
  for (const value of ["en-US", "zh-CN"]) {
    assert.equal(isSupportedLocale(value), true);
    assert.equal(isUiLocale(value), true);
  }
  assert.equal(isUiLocale("auto"), true);
  for (const value of ["en", "en-us", "EN-US", "zh", "zh-cn", "", undefined]) {
    assert.equal(isSupportedLocale(value), false, `isSupportedLocale(${String(value)})`);
  }
  assert.equal(isUiLocale("AUTO"), false);
  assert.equal(isUiLocale("en"), false);
});

test("B4 detectLocale 按固定顺序探测并归一", async () => {
  const { detectLocale } = await load("i18n");
  assert.equal(detectLocale({ env: { LC_ALL: "zh_CN.UTF-8" } }), "zh-CN");
  assert.equal(detectLocale({ env: { LC_ALL: "C", LANG: "zh_CN.UTF-8" } }), "zh-CN");
  assert.equal(detectLocale({ env: { LC_ALL: "POSIX", LC_MESSAGES: "en_GB" } }), "en-US");
  assert.equal(detectLocale({ env: { LC_MESSAGES: "fr_FR", LANG: "en_US" } }), "en-US");
  assert.equal(detectLocale({ env: { LANGUAGE: "fr_FR:zh_CN" } }), "zh-CN");
  assert.equal(detectLocale({ env: { LANGUAGE: " de_DE : en_US " } }), "en-US");
  assert.equal(detectLocale({ env: { LANG: "  ", LC_ALL: "" }, intlLocale: "en-GB" }), "en-US");
  assert.equal(detectLocale({ env: { LANG: " de_DE " }, intlLocale: "zh-TW" }), "zh-CN");
  assert.equal(detectLocale({ env: { LANG: "en_US@euro" } }), "en-US");
  assert.equal(detectLocale({ env: { LANG: "C.UTF-8" }, intlLocale: null }), undefined);
  assert.equal(detectLocale({ env: {} }), undefined);
  assert.equal(detectLocale(), undefined);

  const previous = process.env.LANG;
  process.env.LANG = "zh_CN.UTF-8";
  try {
    assert.equal(detectLocale({ env: {} }), undefined);
  } finally {
    if (previous === undefined) delete process.env.LANG;
    else process.env.LANG = previous;
  }
});

test("B5 resolveLocale 解析、auto 与回落", async () => {
  const { DEFAULT_LOCALE, resolveLocale } = await load("i18n");
  assert.equal(DEFAULT_LOCALE, "en-US");
  assert.equal(resolveLocale("auto", "zh-CN"), "zh-CN");
  assert.equal(resolveLocale("auto", "en-US"), "en-US");
  assert.equal(resolveLocale("auto", "de-DE"), "en-US");
  assert.equal(resolveLocale("auto", null), "en-US");
  assert.equal(resolveLocale("auto"), "en-US");
  assert.equal(resolveLocale(undefined, "zh-CN"), "en-US");
  assert.equal(resolveLocale("zh-CN"), "zh-CN");
  assert.equal(resolveLocale("zh"), "zh-CN");
  assert.equal(resolveLocale("zh_CN.UTF-8"), "zh-CN");
  assert.equal(resolveLocale("en"), "en-US");
  assert.equal(resolveLocale("C"), "en-US");
  assert.equal(resolveLocale("de-DE"), "en-US");
});

test("B6 getKnorviaCopy 选择与对象身份", async () => {
  const { getKnorviaCopy } = await load("i18n");
  assert.equal(getKnorviaCopy(), getKnorviaCopy("en-US"));
  assert.equal(getKnorviaCopy("zh-CN"), getKnorviaCopy("auto", "zh-CN"));
  assert.notEqual(getKnorviaCopy("en-US"), getKnorviaCopy("zh-CN"));
  assert.equal(getKnorviaCopy("zh-CN").locale, "zh-CN");
  assert.equal(getKnorviaCopy("en-US").locale, "en-US");
  assert.equal(getKnorviaCopy("de-DE").locale, "en-US");
  assert.equal(getKnorviaCopy("zh").locale, "zh-CN");
});

function catalogPaths(value, prefix = "") {
  const leaves = new Map();
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const entry of catalogPaths(child, prefix ? `${prefix}.${key}` : key)) {
        leaves.set(entry[0], entry[1]);
      }
    }
    return leaves;
  }
  leaves.set(prefix, value);
  return leaves;
}

test("B7 两套目录递归同构且无空叶子", async () => {
  const { getKnorviaCopy } = await load("i18n");
  const en = getKnorviaCopy("en-US");
  const zh = getKnorviaCopy("zh-CN");
  assert.deepEqual(Object.keys(en).sort(), ["cli", "locale", "tui"]);
  assert.deepEqual(Object.keys(zh).sort(), ["cli", "locale", "tui"]);

  const enLeaves = catalogPaths(en);
  const zhLeaves = catalogPaths(zh);
  assert.deepEqual([...enLeaves.keys()].sort(), [...zhLeaves.keys()].sort());
  for (const [path, value] of enLeaves) {
    const other = zhLeaves.get(path);
    assert.equal(typeof other, typeof value, `leaf type differs at ${path}`);
    if (typeof value === "function") {
      assert.equal(other.length, value.length, `function arity differs at ${path}`);
    } else {
      assert.equal(typeof value, "string", `unexpected leaf at ${path}`);
      assert.notEqual(value.length, 0, `empty en-US leaf at ${path}`);
      assert.notEqual(other.length, 0, `empty zh-CN leaf at ${path}`);
    }
  }

  const hasPath = (copy, path) => {
    let node = copy;
    for (const segment of path.split(".")) {
      if (node === null || typeof node !== "object" || !(segment in node)) return false;
      node = node[segment];
    }
    return true;
  };
  for (const path of [
    "tui.copy",
    "tui.effort",
    "tui.input",
    "tui.modelConfigurationRequired",
    "tui.model",
    "tui.sidebar",
    "tui.status",
    "tui.terminal",
    "tui.transcript",
    "tui.selection",
    "tui.fileMention",
    "tui.slash",
    "tui.sidebar.subagents",
    "tui.sidebar.api",
    "tui.sidebar.cache",
    "tui.sidebar.context",
    "tui.sidebar.modifiedFiles",
    "tui.sidebar.mcp",
    "tui.sidebar.request",
    "tui.sidebar.status",
    "tui.sidebar.run",
    "tui.sidebar.sections",
    "tui.sidebar.shellSubtitle",
    "tui.sidebar.title",
    "tui.sidebar.todos",
    "tui.transcript.compact",
    "tui.transcript.roles",
    "tui.transcript.thought",
    "tui.transcript.title",
    "tui.transcript.workflow",
  ]) {
    assert.ok(hasPath(en, path), `missing en-US catalog path: ${path}`);
    assert.ok(hasPath(zh, path), `missing zh-CN catalog path: ${path}`);
  }
  assert.equal(en.locale, "en-US");
  assert.equal(zh.locale, "zh-CN");
});

function assertText(value, label, ...facts) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.notEqual(value.length, 0, `${label} must not be empty`);
  for (const fact of facts) {
    assert.ok(value.includes(fact), `${label} must mention ${JSON.stringify(fact)}: ${value}`);
  }
}

test("B8 参数语义（两种语言都保留事实）", async () => {
  const { getKnorviaCopy } = await load("i18n");
  for (const code of ["en-US", "zh-CN"]) {
    const copy = getKnorviaCopy(code);
    const tui = copy.tui;

    assertText(
      tui.model.retryScheduled({
        attempt: 2,
        delay: "3s",
        maxAttempts: 5,
        reason: "rate_limited",
      }),
      `${code} model.retryScheduled`,
      "2/4",
      "3s",
      "rate_limited",
    );
    assertText(tui.model.responseReceivedWithTokens("1234"), `${code} tokens`, "1234");
    assertText(
      tui.transcript.workflow.interruptedNotice({ label: "Audit", runId: "run-9" }),
      `${code} interruptedNotice`,
      "Audit",
      "run-9",
      "/dwf resume run-9",
    );
    assertText(
      tui.transcript.compact.retrying({ attempt: 2, maxAttempts: 4 }),
      `${code} compact.retrying`,
      "2/4",
    );
    const unboundedRetry = tui.transcript.compact.retrying({ attempt: 2, maxAttempts: 0 });
    assertText(unboundedRetry, `${code} compact.retrying unlimited`);
    assert.ok(!unboundedRetry.includes("2/0"), `${code} unlimited retry must not show 2/0`);

    assertText(tui.selection.disabled("busy"), `${code} selection.disabled`, "busy");
    assertText(
      tui.selection.filterLine({ filter: "needle", help: "custom help" }),
      `${code} filterLine`,
      "needle",
      "custom help",
    );
    assertText(
      tui.selection.filterLine({ filter: "", help: undefined }),
      `${code} empty filterLine`,
      tui.selection.noFilter,
    );
    assert.notEqual(tui.sidebar.mcp.tools(1), tui.sidebar.mcp.tools(2));
    assertText(tui.sidebar.mcp.tools(2), `${code} mcp.tools`, "2");
    assertText(tui.sidebar.mcp.summary({ connected: 2, total: 5 }), `${code} mcp.summary`, "2/5");
    assertText(
      tui.sidebar.cache.readWrite({ read: "11", write: "22" }),
      `${code} cache`,
      "11",
      "22",
    );
    assertText(tui.status.permissionRequested("Bash"), `${code} permissionRequested`, "Bash");
    assertText(tui.status.permissionResolved("Bash"), `${code} permissionResolved`, "Bash");
    assertText(tui.status.targetChanged("set"), `${code} targetChanged`, "set");
    assertText(tui.sidebar.request.errorWithStatus(404), `${code} errorWithStatus`, "404");
    assertText(tui.sidebar.run.draftChars(42), `${code} draftChars`, "42");
    for (const [label, value, count] of [
      ["todos.more", tui.sidebar.todos.more(3), "3"],
      ["modifiedFiles.more", tui.sidebar.modifiedFiles.more(4), "4"],
      ["api.more", tui.sidebar.api.more(5), "5"],
      ["subagents.ended", tui.sidebar.subagents.ended(6), "6"],
    ]) {
      assertText(value, `${code} ${label}`, count);
    }
    assertText(
      tui.transcript.workflow.collapsed({
        label: "Audit",
        status: "running",
        nodesSettled: 2,
        nodesTotal: 5,
      }),
      `${code} workflow.collapsed`,
      "Audit",
      "running",
      "2/5",
    );
    assertText(
      tui.transcript.workflow.nodes({ nodesSettled: 2, nodesTotal: 5 }),
      `${code} workflow.nodes`,
      "2/5",
    );
    assertText(
      tui.transcript.workflow.usage({ spentTokens: "99" }),
      `${code} workflow.usage`,
      "99",
    );
    assertText(
      tui.transcript.workflow.actorRow({ name: "Reviewer", status: "running" }),
      `${code} actorRow`,
      "Reviewer",
      "running",
    );
    assertText(tui.transcript.workflow.error("boom"), `${code} workflow.error`, "boom");
    assertText(tui.transcript.workflow.result("preview"), `${code} workflow.result`, "preview");
    assertText(tui.input.queuedTitle(3), `${code} queuedTitle`, "3");
    assertText(tui.input.queuedMore(4), `${code} queuedMore`, "4");
    assertText(
      tui.input.restoredPreviousInputWithAttachments(2),
      `${code} restoredWithAttachments`,
      "2",
    );

    const selectedFile = tui.fileMention.row({ path: "src/a.ts", selected: true });
    const unselectedFile = tui.fileMention.row({ path: "src/a.ts", selected: false });
    assert.notEqual(selectedFile, unselectedFile);
    assert.ok(selectedFile.includes("src/a.ts"), `${code} selected file row has path`);
    assert.ok(unselectedFile.includes("src/a.ts"), `${code} unselected file row has path`);
    assert.notEqual(selectedFile[0], unselectedFile[0], `${code} file row prefix marks selection`);
    const selectedSlash = tui.slash.row({ name: "help", selected: true, summary: "s" });
    const unselectedSlash = tui.slash.row({ name: "help", selected: false, summary: "s" });
    assert.notEqual(selectedSlash, unselectedSlash);
    assert.ok(selectedSlash.includes("help"), `${code} selected slash row has name`);
    assert.ok(unselectedSlash.includes("help"), `${code} unselected slash row has name`);
    assert.notEqual(
      selectedSlash[0],
      unselectedSlash[0],
      `${code} slash row prefix marks selection`,
    );

    assertText(
      copy.cli.errors.localeUnsupported("xx-YY"),
      `${code} localeUnsupported`,
      "xx-YY",
      "en-US",
      "zh-CN",
      "auto",
    );
    assertText(
      copy.cli.help("9.9.9"),
      `${code} help`,
      "9.9.9",
      "app-server",
      "commands",
      "doctor",
      "plugins",
      "skills",
      "tui",
      "version",
      "--prompt",
      "--resume",
      "--locale",
      "--mode",
    );
  }
});
