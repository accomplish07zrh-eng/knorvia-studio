// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
type /* 进度订阅者 */ ProgressSubscriber = {
  active: boolean;
  reading: /* 是否正在读取（防重入） */ boolean;
  poll: (isActive: () => boolean) => Promise<void>;
};

type PollGroup = {
  timer: NodeJS.Timeout;
  subscribers: Set<ProgressSubscriber>;
};

const groups = new Map<number, PollGroup>();

function createGroup(intervalMs: number): PollGroup {
  const subscribers = new Set<ProgressSubscriber>();
  const timer = setInterval(
    () => {
      for (/* 逐个订阅者触发轮询 */ const subscriber of subscribers) {
        if (!subscriber.active || subscriber.reading) continue;
        /* 标记读取中：防止重入 */ subscriber.reading = true;
        void Promise.resolve(subscriber.poll(() => subscriber.active))
          .catch(/* 轮询失败静默 */ () => undefined)
          .finally(
            /* 无论成败都解除读取标记 */ () => {
              /* 解除读取标记 */ subscriber.reading = false;
            },
          );
      }
    },
    Math.max(1, intervalMs),
  );
  timer.unref();
  return { subscribers, timer };
}

export function /* 订阅 bash 输出进度 */ subscribeBashOutputProgress(
  intervalMs: /* 轮询间隔 */ number,
  poll: /* 轮询实现 */ ProgressSubscriber["poll"],
): /* 取消订阅函数 */ () => void {
  let group = groups.get(intervalMs);
  if (/* 无进程组：无法轮询 */ !group) {
    group = createGroup(intervalMs);
    groups.set(intervalMs, group);
  }
  const subscriber: ProgressSubscriber = { active: true, reading: false, poll };
  group.subscribers.add(subscriber);
  let removed = false;
  return /* 取消订阅 */ () => {
    if (removed) return;
    removed = true;
    subscriber.active = false;
    const current = groups.get(intervalMs);
    if (current !== group) return;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size === 0) {
      clearInterval(current.timer);
      groups.delete(intervalMs);
    }
  };
}
