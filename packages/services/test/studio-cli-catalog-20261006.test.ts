import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { admitStudioCommand } from "../src/studio-runtime/app/commandAdmission.js";
import type { StudioCommand, StudioConversation } from "../src/studio-runtime/contract.js";
import type { StudioGroupDefinition } from "../src/studio-runtime/workflowTypes.js";
import { BUILTIN_KERNELS } from "../src/studio-runtime/adapters/kernels/acpCatalog.js";
import { kernelProtocolBinding } from "../src/studio-runtime/adapters/kernels/protocolBindings.js";
import { resolveExecutable } from "../src/studio-runtime/adapters/kernels/executable.js";
import { isStudioKernelId } from "../src/studio-runtime/domain/kernelIdentity.js";
import {
  isRetiredKernel,
  RETIRED_KERNEL_MESSAGE,
} from "../src/studio-runtime/domain/kernelPolicy.js";
import { routeStudioGroupMembers } from "../src/studio-runtime/domain/groupPolicy.js";
import { group } from "./studio-orchestration-support.js";

// specs/knorvia-cli-catalog-20261006.md

test("gemini-cli is retired: still a valid stored identity, but gone from the catalog", () => {
  assert.equal(
    BUILTIN_KERNELS.some((item) => item.id === "gemini-cli"),
    false,
  );
  assert.equal(isStudioKernelId("gemini-cli"), true);
  assert.equal(isStudioKernelId(`ssh:${"a".repeat(24)}:gemini-cli`), true);
  assert.equal(isRetiredKernel("gemini-cli"), true);
  assert.equal(isRetiredKernel(`ssh:${"a".repeat(24)}:gemini-cli`), true);
  assert.equal(isRetiredKernel("qwen-code"), false);
});

test("retired kernels are rejected before queueing; saved records are kept", () => {
  const db = new StudioDatabase(join(mkdtempSync(join(tmpdir(), "studio-retired-")), "db.sqlite"));
  const clock = { now: Date.now, id: randomUUID, delay: async () => {} };
  const command = (value: Omit<StudioCommand, "commandId">) =>
    admitStudioCommand(db, clock, { ...value, commandId: randomUUID() } as StudioCommand);
  try {
    // 新建与配置不再接受已移除内核。
    assert.throws(
      () =>
        command({
          type: "create-conversation",
          id: "new",
          kernel: "gemini-cli",
          workspacePath: "D:/project",
        } as StudioCommand),
      (error: Error) => error.message === RETIRED_KERNEL_MESSAGE,
    );
    assert.throws(
      () =>
        command({
          type: "configure",
          kernel: "gemini-cli",
          config: { executablePath: "", permission: "ask" },
        } as StudioCommand),
      (error: Error) => error.message === RETIRED_KERNEL_MESSAGE,
    );
    // 旧版本保存的会话仍可读取，但发送在入队前被拒绝，不产生运行记录。
    const now = Date.now();
    const legacy: StudioConversation = {
      id: "legacy",
      kernel: "gemini-cli",
      workspacePath: "D:/project",
      title: "old",
      createdAt: now,
      updatedAt: now,
    };
    db.transaction(() => db.write("conversation", legacy.id, legacy));
    assert.throws(
      () =>
        command({ type: "send", kind: "chat", targetId: "legacy", text: "hi" } as StudioCommand),
      (error: Error) => error.message === RETIRED_KERNEL_MESSAGE,
    );
    assert.equal(db.list("run").length, 0);
    assert.deepEqual(db.read("conversation", "legacy"), legacy);
    // 含已移除成员的群聊仍可保存（不丢成员），但运行被拒绝。
    const saved: StudioGroupDefinition = {
      ...group,
      id: "retired-group",
      members: ["knorvia", "gemini-cli"],
      host: "knorvia",
      workspacePath: "D:/project",
    };
    command({ type: "save-group", group: saved } as StudioCommand);
    assert.deepEqual(db.read<StudioGroupDefinition>("group", saved.id)?.members, [
      "knorvia",
      "gemini-cli",
    ]);
    assert.throws(
      () =>
        command({
          type: "send",
          kind: "group",
          targetId: saved.id,
          text: "hi",
        } as StudioCommand),
      (error: Error) => error.message === RETIRED_KERNEL_MESSAGE,
    );
    assert.equal(db.list("run").length, 0);
  } finally {
    db.close();
  }
});

test("six added ACP kernels use the verified launch args and mentions", () => {
  const byId = new Map(BUILTIN_KERNELS.map((item) => [item.id, item]));
  assert.deepEqual(byId.get("devin")?.args, ["acp"]);
  assert.equal(byId.get("cursor")?.executableName, "cursor-agent");
  assert.deepEqual(byId.get("cursor")?.args, ["acp"]);
  assert.deepEqual(byId.get("factory-droid")?.args, ["exec", "--output-format", "acp"]);
  assert.deepEqual(byId.get("cline")?.args, ["--acp"]);
  assert.deepEqual(byId.get("auggie")?.args, ["--acp"]);
  assert.deepEqual(byId.get("junie")?.args, ["--acp=true"]);
  assert.equal(byId.get("kimi-cli")?.displayName, "Kimi Code");
  assert.deepEqual(byId.get("kimi-cli")?.npmPackages, ["@moonshot-ai/kimi-code"]);
  // Auggie 的自动更新关闭变量随进程环境传入，而不是写入用户配置。
  const turn = {} as Parameters<typeof kernelProtocolBinding>[1];
  assert.deepEqual(kernelProtocolBinding(byId.get("auggie")!, turn).environment, {
    AUGMENT_DISABLE_AUTO_UPDATE: "1",
  });
  assert.equal(kernelProtocolBinding(byId.get("cline")!, turn).environment, undefined);
  const members = {
    ...group,
    members: ["knorvia", "devin", "factory-droid", "auggie"],
    host: "knorvia",
  } as const;
  assert.deepEqual(routeStudioGroupMembers(members, "@Factory Droid please check"), [
    "factory-droid",
  ]);
  assert.deepEqual(routeStudioGroupMembers(members, "@devin go"), ["devin"]);
});

test(
  "alternate command names are found and the community grok package is not Grok Build",
  {
    skip: process.platform === "win32" ? "POSIX shebang fixtures" : false,
  },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-alt-exec-"));
    const previous = process.env.PATH;
    try {
      const qodercli = join(dir, "qodercli");
      await writeFile(qodercli, "#!/bin/sh\necho 1.0.0\n");
      await chmod(qodercli, 0o755);
      process.env.PATH = dir;
      const found = await resolveExecutable("qoder");
      assert.equal(found.path, qodercli);

      const community = join(dir, "node_modules", "@vibe-kit", "grok-cli", "dist");
      await mkdir(community, { recursive: true });
      const entry = join(community, "index.js");
      await writeFile(entry, "#!/usr/bin/env node\n");
      await chmod(entry, 0o755);
      const { symlink } = await import("node:fs/promises");
      await symlink(entry, join(dir, "grok"));
      await assert.rejects(() => resolveExecutable("grok-build"), /未安装/);
    } finally {
      process.env.PATH = previous;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
