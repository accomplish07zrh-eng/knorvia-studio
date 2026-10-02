import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SkillSyncImportResultItem } from "@knorvia/shared";
import { checkRemoteSyncDirectoryWriteAccess } from "../remote-sync/remoteSyncWriteAccess.js";
import type { ISkillSyncService } from "./skillSync.js";
import { createSkillSyncArchive, extractSkillSyncArchive } from "./skillSyncArchive.js";
import {
  collectExtractedSkillDirectories,
  commonUserSkillRoot,
  discoverUserSkillCandidates,
  normalizeSkillName,
  parseSkillMetadata,
  readSkillFileOrNull,
  readUserSkillNames,
} from "./skillSyncDiscovery.js";
import { createSkillSyncSizeLimitError } from "./skillSyncErrors.js";
import { normalizeSkillSyncRelativePath, resolveSkillSyncPathWithin } from "./skillSyncPath.js";

export function createSkillSyncService(options?: { maxArchiveBytes?: number }): ISkillSyncService {
  const maxArchiveBytes = options?.maxArchiveBytes ?? 20 * 1024 * 1024;

  async function importArchive(archive: Uint8Array) {
    const targetRoot = commonUserSkillRoot();
    await mkdir(targetRoot, { recursive: true });
    const tempRoot = join(targetRoot, `.sync-tmp-${randomUUID()}`);
    await mkdir(tempRoot, { recursive: true });

    try {
      await extractSkillSyncArchive(archive, tempRoot, { maxExtractedBytes: maxArchiveBytes });
      const directories = await collectExtractedSkillDirectories(tempRoot);
      const existingNames = await readUserSkillNames();
      const results: SkillSyncImportResultItem[] = [];

      for (const directoryName of directories) {
        const targetPath = resolveSkillSyncPathWithin(targetRoot, directoryName);
        const sourcePath = join(tempRoot, directoryName);
        const definition = await readSkillFileOrNull(join(sourcePath, "SKILL.md"));
        if (definition === null) {
          results.push({
            name: basename(directoryName),
            directoryName,
            status: "failed",
            error: "SKILL.md is missing",
          });
          continue;
        }

        const { name } = parseSkillMetadata(definition, directoryName);
        const nameKey = normalizeSkillName(name);
        if (existsSync(targetPath)) {
          results.push({ name, directoryName, status: "skipped", path: targetPath });
          continue;
        }
        const existingPath = existingNames.get(nameKey);
        if (existingPath !== undefined) {
          results.push({ name, directoryName, status: "skipped", path: existingPath });
          continue;
        }

        try {
          await mkdir(dirname(targetPath), { recursive: true });
          await cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });
          results.push({ name, directoryName, status: "synced", path: targetPath });
          existingNames.set(nameKey, targetPath);
        } catch (error) {
          results.push({
            name,
            directoryName,
            status: "failed",
            path: targetPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { results };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  return {
    async listLocalUserSkillCandidates() {
      return { candidates: await discoverUserSkillCandidates(), maxArchiveBytes };
    },

    async listRemoteUserSkillStatuses(params) {
      const targetRoot = commonUserSkillRoot();
      const existingNames = await readUserSkillNames();
      const directoryNames = params.directoryNames.map((name) =>
        normalizeSkillSyncRelativePath(name),
      );
      const requestedNames = new Map(
        (params.skills ?? []).map((skill) => [
          normalizeSkillSyncRelativePath(skill.directoryName),
          skill.name,
        ]),
      );
      const statuses = directoryNames.map((directoryName) => {
        const targetPath = resolveSkillSyncPathWithin(targetRoot, directoryName);
        if (existsSync(targetPath)) {
          return { directoryName, exists: true, path: targetPath };
        }
        const requestedName = requestedNames.get(directoryName);
        const existingPath = requestedName
          ? existingNames.get(normalizeSkillName(requestedName))
          : undefined;
        return existingPath === undefined
          ? { directoryName, exists: false }
          : { directoryName, exists: true, path: existingPath };
      });
      return { statuses };
    },

    async exportSkillsArchive(params) {
      const candidates = await discoverUserSkillCandidates();
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const selected = params.skillIds.map((id) => {
        const candidate = candidateById.get(id);
        if (!candidate) throw new Error(`skill sync candidate not found: ${id}`);
        return candidate;
      });
      const entries = await Promise.all(
        selected.map(async (candidate) => ({
          sourcePath: await realpath(dirname(candidate.path)),
          archivePath: candidate.directoryName,
        })),
      );
      const selectedBytes = selected.reduce((total, candidate) => total + candidate.sizeBytes, 0);
      if (selectedBytes > maxArchiveBytes) {
        throw createSkillSyncSizeLimitError({
          actualBytes: selectedBytes,
          maxBytes: maxArchiveBytes,
          phase: "selected-content",
        });
      }
      const archive = await createSkillSyncArchive(entries);
      if (archive.byteLength > maxArchiveBytes) {
        throw createSkillSyncSizeLimitError({
          actualBytes: archive.byteLength,
          maxBytes: maxArchiveBytes,
          phase: "archive",
        });
      }
      return {
        archive,
        archiveBytes: archive.byteLength,
        skills: selected.map(({ id, name, directoryName }) => ({ id, name, directoryName })),
      };
    },

    async checkRemoteUserSkillWriteAccess() {
      return checkRemoteSyncDirectoryWriteAccess(commonUserSkillRoot());
    },

    async importSkillsArchive(params) {
      if (params.overwrite) throw new Error("skill sync overwrite is not supported");
      if (params.archive.byteLength > maxArchiveBytes) {
        throw createSkillSyncSizeLimitError({
          actualBytes: params.archive.byteLength,
          maxBytes: maxArchiveBytes,
          phase: "archive",
        });
      }
      return importArchive(params.archive);
    },
  };
}
