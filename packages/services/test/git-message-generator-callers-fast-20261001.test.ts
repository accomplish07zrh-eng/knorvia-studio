import assert from "node:assert/strict";
import { test } from "node:test";
import { entry, snapshot } from "./git-read-projection-fixture-fast-20261001.js";
import { messageFixture, workspace } from "./git-message-generator-fixture-fast-20261001.js";
import { uiCallbackHarness } from "./git-message-generator-ui-callback-fast-20261001.js";
const f = await messageFixture(),
  ui = await uiCallbackHarness(f.uiUrl("GitActionMenu"));
const { getCurrentSessionFilePaths } = await import(
  f.uiUrl("git-action-menu/currentSessionFileScope")
);
const { getErrorMessage } = await import(f.uiUrl("lib/errorMessage"));
test("actual Git service and binary RPC use one generator after session scope/diff selection", async (t) => {
  const g = f.generator(),
    status = snapshot([entry(), entry({ path: "work/excluded.txt" })]),
    diffs: unknown[] = [];
  const service = f.service({
    status,
    generator: g.api,
    ports: {
      getDiff: async (query) => {
        diffs.push(query);
        if (query.sourceId === "staged") throw new Error("owned rejected diff");
        return {
          path: "owned diff path",
          availability: "patch",
          patch: "owned RPC patch",
          beforeContent: null,
          afterContent: null,
        };
      },
    },
  });
  const remote = f.remote(t, service.api);
  const result = await remote.generateCommitMessage({
    workspacePath: workspace,
    workspaceIdentity: "owned-rpc",
    locale: "zh-CN",
    currentSessionFilePaths: ["owned.txt"],
    conversationContext: {
      omittedMessageCount: 3,
      messages: [{ role: "user", content: "owned RPC conversation" }],
    },
  });
  assert.deepEqual(result, {
    message: "fix: owned synthetic change",
    providerId: "owned-provider",
    model: "owned-model",
  });
  assert.equal(g.state.requests.length, 1);
  assert.equal(g.state.lookups.length, 1);
  assert.equal(g.state.requests[0]!.workspaceIdentity, "owned-rpc");
  assert.match(g.state.requests[0]!.prompt, /Current language: Chinese/);
  assert.match(g.state.requests[0]!.prompt, /3 earlier messages omitted/);
  assert.match(g.state.requests[0]!.prompt, /owned RPC patch/);
  assert.doesNotMatch(g.state.requests[0]!.prompt, /excluded/);
  assert.equal(diffs.length, 2);
  assert.deepEqual(service.trace, ["status"]);
  assert.deepEqual(g.state.trace, ["lookup", "info", "text"]);
});
test("actual service/RPC invalid response preserves serialized name/message without retry", async (t) => {
  const g = f.generator();
  g.state.response.text = "owned invalid response";
  const service = f.service({
    generator: g.api,
    ports: {
      getDiff: async () => ({
        path: "owned",
        availability: "unavailable",
        patch: null,
        beforeContent: null,
        afterContent: null,
      }),
    },
  });
  const remote = f.remote(t, service.api);
  await assert.rejects(remote.generateCommitMessage({ workspacePath: workspace }), {
    name: "GitCommitMessageGenerationError",
    message: "模型没有返回可用的 Conventional Commit 提交消息。",
  });
  assert.equal(g.state.requests.length, 1);
  assert.deepEqual(g.state.trace, ["lookup", "info", "text", "debug"]);
});
for (const includeUnstaged of [false, true])
  test(`actual ${ui.path.includes("/dist/") ? "emitted" : "source"} UI generation callback through RPC includeUnstaged=${includeUnstaged}`, async (t) => {
    const g = f.generator(),
      status = snapshot(),
      requests: any[] = [],
      events: any[] = [];
    const service = f.service({
      status,
      generator: g.api,
      ports: {
        getDiff: async () => ({
          path: "owned",
          availability: "patch",
          patch: "owned UI patch",
          beforeContent: null,
          afterContent: null,
        }),
      },
    });
    const remote = f.remote(t, service.api),
      gitService = {
        generateCommitMessage(params: any) {
          requests.push(params);
          return remote.generateCommitMessage(params);
        },
      };
    const logger = {
      info(...args: any[]) {
        assert.equal(this, logger);
        events.push(args);
      },
    };
    const callback = ui.callback("generateCommitMessage", {
      getCurrentSessionFilePaths,
      logger,
      gitService,
      workspacePath: workspace,
      workspaceIdentity: "owned-ui",
      gitSummary: status.summary,
      locale: "zh-CN",
      commitMessageConversationContext: {
        omittedMessageCount: 2,
        messages: [{ role: "assistant", content: "owned UI conversation" }],
      },
    });
    const state = {
      stagedFiles: [{ stagePath: "owned staged" }],
      unstagedFiles: [{ stagePath: "owned unstaged" }],
      activeTaskChangeSummary: {
        files: [{ path: "owned.txt" }, { path: "owned.txt" }, { path: " " }],
      },
    };
    assert.equal(await callback(state, includeUnstaged), "fix: owned synthetic change");
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
      workspacePath: workspace,
      workspaceIdentity: "owned-ui",
      locale: "zh-CN",
      includeUnstaged,
      currentSessionFilePaths: ["owned.txt"],
      conversationContext: {
        omittedMessageCount: 2,
        messages: [{ role: "assistant", content: "owned UI conversation" }],
      },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [
      [
        "[GitActionMenu] 开始生成提交消息",
        {
          workspacePath: workspace,
          branchName: "owned-head",
          selectedFileCount: includeUnstaged ? 2 : 1,
          currentSessionFileCount: 1,
          includeUnstaged,
          conversationMessageCount: 1,
        },
      ],
      [
        "[GitActionMenu] 提交消息生成成功",
        {
          workspacePath: workspace,
          branchName: "owned-head",
          providerId: "owned-provider",
          model: "owned-model",
        },
      ],
    ]);
    assert.equal(g.state.requests.length, 1);
    assert.match(g.state.requests[0]!.prompt, /owned UI conversation/);
  });
