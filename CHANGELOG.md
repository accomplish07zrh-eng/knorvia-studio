# Changelog

## 0.9.0 - 2026-10-07

- Workspace environments: review and approve setup and service commands for an
  existing Studio workspace, view its loopback preview address and assigned port,
  then stop or recover processes owned by that workspace. Setup and services use
  a selected OS environment without ambient provider credentials. Source files
  and unrelated listeners remain protected by the existing workspace rules.
- Durable handoff: save and edit the original goal, constraints, decisions,
  progress, failed attempts, remaining steps, acceptance criteria, uncertainties
  and project file references. Notes survive reload and partial history. The
  reviewed preview redacts credentials and omits hidden reasoning and raw tool
  payloads. Missing facts stay explicit; native and external handoffs retain
  their existing confirmation and retry paths.
- Studio agent tools: supported local Studio turns can discover configured
  kernels, dispatch and message owned child tasks, inspect status and complete
  results, request human permission, cancel tasks, and receive/acknowledge
  durable completion events. Caller ownership, provider capabilities, permission
  ceilings and bounded task/retry limits remain enforced. Duplicate commands
  and lost notification acknowledgements reuse persistent identities.

Existing composer preferences/drafts, session storage, profile locations and
workspace apply protections are preserved. Back up the normal profile or the
portable `data/` directory before upgrading; keep portable data beside the
replacement program. These checks do not establish migration of every historical
user profile.

Windows x64 and Linux x64 retain the existing installer and portable formats.
Artifacts remain unsigned. SSH agent-tool dispatch and Antigravity per-turn
agent-tool injection are unavailable and report their capability limitations.
Native Knorvia explicit model overrides require a verifiable model catalog.
Completion events are received through `get_events` and `ack_event`, with
deduplicated visibility in the Studio timeline. No mobile changes are included.

Release metadata records the exact checked source and bounded package acceptance.
No human installed-GUI, real paid-model, signing or complete legacy-profile
migration acceptance is claimed.
