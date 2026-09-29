import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

/** 显式指定解释器；用于绕过 PATH 上的 Store 占位程序。 */
export const PYTHON_ENV = "KNORVIA_TEST_PYTHON";
const SCRIPT = "scripts/office-plugin-assets.test.py";
const PROBE_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 30_000;
const DIAGNOSTIC_TEXT_LIMIT = 512;
const DIAGNOSTIC_ARGS_LIMIT = 8;
const REQUIRED_HINT =
  `本套件需要可响应的 Python 3，版本输出应为 \`Python 3.x\`；` +
  `可用 ${PYTHON_ENV} 指定解释器的绝对路径（例如 ${PYTHON_ENV}=C:\\Python313\\python.exe）。`;

function diagnosticValue(value) {
  if (typeof value === "string") {
    const text =
      value.length > DIAGNOSTIC_TEXT_LIMIT
        ? `${value.slice(0, DIAGNOSTIC_TEXT_LIMIT)}…[${value.length - DIAGNOSTIC_TEXT_LIMIT} chars omitted]`
        : value;
    return JSON.stringify(text);
  }
  if (value == null || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return '"[unsupported non-scalar]"';
}

function diagnosticArgs(value) {
  if (!Array.isArray(value)) return diagnosticValue(value);
  const values = value.slice(0, DIAGNOSTIC_ARGS_LIMIT).map(diagnosticValue);
  if (value.length > DIAGNOSTIC_ARGS_LIMIT)
    values.push(`"[${value.length - DIAGNOSTIC_ARGS_LIMIT} args omitted]"`);
  return `[${values.join(",")}]`;
}

function probeDiagnostic(command, probe) {
  // 超时也保留原生结果中的有限证据；不展开环境、错误扩展字段或任意对象。
  const fields = {
    command,
    args: ["--version"],
    elapsedMs: probe.elapsedMs,
    "error.code": probe.error?.code,
    "error.errno": probe.error?.errno,
    "error.syscall": probe.error?.syscall,
    "error.spawnargs": probe.error?.spawnargs,
    "error.message": probe.error?.message,
    status: probe.status,
    signal: probe.signal,
    pid: probe.pid,
    stdout: probe.stdout,
    stderr: probe.stderr,
  };
  const details = Object.entries(fields).map(
    ([key, value]) =>
      `${key}=${key === "args" || key === "error.spawnargs" ? diagnosticArgs(value) : diagnosticValue(value)}`,
  );
  return `phase=interpreter-version timeoutMs=${PROBE_TIMEOUT_MS} ${details.join(" ")}`;
}

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
    if (code === "ETIMEDOUT") {
      return {
        ok: false,
        reason: `解释器版本探测超时（ETIMEDOUT，预算 ${PROBE_TIMEOUT_MS}ms）；具体启动原因未确认`,
      };
    }
    return {
      ok: false,
      reason:
        code === "ENOENT"
          ? "命令或指定启动路径未找到（ENOENT）"
          : `调用失败（${diagnosticValue(code)}）：${diagnosticValue(probe.error.message)}`,
    };
  }
  if (probe.signal) return { ok: false, reason: `被信号 ${probe.signal} 终止` };
  const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.trim();
  const version = /Python (\d+)\.(\d+)\.(\d+)/u.exec(output);
  if (probe.status !== 0) {
    // 9009 是已观察到的占位特征，不是确定归因；静默的其他退出码不能据此分类。
    const placeholder = probe.status === 9009;
    return {
      ok: false,
      reason: placeholder
        ? `退出码 9009：可能是 Microsoft Store 占位程序（通常位于 %LOCALAPPDATA%\\Microsoft\\WindowsApps）；输出：${output.slice(0, 200) || "(空)"}`
        : `退出码 ${probe.status}：${output.slice(0, 200) || "(空；原因未确认)"}`,
    };
  }
  if (!version) return { ok: false, reason: `无法识别版本输出：${output.slice(0, 200) || "(空)"}` };
  if (version[1] !== "3")
    return { ok: false, reason: `检测到 Python ${version[1]}.${version[2]}，本套件需要 Python 3` };
  return { ok: true, version: `Python ${version[1]}.${version[2]}.${version[3]}` };
}

/** 真实探测：只执行 `--version`，不运行任何被测代码。 */
function probeInterpreter(command) {
  const startedAt = performance.now();
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  return { ...result, elapsedMs: performance.now() - startedAt };
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
  const diagnostics = [];
  for (const command of candidates) {
    const result = probe(command);
    const verdict = classifyProbe(result);
    if (verdict.ok)
      return { command, version: verdict.version, attempts, configured: Boolean(configured) };
    attempts.push({ command, reason: verdict.reason });
    diagnostics.push(probeDiagnostic(command, result));
  }
  throw new Error(interpreterDiagnostic(candidates, attempts, Boolean(configured), diagnostics));
}

