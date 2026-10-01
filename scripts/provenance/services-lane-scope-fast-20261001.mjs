// Fixed candidate scope/pins only; no license grant or mutable accepted state.
export const PRODUCTION_COMMIT = "07709cddb68c1bc504d3c72707048d979a43a7f2";
export const INTEGRATED_COMMIT = "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146";
export const IMPORTED_COMMIT = "7619e41b950bd52073ebf36754146cf25659d9fa";
export const PUBLISHER_TREE = "d185a9a893c00d51fc3fe51fe7371b9eea7de143";
export const MATRIX_PATH = "docs/knorvia-services-contribution-fast-candidate-20261001.json";
export const GROUPS = [
  {
    id: "watcher",
    directory: "fileWatcher",
    production: ["fileWatcher", "fileWatcherBatch", "fileWatcherRuntime", "fileWatcherService"],
    tests: ["file-watcher-contract", "file-watcher-ports", "file-watcher-native"],
    support: ["file-watcher-emitted-register.mjs"],
    specs: ["file-watcher"],
    inherited: ["fileWatcher/fileWatcher.ts", "fileWatcher/fileWatcherService.ts"],
  },
  {
    id: "archive",
    directory: "feedback",
    production: [
      "feedbackLogArchive",
      "feedbackArchiveCandidates",
      "feedbackArchivePolicy",
      "feedbackArchiveSnapshot",
    ],
    tests: [
      "feedback-archive-contract",
      "feedback-archive-io-contract",
      "feedback-archive-consumer",
    ],
    support: ["feedback-archive-fixtures.ts", "feedback-archive-emitted-register.mjs"],
    specs: ["feedback-archive"],
    inherited: ["feedback/feedbackLogArchive.ts"],
  },
  {
    id: "portable",
    directory: "terminal",
    production: [
      "terminalProfile",
      "terminalProfilePortablePlan",
      "terminalProfilePortableFormats",
      "terminalProfilePortableRead",
    ],
    tests: [
      "terminal-profile-portable-contract",
      "terminal-profile-portable-consumer",
      "terminal-profile-portable-native",
    ],
    support: ["terminal-profile-portable-emitted-register.mjs"],
    specs: ["terminal-profile-portable"],
    inherited: ["terminal/terminalProfile.ts", "terminal/terminalProfileTypes.ts"],
  },
  {
    id: "macos",
    directory: "terminal",
    production: ["terminalProfileMacOs", "terminalProfileMacOsDecode", "terminalProfileMacOsPlist"],
    tests: ["terminal-profile-macos-contract", "terminal-profile-macos-consumer"],
    support: [],
    specs: ["terminal-profile-macos"],
    inherited: ["terminal/terminalProfileMacOs.ts", "terminal/terminalProfileTypes.ts"],
  },
  {
    id: "terminal-runtime",
    directory: "terminal",
    production: ["terminalService", "terminalServiceLaunchPlan", "terminalServiceInstanceOwner"],
    tests: [
      "terminal-service-planning-consumer",
      "terminal-service-planning-helper-guard",
      "terminal-lifecycle-contract",
      "terminal-lifecycle-rpc",
      "terminal-lifecycle-corrective",
      "terminal-lifecycle-admission",
    ],
    support: ["terminal-lifecycle-fixture.ts"],
    specs: [
      "terminal-service-planning",
      "terminal-lifecycle",
      "terminal-lifecycle-corrective",
      "terminal-lifecycle-admission",
    ],
    inherited: [
      "terminal/terminalService.ts",
      "terminal/terminal.ts",
      "terminal/terminalProfileTypes.ts",
    ],
  },
];
export const sourcePath = (path) => `packages/services/src/${path}`;
export const REFERENCE_PATHS = [
  ...new Set(GROUPS.flatMap((group) => group.inherited.map(sourcePath))),
].sort();
export const SCOPE = GROUPS.flatMap((group) => [
  ...group.production.map((name) => ({
    path: sourcePath(`${group.directory}/${name}.ts`),
    group: group.id,
    role: "production",
  })),
  ...group.tests.map((name) => ({
    path: `packages/services/test/${name}-fast-20261001.test.ts`,
    group: group.id,
    role: "test",
  })),
  ...group.support.map((name) => {
    const dot = name.lastIndexOf(".");
    return {
      path: `packages/services/test/${name.slice(0, dot)}-fast-20261001${name.slice(dot)}`,
      group: group.id,
      role: "test-support",
    };
  }),
  ...group.specs.map((name) => ({
    path: `specs/knorvia-${name}-fast-20261001.md`,
    group: group.id,
    role: "spec",
  })),
])
  .concat(
    ["terminal/terminal.ts", "terminal/terminalProfileTypes.ts"].map((path) => ({
      path: sourcePath(path),
      group: "terminal-runtime",
      role: "retained-context",
    })),
  )
  .sort((a, b) => a.path.localeCompare(b.path));
export const INPUT_PATHS = [
  "LICENSE",
  "NOTICE.md",
  "package.json",
  "licensing/README.md",
  "licensing/upstream-baseline.json",
  "licensing/current-files.json",
  "licensing/reviews.json",
  "third-party/inventory.json",
  "scripts/provenance/model.mjs",
  "scripts/provenance/git.mjs",
  "scripts/provenance/third-party-audit.mjs",
].sort();
