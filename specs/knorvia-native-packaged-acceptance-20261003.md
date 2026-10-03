# Native packaging acceptance in the cloud environment

Continue the same native task and `rewrite/native-20261003` branch from main
`59517d9699519b0a7a44980da27df29d45f0e91e`, retaining the already preserved source
evidence. The current goal is package/install and native integration acceptance;
the user now authorizes the builds and relevant smoke tests needed for that goal.
The application keeps Apache-2.0 and ordinary component notices. Do not resume
the MIT-specific source audit or change licensing decisions.

## Owners and scope

The existing desktop runtime preparation, production build, Electron Builder
configuration, native package policy and release helpers remain authoritative.
Use Node24.14.0 and pnpm10.33.2 with frozen dependencies. Repair disposable cloud
dependency installation before classifying a missing workspace link as a source
bug. Build from current source and record the exact input commit, commands,
platform, outputs and hashes; successful packaging is distinct from repeat-build
byte identity and from installation/runtime acceptance.

The current environment is Linux x64. Its configured Linux package targets may
be exercised here. The official Windows x64 NSIS/portable release and Windows
CUA runtime need a genuine supported Windows environment; Linux results cannot
close those checks. Retain failed commands and platform/tooling limitations.
Do not publish a release, merge main, alter root configuration/CI/contracts or
change product/UI/data behavior to make a check pass.

UI owns GUI flow tests. This lane checks package structure, target native assets,
retained notices, extraction/install staging and native transport/runtime behavior.
Use existing packaged/distribution smoke where its platform contract applies.
Any additional probe must call the existing packaged identity and native policy
owners rather than implement duplicate acceptance rules. It must measure a
complete physical artifact outside the repository, never a symlink back into
source or development node_modules.

## Data and process isolation

All staging, output, tool caches, installation destinations and synthetic profiles
belong to this task under `/tmp` or disposable workspace outputs. Use explicit
Knorvia data/config overrides and empty runtime module search overrides for
artifact processes. Do not repurpose the user's HOME, use user credentials,
contact model providers, operate the user's computer or drive the GUI flows owned
by the UI task. Tests must own and terminate their child processes; forced cleanup
does not count as successful shutdown.

## Acceptance and handoff

1. Fetch and confirm that the exact main input is present on this same branch.
2. Install frozen dependency inputs and run the supported source-to-package build.
3. Verify actual outputs, architecture/native boundaries and packaged asset paths,
   then run applicable existing isolated smoke. Record failures without treating
   unexecuted stages as passed.
4. Fix confirmed bugs only within native-owned paths after updating this spec and
   reading the architecture context. Report shared/root/other-lane requirements
   to the integrator instead of modifying their exclusive files.
5. Preserve bounded evidence on the same branch, commit/push and confirm the remote
   SHA. Create a draft PR for native source fixes if any. Explicitly hand off
   Windows installer, portable, CUA and GUI acceptance that was not executed here.

The user's later recognition of the four SVG preview types as “这种不是我们的”
supersedes the earlier unmatched creator statement for those assets. The integrator
owns that provenance decision; this packaging work does not relabel or replace them.

## Confirmed build findings and retry correction

The configured Linux bundle reached ASAR/native checks and generated an AppImage,
then failed FPM metadata validation because homepage and release-maintainer metadata
are absent. Do not invent a public maintenance email; hand this metadata requirement
to the integrator. The independent distribution build also reached current CLI,
server and Web outputs, then its CLI-owned SEA collector rejected `@knorvia/cua`
for missing `dist/index.js`. CUA currently has explicit package-root JS exports and
no build script. Preserve that public layout and report the collector assumption to
its owner rather than manufacturing a fake dist or changing CUA interfaces.

The native-owned bundle retry classifier mistakes an earlier successful builder
asset download URL for transient failure evidence, replaying the whole packaging
attempt after FPM metadata failure. Keep a single classifier and the existing
three-attempt limit, mirror fallback and command/target sequence. Retry requires
an explicit network-failure signal; a normal asset URL/name or generic helper
execution error is insufficient. A successful resource-download log followed by a
configuration or missing-tool failure must fail immediately. Connection reset,
timeout and truncated network responses retain their bounded retry behavior.
Regression fixtures exercise these observed log sequences without starting any
builder, downloading resources or changing product behavior.
