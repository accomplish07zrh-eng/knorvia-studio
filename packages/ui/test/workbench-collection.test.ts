import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  StudioOverview,
  StudioRun,
  WindowHostControllerTaskListItem,
} from "@knorvia/services";
import { activeWorkbenchTasks } from "../src/studio/workbench/workbenchTasks.js";
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
test("collection preserves configured tiles, reports capacity and explicit swapping retains layout and recoverable draft references", () => {
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
  assert.equal(board.shelved[0]?.id, "draft");
  board = placeWorkbenchTile(board, board.shelved[0]!, "workspace-main")!;
  assert.equal(board.tiles["workspace-main"]?.id, "draft");
  assert.equal(board.shelved[0]?.id, "d");
  const restored = decodeWorkbench(JSON.stringify({ version: 1, ...board }));
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored?.shelved)),
    JSON.parse(JSON.stringify(board.shelved)),
  );
  assert.equal(
    sameWorkbenchTarget(tile("same"), {
      ...tile("same"),
      scope: { ...scope, workspaceIdentity: "another-host" },
    }),
    false,
  );
  assert.equal(
    sameWorkbenchTarget(board.tiles["workspace-main"]!, {
      ...board.tiles["workspace-main"]!,
      id: "other-draft",
    }),
    false,
  );
});
test("shelf never silently drops references at its limit and corrupt duplicate IDs are rejected", () => {
  const board = emptyWorkbench(scope, "current");
  board.tiles["workspace-main"] = { ...board.tiles["workspace-main"]!, opened: true };
  board.shelved = Array.from({ length: 64 }, (_, i) => tile(`stored-${i}`));
  assert.equal(placeWorkbenchTile(board, tile("new"), "workspace-main"), null);
  const restored = placeWorkbenchTile(board, board.shelved[0]!, "workspace-main")!;
  assert.equal(restored.shelved.length, 64);
  assert.equal(restored.shelved.at(-1)?.id, "current");
  assert.equal(
    decodeWorkbench(
      JSON.stringify({ version: 1, ...board, shelved: [board.tiles["workspace-main"]] }),
    ),
    undefined,
  );
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
