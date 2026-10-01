import { glob } from "node:fs/promises";
import { sep } from "node:path";

export async function compactStudioTestArguments({
  repoRoot,
  explicitTests,
  testDirectories,
  discoveredTests,
}) {
  // 修复：逐文件 argv 在 CI224 超出 Windows 长度限制；原扫描仍是覆盖范围的唯一依据。
  const argumentsList = [
    ...explicitTests,
    ...testDirectories.map((directory) => `${directory}/{*.test,.*.test,.test}.{ts,mjs}`),
  ];
  const expected = new Set(discoveredTests);
  if (expected.size !== discoveredTests.length || expected.size === 0) {
    throw new Error("Offline studio test discovery is empty or contains duplicate paths");
  }
  const actual = new Set();
  for await (const path of glob(argumentsList, { cwd: repoRoot })) {
    actual.add(path.split(sep).join("/"));
  }
  const missing = [...expected].filter((path) => !actual.has(path));
  const unexpected = [...actual].filter((path) => !expected.has(path));
  // Node 原生 glob 未匹配时可能成功退出，必须在启动前验证完整集合，不能静默少跑。
  if (missing.length || unexpected.length) {
    throw new Error(
      `Offline studio test selection differs: missing=${JSON.stringify(missing)}, unexpected=${JSON.stringify(unexpected)}`,
    );
  }
  return argumentsList;
}
