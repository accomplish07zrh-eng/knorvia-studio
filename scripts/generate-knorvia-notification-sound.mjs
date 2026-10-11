// SPDX-License-Identifier: Apache-2.0
// Knorvia 提示音生成器：用纯 Node 合成一段短促的双音提示音，作为产品自己的音效素材。
// 生成物是 WAV（44.1kHz / 单声道 / 16-bit PCM），不依赖任何上游音频文件。
//
// 用法：node scripts/generate-knorvia-notification-sound.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const KNORVIA_NOTIFICATION_SOUND_PATH =
  "packages/ui/src/assets/notification-sounds/task-notification-pop.wav";

// 三道笔画母题的听感映射：先一声低音落地，再叠一声高音收尾，整体短促、无混响。
const SAMPLE_RATE = 44_100;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const TOTAL_SECONDS = 0.3;
const ATTACK_SECONDS = 0.004;
const DECAY_RATE = 24;
const PEAK = 0.62;
const SECOND_HARMONIC_GAIN = 0.18;
const STROKES = [
  { startSeconds: 0, seconds: 0.13, frequencyHz: 784, gain: 0.6 },
  { startSeconds: 0.082, seconds: 0.218, frequencyHz: 1174.66, gain: 0.5 },
];

function strokeSample(stroke, atSeconds) {
  const elapsed = atSeconds - stroke.startSeconds;
  if (elapsed < 0 || elapsed > stroke.seconds) return 0;
  const attack = Math.min(1, elapsed / ATTACK_SECONDS);
  const decay = Math.exp(-DECAY_RATE * elapsed);
  const phase = 2 * Math.PI * stroke.frequencyHz * elapsed;
  const tone = Math.sin(phase) + SECOND_HARMONIC_GAIN * Math.sin(2 * phase);
  return stroke.gain * attack * decay * tone;
}

function pcmFrame(index) {
  const atSeconds = index / SAMPLE_RATE;
  const mixed = STROKES.reduce((sum, stroke) => sum + strokeSample(stroke, atSeconds), 0);
  const clamped = Math.max(-1, Math.min(1, mixed * PEAK));
  return Math.round(clamped * 32767);
}

export function renderKnorviaNotificationSound() {
  const frames = Math.round(TOTAL_SECONDS * SAMPLE_RATE);
  const dataBytes = frames * CHANNELS * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < frames; index++) {
    buffer.writeInt16LE(pcmFrame(index), 44 + index * BYTES_PER_SAMPLE);
  }
  return buffer;
}

export async function writeKnorviaNotificationSound(root = repoRoot) {
  const target = resolve(root, KNORVIA_NOTIFICATION_SOUND_PATH);
  await mkdir(dirname(target), { recursive: true });
  const bytes = renderKnorviaNotificationSound();
  await writeFile(target, bytes);
  return { target, bytes: bytes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const written = await writeKnorviaNotificationSound();
  console.log(`Knorvia notification sound: ${KNORVIA_NOTIFICATION_SOUND_PATH} (${written.bytes} bytes)`);
}
