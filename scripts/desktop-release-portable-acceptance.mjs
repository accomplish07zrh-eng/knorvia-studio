import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { artifactIdentity } from "./desktop-release-manifest.mjs";
import { probePackagedRuntime } from "./desktop-release-runtime-probe.mjs";
import { probePortableLaunch } from "./desktop-release-portable-launch.mjs";

const exec = promisify(execFile);
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";

async function archiveRoot(root, executable) {
  const candidates = [
    root,
    ...(await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name)),
  ];
  const found = [];
  for (const candidate of candidates) {
    try {
      if (
        (await stat(join(candidate, executable))).isFile() &&
        (await stat(join(candidate, "resources/app.asar"))).isFile()
      )
        found.push(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  assert.equal(
    found.length,
    1,
    "Portable archive must contain exactly one complete application root",
  );
  return found[0];
}

export async function acceptPortableVariant({
  repository,
  dist,
  output,
  deliveredSha,
  version,
  platform,
  fixture,
  diagnosticOutput,
}) {
  const report = {
    status: "running",
    deliveredSha,
    version,
    platform,
    checks: [],
    limits: [
      "No human visual installer or model-task acceptance",
      "No macOS portable package",
      "Portable fixture persistence does not establish full legacy migration",
    ],
  };
  const launcherDirectory = join(fixture, "original portable launcher with spaces");
  await mkdir(launcherDirectory);
  const artifacts = [];
  const names = await readdir(dist);
  const suffixes =
    platform === "win-x64" ? ["-portable.exe"] : ["-portable.AppImage", "-portable.tar.gz"];
  for (const suffix of suffixes) {
    const selected = names.filter((name) => name.endsWith(suffix) && name.includes(version));
    assert.equal(selected.length, 1, `Exactly one fresh portable artifact is required: ${suffix}`);
    const name = `Knorvia-Studio-${version}-${platform}${suffix}`;
    await copyFile(join(dist, selected[0]), join(output, name), constants.COPYFILE_EXCL);
    artifacts.push(await artifactIdentity(join(output, name)));
  }
  const wrapperAsset = artifacts[0];
  const wrapper = join(launcherDirectory, wrapperAsset.name);
  await copyFile(join(output, wrapperAsset.name), wrapper, constants.COPYFILE_EXCL);
  if (platform === "linux-x64") await chmod(wrapper, 0o755);
  const captured = join(fixture, "captured-portable-application");
  report.wrapper = await probePortableLaunch({
    executable: wrapper,
    expectedBase: join(launcherDirectory, "data"),
    fixture,
    version,
    captureDirectory: captured,
    diagnosticOutput,
  });
  const marker = JSON.parse(
    await readFile(join(captured, "resources/knorvia-portable.json"), "utf8"),
  );
  assert.deepEqual(marker, { product: "Knorvia Studio", version: 1, dataDirectory: "data" });
  report.runtime = await probePackagedRuntime({
    repository,
    suppliedExecutable: join(
      captured,
      platform === "win-x64" ? "Knorvia Studio.exe" : "knorvia-studio",
    ),
    fixtureParent: fixture,
    deliveredSha,
    expectedPortable: true,
  });
  report.checks.push(
    ...report.wrapper.checks,
    ...report.runtime.checks,
    "Portable marker is present in the actual captured application",
  );
  if (platform === "linux-x64") {
    const archive = artifacts[1];
    const extracted = join(fixture, "portable archive extracted");
    await mkdir(extracted);
    await exec(
      "tar",
      [
        "--extract",
        "--file",
        join(output, archive.name),
        "--directory",
        extracted,
        "--no-same-owner",
      ],
      { timeout: 180000 },
    );
    const root = await archiveRoot(extracted, "knorvia-studio");
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "resources/knorvia-portable.json"), "utf8")),
      marker,
    );
    await assert.rejects(stat(join(root, "data")), { code: "ENOENT" });
    const actual = await artifactIdentity(join(root, "resources/app.asar"));
    assert.equal(
      actual.sha256,
      report.runtime.package.appAsar.sha256,
      "Portable tar and AppImage must carry the same actual ASAR payload",
    );
    report.archive = await probePortableLaunch({
      executable: join(root, "knorvia-studio"),
      diagnosticOutput,
      expectedBase: join(root, "data"),
      fixture,
      version,
    });
    report.checks.push(
      ...report.archive.checks,
      "Actual portable tar.gz extracts with the same ASAR and its own marker, without preexisting data",
    );
    report.limits.push(
      "Linux startup uses private Xvfb and --no-sandbox/--disable-gpu in the acceptance process only",
      "AppImage launcher uses documented extract-and-run; FUSE mounting is not accepted by this probe",
      "Linux portable packages are not signed",
    );
  } else {
    const result = await exec("pwsh", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$s=Get-AuthenticodeSignature -LiteralPath ${psQuote(join(output, wrapperAsset.name))}; [ordered]@{status=[string]$s.Status;signer=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null}} | ConvertTo-Json -Compress`,
    ]);
    report.signature = JSON.parse(result.stdout);
    assert.notEqual(
      report.signature.status,
      "HashMismatch",
      "Actual portable signature reports changed signed bytes",
    );
    report.checks.push("Actual portable EXE Authenticode status recorded");
  }
  report.status = "passed";
  return { report, artifacts };
}
