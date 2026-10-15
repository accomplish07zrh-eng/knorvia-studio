// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: workflow script/draft file reading, writing and
// the recorded golden round trip (old write -> read -> rewrite -> read).
// Black box: asserts only public exports; expected bytes come from fixtures recorded on the old
// implementation's real write surface (SaveWorkflow handler + writeWorkflowDraft).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { saveWorkflowToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/save-workflow.js";
import {
  resolveWorkflowDraftName,
  writeWorkflowDraft,
} from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-drafts.js";
import { readWorkflowScriptFile } from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-path-source.js";

interface SavedGolden {
  name: string;
  input: Record<string, unknown>;
  script: string;
  fileRel: string;
  bodyLineOffset: number;
  goldenFile: string;
  metaAfterRead: Record<string, unknown>;
}

interface DraftGolden {
  name: string;
  source: string;
  fileRel: string;
}

interface Goldens {
  savedCases: SavedGolden[];
  draftCases: DraftGolden[];
  draftGitignore: string;
  collisionNames: (string | null)[];
}

const goldens = JSON.parse(
  readFileSync(new URL("../fixtures/workflow-file-goldens.json", import.meta.url), "utf8"),
) as Goldens;

/** 每个用例一个独立临时工作目录；用完即删，绝不触碰真实用户数据目录。 */
function scratch(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `wf01-${prefix}-`));
}

function relToPosix(absolute: string, cwd: string): string {
  return path.relative(cwd, absolute).split(path.sep).join("/");
}

/** 夹具把 script 单列，喂给工具入口时合并回入参。 */
function fullInput(
  golden: SavedGolden,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...golden.input, script: golden.script, ...extra };
}

