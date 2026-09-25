import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

/**
 * 便携升级保护验收（见 specs/knorvia-upgrade-protection.md）：
 * 覆盖程序文件绝不能替换 data；用哈希清单证明 data 逐字节不变。
 * 这里用 Node 复刻 scripts/deliver-portable.ps1:57-68 的交付规则，
 * 不依赖 PowerShell；PowerShell 可用时另外在模拟目录上端到端跑真实脚本。
 */

interface ManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

interface PortableFixture {
  build: string;
  portable: string;
}

function workDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeFile(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** 与交付脚本一致：只按顶层 `data` 目录排除，大小写不敏感。 */
function isDataPath(root: string, fullPath: string): boolean {
  const first = relative(root, fullPath).split(sep)[0] ?? "";
  return first.toLowerCase() === "data";
}

function manifest(root: string, options: { excludeData?: boolean } = {}): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (options.excludeData && isDataPath(root, full)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (options.excludeData && isDataPath(root, full)) continue;
      entries.push({
        path: relative(root, full).split(sep).join("/"),
        bytes: statSync(full).size,
        sha256: createHash("sha256").update(readFileSync(full)).digest("hex"),
      });
    }
  };
  walk(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function directories(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(directory, entry.name);
      found.push(relative(root, full).split(sep).join("/"));
      walk(full);
    }
  };
  walk(root);
  return found.sort();
}

/** 复制源目录全部程序文件到目标根，语义等价于 robocopy /E /XD <source>\data <target>\data。 */
function deliverProgramFiles(source: string, target: string): number {
  let copied = 0;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (isDataPath(source, full)) continue;
      const destination = join(target, relative(source, full));
      if (entry.isDirectory()) {
        mkdirSync(destination, { recursive: true });
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(full, destination);
      copied++;
    }
  };
  walk(source);
  return copied;
}

function buildPortableFixture(t: TestContext, prefix: string): PortableFixture {
  const directory = workDirectory(t, prefix);
  const build = join(directory, "build");
  const portable = join(directory, "portable");
  const marker = JSON.stringify({ product: "Knorvia Studio", dataDirectory: "data" });

  // 新构建：程序文件是新字节，自带一份构建期 data，交付时不得扩散。
  writeFile(join(build, "Knorvia Studio.exe"), "EXE-v2-release-build");
  writeFile(join(build, "resources", "app.asar"), "ASAR-v2-release-build");
  writeFile(join(build, "resources", "knorvia-portable.json"), marker);
  writeFile(join(build, "locales", "zh-CN.pak"), "LOCALE-v2-zh");
  writeFile(join(build, "locales", "en-US.pak"), "LOCALE-v2-en");
  writeFile(join(build, "data", "studio", "studio.sqlite"), "BUILD-TIME-EMPTY-DB");
  writeFile(join(build, "data", "build-only.json"), '{"buildOnly":true}');

  // 已安装的便携目录：程序文件是旧字节，data 是真实用户数据。
  writeFile(join(portable, "Knorvia Studio.exe"), "EXE-v1-installed");
  writeFile(join(portable, "resources", "app.asar"), "ASAR-v1-installed");
  writeFile(join(portable, "resources", "knorvia-portable.json"), marker);
  writeFile(join(portable, "locales", "zh-CN.pak"), "LOCALE-v1-zh");
  writeFile(join(portable, "data", "studio", "studio.sqlite"), "USER-DATA-v1");
  writeFile(
    join(portable, "data", "studio", "studio.sqlite.pre-v1.20260102T030405678Z.bak"),
    "USER-BACKUP",
  );
  writeFile(join(portable, "data", ".knorvia-studio", "v2", "setting.json"), '{"theme":"light"}');
  writeFile(join(portable, "data", ".knorvia-studio", "v2", "target-only.json"), '{"kept":true}');
  writeFile(join(portable, "data", "workspace", "demo", "note.txt"), "示例工作区文件");
  mkdirSync(join(portable, "data", "workspace", "empty"), { recursive: true });
  return { build, portable };
}

test("覆盖程序文件不会替换 data：逐文件 SHA-256 与目录内容前后完全一致", (t) => {
  const { build, portable } = buildPortableFixture(t, "knorvia-portable-upgrade-");
  const dataBefore = manifest(join(portable, "data"));
  const directoriesBefore = directories(join(portable, "data"));
  const programBefore = manifest(build, { excludeData: true });

  const copied = deliverProgramFiles(build, portable);
  assert.ok(copied >= programBefore.length, "程序文件应被覆盖");
  // 交付清单：新构建的每个程序文件都必须按内容落在目标端。
  const delivered = manifest(portable, { excludeData: true });
  for (const entry of programBefore) {
    assert.deepEqual(
      delivered.find((candidate) => candidate.path === entry.path),
      entry,
      entry.path,
    );
  }
  assert.equal(
    createHash("sha256")
      .update(readFileSync(join(portable, "Knorvia Studio.exe")))
      .digest("hex"),
    createHash("sha256")
      .update(readFileSync(join(build, "Knorvia Studio.exe")))
      .digest("hex"),
  );

  // data 逐文件哈希、字节数与目录结构都不变；目标端多余的数据文件不被删除。
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
  assert.deepEqual(directories(join(portable, "data")), directoriesBefore);
  assert.equal(
    readFileSync(join(portable, "data", ".knorvia-studio", "v2", "target-only.json"), "utf8"),
    '{"kept":true}',
  );
  assert.equal(
    readFileSync(join(portable, "data", "studio", "studio.sqlite"), "utf8"),
    "USER-DATA-v1",
  );
  // 构建期自带的 data 不扩散到用户数据目录。
  assert.deepEqual(
    dataBefore.map((entry) => entry.path).filter((path) => path.includes("build-only")),
    [],
  );
  assert.equal(
    readFileSync(join(portable, "data", "studio", "studio.sqlite"), "utf8").startsWith(
      "BUILD-TIME",
    ),
    false,
  );
});

test("反例对照：连源 data 一起复制时，清单比对必须检出差异", (t) => {
  const { build, portable } = buildPortableFixture(t, "knorvia-portable-negative-");
  const dataBefore = manifest(join(portable, "data"));

  // 故意破坏规则：不加排除地整目录复制（等价于漏掉 /XD data 的交付）。
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const destination = join(portable, relative(build, full));
      if (entry.isDirectory()) {
        mkdirSync(destination, { recursive: true });
        walk(full);
        continue;
      }
      if (entry.isFile()) {
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(full, destination);
      }
    }
  };
  walk(build);

  const dataAfter = manifest(join(portable, "data"));
  assert.notDeepEqual(dataAfter, dataBefore);
  assert.ok(
    dataAfter.some((entry) => entry.path === "build-only.json"),
    "反例必须把构建期 data 写进用户数据目录，否则该断言是空断言",
  );
});

test("真实交付脚本在模拟目录上端到端验证 data 不变（PowerShell 可用时）", (t) => {
  const script = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "scripts",
    "deliver-portable.ps1",
  );
  const shell = ["pwsh", "powershell"].find(
    (candidate) =>
      spawnSync(candidate, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" }).status === 0,
  );
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }

  const { build, portable } = buildPortableFixture(t, "knorvia-portable-script-");
  const dataBefore = manifest(join(portable, "data"));
  const result = spawnSync(
    shell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Source",
      build,
      "-Target",
      portable,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
  const verification = JSON.parse(readFileSync(join(portable, "构建校验.json"), "utf8")) as {
    dataUnchanged: boolean;
    dataFiles: number;
  };
  assert.equal(verification.dataUnchanged, true);
  assert.equal(verification.dataFiles, dataBefore.length);
});
