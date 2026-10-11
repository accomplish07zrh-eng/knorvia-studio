import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  KNORVIA_NOTIFICATION_SOUND_PATH,
  renderKnorviaNotificationSound,
} from "../../../scripts/generate-knorvia-notification-sound.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

test("提示音是脚本合成的 Knorvia 音效，与生成器逐字节一致", () => {
  const checkedIn = readFileSync(resolve(REPO_ROOT, KNORVIA_NOTIFICATION_SOUND_PATH));
  assert.deepEqual(checkedIn, renderKnorviaNotificationSound());
});

test("提示音为单声道 44.1kHz 16-bit PCM 且有实际内容", () => {
  const bytes = renderKnorviaNotificationSound();
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(bytes.readUInt16LE(20), 1, "PCM 编码");
  assert.equal(bytes.readUInt16LE(22), 1, "单声道");
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt16LE(34), 16);
  assert.equal(bytes.length, 44 + Math.round(0.3 * 44100) * 2, "0.3 秒、16-bit 单声道数据长度");
  assert.ok(
    bytes.subarray(44).some((byte) => byte !== 0),
    "提示音不能是静音",
  );
});

test("提示音路径与播放模块引用一致", () => {
  const source = readFileSync(
    resolve(REPO_ROOT, "packages/ui/src/lib/taskNotificationSound.ts"),
    "utf8",
  );
  assert.match(source, /task-notification-pop\.wav/u);
  assert.doesNotMatch(source, /\.mp3/u);
});
