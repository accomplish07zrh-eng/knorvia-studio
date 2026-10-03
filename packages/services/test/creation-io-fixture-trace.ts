// Test-only observation; repository transition licence remains applicable.
import { isAbsolute, relative, resolve } from "node:path";

type Phase = "records.write" | "asset.write";
const MAX_EVENTS = 24;
const KNOWN_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOENT", "EEXIST", "ABORT_ERR"]);
interface Observation {
  root: string;
  since: number;
  sequence: number;
  counts: Map<Phase, { started: number; completed: number; failed: number }>;
  active: Map<number, { phase: Phase; since: number }>;
  events: string[];
}

export function createCreationIoFixtureTrace(now: () => number = () => performance.now()) {
  const owners = new Map<string, Observation>();
  const append = (scope: Observation, event: string) => {
    if (scope.events.length < MAX_EVENTS) scope.events.push(event);
  };
  return {
    watch(root: string) {
      const key = resolve(root);
      const scope: Observation = {
        root: key,
        since: now(),
        sequence: 0,
        counts: new Map(),
        active: new Map(),
        events: [],
      };
      owners.set(key, scope);
      return {
        describe() {
          const time = now();
          return `creation IO=${JSON.stringify({
            counts: Object.fromEntries(scope.counts),
            pending: [...scope.active.values()].map((item) => ({
              phase: item.phase,
              ageMs: Number((time - item.since).toFixed(1)),
            })),
            firstEvents: scope.events,
          })}`;
        },
        release() {
          if (owners.get(key) === scope) owners.delete(key);
        },
      };
    },
    run<T>(path: string, phase: Phase, operation: () => Promise<T>): Promise<T> {
      let scope: Observation | undefined;
      try {
        const target = resolve(path);
        scope = [...owners.values()].find((candidate) => {
          const delta = relative(candidate.root, target);
          return (
            delta !== ".." &&
            !delta.startsWith("../") &&
            !delta.startsWith("..\\") &&
            !isAbsolute(delta)
          );
        });
      } catch {
        /* Diagnostic selection must not replace the real operation's outcome. */
      }
      if (!scope) return operation();
      const selected = scope;
      let id: number;
      try {
        id = selected.sequence++;
        const counts = selected.counts.get(phase) ?? { started: 0, completed: 0, failed: 0 };
        selected.counts.set(phase, counts);
        counts.started++;
        selected.active.set(id, { phase, since: now() });
        append(selected, `${phase}:start@${(now() - selected.since).toFixed(1)}ms`);
      } catch {
        return operation();
      }
      const finish = (error?: unknown, failed = false) => {
        try {
          if (!selected.active.delete(id)) return;
          const counts = selected.counts.get(phase)!;
          if (failed) counts.failed++;
          else counts.completed++;
          const value = (error as { code?: unknown } | null)?.code;
          const code = typeof value === "string" && KNOWN_CODES.has(value) ? value : "other";
          append(
            selected,
            `${phase}:${failed ? `error-${code}` : "return"}@${(now() - selected.since).toFixed(1)}ms`,
          );
        } catch {
          /* Observer errors never alter IO resolution or rejection. */
        }
      };
      try {
        const pending = operation();
        // 只旁观原 promise，不返回 .then 派生链，避免改变被测生产路径的 await 层级。
        void pending.then(
          () => finish(),
          (error) => finish(error, true),
        );
        return pending;
      } catch (error) {
        finish(error, true);
        throw error;
      }
    },
  };
}
