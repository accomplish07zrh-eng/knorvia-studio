// Hosted-runner package acceptance; never targets an existing user installation or profile.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { artifactIdentity, validatePlatformManifest } from "./desktop-release-manifest.mjs";
import { probePackagedRuntime } from "./desktop-release-runtime-probe.mjs";
import { acceptPortableVariant } from "./desktop-release-portable-acceptance.mjs";
import { probePortableLaunch } from "./desktop-release-portable-launch.mjs";
import { acceptOwnedCleanup } from "./desktop-release-nsis-acceptance.mjs";

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [outputArg, deliveredSha, variant = "installed"] = process.argv.slice(2);
assert.ok(["installed", "portable"].includes(variant));
const output = resolve(outputArg);
const dist = join(repository, "packages/desktop/dist");
const { version } = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
assert.match(deliveredSha, /^[a-f0-9]{40}$/);
const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
assert.equal(head, deliveredSha);
assert.equal(process.arch, "x64");
assert.ok(["linux", "win32"].includes(process.platform));
const platform = process.platform === "win32" ? "win-x64" : "linux-x64";
const fixture = await mkdtemp(
  join(process.env.RUNNER_TEMP || tmpdir(), "knorvia-release-acceptance-"),
);
const report = {
  status: "running",
  deliveredSha,
  version,
  platform,
  variant,
  checks: [],
  limits: [
    "No human installer GUI acceptance",
    "No real model-task or full legacy-user migration acceptance",
    "No signing credentials created",
  ],
};
await mkdir(output, { recursive: true });
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
const ps = (script, env) =>
  exec(
    "pwsh",
    ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; " + script],
    { env, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
  );
const runtime = (executable, profileBase, expectedPortable = false) =>
  probePackagedRuntime({
    repository,
    suppliedExecutable: executable,
    fixtureParent: fixture,
    deliveredSha,
    profileBase,
    expectedPortable,
  });
let artifacts = [];
let ownedDefaultProfile;

try {
  if (variant === "portable") {
    const accepted = await acceptPortableVariant({
      repository,
      dist,
      output,
      deliveredSha,
      version,
      platform,
      fixture,
    });
    artifacts = accepted.artifacts;
    report.portableVariant = accepted.report;
    report.checks.push(...accepted.report.checks);
    report.limits.push(...accepted.report.limits);
  } else if (platform === "linux-x64") {
    const metadataRoot = join(fixture, "extractions");
    let result;
    try {
      result = await exec(
        "python3",
        [
          join(import.meta.dirname, "desktop-release-linux-metadata.py"),
          repository,
          dist,
          metadataRoot,
          deliveredSha,
        ],
        { timeout: 780000, maxBuffer: 8 * 1024 * 1024 },
      );
    } catch (error) {
      // Python 失败仍会写原始命令/格式记录；在清理临时目录前收入失败报告。
      try {
        report.metadata = JSON.parse(
          await readFile(join(metadataRoot, "linux-metadata.json"), "utf8"),
        );
      } catch (receiptError) {
        report.metadataReceiptError = receiptError.stack || String(receiptError);
      }
      throw error;
    }
    report.metadataSummary = JSON.parse(result.stdout);
    report.metadata = JSON.parse(await readFile(join(metadataRoot, "linux-metadata.json"), "utf8"));
    assert.equal(report.metadata.status, "passed");
    for (const [target, accepted] of Object.entries(report.metadata.targets)) {
      const suffix = target === "pacman" ? "pkg.tar.zst" : target;
      const name = `Knorvia-Studio-${version}-linux-x64.${suffix}`;
      await copyFile(accepted.artifact.path, join(output, name), constants.COPYFILE_EXCL);
      const identity = await artifactIdentity(join(output, name));
      assert.equal(identity.sha256, accepted.artifact.sha256);
      assert.equal(identity.bytes, accepted.artifact.bytes);
      artifacts.push(identity);
    }
    report.runtime = await runtime(
      join(report.metadata.targets.deb.applicationRoot, "knorvia-studio"),
    );
    report.checks.push(...report.metadata.checks, ...report.runtime.checks);
    report.limits.push(
      "No distro package-manager installation acceptance; runtime exercised in actual extracted deb with byte-identical payload across all four targets",
      "Linux packages are not signed",
    );
  } else {
    report.ownershipCleanup = await acceptOwnedCleanup(repository);
    report.checks.push(
      "Pinned native makensis compiles and executes all four ordinary/update ownership fixtures without dropping their assertions",
    );
    const setupName = `Knorvia-Studio-${version}-win-x64-setup.exe`;
    const portableName = `Knorvia-Studio-${version}-win-x64-portable.zip`;
    artifacts = await Promise.all(
      [setupName, portableName].map((name) => artifactIdentity(join(output, name))),
    );
    const portable = join(fixture, "portable extracted");
    await ps(
      `Expand-Archive -LiteralPath ${psQuote(join(output, portableName))} -DestinationPath ${psQuote(portable)}`,
    );
    const portableRoot = join(portable, "Knorvia Studio Portable");
    const marker = JSON.parse(
      await readFile(join(portableRoot, "resources/knorvia-portable.json"), "utf8"),
    );
    assert.deepEqual(marker, { product: "Knorvia Studio", version: 1, dataDirectory: "data" });
    await assert.rejects(stat(join(portableRoot, "data")), { code: "ENOENT" });
    report.portable = await runtime(
      join(portableRoot, "Knorvia Studio.exe"),
      join(portableRoot, "data"),
      true,
    );
    report.portableLaunch = await probePortableLaunch({
      executable: join(portableRoot, "Knorvia Studio.exe"),
      expectedBase: join(portableRoot, "data"),
      fixture,
      version,
    });
    report.checks.push(
      "Actual ZIP extracts outside repository, includes the canonical portable marker and no preexisting user data",
      ...report.portable.checks,
      ...report.portableLaunch.checks,
    );

    const installed = join(fixture, "installation with spaces");
    const appdata = join(fixture, "appdata");
    const localappdata = join(fixture, "localappdata");
    await mkdir(appdata);
    await mkdir(localappdata);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(?:PATH|PATHEXT|SystemRoot|WINDIR|ComSpec|USERNAME|USERPROFILE|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(
          key,
        ),
      ),
    );
    Object.assign(env, {
      APPDATA: appdata,
      LOCALAPPDATA: localappdata,
      TEMP: fixture,
      TMP: fixture,
    });
    const setup = join(output, setupName);
    // NSIS resolves its default data directory through Windows shell APIs. A changed
    // APPDATA environment alone cannot prove its ordinary-uninstall behavior.
    // Only create this fixture on a fresh hosted account; refuse any existing data.
    assert.ok(process.env.APPDATA);
    const defaultProfileCandidate = join(process.env.APPDATA, "Knorvia Studio");
    await mkdir(defaultProfileCandidate);
    ownedDefaultProfile = defaultProfileCandidate;
    const install = async () => {
      const result = await ps(
        `$p=Start-Process -FilePath ${psQuote(setup)} -ArgumentList @('/S',${psQuote("/D=" + installed)}) -PassThru -Wait; if ($p.ExitCode -ne 0) { throw "Installer exit $($p.ExitCode)" }; Write-Output $p.ExitCode`,
        env,
      );
      assert.equal(result.stdout.trim(), "0");
      const exe = join(installed, "Knorvia Studio.exe");
      assert.ok((await stat(exe)).isFile());
      await assert.rejects(stat(join(installed, "resources/knorvia-portable.json")), {
        code: "ENOENT",
      });
      return exe;
    };
    const exe = await install();
    const profile = join(appdata, "Knorvia Studio");
    report.installed = await runtime(exe, profile);
    const sentinel = join(profile, "release-upgrade-sentinel.txt");
    const sentinelBytes = Buffer.from("isolated hosted runner data preserved\n");
    await writeFile(sentinel, sentinelBytes);
    const unownedFile = join(installed, "release-user-file.txt");
    await writeFile(unownedFile, sentinelBytes);
    const defaultSentinel = join(ownedDefaultProfile, "release-uninstall-sentinel.txt");
    const defaultDatabase = join(ownedDefaultProfile, "release-uninstall-sentinel.sqlite");
    await writeFile(defaultSentinel, sentinelBytes);
    await copyFile(
      report.installed.storageFirst.databasePath,
      defaultDatabase,
      constants.COPYFILE_EXCL,
    );
    const databaseBefore = await artifactIdentity(defaultDatabase);
    await install();
    assert.deepEqual(await readFile(sentinel), sentinelBytes);
    assert.deepEqual(await readFile(unownedFile), sentinelBytes);
    assert.deepEqual(await readFile(defaultSentinel), sentinelBytes);
    assert.equal((await artifactIdentity(defaultDatabase)).sha256, databaseBefore.sha256);
    const verify = await exec(
      exe,
      [
        join(import.meta.dirname, "desktop-release-native-child.cjs"),
        installed,
        fixture,
        report.installed.storageFirst.databasePath,
        "check",
      ],
      {
        env: { ...env, ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "", NODE_PATH: "" },
        timeout: 20000,
      },
    );
    report.afterReinstall = JSON.parse(verify.stdout);
    const uninstallers = (await readdir(installed)).filter((name) =>
      /^uninstall.*\.exe$/i.test(name),
    );
    assert.equal(uninstallers.length, 1);
    const uninstall = await ps(
      `$p=Start-Process -FilePath ${psQuote(join(installed, uninstallers[0]))} -ArgumentList @('/S',${psQuote("_?=" + installed)}) -PassThru -Wait; if ($p.ExitCode -ne 0) { throw "Uninstaller exit $($p.ExitCode)" }; Write-Output $p.ExitCode`,
      env,
    );
    assert.equal(uninstall.stdout.trim(), "0");
    assert.deepEqual(await readFile(sentinel), sentinelBytes);
    assert.ok((await stat(report.installed.storageFirst.databasePath)).isFile());
    assert.deepEqual(await readFile(defaultSentinel), sentinelBytes);
    assert.equal((await artifactIdentity(defaultDatabase)).sha256, databaseBefore.sha256);
    await assert.rejects(stat(exe), { code: "ENOENT" });
    assert.deepEqual(await readFile(unownedFile), sentinelBytes);
    report.signature = JSON.parse(
      (
        await ps(
          `$s=Get-AuthenticodeSignature -LiteralPath ${psQuote(setup)}; [ordered]@{status=[string]$s.Status; signer=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null}} | ConvertTo-Json -Compress`,
        )
      ).stdout,
    );
    assert.notEqual(
      report.signature.status,
      "HashMismatch",
      "Actual setup signature reports changed signed bytes",
    );
    report.checks.push(
      ...report.installed.checks,
      "Actual silent setup and reinstall exit zero with SQLite and profile sentinel preserved",
      "Actual ordinary silent uninstall exits zero, removes the application and preserves synthetic profile/database",
      "Actual installer Authenticode status recorded",
    );
  }
  report.status = "passed";
  const manifest = {
    schemaVersion: 1,
    platform,
    variant,
    deliveredSha,
    version,
    artifacts,
    acceptance: report,
  };
  validatePlatformManifest(manifest, deliveredSha, version);
  await writeFile(
    join(output, `${platform}-${variant}-manifest.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} catch (error) {
  report.status = "failed";
  report.error = error.stack || String(error);
  if (error.report) report.runtimeFailure = error.report;
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, `${platform}-${variant}-acceptance.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  await rm(fixture, { recursive: true, force: true });
  if (ownedDefaultProfile) await rm(ownedDefaultProfile, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      status: report.status,
      platform,
      deliveredSha,
      checks: report.checks,
      error: report.error,
    }),
  );
}
