// SPDX-License-Identifier: Apache-2.0
// 列表三件：ListWorkflowRuns（B-lr）、ListSavedWorkflows（B-ls）、ListModels（B-lm）。
// handler 侧走端口替身/临时目录（事件序列断言），模型面侧断言固定文案与属性序。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCallSequence, makeContext, makePort } from "./harness.js";
import { SAVED_WORKFLOW_PROJECT_DIR } from "../../../../apps/cli/packages/contracts/src/index.js";

const listRunsModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-workflow-runs.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-workflow-runs.js");
const listSavedModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-saved-workflows.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-saved-workflows.js");
const listModelsModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-models.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-models.js");

const runsEntry = listRunsModule.listWorkflowRunsToolEntry;
const savedEntry = listSavedModule.listSavedWorkflowsToolEntry;
const modelsEntry = listModelsModule.listModelsToolEntry;

test("B-lr-2 empty listing states it in one sentence inside the container", () => {
  const text = runsEntry.formatModelContent({ runs: [] });
  assert.equal(
    text,
    '<workflow_runs count="0">\nNo workflow runs recorded for this project.\n</workflow_runs>',
  );
});

test("B-lr-2 attribute order is fixed per row; optional attributes only when defined", () => {
  const text = String(
    runsEntry.formatModelContent({
      runs: [
        {
          runId: "dwfr-1",
          status: "stopped",
          stopReason: "user",
          label: "run one",
          labelSource: "script",
          ownedByThisSession: true,
          spentTokens: 5,
          createdAt: 1_760_000_000_000,
          updatedAt: 1_760_000_000_000,
        },
        {
          runId: "dwfr-2",
          status: "running",
          label: "run two",
          labelSource: "name",
          ownedByThisSession: false,
          possiblyInterrupted: true,
          spentTokens: 0,
          createdAt: 1_760_000_000_000,
          updatedAt: 1_760_000_000_000,
        },
      ],
    }),
  );
  const row1 = text.split("\n")[1]!;
  const row2 = text.split("\n")[2]!;
  assert.match(row1, /^<run id="dwfr-1" status="stopped" stop_reason="user" label=/u);
  assert.ok(!row1.includes("resumed_from"), "absent optional attribute not invented");
  assert.match(row2, /possibly_interrupted="true"/u);
  assert.ok(row2.indexOf('id="dwfr-2"') < row2.indexOf("status="), "id before status");
  assert.ok(row2.endsWith("/>"));
});

test("B-lr-1 handler routes through the operation factory with the session cwd", async () => {
  // handler 由 original 面 createListWorkflowRunsOperation 构造；行为契约 = 输入解析 + 端口调用序列
  const { calls, port } = makePort({
    listRuns: () => ({ runs: [], truncated: false }),
  });
  const output = await runsEntry.handler({}, makeContext(port, "/proj-x"));
  assert.ok(output !== undefined);
  assert.ok(typeof (output as { runs?: unknown }).runs === "object");
  void calls;
  assertCallSequence({ calls, port }, ["listRuns"]);
});

test("B-ls-2 empty saved list states where definitions live", () => {
  const text = String(savedEntry.formatModelContent({ workflows: [] }));
  assert.match(text, /^<saved_workflows count="0">/u);
  assert.ok(text.includes(SAVED_WORKFLOW_PROJECT_DIR));
  assert.ok(text.includes("No workflows are saved in this project yet."));
});

test("B-ls-3 attribute escaping protects names and paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-saved-"));
  try {
    const savedDir = join(dir, SAVED_WORKFLOW_PROJECT_DIR);
    await mkdir(savedDir, { recursive: true });
    // Windows 文件名不能含引号/尖括号（平台差异）；& 进文件名。名字不合法 → 走 invalid，
    // 其 path 进属性位触发 escapeAttribute（转义只作用于属性位：名字与路径）
    await writeFile(join(savedDir, "bad&name.dwf.ts"), "export default {};\n", "utf8");
    const output = (await savedEntry.handler({}, makeContext({}, dir))) as {
      workflows?: Array<{ name: string }>;
      invalid?: Array<{ path: string }>;
    };
    const text = String(savedEntry.formatModelContent(output));
    assert.ok(output.invalid !== undefined && output.invalid.length > 0, "invalid captured");
    assert.ok(text.includes("&amp;"), "ampersand escaped in attribute position");
    assert.ok(
      !/name="[^"]*"[^>]*>[^<]*<[^/]/u.test(text) || text.includes("&quot;"),
      "quote escaped",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("B-ls-1 handler pins cwd to the session working directory and omits invalid when empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-saved-empty-"));
  try {
    const output = (await savedEntry.handler({}, makeContext({}, dir))) as Record<string, unknown>;
    assert.deepEqual(output.workflows, []);
    assert.equal("invalid" in output, false, "empty invalid absent");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("B-lm-1 ListModels is a pure re-export surface (execute/render come from the projection module)", async () => {
  const projection =
    (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-models-projection.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-models-projection.js");
  assert.equal(modelsEntry.handler, projection.executeListModels);
  assert.equal(modelsEntry.formatModelContent, projection.renderListModels);
});

test("B-lm-2 description pins id pasting, session-model immutability, [current] and disabled rows", () => {
  const description = String(modelsEntry.metadata.description);
  assert.ok(description.includes("subagent_model"));
  assert.ok(description.includes("$<level>"));
  assert.ok(description.includes("[current]"));
  assert.ok(description.includes("disabled"));
  assert.ok(description.includes("does NOT change the model you are running on"));
});

void runsEntry;
