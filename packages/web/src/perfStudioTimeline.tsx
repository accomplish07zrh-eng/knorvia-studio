import React from "react";
import { createRoot } from "react-dom/client";
import { ServiceProvider } from "../../ui/src/hooks/useServices.js";
import { KnorviaIntlProvider } from "../../ui/src/i18n/IntlProvider.js";
import { StudioTimeline as StudioTimelineView } from "../../ui/src/studio/runtime/StudioTimeline.js";
import "../../ui/src/styles.css";

const messages = Array.from({ length: 10_000 }, (_, index) => ({
  id: `message-${index}`,
  targetId: "performance-fixture",
  runId: `run-${index}`,
  sender: index % 5 === 0 ? "user" : "codex",
  kind: "text",
  text:
    index % 7 === 0
      ? `Synthetic message ${index}\n\n${"A paragraph of local fixture text. ".repeat(5)}`
      : `Synthetic message ${index}`,
  sequence: index + 101,
  createdAt: index + 101,
  updatedAt: index + 101,
}));
const older = Array.from({ length: 100 }, (_, index) => ({
  ...messages[0]!,
  id: `older-${index}`,
  text: `Earlier message ${index}`,
  sequence: index + 1,
  createdAt: index + 1,
  updatedAt: index + 1,
}));
let olderLoaded = false;
let revision = 1;
const listeners = new Set<() => void>();
const timeline = (rows: typeof messages, nextBefore?: number) => ({
  revision,
  messages: rows,
  runs: [],
  turns: [],
  interactions: [],
  ...(nextBefore === undefined ? {} : { nextBefore }),
});
const service = {
  onDidChange: (listener: () => void) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  overview: async () => ({ revision }),
  inspectKernels: async () => [],
  timeline: async (_targetId: string, before?: number) => {
    if (before !== undefined) {
      olderLoaded = true;
      revision++;
      return timeline(older);
    }
    return timeline(olderLoaded ? [...older, ...messages] : messages, olderLoaded ? undefined : 1);
  },
};

Object.assign(window, {
  __studioPerfFixture: {
    messageCount: messages.length,
    olderLoaded: () => olderLoaded,
    append: () => {
      const index = messages.length;
      messages.push({
        ...messages[0]!,
        id: `message-${index}`,
        text: `New synthetic message ${index}`,
        sequence: index + 101,
        createdAt: index + 101,
        updatedAt: index + 101,
      });
      revision++;
      for (const listener of listeners) listener();
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <ServiceProvider services={{ studioRuntimeService: service } as never}>
    <KnorviaIntlProvider initialLocale="en-US">
      <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
        <StudioTimelineView
          targetId="performance-fixture"
          showHistory={false}
          showInteractions={false}
        />
      </div>
    </KnorviaIntlProvider>
  </ServiceProvider>,
);
