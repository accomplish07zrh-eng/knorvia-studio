import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OWNED_DIRECTORY = /^turn-([1-9]\d*)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but this process cannot inspect it.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Remove only directories whose owning Host is confirmed dead. */
export async function recoverTemporaryMcpConfigs(
  dataDir: string,
  alive: (pid: number) => boolean = processAlive,
): Promise<number> {
  const root = join(dataDir, "shared-mcp");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    const match = entry.name.match(OWNED_DIRECTORY);
    if (!match || !entry.isDirectory()) continue;
    const pid = Number(match[1]);
    if (!Number.isSafeInteger(pid) || alive(pid)) continue;
    const path = join(root, entry.name);
    if (!(await lstat(path)).isDirectory()) continue;
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    removed++;
  }
  return removed;
}

/** The caller owns this directory until its turn finally settles. */
export async function writeTemporaryMcpConfig(dataDir: string, content: string): Promise<{
  directory: string;
  path: string;
}> {
  const root = join(dataDir, "shared-mcp");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = join(root, `turn-${process.pid}-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const path = join(directory, "mcp.json");
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { directory, path };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
