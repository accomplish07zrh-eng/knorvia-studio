import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  IServiceAccessor,
  IStudioRuntimeService,
  StudioCommand,
  StudioImageInput,
} from "@knorvia/services";
import { ServiceProvider } from "../../src/hooks/useServices.js";
import { TooltipProvider } from "../../src/components/ui/tooltip.js";
import { studioAgentStore } from "../../src/store/studioAgentStore.js";
import { useStudioAgentStore } from "../../src/store/studioAgentStore.js";
import { useStudioRuntime } from "../../src/studio/runtime/useStudioRuntime.js";
import { useStudioChatImages } from "../../src/studio/agents/useStudioChatImages.js";
import { KnorviaIntlProvider } from "../../src/i18n/IntlProvider.js";

const image: StudioImageInput = await (await fetch("/__owner_image")).json();
const targetId = "owner-chat";
function host() {
  const listeners = new Set<() => void>();
  const state = {
    overviewCid: "",
    timelineCid: "",
    holdTimeline: false,
    holdCommand: false,
    commandRejection: "",
    holdOverview: false,
  };
  const calls = { admission: [] as string[], commands: [] as StudioCommand[], heldOverviews: 0 };
  const timelines: Array<{ cid: string; resolve: (value: unknown) => void }> = [];
  const commands: Array<() => void> = [];
  const overviews: Array<(value: unknown) => void> = [];
  const service = {
    overview: async () => {
      if (state.holdOverview) {
        calls.heldOverviews++;
        return new Promise((resolve) => overviews.push(resolve));
      }
      return {
        revision: 1,
        conversations: [],
        groups: [],
        workflows: [],
        interactions: [],
        runs: state.overviewCid
          ? [{ id: "run", targetId, admissionCommandId: state.overviewCid }]
          : [],
      };
    },
    timeline: async (
      _target: string,
      _page?: unknown,
      _run?: unknown,
      _image?: unknown,
      cid?: string,
    ) => {
      if (cid) {
        calls.admission.push(cid);
        if (state.holdTimeline) return new Promise((resolve) => timelines.push({ cid, resolve }));
      }
      return {
        runs: [],
        messages: [],
        ...(cid && state.timelineCid === cid
          ? { admission: { commandId: cid, runId: "run" } }
          : {}),
      };
    },
    command: async (command: StudioCommand) => {
      calls.commands.push(structuredClone(command));
      if (state.holdCommand) await new Promise<void>((resolve) => commands.push(resolve));
      return {
        id: "run",
        revision: 1,
        ...(state.commandRejection ? { imageRejection: state.commandRejection } : {}),
      };
    },
    onDidChange: (listener: () => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  } as unknown as IStudioRuntimeService;
  return {
    service,
    calls,
    state,
    configure: (options: Partial<typeof state>) => {
      Object.assign(state, options);
      for (const listener of listeners) listener();
    },
    releaseTimeline: () => {
      for (const { cid, resolve } of timelines.splice(0))
        resolve({ runs: [], messages: [], admission: { commandId: cid, runId: "run" } });
    },
    releaseCommand: () => {
      for (const resolve of commands.splice(0)) resolve();
    },
    releaseOverview: (cid: string) => {
      for (const resolve of overviews.splice(0))
        resolve({
          revision: 2,
          conversations: [],
          groups: [],
          workflows: [],
          interactions: [],
          runs: [{ id: "run", targetId, admissionCommandId: cid }],
        });
    },
  };
}
const hosts = { A: host(), B: host() };
type Host = keyof typeof hosts;
const serviceSets = Object.fromEntries(
  Object.entries(hosts).map(([id, value]) => [id, { studioRuntimeService: value.service }]),
) as Record<Host, IServiceAccessor>;
let action = { settled: false, error: "" };
function Hook({
  selected,
  switchHost,
  remount,
}: {
  selected: Host;
  switchHost: (host: Host) => void;
  remount: () => void;
}) {
  const runtime = useStudioRuntime(targetId);
  const draft = useStudioAgentStore((state) => state.drafts[targetId]);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const images = useStudioChatImages({
    sessionId: targetId,
    kernelId: "codex",
    workspacePath: "/synthetic",
    selection: { model: "vision" },
    runtime,
    draft,
    mounted,
    setError: () => {},
    zh: false,
    modelOptions: {
      options: {
        defaultModel: "vision",
        models: [
          { id: "vision", label: "Vision", reasoning: [], inputModalities: ["text", "image"] },
        ],
      },
      loading: false,
      retry: () => {},
    },
  });
  Object.assign(window, {
    imageOwnerFixture: {
      select: switchHost,
      remount,
      configure: (host: Host, options: Partial<typeof hosts.A.state>) =>
        hosts[host].configure(options),
      releaseTimeline: (host: Host) => hosts[host].releaseTimeline(),
      releaseCommand: (host: Host) => hosts[host].releaseCommand(),
      releaseOverview: (host: Host, cid: string) => hosts[host].releaseOverview(cid),
      capture: () =>
        studioAgentStore
          .getState()
          .setDraftImages(
            targetId,
            "codex",
            [{ ...image, id: crypto.randomUUID() }],
            runtime.service!,
          ),
      replaceExpired: () => {
        for (const captured of studioAgentStore.getState().drafts[targetId]?.images ?? [])
          studioAgentStore.getState().removeDraftImage(targetId, captured.id);
        studioAgentStore
          .getState()
          .setDraftImages(
            targetId,
            "codex",
            [{ ...image, id: crypto.randomUUID() }],
            runtime.service!,
          );
      },
      seal: (cid: string) =>
        studioAgentStore.getState().sealImageSubmission(targetId, runtime.service!, {
          type: "send",
          kind: "chat",
          commandId: cid,
          targetId,
          text: "",
          attachments: studioAgentStore.getState().drafts[targetId].images as StudioImageInput[],
        }),
      state: () => ({
        selected,
        ready: runtime.ready,
        overviewCid: runtime.overview?.runs[0]?.admissionCommandId,
        imageCount: draft?.images?.length ?? 0,
        cid: draft?.imageSubmission?.commandId,
        hasBytes: Boolean(draft?.images?.[0]?.dataBase64),
        hasPendingOwner: Boolean(studioAgentStore.getState().pendingImages[targetId]),
        calls: { A: hosts.A.calls, B: hosts.B.calls },
        action,
      }),
      act: (kind: "command" | "retry" | "assert") => {
        action = { settled: false, error: "" };
        void (async () => {
          if (kind === "assert") return images.assertSend();
          if (kind === "retry") return images.retry();
          return images.command({
            type: "send",
            kind: "chat",
            targetId,
            text: "",
            attachments: studioAgentStore.getState().drafts[targetId].images as StudioImageInput[],
          });
        })().then(
          () => {
            action.settled = true;
          },
          (error) => {
            action = { settled: true, error: String(error) };
          },
        );
      },
    },
  });
  return <div>{images.editorProps.topContent}</div>;
}
function Fixture() {
  const [selected, switchHost] = useState<Host>("A");
  const [epoch, setEpoch] = useState(0);
  return (
    <ServiceProvider services={serviceSets[selected]}>
      <TooltipProvider>
        <KnorviaIntlProvider initialLocale="en-US">
          <Hook
            key={epoch}
            selected={selected}
            switchHost={switchHost}
            remount={() => setEpoch(epoch + 1)}
          />
        </KnorviaIntlProvider>
      </TooltipProvider>
    </ServiceProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
