import { reject, validatePngImage } from "./windows-contract.js";

export function screenshotFrom(response, value, maxDimension = 1600) {
  const images = response.content.filter((item) => item.type === "image");
  if (images.length !== 1 || images[0].mimeType !== "image/png")
    reject("invalid_driver_result", "Cua did not return one PNG screenshot.");
  const image = {
    mimeType: "image/png",
    base64: images[0].data,
    width: value.screenshot_width,
    height: value.screenshot_height,
  };
  validatePngImage(image, maxDimension);
  return image;
}

export function nativeScrollPoint(action, frame, image) {
  const { imageWidth, imageHeight } = frame;
  if (
    !Number.isSafeInteger(imageWidth) ||
    !Number.isSafeInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    imageWidth > 1600 ||
    imageHeight > 1600 ||
    image.width < imageWidth ||
    image.height < imageHeight ||
    Math.abs((image.height * imageWidth) / image.width - imageHeight) > 1
  )
    reject("window_changed", "Native screenshot dimensions no longer match the observation.");
  // 与固定驱动 click/drag 的缓存相同：native_width / screenshot_width；容纳高度取整。
  const ratio = image.width / imageWidth;
  const x = action.x * ratio;
  const y = action.y * ratio;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= image.width ||
    y >= image.height
  )
    reject("point_out_of_bounds", "Scroll coordinates are outside the native screenshot.");
  return { x, y };
}
