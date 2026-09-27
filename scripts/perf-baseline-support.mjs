import { dirname, join } from "node:path";

/** 只继承系统启动所需环境，不让本机凭据、模型配置或 NODE_OPTIONS 污染测量。 */
export function desktopBenchmarkEnvironment(profile, source = process.env) {
  const env = Object.fromEntries(
    ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP"]
      .filter((key) => source[key])
      .map((key) => [key, source[key]]),
  );
  return {
    ...env,
    PATH: [
      dirname(process.execPath),
      join(source.SystemRoot ?? "C:/Windows", "System32"),
      join(source.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0"),
    ].join(";"),
    HOME: profile,
    USERPROFILE: profile,
    APPDATA: join(profile, "AppData", "Roaming"),
    LOCALAPPDATA: join(profile, "AppData", "Local"),
    KNORVIA_ENV: "production",
    KNORVIA_PORTABLE_DIR: profile,
    KNORVIA_DATA_BASE_DIR: join(profile, "data"),
    KNORVIA_HOME: join(profile, "data", ".knorvia-studio"),
    KNORVIA_STORAGE_DIR: join(profile, "data", ".knorvia-studio"),
    KNORVIA_BASE_URL: "http://127.0.0.1:9",
    KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
  };
}

export function summarizeLaunchSamples(samples, kind) {
  const values = samples
    .filter((sample) => kind === undefined || sample.kind === kind)
    .map((sample) => sample.firstInteractiveMs)
    .sort((left, right) => left - right);
  if (!values.length) return { samples: 0, min: null, median: null, max: null };
  const middle = Math.floor(values.length / 2);
  return {
    samples: values.length,
    min: values[0],
    median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    max: values.at(-1),
  };
}
