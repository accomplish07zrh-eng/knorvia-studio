import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packagedProbe, readJson } from "./studio-packaged-test-utils.mjs";
import {
  reviewFiles,
  groupName,
  reviewServer,
  seedReviewGroup,
  configureReviewProvider,
  readReviewRun,
  readAcceptances,
} from "./studio-workspace-review-fixture.mjs";

const probe = await packagedProbe("workspace-review", process.argv[2]);
const fixture = await reviewServer();
let failure;
async function findFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await findFiles(path) : [path]));
  }
  return files;
}
try {
  const project = join(probe.root, "project");
  await mkdir(project);
  await writeFile(join(project, "conflict.txt"), "baseline\n");
  let page = await probe.open();
  await configureReviewProvider(page, fixture.url);
  await probe.close();
  const settingPath = join(probe.dataRoot, ".knorvia-studio/v2/setting.json");
  const settings = await readJson(settingPath);
  settings.studioFirstRunGuideStatus = "complete";
  await writeFile(settingPath, JSON.stringify(settings));
  seedReviewGroup(probe.dataRoot, project);
  page = await probe.open();
  const openGroup = async () => {
    await page.getByTestId("studio-groups-open").click();
    await page.getByText(groupName, { exact: true }).first().click();
    await page.getByTestId("studio-group-composer").waitFor();
  };
  const openReview = async () => {
    const details = page.getByRole("button", { name: /群聊信息|Group details/ }).first();
    await details.click();
    // 用真实 details 控件展开运行，不通过改 DOM 伪造持久运行。
    const summaries = page.locator("details > summary");
    await summaries.first().waitFor();
    for (const summary of await summaries.all()) {
      if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click();
    }
    await page
      .locator('[id^="studio-run-step-"][id$="-group:round:0:task:t1"]')
      .getByRole("button", { name: /^(查看修改|Review changes)$/ })
      .click();
    await page.getByRole("button", { name: /^(重新读取修改|Reload changes)$/ }).waitFor();
  };
  await openGroup();
  const composer = page.getByTestId("studio-group-composer");
  await composer.fill("Prepare the three isolated file changes.");
  // 输入框可见早于首次 timeline 水合；使用真实可用的发送按钮，不能吞掉一个过早的 Enter。
  await page.locator('button[aria-describedby="studio-group-send-status"]').click();
  let approved = 0;
  const review = page.getByTestId("studio-group-review");
  for (let attempt = 0; attempt < 180 && !(await review.isVisible()); attempt++) {
    const allow = page
      .getByRole("button", { name: /^(允许这一次|Allow once|允许|Allow)$/ })
      .first();
    if (await allow.isVisible()) {
      await allow.click();
      approved++;
    }
    await page.waitForTimeout(500);
  }
  assert(approved > 0, "Tool calls must pass the visible permission gate");
  await review.waitFor({ timeout: 10_000 });
  let run = readReviewRun(probe.dataRoot);
  for (let attempt = 0; attempt < 40 && run?.state !== "succeeded"; attempt++) {
    await page.waitForTimeout(250);
    run = readReviewRun(probe.dataRoot);
  }
  assert.equal(run?.state, "succeeded", JSON.stringify(run));
  probe.result.runId = run.id;
  const files = await findFiles(join(probe.dataRoot, ".knorvia-studio/studio/workspaces"));
  for (const [name, body] of Object.entries(reviewFiles)) {
    const working = files.find((file) => file.endsWith(name) && /[\\/]working[\\/]/.test(file));
    assert(working, `Missing isolated file: ${name}`);
    assert.equal(await readFile(working, "utf8"), body);
  }
  assert.equal(await readFile(join(project, "conflict.txt"), "utf8"), "baseline\n");
  assert.deepEqual(await readdir(project), ["conflict.txt"]);
  probe.pass("经真实审批与运行时生成三个隔离修改，源项目未被写入");
  await writeFile(join(project, "conflict.txt"), "user change after isolation\n");
  await openReview();
  const conflict = page.getByRole("checkbox", { name: /^(选择|Select) conflict.txt$/ });
  await conflict.waitFor();
  assert(await conflict.isDisabled());
  await page.getByRole("button", { name: /全选可应用文件|Select applicable files/ }).click();
  for (const name of ["one.txt", "two.txt"])
    assert(
      await page.getByRole("checkbox", { name: new RegExp(`^(选择|Select) ${name}$`) }).isChecked(),
    );
  assert.equal(await conflict.isChecked(), false);
  await page.getByRole("button", { name: /应用所选（2）|Apply selected \(2\)/ }).click();
  // 审阅保留相对于隔离基线的历史差异；接纳成功以持久收据和项目字节为准。
  for (let attempt = 0; attempt < 80 && !readAcceptances(probe.dataRoot, run.id).length; attempt++)
    await page.waitForTimeout(250);
  for (const name of ["one.txt", "two.txt"])
    assert.equal(await readFile(join(project, name), "utf8"), reviewFiles[name]);
  assert.equal(
    await readFile(join(project, "conflict.txt"), "utf8"),
    "user change after isolation\n",
  );
  const acceptances = readAcceptances(probe.dataRoot, run.id);
  assert.equal(acceptances.length, 1);
  const acceptance = acceptances[0];
  assert.equal(acceptance.runId, run.id);
  assert.equal(acceptance.stepId, "group:round:0:task:t1");
  assert.deepEqual([...acceptance.paths].sort(), ["one.txt", "two.txt"]);
  assert.equal(acceptance.result, "accepted");
  assert.equal(acceptance.confirmation, "host-verified");
  assert.equal(acceptance.journalState, "complete");
  assert.equal(typeof acceptance.operationId, "string");
  assert(acceptance.operationId.length > 0);
  assert.equal(acceptance.fileVersions.length, 2);
  for (const version of acceptance.fileVersions)
    assert.equal(
      version.afterHash,
      createHash("sha256").update(reviewFiles[version.path]).digest("hex"),
    );
  probe.result.acceptance = acceptance;
  probe.pass("批量接纳两个所选文件，冲突项不能勾选或覆盖");
  const requestCount = fixture.requests.length;
  await probe.close();
  page = await probe.open();
  await openGroup();
  await openReview();
  await page.getByRole("checkbox", { name: /^(选择|Select) conflict.txt$/ }).waitFor();
  assert(await page.getByRole("checkbox", { name: /^(选择|Select) conflict.txt$/ }).isDisabled());
  for (const name of ["one.txt", "two.txt"])
    assert.equal(
      await page.getByRole("checkbox", { name: new RegExp(`^(选择|Select) ${name}$`) }).isChecked(),
      false,
    );
  assert.equal(fixture.requests.length, requestCount, "Reopening must not replay the run");
  await page.waitForTimeout(1500);
  const reopenedRun = readReviewRun(probe.dataRoot);
  assert.equal(reopenedRun.id, run.id);
  assert.equal(reopenedRun.state, "succeeded");
  assert.deepEqual(reopenedRun.checkpoint, run.checkpoint);
  assert.deepEqual(readAcceptances(probe.dataRoot, run.id), acceptances);
  assert.equal(
    fixture.requests.length,
    requestCount,
    "Background recovery must not replay the run",
  );
  for (const name of ["one.txt", "two.txt"])
    assert.equal(await readFile(join(project, name), "utf8"), reviewFiles[name]);
  assert.equal(
    await readFile(join(project, "conflict.txt"), "utf8"),
    "user change after isolation\n",
  );
  probe.pass("真正重开后历史和接纳结果保留，冲突仍可见且没有重新执行");
} catch (error) {
  failure = error;
}
try {
  await probe.finish(failure);
} finally {
  await fixture.close();
}
