// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const entrypoint = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const defaultOutput = fileURLToPath(new URL("../dist/mcp/server.js", import.meta.url));
const requireBanner =
  'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);';

async function publish(bytes, target) {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  // exclusive open 成功后才拥有临时文件，重名失败不能清理另一调用的文件。
  const file = await open(temporary, "wx");
  const failures = [];
  try {
    await file.writeFile(bytes);
  } catch (error) {
    failures.push(error);
  }
  try {
    await file.close();
  } catch (error) {
    failures.push(error);
  }
  if (!failures.length) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await unlink(temporary);
  } catch (error) {
    if (error?.code !== "ENOENT") failures.push(error);
  }
  // 写入、关闭和清理各自可能失败；保留全部原因，不能让 finally 覆盖最初故障。
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, "Unable to publish the execution host bundle");
}

export async function buildNodeReplHostBundle({
  outfile = defaultOutput,
  cuaHelperBuildId = process.env.KNORVIA_CUA_HELPER_BUILD_ID?.trim() ?? "",
} = {}) {
  const target = resolve(outfile);
  const compiled = await build({
    entryPoints: [entrypoint],
    outfile: target,
    write: false,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    legalComments: "eof",
    define: { __KNORVIA_CUA_HELPER_BUILD_ID__: JSON.stringify(cuaHelperBuildId) },
    banner: { js: requireBanner },
  });
  const outputs = compiled.outputFiles;
  if (outputs?.length !== 1 || outputs[0].path !== target)
    throw new Error("The execution host build must produce the single requested output");
  await publish(outputs[0].contents, target);
  return { outfile, cuaHelperBuildId };
}

const commandPath = process.argv[1];
// URL 的 query/hash 也是导入身份的一部分，不能解码成同一路径后误当作直接入口。
if (commandPath && pathToFileURL(resolve(commandPath)).href === import.meta.url)
  await buildNodeReplHostBundle();
