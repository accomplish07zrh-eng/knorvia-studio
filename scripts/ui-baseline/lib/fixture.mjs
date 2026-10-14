// SPDX-License-Identifier: Apache-2.0
// 固定夹具：每次截图前把数据目录与工作区重置成同一份种子，保证两次运行看到同样的状态。
// 只写产品自己的存储格式（.knorvia-studio 目录、setting.json 字段），不改格式、不加私有字段。
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 默认夹具目录：固定路径，避免 UI 里的路径文本每次运行都不同。 */
export function defaultFixtureRoot() {
  return join(tmpdir(), "knorvia-ui-baseline");
}

function defaultSettings(workspacePath) {
  return {
    locale: "zh-CN",
    localePreference: "zh-CN",
    // 引导已完成：截图对象是产品界面，不是首次运行引导。
    onboardingOccupation: "developer",
    studioFirstRunGuideStatus: "complete",
    memoryEnabled: false,
    startPlanRecommendationDismissed: true,
    taskAutoArchiveEnabled: false,
    lastWorkspaceSession: [{ kind: "local", workspacePath, workspacePurpose: "project" }],
    lastActiveTabIndex: 0,
  };
}

const FIXTURE_PROFILES = new Map([["default", defaultSettings]]);

function assertKnownFixtureProfile(name) {
  if (!FIXTURE_PROFILES.has(name)) {
    throw new Error(`未知的夹具配置：${name}（可用：${[...FIXTURE_PROFILES.keys()].join(", ")}）`);
  }
}

/**
 * 重置并写入夹具。
 * 返回 `{ root, home, workspace }`：home 是 KNORVIA_HOME，workspace 既做初始工作区也做服务进程 cwd，
 * 这样服务不会把仓库目录注册成额外工作区，截图里也不会出现被测试分支名。
 */
export async function prepareFixture({ root = defaultFixtureRoot(), profile = "default" } = {}) {
  assertKnownFixtureProfile(profile);
  const home = join(root, "home");
  const workspace = join(root, "workspace");
  await removeFixtureState({ home, workspace });
  await mkdir(join(home, "v2"), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const settings = FIXTURE_PROFILES.get(profile)(workspace);
  await writeFile(
    join(home, "v2", "setting.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );
  return { root, home, workspace, profile };
}

/**
 * Windows 上上一轮进程可能还持有 sqlite 句柄，删除失败时重试几次。
 * 仍然失败说明确实有进程占着夹具：直接报错并指路，不静默改用另一份状态（那会让基线失去可比性）。
 */
async function removeFixtureState({ home, workspace }) {
  for (const directory of [home, workspace]) {
    for (let attempt = 0; ; attempt++) {
      try {
        await rm(directory, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt >= 5) {
          throw new Error(
            [
              `无法重置夹具目录：${directory}`,
              `原因：${error instanceof Error ? error.message : String(error)}`,
              "通常还有进程占用同一夹具根（例如上一次采集的服务端没有退出）。",
              "先结束该进程再重试；不要改用另一份夹具，那会让截图与基线失去可比性。",
            ].join("\n"),
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}
