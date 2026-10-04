import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const variants = [
  { os: "win", platform: "win-x64", variant: "installed", portable: "0", runner: "windows-latest" },
  { os: "win", platform: "win-x64", variant: "portable", portable: "1", runner: "windows-latest" },
  {
    os: "linux",
    platform: "linux-x64",
    variant: "installed",
    portable: "0",
    runner: "ubuntu-latest",
  },
  {
    os: "linux",
    platform: "linux-x64",
    variant: "portable",
    portable: "1",
    runner: "ubuntu-latest",
  },
];

export function selectReleaseVariants(
  selection = "all",
  dryRun = false,
  reuseRun = "",
  trace = false,
) {
  if (!["all", "win-installed", "linux-portable", "remaining"].includes(selection))
    throw new Error("Unsupported diagnostic variant");
  const diagnostic = selection !== "all";
  if (trace && !diagnostic) throw new Error("Tracing requires diagnostic mode");
  if (reuseRun && (!diagnostic || !/^[1-9][0-9]*$/.test(reuseRun)))
    throw new Error("Reused payloads require a diagnostic run ID");
  // 定向诊断不运行完整发行门禁，因此必须禁止发布，不能把跳过写成通过。
  if (diagnostic && dryRun !== true) throw new Error("Diagnostic variants require dry_run=true");
  const selected = variants.filter(
    (item) =>
      !diagnostic ||
      `${item.os}-${item.variant}` === selection ||
      (selection === "remaining" &&
        ["win-installed", "linux-portable"].includes(`${item.os}-${item.variant}`)),
  );
  return { diagnostic, matrix: { include: selected } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = selectReleaseVariants(
    process.env.DIAGNOSTIC_VARIANT || "all",
    process.env.DRY_RUN === "true",
    process.env.DIAGNOSTIC_REUSE_RUN || "",
    process.env.DIAGNOSTIC_TRACE === "true",
  );
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `diagnostic=${result.diagnostic}\nmatrix=${JSON.stringify(result.matrix)}\n`,
  );
}
