// SPDX-License-Identifier: Apache-2.0
// 压缩阶梯：把「质量档 → 收缩档 → 回退边缘」写成数据表，由驱动器按阶段尝试。
import { Jimp, JimpMime, ResizeStrategy, type JPEGOptions } from "jimp";
import type { ImageCompressionStrategy } from "@knorvia/contracts";
import { fitsImageBudget, type ImageBudget } from "./image-budget.js";
import { jimpOutputMediaType, throwIfAborted } from "./jimp-media.js";

type DecodedImage = InstanceType<typeof Jimp>;
type OutputMediaType = ReturnType<typeof jimpOutputMediaType>;
type PngSettings = { deflateLevel: number; deflateStrategy: number };

export interface EncodedCandidate {
  data: Buffer;
  height: number;
  mediaType: OutputMediaType;
  strategy: ImageCompressionStrategy;
  width: number;
}

interface EncodeStep {
  mediaType: OutputMediaType;
  quality?: number;
  strategy: ImageCompressionStrategy;
}

interface LadderState {
  budget: ImageBudget;
  fitsInitially: boolean;
  height: number;
  image: DecodedImage;
  keepsPng: boolean;
  maxDimension: number;
  signal: AbortSignal | undefined;
  sourceMediaType: string;
  width: number;
}

/** JPEG 质量档：从高到低，第一档满足预算即返回。 */
const JPEG_QUALITY_STEPS: readonly number[] = [80, 60, 40, 20];
/** PNG 优化参数：最大压缩级别 + 过滤策略。 */
const PNG_OPTIMIZATION: PngSettings = { deflateLevel: 9, deflateStrategy: 3 };
/** 收缩因子与回退边缘：阶梯最后两级的候选尺寸来源。 */
const SHRINK_FACTORS: readonly number[] = [0.75, 0.5, 0.25];
const FALLBACK_EDGES: readonly number[] = [1000, 800, 600, 400, 300, 200];
const FALLBACK_QUALITY = 20;
const MINIMUM_EDGE = 1;

function jpegDeclines(): EncodeStep[] {
  return JPEG_QUALITY_STEPS.map((quality) => ({
    mediaType: JimpMime.jpeg,
    quality,
    strategy: "jpeg-quality" as const,
  }));
}

/** 与来源格式一致的候选：PNG 走优化参数，GIF 原格式，JPEG 走质量档，其它来源不试。 */
export function sourceFormatSteps(sourceMediaType: string): EncodeStep[] {
  if (sourceMediaType === JimpMime.png)
    return [{ mediaType: JimpMime.png, strategy: "png-optimized" }];
  if (sourceMediaType === JimpMime.jpeg) return jpegDeclines();
  if (sourceMediaType === JimpMime.gif)
    return [{ mediaType: JimpMime.gif, strategy: "preserve-format" }];
  return [];
}

/** 「先试来源格式、再试 JPEG 质量档」的组合表；PNG 只需要 JPEG 档。 */
function formatThenJpeg(sourceMediaType: string, keepsPng: boolean): EncodeStep[] {
  return keepsPng ? jpegDeclines() : [...sourceFormatSteps(sourceMediaType), ...jpegDeclines()];
}

function settingsFor(step: EncodeStep): PngSettings | JPEGOptions | undefined {
  if (step.mediaType === JimpMime.png && step.strategy === "png-optimized") return PNG_OPTIMIZATION;
  return step.quality === undefined ? undefined : { quality: step.quality };
}

async function encodeWith(
  image: DecodedImage,
  step: EncodeStep,
  signal: AbortSignal | undefined,
): Promise<EncodedCandidate> {
  throwIfAborted(signal);
  const settings = settingsFor(step);
  const data =
    settings === undefined
      ? await image.getBuffer(step.mediaType)
      : await image.getBuffer(step.mediaType, settings);
  throwIfAborted(signal);
  const candidate = {
    data,
    mediaType: step.mediaType,
    strategy: step.strategy,
  } as EncodedCandidate;
  candidate.height = image.bitmap.height;
  candidate.width = image.bitmap.width;
  return candidate;
}

/** 依次尝试一组编码方案，返回第一个满足预算的候选。 */
async function firstFit(
  image: DecodedImage,
  steps: readonly EncodeStep[],
  budget: ImageBudget,
  signal: AbortSignal | undefined,
): Promise<EncodedCandidate | undefined> {
  for (let index = 0; index < steps.length; index += 1) {
    const candidate = await encodeWith(image, steps[index]!, signal);
    if (fitsImageBudget(candidate.data, budget)) return candidate;
  }
  return undefined;
}

