import type { StudioTimeline } from "@knorvia/services";

/** `before` identifies the requested page, so a late reply cannot consume a newer history gap. */
export function mergeStudioTimelinePage(
  previous: StudioTimeline | undefined,
  page: StudioTimeline,
  before?: number,
): StudioTimeline {
  const messages = new Map((previous?.messages ?? []).map((message) => [message.id, message]));
  const overlaps = page.messages.some((message) => messages.has(message.id));
  for (const message of page.messages) {
    const old = messages.get(message.id);
    if (
      !old ||
      message.updatedAt > old.updatedAt ||
      (message.updatedAt === old.updatedAt && page.revision >= (previous?.revision ?? 0))
    )
      messages.set(message.id, message);
  }
  let nextBefore = previous?.nextBefore;
  if (!previous) nextBefore = page.nextBefore;
  else if (before !== undefined) {
    // Refresh or another load may have moved the cursor while this request was in flight.
    if (previous.nextBefore === before) nextBefore = page.nextBefore;
  } else if (page.revision >= previous.revision) {
    if (page.nextBefore === undefined) nextBefore = undefined;
    // Latest windows without overlap can conceal messages created while this chat was unwatched.
    // Start at the new boundary; subsequent user paging walks through every hidden interval.
    else if (!overlaps) nextBefore = page.nextBefore;
  }
  return {
    ...(!previous || page.revision >= previous.revision ? page : previous),
    messages: [...messages.values()].sort(
      (a, b) => (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt),
    ),
    nextBefore,
  };
}
