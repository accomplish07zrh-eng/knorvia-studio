import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Product state only: explicit user paths containing ~ still refer to the real OS home. */
export function resolveKnorviaDataRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const base = env.KNORVIA_DATA_BASE_DIR?.trim();
  if (base) return join(resolve(base), ".knorvia-studio");
  const root = env.KNORVIA_HOME?.trim();
  if (root) return resolve(root);
  return join(homedir(), ".knorvia-studio");
}
