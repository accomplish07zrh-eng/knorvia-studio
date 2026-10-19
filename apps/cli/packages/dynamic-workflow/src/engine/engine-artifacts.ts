// SPDX-License-Identifier: Apache-2.0
import { ARTIFACT_CAPS } from "../facade/artifact-caps.js";
import {
  isArtifactPresetOp,
  type ArtifactContentOp,
  type ArtifactPresetOp,
} from "../facade/registry.js";
import { validateArtifactSpec } from "./artifact-spec.js";
import type { ArtifactIdState, EngineState } from "./engine-state.js";
import { canonicalJson, inputHash } from "./hash.js";
import { hashMismatch } from "./scheduler.js";
import type {
  ArtifactPublishRequest,
  ArtifactRef,
  ArtifactVersionRecord,
  InstanceRef,
  NodeRecordStatus,
  WorkflowErrorCode,
  WorkflowErrorJson,
} from "./types.js";
import { refToString, WorkflowError } from "./types.js";

// ——— 共享小件 ———

function artifactError(code: WorkflowErrorCode, detail: string): WorkflowError {
  return new WorkflowError(code, detail);
}

function primaryHolder(engine: EngineState): string | undefined {
  for (const [key, meta] of engine.artifacts.entries()) {
    if (meta.primary) return key;
  }
  return undefined;
}

function primaryConflictDetail(id: string, holder: string, fix: string, at?: InstanceRef): string {
  const where = at === undefined ? "" : ` (at ${refToString(at)})`;
  return `Cannot mark "${id}" as primary${where}: "${holder}" is already this run's primary artifact. A run has one deliverable; ${fix}, or publish it as a new version of "${holder}".`;
}

// 产物行自带的三根轴：站点身份、输入指纹、产物 id。三条写入路径共用一种行形状，
// 行里的 kind 与 artifactId 因此没有第二种写法。
interface RowOrigin {
  runId: string;
  siteId: string;
  ordinal: number;
}

interface RowTail {
  artifactId: string;
  result?: unknown;
  error?: WorkflowErrorJson;
}

function writeArtifactRow(
  engine: EngineState,
  origin: RowOrigin,
  fingerprint: string,
  status: NodeRecordStatus,
  tail: RowTail,
): void {
  engine.journal.putNode({ ...origin, kind: "artifact", inputHash: fingerprint, status, ...tail });
}

// ——— 内容族：一次发布 = 一个会话对象 ———

// 内容发布的实参护栏。结论只由参数决定，不落行也不发事件：resume 重跑同一个调用必然
// 得到同一个拒绝，没有需要钉住的执行事实。
function inspectContent(
  op: ArtifactContentOp,
  args: unknown[],
  instance: InstanceRef,
): WorkflowError | undefined {
  const [id, payload, options] = args;
  const where = refToString(instance);
  if (typeof id !== "string" || id === "") {
    const detail = `artifact.${op}: id must be a non-empty string (at ${where}).`;
    return artifactError("DriverError", detail);
  }
  if (typeof payload !== "string") {
    const field = op === "file" ? "path" : "content";
    const detail = `artifact.${op}: ${field} must be a string (at ${where}).`;
    return artifactError("DriverError", detail);
  }
  const primary = (options as { primary?: unknown } | undefined)?.primary;
  if (primary !== undefined && typeof primary !== "boolean") {
    const detail = `artifact.${op}: opts.primary must be a boolean (at ${where}).`;
    return artifactError("DriverError", detail);
  }
  return undefined;
}

function asPublishFailure(cause: unknown, op: ArtifactContentOp, id: string): WorkflowError {
  if (cause instanceof WorkflowError) return cause;
  const detail = `Artifact publish failed: ${op} "${id}".`;
  return new WorkflowError("DriverError", detail, { cause });
}

// 一次内容发布从准入到结算的全部事实。字段在构造时定格，后续方法只读——driver 往返
// 期间到达的并发发布不会改写这一份的账。
class ContentPublication {
  readonly #engine: EngineState;
  readonly #instance: InstanceRef;
  readonly #origin: RowOrigin;
  readonly #op: ArtifactContentOp;
  readonly #id: string;
  readonly #payload: string;
  readonly #options: unknown;
  readonly #fingerprint: string;
  readonly #known: ArtifactIdState | undefined;
  readonly #primary: boolean;

