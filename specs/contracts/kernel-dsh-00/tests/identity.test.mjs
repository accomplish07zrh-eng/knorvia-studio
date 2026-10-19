// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B11：系统提示使用 Knorvia 开场，且不包含 Harness 身份句。
import assert from "node:assert/strict";
import { renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

const HARNESS_IDENTITY = "You are an AI agent powered by DeepSeek Harness.";

test("B11 装配后的 prompt 以 Knorvia 开场，不含 Harness 身份句", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-identity-");
  try {
    await withBoot(kernel, { root }, async ({ host }) => {
      const systemPrompt = host.context.get("systemPrompt");
      assert.ok(systemPrompt, "systemPrompt 服务应存在");
      const assembly = await systemPrompt.assemble();
      const sections = assembly.sections.map((section) => section.name);
      assert.equal(sections.includes("harness:identity"), false, "不得注册 Harness 身份段");
      assert.ok(sections.includes("deployment:persona-prefix"), "必须注册部署 persona 前缀");
      const persona = assembly.sections.find(
        (section) => section.name === "deployment:persona-prefix",
      );
      assert.equal(persona.text, kernel.KERNEL_PERSONA_PREFIX);
      assert.equal(kernel.KERNEL_PERSONA_PREFIX.includes("你是 Knorvia"), true);

      const prompt = renderPrompt(assembly);
      assert.ok(prompt.startsWith(kernel.KERNEL_PERSONA_PREFIX), prompt);
      assert.ok(prompt.includes("Knorvia"), "装配后的 prompt 必须包含 Knorvia");
      assert.equal(prompt.includes(HARNESS_IDENTITY), false, prompt);
      assert.equal(
        prompt.includes("powered by DeepSeek Harness"),
        false,
        "不得保留 Harness 身份句",
      );
    });
  } finally {
    await removeTempDir(root);
  }
});
