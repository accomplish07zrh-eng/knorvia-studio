import { Jimp, JimpMime, ResizeStrategy, type defaultFormats, type JPEGOptions } from "jimp";
import {
  createImageProcessorError,
  type ImageCompressionStrategy,
  type ImagePrepareForModelRequest,
  type ImagePrepareForModelResult,
} from "@knorvia/contracts";
import {
  detectImageMediaType,
  jimpOutputMediaType,
  normalizeMediaType,
  throwIfAborted,
} from "./jimp-media.js";
import { createImageBudget, fitsImageBudget, validatePrepareRequest } from "./image-budget.js";
import { prepareWebpPassthrough } from "./webp-passthrough.js";

type DecodedImage = Awaited<ReturnType<typeof Jimp.read>>;
type OutputMediaType = ReturnType<typeof jimpOutputMediaType>;
type ModelBudget = ReturnType<typeof createImageBudget>;
type PngCodec = Extract<ReturnType<(typeof defaultFormats)[number]>, { mime: typeof JimpMime.png }>;
type PngSettings = NonNullable<Parameters<PngCodec["encode"]>[1]>;
type EncodingRequest =
  | { readonly mediaType: OutputMediaType; readonly settings?: undefined }
  | { readonly mediaType: typeof JimpMime.png; readonly settings: PngSettings }
  | { readonly mediaType: typeof JimpMime.jpeg; readonly settings: JPEGOptions };
type EncodedChoice = {
  data: Buffer;
  mediaType: OutputMediaType;
  height: number;
  width: number;
  strategy: ImageCompressionStrategy;
};

const QUALITY_LEVELS = [80, 60, 40, 20] as const;
const SHRINK_FACTORS = [0.75, 0.5, 0.25] as const;
const FALLBACK_EDGES = [1000, 800, 600, 400, 300, 200] as const;
const MINIMUM_EDGE = 1;
const FALLBACK_QUALITY = 20;
const PNG_DEFLATE_LEVEL = 9;
const PNG_DEFLATE_STRATEGY = 3;

function copyWithinEdge(image: DecodedImage, edge: number): DecodedImage {
  const copy = image.clone();
  if (Math.max(copy.bitmap.width, copy.bitmap.height) > edge) {
    copy.scaleToFit({ h: edge, mode: ResizeStrategy.BICUBIC, w: edge });
  }
  return copy;
}

async function encodeChoice(
  image: DecodedImage,
  encoding: EncodingRequest,
  strategy: ImageCompressionStrategy,
  signal: AbortSignal | undefined,
): Promise<EncodedChoice> {
  throwIfAborted(signal);
  // Jimp 按单一 MIME 推导 codec 参数；保留无参数调用，并在携带参数时先收窄 MIME。
  let data: Buffer;
  if (encoding.settings === undefined) {
    data = await image.getBuffer(encoding.mediaType);
  } else if (encoding.mediaType === JimpMime.png) {
    data = await image.getBuffer(encoding.mediaType, encoding.settings);
  } else {
    data = await image.getBuffer(encoding.mediaType, encoding.settings);
  }
  throwIfAborted(signal);
  return {
    data,
    mediaType: encoding.mediaType,
    height: image.bitmap.height,
    width: image.bitmap.width,
    strategy,
  };
}

async function tryJpegLevels(
  image: DecodedImage,
  budget: ModelBudget,
  signal: AbortSignal | undefined,
): Promise<EncodedChoice | undefined> {
  for (const quality of QUALITY_LEVELS) {
    const choice = await encodeChoice(
      image,
      { mediaType: JimpMime.jpeg, settings: { quality } },
      "jpeg-quality",
      signal,
    );
    if (fitsImageBudget(choice.data, budget)) return choice;
  }
  return undefined;
}

async function trySourceFormat(
  image: DecodedImage,
  sourceMediaType: string,
  budget: ModelBudget,
  signal: AbortSignal | undefined,
): Promise<EncodedChoice | undefined> {
  throwIfAborted(signal);
  if (sourceMediaType === JimpMime.png) {
    const choice = await encodeChoice(
      image,
      {
        mediaType: JimpMime.png,
        settings: {
          deflateLevel: PNG_DEFLATE_LEVEL,
          deflateStrategy: PNG_DEFLATE_STRATEGY,
        },
      },
      "png-optimized",
      signal,
    );
    return fitsImageBudget(choice.data, budget) ? choice : undefined;
  }
  if (sourceMediaType === JimpMime.jpeg) {
    return tryJpegLevels(image, budget, signal);
  }
  if (sourceMediaType === JimpMime.gif) {
    const choice = await encodeChoice(
      image,
      { mediaType: jimpOutputMediaType(JimpMime.gif, image.mime) },
      "preserve-format",
      signal,
    );
    return fitsImageBudget(choice.data, budget) ? choice : undefined;
  }
  return undefined;
}

