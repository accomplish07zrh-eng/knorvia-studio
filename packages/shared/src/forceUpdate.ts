import type { ForceUpdateConfig } from "./coding-plan-subscription.js";

export interface ForceUpdateRequirement {
  currentVersion: string;
  minimalVersion: string;
}

interface VersionParts {
  numbers: [number, number, number];
  prerelease: string[] | null;
}

function parseVersion(input: string): VersionParts | null {
  const version = input.trim().replace(/^v/i, "");
  const complete = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    version,
  );
  if (complete) {
    return {
      numbers: [Number(complete[1]), Number(complete[2]), Number(complete[3])],
      prerelease: complete[4] === undefined ? null : complete[4].split("."),
    };
  }

  // 兼容只写主版本或主次版本的配置；简写不接受预发布标识和构建信息。
  const majorOnly = /^([0-9]+)$/.exec(version);
  if (majorOnly) {
    return { numbers: [Number(majorOnly[1]), 0, 0], prerelease: null };
  }
  const majorMinor = /^([0-9]+)\.([0-9]+)$/.exec(version);
  if (majorMinor) {
    return {
      numbers: [Number(majorMinor[1]), Number(majorMinor[2]), 0],
      prerelease: null,
    };
  }
  return null;
}

function comparePrerelease(left: string[] | null, right: string[] | null): number {
  if (left === null) {
    return right === null ? 0 : 1;
  }
  if (right === null) {
    return -1;
  }

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (leftEntry === undefined) {
      return -1;
    }
    if (rightEntry === undefined) {
      return 1;
    }

    const leftNumeric = /^\d+$/.test(leftEntry);
    const rightNumeric = /^\d+$/.test(rightEntry);
    if (leftNumeric && rightNumeric) {
      const delta = Number(leftEntry) - Number(rightEntry);
      if (delta !== 0) {
        return delta > 0 ? 1 : -1;
      }
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else {
      const delta = leftEntry.localeCompare(rightEntry);
      if (delta !== 0) {
        return delta > 0 ? 1 : -1;
      }
    }
  }
  return 0;
}

export function compareSemverVersions(leftVersion: string, rightVersion: string): number | null {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (left === null || right === null) {
    return null;
  }

  for (const index of [0, 1, 2] as const) {
    const delta = left.numbers[index] - right.numbers[index];
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function resolveForceUpdateRequirement(params: {
  currentVersion: string;
  forceUpdate?: ForceUpdateConfig | null;
}): ForceUpdateRequirement | null {
  const minimalVersion = params.forceUpdate?.minimalVersion.trim();
  if (!minimalVersion) {
    return null;
  }

  const comparison = compareSemverVersions(params.currentVersion, minimalVersion);
  if (comparison === null || comparison >= 0) {
    return null;
  }
  return { currentVersion: params.currentVersion, minimalVersion };
}
