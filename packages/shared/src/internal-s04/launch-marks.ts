// SPDX-License-Identifier: Apache-2.0
export interface LaunchMarks {
  createdAt: number;
  mainStart: number;
  appReady: number;
  loadUrl: number;
}

export const LAUNCH_MARKS_QUERY_KEY = "knorviaLaunchMarks";

export function serializeLaunchMarks(marks: LaunchMarks): string {
  return JSON.stringify(marks);
}

const REQUIRED_LAUNCH_MARK_KEYS: readonly (keyof LaunchMarks)[] = [
  "createdAt",
  "mainStart",
  "appReady",
  "loadUrl",
];

export function parseLaunchMarks(raw: string | null | undefined): LaunchMarks | null {
  if (raw == null || raw === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const dict = parsed as Record<string, unknown>;
  const output = {} as LaunchMarks;
  for (const k of REQUIRED_LAUNCH_MARK_KEYS) {
    const v = dict[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return null;
    }
    output[k] = v;
  }
  return output;
}
