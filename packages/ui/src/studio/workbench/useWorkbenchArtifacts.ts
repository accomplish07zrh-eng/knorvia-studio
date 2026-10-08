import { useEffect, useRef } from "react";
import type { IStudioRuntimeService, StudioRun, StudioTimeline } from "@knorvia/services";
import { toFileUrl } from "@/lib/path.js";
import { logger } from "@/logger.js";
import type { WorkbenchTile } from "./workbenchModel.js";
import { useWorkbenchPreview, workbenchPreviewBinding } from "./workbenchPreviewStore.js";

const ACTIVE = new Set<StudioRun["state"]>(["queued", "running", "waiting"]);

/** 本会话最近一次已结束、带隔离工作区的运行；运行中的任务不读取。 */
export function latestArtifactRun(
  timeline: Pick<StudioTimeline, "runs"> | undefined,
  sessionId: string | null,
): { runId: string; stepId: string; key: string } | null {
  let latest: StudioRun | undefined;
  for (const run of timeline?.runs ?? []) {
    if (run.targetId !== sessionId || ACTIVE.has(run.state) || !run.workspaceStepIds?.length)
      continue;
    if (!latest || run.updatedAt > latest.updatedAt) latest = run;
  }
  if (!latest) return null;
  const stepId = latest.workspaceStepIds!.at(-1)!;
  return { runId: latest.id, stepId, key: `${latest.id}\u0000${stepId}\u0000${latest.updatedAt}` };
}

/** 默认打开 index.html，否则按路径排序的第一个网页。 */
export function defaultArtifactIndex(paths: readonly string[]): number {
  const index = paths.findIndex((path) => /(^|\/)index\.html?$/i.test(path));
  return index >= 0 ? index : 0;
}

/**
 * 外部内核格子的产物来源（specs/knorvia-workbench-artifact-preview-20261008.md）。
 * 运行结束后只读列出隔离副本里改动的网页；回执到达时格子已换会话或 Host 则丢弃。
 */
export function useWorkbenchArtifacts(
  tile: WorkbenchTile,
  service: IStudioRuntimeService | undefined,
  timeline: StudioTimeline | undefined,
  enabled: boolean,
) {
  const open = useWorkbenchPreview((state) => state.open);
  const binding = workbenchPreviewBinding(tile);
  const target =
    enabled && !tile.kernel.startsWith("ssh:") ? latestArtifactRun(timeline, tile.sessionId) : null;
  const latest = useRef({ binding, service });
  latest.current = { binding, service };
  const requested = useRef("");
  useEffect(() => {
    if (!target || !service) return;
    const requestKey = `${binding}\u0000${target.key}`;
    if (requested.current === requestKey) return;
    requested.current = requestKey;
    void service
      .workspaceChanges({ runId: target.runId, stepId: target.stepId, artifactsOnly: true })
      .then((changes) => {
        const artifacts = changes.filter((item) => item.previewPath);
        if (latest.current.binding !== binding || latest.current.service !== service) return;
        if (!artifacts.length) return;
        const files = artifacts.map((item) => ({
          url: toFileUrl(item.previewPath!),
          title: item.path,
        }));
        open(
          tile.id,
          binding,
          files[defaultArtifactIndex(artifacts.map((item) => item.path))]!,
          files,
        );
      })
      .catch((error: unknown) => {
        logger.debug("[workbench] 读取格子产物失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [binding, open, service, target?.key, target?.runId, target?.stepId, tile.id]);
}