function cropToEdge(image: DecodedImage, edge: number): DecodedImage {
  const copy = image.clone();
  if (Math.max(copy.bitmap.width, copy.bitmap.height) > edge) {
    copy.scaleToFit({ h: edge, mode: ResizeStrategy.BICUBIC, w: edge });
  }
  return copy;
}

/** 阶段 ①：原尺寸内的来源格式。 */
async function directPhase(state: LadderState): Promise<EncodedCandidate | undefined> {
  if (!state.fitsInitially) return undefined;
  return await firstFit(
    state.image,
    sourceFormatSteps(state.sourceMediaType),
    state.budget,
    state.signal,
  );
}

/** 阶段 ②③④：缩放型候选 → 缩放后的格式组合表（来源格式只在超出尺寸时参与）。 */
async function boundedPhase(
  state: LadderState,
  cropped: DecodedImage,
  changed: boolean,
): Promise<EncodedCandidate | undefined> {
  if (!state.keepsPng && changed) {
    const resizeOnly: EncodeStep[] = [
      { mediaType: jimpOutputMediaType(state.sourceMediaType, cropped.mime), strategy: "resized" },
    ];
    const resized = await firstFit(cropped, resizeOnly, state.budget, state.signal);
    if (resized) return resized;
  }
  const includeSourceFormat = !state.keepsPng && !state.fitsInitially;
  return await firstFit(
    cropped,
    formatThenJpeg(state.sourceMediaType, !includeSourceFormat),
    state.budget,
    state.signal,
  );
}

/** 阶段 ⑤：按收缩因子逐级缩小，每级仍先试来源格式（非 PNG）再试 JPEG。 */
async function shrinkPhase(
  state: LadderState,
  cropped: DecodedImage,
): Promise<EncodedCandidate | undefined> {
  const mainEdge = Math.max(cropped.bitmap.width, cropped.bitmap.height);
  for (const factor of SHRINK_FACTORS) {
    const shrunk = cropToEdge(cropped, Math.max(MINIMUM_EDGE, Math.round(mainEdge * factor)));
    const candidate = await firstFit(
      shrunk,
      formatThenJpeg(state.sourceMediaType, state.keepsPng),
      state.budget,
      state.signal,
    );
    if (candidate) return candidate;
  }
  return undefined;
}

/** 阶段 ⑥：固定回退边缘 + 低质量 JPEG（对原图取 min(edge, maxDimension)）。 */
async function fallbackPhase(state: LadderState): Promise<EncodedCandidate | undefined> {
  const steps: EncodeStep[] = [
    { mediaType: JimpMime.jpeg, quality: FALLBACK_QUALITY, strategy: "jpeg-fallback" },
  ];
  for (const edge of FALLBACK_EDGES) {
    const shrunk = cropToEdge(state.image, Math.min(edge, state.maxDimension));
    const candidate = await firstFit(shrunk, steps, state.budget, state.signal);
    if (candidate) return candidate;
  }
  return undefined;
}

/**
 * 选择编码：① 原尺寸内的来源格式 →②③④ 缩放型候选与缩放后的格式组合表 →
 * ⑤ 收缩因子逐级 → ⑥ 回退边缘 + 低质量 JPEG。全部不满足返回 undefined。
 */
export async function selectEncoding(input: {
  budget: ImageBudget;
  height: number;
  image: DecodedImage;
  maxDimension: number;
  signal: AbortSignal | undefined;
  sourceMediaType: string;
  width: number;
}): Promise<EncodedCandidate | undefined> {
  const state: LadderState = {
    budget: input.budget,
    fitsInitially: input.width <= input.maxDimension && input.height <= input.maxDimension,
    height: input.height,
    image: input.image,
    keepsPng: input.sourceMediaType === JimpMime.png,
    maxDimension: input.maxDimension,
    signal: input.signal,
    sourceMediaType: input.sourceMediaType,
    width: input.width,
  };
  const direct = await directPhase(state);
  if (direct) return direct;
  const cropped = cropToEdge(state.image, state.maxDimension);
  const changed = cropped.bitmap.width !== state.width || cropped.bitmap.height !== state.height;
  const bounded = await boundedPhase(state, cropped, changed);
  if (bounded) return bounded;
  const shrunk = await shrinkPhase(state, cropped);
  if (shrunk) return shrunk;
  return await fallbackPhase(state);
}
