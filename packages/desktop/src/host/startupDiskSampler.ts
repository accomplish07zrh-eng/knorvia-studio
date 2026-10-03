import { stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { StartupDiskSummary } from "@knorvia/shared";

type Probe = (path: string) => Promise<{
  scope: string;
  availableBytes: number;
}>;

type Entry = StartupDiskSummary & {
  path: string;
  baseline: number | null;
};

function defaultProbe(): Probe {
  const locations = new Map<string, { path: string; scope: string }>();

  return async function (path: string) {
    let location = locations.get(path);
    if (!location) {
      let parent = dirname(path);
      for (;;) {
        try {
          const info = await stat(parent, { bigint: true });
          location = {
            path: parent,
            scope: createHash("sha256").update(String(info.dev)).digest("hex"),
          };
          locations.set(path, location);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT" && dirname(parent) !== parent) {
            parent = dirname(parent);
          } else {
            throw error;
          }
        }
      }
    }

    const info = await statfs(location.path, { bigint: true });
    const bytes = info.bavail * info.bsize;
    if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Storage size exceeds safe numeric range");
    }
    return {
      scope: location.scope,
      availableBytes: Number(bytes > 0n ? bytes : 0n),
    };
  };
}

export class StartupDiskSampler {
  private readonly probe: Probe;
  private readonly entries = new Map<string, Entry>();
  private readonly sealed = new Set<string>();
  private busy = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly options: {
      probe?: Probe;
      onSample?: (summary: StartupDiskSummary[]) => void;
    } = {},
  ) {
    this.probe = options.probe ?? defaultProbe();
  }

  async addPath(path: string): Promise<void> {
    if (this.entries.size >= 8 || this.stopped) return;

    const scopeId = createHash("sha256").update(path).digest("hex");
    const entry: Entry = {
      path,
      scopeId,
      baseline: null,
      observedAvailableDropPeakBytes: null,
      minAvailableBytes: null,
      quality: "unknown",
      sampledAt: null,
    };
    this.entries.set(scopeId, entry);
    if (this.busy) return;

    this.busy = true;
    try {
      const result = await this.probe(path);
      if (this.stopped) return;

      this.entries.delete(scopeId);
      const existing = this.entries.get(result.scope);
      if (existing) {
        this.measure(existing, result.availableBytes);
      } else {
        this.entries.set(result.scope, {
          ...entry,
          scopeId: result.scope,
          baseline: this.sealed.has(path) ? null : result.availableBytes,
          minAvailableBytes: result.availableBytes,
          sampledAt: Date.now(),
          observedAvailableDropPeakBytes: this.sealed.has(path) ? null : 0,
          quality: this.sealed.has(path) ? "partial" : "complete",
        });
      }
    } catch {
      // A failed addition retains any mutations completed before the failure.
    } finally {
      this.busy = false;
    }
  }

  sealBaseline(path: string): void {
    this.sealed.add(path);
  }

  start(): void {
    if (!this.timer && !this.stopped) {
      this.timer = setInterval(() => {
        this.sample();
      }, 2000);
    }
  }

  async sample(): Promise<void> {
    if (this.busy || this.stopped) return;

    this.busy = true;
    try {
      const captured = [...this.entries.values()];
      for (const entry of captured) {
        if (this.stopped) break;
        try {
          const result = await this.probe(entry.path);
          if (this.stopped) continue;

          if (entry.scopeId !== result.scope) {
            this.entries.delete(entry.scopeId);
            const existing = this.entries.get(result.scope);
            if (existing) {
              this.measure(existing, result.availableBytes);
              continue;
            }
            entry.scopeId = result.scope;
            entry.quality = "partial";
            this.entries.set(result.scope, entry);
          }
          this.measure(entry, result.availableBytes);
        } catch {
          if (entry.quality === "complete") entry.quality = "partial";
        }
      }

      if (!this.stopped) this.options.onSample?.(this.snapshot());
    } finally {
      this.busy = false;
    }
  }

  private measure(entry: Entry, availableBytes: number): void {
    entry.minAvailableBytes = Math.min(entry.minAvailableBytes ?? availableBytes, availableBytes);
    entry.sampledAt = Date.now();
    if (entry.baseline !== null) {
      entry.observedAvailableDropPeakBytes = Math.max(0, entry.baseline - entry.minAvailableBytes);
    }
  }

  snapshot(): StartupDiskSummary[] {
    return [...this.entries.values()].map((entry) => {
      const { path: _path, baseline: _baseline, ...summary } = entry;
      return summary;
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }
}
