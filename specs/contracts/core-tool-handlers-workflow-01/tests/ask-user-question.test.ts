// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: AskUserQuestion interaction handshake. The gate is a
// decision sequence, not a timer: execution must refuse until answers exist, then return a projection
// carrying exactly the collected answers. Asserted as an ordered event sequence; no sleeps.
import assert from "node:assert/strict";
import { test } from "node:test";

import { askUserQuestionToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/ask-user-question.js";
import { executeAnsweredQuestion } from "../../../../apps/cli/packages/core/src/tool/handlers/ask-user-question-result.js";

const QUESTION = {
  question: "Which library should we use?",
  header: "Library",
  options: [
    { label: "date-fns", description: "Small and modular." },
    { label: "dayjs", description: "Familiar API." },
  ],
};

const CONTEXT = { toolCallId: "call-auq", sessionId: "sess" } as never;

test("B-au-1 门握手：答案没到位就拒绝，到位才执行；三次调用零共享状态", async () => {
  const events: string[] = [];

  // 第一步：只问未答 —— handler 必须拒绝执行。
  await executeAnsweredQuestion({ questions: [QUESTION] }, CONTEXT).then(
    () => events.push("unexpected:return"),
    (error: unknown) => events.push(`refuse:${(error as { type: string }).type}`),
  );

  // 第二步：答案是空串 —— 同一道门，但拒绝理由指向具体问题。
  await executeAnsweredQuestion(
    { questions: [QUESTION], answers: { [QUESTION.question]: "  " } },
    CONTEXT,
  ).then(
    () => events.push("unexpected:return"),
    (error: unknown) =>
      events.push(
        `refuse:${(error as { context: { issues: { message: string }[] } }).context.issues[0]!.message.slice(0, 5)}`,
      ),
  );

  // 第三步：答案到位 —— 执行并回投影。
  const answered = await executeAnsweredQuestion(
    { questions: [QUESTION], answers: { [QUESTION.question]: "date-fns" } },
    CONTEXT,
  );
  events.push(
    answered.answers[QUESTION.question] === "date-fns" ? "return" : "unexpected:projection",
  );

  assert.deepEqual(events, ["refuse:tool_execution_failed", "refuse:Blank", "return"]);
});

test("B-au-2 未回答的拒绝是结构化 CoreError：可恢复、带问题清单与调用关联", async () => {
  await assert.rejects(
    executeAnsweredQuestion({ questions: [QUESTION] }, CONTEXT),
    (error: never) => {
      assert.equal(error.message, "AskUserQuestion requires user answers before execution");
      assert.equal(error.type, "tool_execution_failed");
      assert.equal(error.recoverable, true);
      assert.deepEqual(error.context, {
        issues: [{ message: "Answers have not been collected yet", path: ["answers"] }],
        toolCallId: "call-auq",
        toolName: "AskUserQuestion",
      });
      return true;
    },
  );
});

test("B-au-3 空白答案逐条点名，错误路径定位到问题文本", async () => {
  await assert.rejects(
    executeAnsweredQuestion(
      {
        questions: [QUESTION, { ...QUESTION, question: "Second question?" }],
        answers: { [QUESTION.question]: "   ", "Second question?": "ok" },
      },
      CONTEXT,
    ),
    (error: never) => {
      assert.deepEqual(error.context.issues, [
        {
          message: `Blank answer is not allowed for question: ${QUESTION.question}`,
          path: ["answers", QUESTION.question],
        },
      ]);
      return true;
    },
  );
});

test("B-au-4 通过后的投影只带三块：questions → answers → annotations，缺省按契约补/省", async () => {
  const withAnnotations = await executeAnsweredQuestion(
    {
      questions: [QUESTION],
      answers: { [QUESTION.question]: "date-fns" },
      annotations: { [QUESTION.question]: { notes: "keep it small" } },
      metadata: { source: "remember" },
    },
    CONTEXT,
  );
  // metadata 是入参专用的跟踪字段：不进结果投影（未知字段不保留）。
  assert.deepEqual(Object.keys(withAnnotations), ["questions", "answers", "annotations"]);
  assert.deepEqual(withAnnotations, {
    questions: [{ ...QUESTION, multiSelect: false }],
    answers: { [QUESTION.question]: "date-fns" },
    annotations: { [QUESTION.question]: { notes: "keep it small" } },
  });
  // 字段顺序是转录面的事实：JSON 序列化序钉住 questions → answers → annotations。
  assert.equal(
    JSON.stringify(withAnnotations),
    `{"questions":[${JSON.stringify({ ...QUESTION, multiSelect: false })}],"answers":${JSON.stringify({ [QUESTION.question]: "date-fns" })},"annotations":${JSON.stringify({ [QUESTION.question]: { notes: "keep it small" } })}}`,
  );

  // answers 缺席字段补成空对象；annotations 缺席整键省略。
  const bare = await executeAnsweredQuestion({ questions: [QUESTION], answers: {} }, CONTEXT);
  assert.deepEqual(Object.keys(bare), ["questions", "answers"]);
  assert.deepEqual(bare.answers, {});
  // multiSelect 缺省为 false：默认值在 schema 上，结果里总是显式在场。
  assert.equal((bare.questions[0] as { multiSelect: boolean }).multiSelect, false);
});

test("B-tp-5 AskUserQuestion 工具声明：用户交互工具，30s 预算，取消有用户可见文案", () => {
  const entry = askUserQuestionToolEntry;
  assert.equal(entry.metadata.name, "AskUserQuestion");
  assert.equal(entry.metadata.readOnly, true);
  assert.equal(entry.metadata.destructive, false);
  assert.equal(entry.metadata.concurrentSafe, true);
  assert.equal(entry.metadata.requiresUserInteraction, true);
  assert.equal(entry.metadata.timeoutMs, 30_000);
  assert.equal(entry.metadata.maxOutputBytes, 100_000);
  assert.equal(entry.metadata.sideEffectScope, "userInteraction");
  assert.equal(entry.metadata.riskLevel, "low");
  assert.equal(entry.metadata.needsApproval, true);
  assert.equal(entry.permission.permission, "userInteraction.askQuestion");
  assert.deepEqual(entry.permission.patternSources, ["toolName", "input"]);
  assert.deepEqual(entry.permission.alwaysAllowPatternSources, ["toolName"]);
  assert.equal(entry.permission.denyPriority, "beforeAsk");
  assert.deepEqual(entry.resultBudget, {
    maxInlineBytes: 100_000,
    maxModelBytes: 100_000,
    strategy: "truncate",
    preview: { maxBytes: 100_000, direction: "head" },
  });
  assert.deepEqual(entry.timeout, {
    defaultMs: 30_000,
    maxMs: 30_000,
    allowCallOverride: false,
  });
  assert.deepEqual(entry.cancellation, {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "AskUserQuestion was cancelled before answers were returned",
  });
  assert.deepEqual(entry.trace, {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  });
  assert.equal(typeof entry.formatModelContent, "function");
});

test("B-tp-5 工具描述点明使用门槛、Other、multiSelect、推荐项与 preview 规则", () => {
  const text = askUserQuestionToolEntry.metadata.description;
  assert.match(
    text,
    /Use this tool only when you are blocked on a decision that is genuinely the user's to make/u,
  );
  assert.match(text, /Users will always be able to select "Other" to provide custom text input/u);
  assert.match(text, /Use multiSelect: true to allow multiple answers/u);
  assert.match(text, /add "\(Recommended\)" at the end of the label/u);
  assert.match(text, /Plan mode note: To switch into plan mode, use EnterPlanMode/u);
  assert.match(text, /Preview feature:/u);
  assert.match(
    text,
    /previews are only supported for single-select questions \(not multiSelect\)/u,
  );
});
