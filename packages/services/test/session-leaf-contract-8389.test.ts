// SPDX-License-Identifier: MIT
// New contract fixtures; production-source exposure is disclosed in the batch specification.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { test } from "node:test";
import type {
  KnorviaAgentMcpServer,
  KnorviaPersistedFileChange,
  KnorviaPromptAttachment,
} from "@knorvia/shared";
import { deriveSessionTitle } from "../src/session/sessionTitle.js";
import {
  buildPerTurnChangeSummaries,
  buildTaskChangeSummary,
} from "../src/session/taskChangeSummary.js";
import { appendWorkspaceToFilesystemMcpServers } from "../src/session/mcpWorkspaceScope.js";

const attachment = (filename: string) =>
  ({ type: "file", filename, mimeType: "text/plain" }) as KnorviaPromptAttachment;
const snapshot = (
  path: string,
  beforeContent: string | null,
  afterContent: string,
  writeCount = 1,
) => ({ path, beforeContent, afterContent, writeCount });
const filesystem = (args: string[] = []): Extract<KnorviaAgentMcpServer, { command: string }> => ({
  name: "filesystem",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", ...args],
  env: [{ name: "FIXTURE", value: "public-test-value" }],
  isolation: "workspace",
  protocolVersion: "auto",
  timeoutMs: 321,
});

test("title keeps prompt bytes, UTF-16 limits and attachment fallback", () => {
  const attachments = [attachment(" report.pdf "), attachment("other.md"), attachment("third.txt")];
  const before = structuredClone(attachments);
  for (const [content, expected] of [
    ["", " report.pdf  +2"],
    [" \n", " \n"],
    ["a".repeat(49), "a".repeat(49)],
    ["a".repeat(50), "a".repeat(50)],
    ["a".repeat(51), `${"a".repeat(50)}...`],
    [`${"a".repeat(49)}😀`, `${"a".repeat(49)}\ud83d...`],
  ]) {
    assert.equal(deriveSessionTitle(content!, attachments), expected);
  }
  assert.equal(deriveSessionTitle("", []), "");
  assert.equal(deriveSessionTitle("", [attachment("")]), "");
  assert.equal(deriveSessionTitle("", attachments.slice(0, 1)), " report.pdf ");
  assert.deepEqual(attachments, before);
});

test("empty file histories preserve absence rather than inventing a zero summary", () => {
  for (const history of [undefined, [], [{ turnIndex: 9, snapshots: [] }]]) {
    assert.equal(buildTaskChangeSummary(history), undefined);
    assert.deepEqual([...buildPerTurnChangeSummaries(history)], []);
  }
});

test("file projection keeps array order, earliest baseline, latest result and repeated-turn rules", () => {
  const history: KnorviaPersistedFileChange[] = [
    {
      turnIndex: 5,
      snapshots: [
        snapshot("z", "a\nkeep\n", "b\nkeep\n", 2),
        snapshot("z", "ignored", "c\nkeep\n", 3),
        snapshot("a", null, "one\n"),
      ],
    },
    {
      turnIndex: 2,
      fileState: "reverted",
      snapshots: [snapshot("z", "not the baseline", "a\nkeep\n", 4), snapshot("a", "one\n", "", 2)],
    },
    { turnIndex: 5, snapshots: [] },
    { turnIndex: 5, snapshots: [snapshot("c", null, "")] },
  ];
  const before = structuredClone(history);
  const perTurn = buildPerTurnChangeSummaries(history);
  assert.deepEqual([...perTurn.keys()], [5, 2]);
  assert.deepEqual(perTurn.get(5), {
    fileCount: 1,
    added: 0,
    removed: 0,
    files: [{ path: "c", added: 0, removed: 0, writeCount: 1, lastTurnIndex: 5 }],
  });
  const task = buildTaskChangeSummary(history);
  assert.deepEqual(task, {
    fileCount: 3,
    added: 0,
    removed: 0,
    files: [
      { path: "a", added: 0, removed: 0, writeCount: 3, lastTurnIndex: 2 },
      { path: "c", added: 0, removed: 0, writeCount: 1, lastTurnIndex: 5 },
      { path: "z", added: 0, removed: 0, writeCount: 9, lastTurnIndex: 2 },
    ],
  });
  assert.equal(
    JSON.stringify(task),
    '{"fileCount":3,"added":0,"removed":0,"files":[{"path":"a","added":0,"removed":0,"writeCount":3,"lastTurnIndex":2},{"path":"c","added":0,"removed":0,"writeCount":1,"lastTurnIndex":5},{"path":"z","added":0,"removed":0,"writeCount":9,"lastTurnIndex":2}]}',
  );
  assert.deepEqual(history, before);
});

test("per-turn repeated writes retain the first baseline and skip later empty groups", () => {
  const history: KnorviaPersistedFileChange[] = [
    {
      turnIndex: 7,
      snapshots: [
        snapshot("b", "old\nkeep\n", "interim\nkeep\n", 2),
        snapshot("a", null, "new\n", 0),
        snapshot("b", "wrong\n", "final\nkeep\n", -1),
      ],
    },
    { turnIndex: 7, snapshots: [] },
  ];
  const expected = {
    fileCount: 2,
    added: 2,
    removed: 1,
    files: [
      { path: "a", added: 1, removed: 0, writeCount: 0, lastTurnIndex: 7 },
      { path: "b", added: 1, removed: 1, writeCount: 1, lastTurnIndex: 7 },
    ],
  };
  assert.deepEqual(buildPerTurnChangeSummaries(history).get(7), expected);
  assert.deepEqual(buildTaskChangeSummary(history), expected);
});

