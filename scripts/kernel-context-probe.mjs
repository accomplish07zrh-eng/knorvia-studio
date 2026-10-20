// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 测试探针：boot 内核并装配一次系统提示，把结果按 JSON 回传到 stdout。
// 与契约测试的宿主进程分离，避免 boot 的进程级环境清洗影响测试本身。
//
// 契约见 specs/contracts/kernel-dsh-builtins/behavior.md B14-B16。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entryMode = process.env.KNORVIA_KERNEL_ENTRY === "source" ? "source" : "dist";
const extension = entryMode === "dist" ? ".js" : ".ts";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const kernelEntry = join(
  repoRoot,
  "apps/cli/packages/bootstrap",
  entryMode === "dist" ? "dist/kernel" : "src/kernel",
  `index${extension}`,
);
// renderPrompt / renderContextSnapshot 是 DSH 的公开导出，用来把装配结果变成文本。
const systemPromptEntry = join(
  repoRoot,
  "node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js",
);

const kernel = await import(pathToFileURL(kernelEntry).href);
const { renderPrompt, renderContextSnapshot } = await import(pathToFileURL(systemPromptEntry).href);

const host = await kernel.bootKernel({ cwd: process.cwd(), env: process.env });

try {
  const systemPrompt = host.context.get("systemPrompt");
  if (systemPrompt === undefined) {
    process.stderr.write("ctx.systemPrompt is not mounted\n");
    process.exit(3);
  }
  const assembly = await systemPrompt.assemble();
  const payload = {
    prompt: renderPrompt(assembly),
    snapshot: renderContextSnapshot(assembly),
    sections: assembly.sections.map((section) => section.name),
    contexts: assembly.contexts.map((context) => context.name),
    personaPrefix: kernel.KERNEL_PERSONA_PREFIX,
  };
  process.stdout.write(JSON.stringify(payload));
} finally {
  await host.dispose();
}
