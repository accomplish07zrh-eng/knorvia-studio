import { randomUUID } from "node:crypto";
import { posix } from "node:path";

import type { IRemoteBackend, StdioStream } from "@knorvia/server/remote/backend.js";
import { REMOTE_BASE } from "@knorvia/server/remote/deployShared.js";
import { quotePosixPathArg, quotePosixShellArg } from "@knorvia/server/remote/posixShell.js";

export interface RemoteDeployLockHandle {
  ownerToken: string;
  release(): Promise<void>;
}

export interface AcquireRemoteDeployLockOptions {
  lockDir?: string;
  ownerToken?: string;
  acquireTimeoutMs?: number;
  releaseTimeoutMs?: number;
}

function observeClose(stream: StdioStream): {
  promise: Promise<number>;
  dispose(): void;
} {
  let subscription: { dispose(): void } | undefined;
  const promise = new Promise<number>((resolve) => {
    subscription = stream.onClose(resolve);
  });
  return {
    promise,
    dispose() {
      subscription?.dispose();
    },
  };
}

function destroyOwnedStreams(stream: StdioStream): void {
  for (const name of ["stdin", "stdout", "stderr"] as const) {
    const owned = stream[name];
    try {
      (owned as typeof owned & { destroy?: () => unknown }).destroy?.();
    } catch {
      // 每条流独立清理；某条流抛错不能阻止其余自有流的销毁。
    }
  }
}

function diagnosticsSuffix(stderrText: string): string {
  const detail = stderrText.trim();
  return detail ? `: ${detail}` : "";
}

function holderCommand(
  lockDir: string,
  ownerToken: string,
  acquiredMarker: string,
  releaseMarker: string,
): string {
  const holderPath = `${lockDir}.holder-${ownerToken}.sh`;
  const script = `set -eu
lock_dir=${quotePosixPathArg(lockDir)}
owner_token=${quotePosixShellArg(ownerToken)}
owner_file="$lock_dir/owner"
stale_dir="$lock_dir.stale-$owner_token"
mkdir -p ${quotePosixPathArg(posix.dirname(lockDir))}
while ! mkdir "$lock_dir" 2>/dev/null; do
  modified=$(stat -c %Y "$owner_file" 2>/dev/null || stat -f %m "$owner_file" 2>/dev/null || stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || printf '0')
  now=$(date +%s)
  if [ "$modified" -gt 0 ] && [ "$((now - modified))" -ge 600 ]; then
    if command mv "$lock_dir" "$stale_dir" 2>/dev/null; then
      rm -rf "$stale_dir"
    fi
    continue
  fi
  sleep 1
done
printf '%s' ${quotePosixShellArg(ownerToken)} > "$owner_file"
heartbeat_pid=''
cleanup() {
  if [ -n "$heartbeat_pid" ]; then
    kill "$heartbeat_pid" >/dev/null 2>&1 || true
    wait "$heartbeat_pid" 2>/dev/null || true
  fi
  current_owner=$(cat "$owner_file" 2>/dev/null || true)
  if [ "$current_owner" = "$owner_token" ]; then
    rm -rf "$lock_dir"
  fi
}
trap cleanup EXIT HUP INT TERM
(
  while [ "$(cat "$owner_file" 2>/dev/null || true)" = "$owner_token" ]; do
    touch "$owner_file" 2>/dev/null || exit 0
    sleep 30
  done
) &
heartbeat_pid=$!
printf '%s\\n' ${quotePosixShellArg(acquiredMarker)}
release_line=''
IFS= read -r release_line || true
if [ "$release_line" != ${quotePosixShellArg(releaseMarker)} ]; then
  echo '[deploy-lock] invalid release marker' >&2
  exit 1
fi
`;
  const octalScript = Array.from(
    Buffer.from(script, "utf8"),
    (byte) => `\\${byte.toString(8).padStart(3, "0")}`,
  ).join("");
  const removeHolder = `rm -f ${quotePosixPathArg(holderPath)}`;
  return `set -eu
mkdir -p ${quotePosixPathArg(posix.dirname(holderPath))}
printf '%b' ${quotePosixShellArg(octalScript)} > ${quotePosixPathArg(holderPath)}
trap ${quotePosixShellArg(removeHolder)} EXIT HUP INT TERM
sh ${quotePosixPathArg(holderPath)}`;
}

