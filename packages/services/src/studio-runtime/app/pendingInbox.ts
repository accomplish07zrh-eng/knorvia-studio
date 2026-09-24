import type { StoredInteraction, StudioRepository } from "./storePort.js";

export function pendingStudioSteering(db: StudioRepository, runId: string) {
  // 先筛 pending 再取最早批次；已消费历史不能挤出积压的用户说明。
  return db.list<{ id: string; text: string; state: string }>("steering", {
    scope: runId,
    limit: 32,
    pendingSteeringOnly: true,
    oldestFirst: true,
  });
}

export function pendingStudioInteractions(db: StudioRepository, targetId: string) {
  return db.list<StoredInteraction>("interaction", {
    scope: targetId,
    limit: 10000,
    pendingInteractionsOnly: true,
  });
}