test("path keys stay literal and line deltas count edits rather than whole files", () => {
  const paths = ["__proto__", "a/b", "a\\b", "A", "a", ""];
  const history = [
    {
      turnIndex: -3,
      snapshots: paths.map((path) => snapshot(path, "first\nold\nlast\n", "first\nnew\nlast\n")),
    },
  ];
  const summary = buildTaskChangeSummary(history)!;
  assert.equal(summary.fileCount, paths.length);
  assert.equal(summary.added, paths.length);
  assert.equal(summary.removed, paths.length);
  assert.deepEqual(
    summary.files.map((file) => file.path),
    [...paths].sort((a, b) => a.localeCompare(b)),
  );
  assert.ok(
    summary.files.every(
      (file) => file.added === 1 && file.removed === 1 && file.lastTurnIndex === -3,
    ),
  );
});

test("MCP absent and nonexistent workspaces retain collection identity", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-leaf-scope-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(appendWorkspaceToFilesystemMcpServers(undefined, directory), undefined);
  const empty: KnorviaAgentMcpServer[] = [];
  assert.equal(appendWorkspaceToFilesystemMcpServers(empty, directory), empty);
  const servers = [filesystem()];
  for (const workspace of ["", " \n ", join(directory, "missing")]) {
    assert.equal(appendWorkspaceToFilesystemMcpServers(servers, workspace), servers);
  }
});

test("MCP expands eligible servers without mutating config and is idempotent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-leaf-scope-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eligible = filesystem();
  const alreadyScoped = filesystem([` ${directory}${sep} `]);
  const other = { ...filesystem(), name: "Filesystem" };
  const wrongPackage = { ...filesystem(), args: ["server-filesystem"] };
  const http: KnorviaAgentMcpServer = {
    name: "filesystem",
    type: "http",
    url: "https://example.invalid",
    headers: [],
  };
  const servers = [eligible, alreadyScoped, other, wrongPackage, http];
  const before = structuredClone(servers);
  const result = appendWorkspaceToFilesystemMcpServers(servers, ` ${directory} `)!;
  assert.notEqual(result, servers);
  assert.notEqual(result[0], eligible);
  assert.deepEqual(result[0], { ...eligible, args: [...eligible.args, directory] });
  for (let index = 1; index < servers.length; index++) assert.equal(result[index], servers[index]);
  assert.deepEqual(servers, before);
  assert.equal(appendWorkspaceToFilesystemMcpServers(result, directory), result);
  assert.equal(
    appendWorkspaceToFilesystemMcpServers([alreadyScoped], directory)?.[0],
    alreadyScoped,
  );
});

test("MCP uses package substring matching, native normalization and existence-only checks", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-leaf-scope-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "file.txt");
  await writeFile(file, "fixture");
  const server = {
    ...filesystem(),
    command: "",
    args: ["prefix@modelcontextprotocol/server-filesystem-suffix"],
  };
  const scoped = appendWorkspaceToFilesystemMcpServers([server], file)!;
  assert.deepEqual(scoped[0], { ...server, args: [...server.args, file] });
  const normalized = filesystem([`${directory}${sep}.${sep}child${sep}..${sep}`]);
  const servers = [normalized];
  assert.equal(appendWorkspaceToFilesystemMcpServers(servers, directory), servers);
});

test("MCP case comparison follows platform without changing stored argument spelling", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-leaf-case-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = filesystem([directory.toUpperCase()]);
  const servers = [server];
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { ...descriptor, value: "win32" });
    assert.equal(appendWorkspaceToFilesystemMcpServers(servers, directory), servers);
    Object.defineProperty(process, "platform", { ...descriptor, value: "linux" });
    assert.notEqual(appendWorkspaceToFilesystemMcpServers(servers, directory), servers);
    assert.equal(server.args.at(-1), directory.toUpperCase());
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
});

test("sparse title attachments retain base projection behavior", () => {
  const attachments: KnorviaPromptAttachment[] = [];
  attachments.length = 2;
  attachments[1] = attachment("later.txt");
  assert.equal(deriveSessionTitle("", attachments), "");
});

test("signed-zero writes retain base projection behavior", () => {
  const history = [{ turnIndex: 0, snapshots: [snapshot("a", null, "", -0)] }];
  assert.ok(Object.is(buildTaskChangeSummary(history)!.files[0]!.writeCount, -0));
  assert.ok(Object.is(buildPerTurnChangeSummaries(history).get(0)!.files[0]!.writeCount, -0));
});

test("MCP keeps sparse slots, trailing backslashes and native input errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-leaf-sparse-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const servers: KnorviaAgentMcpServer[] = [];
  servers.length = 3;
  servers[1] = filesystem();
  servers[2] = filesystem([`${directory}\\`]);
  const result = appendWorkspaceToFilesystemMcpServers(servers, directory)!;
  assert.equal(0 in result, false);
  assert.equal(result.length, 3);
  assert.notEqual(result[1], servers[1]);
  assert.equal(result[2], servers[2]);
  assert.throws(
    () => appendWorkspaceToFilesystemMcpServers([filesystem()], null as unknown as string),
    TypeError,
  );
  assert.equal(
    appendWorkspaceToFilesystemMcpServers(undefined, null as unknown as string),
    undefined,
  );
});