  constructor(engine: EngineState, instance: InstanceRef, op: ArtifactContentOp, args: unknown[]) {
    this.#engine = engine;
    this.#instance = instance;
    this.#origin = { runId: engine.runId, siteId: instance.siteId, ordinal: instance.ordinal };
    this.#op = op;
    this.#id = args[0] as string;
    this.#payload = args[1] as string;
    this.#options = args[2];
    this.#fingerprint = inputHash({ args, id: this.#id, op });
    this.#known = engine.artifacts.get(this.#id);
    this.#primary =
      (this.#options as { primary?: unknown } | undefined)?.primary === true ||
      this.#known?.primary === true;
  }

  // 失败结算：failed 行 + artifact-failed 事件，交回同一个错误供调用方抛出。
  #reject(error: WorkflowError): WorkflowError {
    const serialized = error.toJSON();
    const tail = { artifactId: this.#id, error: serialized };
    writeArtifactRow(this.#engine, this.#origin, this.#fingerprint, "failed", tail);
    const subject = { instance: this.#instance, id: this.#id, op: this.#op, error: serialized };
    this.#engine.record({ type: "artifact-failed", ...subject });
    return error;
  }

  // 准入四问，按此序：种类归属 → primary 冲突 → id 数上限 → 版本数上限。
  // primary 排在上限前：想当交付物却被拒，理由应是有交付物了，不是抽屉满了。
  #room(): WorkflowError | undefined {
    const known = this.#known;
    if (known && known.kind !== this.#op) {
      const detail = `Artifact id "${this.#id}" is already a ${known.kind} and cannot be published as a ${this.#op}. An id belongs to one artifact kind for the whole run (publishing the same id again creates a new version, and a version cannot change what it is); use a different id.`;
      return artifactError("ArtifactKindMismatch", detail);
    }
    if (this.#primary) {
      const holder = primaryHolder(this.#engine);
      if (holder && holder !== this.#id) {
        const fix = `publish "${this.#id}" without primary`;
        return artifactError(
          "ArtifactPrimaryConflict",
          primaryConflictDetail(this.#id, holder, fix),
        );
      }
    }
    if (known === undefined && this.#engine.artifacts.size >= ARTIFACT_CAPS.maxArtifactsPerRun) {
      const detail = `Cannot publish "${this.#id}": this run already has ${ARTIFACT_CAPS.maxArtifactsPerRun} artifact ids, the maximum. Publish a new version of an existing id instead.`;
      return artifactError("ArtifactCapExceeded", detail);
    }
    if (known !== undefined && known.versions >= ARTIFACT_CAPS.maxVersionsPerArtifact) {
      const detail = `Artifact "${this.#id}" already has ${known.versions} versions, the maximum of ${ARTIFACT_CAPS.maxVersionsPerArtifact}. Publish the final content in fewer versions.`;
      return artifactError("ArtifactVersionCapExceeded", detail);
    }
    return undefined;
  }

  #request(version: number): ArtifactPublishRequest {
    const place = this.#instance;
    return {
      runId: this.#origin.runId,
      siteId: place.siteId,
      ordinal: place.ordinal,
      op: this.#op,
      id: this.#id,
      version,
      ...(this.#op === "file" ? { path: this.#payload } : { content: this.#payload }),
      ...(this.#options === undefined ? {} : { opts: this.#options }),
    };
  }

  // 成功结算。driver 回来的记录只提供它拥有的元数据；id / 种类 / 版本取引擎签发的那份。
  // driver 往返期间另一个 primary 可能先落库，所以旗子在这里再判一次。
  #finish(version: number, published: ArtifactVersionRecord): ArtifactRef {
    const engine = this.#engine;
    if (engine.isRunSettled()) throw engine.runError();
    const holder = this.#primary ? primaryHolder(engine) : undefined;
    if (holder && holder !== this.#id) {
      const fix = `publish "${this.#id}" without primary`;
      const detail = primaryConflictDetail(this.#id, holder, fix, this.#instance);
      throw this.#reject(artifactError("ArtifactPrimaryConflict", detail));
    }
    const stored = this.#primary ? { ...published, primary: true as const } : published;
    const tail = { artifactId: this.#id, result: stored };
    writeArtifactRow(engine, this.#origin, this.#fingerprint, "completed", tail);
    const meta = { kind: this.#op, versions: version };
    engine.artifacts.set(this.#id, this.#primary ? { ...meta, primary: true } : meta);
    engine.record({ type: "artifact-published", instance: this.#instance, artifact: stored });
    return { id: this.#id, version };
  }

  async publish(): Promise<ArtifactRef> {
    const engine = this.#engine;
    const place = this.#instance;
    const prior = engine.journal.getNode(engine.runId, place.siteId, place.ordinal);
    if (prior !== undefined) {
      if (prior.inputHash !== this.#fingerprint) {
        const mismatch = hashMismatch(place, prior.inputHash, this.#fingerprint);
        engine.failRun(mismatch);
        throw mismatch;
      }
      switch (prior.status) {
        case "completed": {
          const stored = prior.result as ArtifactVersionRecord;
          return { id: stored.id, version: stored.version };
        }
        case "failed":
          throw WorkflowError.fromJSON(prior.error!);
        default:
          // running 行代表上次崩溃在派发途中：字节拷贝幂等，重新 live 执行。
          break;
      }
    }

    const refused = this.#room();
    if (refused !== undefined) throw this.#reject(refused);

    const version = (this.#known?.versions ?? 0) + 1;
    const publish = engine.driver.executeArtifactPublish;
    if (publish === undefined) {
      const where = refToString(place);
      const detail = `Cannot publish "${this.#id}": this host has no artifact store (at ${where}).`;
      throw this.#reject(artifactError("ArtifactStoreUnavailable", detail));
    }

    writeArtifactRow(engine, this.#origin, this.#fingerprint, "running", {
      artifactId: this.#id,
    });
    let published: ArtifactVersionRecord;
    try {
      published = await publish.call(engine.driver, this.#request(version));
    } catch (cause) {
      throw this.#reject(asPublishFailure(cause, this.#op, this.#id));
    }
    return this.#finish(version, published);
  }
}

export function publishContentArtifact(
  state: EngineState,
  siteId: string,
  op: ArtifactContentOp,
  args: unknown[],
): Promise<ArtifactRef> {
  if (state.isRunSettled()) return Promise.reject(state.runError());
  const instance: InstanceRef = { siteId, ordinal: state.nextOrdinal(siteId) };
  const shapeIssue = inspectContent(op, args, instance);
  if (shapeIssue !== undefined) return Promise.reject(shapeIssue);
  return new ContentPublication(state, instance, op, args).publish();
}

// ——— 预置族：先裁决，再落账 ———

interface PresetJob {
  engine: EngineState;
  instance: InstanceRef;
  id: string;
  op: ArtifactPresetOp;
  spec: unknown;
  wantsPrimary: boolean;
}

// declare 落一行 + 记账；skip 是幂等重声明；halt 交给调用方 failRun。
type PresetVerdict =
  | { action: "declare"; canonical: string }
  | { action: "skip" }
  | { action: "halt"; error: WorkflowError };

function judgePreset(job: PresetJob): PresetVerdict {
  const { engine, instance, id, op } = job;
  const where = refToString(instance);

  const invalidSpec = validateArtifactSpec(op, job.spec);
  if (invalidSpec !== undefined) {
    const detail = `Artifact "${id}" has an invalid spec (at ${where}): ${invalidSpec}`;
    return { action: "halt", error: artifactError("ArtifactSpecInvalid", detail) };
  }

  const canonical = canonicalJson(job.spec);
  const prior = engine.artifacts.get(id);
  if (prior !== undefined) {
    if (prior.kind !== op) {
      const detail = `Artifact id "${id}" is already a ${prior.kind} and cannot be declared as a ${op} (at ${where}). An id belongs to one artifact kind for the whole run; use a different id.`;
      return { action: "halt", error: artifactError("ArtifactKindMismatch", detail) };
    }
    if (prior.spec === canonical) return { action: "skip" };
    const detail = `Artifact "${id}" was already declared with a different spec (at ${where}). The spec for one id must stay identical (an identical re-declaration is a no-op); declare it once at the top of the script.`;
    return { action: "halt", error: artifactError("ArtifactRedeclared", detail) };
  }

  if (job.wantsPrimary) {
    const holder = primaryHolder(engine);
    if (holder && holder !== id) {
      const fix = `declare "${id}" without primary`;
      const detail = primaryConflictDetail(id, holder, fix, instance);
      return { action: "halt", error: artifactError("ArtifactPrimaryConflict", detail) };
    }
  }
  if (engine.artifacts.size >= ARTIFACT_CAPS.maxArtifactsPerRun) {
    const detail = `Cannot declare "${id}": this run already has ${ARTIFACT_CAPS.maxArtifactsPerRun} artifact ids, the maximum. Reuse an existing id or publish fewer artifacts.`;
    return { action: "halt", error: artifactError("ArtifactCapExceeded", detail) };
  }
  return { action: "declare", canonical };
}

function presetRecord(id: string, op: ArtifactPresetOp, spec: unknown): ArtifactVersionRecord {
  const { title, description, primary } = (spec ?? {}) as {
    title?: unknown;
    description?: unknown;
    primary?: unknown;
  };
  const meta = { id, kind: op, version: 1, spec };
  return {
    ...meta,
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof description === "string" ? { description } : {}),
    ...(primary === true ? { primary: true as const } : {}),
  };
}

// replay + 指纹比对；有行即短路（预置声明没有需要重建的结果）。
function presetReplay(engine: EngineState, instance: InstanceRef, fingerprint: string): boolean {
  const prior = engine.journal.getNode(engine.runId, instance.siteId, instance.ordinal);
  if (prior === undefined) return false;
  if (prior.inputHash !== fingerprint) {
    engine.failRun(hashMismatch(instance, prior.inputHash, fingerprint));
  }
  return true;
}

export function declarePresetArtifact(
  state: EngineState,
  siteId: string,
  op: ArtifactPresetOp,
  args: unknown[],
): void {
  if (state.isRunSettled()) return;
  const instance: InstanceRef = { siteId, ordinal: state.nextOrdinal(siteId) };
  const [id, spec] = args;
  if (typeof id !== "string" || id === "") {
    const detail = `artifact.${op}: id must be a non-empty string (at ${refToString(instance)}).`;
    state.failRun(artifactError("DriverError", detail));
    return;
  }

  const fingerprint = inputHash({ args, id, op });
  if (presetReplay(state, instance, fingerprint)) return;

  const wantsPrimary = (spec as { primary?: unknown } | undefined)?.primary === true;
  const verdict = judgePreset({ engine: state, instance, id, op, spec, wantsPrimary });
  switch (verdict.action) {
    case "halt":
      state.failRun(verdict.error);
      return;
    case "skip":
      return;
  }

  const record = presetRecord(id, op, spec);
  const meta = { kind: op, spec: verdict.canonical, versions: 1 } as ArtifactIdState;
  state.artifacts.set(id, wantsPrimary ? { ...meta, primary: true } : meta);
  const origin = { runId: state.runId, siteId, ordinal: instance.ordinal };
  writeArtifactRow(state, origin, fingerprint, "completed", { artifactId: id, result: record });
  state.record({ type: "artifact-published", instance, artifact: record });
}

// ——— resume 重建与查询 ———

// 只有 completed 行才认领 id / 种类 / 版本；失败行不占上限账。
export function rememberArtifactRow(
  state: EngineState,
  id: string | undefined,
  result: unknown,
): void {
  if (id === undefined || id === "") return;
  const row = result as ArtifactVersionRecord | undefined;
  if (row?.kind === undefined) return;
  const prior = state.artifacts.get(id);
  const spec = row.spec !== undefined ? canonicalJson(row.spec) : prior?.spec;
  const primary = row.primary === true || prior?.primary === true;
  const meta = { kind: row.kind, versions: (prior?.versions ?? 0) + 1 };
  state.artifacts.set(id, {
    ...meta,
    ...(spec === undefined ? {} : { spec }),
    ...(primary ? { primary: true as const } : {}),
  });
}

export function isDeclaredPreset(state: EngineState, id: string): boolean {
  const meta = state.artifacts.get(id);
  return meta !== undefined && isArtifactPresetOp(meta.kind);
}

export function declaredPresetIds(state: EngineState): string[] {
  const presets: string[] = [];
  for (const [id, meta] of state.artifacts.entries()) {
    if (isArtifactPresetOp(meta.kind)) presets.push(id);
  }
  return presets.sort();
}
