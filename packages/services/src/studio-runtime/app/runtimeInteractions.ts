import type {
  StudioKernelAnswer,
  StudioKernelId,
  StudioKernelInteraction,
} from "../kernelTypes.js";
import type { StoredInteraction, StudioClock, StudioRepository } from "./storePort.js";
import { requiredRun } from "./commandAdmission.js";
import { pendingStudioInteractions } from "./pendingInbox.js";

/** A still-owned, side-effect-free human wait was explicitly stopped by the user. */
export class StudioInteractionCancelledError extends Error {
  constructor() {
    super("任务已停止");
    this.name = "StudioInteractionCancelledError";
  }
}

export async function waitStudioInteraction(options: {
  db: StudioRepository;
  clock: StudioClock;
  owner: string;
  runId: string;
  turnId: string;
  interaction: StudioKernelInteraction;
  kernel?: StudioKernelId;
  signal: AbortSignal;
  assertOwned(): void;
}): Promise<StudioKernelAnswer> {
  const { db, clock, runId, turnId, signal, interaction, assertOwned } = options;
  // Native request IDs may repeat after reconnect. Include the immutable run/attempt/turn identity.
  const link = `${turnId}:${interaction.id}`;
  let id = "";
  db.transaction(() => {
    assertOwned();
    id = db.read<string>("interaction-link", link) ?? clock.id();
    db.write("interaction-link", link, id);
    const previous = db.read<StoredInteraction>("interaction", id);
    if (previous?.status === "answered") return;
    const run = requiredRun(db, runId);
    const question: StoredInteraction = {
      ...interaction,
      id,
      runId,
      turnId,
      kernel: options.kernel,
      status: "pending",
      owner: options.owner,
    };
    db.write("interaction", id, question, run.targetId);
    run.state = "waiting";
    db.write("run", run.id, run, run.targetId);
  });
  try {
    while (true) {
      signal.throwIfAborted();
      assertOwned();
      const item = db.read<StoredInteraction>("interaction", id);
      if (item?.status === "answered") return item.answer ?? { decision: "deny" };
      if (!item || item.status === "expired") throw new Error("交互已失效");
      await clock.delay(100, signal);
    }
  } finally {
    if (db.owns(options.owner, clock.now()))
      db.transaction(() => {
        const item = db.read<StoredInteraction>("interaction", id);
        if (item?.status === "pending")
          db.write(
            "interaction",
            id,
            { ...item, status: "expired" },
            requiredRun(db, runId).targetId,
          );
        const run = requiredRun(db, runId);
        if (
          run.state === "waiting" &&
          !pendingStudioInteractions(db, run.targetId).some(
            (candidate) => candidate.runId === runId,
          )
        ) {
          run.state = "running";
          db.write("run", run.id, run, run.targetId);
        }
      });
  }
}
