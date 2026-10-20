// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins：凭据 provider 的**组合行位置**（扩展点，不实现凭据逻辑）。
//
// 为什么要断言「位置」而不是「功能」：
//   - `@deepseek-ai/dsh-credentials` 只导出抽象基类 `CredentialProvider`，
//     自身静态属性只有 `length`/`name`/`prototype`（无 `Config`、无自定义 `apply`），
//     因此**不能作为组合行挂载**；
//   - 具体 provider 由 `kernel-plugin-credentials`（#235）提供并在它的 `apply` 里
//     `provide("credentials")`；
//   - 本包的职责是：给出「该挂在哪、行长什么样」的约定，并保证缺席时不生成行。
import { strict as strictAssert } from "node:assert";
import { join as combinePath } from "node:path";
import { pathToFileURL as urlOf } from "node:url";
import { repoRootPath as checkout } from "./entry.mjs";
import { test as caseTest } from "node:test";

/** 内核组合的公开入口（`@knorvia/bootstrap/kernel` 的源码对应文件）。 */
const CREDENTIAL_MODULE = combinePath(
  checkout,
  "apps/cli/packages/bootstrap/src/kernel/credential-provider.ts",
);
const COMPOSITION_MODULE = combinePath(
  checkout,
  "apps/cli/packages/bootstrap/src/kernel/composition.ts",
);

/**
 * 载入一个内核模块。
 *
 * @param absolute - 绝对路径。
 * @returns 模块命名空间。
 */
async function load(absolute) {
  return import(urlOf(absolute).href);
}

caseTest("凭据 provider 行的 id 是 knorvia-credentials（行注册名，不是服务名）", async () => {
  const mod = await load(CREDENTIAL_MODULE);
  strictAssert.equal(
    mod.KERNEL_CREDENTIAL_PROVIDER_ROW_ID,
    "knorvia-credentials",
    "行 id 用 knorvia- 前缀，避免与将来 DSH 自带凭据行重名",
  );
});

caseTest("createKernelCredentialProviderRow 产出可追加的组合行", async () => {
  const { createKernelCredentialProviderRow } = await load(CREDENTIAL_MODULE);
  const row = createKernelCredentialProviderRow("@knorvia/bootstrap/kernel/fixture-credentials");
  strictAssert.deepEqual(row, {
    rowId: "knorvia-credentials",
    moduleId: "@knorvia/bootstrap/kernel/fixture-credentials",
  });
  // 绝对文件地址同样被接受（DSH Loader 认两种形态）。
  const byUrl = createKernelCredentialProviderRow("file:///tmp/credential-provider.mjs");
  strictAssert.equal(byUrl.moduleId, "file:///tmp/credential-provider.mjs");
});

caseTest("空模块标识是配置错误，必须早失败", async () => {
  const { createKernelCredentialProviderRow } = await load(CREDENTIAL_MODULE);
  for (const bad of ["", "   ", "\t\n"]) {
    strictAssert.throws(
      () => createKernelCredentialProviderRow(bad),
      /requires a module id/u,
      `空标识 ${JSON.stringify(bad)} 必须被拒绝`,
    );
  }
});

caseTest("组合在缺席时**不生成**凭据行（不凭空假设有 provider）", async () => {
  const { createKernelPluginRows } = await load(COMPOSITION_MODULE);
  const rows = createKernelPluginRows("C:/tmp/dsh-home", { cwd: "C:/tmp/ws" });
  const credentialRows = rows.filter((row) => row.id === "knorvia-credentials");
  strictAssert.equal(
    credentialRows.length,
    0,
    "没有 provider 模块标识时不得生成凭据行（否则会挂载一个不存在的模块）",
  );
});

caseTest("组合在给出模块标识时生成凭据行，且位置在 MCP 行之前", async () => {
  const { createKernelPluginRows } = await load(COMPOSITION_MODULE);
  const rows = createKernelPluginRows("C:/tmp/dsh-home", {
    cwd: "C:/tmp/ws",
    credentialProviderModuleId: "@knorvia/bootstrap/kernel/fixture-credentials",
    mcpServers: { "fixture-http": { type: "http", url: "http://127.0.0.1:9/mcp" } },
  });
  const ids = rows.map((row) => row.id);
  const credentialAt = ids.indexOf("knorvia-credentials");
  strictAssert.notEqual(credentialAt, -1, "给出模块标识时必须生成凭据行");
  strictAssert.equal(
    rows[credentialAt].name,
    "@knorvia/bootstrap/kernel/fixture-credentials",
    "行的模块标识必须原样透传",
  );
  // 位置：在 MCP **客户端**行之前（凭据是 LLM 的前置能力，先于外部服务器）。
  // 注意底座第 18 行本身就是 `mcp-resources`（资源服务，不是客户端），不能拿它当基准。
  const mcpClientAt = rows.findIndex((row) => row.name === "@deepseek-ai/dsh-mcp-client");
  strictAssert.ok(mcpClientAt >= 0, "给了 mcpServers 就必须有 MCP 客户端行");
  strictAssert.ok(
    credentialAt < mcpClientAt,
    `凭据行必须排在 MCP 客户端行之前；实际 credentials=${credentialAt} mcpClient=${mcpClientAt}`,
  );
  // 行 id 全局唯一。
  strictAssert.equal(new Set(ids).size, ids.length, "加了凭据行后行 id 仍须唯一");
});
