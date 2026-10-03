// Separate current pins and scope. Historical metadata is imported, never updated.
import {
  SCOPE as HISTORICAL_SCOPE,
  MATRIX_PATH as HISTORICAL_MATRIX_PATH,
  PRODUCTION_COMMIT as HISTORICAL_PRODUCTION_COMMIT,
  REFERENCE_PATHS,
  INTEGRATED_COMMIT,
  IMPORTED_COMMIT,
} from "./services-lane-scope-fast-20261001.mjs";
export { HISTORICAL_SCOPE, HISTORICAL_MATRIX_PATH, HISTORICAL_PRODUCTION_COMMIT };
export const SNAPSHOT_COMMIT = "fd710013b4ff69d4aca4f481b27dfb7d29fb5fe1";
export const CORRECTION_COMMIT = "cf6965cdd2916ec84c2f6588de20b802ff50c279";
export const FREEZE_COMMIT = "90ec127428820e58e8e39fb3289a059446d3539d";
export const HISTORICAL_CHECKPOINT = "91d15b8108509da59358d8308941c63364cad8eb";
export const HISTORICAL_PAYLOAD =
  "f41aed85af717561417aceaa6d8ee9f05084bb1d63bbf6834e423fdef002035e";
export const MATRIX_PATH =
  "docs/knorvia-services-contribution-current-fast-candidate-20261001.json";
export const OWNER_PATH = "packages/services/src/terminal/terminalServiceInstanceOwner.ts";
export const LEGACY_TEST_PATH =
  "packages/services/test/terminal-lifecycle-corrective-fast-20261001.test.ts";
export const RECEIPT_PATH = "docs/knorvia-terminal-lifecycle-monitor-fast-handoff-20261001.md";
export const ADDED_SCOPE = [
  ["packages/services/test/terminal-lifecycle-monitor-fast-20261001.test.ts", "test"],
  ["packages/services/test/terminal-lifecycle-monitor-rpc-fast-20261001.test.ts", "test"],
  ["packages/services/test/terminal-lifecycle-monitor-ports-fast-20261001.ts", "test-support"],
  ["specs/knorvia-terminal-lifecycle-monitor-fast-20261001.md", "spec"],
  [RECEIPT_PATH, "receipt"],
].map(([path, role]) => ({ path, role, group: "terminal-runtime" }));
export const SCOPE = [...HISTORICAL_SCOPE, ...ADDED_SCOPE].sort((a, b) =>
  a.path.localeCompare(b.path),
);
export const UPDATED_PATHS = [
  OWNER_PATH,
  LEGACY_TEST_PATH,
  ...ADDED_SCOPE.map((entry) => entry.path),
].sort();
export const PROTECTED_PATHS = HISTORICAL_SCOPE.filter(
  (entry) => ["production", "retained-context"].includes(entry.role) && entry.path !== OWNER_PATH,
)
  .map((entry) => entry.path)
  .sort();
export const HISTORY_PATHS = [
  HISTORICAL_MATRIX_PATH,
  "scripts/provenance/services-lane-fast-20261001.mjs",
  "scripts/provenance/services-lane-scope-fast-20261001.mjs",
  "scripts/provenance/services-lane-fast-20261001.test.mjs",
].sort();
export const LOCAL_REFERENCES = [
  {
    id: "historical-owner",
    origin: "historical",
    commit: HISTORICAL_PRODUCTION_COMMIT,
    path: OWNER_PATH,
  },
  {
    id: "historical-legacy-test",
    origin: "historical",
    commit: HISTORICAL_PRODUCTION_COMMIT,
    path: LEGACY_TEST_PATH,
  },
  {
    id: "historical-fixture",
    origin: "historical",
    commit: HISTORICAL_PRODUCTION_COMMIT,
    path: "packages/services/test/terminal-lifecycle-fixture-fast-20261001.ts",
  },
  {
    id: "monitor-freeze-spec",
    origin: "freeze",
    commit: FREEZE_COMMIT,
    path: "specs/knorvia-terminal-lifecycle-monitor-fast-20261001.md",
  },
];
export const REFERENCE_IDENTITIES = [
  ...["publisher", "integrated", "imported"].flatMap((origin) =>
    REFERENCE_PATHS.map((path) => `${origin}:${path}`),
  ),
  ...LOCAL_REFERENCES.map((entry) => entry.id),
].sort();
export const LOCAL_PINS = [INTEGRATED_COMMIT, IMPORTED_COMMIT];
export const PROTECTED_METHODS = [
  "count",
  "assertCreating",
  "prepare",
  "publish",
  "fail",
  "write",
  "resize",
  "dataEvent",
  "exitEvent",
  "dispose",
  "disposeAll",
  "lookup",
  "nativeExit",
  "stop",
  "cleanEmitter",
  "settle",
  "refreshDiagnostics",
];
export const NEW_EXPRESSIONS = {
  "subscription-role": 'type SubscriptionKind = "data" | "exit";',
  "tagged-storage": "readonly subscriptions: Map<IDisposable, SubscriptionKind>;",
  "tagged-initialization": "subscriptions: new Map(),",
  "data-role": '"data",',
  "exit-role": '"exit",',
  "role-parameter": "kind: SubscriptionKind,",
  "tagged-retention": "entry.subscriptions.set(subscription, kind);",
  "cleanup-iteration": "for (const [subscription, kind] of subscriptions)",
  "monitor-eligibility": 'if (kind === "exit" && entry.pty && !entry.exited) continue;',
};
export const INSTALLED_PATHS = [
  "node_modules/node-pty/package.json",
  "node_modules/node-pty/lib/windowsPtyAgent.js",
  "node_modules/node-pty/src/win/winpty.cc",
];
export const APPENDIX_COMMIT = "fdbce31586016445bb02f3d7a697cd0a3a103811";
export const APPENDIX_SCOPE = [
  ["packages/services/test/terminal-lifecycle-monitor-retry-order-fast-20261001.test.ts", "test"],
  ["specs/knorvia-terminal-lifecycle-monitor-retry-order-fast-20261001.md", "spec"],
].map(([path, role]) => ({ path, role, group: "terminal-runtime" }));
export const APPENDIX_REFERENCES = [
  {
    id: "monitor-current-ports",
    origin: "monitor",
    commit: SNAPSHOT_COMMIT,
    path: "packages/services/test/terminal-lifecycle-monitor-ports-fast-20261001.ts",
  },
  {
    id: "monitor-current-tests",
    origin: "monitor",
    commit: SNAPSHOT_COMMIT,
    path: "packages/services/test/terminal-lifecycle-monitor-fast-20261001.test.ts",
  },
];
export const ALL_REFERENCE_IDENTITIES = [
  ...REFERENCE_IDENTITIES,
  ...APPENDIX_REFERENCES.map((entry) => entry.id),
].sort();
export const RED_RECEIPT_EXPRESSION =
  "**two files, 20 individual cases: 16 failed, four controls passed, zero skipped/cancelled**.";
