// SPDX-License-Identifier: Apache-2.0
// 基线的落盘格式：每张图带一份 sidecar 记录（含生成时的提交、几何与信号），根目录再放一份汇总清单。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BASELINE_SCHEMA = 1;

export function imageFileName(theme, width) {
  return `${theme}-${width}.png`;
}

export function imageMetaFileName(theme, width) {
  return `${theme}-${width}.json`;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function git(repoRoot, args) {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** 记录截图对应的提交：工作树 HEAD 与它相对 origin/main 的合并基点。 */
export function readRepoCommit(repoRoot) {
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  const headSubject = git(repoRoot, ["log", "-1", "--pretty=%s"]);
  const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const mainTip = git(repoRoot, ["rev-parse", "origin/main"]);
  const mainBase = mainTip ? git(repoRoot, ["merge-base", "HEAD", "origin/main"]) : null;
  return { head, headSubject, branch, mainTip, mainBase };
}

/** 写入一份截图产物：`<out>/<page>/<theme>-<width>.png` 与同名 sidecar，最后写汇总清单。 */
export async function writeCapture({
  out,
  pagesFile,
  pagesSha256,
  themes,
  viewports,
  environment,
  commit,
  records,
}) {
  await mkdir(out, { recursive: true });
  const images = [];
  for (const record of records) {
    const directory = join(out, record.page);
    await mkdir(directory, { recursive: true });
    const fileName = imageFileName(record.theme, record.width);
    await writeFile(join(directory, fileName), record.image);
    const sidecar = {
      schema: BASELINE_SCHEMA,
      page: record.page,
      pageTitle: record.pageTitle,
      theme: record.theme,
      width: record.width,
      height: record.height,
      file: fileName,
      imageSha256: sha256(record.image),
      bytes: record.image.length,
      generatedAt: record.generatedAt,
      commit,
      environment,
      screenshotMs: record.screenshotMs,
      geometry: record.geometry,
      signals: record.signals,
    };
    await writeFile(
      join(directory, imageMetaFileName(record.theme, record.width)),
      `${JSON.stringify(sidecar, null, 2)}\n`,
      "utf8",
    );
    images.push({
      page: record.page,
      theme: record.theme,
      width: record.width,
      height: record.height,
      file: `${record.page}/${fileName}`,
      imageSha256: sidecar.imageSha256,
      bytes: sidecar.bytes,
      commit: commit.head,
      mainBase: commit.mainBase,
      screenshotMs: record.screenshotMs,
    });
  }
  const manifest = {
    schema: BASELINE_SCHEMA,
    tool: "scripts/ui-baseline",
    generatedAt: new Date().toISOString(),
    commit,
    environment,
    pagesFile,
    pagesSha256,
    themes,
    viewports,
    images,
  };
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/** 读取一份产物目录：清单 + 每张图的 sidecar。 */
export async function readCapture(directory) {
  const manifestPath = join(directory, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`读取基线清单失败：${manifestPath}（${error.message}）`);
  }
  if (manifest.schema !== BASELINE_SCHEMA) {
    throw new Error(`基线清单 schema 不匹配：期望 ${BASELINE_SCHEMA}，实际 ${manifest.schema}`);
  }
  const entries = [];
  for (const image of manifest.images ?? []) {
    const pageDirectory = join(directory, image.page);
    const metaPath = join(pageDirectory, imageMetaFileName(image.theme, image.width));
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    entries.push({
      image,
      meta,
      imagePath: join(pageDirectory, imageFileName(image.theme, image.width)),
    });
  }
  return { directory, manifest, entries };
}