test("B-fl-1/B-sw-7 旧写金样被读回同一视图（旧写 → 新读）", async () => {
  for (const golden of goldens.savedCases) {
    const cwd = scratch("read");
    try {
      const target = path.join(cwd, ...golden.fileRel.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, golden.goldenFile, "utf8");

      const read = await readWorkflowScriptFile({ cwd, inputPath: target });
      assert.equal(read.ok, true);
      if (!read.ok) continue;
      assert.deepEqual(read.file.meta, golden.metaAfterRead, `${golden.name} 元数据`);
      assert.equal(read.file.script, golden.script, `${golden.name} 正文`);
      assert.equal(read.file.bodyLineOffset, golden.bodyLineOffset, `${golden.name} 行偏移`);
      assert.equal(read.file.source, golden.goldenFile, `${golden.name} 原文逐字节`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("B-sw-7 新写产出与旧写逐字节相同的文件（新写 = 旧写）", async () => {
  for (const golden of goldens.savedCases) {
    const cwd = scratch("write");
    try {
      const result = await saveWorkflowToolEntry.handler(fullInput(golden), {
        workingDirectory: cwd,
        toolCallId: "call-write",
        sessionId: "session-write",
      } as never);
      assert.equal(result.ok, true);
      assert.equal(relToPosix(result.path, cwd), golden.fileRel, `${golden.name} 落点`);
      const bytes = readFileSync(result.path, "utf8");
      assert.equal(bytes, golden.goldenFile, `${golden.name} 金样字节`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("B-sw-7 新写的文件被读回同一视图（新写 → 旧读），往返闭合", async () => {
  const golden = goldens.savedCases[0]!;
  const cwd = scratch("roundtrip");
  try {
    const result = await saveWorkflowToolEntry.handler(fullInput(golden), {
      workingDirectory: cwd,
      toolCallId: "call-roundtrip",
      sessionId: "session-roundtrip",
    } as never);
    const read = await readWorkflowScriptFile({ cwd, inputPath: result.path });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(read.file.meta, golden.metaAfterRead);
    assert.equal(read.file.script, golden.script);
    assert.equal(read.file.bodyLineOffset, golden.bodyLineOffset);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-sw-7 保存响应区分新建与覆盖，覆盖在写的那一刻重判", async () => {
  const golden = goldens.savedCases[1]!;
  const cwd = scratch("overwrite");
  try {
    const first = await saveWorkflowToolEntry.handler(fullInput(golden), {
      workingDirectory: cwd,
      toolCallId: "call-1",
      sessionId: "session-1",
    } as never);
    assert.equal(first.overwritten, false);
    assert.equal(
      first.response,
      `Saved the workflow '${golden.name}' to ${first.path}. Run it with CreateWorkflow using \`saved: { name: "${golden.name}" }\`.`,
    );

    // 入参上伪造 overwrite:false 不影响落盘自述：written.overwritten 在写时重判。
    const forged = fullInput(golden, { overwrite: false });
    const second = await saveWorkflowToolEntry.handler(forged, {
      workingDirectory: cwd,
      toolCallId: "call-2",
      sessionId: "session-2",
    } as never);
    assert.equal(second.overwritten, true);
    assert.equal(
      second.response,
      `Replaced the saved workflow '${golden.name}' at ${second.path}. Run it with CreateWorkflow using \`saved: { name: "${golden.name}" }\`.`,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-df-1/B-df-2 草稿逐字落盘并按铸名规则命名", async () => {
  for (const golden of goldens.draftCases) {
    const cwd = scratch("draft");
    try {
      const written = await writeWorkflowDraft({ cwd, name: golden.name, source: golden.source });
      assert.notEqual(written, undefined);
      if (written === undefined) continue;
      assert.equal(relToPosix(written.path, cwd), golden.fileRel, `铸名 ${golden.name}`);
      assert.equal(readFileSync(written.path, "utf8"), golden.source, `字节 ${golden.name}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("B-df-3 同名草稿按 -2、-3 顺延，绝不覆盖已有草稿", async () => {
  const cwd = scratch("collision");
  try {
    const seen: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const written = await writeWorkflowDraft({
        cwd,
        name: "same name",
        source: `// v${round}\n`,
      });
      assert.notEqual(written, undefined);
      if (written === undefined) continue;
      seen.push(path.basename(written.path));
      assert.equal(readFileSync(written.path, "utf8"), `// v${round}\n`);
    }
    assert.deepEqual(seen, goldens.collisionNames);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-df-4 草稿目录 .gitignore 只写一次，用户改过就不再动", async () => {
  const cwd = scratch("gitignore");
  try {
    const first = await writeWorkflowDraft({ cwd, name: "one", source: "// a\n" });
    assert.notEqual(first, undefined);
    const ignorePath = path.join(cwd, ".knorvia-studio", "workflow-drafts", ".gitignore");
    assert.equal(readFileSync(ignorePath, "utf8"), goldens.draftGitignore);

    // 用户改过之后：第二次写草稿不得覆盖。
    writeFileSync(ignorePath, "# custom\n", "utf8");
    const second = await writeWorkflowDraft({ cwd, name: "two", source: "// b\n" });
    assert.notEqual(second, undefined);
    assert.equal(readFileSync(ignorePath, "utf8"), "# custom\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-df-5 尽力而为：写不成返回 undefined 而不是抛错", async () => {
  // cwd 缺席 / 空串：无处可写。
  assert.equal(await writeWorkflowDraft({ cwd: undefined, name: "x", source: "s" }), undefined);
  assert.equal(await writeWorkflowDraft({ cwd: "", name: "x", source: "s" }), undefined);

  // .knorvia-studio 被建成了普通文件：目录建不出来。
  const cwd = scratch("blocked");
  try {
    writeFileSync(path.join(cwd, ".knorvia-studio"), "not a dir\n", "utf8");
    assert.equal(await writeWorkflowDraft({ cwd, name: "x", source: "s" }), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-df-6 草稿名兜底链：显式名 → 第一个阶段名 → workflow", () => {
  assert.equal(resolveWorkflowDraftName("PR review", undefined), "PR review");
  assert.equal(resolveWorkflowDraftName("   ", undefined), "workflow");
  assert.equal(resolveWorkflowDraftName(undefined, undefined), "workflow");
  assert.equal(
    resolveWorkflowDraftName(undefined, {
      phases: [
        { id: "phase:1", name: "研究" },
        { id: "phase:2", name: "汇总" },
      ],
    }),
    "研究",
  );
  assert.equal(resolveWorkflowDraftName(undefined, { phases: [{ id: "phase:1" }] }), "workflow");
});

test("B-fl-2 无块文件整个是脚本，偏移 0 且无元数据", async () => {
  const cwd = scratch("plain");
  try {
    const target = path.join(cwd, "plain.dwf.ts");
    writeFileSync(target, "// just code\nreturn 1;\n", "utf8");
    const read = await readWorkflowScriptFile({ cwd, inputPath: "plain.dwf.ts" });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.file.script, "// just code\nreturn 1;\n");
    assert.equal(read.file.bodyLineOffset, 0);
    assert.equal(read.file.meta, undefined);
    assert.equal(read.file.source, read.file.script);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-fl-3 parseFrontmatter:false 整个文件都是片段，带块也不剥", async () => {
  const cwd = scratch("nofront");
  try {
    const golden = goldens.savedCases[0]!;
    const target = path.join(cwd, "snippet.dwf.ts");
    writeFileSync(target, golden.goldenFile, "utf8");
    const read = await readWorkflowScriptFile({
      cwd,
      inputPath: target,
      parseFrontmatter: false,
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.file.script, golden.goldenFile);
    assert.equal(read.file.bodyLineOffset, 0);
    assert.equal(read.file.meta, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-fl-4 块判定看首个非空行，兼容旧 zcode 标记", async () => {
  const cwd = scratch("sentinel");
  try {
    const legacy = path.join(cwd, "legacy.dwf.ts");
    writeFileSync(legacy, "/* zcode-workflow\ndescription: legacy kept\n*/\nreturn 1;\n", "utf8");
    const read = await readWorkflowScriptFile({ cwd, inputPath: legacy });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(read.file.meta, { description: "legacy kept" });
    assert.equal(read.file.script, "return 1;\n");
    assert.equal(read.file.bodyLineOffset, 3);

    // 首个非空行之前允许空行；正文里出现标记不算块。
    const leadingBlank = path.join(cwd, "blank.dwf.ts");
    writeFileSync(leadingBlank, "\n\n/* knorvia-workflow\ndescription: d\n*/\nx\n", "utf8");
    const readBlank = await readWorkflowScriptFile({ cwd, inputPath: leadingBlank });
    assert.equal(readBlank.ok, true);
    if (!readBlank.ok) return;
    assert.equal(readBlank.file.bodyLineOffset, 5);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-fl-5 失败与坏块都点名文件，坏块带原因与细节", async () => {
  const cwd = scratch("errors");
  try {
    const missing = await readWorkflowScriptFile({ cwd, inputPath: "nope.dwf.ts" });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.message, /^The workflow script file /u);
    assert.match(missing.message, /nope\.dwf\.ts could not be read: /u);
    assert.match(missing.message, /Pass `path` for a file that exists/u);

    const broken = path.join(cwd, "broken.dwf.ts");
    writeFileSync(broken, "/* knorvia-workflow\ndescription: d\n", "utf8");
    const bad = await readWorkflowScriptFile({ cwd, inputPath: broken });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.match(bad.message, /could not be read \(unterminated_frontmatter\)/u);
    assert.match(bad.message, /Fix the block in that file/u);

    const invalid = path.join(cwd, "invalid.dwf.ts");
    writeFileSync(invalid, "/* knorvia-workflow\nnonsense: [\n*/\nx\n", "utf8");
    const wrong = await readWorkflowScriptFile({ cwd, inputPath: invalid });
    assert.equal(wrong.ok, false);
    if (wrong.ok) return;
    assert.match(wrong.message, /could not be read \((invalid_yaml|invalid_metadata)\)/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-fl-6 相对路径按会话工作目录解析，绝对路径原样归一", async () => {
  const cwd = scratch("paths");
  try {
    mkdirSync(path.join(cwd, "sub"), { recursive: true });
    const target = path.join(cwd, "sub", "a.dwf.ts");
    writeFileSync(target, "return 1;\n", "utf8");

    const relative = await readWorkflowScriptFile({ cwd, inputPath: path.join("sub", "a.dwf.ts") });
    assert.equal(relative.ok, true);
    if (relative.ok) assert.equal(relative.file.path, target);

    const absolute = await readWorkflowScriptFile({ cwd, inputPath: target });
    assert.equal(absolute.ok, true);
    if (absolute.ok) assert.equal(absolute.file.path, target);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("B-fl-7 金样草稿经写入再读回仍逐字节一致（草稿往返）", async () => {
  for (const golden of goldens.draftCases) {
    const cwd = scratch("draft-read");
    try {
      const written = await writeWorkflowDraft({ cwd, name: golden.name, source: golden.source });
      assert.notEqual(written, undefined);
      if (written === undefined) continue;
      const read = await readWorkflowScriptFile({ cwd, inputPath: written.path });
      assert.equal(read.ok, true);
      if (!read.ok) continue;
      assert.equal(read.file.source, golden.source);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  // 夹具真实被读取的证明见 fixtures.test.ts；此处只锚定往返语义。
  assert.ok(goldens.draftCases.length >= 5);
  assert.ok(!existsSync(path.join(tmpdir(), "never-created-wf01")));
});