test("actual UI generation button failure restores pending and local error without mutation", async (t) => {
  const g = f.generator();
  g.state.text = () => Promise.reject(new Error("owned rejected UI model"));
  const s = f.service({
    generator: g.api,
    ports: {
      getDiff: async () => ({
        path: "owned",
        availability: "unavailable",
        patch: null,
        beforeContent: null,
        afterContent: null,
      }),
    },
  });
  const remote = f.remote(t, s.api),
    events: any[] = [],
    setters: unknown[] = [];
  const logger = {
    info: (...args: unknown[]) => events.push(args),
    warn: (...args: unknown[]) => events.push(args),
  };
  const state = {
    stagedFiles: [{ stagePath: "owned staged" }],
    unstagedFiles: [],
    activeTaskChangeSummary: null,
  };
  const generateCommitMessage = ui.callback("generateCommitMessage", {
    getCurrentSessionFilePaths,
    logger,
    gitService: remote,
    workspacePath: workspace,
    workspaceIdentity: undefined,
    gitSummary: s.status.summary,
    locale: "en-US",
    commitMessageConversationContext: null,
  });
  const callback = ui.callback("handleGenerateCommitMessage", {
    commitDialogState: state,
    commitIncludeUnstaged: false,
    generateCommitMessage,
    setCommitError: (value: unknown) => setters.push(["error", value]),
    setCommitMessageGenerationPending: (value: unknown) => setters.push(["pending", value]),
    setCommitMessage: () => assert.fail("no invalid message written"),
    logger,
    getErrorMessage,
    workspacePath: workspace,
    gitSummary: s.status.summary,
    intl: { formatMessage: ({ id }: { id: string }) => id },
  });
  await callback();
  assert.deepEqual(setters, [
    ["error", null],
    ["pending", true],
    ["error", "git.actionMenu.commitDialog.error.generateFailed"],
    ["pending", false],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(events[1])), [
    "[GitActionMenu] 生成提交消息失败",
    { workspacePath: workspace, branchName: "owned-head", error: "模型请求失败。" },
  ]);
  assert.equal(events.length, 2);
  assert.equal(g.state.requests.length, 1);
});
