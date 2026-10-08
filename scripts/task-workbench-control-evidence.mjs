// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";

/** GUI commands must target the original Host's own accepted interaction and run. */
export async function captureWorkbenchControlTargets(host) {
  const target = (text) =>
    host.commands.find((command) => command.type === "send" && command.text === text).targetId;
  const firstTarget = target("task alpha");
  const secondTarget = target("task beta");
  const firstTimeline = await host.request("a", "timeline", [firstTarget]);
  const secondTimeline = await host.request("a", "timeline", [secondTarget]);
  const approval = firstTimeline.interactions.find((item) => item.status === "pending");
  const secondRun = secondTimeline.runs.find((item) => ["running", "waiting"].includes(item.state));
  assert.ok(approval);
  assert.ok(secondRun);
  assert.notEqual(secondRun.id, firstTimeline.runs[0].id);
  return { firstTarget, secondTarget, interactionId: approval.id, runId: secondRun.id };
}

export async function assertWorkbenchControlTargets(host, expected) {
  const answer = host.commands.find((command) => command.type === "answer");
  const cancel = host.commands.find((command) => command.type === "cancel");
  assert.equal(answer.host, "a");
  assert.equal(answer.interactionId, expected.interactionId);
  assert.equal(cancel.host, "a");
  assert.equal(cancel.runId, expected.runId);
  assert.equal(
    (await host.request("a", "timeline", [expected.firstTarget])).runs[0].state,
    "succeeded",
  );
  // 合成内核的等待被中断后没有可靠结果；Stop 不得伪造已知 cancelled。
  const stopped = (await host.request("a", "timeline", [expected.secondTarget])).runs[0];
  assert.equal(stopped.cancelRequested, true);
  assert.equal(stopped.state, "interrupted");
  assert.equal(stopped.resultKnown, false);
}

export async function verifyWorkbenchNativeDraftOwner(page) {
  await page.evaluate(() => window.workbenchFixture.setProbe(true));
  await page.getByRole("textbox", { name: "Native draft a" }).fill("native draft A");
  await page.getByRole("textbox", { name: "Native draft b" }).fill("native draft B");
  await page.evaluate(() => window.workbenchFixture.setProbe(false));
  await page.getByTestId("native-draft-a").waitFor({ state: "detached" });
  await page.evaluate(() => window.workbenchFixture.setProbe(true));
  assert.equal(
    await page.getByRole("textbox", { name: "Native draft a" }).inputValue(),
    "native draft A",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Native draft b" }).inputValue(),
    "native draft B",
  );
  await page.getByRole("button", { name: "Accept a", exact: true }).click();
  const scopes = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("knorvia-v4-composer-drafts:v1:%2Ftest%2Fproject")).scopes,
  );
  assert.equal(scopes["accepted-a"].text, "native draft A");
  assert.equal(scopes["workbench:a"], undefined);
  assert.equal(scopes["workbench:b"].text, "native draft B");
  return "native V4 draft owner keeps two tile scopes separate across remount and promotes only the accepted tile";
}
