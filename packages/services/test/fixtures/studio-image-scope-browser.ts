import assert from "node:assert/strict";

/** 延迟真实 File 读取，不替换生产 hook/store 或制造平行的状态 owner。 */
export async function verifyImageCaptureScope(
  page: any,
  paste: (files: any[]) => Promise<void>,
  file: any,
) {
  const holdFailure = () =>
    page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        File.prototype.arrayBuffer = original;
        return new Promise<ArrayBuffer>((_resolve, reject) => {
          (window as any).imageReadReject = () =>
            reject(new Error("Synthetic delayed image read failure"));
        });
      };
    });
  const rejectRead = async () => {
    await page.evaluate(() => (window as any).imageReadReject());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  };
  for (const change of ["model", "connection"]) {
    await page.waitForFunction(() => document.body.textContent?.includes("Vision"));
    await holdFailure();
    await paste([file]);
    await page.getByRole("button", { name: "Cancel image reading", exact: true }).waitFor();
    if (change === "model") {
      await page.evaluate(() => (window as any).imageFixture.selectModel("text-only"));
      await page.waitForFunction(
        () => (window as any).imageFixture.draft()?.selection?.model === "text-only",
      );
    } else {
      await page.getByRole("button", { name: "Switch connection", exact: true }).click();
    }
    await rejectRead();
    assert.equal(
      await page
        .getByRole("alert")
        .filter({ hasText: "Synthetic delayed image read failure" })
        .count(),
      0,
      `old ${change} scope failure must be ignored`,
    );
    assert.equal(
      await page.getByRole("button", { name: "Cancel image reading", exact: true }).count(),
      0,
    );
    assert.equal(
      (await page.evaluate(() => (window as any).imageFixture.draft())).images?.length ?? 0,
      0,
    );
    if (change === "model")
      await page.evaluate(() => (window as any).imageFixture.selectModel("vision"));
    else await page.getByRole("button", { name: "Switch connection", exact: true }).click();
  }
  await page.waitForFunction(() => document.body.textContent?.includes("Vision"));
  await holdFailure();
  await paste([file]);
  await page.getByRole("button", { name: "Cancel image reading", exact: true }).waitFor();
  await page.evaluate(() => {
    (window as any).oldImageReadReject = (window as any).imageReadReject;
  });
  await page.getByRole("button", { name: "Switch connection", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("Vision"));
  await holdFailure();
  await paste([file]);
  await page.getByRole("button", { name: "Cancel image reading", exact: true }).waitFor();
  await page.evaluate(() => (window as any).oldImageReadReject());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  assert.equal(
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic delayed image read failure" })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Cancel image reading", exact: true }).count(),
    1,
  );
  await rejectRead();
  await page
    .getByRole("alert")
    .filter({ hasText: "Synthetic delayed image read failure" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Cancel image reading", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Switch connection", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("Vision"));
}

export async function verifyImageCaptureCancellation(
  page: any,
  paste: (files: any[]) => Promise<void>,
  file: any,
) {
  const pauseRead = () =>
    page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        File.prototype.arrayBuffer = original;
        return new Promise<ArrayBuffer>((resolve) => {
          (window as any).imageReadRelease = () => original.call(this).then(resolve);
        });
      };
    });
  const releaseRead = () => page.evaluate(() => (window as any).imageReadRelease());
  await pauseRead();
  await paste([file]);
  await page.getByRole("button", { name: "Cancel image reading", exact: true }).click();
  await releaseRead();
  assert.equal(
    (await page.evaluate(() => (window as any).imageFixture.draft())).images?.length ?? 0,
    0,
  );
  await pauseRead();
  await paste([file]);
  await page.getByRole("button", { name: "Cancel image reading", exact: true }).waitFor();
  await page.getByRole("button", { name: "Switch session", exact: true }).click();
  await releaseRead();
  assert.equal(
    (await page.evaluate(() => (window as any).imageFixture.draft())).images?.length ?? 0,
    0,
  );
  await page.getByRole("button", { name: "Switch session", exact: true }).click();
}

export async function verifyStaticPngCapture(
  page: any,
  paste: (files: any[]) => Promise<void>,
  animated: any,
  damaged: any,
) {
  for (const [file, error] of [
    [animated, "APNG"],
    [damaged, "PNG 数据块"],
  ]) {
    await paste([file]);
    await page.getByRole("alert").filter({ hasText: error }).waitFor();
    assert.equal(
      (await page.evaluate(() => (window as any).imageFixture.draft())).images?.length ?? 0,
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "Cancel image reading", exact: true }).count(),
      0,
    );
  }
}
