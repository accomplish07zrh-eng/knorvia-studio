import type { ControlledView } from './browserCommandTypes.js';

interface CaptureResult {
    data?: string;
}

interface PixelSize {
    width: number;
    height: number;
}

function pngSize(data: string): PixelSize | null {
    try {
        const header = Buffer.from(data.slice(0, 64), 'base64');
        if (header.length < 24 ||
            header[0] !== 137 || header[1] !== 80 || header[2] !== 78 ||
            header[3] !== 71 || header[4] !== 13 || header[5] !== 10 ||
            header[6] !== 26 || header[7] !== 10 ||
            header.toString('ascii', 12, 16) !== 'IHDR') {
            return null;
        }
        const width = header.readUInt32BE(16);
        const height = header.readUInt32BE(20);
        return width > 0 && height > 0 ? { width, height } : null;
    } catch {
        return null;
    }
}

function isUniform(actual: PixelSize, target: PixelSize): boolean {
    return Math.abs(actual.width / target.width - actual.height / target.height) <= 0.001;
}

function matchesTarget(actual: PixelSize, target: PixelSize): boolean {
    return Math.abs(actual.width - target.width) < 1 &&
        Math.abs(actual.height - target.height) < 1;
}

async function resizeCapture(
    view: ControlledView,
    result: CaptureResult,
    target: PixelSize,
): Promise<CaptureResult | null> {
    if (!view.resizeScreenshotToCssPixels || !result.data) return null;
    try {
        const resizedData = await view.resizeScreenshotToCssPixels(result.data, target);
        if (!resizedData) return null;
        const resizedSize = pngSize(resizedData);
        if (!resizedSize || !matchesTarget(resizedSize, target)) return null;
        return { ...result, data: resizedData };
    } catch {
        return null;
    }
}

export async function captureScreenshotWithCssPixelCorrection(
    view: ControlledView,
    params: Record<string, unknown>,
): Promise<{ data?: string }> {
    const first = await view.cdp.send('Page.captureScreenshot', params) as CaptureResult;
    if (!view.normalizeScreenshotToCssPixels || !first.data) return first;

    const clip = params.clip;
    if (!clip || typeof clip !== 'object' || Array.isArray(clip)) return first;
    const { width, height, scale } = clip as Record<string, unknown>;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0 ||
        typeof height !== 'number' || !Number.isFinite(height) || height <= 0 ||
        typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
        return first;
    }
    const target: PixelSize = {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
    const firstSize = pngSize(first.data);
    if (!firstSize || !isUniform(firstSize, target)) return first;

    if (firstSize.width > target.width && firstSize.height > target.height) {
        return await resizeCapture(view, first, target) ?? first;
    }

    const firstMatches = matchesTarget(firstSize, target);
    let qualityScale = 1;
    if (view.resizeScreenshotToCssPixels) {
        const candidate = Math.min(
            2,
            4096 / target.width,
            4096 / target.height,
            Math.sqrt(16777216 / (target.width * target.height)),
        );
        if (Number.isFinite(candidate) && candidate >= 1.25) qualityScale = candidate;
    }
    if (firstMatches && qualityScale === 1) return first;

    const widthCorrection = target.width / firstSize.width;
    const heightCorrection = target.height / firstSize.height;
    const correctedScale = scale * (
        firstMatches ? qualityScale : ((widthCorrection + heightCorrection) / 2) * qualityScale
    );
    if (!Number.isFinite(correctedScale) || correctedScale < scale ||
        Math.abs(correctedScale - scale) < 0.001) return first;

    let corrected: CaptureResult;
    try {
        corrected = await view.cdp.send('Page.captureScreenshot', {
            ...params,
            clip: { ...(params.clip as Record<string, unknown>), scale: correctedScale },
        }) as CaptureResult;
    } catch {
        return first;
    }
    const correctedData = corrected.data;
    if (!correctedData) return first;
    const correctedSize = pngSize(correctedData);
    if (!correctedSize || !isUniform(correctedSize, target)) return first;
    if (matchesTarget(correctedSize, target)) return corrected;

    if (correctedSize.width > target.width && correctedSize.height > target.height) {
        const resized = await resizeCapture(view, corrected, target);
        if (resized) return resized;
    }

    const firstArea = firstSize.width * firstSize.height;
    const correctedArea = correctedSize.width * correctedSize.height;
    if (correctedArea > firstArea) return corrected;
    if (correctedArea < firstArea) return first;
    const relativeDifference =
        Math.abs(correctedSize.width - firstSize.width) / firstSize.width +
        Math.abs(correctedSize.height - firstSize.height) / firstSize.height;
    return relativeDifference <= 0.001 ? corrected : first;
}
