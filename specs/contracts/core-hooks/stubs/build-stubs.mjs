// SPDX-License-Identifier: Apache-2.0
// core-hooks 桩的公共片段与构建入口。
//
// 用法：node specs/contracts/core-hooks/stubs/build-stubs.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerStubs } from "./definitions-runner.mjs";
import { trustStubs } from "./definitions-trust.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "hooks");

const files = { ...runnerStubs, ...trustStubs };
const names = Object.keys(files).sort();
if (names.length !== 16) throw new Error(`expected 16 stub definitions, found ${names.length}`);

await mkdir(target, { recursive: true });
for (const name of names) await writeFile(join(target, name), files[name], "utf8");
console.log(`core-hooks stubs written: ${names.length} files under ${target}`);
