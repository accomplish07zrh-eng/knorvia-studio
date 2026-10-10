import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  StudioOverview,
  StudioRun,
  WindowHostControllerTaskListItem,
} from "@knorvia/services";
import {
  activeWorkbenchTasks,
  workbenchConversationRows,
} from "../src/studio/workbench/workbenchTasks.js";
import { emptyWorkbench, decodeWorkbench } from "../src/studio/workbench/workbenchModel.js";
import {
  placeWorkbenchTile,
  sameWorkbenchTarget,
} from "../src/studio/workbench/workbenchPlacement.js";
import { attachTaskListRowActivity } from "../src/v4/taskListRowActivity.js";

const scope = { workspacePath: "/project" };
const tile = (id: string) => ({
  id,
  scope,
  kernel: "codex" as const,
  sessionId: id,
  opened: true,
  existing: true,
  configured: true,
});
const run = (id: string, state: StudioRun["state"] = "running"): StudioRun => ({
  id: `run-${id}`,
  targetId: id,
  kind: "chat",
  state,
  input: "",
  createdAt: 1,
  updatedAt: 2,
  attempt: 2,
  checkpoint: { completed: {} },
});
test("collect all running, queued, approval and input tasks beyond four without collapsing identical kernels or remote identities", () => {
  const runs = [
    run("a"),
    run("b", "queued"),
    run("c", "waiting"),
    run("d", "waiting"),
    run("old", "succeeded"),
    run("group"),
  ];
  runs[5]!.kind = "group";
  const overview = {
    revision: 1,
    configs: {},
    runs,
    conversations: runs
      .filter((r) => r.kind === "chat")
      .map((r) => ({
        id: r.targetId,
        kernel: "codex",
        workspacePath: scope.workspacePath,
        title: r.targetId,
        createdAt: 1,
        updatedAt: 1,
      })),
    groups: [{ id: "group", name: "Group", workspacePath: "/group" }],
    workflows: [],
    attention: {
      items: [
        {
          runId: "run-c",
          attempt: 2,
          targetId: "c",
          category: "pending",
          interactionKind: "approval",
        },
        {
          runId: "run-d",
          attempt: 2,
          targetId: "d",
          category: "pending",
          interactionKind: "question",
        },
        {
          runId: "run-a",
          attempt: 1,
          targetId: "a",
          category: "pending",
          interactionKind: "question",
        },
      ],
    },
  } as StudioOverview;
  const native = (identity: string, kind: "permission" | "userInput") =>
    attachTaskListRowActivity(
      {
        taskId: "same",
        workspacePath: "/remote",
        workspaceIdentity: identity,
        remoteSessionId: identity,
        title: identity,
        sourceAvailability: "online",
      } as WindowHostControllerTaskListItem,
      {
        phase: "idle",
        lastActivityAt: 2,
        hasBackgroundWork: false,
        pendingInteractions: {
          permissionCount: kind === "permission" ? 1 : 0,
          userInputCount: kind === "userInput" ? 1 : 0,
        },
      },
    );
  const a = native("remote-a", "permission"),
    b = native("remote-b", "userInput");
  const rows = activeWorkbenchTasks(overview, [a, b, a]);
  assert.equal(rows.length, 7);
  assert.equal(rows.find((r) => r.title === "a")?.states.join(), "running");
  assert.equal(rows.find((r) => r.title === "b")?.states.join(), "queued");
  assert.equal(rows.find((r) => r.title === "c")?.states.join(), "approval");
  assert.equal(rows.find((r) => r.title === "d")?.states.join(), "input");
  assert.equal(rows.find((r) => r.title === "remote-a")?.states.join(), "approval");
  assert.equal(rows.find((r) => r.title === "remote-b")?.states.join(), "input");
  assert.equal(rows.find((r) => r.title === "Group")?.route?.view, "groups");
  assert.equal(rows.filter((r) => r.tile).length, 6);
});
test("collection preserves configured tiles, reports capacity and explicit swapping only removes the replaced view", () => {
  let board = emptyWorkbench(scope, "draft");
  board.tiles["workspace-main"] = { ...board.tiles["workspace-main"]!, configured: true };
  // 容量为两行四列（specs/knorvia-workbench-usability-20261008.md）。
  for (const id of ["a", "b", "c", "e", "f", "g", "h"])
    board = placeWorkbenchTile(board, tile(id))!;
  assert.equal(Object.keys(board.tiles).length, 8);
  assert.equal(placeWorkbenchTile(board, tile("d")), null);
  const root = board.layout.root;
  board = placeWorkbenchTile(board, tile("d"), "workspace-main")!;
  assert.equal(board.layout.root, root);
  assert.equal(board.tiles["workspace-main"]?.id, "d");
  // 换下的格子只离开工作台，不再进入任何收起列表（specs/knorvia-workbench-conversations-20261010.md）。
  assert.equal("shelved" in board, false);
  assert.equal(
    Object.values(board.tiles).some((value) => value.id === "draft"),
    false,
  );
  assert.equal(
    sameWorkbenchTarget(tile("same"), {
      ...tile("same"),
      scope: { ...scope, workspaceIdentity: "another-host" },
    }),
    false,
  );
  // 未发送草稿没有会话 ID，不同格子永不视为同一目标。
  const draft = emptyWorkbench(scope, "draft-a").tiles["workspace-main"]!;
  assert.equal(sameWorkbenchTarget(draft, { ...draft, id: "other-draft" }), false);
});
test("legacy shelved references are dropped on read", () => {
  const board = emptyWorkbench(scope, "current");
  board.tiles["workspace-main"] = { ...board.tiles["workspace-main"]!, opened: true };
  const legacy = decodeWorkbench(
    JSON.stringify({ version: 1, ...board, shelved: [tile("stored-0"), tile("stored-1")] }),
  );
  assert.equal(legacy?.tiles["workspace-main"]?.id, "current");
  assert.equal(legacy && "shelved" in legacy, false);
});

