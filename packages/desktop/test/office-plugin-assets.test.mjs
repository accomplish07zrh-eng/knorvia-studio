import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

/** 显式指定解释器；用于绕过 PATH 上的 Store 占位程序。 */
export const PYTHON_ENV = "KNORVIA_TEST_PYTHON";
const SCRIPT = "scripts/office-plugin-assets.test.py";
const PROBE_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 30_000;
const REQUIRED_HINT =
  `请安装 Python 3 并确认 \`python --version\` 输出 \`Python 3.x\`，` +
  `或设置 ${PYTHON_ENV} 指向解释器的绝对路径（例如 ${PYTHON_ENV}=C:\\Python313\\python.exe）。`;

/**
 * 候选顺序：POSIX 优先 python3；Windows 上 `python3` 常被 Microsoft Store 占位程序占用
 * （本机实测为 9009 且无输出），因此先试 `python`。
 */
export function pythonCandidates(platform = process.platform) {
  return platform === "win32" ? ["python", "python3"] : ["python3", "python"];
}

/**
 * 判定一次 `--version` 探测结果是否是可用的 Python 3 解释器。
 * 纯函数：不读环境、不发起进程，便于单测覆盖 Store 占位与 ENOENT 等分支。
 */
export function classifyProbe(probe) {
  if (probe.error) {
    const code = probe.error.code ?? "UNKNOWN";
    return {
      ok: false,
      reason:
        code === "ENOENT"
          ? "命令不存在（ENOENT），PATH 上没有该可执行文件"
          : `调用失败（${code}）：${probe.error.message}`,
    };
  }
  if (probe.signal) return { ok: false, reason: `被信号 ${probe.signal} 终止` };
  const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.trim();
  const version = /Python (\d+)\.(\d+)\.(\d+)/u.exec(output);
  if (probe.status !== 0) {
    // 关键是给失败一个可读原因：Store 占位程序退出码 9009 且不写任何字节，
    // 旧实现把空串当断言消息，只剩一句无可排查的 equal(0, 9009)。
    const placeholder = probe.status === 9009 || output.length === 0;
    return {
      ok: false,
      reason: placeholder
        ? `退出码 ${probe.status} 且无任何输出：这是 Microsoft Store 占位程序（通常位于 %LOCALAPPDATA%\\Microsoft\\WindowsApps），不是真实解释器`
        : `退出码 ${probe.status}：${output.slice(0, 200)}`,
    };
  }
  if (!version) return { ok: false, reason: `无法识别版本输出：${output.slice(0, 200) || "(空)"}` };
  if (version[1] !== "3")
    return { ok: false, reason: `检测到 Python ${version[1]}.${version[2]}，本套件需要 Python 3` };
  return { ok: true, version: `Python ${version[1]}.${version[2]}.${version[3]}` };
}

/** 真实探测：只执行 `--version`，不运行任何被测代码。 */
function probeInterpreter(command) {
  return spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
}

/**
 * 确定性解析 Python 3 解释器。全部候选都不可用时抛出含候选、失败原因与环境要求的诊断，
 * 而不是留下一个空消息的断言失败。解释器缺失属于环境未满足，必须失败，不得 skip。
 */
export function resolvePythonInterpreter({
  platform = process.platform,
  env = process.env,
  probe = probeInterpreter,
} = {}) {
  const configured = env[PYTHON_ENV]?.trim();
  const candidates = configured ? [configured] : pythonCandidates(platform);
  const attempts = [];
  for (const command of candidates) {
    const verdict = classifyProbe(probe(command));
    if (verdict.ok)
      return { command, version: verdict.version, attempts, configured: Boolean(configured) };
    attempts.push({ command, reason: verdict.reason });
  }
  throw new Error(interpreterDiagnostic(candidates, attempts, Boolean(configured)));
}

function interpreterDiagnostic(candidates, attempts, configured) {
  const lines = [
    `未找到可用的 Python 3 解释器，office 插件资源离线测试无法运行。`,
    `已尝试：${candidates.join("、")}`,
    ...attempts.map((attempt) => `  - ${attempt.command}：${attempt.reason}`),
  ];
  if (configured) lines.push(`${PYTHON_ENV} 已设置但不可用；不会回退到其他解释器。`);
  lines.push(
    // 依据：Windows 未安装 Python 时 PATH 仍提供 WindowsApps 下的同名占位程序，
    // 它退出 9009 且无输出，旧实现因此只抛出无解释的断言失败。
    `Windows 上若 ` +
      `%LOCALAPPDATA%\\Microsoft\\WindowsApps\\python.exe 存在，那是商店占位程序而非解释器。`,
    REQUIRED_HINT,
  );
  return lines.join("\n");
}

/** assert.throws 不返回错误对象（Node 实测为 undefined），此处显式取回以便断言诊断内容。 */
function captureError(run) {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  assert.fail("预期抛出错误，但没有抛出");
}