function interpreterDiagnostic(candidates, attempts, configured, diagnostics) {
  const lines = [
    `Python 3 解释器的版本探测未通过，office 插件资源离线测试无法运行。`,
    `已尝试：${candidates.map((command) => command.slice(0, DIAGNOSTIC_TEXT_LIMIT)).join("、")}`,
    ...attempts.map(
      (attempt, index) =>
        `  - ${attempt.command.slice(0, DIAGNOSTIC_TEXT_LIMIT)}：${attempt.reason}\n    ${diagnostics[index]}`,
    ),
  ];
  if (configured) lines.push(`${PYTHON_ENV} 已设置但不可用；不会回退到其他解释器。`);
  lines.push(REQUIRED_HINT);
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

test("Python probe diagnostics distinguish configured timeout without fallback", () => {
  const command = "C:\\hostedtoolcache\\Python\\python.exe";
  const calls = [];
  const failure = captureError(() =>
    resolvePythonInterpreter({
      platform: "win32",
      env: { [PYTHON_ENV]: command, PRIVATE_CANARY: "DO_NOT_PRINT_ENV" },
      probe: (candidate) => {
        calls.push(candidate);
        return {
          error: Object.assign(new Error("version probe did not finish"), {
            code: "ETIMEDOUT",
            errno: -4039,
            syscall: `spawnSync ${command}`,
            spawnargs: ["--version"],
          }),
          elapsedMs: 10003.25,
          status: null,
          signal: "SIGTERM",
          pid: 4321,
          stdout: "partial\n",
          stderr: "",
        };
      },
    }),
  );
  assert.deepEqual(calls, [command]);
  assert.match(failure.message, /解释器版本探测超时/u);
  assert.match(failure.message, /不会回退/u);
  for (const field of [
    "phase=interpreter-version",
    "timeoutMs=10000",
    "elapsedMs=10003.25",
    `command=${JSON.stringify(command)}`,
    'args=["--version"]',
    'error.code="ETIMEDOUT"',
    "error.errno=-4039",
    `error.syscall=${JSON.stringify(`spawnSync ${command}`)}`,
    'error.spawnargs=["--version"]',
    'error.message="version probe did not finish"',
    "status=null",
    'signal="SIGTERM"',
    "pid=4321",
    'stdout="partial\\n"',
    'stderr=""',
  ])
    assert.ok(failure.message.includes(field), `missing diagnostic: ${field}`);
  assert.doesNotMatch(failure.message, /DO_NOT_PRINT_ENV|命令不存在|Microsoft Store|请安装/u);
});

test("Python probe diagnostics separate ENOENT, Store suspicion and silent failures", () => {
  const missing = classifyProbe({
    error: Object.assign(new Error("not found"), { code: "ENOENT" }),
  });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /ENOENT/u);
  assert.doesNotMatch(missing.reason, /超时|Store/u);
  const timeout = classifyProbe({ error: Object.assign(new Error("late"), { code: "ETIMEDOUT" }) });
  assert.equal(timeout.ok, false);
  assert.match(timeout.reason, /解释器版本探测超时/u);
  assert.doesNotMatch(timeout.reason, /不存在|Store/u);
  const silent = classifyProbe({ status: 1, stdout: "", stderr: "" });
  assert.equal(silent.ok, false);
  assert.match(silent.reason, /退出码 1/u);
  assert.doesNotMatch(silent.reason, /Store|WindowsApps/u);
  for (const stdout of ["", "native message"]) {
    const store = classifyProbe({ status: 9009, stdout, stderr: "" });
    assert.equal(store.ok, false);
    assert.match(store.reason, /9009.*可能.*Store/u);
    if (stdout) {
      assert.ok(store.reason.includes(stdout));
      assert.doesNotMatch(store.reason, /无任何输出/u);
    }
  }
});

test("Python probe diagnostics bound known fields without dumping objects or environment", () => {
  const failure = captureError(() =>
    resolvePythonInterpreter({
      env: { [PYTHON_ENV]: "python", PRIVATE_CANARY: "DO_NOT_PRINT_ENV" },
      probe: () => ({
        error: Object.assign(new Error("m".repeat(600) + "HIDDEN_MESSAGE_TAIL"), {
          code: "EIO",
          errno: -5,
          syscall: { secret: "DO_NOT_DUMP_OBJECT" },
          spawnargs: [...Array.from({ length: 8 }, (_, i) => `arg${i}`), "HIDDEN_ARG"],
          privateMetadata: "DO_NOT_PRINT_ERROR_METADATA",
        }),
        status: 1,
        signal: null,
        pid: 0,
        stdout: "o".repeat(600) + "HIDDEN_STDOUT_TAIL",
        stderr: "",
        environment: { secret: "DO_NOT_PRINT_RESULT_METADATA" },
      }),
    }),
  );
  assert.match(failure.message, /phase=interpreter-version/u);
  assert.match(failure.message, /omitted/u);
  assert.match(failure.message, /unsupported/u);
  assert.doesNotMatch(failure.message, /HIDDEN_|DO_NOT_/u);
  assert.ok(failure.message.length < 6000, "diagnostic must stay bounded");
});

test("Python probe diagnostics retain missing, null, zero and successful resolver shape", () => {
  const failure = captureError(() =>
    resolvePythonInterpreter({
      env: { [PYTHON_ENV]: "python" },
      probe: () => ({
        error: Object.assign(new Error("absent"), { code: "ENOENT" }),
        status: null,
        signal: undefined,
        pid: 0,
        stdout: "",
        stderr: null,
      }),
    }),
  );
  for (const field of [
    "elapsedMs=undefined",
    "error.errno=undefined",
    "error.spawnargs=undefined",
    "status=null",
    "signal=undefined",
    "pid=0",
    'stdout=""',
    "stderr=null",
  ])
    assert.ok(failure.message.includes(field), `missing diagnostic: ${field}`);
  const first = { status: 1, stdout: "", stderr: "" };
  assert.deepEqual(
    resolvePythonInterpreter({
      platform: "win32",
      env: {},
      probe: (command) =>
        command === "python" ? first : { status: 0, stdout: "Python 3.13.15", stderr: "" },
    }),
    {
      command: "python3",
      version: "Python 3.13.15",
      attempts: [{ command: "python", reason: classifyProbe(first).reason }],
      configured: false,
    },
  );
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
        : "该解释器没有产生任何输出；退出码 9009 可能是 Microsoft Store 占位特征，原因仍需核对。"),
  );
});
