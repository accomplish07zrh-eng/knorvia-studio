import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";
const directories: string[] = [];
const opens: string[] = [];
let closes = 0;
let lastBuffer: Buffer | undefined;
let reads = 0;
const refused = Object.assign(new Error("synthetic mkdir refused"), { code: "EACCES" });
let failConversation = false;
const conversation = fakeFsPath("/synthetic/data/workspace/conversation");
mock.module("node:fs/promises", {
  namedExports: {
    mkdir: async (path: string) => {
      directories.push(path);
      if (failConversation && path === conversation) throw refused;
      return undefined;
    },
    stat: async (path: string) => {
      if (failConversation && path === conversation)
        throw Object.assign(new Error("synthetic no target"), { code: "ENOENT" });
      if (path.endsWith("missing.txt"))
        throw Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
      return {
        isDirectory: () => path.includes("workspace"),
        isFile: () => !path.includes("workspace"),
        size: path.endsWith("large.png") ? 100 : 10,
        mtimeMs: 7,
      };
    },
    open: async (path: string) => {
      opens.push(path);
      return {
        read: async (buffer: Buffer) => {
          lastBuffer = buffer;
          buffer.write("OK");
          return { bytesRead: 2 };
        },
        close: async () => {
          closes++;
        },
      };
    },
    readFile: async () => {
      reads++;
      return Buffer.from("synthetic");
    },
    readdir: async () => [],
    realpath: async (path: string) => path,
  },
});
mock.module("@knorvia/shared", {
  namedExports: { getMediaPreviewFormat: () => ({ mediaType: "image/png", kind: "image" }) },
});
mock.module("@knorvia/shared/workspaceFileEntriesCodec", {
  namedExports: { packWorkspaceFileEntries: () => "synthetic-packed" },
});
mock.module("@knorvia/shared/workspaceFileSearch", {
  namedExports: { WORKSPACE_FILE_SEARCH_DISPLAY_CAP: 200 },
});
mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
  namedExports: { createServiceLogger: () => ({ info: () => {}, warn: () => {} }) },
});
mock.module(new URL("../src/paths.ts", import.meta.url).href, {
  namedExports: {
    getKnorviaDataRootDir: () => fakeFsPath("/synthetic/data"),
    getConversationWorkspaceDir: () => conversation,
  },
});
mock.module(new URL("../src/file/workspaceFileMentionFilter.ts", import.meta.url).href, {
  namedExports: {
    defaultWorkspaceFileSearchFilter: { evaluate: () => ({ include: true, traverse: true }) },
  },
});
mock.module(new URL("../src/file/workspaceFileSearch.ts", import.meta.url).href, {
  namedExports: {
    buildHostFileSearchCandidates: async () => [],
    searchHostFileCandidates: async () => [],
  },
});
mock.module(new URL("../src/file/workspaceFileIgnore.ts", import.meta.url).href, {
  namedExports: {
    WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME: ".knorviaignore",
    loadWorkspaceFileSearchIgnoreRules: async () => ({}),
    isWorkspaceFileSearchPathIgnored: () => false,
    readWorkspaceFileSearchIgnore: async () => ({ content: "", source: "file" }),
    transformWorkspaceFileSearchIgnore: async () => ({ content: "" }),
    writeWorkspaceFileSearchIgnore: async () => {},
  },
});
const { createFileService } = await import("../src/file/fileService.js");
test("fake file service writes only selected workspace targets and refuses invalid names/oversize reads", async () => {
  const service = createFileService();
  const created = await service.createScratchWorkspace({ name: " synthetic-project " });
  assert.equal(created.path, fakeFsPath("/synthetic/data/workspace/projects/synthetic-project"));
  assert.deepEqual(directories, [created.path]);
  await assert.rejects(
    service.createScratchWorkspace({ name: "synthetic/escape" }),
    /Workspace name cannot contain path separators/,
  );
  assert.equal(directories.length, 1);
  assert.deepEqual(await service.ensureConversationWorkspace(), {
    path: conversation,
    created: false,
    workspacePurpose: "conversation",
  });
  failConversation = true;
  await assert.rejects(service.ensureConversationWorkspace(), (error) => error === refused);
  failConversation = false;
  const bytes = await service.readFileRange({
    path: fakeFsPath("/synthetic/input.bin"),
    offset: 2,
    length: 6,
  });
  assert.equal(bytes.constructor, Uint8Array);
  assert.deepEqual([...bytes], [79, 75]);
  lastBuffer!.fill(0);
  assert.deepEqual([...bytes], [79, 75]);
  assert.equal(closes, 1);
  await assert.rejects(
    service.readMediaPreview({ path: fakeFsPath("/synthetic/large.png"), maxBytes: 1 }),
    /File is too large to preview/,
  );
  assert.equal(reads, 0);
  assert.deepEqual(
    await service.checkFilesExist({
      paths: [fakeFsPath("/synthetic/input.bin"), fakeFsPath("/synthetic/missing.txt")],
    }),
    [
      { path: fakeFsPath("/synthetic/input.bin"), exists: true },
      { path: fakeFsPath("/synthetic/missing.txt"), exists: false },
    ],
  );
  await assert.rejects(
    service.checkFilesExist({ paths: Array(16).fill(fakeFsPath("/synthetic/input.bin")) }),
    /at most 15 paths/,
  );
  assert.deepEqual(opens, [fakeFsPath("/synthetic/input.bin")]);
});