export async function acquireRemoteDeployLock(
  backend: IRemoteBackend,
  options: AcquireRemoteDeployLockOptions = {},
): Promise<RemoteDeployLockHandle> {
  const ownerToken = options.ownerToken?.trim() || randomUUID();
  const lockDir = options.lockDir?.trim() || `${REMOTE_BASE}/.deploy.lock`;
  const acquireTimeoutMs = Math.max(1, Math.floor(options.acquireTimeoutMs ?? 120_000));
  const releaseTimeoutMs = Math.max(1, Math.floor(options.releaseTimeoutMs ?? 5_000));
  const acquiredMarker = `knorvia-deploy-lock-acquired:${ownerToken}`;
  const releaseMarker = `knorvia-deploy-lock-release:${ownerToken}`;
  const stream = await backend.exec(
    holderCommand(lockDir, ownerToken, acquiredMarker, releaseMarker),
  );
  const close = observeClose(stream);
  let stderrText = "";
  const onStderr = (chunk: Buffer | string): void => {
    stderrText = (stderrText + chunk.toString()).slice(-4096);
  };
  stream.stderr.on("data", onStderr);

  try {
    await new Promise<void>((resolve, reject) => {
      let stdoutText = "";
      let settled = false;
      const onStdout = (chunk: Buffer | string): void => {
        stdoutText = (stdoutText + chunk.toString()).slice(-4096);
        if (!settled && stdoutText.includes(acquiredMarker)) {
          settled = true;
          stream.stdout.off("data", onStdout);
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        stream.stdout.off("data", onStdout);
        clearTimeout(timer);
        destroyOwnedStreams(stream);
        reject(
          new Error(
            `[deploy-lock] lock acquisition timed out after ${acquireTimeoutMs}ms (owner=${ownerToken})${diagnosticsSuffix(stderrText)}`,
          ),
        );
      }, acquireTimeoutMs);
      stream.stdout.on("data", onStdout);
      close.promise.then((code) => {
        if (settled) return;
        settled = true;
        stream.stdout.off("data", onStdout);
        clearTimeout(timer);
        reject(
          new Error(
            `[deploy-lock] lock-holder exited before acquisition (code=${code})${diagnosticsSuffix(stderrText)}`,
          ),
        );
      });
    });
  } catch (error) {
    stream.stderr.off("data", onStderr);
    close.dispose();
    throw error;
  }

  let releasePromise: Promise<void> | undefined;
  return {
    ownerToken,
    release(): Promise<void> {
      if (!releasePromise) {
        releasePromise = (async () => {
          try {
            stream.stdin.write(`${releaseMarker}\n`);
            stream.stdin.end();
            const timeoutError = new Error(
              `[deploy-lock] lock-holder release timed out after ${releaseTimeoutMs}ms (owner=${ownerToken})${diagnosticsSuffix(stderrText)}`,
            );
            let timer: ReturnType<typeof setTimeout> | undefined;
            let code: number;
            try {
              const timeout = new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(timeoutError), releaseTimeoutMs);
              });
              code = await Promise.race([close.promise, timeout]);
            } catch (error) {
              if (error === timeoutError) destroyOwnedStreams(stream);
              throw error;
            } finally {
              clearTimeout(timer);
            }
            if (code !== 0) {
              throw new Error(
                `[deploy-lock] lock-holder release failed (code=${code})${diagnosticsSuffix(stderrText)}`,
              );
            }
          } finally {
            stream.stderr.off("data", onStderr);
            close.dispose();
          }
        })();
      }
      return releasePromise;
    },
  };
}