test("native Studio and Controller projections share one view, preserve waiting and retain offline evidence", () => {
  const overview = {
    revision: 1,
    configs: {},
    runs: [run("native")],
    conversations: [
      {
        id: "native",
        nativeSessionId: "actual-native",
        kernel: "knorvia",
        workspacePath: scope.workspacePath,
        title: "native",
      },
    ],
    groups: [],
    workflows: [],
  } as unknown as StudioOverview;
  const task = attachTaskListRowActivity(
    {
      taskId: "actual-native",
      workspacePath: scope.workspacePath,
      title: "native waiting",
      sourceAvailability: "offline",
    } as WindowHostControllerTaskListItem,
    {
      phase: "idle",
      lastActivityAt: 2,
      hasBackgroundWork: false,
      pendingInteractions: { permissionCount: 1, userInputCount: 1 },
    },
  );
  const rows = activeWorkbenchTasks(overview, [task]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.states, ["approval", "input"]);
  assert.equal(rows[0]?.unavailable, true);
});

test("conversation picker rows cover every kernel, dedupe Studio native mirrors and sort by recency", () => {
  const conversation = (
    id: string,
    kernel: string,
    updatedAt: number,
    nativeSessionId?: string,
  ) => ({
    id,
    kernel,
    workspacePath: scope.workspacePath,
    title: id,
    createdAt: 1,
    updatedAt,
    ...(nativeSessionId ? { nativeSessionId } : {}),
  });
  const overview = {
    revision: 1,
    configs: {},
    runs: [],
    conversations: [
      conversation("codex-old", "codex", 10),
      conversation("grok-new", "grok-build", 40),
      // Studio 内置单聊与 Controller 同一会话：只留原生项。
      conversation("studio-mirror", "knorvia", 50, "native-1"),
      // 尚未得到原生会话 ID 的内置单聊不能放入格子。
      conversation("studio-pending", "knorvia", 60),
    ],
    groups: [],
    workflows: [],
  } as unknown as StudioOverview;
  const native = [
    {
      taskId: "native-1",
      workspacePath: scope.workspacePath,
      title: "native one",
      updatedAt: 30,
      sourceAvailability: "online",
    },
    {
      taskId: "native-2",
      workspacePath: "/remote",
      workspaceIdentity: "remote:host-a:/remote",
      remoteSessionId: "remote-session",
      title: "remote",
      updatedAt: 20,
      sourceAvailability: "offline",
    },
  ] as unknown as WindowHostControllerTaskListItem[];
  const rows = workbenchConversationRows(overview, native);
  assert.deepEqual(
    rows.map((row) => [row.kernel, row.title]),
    [
      ["grok-build", "grok-new"],
      ["knorvia", "native one"],
      ["knorvia", "remote"],
      ["codex", "codex-old"],
    ],
  );
  const remote = rows.find((row) => row.title === "remote")!;
  assert.equal(remote.unavailable, true);
  assert.equal(remote.tile.scope.workspaceIdentity, "remote:host-a:/remote");
  assert.equal(remote.tile.scope.remoteSessionId, "remote-session");
  assert.equal(rows.find((row) => row.title === "grok-new")!.tile.sessionId, "grok-new");
  assert.ok(rows.every((row) => row.tile.opened && row.tile.existing));
});
