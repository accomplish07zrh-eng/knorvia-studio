// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
type ProgressSubscriber = {
  active: boolean;
  reading: boolean;
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
      for (const subscriber of subscribers) {
        if (!subscriber.active || subscriber.reading) continue;
        subscriber.reading = true;
        void Promise.resolve(subscriber.poll(() => subscriber.active))
          .catch(() => undefined)
          .finally(() => {
            subscriber.reading = false;
          });
      }
    },
    Math.max(1, intervalMs),
  );
  timer.unref();
  return { subscribers, timer };
}

export function subscribeBashOutputProgress(
  intervalMs: number,
  poll: ProgressSubscriber["poll"],
): () => void {
  let group = groups.get(intervalMs);
  if (!group) {
    group = createGroup(intervalMs);
    groups.set(intervalMs, group);
  }
  const subscriber: ProgressSubscriber = { active: true, reading: false, poll };
  group.subscribers.add(subscriber);
  let removed = false;
  return () => {
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
