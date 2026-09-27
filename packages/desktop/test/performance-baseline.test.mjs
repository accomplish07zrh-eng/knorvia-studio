import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  desktopBenchmarkEnvironment,
  summarizeLaunchSamples,
} from "../../../scripts/perf-baseline-support.mjs";

test("benchmark isolates profile paths and drops model credentials and injected runtime settings", () => {
  const profile = join(process.cwd(), "isolated fixture");
  const env = desktopBenchmarkEnvironment(profile, {
    SystemRoot: "C:/Windows",
    TEMP: "C:/Temp",
    API_KEY: "fixture-secret",
    KNORVIA_SESSION_DB_PATH: "real-user.sqlite",
    NODE_OPTIONS: "--inspect",
    APPDATA: "real-user",
  });
  assert.equal(env.USERPROFILE, profile);
  assert.equal(env.APPDATA, join(profile, "AppData", "Roaming"));
  assert.equal(env.KNORVIA_STORAGE_DIR, join(profile, "data", ".knorvia-studio"));
  for (const key of ["API_KEY", "KNORVIA_SESSION_DB_PATH", "NODE_OPTIONS"])
    assert.equal(key in env, false);
});

test("cold and warm statistics stay separate, including empty groups and even median", () => {
  const samples = [
    { kind: "cold", firstInteractiveMs: 6000 },
    { kind: "warm", firstInteractiveMs: 2000 },
    { kind: "cold", firstInteractiveMs: 4000 },
  ];
  assert.deepEqual(summarizeLaunchSamples(samples, "cold"), {
    samples: 2,
    min: 4000,
    median: 5000,
    max: 6000,
  });
  assert.deepEqual(summarizeLaunchSamples(samples, "warm"), {
    samples: 1,
    min: 2000,
    median: 2000,
    max: 2000,
  });
  assert.deepEqual(summarizeLaunchSamples([], "cold"), {
    samples: 0,
    min: null,
    median: null,
    max: null,
  });
});
