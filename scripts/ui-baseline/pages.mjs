// SPDX-License-Identifier: Apache-2.0
// M0-11：页面清单是抓取范围的唯一来源，结构、步骤与夹具都在这里校验。
export const REQUIRED_TESTIDS_MAX = 200;
const STEP_KINDS = new Set(["click", "fill", "press", "waitFor", "select"]);

function assertSteps(steps, where) {
  if (!Array.isArray(steps)) throw new Error(`Invalid steps for ${where}`);
  for (const step of steps) {
    if (typeof step !== "object" || step === null) throw new Error(`Invalid step for ${where}`);
    const kinds = Object.keys(step).filter((key) => STEP_KINDS.has(key));
    if (kinds.length !== 1) throw new Error(`Step for ${where} must use exactly one action`);
    const kind = kinds[0];
    const value = step[kind];
    if (kind === "fill" || kind === "select") {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof value.testid !== "string" ||
        typeof value.value !== "string"
      )
        throw new Error(`Step ${kind} for ${where} needs { testid, value }`);
    } else if (typeof value !== "string" || !value) {
      throw new Error(`Step ${kind} for ${where} needs a non-empty string`);
    }
  }
}

function assertStorage(storage, where) {
  if (typeof storage !== "object" || storage === null)
    throw new Error(`Invalid storage for ${where}`);
  for (const [key, value] of Object.entries(storage)) {
    if (!key || typeof value !== "string")
      throw new Error(`Storage values for ${where} must be strings`);
  }
}

export function assertPages(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.pages)
  )
    throw new Error("pages.json must be an object with schemaVersion 1 and a pages array");
  const fixtures = value.fixtures ?? {};
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (typeof fixture !== "object" || fixture === null)
      throw new Error(`Invalid fixture: ${name}`);
    assertSteps(fixture.steps ?? [], `fixture ${name}`);
    assertStorage(fixture.storage ?? {}, `fixture ${name}`);
  }
  const seen = new Set();
  const pages = value.pages.map((page) => {
    if (typeof page !== "object" || page === null) throw new Error("Invalid page entry");
    if (typeof page.id !== "string" || !/^[a-z0-9-]+$/.test(page.id))
      throw new Error(`Page id must be kebab-case: ${JSON.stringify(page.id)}`);
    if (seen.has(page.id)) throw new Error(`Duplicate page id: ${page.id}`);
    seen.add(page.id);
    if (typeof page.route !== "string" || !page.route.startsWith("/"))
      throw new Error(`Page ${page.id} needs a route starting with /`);
    if (typeof page.readyTestId !== "string" || !page.readyTestId)
      throw new Error(`Page ${page.id} needs a readyTestId`);
    const testids = page.testids ?? [];
    if (!Array.isArray(testids) || testids.some((id) => typeof id !== "string" || !id))
      throw new Error(`Page ${page.id} has an invalid testids list`);
    if (!testids.includes(page.readyTestId))
      throw new Error(`Page ${page.id} must list its readyTestId in testids`);
    if (testids.length > REQUIRED_TESTIDS_MAX)
      throw new Error(`Page ${page.id} declares too many test ids (${testids.length})`);
    assertSteps(page.steps ?? [], `page ${page.id}`);
    assertStorage(page.storage ?? {}, `page ${page.id}`);
    for (const name of page.fixtures ?? []) {
      if (!(name in fixtures))
        throw new Error(`Page ${page.id} references unknown fixture: ${name}`);
    }
    return {
      id: page.id,
      title: page.title ?? page.id,
      route: page.route,
      readyTestId: page.readyTestId,
      testids: [...testids],
      steps: [
        ...(page.fixtures ?? []).flatMap((name) => fixtures[name].steps ?? []),
        ...(page.steps ?? []),
      ],
      storage: {
        ...(page.fixtures ?? []).reduce(
          (merged, name) => ({ ...merged, ...(fixtures[name].storage ?? {}) }),
          {},
        ),
        ...(page.storage ?? {}),
      },
    };
  });
  if (!pages.length) throw new Error("pages.json must declare at least one page");
  return { schemaVersion: 1, fixtures, pages };
}

export function captureRelativePath(entry) {
  return `pages/${entry.id}/${entry.theme}-${entry.width}.png`;
}

export function geometryRelativePath(entry) {
  return `pages/${entry.id}/${entry.theme}-${entry.width}.geometry.json`;
}
