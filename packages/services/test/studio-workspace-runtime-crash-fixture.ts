// SPDX-License-Identifier: Apache-2.0
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioWorkspaceRuntime } from "../src/studio-runtime/app/workspaceRuntime.js";
import { createWorkspaceRuntimePort } from "../src/studio-runtime/adapters/workspaceRuntimeProcess.js";
import { runtimeClock, runtimeHost, serverCommand } from "./studio-workspace-runtime-fixture.js";

const db = new StudioDatabase(process.argv[2]!);
const owner = new StudioWorkspaceRuntime({
  db,
  clock: runtimeClock,
  host: runtimeHost,
  io: createWorkspaceRuntimePort(),
  changed() {},
});
const params = { runId: "restart", stepId: "step" };
await owner.request({ ...params, control: { action: "prepare", approved: true } });
while ((await owner.request(params)).phase !== "prepared") await runtimeClock.delay(10);
await owner.request({
  ...params,
  control: { action: "start", approved: true, command: serverCommand, timeoutMs: 5000 },
});
while (true) {
  const state = await owner.request(params);
  if (state.phase === "ready") {
    process.stdout.write(JSON.stringify(state) + "\n");
    // Deliberate Host loss; detached service remains for the recovery test.
    db.close();
    process.exit(0);
  }
  if (state.phase === "failed") throw new Error(JSON.stringify(state));
  await runtimeClock.delay(10);
}