test("resolves the Python 3 interpreter deterministically and reports actionable diagnostics", () => {
  // 候选顺序本身是契约：POSIX 优先 python3，Windows 优先 python。
  assert.deepEqual(pythonCandidates("linux"), ["python3", "python"]);
  assert.deepEqual(pythonCandidates("darwin"), ["python3", "python"]);
  assert.deepEqual(pythonCandidates("win32"), ["python", "python3"]);

  // POSIX 优先 python3，且命中后不再探测后续候选。
  const posixProbes = [];
  const posix = resolvePythonInterpreter({
    platform: "linux",
    env: {},
    probe: (command) => {
      posixProbes.push(command);
      return { status: 0, stdout: "Python 3.12.4\n", stderr: "" };
    },
  });
  assert.equal(posix.command, "python3");
  assert.equal(posix.version, "Python 3.12.4");
  assert.deepEqual(posixProbes, ["python3"]);

  // Windows 先试 python；只有它不可用时才回退 python3。
  const windowsProbes = [];
  const windows = resolvePythonInterpreter({
    platform: "win32",
    env: {},
    probe: (command) => {
      windowsProbes.push(command);
      return command === "python"
        ? { error: Object.assign(new Error("spawnSync python ENOENT"), { code: "ENOENT" }) }
        : { status: 0, stdout: "Python 3.13.14\r\n", stderr: "" };
    },
  });
  assert.equal(windows.command, "python3");
  assert.deepEqual(windowsProbes, ["python", "python3"]);
  assert.equal(windows.attempts.length, 1);
  assert.match(windows.attempts[0].reason, /ENOENT/u);

  // Store 占位程序：9009 且无输出，必须被拒绝并给出可识别原因。
  const placeholder = classifyProbe({ status: 9009, stdout: "", stderr: "" });
  assert.equal(placeholder.ok, false);
  assert.match(placeholder.reason, /9009/u);
  assert.match(placeholder.reason, /Store/u);

  // Python 2 不是可用解释器。
  assert.equal(classifyProbe({ status: 0, stdout: "Python 2.7.18\n", stderr: "" }).ok, false);

  // 全部候选失败：诊断必须含候选、原因与环境要求，且不得为空串。
  const failure = captureError(() =>
    resolvePythonInterpreter({
      platform: "win32",
      env: {},
      probe: (command) =>
        command === "python"
          ? { error: Object.assign(new Error("spawnSync python ENOENT"), { code: "ENOENT" }) }
          : { status: 9009, stdout: "", stderr: "" },
    }),
  );
  assert.ok(failure.message.trim().length > 0, "诊断消息不能为空");
  assert.match(failure.message, /python、python3/u);
  assert.match(failure.message, /ENOENT/u);
  assert.match(failure.message, /9009/u);
  assert.match(failure.message, /WindowsApps/u);
  assert.match(failure.message, /Python 3/u);
  assert.match(failure.message, new RegExp(PYTHON_ENV, "u"));

  // 显式指定优先，且不可用时不得静默回退到其他解释器。
  const overriddenProbes = [];
  const overridden = resolvePythonInterpreter({
    platform: "win32",
    env: { [PYTHON_ENV]: "C:\\Python313\\python.exe" },
    probe: (command) => {
      overriddenProbes.push(command);
      return { status: 0, stdout: "Python 3.13.1\n", stderr: "" };
    },
  });
  assert.equal(overridden.command, "C:\\Python313\\python.exe");
  assert.deepEqual(overriddenProbes, ["C:\\Python313\\python.exe"]);
  assert.equal(overridden.configured, true);

  const overrideFailure = captureError(() =>
    resolvePythonInterpreter({
      platform: "win32",
      env: { [PYTHON_ENV]: "C:\\missing\\python.exe" },
      probe: () => ({ error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) }),
    }),
  );
  assert.match(overrideFailure.message, /C:\\missing\\python\.exe/u);
  assert.match(overrideFailure.message, /不会回退/u);
});

test("office plugin inspectors preserve inputs and reject malformed packages offline", () => {
  const root = resolve(import.meta.dirname, "../../..");
  // 先解析解释器：缺失或命中 Store 占位程序时给出可执行的环境要求，而不是空消息断言失败。
  let interpreter;
  try {
    interpreter = resolvePythonInterpreter();
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : String(error));
  }
  const result = spawnSync(interpreter.command, ["-B", resolve(root, SCRIPT)], {
    encoding: "utf8",
    cwd: root,
    timeout: RUN_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error)
    assert.fail(
      `解释器 ${interpreter.command}（${interpreter.version}）调用失败：${result.error.message}`,
    );
  const output = [result.stdout, result.stderr]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
  assert.equal(
    result.status,
    0,
    `office 插件资源测试失败：解释器 ${interpreter.command} 退出码 ${result.status}` +
      `（信号 ${result.signal ?? "无"}）。\n` +
      (output
        ? `输出：\n${output}`
        : "该解释器没有产生任何输出；若退出码为 9009，它就是 Microsoft Store 占位程序。"),
  );
});
