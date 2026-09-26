import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
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

/** 取路径的 8.3 短名；该卷未启用 8.3 时返回原路径。 */
function shortPath(path: string): string {
  // 用 windowsVerbatimArguments 让 cmd 原样收到命令，避免 Node 的引号转义把 for 变量弄坏。
  const result = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${path}") do @echo %~sI`], {
    encoding: "utf8",
    windowsVerbatimArguments: true,
  });
  const raw = (result.stdout ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  const value = raw.replace(/^"+|"+$/g, "").replace(/[\\/]+$/, "");
  return value || path;
}

/** 找到可用的 PowerShell（优先 pwsh）。 */
function findShell(): string | undefined {
  return ["pwsh", "powershell"].find(
    (candidate) =>
      spawnSync(candidate, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" }).status === 0,
  );
}

function deliverScriptPath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "scripts",
    "deliver-portable.ps1",
  );
}

function runDeliverScript(
  shell: string,
  source: string,
  target: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    shell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      deliverScriptPath(),
      "-Source",
      source,
      "-Target",
      target,
    ],
    { encoding: "utf8" },
  );
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
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
  const shell = findShell();
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }

  const { build, portable } = buildPortableFixture(t, "knorvia-portable-script-");
  const dataBefore = manifest(join(portable, "data"));
  const result = runDeliverScript(shell, build, portable);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
  const verification = JSON.parse(readFileSync(join(portable, "构建校验.json"), "utf8")) as {
    dataUnchanged: boolean;
    dataFiles: number;
  };
  assert.equal(verification.dataUnchanged, true);
  assert.equal(verification.dataFiles, dataBefore.length);
});

// Windows CI 上 %TEMP% 常是 8.3 短名（如 C:\Users\RUNNER~1\...）：Resolve-Path 保留短名，
// 而 Get-ChildItem 返回长名，两者长度不同。旧实现用 `FullName.Substring($root.Length + 1)`
// 算相对路径，会算出 `ld\Knorvia Studio.exe` 这类被截断的名字并误报“程序文件与构建不一致”。
// 这里用短名作为 Source 复现同一条件。
test("真实交付脚本在 8.3 短名 Source 上也能正确交付", (t) => {
  const shell = findShell();
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }
  const { build, portable } = buildPortableFixture(t, "knorvia-portable-shortname-");
  const shortBuild = shortPath(build);
  if (shortBuild === build) {
    t.skip("该卷未启用 8.3 短名，无法复现长短名混用");
    return;
  }
  assert.notEqual(shortBuild.length, build.length, "短名应与长名长度不同，否则该用例是空断言");

  const dataBefore = manifest(join(portable, "data"));
  const result = runDeliverScript(shell, shortBuild, portable);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
  assert.equal(
    readFileSync(join(portable, "Knorvia Studio.exe"), "utf8"),
    readFileSync(join(build, "Knorvia Studio.exe"), "utf8"),
  );
});

test("Source 末尾带分隔符时仍能正确交付", (t) => {
  const shell = findShell();
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }
  const { build, portable } = buildPortableFixture(t, "knorvia-portable-separator-");
  const dataBefore = manifest(join(portable, "data"));
  const result = runDeliverScript(shell, `${build}${sep}`, portable);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
});

test("路径含空格与中文时仍能正确交付", (t) => {
  const shell = findShell();
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }
  const { build, portable } = buildPortableFixture(t, "knorvia 便携 升级-");
  assert.ok(build.includes(" "), "夹具路径应包含空格");
  const dataBefore = manifest(join(portable, "data"));
  const result = runDeliverScript(shell, build, portable);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(manifest(join(portable, "data")), dataBefore);
  const verification = JSON.parse(readFileSync(join(portable, "构建校验.json"), "utf8")) as {
    dataUnchanged: boolean;
  };
  assert.equal(verification.dataUnchanged, true);
});

// 反例对照：确实篡改过的程序文件必须让交付失败，并且诊断要给出双方路径与相对路径。
test("程序文件确实被篡改时交付必须失败并给出可定位诊断", (t) => {
  const shell = findShell();
  if (process.platform !== "win32" || !shell) {
    t.skip("需要 Windows 与 PowerShell 才能运行真实交付脚本");
    return;
  }
  const { build, portable } = buildPortableFixture(t, "knorvia-portable-tamper-");
  const first = runDeliverScript(shell, build, portable);
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);

  // robocopy 默认会修复内容不同的目标文件，所以“篡改”必须在复制阶段被跳过才到得了哈希校验。
  // 同长度 + 与源相同的时间戳正好满足 robocopy 的“无需复制”判断，从而把内容差异留给校验环节。
  const sourceAsar = join(build, "resources", "app.asar");
  const targetAsar = join(portable, "resources", "app.asar");
  const original = readFileSync(targetAsar, "utf8");
  writeFileSync(targetAsar, `${original.slice(0, -1)}X`);
  // 两个文件必须设成同一个显式时间戳：只把目标的 mtime 抄成源的毫秒值会因亚毫秒精度差被判为不同。
  const stamp = new Date(2026, 0, 1, 0, 0, 0);
  utimesSync(sourceAsar, stamp, stamp);
  utimesSync(targetAsar, stamp, stamp);
  assert.equal(statSync(sourceAsar).size, statSync(targetAsar).size, "反例必须保持同长度");

  const second = runDeliverScript(shell, build, portable);
  assert.notEqual(second.status, 0, "被篡改且复制阶段跳过时，交付必须失败");
  const output = `${second.stdout}\n${second.stderr}`;
  assert.match(output, /differs from build/u);
  assert.match(output, /resources[\\/]app\.asar/u);
  assert.match(output, /source root/u);
  assert.match(output, /target root/u);
  assert.match(output, /[0-9A-F]{64}/u, "诊断应给出实际哈希");
});
