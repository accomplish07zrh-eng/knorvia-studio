import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

export const reviewFiles = {
  "one.txt": "first isolated result\n",
  "two.txt": "second isolated result\n",
  "conflict.txt": "isolated edit\n",
};
export const groupId = "grp_review_acceptance";
export const groupName = "Offline multi-file review";

/** 真实运行时消费的模型协议夹具：规划 → 三次文件工具调用 → 复核，不替换业务服务。 */
export async function reviewServer() {
  let stage = "plan";
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const hasTools = body.tools?.length > 0;
    const messages = JSON.stringify(body.messages ?? []);
    requests.push({ hasTools, stage });
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish_reason = null) =>
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 0, model: "local-fixture-model", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    const plain = (content) =>
      response.end(chunk({ role: "assistant", content }) + chunk({}, "stop") + "data: [DONE]\n\n");
    if (!hasTools) return plain("Local fixture reply.");
    if (stage === "plan") {
      stage = "read";
      return plain(
        JSON.stringify({
          tasks: [
            {
              id: "t1",
              member: "knorvia",
              instruction: "Write one.txt, two.txt and conflict.txt in the isolated workspace.",
            },
          ],
        }),
      );
    }
    if (stage === "read") {
      stage = "write";
      return response.end(
        chunk({
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "call_read_conflict",
              type: "function",
              function: { name: "Read", arguments: JSON.stringify({ file_path: "conflict.txt" }) },
            },
          ],
        }) +
          chunk({}, "tool_calls") +
          "data: [DONE]\n\n",
      );
    }
    if (stage === "write") {
      stage = "tools";
      const tool_calls = Object.entries(reviewFiles).map(([file_path, content], index) => ({
        index,
        id: `call_review_${index}`,
        type: "function",
        function: { name: "Write", arguments: JSON.stringify({ file_path, content }) },
      }));
      return response.end(
        chunk({ role: "assistant", tool_calls }) + chunk({}, "tool_calls") + "data: [DONE]\n\n",
      );
    }
    if (stage === "tools" && messages.includes("tool_call_id")) {
      stage = "review";
      return plain("All three files were written.");
    }
    stage = "done";
    return plain(
      JSON.stringify({ status: "complete", summary: "Three isolated changes ready for review." }),
    );
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    close: () => new Promise((done) => server.close(done)),
  };
}

export function seedReviewGroup(dataRoot, project) {
  const db = new DatabaseSync(join(dataRoot, ".knorvia-studio/studio/studio.sqlite"));
  try {
    db.exec("BEGIN IMMEDIATE");
    const sequence = Number(
      db
        .prepare(
          "UPDATE studio_meta SET value=CAST(value AS INTEGER)+1 WHERE key='sequence' RETURNING value",
        )
        .get().value,
    );
    const definition = {
      id: groupId,
      name: groupName,
      goal: "verify multi-file review",
      members: ["knorvia"],
      host: "knorvia",
      sharedSummary: "",
      mode: "task",
      workspaceMode: "isolated",
      workspacePath: project,
      createdAt: 1,
      updatedAt: 1,
    };
    db.prepare("INSERT INTO studio_entities VALUES ('group',?,?,?,?)").run(
      groupId,
      groupId,
      JSON.stringify(definition),
      sequence,
    );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

export function readReviewRun(dataRoot) {
  const db = new DatabaseSync(join(dataRoot, ".knorvia-studio/studio/studio.sqlite"), {
    readOnly: true,
  });
  try {
    const runs = db
      .prepare("SELECT value FROM studio_entities WHERE kind='run'")
      .all()
      .map((row) => JSON.parse(row.value))
      .filter((run) => run.targetId === groupId);
    assert(runs.length <= 1, "The acceptance must not submit or replay another run");
    return runs[0];
  } finally {
    db.close();
  }
}

export function readAcceptances(dataRoot, runId) {
  const db = new DatabaseSync(join(dataRoot, ".knorvia-studio/studio/studio.sqlite"), {
    readOnly: true,
  });
  try {
    return db
      .prepare("SELECT value FROM studio_entities WHERE kind='apply-acceptance'")
      .all()
      .map((row) => JSON.parse(row.value))
      .filter((item) => item.runId === runId);
  } finally {
    db.close();
  }
}

export async function configureReviewProvider(page, baseUrl) {
  assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++)
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  await page.getByTestId("studio-first-run-provider").click();
  await page
    .getByTestId("model-provider-template-picker")
    .getByTestId("model-provider-template-item-custom")
    .click();
  await page.getByTestId("model-provider-base-url-input").fill(baseUrl);
  await page.getByTestId("model-provider-base-url-input").press("Tab");
  await page.getByTestId("model-provider-api-format-trigger").click();
  await page.getByTestId("model-provider-api-format-item-openai-chat-completions").click();
  await page.getByTestId("model-provider-api-key-input").fill("local-fixture-key");
  await page.getByTestId("model-provider-api-key-input").press("Tab");
  await page.getByTestId("model-provider-add-model-button").click();
  await page
    .getByRole("dialog")
    .getByPlaceholder(/模型 ID|Model ID/i)
    .fill("local-fixture-model");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(保存|Save)$/i })
    .click();
  await page.getByTestId("model-provider-model-input-0").waitFor();
  await page.getByTestId("settings-back-button").click();
}
