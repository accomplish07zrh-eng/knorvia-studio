// SPDX-License-Identifier: Apache-2.0
// M0-8 相似度门槛：行相似度索引与指标。
import {
  kindOf,
  LINE_CONTAINMENT_LIMIT,
  LINE_MIN_LINES,
  LINE_RUN_LIMIT,
} from "./similarity-text.mjs";

// 一段对齐最多向后延伸多少行；防止在极端重复文件上退化成平方级。
const MAX_RUN = 4096;

function createLineGroup() {
  return { paths: [], lineIds: new Map(), occFiles: [], occLines: [], ids: [] };
}

function addLineFile(group, path, lines) {
  const fileIndex = group.paths.length;
  const ids = new Int32Array(lines.length);
  lines.forEach((line, index) => {
    let id = group.lineIds.get(line);
    if (id === undefined) {
      id = group.lineIds.size;
      group.lineIds.set(line, id);
      group.occFiles.push([]);
      group.occLines.push([]);
    }
    ids[index] = id;
    group.occFiles[id].push(fileIndex);
    group.occLines[id].push(index);
  });
  group.paths.push(path);
  group.ids.push(ids);
}

function finalizeLineGroups(groups) {
  for (const group of groups.values()) {
    group.uniqueFiles = group.occFiles.map((list) => Int32Array.from(new Set(list)));
    group.occFiles = group.occFiles.map((list) => Int32Array.from(list));
    group.occLines = group.occLines.map((list) => Int32Array.from(list));
  }
}

export function createLineGroupSet() {
  return new Map();
}

export function addLineFileToSet(groups, path, lines) {
  const kind = kindOf(path);
  if (!groups.has(kind)) groups.set(kind, createLineGroup());
  addLineFile(groups.get(kind), path, lines);
}

export function createLineIndex(files) {
  const groups = createLineGroupSet();
  for (const file of files) addLineFileToSet(groups, file.path, file.lines);
  finalizeLineGroups(groups);
  return { groups, kindCount: groups.size };
}

// 单组指标：包含率取「包含候选行最多」的那个比较文件。
function groupMetrics(group, lines) {
  const total = lines.length;
  if (!total) return { containment: 0, longestRun: 0, path: null };
  const ids = new Int32Array(total);
  for (let index = 0; index < total; index += 1) {
    ids[index] = group.lineIds.get(lines[index]) ?? -1;
  }
  const counts = new Uint32Array(group.paths.length);
  for (let index = 0; index < total; index += 1) {
    const id = ids[index];
    if (id < 0) continue;
    for (const fileIndex of group.uniqueFiles[id]) counts[fileIndex] += 1;
  }
  let best = 0;
  let topIndex = -1;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] > best) {
      best = counts[index];
      topIndex = index;
    }
  }
  let longest = 0;
  for (let index = 0; index < total; index += 1) {
    const id = ids[index];
    if (id < 0) continue;
    const occurrences = group.occFiles[id];
    for (let offset = 0; offset < occurrences.length; offset += 1) {
      const fileIndex = occurrences[offset];
      const position = group.occLines[id][offset];
      const corpus = group.ids[fileIndex];
      // 只从极大对齐起点向后延伸，避免把错位的重复行拼成假长段。
      if (index > 0 && position > 0 && corpus[position - 1] === ids[index - 1]) continue;
      let run = 0;
      while (
        run < MAX_RUN &&
        index + run < total &&
        position + run < corpus.length &&
        corpus[position + run] === ids[index + run]
      ) {
        run += 1;
      }
      if (run > longest) longest = run;
    }
  }
  return {
    containment: best / total,
    longestRun: longest,
    path: topIndex >= 0 ? group.paths[topIndex] : null,
  };
}

export function lineMetrics(index, lines, kind) {
  const groups = kind === undefined ? [...index.groups.values()] : [index.groups.get(kind)];
  const result = { containment: 0, longestRun: 0, path: null };
  for (const group of groups) {
    if (!group) continue;
    const metric = groupMetrics(group, lines);
    // 最长段取全部同组比较文件的最大值（保守），包含率取最高的那个文件。
    if (metric.longestRun > result.longestRun) result.longestRun = metric.longestRun;
    if (
      metric.containment > result.containment ||
      (metric.containment === result.containment && result.path === null && metric.path !== null)
    ) {
      result.containment = metric.containment;
      result.path = metric.path;
    }
  }
  return result;
}

export function linePasses(metric) {
  if (metric.lines < LINE_MIN_LINES) return metric.containment === 0;
  return metric.containment < LINE_CONTAINMENT_LIMIT && metric.longestRun < LINE_RUN_LIMIT;
}
