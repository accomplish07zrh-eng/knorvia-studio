// SPDX-License-Identifier: Apache-2.0

/**
 * 启动打点的四个阶段。登记顺序即序列化顺序：
 * T0 进程创建 → T1 main 模块求值 → T2 app ready → T3 窗口开始加载。
 */
const LAUNCH_PHASES = ["createdAt", "mainStart", "appReady", "loadUrl"] as const;

type LaunchMarkPhase = (typeof LAUNCH_PHASES)[number];

/** 主窗口加载的分阶段打点（epoch 毫秒），字段集合由阶段登记投影。 */
export type LaunchMarks = { [Phase in LaunchMarkPhase]: number };

/** 主窗口 loadURL 的 query 里携带打点的键。 */
export const LAUNCH_MARKS_QUERY_KEY = "knorviaLaunchMarks";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 四个阶段都在且都是有限数字才算有效打点；多余字段忽略。 */
function readLaunchMarks(decoded: unknown): LaunchMarks | null {
  if (!isPlainRecord(decoded)) return null;
  const marks = {} as LaunchMarks;
  for (const phase of LAUNCH_PHASES) {
    const value = decoded[phase];
    if (!isFiniteNumber(value)) return null;
    marks[phase] = value;
  }
  return marks;
}

export const serializeLaunchMarks = (marks: LaunchMarks): string => JSON.stringify(marks);

/** 解析失败、空串与非对象一律 null，调用方按「无打点」降级。 */
export const parseLaunchMarks = (raw: string | null | undefined): LaunchMarks | null => {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return readLaunchMarks(JSON.parse(raw));
  } catch {
    return null;
  }
};
