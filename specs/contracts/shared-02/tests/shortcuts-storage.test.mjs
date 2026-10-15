// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：快捷键、存储与媒体常量（B16、B17、B22、B23）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { barrel } from "./entry.mjs";

const {
  MEDIA_PREVIEW_FORMATS,
  getMediaPreviewFormat,
  STORAGE_CATEGORY_IDS,
  STORAGE_MORE_ENTRIES_PATH,
  groupStorageRootsByVolume,
  SHORTCUT_COMMANDS,
  getDefaultShortcutBindings,
  normalizeShortcutKey,
  parseShortcutBinding,
  serializeShortcutBinding,
  isValidShortcutBinding,
} = barrel;

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const constantsSnapshot = JSON.parse(readFileSync(`${fixturesDir}constants-snapshot.json`, "utf8"));

test("B16 媒体预览格式表 11 项与查找语义", () => {
  assert.deepEqual(MEDIA_PREVIEW_FORMATS, constantsSnapshot.MEDIA_PREVIEW_FORMATS);
  assert.equal(getMediaPreviewFormat("/tmp/a/b.MP4").kind, "video");
  assert.equal(getMediaPreviewFormat("C:\\media\\song.FLAC").kind, "audio");
  assert.equal(getMediaPreviewFormat("C:\\media\\song.FLAC").mediaType, "audio/flac");
  assert.equal(getMediaPreviewFormat("/tmp/doc.pdf"), null);
});

test("B17 存储分类 11 项、折叠占位与卷分组", () => {
  assert.deepEqual(STORAGE_CATEGORY_IDS, constantsSnapshot.STORAGE_CATEGORY_IDS);
  assert.equal(STORAGE_MORE_ENTRIES_PATH, "…");
  const root = (id, bytes, volume) => ({
    id,
    path: `/data/${id}`,
    volume,
    bytes,
    fileCount: 1,
    categories: [],
  });
  const volA = { deviceId: "dev-a", mountPoint: "/mnt/a", totalBytes: 100, freeBytes: 10 };
  const volB = { deviceId: "dev-b", mountPoint: "/mnt/b", totalBytes: 100, freeBytes: 10 };
  const groups = groupStorageRootsByVolume([
    root("home", 10, volA),
    root("dataBaseDir", 30, volA),
    root("orphan", 20, null),
  ]);
  assert.equal(groups.length, 2, "同 deviceId 合并、无 volume 各自成组");
  assert.equal(groups[0].key, "dev:dev-a");
  assert.equal(groups[0].bytes, 40);
  assert.deepEqual(
    groups[0].roots.map((item) => item.id),
    ["home", "dataBaseDir"],
    "组内保序",
  );
  assert.equal(groups[1].key, "path:/data/orphan");
  const sorted = groupStorageRootsByVolume([root("a", 1, volB), root("b", 5, volA)]);
  assert.equal(sorted[0].bytes, 5, "组间按 bytes 降序");
});

test("B22 默认快捷键表 23 条与查表语义", () => {
  assert.equal(SHORTCUT_COMMANDS.length, 23);
  assert.deepEqual(SHORTCUT_COMMANDS, constantsSnapshot.SHORTCUT_COMMANDS);
  assert.deepEqual(getDefaultShortcutBindings("openCommandCenter"), [
    "CmdOrCtrl+k",
    "CmdOrCtrl+Shift+p",
  ]);
  assert.deepEqual(getDefaultShortcutBindings("composerSend"), ["Enter"]);
  assert.deepEqual(getDefaultShortcutBindings("no-such-command"), []);
});

test("B23 键归一：别名、单字符类、命名键与拒绝", () => {
  assert.equal(normalizeShortcutKey("Plus"), "=");
  assert.equal(normalizeShortcutKey("Equal"), "=");
  assert.equal(normalizeShortcutKey("Minus"), "-");
  assert.equal(normalizeShortcutKey("k"), "k");
  assert.equal(normalizeShortcutKey("["), "[");
  assert.equal(normalizeShortcutKey("`"), "`");
  assert.equal(normalizeShortcutKey("F12"), "F12");
  assert.equal(normalizeShortcutKey("ArrowUp"), "ArrowUp");
  assert.equal(normalizeShortcutKey("Enter"), "Enter");
  assert.equal(normalizeShortcutKey("K"), null, "大写单字符不接受");
  assert.equal(normalizeShortcutKey("Escape"), null);
  assert.equal(normalizeShortcutKey(""), null);
});

test("B23 解析/序列化往返与拒绝语义", () => {
  assert.deepEqual(parseShortcutBinding("CmdOrCtrl+Shift+p"), {
    cmdOrCtrl: true,
    ctrl: false,
    alt: false,
    shift: true,
    altGr: false,
    key: "p",
  });
  assert.deepEqual(parseShortcutBinding("Enter"), {
    cmdOrCtrl: false,
    ctrl: false,
    alt: false,
    shift: false,
    altGr: false,
    key: "Enter",
  });
  assert.equal(parseShortcutBinding("Ctrl+Ctrl+k"), null, "重复修饰键拒绝");
  assert.equal(parseShortcutBinding("Meta+k"), null, "未知修饰键拒绝");
  assert.equal(parseShortcutBinding("CmdOrCtrl+"), null, "空键拒绝");
  assert.equal(parseShortcutBinding("CmdOrCtrl+K"), null, "非法键拒绝");
  assert.equal(
    serializeShortcutBinding({
      cmdOrCtrl: true,
      ctrl: false,
      alt: true,
      shift: true,
      altGr: false,
      key: "=",
    }),
    "CmdOrCtrl+Alt+Shift+=",
    "固定修饰键顺序",
  );
  assert.equal(
    serializeShortcutBinding({
      cmdOrCtrl: false,
      ctrl: false,
      alt: false,
      shift: false,
      altGr: false,
      key: "Nope",
    }),
    null,
  );
});

test("B23 isValidShortcutBinding：parse∘serialize 逐字往返", () => {
  assert.equal(isValidShortcutBinding("CmdOrCtrl+Shift+p"), true);
  assert.equal(isValidShortcutBinding("Enter"), true);
  assert.equal(isValidShortcutBinding("CmdOrCtrl+Shift+P"), false);
  assert.equal(isValidShortcutBinding("ctrl+k"), false, "小写修饰键不是规范形");
  for (const entry of SHORTCUT_COMMANDS) {
    for (const binding of entry.defaultBindings) {
      assert.equal(
        isValidShortcutBinding(binding),
        true,
        `${entry.id} 的默认绑定 ${binding} 应合法`,
      );
    }
  }
});
