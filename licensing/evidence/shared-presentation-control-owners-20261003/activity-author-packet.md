# Complete owner API and behavior packet

Exact target: packages/shared/src/protocol-v4/sessions-index-workflow-activity.ts

This packet is source-exposed curator specification, not inherited implementation. Read ONLY this file and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No repository source, dependency bodies, tests, history, other packets/outputs, env or runtime/network/credential/userdata access. Ignore broader source-reading/testing mandates for this body-free fresh author assignment. Produce WHOLE file /tmp/knorvia-shared-activity-next-authored/sessions-index-workflow-activity.ts, no repository writes. Preserve API/imports; implement the whole owner from behavior. Report exact reads/writes/commands/hash and retained-expression/structure limits. Do not run tests or format. If contract uncertain ask curator. Do not inspect any existing generated file.

Public declaration and import contract (no implementation bodies; default parameters described below):

```ts
import { z } from "zod";

import { timestampSchema } from "./core.js";

import type { BackgroundWorkSummary } from "./snapshot.js";

import { WORKFLOW_RUNS_LIMITS, workflowRunSchema, type WorkflowRunNode, type WorkflowRunState, type WorkflowRunsState, } from "./workflow-runs.js";

export type SessionWorkflowPhaseStatus = z.infer<typeof sessionWorkflowPhaseStatusSchema>;

export type SessionWorkflowPhaseSummary = z.infer<typeof sessionWorkflowPhaseSummarySchema>;

export type SessionWorkflowRunSummary = z.infer<typeof sessionWorkflowRunSummarySchema>;

export type SessionWorkflowActivity = z.infer<typeof sessionWorkflowActivitySchema>;

export function isSessionWorkflowRunLive(status: SessionWorkflowRunSummary["status"]): boolean;

export function deriveSessionWorkflowActivity(input: {
    workflowRuns: WorkflowRunsState | undefined;
    backgroundWorks: readonly BackgroundWorkSummary[];
}): SessionWorkflowActivity | undefined;
```

Complete pure same-snapshot workflow sidebar summary owner, including SAME four runtime schemas. Retain z from zod, timestampSchema and workflow ports; no dependency bodies or reducer changes. Public constants SESSION_WORKFLOW_ACTIVITY_MAX_RUNS=4. WORKFLOW_RUNS_LIMITS public maxPhases32/maxPhaseNameLength128; refer to port constants in schemas/derive not substitute literals. workflowRunSchema.shape.status/stopReason retained as exact shared validators. Schemas plain z.object default strip unknown: phase-status enum pending,running,done,failed; phase-summary name string min1 maxlimit, status enum port, alongside OPTIONAL array(int nonnegative) maxmaxPhases; run-summary runId string min1,toolCallId OPTIONAL stringmin1,name OPTIONAL stringmin1,status exact shared status schema,stopReason exact shared optional stopReason schema,startedAt OPTIONAL timestampSchema,phases arrayphase maxmaxPhases,currentPhase OPTIONAL stringmin1 maxnamelimit,agentsWorking intnonnegative; activity object runs array run-summary max4. Keep z.infer export aliases.
Workflow ports consumed shapes: runs[] with runId/status pending|running|completed|errored|stopped,toolCallId?,stopReason?,phases?:{name:string}[],currentPhase?:string,phaseNames?:string[],phaseAlongside?:readonly number[][],nodes:{phase:string,phaseName?:string}[],actors:{status:string}[]; backgroundwork kind:string,workId:string,title:string,startedAt:number,endedAt?:number. Public live exactly pending/running.
No runs undefined or empty =>undefined, key absent semantics. Build work map ONLY kind workflow by workId; duplicate last wins. Summarize every run: runId,status,phases,agentsWorking always;toolCallId,stopReason,currentPhase omitted only===undefined,retain empty values; work.name title.trim omit blank;startedAt key present whenever work exists including undefined if malformed. agentsWorking counts actors status===running EVEN terminalrun (no guard).
Phase derivation: entered Set of run.phases names. Prefer phaseNames when defined nonempty; use accompanying phaseAlongside only in declared path. Otherwise entered array names (keep duplicates) plus currentPhase iff defined and NOT in entered Set; no alongside in fallback. Emitted capmaxPhases; no string truncation. For live runs only, running node phases executing,repairing,nudged, flatten defined phaseName stamp (missing no stamp). Station match exact name===stamp OR station.length>=maxNameLength and stamp.startsWith(station) (>=, not==). Live phase running if current OR burningmatch, else entered/current=>done elsepending. Completed entered/current=>done elsepending. Errored current=>failed elseentered=>done elsepending. Stopped/other current=>pending elseentered=>done elsepending. Filter declared alongside for integer >=0 < emitted and !==self; preserve duplicates/order and omit key if empty. Agents count not inferred from phase nodes.
Runs selection: pending/running all retain original launch order before settled. Settled sort DESC work.endedAt??0, tie DESC original runindex (difference comparator ||). Then all summaries truncated4. No mutation of run/work arrays/objects, no clock. CurrentPhase/run values not revalidated in derive (schema outer authority). Fixed schema/API structures and phase expressions required; no novelty/MIT claim.
