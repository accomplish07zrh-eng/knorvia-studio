import type { StudioKernelUsage } from "../kernelTypes.js";
import type { StudioRepository } from "./storePort.js";
import type {
  StudioGroupMemberMetrics,
  StudioGroupMetrics,
  StudioRun,
  StudioTurnSnapshot,
} from "../types.js";

function reported(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Group totals are sums of observed member turns, never estimates from message text. */
export function projectStudioGroupMetrics(
  run: StudioRun,
  turns: StudioTurnSnapshot[],
  usageForTurn: (turnId: string) => StudioKernelUsage | undefined,
  now: number,
  truncated: boolean,
): StudioGroupMetrics | undefined {
  if (run.kind !== "group" || !run.definition || !("members" in run.definition)) return undefined;
  const members = run.definition.members;
  const unknownMember = turns.some((turn) => !turn.memberId || !members.includes(turn.memberId));
  const active = ["queued", "running", "waiting"].includes(run.state) && !run.cancelRequested;
  const output: StudioGroupMemberMetrics[] = members.map((member) => {
    const owned = turns.filter((turn) => turn.memberId === member);
    let tokens: number | undefined;
    let durationMs: number | undefined;
    let tokensPartial = truncated || unknownMember;
    let durationPartial = truncated || unknownMember;
    let tokenOverflow = false;
    let durationOverflow = false;
    for (const turn of owned) {
      const usage = usageForTurn(turn.id);
      const input = reported(usage?.inputTokens);
      const output = reported(usage?.outputTokens);
      if ((input !== undefined || output !== undefined) && !tokenOverflow) {
        const next = (tokens ?? 0) + (input ?? 0) + (output ?? 0);
        tokens = Number.isSafeInteger(next) ? next : undefined;
        if (tokens === undefined) {
          tokensPartial = true;
          tokenOverflow = true;
        }
      }
      if (input === undefined || output === undefined || usage?.scope === "request")
        tokensPartial = true;
      const started = reported(turn.startedAt);
      const ended = reported(turn.endedAt);
      const observedEnd = ended ?? (active && turn.state === "running" ? reported(now) : undefined);
      if (started !== undefined && observedEnd !== undefined && observedEnd >= started && !durationOverflow) {
        const next = (durationMs ?? 0) + observedEnd - started;
        durationMs = Number.isSafeInteger(next) ? next : undefined;
        if (durationMs === undefined) {
          durationPartial = true;
          durationOverflow = true;
        }
      } else {
        durationPartial = true;
      }
      if (turn.state === "running") durationPartial = true;
    }
    return { member, tokens, durationMs, tokensPartial, durationPartial };
  });
  const knownTokens = output.map((item) => item.tokens).filter((value): value is number => value !== undefined);
  const knownDurations = output.map((item) => item.durationMs).filter((value): value is number => value !== undefined);
  const totalTokens = knownTokens.length ? knownTokens.reduce((sum, value) => sum + value, 0) : undefined;
  const totalDuration = knownDurations.length ? knownDurations.reduce((sum, value) => sum + value, 0) : undefined;
  return {
    runId: run.id,
    members: output,
    total: {
      tokens: totalTokens !== undefined && Number.isSafeInteger(totalTokens) ? totalTokens : undefined,
      durationMs: totalDuration !== undefined && Number.isSafeInteger(totalDuration) ? totalDuration : undefined,
      tokensPartial: output.some((item) => item.tokensPartial) || (totalTokens !== undefined && !Number.isSafeInteger(totalTokens)),
      durationPartial: output.some((item) => item.durationPartial) || (totalDuration !== undefined && !Number.isSafeInteger(totalDuration)),
    },
    truncated,
  };
}

export function readStudioGroupMetrics(
  db: StudioRepository,
  run: StudioRun | undefined,
  now: number,
): StudioGroupMetrics | undefined {
  if (run?.kind !== "group") return undefined;
  const turns = db.list<StudioTurnSnapshot>("turn", { scope: run.id, limit: 2001 });
  return projectStudioGroupMetrics(
    run,
    turns.slice(0, 2000),
    (turnId) => db.read<StudioKernelUsage>("usage", turnId),
    now,
    turns.length > 2000,
  );
}
