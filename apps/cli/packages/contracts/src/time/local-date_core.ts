// SPDX-License-Identifier: Apache-2.0
// 本地日历日的实现：只读本地时区字段，不经过 UTC，也不做时间运算，
// 避免"同一时刻在不同时区得到不同日期"以外的任何偏移。

/** 月与日的补零宽度（ISO 8601 的日历日部分固定两位）。 */
const SEGMENT_WIDTH = 2;

/** 日期各段的分隔符。 */
const SEGMENT_JOINER = "-";

const padSegment = (value: number): string => `${value}`.padStart(SEGMENT_WIDTH, "0");

/** 只取本地时区字段：年原样、月补 +1、日原样。 */
export const readLocalDateSegments = (date: Date): readonly [number, number, number] => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
];

/** 年按本地值原样输出（不补零、不截断），月与日补零到两位后拼接。 */
export const joinLocalDateSegments = (year: number, month: number, day: number): string =>
  [year, padSegment(month), padSegment(day)].join(SEGMENT_JOINER);

/** 本地日历日：`YYYY-MM-DD`，不经过 UTC。 */
export const toLocalIsoDate = (date: Date): string => {
  const [year, month, day] = readLocalDateSegments(date);
  return joinLocalDateSegments(year, month, day);
};
