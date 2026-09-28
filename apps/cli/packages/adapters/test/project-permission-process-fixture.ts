// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { spawn } from "node:child_process";
import { diskPermissions } from "./project-permission-fixture.js";

export function permissionWriter(
  fixture: Awaited<ReturnType<typeof diskPermissions>>,
  body: string,
) {
  const repository = new URL(
    "../src/storage/session-store/repositories/local-settings.ts",
    import.meta.url,
  ).href;
  const script = `
    import { DatabaseSync } from 'node:sqlite';
    import { updateProjectPermission } from ${JSON.stringify(repository)};
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA busy_timeout=5000');
    const projectID = 'permission-fixture';
    const signal = name => process.send(name);
    const receive = () => new Promise(resolve => process.once('message', resolve));
    const launch = receive(); signal('ready'); await launch;
    try { ${body} }
    catch (error) { console.error(error); process.exitCode=1; }
    finally { db.close(); process.disconnect(); }
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script, fixture.path],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let errors = "";
  child.stderr!.on("data", (chunk) => {
    errors += String(chunk);
  });
  const seen = new Set<string>();
  const waits = new Map<string, () => void>();
  child.on("message", (message) => {
    const label = String(message);
    seen.add(label);
    waits.get(label)?.();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  fixture.beforeCleanup(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited.catch(() => {});
  });
  return {
    send: (value: string) => child.send(value),
    exited,
    errors: () => errors,
    async wait(label: string) {
      if (seen.has(label)) return;
      await Promise.race([
        new Promise<void>((resolve) => waits.set(label, resolve)),
        exited.then((code) => {
          if (!seen.has(label))
            throw new Error(`Writer exited before ${label}: ${code}\n${errors}`);
        }),
      ]);
    },
  };
}
