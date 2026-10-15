// SPDX-License-Identifier: Apache-2.0
// 语义化版本比较与强制升级判定（B5）。

/** 远端配置里的强制升级要求；随 coding-plan 残留删除迁入唯一使用方。 */
export type ForceUpdateConfig = {
  minimalVersion: /* 允许继续运行的最低版本 */ string;
};

export type ForceUpdateRequirement = {
  currentVersion: /* 当前版本原文 */ string;
  minimalVersion: /* 被要求的最低版本（已 trim） */ string;
};

type VersionParts = {
  numbers: /* 主/次/修三段 */ [number, number, number];
  prerelease: /* 预发布标识段；正式版为 null */ string[] | null;
};

const COMPLETE_VERSION_PATTERN =
  /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const MAJOR_ONLY_PATTERN = /^([0-9]+)$/;
const MAJOR_MINOR_PATTERN = /^([0-9]+)\.([0-9]+)$/;
const NUMERIC_SEGMENT_PATTERN = /^\d+$/;

function parseVersion(raw: string): VersionParts | null {
  const cleaned = raw.trim().replace(/^v/i, "");
  const complete = COMPLETE_VERSION_PATTERN.exec(cleaned);
  if (complete !== null) {
    const [, majorText, minorText, patchText, preText] = complete;
    const parsed: VersionParts = {
      numbers: [Number(majorText), Number(minorText), Number(patchText)],
      prerelease: preText === undefined ? null : preText.split("."),
    };
    return parsed;
  }
  // 兼容只写主版本或主次版本的配置；简写不接受预发布标识与构建信息。
  const majorOnly = MAJOR_ONLY_PATTERN.exec(cleaned);
  if (majorOnly !== null) {
    const zeroed: VersionParts = { numbers: [Number(majorOnly[1]), 0, 0], prerelease: null };
    return zeroed;
  }
  const majorMinor = MAJOR_MINOR_PATTERN.exec(cleaned);
  if (majorMinor !== null) {
    return { numbers: [Number(majorMinor[1]), Number(majorMinor[2]), 0], prerelease: null };
  }
  return null; // 三种形态都对不上，按不可比较处理
}

/** 数字段按数值比；数字段先于非数字段；其余按 localeCompare。 */
function compareSegment(leftEntry: string, rightEntry: string): number {
  const leftNumeric = NUMERIC_SEGMENT_PATTERN.test(leftEntry);
  const rightNumeric = NUMERIC_SEGMENT_PATTERN.test(rightEntry);
  if (leftNumeric && rightNumeric) {
    // 两侧都是纯数字段，按数值差定序。
    return Number(leftEntry) - Number(rightEntry);
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1; // 数字段排在非数字段之前
  }
  return leftEntry.localeCompare(rightEntry);
}

function comparePrerelease(leftPre: string[] | null, rightPre: string[] | null): number {
  const leftAbsent = leftPre === null;
  const rightAbsent = rightPre === null;
  if (leftAbsent || rightAbsent) {
    if (leftAbsent && rightAbsent) {
      return 0; // 两侧都是正式版
    }
    // 正式版高于任何预发布版。
    return leftAbsent ? 1 : -1;
  }
  const leftSegments = leftPre;
  const rightSegments = rightPre;
  const span = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < span; index += 1) {
    const leftEntry = leftSegments[index];
    const rightEntry = rightSegments[index];
    if (leftEntry === undefined || rightEntry === undefined) {
      // 段数更多的一方更大。
      return leftEntry === undefined ? -1 : 1;
    }
    const delta = compareSegment(leftEntry, rightEntry);
    if (delta !== 0) {
      return Math.sign(delta); // 已分出高下
    }
  }
  return 0; // 逐段等价
}

export function compareSemverVersions(leftRaw: string, rightRaw: string): number | null {
  const leftParts = parseVersion(leftRaw);
  const rightParts = parseVersion(rightRaw);
  if (leftParts === null || rightParts === null) {
    return null; // 任一版本解析失败就不比较
  }

  for (const index of [0, 1, 2] as const) {
    const delta = leftParts.numbers[index] - rightParts.numbers[index];
    if (delta !== 0) {
      return Math.sign(delta); // 主/次/修已分出高下
    }
  }
  return comparePrerelease(leftParts.prerelease, rightParts.prerelease);
}

type RequirementOutcome = ForceUpdateRequirement | null;

export function resolveForceUpdateRequirement(request: {
  forceUpdate?: /* 远端配置片段；缺席或 null 表示无要求 */ ForceUpdateConfig | null;
  currentVersion: /* 当前版本原文 */ string;
}): RequirementOutcome {
  const minimalVersion = request.forceUpdate?.minimalVersion.trim();
  if (!minimalVersion) {
    return null; // 没有远端最低版本要求
  }

  const comparison = compareSemverVersions(request.currentVersion, minimalVersion);
  if (comparison === null || comparison >= 0) {
    return null; // 版本不可比或已达标
  }
  return { currentVersion: request.currentVersion, minimalVersion };
}
