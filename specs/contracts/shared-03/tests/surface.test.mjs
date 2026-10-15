// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：模块路径面与导出面（behavior 通用约定 + interface.md §1/§3）。
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { barrel, loadModule, entryLabel, repoRoot } from "./entry.mjs";

const appendix = JSON.parse(
  readFileSync(resolve(repoRoot, "specs/contracts/shared-03/interface-appendix.json"), "utf8"),
);

const NAMES = appendix.files.map((f) =>
  f.path.replace("packages/shared/src/", "").replace(/\.ts$/u, ""),
);

test(`B51 34 个模块路径在 ${entryLabel} 入口全部可达`, async () => {
  assert.equal(NAMES.length, 34);
  for (const name of NAMES) {
    const mod = await loadModule(name);
    assert.equal(typeof mod, "object", `${name} 可加载`);
  }
});

test("导出名集合与附录逐名一致（运行时 195 项）", async () => {
  let checked = 0;
  for (const file of appendix.files) {
    const name = file.path.replace("packages/shared/src/", "").replace(/\.ts$/u, "");
    const mod = await loadModule(name);
    for (const exportName of file.runtime) {
      assert.ok(exportName in mod, `${name} 的运行时导出 ${exportName} 在场`);
      checked += 1;
    }
  }
  assert.equal(checked, appendix.totalRuntime);
});

test("子路径入口与再导出面在场（interface.md §1）", async () => {
  const preview = await loadModule("conversation-preview-artifacts");
  assert.ok("conversationArtifactTypeSchema" in preview, "conversationArtifactTypeSchema 再导出");
  const discovery = await loadModule("workspace-hook-discovery");
  assert.ok("workspaceHooksConfigSchema" in discovery, "星再导出自 config");
  assert.ok("resolveWorkspaceHookEntries" in discovery, "星再导出自 digest");
  const protocolV4 = await loadModule("protocol-v4/index");
  assert.ok("bashOutputDisplaySchema" in protocolV4, "协议桶再导出 bashOutputDisplaySchema");
  assert.ok(
    "executionOutputPreviewSchema" in protocolV4,
    "协议桶再导出 executionOutputPreviewSchema",
  );
});

test("根 barrel 采样可达（22 件口径）", () => {
  for (const name of [
    "resolveWorkspaceKey",
    "parseKnorviaBackgroundTaskControlItems",
    "appendAssistantMessagePart",
    "KNORVIA_KNOWN_TOOL_NAMES",
    "resolveStartupLocalWorkspaceSessionIndex",
  ]) {
    assert.ok(name in barrel, `${name} 可从根 barrel 取到`);
  }
});
