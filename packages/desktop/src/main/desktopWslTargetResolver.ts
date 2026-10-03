import type { RemoteTarget } from "@knorvia/shared";
import { WSLBackend } from "@knorvia/server/remote/wsl-backend.js";

type WslTarget = Extract<RemoteTarget, { kind: "wsl" }>;

interface WslIdentityBackend {
  resolveIdentity(): Promise<{ distro: string; user: string }>;
  dispose(): void;
}

interface CanonicalWslTargetResolverOptions {
  createBackend?: (target: WslTarget) => WslIdentityBackend;
  ttlMs?: number;
  now?: () => number;
}

interface CachedResolution {
  expiresAt: number;
  promise: Promise<WslTarget>;
}

const DEFAULT_RESOLUTION_TTL_MS = 5_000;
const DEFAULT_IDENTITY_SEGMENT = "<default>";

function provisionalKey(target: WslTarget): string {
  return [
    target.distro?.trim().toLowerCase() || DEFAULT_IDENTITY_SEGMENT,
    target.user?.trim() || DEFAULT_IDENTITY_SEGMENT,
  ].join("\0");
}

class WslResolutionCache {
  private readonly entries = new Map<string, CachedResolution>();
  private readonly createBackend: (target: WslTarget) => WslIdentityBackend;
  private readonly ttlMs: number;
  private readonly clock: () => number;

  public constructor(options: CanonicalWslTargetResolverOptions) {
    this.createBackend = options.createBackend ?? ((target) => new WSLBackend(target));
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs ?? DEFAULT_RESOLUTION_TTL_MS));
    this.clock = options.now ?? Date.now;
  }

  public resolve(target: WslTarget): Promise<WslTarget> {
    const key = provisionalKey(target);
    const current = this.entries.get(key);
    const now = this.clock;
    if (current && current.expiresAt > now()) return current.promise;
    const entry: CachedResolution = {
      expiresAt: now() + this.ttlMs,
      promise: Promise.resolve().then(async () => {
        const createBackend = this.createBackend;
        const backend = createBackend(target);
        try {
          const identity = await backend.resolveIdentity();
          return { kind: "wsl" as const, distro: identity.distro, user: identity.user };
        } finally {
          backend.dispose();
        }
      }),
    };
    this.entries.set(key, entry);
    void entry.promise.catch(() => {
      // 旧的过期请求不能退休后来安装的同 key owner，否则重试会绕过正在解析的连接。
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.promise;
  }
}

function createCanonicalWslTargetResolver(
  options: CanonicalWslTargetResolverOptions = {},
): (target: WslTarget) => Promise<WslTarget> {
  const cache = new WslResolutionCache(options);
  return (target) => cache.resolve(target);
}

export const resolveCanonicalWslTarget = createCanonicalWslTargetResolver();
