// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: the fixture-driven golden round trip for workflow
// definition files — old write (recorded bytes) -> read -> rewrite -> read, closed byte-for-byte.
// The fixture holds bytes recorded on the old implementation's real write surface.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { saveWorkflowToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/save-workflow.js";
import { readWorkflowScriptFile } from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-path-source.js";

interface Goldens {
  savedCases: {
    name: string;
    input: Record<string, unknown>;
    script: string;
    fileRel: string;
    bodyLineOffset: number;
    goldenFile: string;
    metaAfterRead: Record<string, unknown>;
  }[];
  draftCases: { name: string; source: string; fileRel: string }[];
  draftGitignore: string;
  collisionNames: (string | null)[];
}

const goldens = JSON.parse(
  readFileSync(new URL("../fixtures/workflow-file-goldens.json", import.meta.url), "utf8"),
) as Goldens;

function scratch(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `wf01-fx-${prefix}-`));
}

test("B-fl-7 金样往返四步闭合：旧写 → 新读 → 新写 → 旧读", async () => {
  for (const golden of goldens.savedCases) {
    const cwd = scratch("roundtrip");
    const phases: string[] = [];
    try {
      // 一、旧写：夹具里的字节就是旧写入面产出的文件。
      const target = path.join(cwd, ...golden.fileRel.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, golden.goldenFile, "utf8");
      phases.push("old-write");

      // 二、新读：解析视图与录制一致。
      const firstRead = await readWorkflowScriptFile({ cwd, inputPath: target });
      assert.equal(firstRead.ok, true);
      if (!firstRead.ok) continue;
      assert.deepEqual(firstRead.file.meta, golden.metaAfterRead);
      assert.equal(firstRead.file.script, golden.script);
      assert.equal(firstRead.file.bodyLineOffset, golden.bodyLineOffset);
      phases.push("read");

      // 三、新写：经公开工具入口重新落盘（夹具把 script 单列，合并回入参）。
      const written = await saveWorkflowToolEntry.handler(
        { ...golden.input, script: golden.script },
        {
          workingDirectory: cwd,
          toolCallId: "call-fx",
          sessionId: "sess",
        } as never,
      );
      assert.equal(written.ok, true);
      phases.push("write");

      // 四、旧读：新写的字节与旧写逐字节相同（旧读必然同解），解析视图不变。
      const bytes = readFileSync(written.path, "utf8");
      assert.equal(bytes, golden.goldenFile, `${golden.name} 新写与旧写逐字节一致`);
      const secondRead = await readWorkflowScriptFile({ cwd, inputPath: written.path });
      assert.equal(secondRead.ok, true);
      if (!secondRead.ok) continue;
      assert.deepEqual(secondRead.file, firstRead.file);
      phases.push("read-again");

      assert.deepEqual(phases, ["old-write", "read", "write", "read-again"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("B-fl-8 夹具完整性：金样、铸名与 .gitignore 都在册", () => {
  assert.ok(goldens.savedCases.length >= 2);
  for (const golden of goldens.savedCases) {
    assert.equal(typeof golden.goldenFile, "string");
    assert.ok(golden.goldenFile.startsWith("/* knorvia-workflow\n"));
    assert.ok(golden.goldenFile.endsWith(`${golden.script}`));
    assert.equal(golden.bodyLineOffset, golden.goldenFile.split("\n").indexOf("*/") + 1);
  }
  assert.ok(goldens.draftCases.length >= 5);
  for (const draft of goldens.draftCases) {
    assert.ok(draft.fileRel.startsWith(".knorvia-studio/workflow-drafts/"));
    assert.ok(draft.fileRel.endsWith(".dwf.ts"));
  }
  assert.equal(goldens.draftGitignore, "*\n");
  assert.deepEqual(goldens.collisionNames, [
    "same-name.dwf.ts",
    "same-name-2.dwf.ts",
    "same-name-3.dwf.ts",
  ]);
});