async function selectEncoding(
  image: DecodedImage,
  sourceMediaType: string,
  maxDimension: number,
  originalWidth: number,
  originalHeight: number,
  budget: ModelBudget,
  signal: AbortSignal | undefined,
): Promise<EncodedChoice | undefined> {
  const withinDimension = originalWidth <= maxDimension && originalHeight <= maxDimension;
  if (withinDimension) {
    const choice = await trySourceFormat(image, sourceMediaType, budget, signal);
    if (choice) return choice;
  }

  const bounded = copyWithinEdge(image, maxDimension);
  const isPng = sourceMediaType === JimpMime.png;
  if (
    !isPng &&
    (bounded.bitmap.width !== originalWidth || bounded.bitmap.height !== originalHeight)
  ) {
    const choice = await encodeChoice(
      bounded,
      { mediaType: jimpOutputMediaType(sourceMediaType, bounded.mime) },
      "resized",
      signal,
    );
    if (fitsImageBudget(choice.data, budget)) return choice;
  }

  if (!withinDimension && !isPng) {
    const choice = await trySourceFormat(bounded, sourceMediaType, budget, signal);
    if (choice) return choice;
  }

  const boundedJpeg = await tryJpegLevels(bounded, budget, signal);
  if (boundedJpeg) return boundedJpeg;

  const longestBoundedEdge = Math.max(bounded.bitmap.width, bounded.bitmap.height);
  for (const factor of SHRINK_FACTORS) {
    const edge = Math.max(MINIMUM_EDGE, Math.round(longestBoundedEdge * factor));
    const scaled = copyWithinEdge(bounded, edge);
    if (!isPng) {
      const choice = await trySourceFormat(scaled, sourceMediaType, budget, signal);
      if (choice) return choice;
    }
    const choice = await tryJpegLevels(scaled, budget, signal);
    if (choice) return choice;
  }

  for (const edge of FALLBACK_EDGES) {
    const scaled = copyWithinEdge(image, Math.min(edge, maxDimension));
    const choice = await encodeChoice(
      scaled,
      { mediaType: JimpMime.jpeg, settings: { quality: FALLBACK_QUALITY } },
      "jpeg-fallback",
      signal,
    );
    if (fitsImageBudget(choice.data, budget)) return choice;
  }
  return undefined;
}

export async function prepareJimpImageForModel(
  request: ImagePrepareForModelRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ImagePrepareForModelResult> {
  throwIfAborted(options.signal);
  validatePrepareRequest(request);
  const input = Buffer.from(request.data);
  if (input.byteLength === 0) {
    throw createImageProcessorError({
      code: "empty",
      message: "Image file is empty (0 bytes)",
    });
  }
  const detectedType = detectImageMediaType(input) ?? normalizeMediaType(request.mediaType);
  if (detectedType === "image/webp") {
    return prepareWebpPassthrough(input, request);
  }

  let image: DecodedImage;
  try {
    image = await Jimp.read(input);
  } catch (cause) {
    throw createImageProcessorError({
      code: "processing_failed",
      message: "Unable to decode image data",
      cause,
    });
  }
  throwIfAborted(options.signal);
  const originalWidth = image.bitmap.width;
  const originalHeight = image.bitmap.height;
  const budget = createImageBudget(request);
  const sourceMediaType = normalizeMediaType(detectedType);
  if (
    originalWidth <= request.maxDimension &&
    originalHeight <= request.maxDimension &&
    fitsImageBudget(input, budget)
  ) {
    return {
      data: input,
      mediaType: sourceMediaType,
      originalHeight,
      originalSizeBytes: input.byteLength,
      originalWidth,
      height: originalHeight,
      width: originalWidth,
      resized: false,
      compressed: false,
      strategy: "original",
      transformedSizeBytes: input.byteLength,
    };
  }

  const choice = await selectEncoding(
    image,
    sourceMediaType,
    request.maxDimension,
    originalWidth,
    originalHeight,
    budget,
    options.signal,
  );
  if (!choice) {
    throw createImageProcessorError({
      code: "too_large",
      message: `Unable to compress image (${input.byteLength} bytes) within the requested model image budget`,
    });
  }
  const encodedMediaType = normalizeMediaType(choice.mediaType);
  return {
    data: choice.data,
    mediaType: encodedMediaType,
    originalHeight,
    originalSizeBytes: input.byteLength,
    originalWidth,
    height: choice.height,
    width: choice.width,
    resized:
      choice.width !== undefined &&
      choice.height !== undefined &&
      (choice.width !== originalWidth || choice.height !== originalHeight),
    compressed: choice.data.byteLength < input.byteLength || encodedMediaType !== sourceMediaType,
    strategy: choice.strategy,
    transformedSizeBytes: choice.data.byteLength,
  };
}
