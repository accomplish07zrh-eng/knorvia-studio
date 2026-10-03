import assert from "node:assert/strict";
import test from "node:test";
import {
  patchNsisInstallSectionSource,
  PATCH_MARKER,
} from "../scripts/patch-nsis-install-section.mjs";

// 只冻结模板锚点契约；不模拟 Windows Shell/UAC，不声称这些断言能验收实际安装器。
const stockAnchors = [
  "${IfNot} ${Silent}\n  SetDetailsPrint none\n${endif}",
  "!insertmacro uninstallOldVersion SHELL_CONTEXT\n!insertmacro handleUninstallResult SHELL_CONTEXT",
  '${if} $installMode == "all"\n  !insertmacro uninstallOldVersion HKEY_CURRENT_USER\n  !insertmacro handleUninstallResult HKEY_CURRENT_USER\n${endIf}',
  "!insertmacro installApplicationFiles",
  "!insertmacro addStartMenuLink $keepShortcuts\n!insertmacro addDesktopLink $keepShortcuts",
];

test("new shortcut hook keeps original macros as fallback inside unchanged stage order", () => {
  const source = stockAnchors.join("\n");
  const patched = patchNsisInstallSectionSource(source);
  assert.match(
    patched,
    /!ifmacrodef customInstallShortcuts\n  !insertmacro customInstallShortcuts\n!else\n!insertmacro addStartMenuLink \$keepShortcuts\n!insertmacro addDesktopLink \$keepShortcuts\n!endif/,
  );
  const stages = [
    "!insertmacro customInstallCleanupStarted",
    "!insertmacro customInstallCleanupCompleted",
    "!insertmacro customInstallExtractStarted",
    "!insertmacro customInstallExtractCompleted",
    "!insertmacro customInstallShortcutsStarted",
    "!insertmacro customInstallShortcuts",
    "!insertmacro customInstallShortcutsCompleted",
  ].map((stage) => patched.indexOf(`${stage}\n`));
  assert.ok(stages.every((position) => position >= 0));
  assert.ok(stages.every((position, index) => index === 0 || position > stages[index - 1]));
  assert.equal(patchNsisInstallSectionSource(patched), patched);
});

test("missing stock anchors and interrupted v1 patches fail instead of silently dropping choices", () => {
  for (const missing of stockAnchors) {
    const source = stockAnchors.filter((anchor) => anchor !== missing).join("\n");
    assert.throws(() => patchNsisInstallSectionSource(source), /缺少预期锚点/);
  }
  const oldPatched = patchNsisInstallSectionSource(stockAnchors.join("\n")).replace(
    PATCH_MARKER,
    "; knorvia-installer-details-v1",
  );
  assert.throws(() => patchNsisInstallSectionSource(oldPatched), /残留/);
});

test("CRLF templates keep their line endings through new hook insertion", () => {
  const patched = patchNsisInstallSectionSource(stockAnchors.join("\n").replaceAll("\n", "\r\n"));
  assert.match(patched, /customInstallShortcuts\r\n/);
  assert.equal(patched.replaceAll("\r\n", "").includes("\n"), false);
});
