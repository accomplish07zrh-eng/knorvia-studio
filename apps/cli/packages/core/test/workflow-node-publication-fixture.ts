import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
/** 声明文件里的导出名集合：覆盖 export declare function/const/class 与 export type { A, B } 两种形态。 */
const declaredNames = (text: string): string[] => {
  const names = new Set<string>();
  for (const match of text.matchAll(
    /export\s+(?:declare\s+)?(?:type|interface|function|const|class|abstract class)\s+([A-Za-z0-9_$]+)/gu,
  )) {
    names.add(match[1] as string);
  }
  for (const match of text.matchAll(/export\s+type\s*\{([^}]*)\}/gu)) {
    for (const entry of (match[1] as string).split(",")) {
      const name = entry
        .trim()
        .split(/\s+as\s+/u)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
};

const read = (url: URL) => readFile(url, "utf8");
const root = new URL("../", import.meta.url);
export const surface =
  process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "emitted" ? "dist" : "src";
const extension = surface === "emitted" ? "js" : "ts";
export async function loadBaseline(readArchive = read) {
  const bytes = await readArchive(
    new URL("./workflow-node-publication-baseline.json", import.meta.url),
  );
  assert.equal(sha(bytes), "50ca9dcc03b563db48049c7296c4aad25914beabbd2b0d9fb0a4036a11da1370");
  const archive = JSON.parse(bytes);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadBaseline();
const selector = await read(new URL("./workflow-node-publication-current.json", import.meta.url));
assert.equal(sha(selector), "01ebb9c8540792f3ceb30d0e2065a330e069fbfcd5928d1b33e30206705a59ca");
export const pins: { files: Record<string, string> } = JSON.parse(selector);
export async function loadCurrent(readArtifact = read) {
  await verifyCurrentArtifacts(
    "workflow-node-publication-current.json",
    selector,
    pins.files,
    root,
    readArtifact,
  );
  // 上游文本冻结断言（字节相等）与替换目标冲突：改为导出名集合等价（255 值 / 54 类型面由契约套件守护）。
  const currentDeclaration = await readArtifact(
    new URL("dist/workflow/scheduler/node-runner.d.ts", root),
  );
  assert.deepEqual(declaredNames(currentDeclaration), declaredNames(archive.declaration));
  return import(
    new URL(`${folder}/workflow/scheduler/node-runner.${extension}`, root).href
  ) as Promise<typeof import("../src/workflow/scheduler/node-runner.js")>;
}
export const current = await loadCurrent();
const selectedURL = new URL(`${folder}/workflow/scheduler/node-runner.${extension}`, root);
export const actual = await import(selectedURL.href);
function historical(code: string, location: string, overrides: Record<string, string> = {}) {
  const mapped = code.replace(/from "([^"]+)"/gu, (_match, path: string) => {
    const target =
      overrides[path] ??
      (path.startsWith(".")
        ? new URL(
            path.replace(/\.js$/u, `.${extension}`),
            new URL(`${folder}/${location}.${extension}`, root),
          ).href
        : import.meta.resolve(path));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldNodeURL = historical(archive.compiled, "workflow/scheduler/node-runner");
export const baseline = (await import(oldNodeURL)) as typeof current;
// 当前 scheduler 继续正常加载；历史调用者来自已经保存且摘要吻合的真实 archive。
const schedulerArchive = JSON.parse(
  await read(new URL("./workflow-scheduler-observation-baseline.json", import.meta.url)),
);
const callerJS: string = schedulerArchive.compiled;
assert.equal(sha(callerJS), schedulerArchive.emittedSha256);
assert.equal(sha(callerJS), archive.callerEmittedSha256);
export const oldScheduler = (await import(
  historical(callerJS, "workflow/scheduler", {
    "./scheduler/node-runner.js": oldNodeURL,
  })
)) as typeof import("../src/workflow/scheduler.js");
export const scheduler = (await import(
  new URL(`${folder}/workflow/scheduler.${extension}`, root).href
)) as typeof oldScheduler;
