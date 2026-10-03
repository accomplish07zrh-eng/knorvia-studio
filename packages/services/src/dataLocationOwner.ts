import { lstatSync } from "node:fs";
import { cp } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const capturedDataBase = process.env.KNORVIA_DATA_BASE_DIR?.trim() || null;
const capturedAppRoot = process.env.KNORVIA_HOME?.trim() || null;
const capturedDefaultBase = process.env.HOME?.trim() || homedir();
let dataBaseOverride: string | null = null;

export function setDataBaseDir(dir: string | null): void {
  dataBaseOverride = dir?.trim() || null;
}

export function getDataBaseDir(): string {
  return dataBaseOverride || capturedDataBase || capturedDefaultBase;
}

export function getKnorviaDataRootDir(): string {
  if (!dataBaseOverride && !capturedDataBase && capturedAppRoot) {
    return capturedAppRoot;
  }
  return join(getDataBaseDir(), ".knorvia-studio");
}

function includeCopySource(source: string): boolean {
  const name = basename(source);
  if (name === "setting.json" || name.startsWith("setting.json.")) {
    return false;
  }
  try {
    if (lstatSync(source).isSymbolicLink()) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

export async function copyDataDirectory(oldBaseDir: string, newBaseDir: string): Promise<void> {
  const oldDir = join(oldBaseDir, ".knorvia-studio", "v2");
  const newDir = join(newBaseDir, ".knorvia-studio", "v2");
  await cp(oldDir, newDir, {
    recursive: true,
    force: false,
    filter: includeCopySource,
  });
}
