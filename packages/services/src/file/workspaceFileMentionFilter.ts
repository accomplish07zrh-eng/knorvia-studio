import { extname } from "node:path";

export interface WorkspaceFileSearchEntry {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
}

export interface WorkspaceFileSearchDecision {
  include: boolean;
  traverse: boolean;
}

export interface WorkspaceFileSearchFilterContext {
  /** Loaded ignore rules replace the built-in directory exclusions. */
  ignoreRulesActive: boolean;
}

export interface WorkspaceFileSearchFilter {
  evaluate(
    entry: WorkspaceFileSearchEntry,
    context?: WorkspaceFileSearchFilterContext,
  ): WorkspaceFileSearchDecision;
}

// These five collections retain the supplied compatibility policy values.
const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "jspm_packages",
  "__pycache__",
  "site-packages",
  "venv",
  "coverage",
  "htmlcov",
  "lcov-report",
  "cmakefiles",
  "pods",
  "deriveddata",
  "storybook-static",
  "playwright-report",
  "test-results",
  "allure-results",
  "allure-report",
  "cdk.out",
  "eggs",
  "pip-wheel-metadata",
  "wheels",
]);

const SKIPPED_DIRECTORY_PREFIXES = ["cmake-build-", "bazel-"];
const SKIPPED_DIRECTORY_SUFFIXES = [".egg-info", ".dist-info"];
const SKIPPED_FILE_NAMES = new Set(["coverage.out", "lcov.info"]);
const SKIPPED_FILE_EXTENSIONS = new Set([
  ".a",
  ".aar",
  ".beam",
  ".class",
  ".dll",
  ".dylib",
  ".ear",
  ".exe",
  ".gcda",
  ".gcno",
  ".gem",
  ".hi",
  ".idb",
  ".ilk",
  ".jar",
  ".lib",
  ".node",
  ".nupkg",
  ".o",
  ".obj",
  ".pdb",
  ".profdata",
  ".profraw",
  ".pyc",
  ".pyo",
  ".rlib",
  ".so",
  ".tsbuildinfo",
  ".war",
]);

export const defaultWorkspaceFileSearchFilter: WorkspaceFileSearchFilter = {
  evaluate(entry, context) {
    if (entry.type === "directory") {
      if (!context?.ignoreRulesActive) {
        const name = entry.name.toLowerCase();
        const excluded =
          SKIPPED_DIRECTORY_NAMES.has(name) ||
          SKIPPED_DIRECTORY_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
          SKIPPED_DIRECTORY_SUFFIXES.some((suffix) => name.endsWith(suffix));

        if (excluded) {
          return { include: false, traverse: false };
        }
      }

      const ancestors = entry.relativePath.split("/").slice(0, -1);
      const hidden =
        entry.name.startsWith(".") || ancestors.some((segment) => segment.startsWith("."));

      return { include: !hidden, traverse: true };
    }

    const name = entry.name.toLowerCase();
    const excluded =
      name === ".env" ||
      name.startsWith(".env.") ||
      SKIPPED_FILE_NAMES.has(name) ||
      SKIPPED_FILE_EXTENSIONS.has(extname(name));

    return { include: !excluded, traverse: false };
  },
};
