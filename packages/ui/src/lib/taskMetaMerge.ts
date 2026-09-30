// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B1 metadata field policies, 2026-09-30.
// Prior source was reviewed; independent authorship/license review remains pending.
import type { KnorviaTaskMeta } from "@knorvia/shared";

interface MetaSources {
  base: KnorviaTaskMeta;
  fallback: KnorviaTaskMeta;
  optimistic: KnorviaTaskMeta;
}

function selectSources(task: KnorviaTaskMeta, optimistic: KnorviaTaskMeta): MetaSources {
  const overlayWins =
    optimistic.updatedAt > task.updatedAt ||
    (optimistic.updatedAt === task.updatedAt && optimistic.title.length > task.title.length);
  return overlayWins
    ? { base: optimistic, fallback: task, optimistic }
    : { base: task, fallback: optimistic, optimistic };
}

function placeholder(title: string): boolean {
  const value = title.trim().toLocaleLowerCase();
  return value === "" || value === "new session";
}

function titleFor({ base, fallback }: MetaSources): string {
  if (fallback.titleOverridden && !base.titleOverridden) return fallback.title;
  // 首发 ACK 后的占位 snapshot 不能抹掉真实乐观标题；生成标题仍按时间收敛。
  return placeholder(base.title) && !placeholder(fallback.title) ? fallback.title : base.title;
}

type ProjectedField =
  | "changeSummary"
  | "model"
  | "provider"
  | "title"
  | "titleOverridden"
  | "status"
  | "unreadAt";
type FieldPolicy<K extends ProjectedField> = readonly [
  K,
  (sources: MetaSources, unreadAt: number | undefined) => KnorviaTaskMeta[K],
];

function policy<K extends ProjectedField>(key: K, read: FieldPolicy<K>[1]): FieldPolicy<K> {
  return [key, read];
}

// 策略表只定义原有七个投影字段；target/thoughtLevel 等仍完全由基底持有。
const policies = [
  policy("changeSummary", ({ base, fallback }) => base.changeSummary ?? fallback.changeSummary),
  policy("model", ({ base, fallback }) => base.model ?? fallback.model),
  policy("provider", ({ base, fallback }) => base.provider ?? fallback.provider),
  policy("title", titleFor),
  policy("titleOverridden", ({ base, fallback }) =>
    base.titleOverridden === true || fallback.titleOverridden === true
      ? true
      : (base.titleOverridden ?? fallback.titleOverridden),
  ),
  policy("status", ({ base, fallback }) => base.status ?? fallback.status),
  policy("unreadAt", (_sources, unreadAt) => unreadAt),
] as const;

function applyPolicy<K extends ProjectedField>(
  projection: KnorviaTaskMeta,
  sources: MetaSources,
  unreadAt: number | undefined,
  [key, read]: FieldPolicy<K>,
): void {
  projection[key] = read(sources, unreadAt);
}

export function mergeTaskWithOptimisticMeta(
  task: KnorviaTaskMeta,
  optimisticTask: KnorviaTaskMeta,
): KnorviaTaskMeta {
  const sources = selectSources(task, optimisticTask);
  // own undefined 是显式已读操作；继承字段只参与通常的 nullish 回退。
  const unreadAt = Object.prototype.hasOwnProperty.call(sources.optimistic, "unreadAt")
    ? sources.optimistic.unreadAt
    : (sources.base.unreadAt ?? sources.fallback.unreadAt);
  const projection = { ...sources.base };
  for (const fieldPolicy of policies) applyPolicy(projection, sources, unreadAt, fieldPolicy);
  return projection;
}

export function mergeTaskMetaCandidates(
  ...candidates: Array<KnorviaTaskMeta | null | undefined>
): KnorviaTaskMeta | undefined {
  return candidates.reduce<KnorviaTaskMeta | undefined>((accumulated, candidate) => {
    if (!candidate) return accumulated;
    return accumulated ? mergeTaskWithOptimisticMeta(candidate, accumulated) : candidate;
  }, undefined);
}
