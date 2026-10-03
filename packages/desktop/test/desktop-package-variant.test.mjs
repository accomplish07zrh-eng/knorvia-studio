import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertDesktopPackageTargets,
  DESKTOP_PORTABLE_MARKER,
  resolveDesktopPackageVariant,
  stageDesktopPackageVariant,
} from "../scripts/desktop-package-variant.mjs";

test("installed defaults retain all four Linux targets and only NSIS on Windows", () => {
  for (const value of [undefined, "", "0"]) {
    const variant = resolveDesktopPackageVariant({ KNORVIA_PORTABLE_BUILD: value }, "linux");
    assert.equal(variant.portable, false);
    assert.deepEqual(variant.windowsTargets, ["nsis"]);
    assert.deepEqual(variant.linuxTargets, ["AppImage", "deb", "rpm", "pacman"]);
    assert.doesNotThrow(() =>
      assertDesktopPackageTargets({
        portable: false,
        platform: "linux",
        targets: variant.linuxTargets,
      }),
    );
  }
});

test("portable mode has launchable/archive targets and rejects ambiguous mode values", () => {
  const variant = resolveDesktopPackageVariant({ KNORVIA_PORTABLE_BUILD: "1" }, "win32");
  assert.deepEqual(variant.windowsTargets, ["portable", "zip"]);
  assert.deepEqual(variant.linuxTargets, ["AppImage", "tar.gz"]);
  for (const value of ["true", "false", "2", "installed", "portable"]) {
    assert.throws(
      () => resolveDesktopPackageVariant({ KNORVIA_PORTABLE_BUILD: value }, "linux"),
      /KNORVIA_PORTABLE_BUILD/,
    );
  }
  assert.throws(
    () => resolveDesktopPackageVariant({ KNORVIA_PORTABLE_BUILD: "1" }, "darwin"),
    /not configured/,
  );
});

test("portable trees cannot be consumed by Windows/Linux installer targets", () => {
  for (const [platform, targets] of [
    ["win32", ["portable", "nsis"]],
    ["win32", ["msi"]],
    ["linux", ["appImage", "deb"]],
    ["linux", ["rpm", "pacman"]],
  ]) {
    assert.throws(
      () => assertDesktopPackageTargets({ portable: true, platform, targets }),
      /installer targets/,
    );
  }
  assert.throws(
    () =>
      assertDesktopPackageTargets({ portable: false, platform: "win32", targets: ["portable"] }),
    /requires KNORVIA_PORTABLE_BUILD=1/,
  );
  assert.doesNotThrow(() =>
    assertDesktopPackageTargets({
      portable: true,
      platform: "linux",
      targets: ["appImage", "tar.gz"],
    }),
  );
  assert.doesNotThrow(() =>
    assertDesktopPackageTargets({
      portable: true,
      platform: "win32",
      targets: ["portable", "zip"],
    }),
  );
});

test("reusing an output tree toggles only the marker and preserves program/data bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-package-variant-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = join(root, "resources");
  const data = join(root, "data");
  await mkdir(resources);
  await mkdir(data);
  const program = Buffer.from("unchanged application payload");
  const userData = Buffer.from("existing portable profile, never a build input");
  await writeFile(join(resources, "app.asar"), program);
  await writeFile(join(data, "sentinel.sqlite"), userData);

  await stageDesktopPackageVariant(resources, { portable: true });
  assert.deepEqual(JSON.parse(await readFile(join(resources, DESKTOP_PORTABLE_MARKER), "utf8")), {
    product: "Knorvia Studio",
    version: 1,
    dataDirectory: "data",
  });
  await stageDesktopPackageVariant(resources, { portable: false });
  await stageDesktopPackageVariant(resources, { portable: false });
  assert.deepEqual(await readdir(resources), ["app.asar"]);
  assert.deepEqual(await readFile(join(resources, "app.asar")), program);
  assert.deepEqual(await readFile(join(data, "sentinel.sqlite")), userData);
});
